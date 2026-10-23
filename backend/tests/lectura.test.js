import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { leerFacturas } from '../src/services/parsers/index.js';

const leer = (nombre) => leerFacturas(fs.readFileSync(new URL(`./fixtures/${nombre}.pdf`, import.meta.url)));
const redondear = (n) => Math.round(n * 100) / 100;

test('Puma original: 50 documentos, 45 CF y 5 CCF, todos legibles', async () => {
  const r = await leer('puma-original');
  assert.equal(r.length, 50);
  assert.equal(r.filter((x) => x.factura.tipo === 'CF').length, 45);
  assert.equal(r.filter((x) => x.factura.tipo === 'CCF').length, 5);
  assert.ok(r.every((x) => x.ok));
});

test('Puma original: la factura CF 1 se lee completa y con su total erróneo', async () => {
  const [primera] = await leer('puma-original');
  const f = primera.factura;
  assert.equal(f.correlativo, 1);
  assert.equal(f.fecha, '2026-08-03');
  assert.equal(f.emisor.nit, '850-79398290-103-7');
  assert.equal(f.cliente.nombre, 'Elena Tobar Rivera Flores');
  assert.equal(f.lineas.length, 2);
  assert.deepEqual(f.lineas.map((l) => l.total), [192.1, 135.6]);
  assert.equal(f.total, 290);
});

test('Puma original: el crédito fiscal 1 trae IVA al final y 1% de percepción', async () => {
  const r = await leer('puma-original');
  const f = r.find((x) => x.factura.tipo === 'CCF' && x.factura.correlativo === 1).factura;
  assert.equal(f.subtotal, 365);
  assert.equal(f.iva, 47.45);
  assert.equal(f.percepcion, 3.65);
  assert.equal(f.total, 416.1);
  assert.equal(f.cliente.nrc, '164575-7');
  assert.equal(f.emisor.nombre, 'PUMA FOOTWAER');
});

test('Puma corregido: solo la CF 4 tiene el total distinto a la suma de sus líneas', async () => {
  const r = await leer('puma-arreglado');
  const malos = r
    .filter((x) => x.factura.tipo === 'CF')
    .filter((x) => redondear(x.factura.lineas.reduce((s, l) => s + l.total, 0)) !== x.factura.total)
    .map((x) => x.factura.correlativo);
  assert.deepEqual(malos, [4]);
});

test('Puma: detecta el texto extra dentro del encabezado EMISOR del CCF 2', async () => {
  const r = await leer('puma-arreglado');
  const ccf2 = r.find((x) => x.factura.tipo === 'CCF' && x.factura.correlativo === 2);
  assert.ok(ccf2.lectura.avisos.some((a) => a.campo === 'encabezado.emisor'));
});

test('Step Style: 50 documentos legibles, con líneas de crédito fiscal sin base ni IVA', async () => {
  const r = await leer('stepstyle');
  assert.equal(r.length, 50);
  assert.ok(r.every((x) => x.ok));
  const ccf1 = r.find((x) => x.factura.tipo === 'CCF' && x.factura.correlativo === 1).factura;
  assert.equal(ccf1.lineas.length, 2);
  assert.equal(ccf1.lineas[0].base, null);
  assert.equal(ccf1.lineas[0].total, 1400);
  assert.equal(ccf1.percepcion, 25);
  assert.equal(ccf1.total, 2850);
});

test('Step Style: marca los campos con más de un valor superpuesto', async () => {
  const r = await leer('stepstyle');
  const cf2 = r.find((x) => x.factura.tipo === 'CF' && x.factura.correlativo === 2);
  const campos = cf2.lectura.avisos.map((a) => a.campo);
  assert.ok(campos.includes('cliente.nrc'));
  assert.ok(campos.includes('documento.numeroDocumento'));
});
