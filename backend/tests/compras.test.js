import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { leerCompras } from '../src/services/parsers/index.js';
import { revisarLote } from '../src/services/rules/index.js';
import { procesarLote } from '../src/services/lote.js';
import { calcularInventario } from '../src/services/inventario/inventario.js';
import { proponerCatalogo, descripcionNormalizada } from '../src/services/inventario/productos.js';

const leer = () => leerCompras(fs.readFileSync(new URL('./fixtures/compras.pdf', import.meta.url)));
const aCatalogo = (propuestas) => propuestas.map(({ clave, nombre, alias }) => ({ clave, nombre, alias }));

test('compras: lee las 8 facturas con proveedor, líneas y totales', async () => {
  const r = await leer();
  assert.equal(r.length, 8);
  assert.ok(r.every((x) => x.ok));
  assert.equal(r.reduce((s, x) => s + x.factura.lineas.length, 0), 20);
  const primera = r[0].factura;
  assert.equal(primera.numeroFactura, '960');
  assert.equal(primera.fecha, '2026-08-04');
  assert.equal(primera.proveedor.nombre, 'AQUA PURA, S.A. DE C.V.');
  assert.equal(primera.facturarA.nrc, '287555-3');
  assert.deepEqual([primera.subtotal, primera.iva, primera.percepcion, primera.total], [1058.36, 137.59, 10.58, 1206.53]);
  assert.equal(primera.condicionPago, 'Total a pagar en 15 días');
});

test('compras: une cada descripción con su fila aunque esté arriba o abajo (última página)', async () => {
  const r = await leer();
  const evian = r[7].factura;
  assert.deepEqual(
    evian.lineas.map((l) => [l.descripcion, l.cantidad, l.precioUnitario, l.total]),
    [
      ['Caja de botellas con agua 500 ml', 88, 3.97, 349.36],
      ['Caja de botellas con agua 1 L', 73, 4.5, 328.5],
    ]
  );
});

test('compras: las 8 facturas del ejemplo cuadran y no generan errores', async () => {
  const compras = await leer();
  const { hallazgos } = revisarLote([], { compras });
  assert.deepEqual(hallazgos.filter((h) => h.gravedad === 'ERROR'), []);
});

test('compras: una factura emitida a otra empresa se marca como error', async () => {
  const compras = await leer();
  const { hallazgos } = revisarLote([], { compras, empresa: { nrc: '111-1' } });
  assert.equal(hallazgos.filter((h) => h.codigo === 'EMPRESA').length, 8);
});

test('compras: detecta total mal calculado y número de factura repetido', async () => {
  const compras = await leer();
  compras[1].factura.total = 300;
  compras.push(structuredClone(compras[0]));
  const { hallazgos } = revisarLote([], { compras });
  assert.equal(hallazgos.filter((h) => h.codigo === 'TOTAL').length, 1);
  assert.equal(hallazgos.filter((h) => h.codigo === 'DUPLICADO').length, 1);
});

test('una compra con errores pausa el lote y no genera inventario', async () => {
  const compras = await leer();
  compras[0].factura.iva = 1;
  const r = procesarLote([], { compras, catalogo: aCatalogo(proponerCatalogo(compras)) });
  assert.equal(r.estado, 'pausado');
  assert.equal(r.inventario, null);
});

function documento(fecha, descripcion, cantidad) {
  return { factura: { tipo: 'X', correlativo: 1, pagina: 1, fecha, lineas: [{ n: 1, descripcion, cantidad, precioUnitario: 1, total: cantidad }] } };
}

test('inventario: compras − ventas, saldo anterior al periodo y alerta de negativo', () => {
  const catalogo = [{ clave: 'zapato', nombre: 'Zapato', alias: ['zapato negro 40'] }];
  const compras = [documento('2026-08-01', 'Zapato negro 40', 10)];
  const ventas = [documento('2026-08-03', 'Zapato negro 40', 3), documento('2026-08-10', 'Zapato negro 40', 8)];
  const semana1 = calcularInventario({ ventas, compras, catalogo, hasta: '2026-08-07' });
  assert.deepEqual([semana1.productos[0].compras, semana1.productos[0].ventas, semana1.productos[0].final], [10, 3, 7]);
  assert.equal(semana1.alertas.length, 0);
  const semana2 = calcularInventario({ ventas, compras, catalogo, desde: '2026-08-08', hasta: '2026-08-14' });
  assert.deepEqual([semana2.productos[0].inicial, semana2.productos[0].ventas, semana2.productos[0].final], [7, 8, -1]);
  assert.deepEqual(semana2.alertas.map((a) => a.final), [-1]);
});

test('inventario: un producto sin identificar queda fuera del inventario', () => {
  assert.equal(calcularInventario({ ventas: [documento('2026-08-03', 'Algo raro', 1)], compras: [], catalogo: [] }).productos.length, 0);
});

test('Villa Lactea: el cálculo reproduce el cierre de la semana 1 y el inicial de la semana 2 de su Excel', async () => {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(new URL('./fixtures/villa-lactea.xlsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const [, inicial, cierre1, inicial2] = libro.worksheets;
  const catalogo = [];
  const compras = [];
  const ventas = [];
  const esperado = [];
  for (let fila = 3; fila <= 21; fila++) {
    const marca = inicial.getRow(fila).getCell(3).value;
    const nombre = `${marca} ${String(inicial.getRow(fila).getCell(4).value).trim()}`;
    catalogo.push({ clave: `p${fila}`, nombre, alias: [descripcionNormalizada(nombre)] });
    compras.push(documento('2026-07-31', nombre, inicial.getRow(fila).getCell(2).value));
    const formula = cierre1.getRow(fila).getCell(2).value.formula;
    for (const resta of formula.split('-').slice(1)) ventas.push(documento('2026-08-03', nombre, Number(resta)));
    const e = inicial2.getRow(fila);
    compras.push(documento('2026-08-08', nombre, e.getCell(5).value));
    esperado.push({ nombre, cierre: e.getCell(2).value, despuesDeCompras: e.getCell(2).value + e.getCell(5).value, compras: e.getCell(5).value });
  }
  const semana1 = calcularInventario({ ventas, compras, catalogo, hasta: '2026-08-07' });
  const semana2 = calcularInventario({ ventas, compras, catalogo, desde: '2026-08-08', hasta: '2026-08-14' });
  for (const e of esperado) {
    assert.equal(semana1.productos.find((p) => p.nombre === e.nombre).final, e.cierre, `cierre semana 1: ${e.nombre}`);
    const p2 = semana2.productos.find((p) => p.nombre === e.nombre);
    assert.deepEqual([p2.inicial, p2.compras, p2.final], [e.cierre, e.compras, e.despuesDeCompras], `semana 2: ${e.nombre}`);
  }
});
