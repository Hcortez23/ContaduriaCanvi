import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { leerFacturas } from '../src/services/parsers/index.js';
import { proponerCatalogo } from '../src/services/inventario/productos.js';
import { reporteVentas } from '../src/services/inventario/ventas.js';
import { procesarLote } from '../src/services/lote.js';
import { generarRegistroSemanal } from '../src/services/export/registroSemanal.js';

const leer = (nombre) => leerFacturas(fs.readFileSync(new URL(`./fixtures/${nombre}.pdf`, import.meta.url)));
const aCatalogo = (propuestas) => propuestas.map(({ clave, nombre, alias }) => ({ clave, nombre, alias }));

function cf(correlativo, descripcion, cantidad, precio) {
  const base = cantidad * precio;
  const total = Math.round(base * 113) / 100;
  return {
    factura: {
      tipo: 'CF',
      correlativo,
      fecha: '2026-08-03',
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

const limpio = () => [cf(1, 'Zapato color negro talla 40', 2, 100), cf(2, 'Zapato color negro talla 40', 1, 100), cf(3, 'Bota color azul talla 42', 3, 50)];

test('lote sin errores y con catálogo: queda listo y trae el reporte de ventas', () => {
  const lote = limpio();
  const catalogo = aCatalogo(proponerCatalogo(lote));
  const r = procesarLote(lote, { catalogo });
  assert.equal(r.estado, 'listo');
  assert.equal(r.ventas.totales.unidades, 6);
  const zapato = r.ventas.productos.find((p) => p.nombre.startsWith('Zapato'));
  assert.deepEqual([zapato.unidades, zapato.base, zapato.iva, zapato.total], [3, 300, 39, 339]);
  assert.equal(r.ventas.documentos.CF.cantidad, 3);
  assert.equal(r.ventas.documentos.CF.total, r.ventas.totales.total);
});

test('lote con errores: queda pausado, muestra los errores y no genera ventas', () => {
  const malo = cf(3, 'Zapato color negro talla 40', 1, 100);
  malo.factura.total = 1;
  const lote = [cf(1, 'Zapato color negro talla 40', 2, 100), malo];
  const r = procesarLote(lote, { catalogo: aCatalogo(proponerCatalogo(lote)) });
  assert.equal(r.estado, 'pausado');
  assert.ok(r.hallazgos.some((h) => h.codigo === 'TOTAL' && h.gravedad === 'ERROR'));
  assert.equal(r.ventas, null);
});

test('lote limpio pero con un producto fuera del catálogo: pausado y sin ventas', () => {
  const r = procesarLote(limpio(), { catalogo: [] });
  assert.equal(r.estado, 'pausado');
  assert.equal(r.ventas, null);
});

test('Puma corregido: 141 unidades en 35 productos y los montos cuadran con las líneas', async () => {
  const resultados = await leer('puma-arreglado');
  const catalogo = aCatalogo(proponerCatalogo(resultados));
  const v = reporteVentas(resultados, catalogo, { iva: 0.13 });
  assert.equal(v.productos.length, 35);
  assert.equal(v.totales.unidades, 141);
  const base = resultados.flatMap((r) => r.factura.lineas).reduce((s, l) => s + l.base, 0);
  assert.equal(v.totales.base, Math.round(base * 100) / 100);
});

test('Step Style: el crédito fiscal sin base ni IVA por línea se calcula con la tasa', async () => {
  const resultados = await leer('stepstyle');
  const catalogo = aCatalogo(proponerCatalogo(resultados));
  const v = reporteVentas(resultados, catalogo, { iva: 0.13 });
  assert.equal(v.totales.unidades, 189);
  const ccf = resultados.filter((r) => r.factura.tipo === 'CCF').map((r) => r.factura);
  const base = ccf.reduce((s, f) => s + f.subtotal, 0);
  assert.equal(v.documentos.CCF.base, Math.round(base * 100) / 100);
  assert.equal(v.documentos.CCF.iva, Math.round(ccf.reduce((s, f) => s + f.iva, 0) * 100) / 100);
});

test('registro semanal: respeta el formato del ejemplo y deja los totales con fórmulas', async () => {
  const resultados = await leer('puma-arreglado');
  const buffer = await generarRegistroSemanal({
    empresa: { nombre: 'Puma Footwear', nrc: '904036-1', nit: '850-79398290-103-7' },
    facturas: resultados.map((r) => r.factura),
    iva: 0.13,
  });
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  assert.deepEqual(libro.worksheets.map((h) => h.name), ['CONSUMIDOR FINAL', 'CREDITO FISCAL']);
  const hoja = libro.getWorksheet('CONSUMIDOR FINAL');
  assert.equal(hoja.getCell('A1').value, 'REGISTRO: 904036-1');
  assert.equal(hoja.getCell('A3').value, 'Fecha inicial: 03/08/2026');
  assert.equal(hoja.getCell('D6').value, '000-1');
  assert.equal(hoja.getCell('H6').value, 'Elena Tobar Rivera Flores');
  assert.equal(hoja.getCell('K6').value, 327.7);
  assert.equal(hoja.getCell('L6').value, 'EFECTIVO');
  assert.equal(hoja.getCell('A51').value, 'Total de Registros');
  assert.equal(hoja.getCell('K51').value.formula, 'SUM(K6:K50)');
  assert.equal(hoja.getCell('D54').value.formula, 'D53/1.13');
  const fiscal = libro.getWorksheet('CREDITO FISCAL');
  assert.equal(fiscal.getCell('L6').value, 'CREDITO');
  assert.equal(fiscal.getCell('K6').value, 416.1);
  assert.equal(fiscal.getCell('K11').value.formula, 'SUM(K6:K10)');
});

test('una empresa sin documentos queda vacía, sin errores y sin generar nada', () => {
  const r = procesarLote([], {});
  assert.equal(r.estado, 'vacio');
  assert.equal(r.resumen.errores, 0);
  assert.deepEqual(r.hallazgos, []);
  assert.equal(r.ventas, null);
});
