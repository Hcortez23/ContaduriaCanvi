import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { leerFacturas } from '../src/services/parsers/index.js';
import { revisarLote } from '../src/services/rules/index.js';

const revisar = async (nombre) =>
  revisarLote(await leerFacturas(fs.readFileSync(new URL(`./fixtures/${nombre}.pdf`, import.meta.url)))).hallazgos;

const docs = (hallazgos, codigo, gravedad) =>
  hallazgos.filter((h) => h.codigo === codigo && (!gravedad || h.gravedad === gravedad)).map((h) => `${h.tipo}${h.correlativo}`);

function cf(correlativo, fecha = '2026-08-03', total = 113) {
  return {
    factura: {
      tipo: 'CF',
      correlativo,
      fecha,
      pagina: correlativo,
      emisor: { nombre: 'Demo', nit: '1', nrc: '2' },
      cliente: { nombre: 'Cliente', nitDui: '123', nrc: '' },
      lineas: [{ n: 1, descripcion: 'Producto color negro talla 40', cantidad: 1, precioUnitario: 100, descuento: 0, base: 100, iva: 13, total: 113 }],
      subtotal: total,
      iva: null,
      percepcion: null,
      total,
      numeroDocumento: '10',
    },
    lectura: { titulo: 'FACTURA DE CONSUMIDOR FINAL', rotulos: {}, avisos: [], faltantes: [] },
  };
}

test('correlativo: detecta salto, repetido y fecha que retrocede', () => {
  const lote = [cf(1), cf(2), cf(4), cf(4), cf(5, '2026-08-01')];
  const { hallazgos } = revisarLote(lote);
  const msg = hallazgos.filter((h) => h.codigo === 'CORRELATIVO').map((h) => h.detalle);
  assert.equal(msg.length, 2);
  assert.match(msg[0], /salto/);
  assert.match(msg[1], /repetido/);
  assert.equal(docs(hallazgos, 'FECHA').length, 1);
});

test('correlativo: un lote correcto no genera hallazgos de numeración', () => {
  const { hallazgos } = revisarLote([cf(1), cf(2), cf(3)]);
  assert.equal(docs(hallazgos, 'CORRELATIVO').length, 0);
});

test('consumidor final: total distinto a la suma de líneas se marca y explica la causa', () => {
  const { hallazgos } = revisarLote([cf(1, '2026-08-03', 100)]);
  const h = hallazgos.find((x) => x.codigo === 'TOTAL');
  assert.equal(h.gravedad, 'ERROR');
  assert.match(h.detalle, /sin el IVA/);
});

test('Puma corregido: solo la CF 4 tiene error de total', async () => {
  const h = await revisar('puma-arreglado');
  assert.deepEqual(docs(h, 'TOTAL', 'ERROR'), ['CF4']);
});

test('Puma original: las 45 facturas de consumidor final suman las bases sin IVA', async () => {
  const h = await revisar('puma-original');
  const totales = h.filter((x) => x.codigo === 'TOTAL');
  assert.equal(totales.length, 45);
  assert.ok(totales.every((x) => /sin el IVA/.test(x.detalle)));
});

test('Puma: el cliente del CCF aparece con 5 NRC distintos y el nombre del emisor mal escrito es advertencia', async () => {
  const h = await revisar('puma-arreglado');
  assert.equal(docs(h, 'CLIENTE', 'ADVERTENCIA').length, 5);
  assert.equal(docs(h, 'EMISOR', 'ADVERTENCIA').length, 5);
});

test('Puma: el 1% está bien aplicado (solo sobre $250) pero mal rotulado en los cinco CCF', async () => {
  const h = await revisar('puma-arreglado');
  assert.equal(docs(h, 'PERCEPCION').length, 0);
  assert.equal(docs(h, 'TEXTO').length, 5);
});

