import { leerPaginas } from './pdfText.js';
import { parsearVenta } from './venta.js';
import { parsearCompra } from './compra.js';
import { leerLoteConIA, TAMANO_LOTE } from './facturaIA.js';
import { resolverPorLotes } from './paginas.js';
import { HttpError } from '../../utils/errores.js';
import { clasificarPagina } from './mixto.js';
import { intentarAprender } from './recetas/aprender.js';

const PERFILES = {
  plantilla: parsearVenta,
  generico: parsearVenta,
};

const MAXIMO_PAGINAS_IA = 100;

function paginaDeOtroTipo(pagina, esperada, recetas = []) {
  const real = clasificarPagina(pagina, recetas);
  if (!real || real === esperada) return null;
  const dondeSubirla = real === 'compra' ? '"Facturas de compra"' : '"Facturas de venta"';
  return {
    pagina: pagina.numero,
    ok: false,
    factura: null,
    lectura: {
      avisos: [],
      rotulos: {},
      faltantes: ['tipo de documento'],
      sinIA: true,
      errorIA: `parece una factura de ${real === 'compra' ? 'compra' : 'venta'}; súbela en ${dondeSubirla} o en "Todo en un solo archivo"`,
    },
  };
}

async function conRespaldo(resultados, buffer, clase, respaldoIA) {
  const fallidas = resultados.filter((r) => !r.ok && !r.lectura.sinIA);
  if (!respaldoIA || !fallidas.length) return resultados;
  if (fallidas.length > MAXIMO_PAGINAS_IA) {
    throw new HttpError(422, `Hay ${fallidas.length} páginas que el lector no entiende; el máximo para leerlas con IA es ${MAXIMO_PAGINAS_IA}`);
  }
  const leidas = await resolverPorLotes(
    fallidas.map((r) => ({ pagina: r.pagina, clase })),
    buffer,
    leerLoteConIA,
    TAMANO_LOTE
  );
  return resultados.map((r) => {
    if (r.ok || !leidas.has(r.pagina)) return r;
    const { resultado, error } = leidas.get(r.pagina);
    return resultado ?? { ...r, lectura: { ...r.lectura, errorIA: error } };
  });
}

export async function leerFacturas(buffer, perfil = 'generico', { respaldoIA = false, recetas = [], alAprender = null } = {}) {
  const parsear = PERFILES[perfil] || PERFILES.generico;
  const paginas = (await leerPaginas(buffer)).filter((p) => p.items.length);
  const leer = (conocidas) => paginas.map((p) => paginaDeOtroTipo(p, 'venta', conocidas) ?? parsear(p, conocidas));

  let resultados = leer(recetas);
  const fallidas = resultados.filter((r) => !r.ok && !r.lectura.sinIA);
  if (respaldoIA && alAprender && fallidas.length >= 3 && fallidas.length * 2 >= resultados.length) {
    const receta = await intentarAprender(buffer, paginas.filter((p) => fallidas.some((f) => f.pagina === p.numero)));
    if (receta) {
      await alAprender(receta);
      resultados = leer([...recetas, receta]);
    }
  }
  return conRespaldo(resultados, buffer, 'venta', respaldoIA);
}

export async function leerCompras(buffer, { respaldoIA = false } = {}) {
  const paginas = await leerPaginas(buffer);
  const resultados = paginas.filter((p) => p.items.length).map((p) => paginaDeOtroTipo(p, 'compra') ?? parsearCompra(p));
  return conRespaldo(resultados, buffer, 'compra', respaldoIA);
}
