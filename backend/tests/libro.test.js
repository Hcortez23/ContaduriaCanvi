import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { procesarLote } from '../src/services/lote.js';
import { inicioSemana, sumarDias } from '../src/services/inventario/semanas.js';
import { generarLibroSemanal } from '../src/services/export/libroSemanal.js';

const inventarioInicial = {
  pagina: 1,
  filas: [
    { numero: 1, codigo: 'X-001', modelo: 'Zapato Uno', color: 'Negro', talla: 40, existencia: 10, precioUnitario: 100, totalModelo: 1000 },
    { numero: 2, codigo: 'X-002', modelo: 'Bota Dos', color: 'Azul y blanco', talla: 42, existencia: 5, precioUnitario: 50, totalModelo: 250 },
  ],
  subtotal: 1250,
  iva: 162.5,
  total: 1412.5,
};

function venta(correlativo, fecha, descripcion, cantidad, precio) {
  const base = cantidad * precio;
  const total = Math.round(base * 113) / 100;
  return {
    factura: {
      tipo: 'CF',
      correlativo,
      fecha,
      pagina: correlativo,
      emisor: { nombre: 'Demo', nit: '1', nrc: '2' },
      cliente: { nombre: `Cliente ${correlativo}`, nitDui: '123', nrc: '' },
      lineas: [{ n: 1, descripcion, cantidad, precioUnitario: precio, descuento: 0, base, iva: Math.round(base * 13) / 100, total }],
      subtotal: total,
      iva: null,
      percepcion: null,
      total,
      numeroDocumento: '10',
    },
    lectura: { titulo: 'FACTURA DE CONSUMIDOR FINAL', rotulos: {}, avisos: [], faltantes: [] },
  };
}

const compra = (fecha, descripcion, cantidad) => ({
  factura: {
    tipo: 'COMPRA',
    correlativo: 900,
    numeroFactura: '900',
    fecha,
    pagina: 1,
    proveedor: { nombre: 'Proveedor' },
    facturarA: {},
    lineas: [{ n: 1, descripcion, cantidad, precioUnitario: 1, total: cantidad }],
    subtotal: cantidad,
    iva: Math.round(cantidad * 13) / 100,
    percepcion: null,
    otros: 0,
    total: Math.round(cantidad * 113) / 100,
  },
});

const lote = () => {
  const ventas = [venta(1, '2026-08-04', 'Zapato Uno color negro talla 40', 3, 100), venta(2, '2026-08-11', 'Zapato Uno color negro talla 40', 2, 100)];
  const compras = [compra('2026-08-05', 'Zapato Uno color negro talla 40', 4)];
  return procesarLote(ventas, { inventarioInicial, compras });
};

test('semanas: lunes de cada semana y suma de días', () => {
  assert.equal(inicioSemana('2026-08-03'), '2026-08-03');
  assert.equal(inicioSemana('2026-08-09'), '2026-08-03');
  assert.equal(sumarDias('2026-08-03', 6), '2026-08-09');
});

test('semanas: el inicial de cada semana es el final de la anterior más las compras de esa semana', () => {
  const r = lote();
  assert.equal(r.estado, 'listo');
  assert.equal(r.semanas.length, 2);
  const [s1, s2] = r.semanas.map((s) => s.filas.find((f) => f.clave === 'X-001'));
  assert.deepEqual([s1.saldo, s1.compras, s1.vendidas, s1.final], [10, 0, 3, 7]);
  assert.deepEqual([s2.saldo, s2.compras, s2.despuesDeCompras, s2.vendidas, s2.final], [7, 4, 11, 2, 9]);
  const otro = r.semanas[1].filas.find((f) => f.clave === 'X-002');
  assert.equal(otro.final, 5);
});

test('libro: tres hojas por semana en el orden Facturas, Inventario inicial, Inventario final', async () => {
  const r = lote();
  const buffer = await generarLibroSemanal({ empresa: { nombre: 'Demo', nrc: '2', nit: '1' }, semanas: r.semanas, iva: 0.13 });
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  assert.deepEqual(libro.worksheets.map((h) => h.name), [
    'Facturas S1', 'Inventario inicial S1', 'Inventario final S1',
    'Facturas S2', 'Inventario inicial S2', 'Inventario final S2',
  ]);
});