function ccf(subtotal, percepcion) {
  const iva = Math.round(subtotal * 13) / 100;
  const percibido = percepcion ? Math.round(subtotal) / 100 : null;
  return {
    factura: {
      tipo: 'CCF',
      correlativo: 1,
      fecha: '2026-08-03',
      pagina: 1,
      emisor: { nombre: 'Demo', nit: '1', nrc: '2' },
      cliente: { nombre: 'Cliente', nitDui: '', nrc: '123-4' },
      lineas: [{ n: 1, descripcion: 'Producto color negro talla 40', cantidad: 1, precioUnitario: subtotal, descuento: 0, base: subtotal, iva: null, total: subtotal }],
      subtotal,
      iva,
      percepcion: percibido,
      total: Math.round((subtotal + iva + (percibido ?? 0)) * 100) / 100,
      numeroDocumento: '10',
    },
    lectura: { titulo: 'FACTURA DE CRÉDITO FISCAL', rotulos: {}, avisos: [], faltantes: [] },
  };
}

test('1%: con $250 exactos no se aplica; con $251 es obligatorio', () => {
  assert.equal(revisarLote([ccf(250, false)]).hallazgos.filter((h) => h.codigo === 'PERCEPCION').length, 0);
  assert.equal(revisarLote([ccf(250, true)]).hallazgos.filter((h) => h.codigo === 'PERCEPCION').length, 1);
  assert.equal(revisarLote([ccf(251, false)]).hallazgos.filter((h) => h.codigo === 'PERCEPCION' && h.gravedad === 'ERROR').length, 1);
  assert.equal(revisarLote([ccf(251, true)]).hallazgos.filter((h) => h.codigo === 'PERCEPCION').length, 0);
});

test('un lote con errores queda pausado y uno sin errores queda listo', () => {
  assert.equal(revisarLote([cf(1, '2026-08-03', 200)]).estado, 'pausado');
  assert.equal(revisarLote([cf(1), cf(3)]).estado, 'listo');
  assert.equal(revisarLote([cf(1), cf(2)]).estado, 'listo');
});

test('Puma: detecta documentos sin título y el texto extraño del CCF 2', async () => {
  const h = await revisar('puma-arreglado');
  const sinTitulo = docs(h, 'ENCABEZADO', 'ADVERTENCIA');
  for (const esperado of ['CF30', 'CF45', 'CCF2', 'CCF3', 'CCF4', 'CCF5']) assert.ok(sinTitulo.includes(esperado), esperado);
  assert.ok(h.some((x) => x.codigo === 'ENCABEZADO' && /A2:H29/.test(x.detalle)));
});

test('Puma: no marca errores de ortografía pero sí la talla fuera de rango', async () => {
  const h = await revisar('puma-arreglado');
  assert.equal(h.filter((x) => x.codigo === 'DESCRIPCION').length, 0);
  assert.ok(h.some((x) => x.codigo === 'TALLA' && /talla 49/.test(x.detalle)));
});

test('Step Style: los cálculos cuadran pero 18 CF dicen "CONSUMIDOR FISCAL"', async () => {
  const h = await revisar('stepstyle');
  assert.equal(docs(h, 'TOTAL').length, 0);
  assert.equal(docs(h, 'CALCULO').length, 0);
  assert.equal(docs(h, 'IVA').length, 0);
  const titulos = h.filter((x) => x.codigo === 'ENCABEZADO' && /pero el documento es de tipo/.test(x.detalle));
  assert.equal(titulos.length, 18);
  assert.ok(titulos.every((x) => /CONSUMIDOR FISCAL/.test(x.detalle)));
});

test('Step Style: el 1% de los cinco CCF está mal rotulado', async () => {
  const h = await revisar('stepstyle');
  assert.equal(docs(h, 'TEXTO').length, 5);
});

test('emisor: un nombre con error de ortografía es advertencia, un NRC distinto también', async () => {
  const { revisarConsistencia } = await import('../src/services/rules/consistencia.js');
  const doc = (correlativo, nombre, nrc = '1-1') => ({
    factura: { tipo: 'CF', correlativo, fecha: '2026-08-03', emisor: { nombre, nit: '1', nrc }, numeroDocumento: null },
    lectura: { titulo: 'FACTURA CONSUMIDOR FINAL', avisos: [] },
  });
  const h = revisarConsistencia([doc(1, 'Puma Footwear'), doc(2, 'Puma Footwear'), doc(3, 'PUMA FOOTWAER'), doc(4, 'Puma Footwear', '9-9')]).filter((x) => x.codigo === 'EMISOR');
  assert.equal(h.find((x) => x.correlativo === 3).gravedad, 'ADVERTENCIA');
  assert.equal(h.find((x) => x.correlativo === 4).gravedad, 'ADVERTENCIA');
});
