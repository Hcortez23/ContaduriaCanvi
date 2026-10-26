import { resolverProductos } from '../inventario/productos.js';
import { redondear, dinero, difiere } from '../../utils/numeros.js';
import { hallazgo } from './hallazgo.js';

function revisarIvaDuplicado(resueltas, catalogo, iva) {
  const precios = new Map(catalogo.map((p) => [p.clave, p.precioUnitario]));
  const hallazgos = [];
  for (const { factura, linea, clave } of resueltas) {
    if (factura.tipo !== 'CCF') continue;
    const lista = precios.get(clave);
    if (!lista) continue;
    const conIva = redondear(lista * (1 + iva));
    if (!difiere(linea.precioUnitario, conIva) && difiere(linea.precioUnitario, lista)) {
      hallazgos.push(
        hallazgo(
          factura,
          'ERROR',
          'IVA DUPLICADO',
          `Línea ${linea.n}: "${linea.descripcion}" tiene el precio con IVA (${dinero(linea.precioUnitario)} = ${dinero(lista)} + 13%) y el IVA se suma otra vez al final.`,
          'En crédito fiscal el precio unitario va sin IVA; el IVA se suma una sola vez al final.'
        )
      );
    }
  }
  return hallazgos;
}

export function revisarProductos(resultados, catalogo, iva = 0.13) {
  const { resueltas, sinIdentificar } = resolverProductos(resultados, catalogo);
  const graves = sinIdentificar.map(({ factura, linea, sugerencia }) =>
    hallazgo(
      factura,
      'ADVERTENCIA_GRAVE',
      'PRODUCTO SIN IDENTIFICAR',
      sugerencia.razon
        ? `Línea ${linea.n}: "${linea.descripcion}": ${sugerencia.razon}.`
        : `Línea ${linea.n}: "${linea.descripcion}" no está en el inventario inicial.`,
      'Esta línea queda fuera del inventario y del libro. Corregir la descripción si está mal escrita, o agregar el producto al inventario inicial.'
    )
  );
  const ortografia = resueltas
    .filter((r) => r.aproximada)
    .map(({ factura, linea, clave }) =>
      hallazgo(
        factura,
        'ADVERTENCIA',
        'DESCRIPCION',
        `Línea ${linea.n}: "${linea.descripcion}" parece mal escrita; se asignó a "${catalogo.find((p) => p.clave === clave)?.nombre ?? clave}".`,
        'Confirmar el producto y corregir la descripción.'
      )
    );
  return [...graves, ...ortografia, ...revisarIvaDuplicado(resueltas, catalogo, iva)];
}
