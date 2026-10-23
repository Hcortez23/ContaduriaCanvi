import { leerPaginas } from './pdfText.js';
import { parsearVenta, recetaDe } from './venta.js';
import { intentarAprender } from './recetas/aprender.js';
import { parsearCompra } from './compra.js';
import { leerPaginaConIA, leerLoteConIA, TAMANO_LOTE } from './facturaIA.js';
import { enParalelo, resolverPorLotes } from './paginas.js';
import { HttpError } from '../../utils/errores.js';

const MAXIMO_PAGINAS_IA = 100;

export function clasificarPagina(pagina, recetas = []) {
  if (recetaDe(pagina, recetas)) return 'venta';
  const texto = pagina.items.map((i) => i.s).join(' ');
  if (/FACTURAR A\s*:/i.test(texto) && /DESCRIPCI[OÓ]N/i.test(texto)) return 'compra';
  if (/\bEMISOR/.test(texto) && /\bCLIENTE\b/.test(texto)) return 'venta';
  return null;
}

async function resolverConIA(pendientes, buffer) {
  const conocidas = pendientes.filter((p) => p.clase === 'venta' || p.clase === 'compra');
  const leidas = await resolverPorLotes(
    conocidas.map((p) => ({ pagina: p.pagina, clase: p.clase })),
    buffer,
    leerLoteConIA,
    TAMANO_LOTE
  );
  const desconocidas = pendientes.filter((p) => !p.clase);
  const clasificadas = await enParalelo(
    desconocidas.map((p) => async () => {
      try {
        const { clase, resultado } = await leerPaginaConIA(buffer, p.pagina);
        return { ...p, clase, resultado };
      } catch (error) {
        return { ...p, errorIA: error.message };
      }
    })
  );
  return [
    ...conocidas.map((p) => {
      const { resultado, error } = leidas.get(p.pagina);
      return resultado ? { ...p, resultado } : { ...p, errorIA: error };
    }),
    ...clasificadas,
  ];
}

export async function leerMixto(buffer, { respaldoIA = false, recetas = [], alAprender = null } = {}) {
  const paginas = await leerPaginas(buffer);
  const imagenes = paginas.filter((p) => !p.items.length).map((p) => p.numero);
  const conTexto = paginas.filter((p) => p.items.length);
  const analizar = (conocidas) =>
    conTexto.map((pagina) => {
      const clase = clasificarPagina(pagina, conocidas);
      const resultado = clase === 'venta' ? parsearVenta(pagina, conocidas) : clase === 'compra' ? parsearCompra(pagina) : null;
      return { pagina: pagina.numero, clase, resultado };
    });

  let lista = analizar(recetas);
  const desconocidas = lista.filter((p) => !p.clase);
  if (respaldoIA && alAprender && desconocidas.length >= 3 && desconocidas.length * 2 >= lista.length) {
    const receta = await intentarAprender(buffer, conTexto.filter((p) => desconocidas.some((d) => d.pagina === p.numero)));
    if (receta) {
      await alAprender(receta);
      lista = analizar([...recetas, receta]);
    }
  }

  let resueltas = lista;
  const pendientes = lista.filter((p) => !p.resultado || !p.resultado.ok);
  if (respaldoIA && pendientes.length) {
    if (pendientes.length > MAXIMO_PAGINAS_IA) {
      throw new HttpError(422, `Hay ${pendientes.length} páginas que el lector no entiende; el máximo para leerlas con IA es ${MAXIMO_PAGINAS_IA}`);
    }
    const leidas = new Map((await resolverConIA(pendientes, buffer)).map((p) => [p.pagina, p]));
    resueltas = lista.map((p) => leidas.get(p.pagina) ?? p);
  }

  const ventas = [];
  const compras = [];
  const sinClasificar = [];
  for (const p of resueltas) {
    if (p.clase === 'venta' && p.resultado) ventas.push(p.resultado);
    else if (p.clase === 'compra' && p.resultado) compras.push(p.resultado);
    else {
      sinClasificar.push({
        pagina: p.pagina,
        motivo: p.errorIA ?? (p.clase === 'otro' ? 'no es una factura de venta ni de compra' : 'el lector no reconoce el formato de la página'),
      });
    }
  }
  return { ventas, compras, paginasImagen: imagenes, sinClasificar };
}
