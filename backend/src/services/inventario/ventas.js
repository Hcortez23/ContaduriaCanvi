import { redondear } from '../../utils/numeros.js';
import { resolverProductos } from './productos.js';

function montosLinea(factura, linea, tasaIva) {
  if (factura.precioIncluyeIva) {
    const total = linea.total ?? redondear(linea.cantidad * linea.precioUnitario - (linea.descuento || 0));
    const base = redondear(total / (1 + tasaIva));
    return { base, iva: redondear(total - base), total };
  }
  const base = linea.base ?? redondear(linea.cantidad * linea.precioUnitario - (linea.descuento || 0));
  let iva;
  if (linea.iva !== null && linea.iva !== undefined) iva = linea.iva;
  else if (factura.tipo === 'CF' && linea.total !== null) iva = redondear(linea.total - base);
  else iva = redondear(base * tasaIva);
  return { base, iva, total: redondear(base + iva) };
}

export function reporteVentas(resultados, catalogo, { iva: tasaIva }) {
  const { resueltas } = resolverProductos(resultados, catalogo);
  // las líneas sin identificar quedan fuera; ya se reportan como ADVERTENCIA GRAVE

  const nombres = new Map(catalogo.map((p) => [p.clave, p.nombre]));
  const productos = new Map();
  for (const { factura, linea, clave } of resueltas) {
    const m = montosLinea(factura, linea, tasaIva);
    const p = productos.get(clave) || { clave, nombre: nombres.get(clave), unidades: 0, base: 0, iva: 0, total: 0 };
    p.unidades += linea.cantidad;
    p.base += m.base;
    p.iva += m.iva;
    p.total += m.total;
    productos.set(clave, p);
  }
  const listaProductos = [...productos.values()]
    .map((p) => ({ ...p, base: redondear(p.base), iva: redondear(p.iva), total: redondear(p.total) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const documentos = {
    CF: { cantidad: 0, base: 0, iva: 0, total: 0 },
    CCF: { cantidad: 0, base: 0, iva: 0, percepcion: 0, total: 0 },
  };
  for (const { factura: f } of resultados) {
    const d = documentos[f.tipo];
    d.cantidad += 1;
    d.total += f.total;
    if (f.tipo === 'CCF') {
      d.base += f.subtotal ?? 0;
      d.iva += f.iva ?? 0;
      d.percepcion += f.percepcion ?? 0;
    } else {
      const bases = f.lineas.map((l) => montosLinea(f, l, tasaIva));
      d.base += bases.reduce((s, m) => s + m.base, 0);
      d.iva += bases.reduce((s, m) => s + m.iva, 0);
    }
  }
  for (const d of Object.values(documentos)) for (const k of Object.keys(d)) if (k !== 'cantidad') d[k] = redondear(d[k]);

  const suma = (campo) => redondear(listaProductos.reduce((s, p) => s + p[campo], 0));
  return {
    productos: listaProductos,
    documentos,
    totales: { unidades: suma('unidades'), base: suma('base'), iva: suma('iva'), total: suma('total') },
  };
}
