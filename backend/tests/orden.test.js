import test from 'node:test';
import assert from 'node:assert/strict';
import { revisarLote } from '../src/services/rules/index.js';

function venta(correlativo, fecha) {
  return {
    factura: {
      tipo: 'CF',
      correlativo,
      fecha,
      pagina: correlativo,
      emisor: { nombre: 'Demo', nit: '1', nrc: '2' },
      cliente: { nombre: `Cliente ${correlativo}`, nitDui: '', nrc: '' },
      lineas: [{ n: 1, descripcion: 'Zapato Uno color negro talla 40', cantidad: 1, precioUnitario: 100, descuento: 0, base: 100, iva: 13, total: 113 }],
      subtotal: 113,
      iva: null,
      percepcion: null,
      total: 113,
      numeroDocumento: '10',
    },
    lectura: { titulo: 'FACTURA DE CONSUMIDOR FINAL', rotulos: {}, avisos: [], faltantes: [] },
  };
}

const compra = (fecha) => ({
  factura: {
    tipo: 'COMPRA',
    correlativo: 7,
    numeroFactura: '7',
    fecha,
    pagina: 1,
    proveedor: { nombre: 'Proveedor' },
    facturarA: {},
    lineas: [{ n: 1, descripcion: 'Zapato Uno color negro talla 40', cantidad: 5, precioUnitario: 1, total: 5 }],
    subtotal: 5,
    iva: 0.65,
    percepcion: null,
    otros: 0,
    total: 5.65,
  },
});

const tabla = (fecha) => ({
  fecha,
  pagina: 1,
  filas: [{ numero: 1, codigo: 'X-001', modelo: 'Zapato Uno', color: 'Negro', talla: 40, existencia: 10, precioUnitario: 100, totalModelo: 1000 }],
  subtotal: 1000,
  iva: 130,
  total: 1130,
});

test('numeración: si falta la primera semana, el error dice qué documentos faltan', () => {
  const { hallazgos } = revisarLote([venta(91, '2026-08-17'), venta(92, '2026-08-17')]);
  const error = hallazgos.find((h) => h.codigo === 'CORRELATIVO');
  assert.match(error.detalle, /se esperaba el 1\. Faltan los documentos del 1 al 90 \(¿falta subir las semanas anteriores\?\)/);
});

test('numeración: si falta una semana del medio, lo dice', () => {
  const { hallazgos } = revisarLote([venta(1, '2026-08-03'), venta(2, '2026-08-04'), venta(10, '2026-08-17')]);
  const error = hallazgos.find((h) => h.codigo === 'CORRELATIVO');
  assert.match(error.detalle, /Faltan los documentos del 3 al 9 \(¿falta subir esa semana\?\)/);
});

test('facturas de una semana anterior al inventario inicial: advertencia clara', () => {
  const { hallazgos, estado } = revisarLote([venta(1, '2026-08-03')], { inventariosIniciales: [tabla('2026-08-17')], catalogo: [] });
  const error = hallazgos.find((h) => h.codigo === 'ANTERIOR AL INVENTARIO');
  assert.equal(error.gravedad, 'ADVERTENCIA');
  assert.match(error.detalle, /1 facturas de venta con fecha anterior.*17\/08\/2026.*03\/08\/2026/);
  assert.equal(estado, 'listo');
});

test('inventario con fecha dentro de la misma semana de las facturas: sin problema', () => {
  const { hallazgos } = revisarLote([venta(1, '2026-08-03')], { inventariosIniciales: [tabla('2026-08-05')], catalogo: [] });
  assert.equal(hallazgos.filter((h) => h.codigo === 'ANTERIOR AL INVENTARIO').length, 0);
});

test('compras anteriores al inventario inicial: advertencia, no error', () => {
  const { hallazgos } = revisarLote([venta(1, '2026-08-17')], { compras: [compra('2026-08-04')], inventariosIniciales: [tabla('2026-08-17')], catalogo: [] });
  const aviso = hallazgos.find((h) => h.codigo === 'ANTERIOR AL INVENTARIO');
  assert.equal(aviso.gravedad, 'ADVERTENCIA');
});

test('un inventario sin fecha no genera avisos de fechas', () => {
  const { hallazgos } = revisarLote([venta(1, '2026-08-03')], { inventariosIniciales: [{ ...tabla(null), fecha: null }], catalogo: [] });
  assert.equal(hallazgos.filter((h) => h.codigo === 'ANTERIOR AL INVENTARIO').length, 0);
});