test('libro: las hojas de inventario traen los datos y las fórmulas esperadas', async () => {
  const r = lote();
  const buffer = await generarLibroSemanal({ empresa: { nombre: 'Demo', nrc: '2', nit: '1' }, semanas: r.semanas, iva: 0.13 });
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  const inicial2 = libro.getWorksheet('Inventario inicial S2');
  assert.deepEqual([inicial2.getCell('B5').value, inicial2.getCell('F5').value, inicial2.getCell('G5').value], ['X-001', 7, 4]);
  assert.equal(inicial2.getCell('H5').value.formula, 'F5+G5');
  const final2 = libro.getWorksheet('Inventario final S2');
  assert.equal(final2.getCell('F5').value.formula, "'Inventario inicial S2'!H5");
  assert.equal(final2.getCell('G5').value, 2);
  assert.equal(final2.getCell('H5').value.formula, 'F5-G5');
  assert.equal(final2.getCell('J5').value.formula, 'H5*I5');
  assert.equal(final2.getCell('J8').value.formula, 'SUM(J5:J6)');
});

test('libro: la hoja de facturas trae el registro y el resumen de ventas de la semana', async () => {
  const r = lote();
  const buffer = await generarLibroSemanal({ empresa: { nombre: 'Demo', nrc: '2', nit: '1' }, semanas: r.semanas, iva: 0.13 });
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  const hoja = libro.getWorksheet('Facturas S1');
  assert.match(hoja.getCell('A2').value, /SEMANA 1 \(03\/08\/2026 al 09\/08\/2026\)/);
  assert.equal(hoja.getCell('A4').value, 'CONSUMIDORES FINALES');
  assert.equal(hoja.getCell('D6').value, '000-1');
  assert.equal(hoja.getCell('K6').value, 339);
  assert.equal(hoja.getCell('A7').value, 'Total de Registros');
  const textos = [];
  hoja.eachRow((fila) => fila.eachCell((c) => typeof c.value === 'string' && textos.push(c.value)));
  for (const esperado of ['Total consumidor final (con IVA)', 'Total consumidor final sin IVA', 'TOTAL GENERAL DE VENTAS (sin IVA)']) assert.ok(textos.includes(esperado), esperado);
});

const tabla = (fecha, existencia) => ({
  fecha,
  pagina: 1,
  filas: [{ numero: 1, codigo: 'X-001', modelo: 'Zapato Uno', color: 'Negro', talla: 40, existencia, precioUnitario: 100, totalModelo: existencia * 100 }],
  subtotal: existencia * 100,
  iva: existencia * 13,
  total: existencia * 113,
});

test('inventario inicial acumulable: una tabla de una semana posterior se suma y no reemplaza a la primera', () => {
  const ventas = [venta(1, '2026-08-04', 'Zapato Uno color negro talla 40', 3, 100), venta(2, '2026-08-11', 'Zapato Uno color negro talla 40', 2, 100)];
  const r = procesarLote(ventas, { inventariosIniciales: [tabla('2026-08-10', 5), tabla('2026-08-03', 10)] });
  assert.equal(r.estado, 'listo');
  const [s1, s2] = r.semanas.map((s) => s.filas[0]);
  assert.deepEqual([s1.saldo, s1.compras, s1.vendidas, s1.final], [10, 0, 3, 7]);
  assert.deepEqual([s2.saldo, s2.compras, s2.despuesDeCompras, s2.vendidas, s2.final], [7, 5, 12, 2, 10]);
});

test('inventario inicial acumulable: cada tabla se revisa por separado y el error indica de qué fecha es', () => {
  const ventas = [venta(1, '2026-08-04', 'Zapato Uno color negro talla 40', 1, 100)];
  const mala = { ...tabla('2026-08-10', 5), subtotal: 999 };
  const r = procesarLote(ventas, { inventariosIniciales: [tabla('2026-08-03', 10), mala] });
  assert.equal(r.estado, 'pausado');
  assert.ok(r.hallazgos.some((h) => h.codigo === 'SUBTOTAL' && /Inventario inicial del 10\/08\/2026/.test(h.detalle)));
});

test('vista mensual: documentos por mes contra la meta de 200 y 20 créditos fiscales', () => {
  const ventas = [
    venta(1, '2026-08-04', 'Zapato Uno color negro talla 40', 1, 100),
    venta(2, '2026-08-05', 'Zapato Uno color negro talla 40', 1, 100),
    venta(3, '2026-09-02', 'Zapato Uno color negro talla 40', 1, 100),
  ];
  const r = procesarLote(ventas, { inventariosIniciales: [tabla('2026-08-03', 10)] });
  assert.deepEqual(r.mensual.map((m) => [m.mes, m.documentos.total]), [['2026-08', 2], ['2026-09', 1]]);
  assert.deepEqual(r.mensual[0].meta, { documentos: 200, ccf: 20 });
  assert.equal(r.mensual[0].avance.documentos, 1);
  assert.equal(r.mensual[0].ventas.unidades, 2);
});
