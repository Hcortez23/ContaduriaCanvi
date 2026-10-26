import { resolverProductos } from './productos.js';

function movimientos(documentos, catalogo, signo) {
  const { resueltas } = resolverProductos(documentos, catalogo);
  // las líneas sin identificar quedan fuera; ya se reportan como ADVERTENCIA GRAVE
  return resueltas.map(({ factura, linea, clave }) => ({
    clave,
    fecha: factura.fecha,
    cantidad: signo * linea.cantidad,
  }));
}

export function calcularInventario({ ventas, compras, catalogo, apertura = [], ingresos = [], desde = null, hasta = null }) {
  const nombres = new Map(catalogo.map((p) => [p.clave, p.nombre]));
  const todos = [...movimientos(compras, catalogo, 1), ...ingresos, ...movimientos(ventas, catalogo, -1)].filter(
    (m) => !hasta || m.fecha <= hasta
  );
  const filas = new Map(
    apertura.map((a) => [a.clave, { clave: a.clave, nombre: nombres.get(a.clave), inicial: a.cantidad, compras: 0, ventas: 0, final: 0 }])
  );
  for (const { clave, fecha, cantidad } of todos) {
    const f = filas.get(clave) || { clave, nombre: nombres.get(clave), inicial: 0, compras: 0, ventas: 0, final: 0 };
    if (desde && fecha < desde) f.inicial += cantidad;
    else if (cantidad > 0) f.compras += cantidad;
    else f.ventas += -cantidad;
    filas.set(clave, f);
  }
  const productos = [...filas.values()]
    .map((f) => ({ ...f, final: f.inicial + f.compras - f.ventas }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return {
    productos,
    alertas: productos.filter((p) => p.final < 0).map(({ clave, nombre, final }) => ({ clave, nombre, final })),
    totales: {
      inicial: productos.reduce((s, p) => s + p.inicial, 0),
      compras: productos.reduce((s, p) => s + p.compras, 0),
      ventas: productos.reduce((s, p) => s + p.ventas, 0),
      final: productos.reduce((s, p) => s + p.final, 0),
    },
  };
}
