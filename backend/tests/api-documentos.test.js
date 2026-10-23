import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import app from '../src/app.js';
import { config } from '../src/config.js';
import { connectDatabase } from '../src/database.js';
import Factura from '../src/models/Factura.js';
import InventarioInicial from '../src/models/InventarioInicial.js';
import Empresa from '../src/models/Empresa.js';

const hayBase = Boolean(config.mongoUri);
const fixture = (nombre) => fs.readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url));
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let servidor;
let base;

const pedir = async (ruta, opciones = {}) => {
  const r = await fetch(`${base}/api${ruta}`, opciones);
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, tipo, cuerpo: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const crearEmpresa = (datos) =>
  pedir('/empresas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });

function subir(ruta, buffer, nombre = 'archivo.pdf', tipo = 'application/pdf', fecha) {
  const forma = new FormData();
  if (fecha !== undefined) forma.append('fecha', fecha);
  forma.append('archivo', new Blob([buffer], { type: tipo }), nombre);
  return pedir(ruta, { method: 'POST', body: forma });
}

async function unirPdfs(partes) {
  const destino = await PDFDocument.create();
  for (const [nombre, indices] of partes) {
    const origen = await PDFDocument.load(fixture(nombre));
    (await destino.copyPages(origen, indices ?? origen.getPageIndices())).forEach((p) => destino.addPage(p));
  }
  return Buffer.from(await destino.save());
}

const sinImagen = async (nombre) => {
  const origen = await PDFDocument.load(fixture(nombre));
  return unirPdfs([[nombre, origen.getPageIndices().slice(1)]]);
};

function conGemini(responder) {
  const original = globalThis.fetch;
  globalThis.fetch = (url, opciones) => (String(url).startsWith('https://generativelanguage.googleapis.com') ? Promise.resolve(responder()) : original(url, opciones));
  return () => (globalThis.fetch = original);
}
const respuestaGemini = (cuerpo) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(cuerpo) }] } }] }) });

async function excelDeInventario(inventario) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Inventario');
  hoja.addRow(['INVENTARIO DE ZAPATOS PUMA']);
  hoja.addRow(['N.°', 'Código', 'Modelo de zapato Puma', 'Color', 'Talla', 'Existencia', 'Precio unitario', 'Total por modelo']);
  for (const f of inventario.filas) hoja.addRow([f.numero, f.codigo, f.modelo, f.color, f.talla, f.existencia, f.precioUnitario, f.totalModelo]);
  hoja.addRow(['SUBTOTAL', null, null, null, null, null, null, inventario.subtotal]);
  hoja.addRow(['IVA (13%)', null, null, null, null, null, null, inventario.iva]);
  hoja.addRow(['TOTAL', null, null, null, null, null, null, inventario.total]);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

before(async () => {
  if (!hayBase) return;
  await connectDatabase({ dbName: 'facturas_test_documentos' });
  await mongoose.connection.dropDatabase();
  await mongoose.syncIndexes();
  servidor = app.listen(0);
  base = `http://localhost:${servidor.address().port}`;
});

beforeEach(async () => {
  if (hayBase) await Empresa.deleteMany({});
});

after(async () => {
  if (!hayBase) return;
  servidor.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('todo en uno: un solo PDF con inventario, ventas de dos semanas y compras se separa solo', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Todo en Uno', nrc: '904036-1', nit: '850-79398290-103-7' });
  const id = empresa.cuerpo._id;
  const todo = await unirPdfs([['puma-sin-errores.pdf'], ['semanas/02 - Ventas de la semana 2.pdf'], ['semanas/01 - Compras de la semana 1.pdf']]);

  const restaurar = conGemini(() => respuestaGemini(JSON.parse(fixture('inventario-puma-corregido.json'))));
  try {
    const r = await subir(`/empresas/${id}/documentos/mixto`, todo, 'todo-junto.pdf');
    assert.equal(r.status, 201, JSON.stringify(r.cuerpo));
    assert.equal(r.cuerpo.facturas, 100);
    assert.equal(r.cuerpo.compras, 3);
    assert.equal(r.cuerpo.inventarioInicial, true);
    assert.equal(r.cuerpo.estado, 'listo', JSON.stringify(r.cuerpo));
  } finally {
    restaurar();
  }
  assert.equal((await pedir(`/empresas/${id}/facturas`)).cuerpo.length, 100);
  assert.equal((await pedir(`/empresas/${id}/compras`)).cuerpo.length, 3);
  const inventario = (await pedir(`/empresas/${id}/inventario`)).cuerpo;
  assert.equal(inventario.semanas.length, 2);
  assert.equal(inventario.semanas[1].filas.reduce((s, f) => s + f.compras, 0), 132);
});

test('todo en uno: si una página no se puede clasificar, no se guarda nada y se dice cuál', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Con Basura', nrc: '904036-1', nit: '1' });
  const id = empresa.cuerpo._id;
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Hola, esto no es una factura', { x: 50, y: 700, size: 12 });
  const restaurar = conGemini(() => respuestaGemini({ clase: 'otro', venta: null, compra: null }));
  try {
    const r = await subir(`/empresas/${id}/documentos/mixto`, Buffer.from(await pdf.save()));
    assert.equal(r.status, 422, JSON.stringify(r.cuerpo));
    assert.equal(r.cuerpo.detalle[0].pagina, 1);
    assert.match(r.cuerpo.detalle[0].errorIA, /no es una factura de venta ni de compra/);
  } finally {
    restaurar();
  }
  assert.equal((await pedir(`/empresas/${id}/facturas`)).cuerpo.length, 0);
});

test('inventario aparte: un Excel con su fecha se guarda, se suma al de otra fecha y se valida', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Inventario Aparte', nrc: '904036-1', nit: '850-79398290-103-7' });
  const id = empresa.cuerpo._id;
  const excel = await excelDeInventario(JSON.parse(fixture('inventario-puma-corregido.json')));
  const ruta = `/empresas/${id}/documentos/inventario`;

  assert.equal((await subir(ruta, Buffer.from('hola'), 'a.txt', 'text/plain', '2026-08-03')).status, 400);
  assert.equal((await subir(ruta, excel, 'inventario.xlsx', XLSX, '03/08/2026')).status, 400);

  const primera = await subir(ruta, excel, 'inventario.xlsx', XLSX, '2026-08-03');
  assert.equal(primera.status, 201, JSON.stringify(primera.cuerpo));
  assert.equal(primera.cuerpo.productos, 19);
  await subir(ruta, excel, 'inventario.xlsx', XLSX, '2026-08-03');
  assert.equal((await pedir(`/empresas/${id}/inventarios-iniciales`)).cuerpo.length, 1);

  const sinFechaConOtro = await subir(ruta, excel, 'inventario.xlsx', XLSX);
  assert.equal(sinFechaConOtro.status, 400);
  assert.match(sinFechaConOtro.cuerpo.error, /Ya hay un inventario inicial/);

  assert.equal((await subir(ruta, excel, 'inventario2.xlsx', XLSX, '2026-08-10')).status, 201);
  const tablas = (await pedir(`/empresas/${id}/inventarios-iniciales`)).cuerpo;
  assert.deepEqual(tablas.map((t) => t.fecha.slice(0, 10)), ['2026-08-03', '2026-08-10']);

  const vacio = new ExcelJS.Workbook();
  vacio.addWorksheet('Vacia').addRow(['nada']);
  const sinTabla = await subir(ruta, Buffer.from(await vacio.xlsx.writeBuffer()), 'vacio.xlsx', XLSX, '2026-08-17');
  assert.equal(sinTabla.status, 422);

  assert.equal((await pedir(ruta, { method: 'DELETE' })).status, 204);
  assert.equal((await pedir(`/empresas/${id}/inventarios-iniciales`)).cuerpo.length, 0);
});

test('inventario aparte: una imagen se lee con IA', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Inventario Imagen', nrc: '904036-1', nit: '1' });
  const id = empresa.cuerpo._id;
  const restaurar = conGemini(() => respuestaGemini(JSON.parse(fixture('inventario-puma-corregido.json'))));
  try {
    const r = await subir(`/empresas/${id}/documentos/inventario`, Buffer.from('imagen'), 'tabla.png', 'image/png', '2026-08-03');
    assert.equal(r.status, 201, JSON.stringify(r.cuerpo));
    assert.equal(r.cuerpo.productos, 19);
  } finally {
    restaurar();
  }
});

test('inventario aparte: después de cargarlo, las ventas sin imagen dejan el proceso listo', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Ventas e Inventario', nrc: '904036-1', nit: '850-79398290-103-7' });
  const id = empresa.cuerpo._id;
  const excel = await excelDeInventario(JSON.parse(fixture('inventario-puma-corregido.json')));
  await subir(`/empresas/${id}/documentos/inventario`, excel, 'inventario.xlsx', XLSX, '2026-08-03');
  const ventas = await subir(`/empresas/${id}/documentos/ventas`, await sinImagen('puma-sin-errores.pdf'));
  assert.equal(ventas.cuerpo.inventarioInicial, false);
  assert.equal(ventas.cuerpo.estado, 'listo', JSON.stringify(ventas.cuerpo));
});

test('reemplazo seguro: una factura con el mismo número pero de otra semana no se pierde', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Numeración', nrc: '904036-1', nit: '1' });
  const id = empresa.cuerpo._id;
  await Factura.create({
    empresa: id,
    tipo: 'CF',
    correlativo: 1,
    fecha: new Date('2026-09-07T00:00:00Z'),
    cliente: { nombre: 'Cliente de septiembre' },
    lineas: [{ n: 1, descripcion: 'Producto', cantidad: 1, precioUnitario: 10, base: 10, iva: 1.3, total: 11.3 }],
    total: 11.3,
  });
  const pdf = await sinImagen('puma-sin-errores.pdf');
  await subir(`/empresas/${id}/documentos/ventas`, pdf);
  const facturas = (await pedir(`/empresas/${id}/facturas`)).cuerpo;
  assert.equal(facturas.length, 51);
  assert.ok(facturas.some((f) => f.cliente.nombre === 'Cliente de septiembre'));
  const revision = (await pedir(`/empresas/${id}/revision`)).cuerpo;
  assert.ok(revision.hallazgos.some((h) => h.codigo === 'CORRELATIVO' && /repetido/.test(h.detalle)));

  await subir(`/empresas/${id}/documentos/ventas`, pdf);
  assert.equal((await pedir(`/empresas/${id}/facturas`)).cuerpo.length, 51);
});

test('inventario aparte: sin fecha, el primero queda como punto de partida y toma la fecha de la primera factura', { skip: !hayBase }, async () => {
  const sinNada = await crearEmpresa({ nombre: 'Puma Sin Fecha A', nrc: '111-1', nit: '1' });
  const excel = await excelDeInventario(JSON.parse(fixture('inventario-puma-corregido.json')));
  const r1 = await subir(`/empresas/${sinNada.cuerpo._id}/documentos/inventario`, excel, 'inventario.xlsx', XLSX);
  assert.equal(r1.status, 201, JSON.stringify(r1.cuerpo));
  assert.equal(r1.cuerpo.fecha, null);
  assert.equal((await pedir(`/empresas/${sinNada.cuerpo._id}/inventarios-iniciales`)).cuerpo[0].fecha, null);

  await Empresa.deleteMany({});
  const conFacturas = await crearEmpresa({ nombre: 'Puma Sin Fecha B', nrc: '904036-1', nit: '1' });
  const id = conFacturas.cuerpo._id;
  await subir(`/empresas/${id}/documentos/ventas`, await sinImagen('puma-sin-errores.pdf'));
  const r2 = await subir(`/empresas/${id}/documentos/inventario`, excel, 'inventario.xlsx', XLSX);
  assert.equal(r2.status, 201, JSON.stringify(r2.cuerpo));
  assert.equal(r2.cuerpo.fecha, '2026-08-03');
  assert.equal(r2.cuerpo.estado, 'listo', JSON.stringify(r2.cuerpo));
});

const NIT = '850-79398290-103-7';
const semana = (nombre) => fixture(`semanas/${nombre}`);
const codigosError = (revision) => revision.hallazgos.filter((h) => h.gravedad === 'ERROR').map((h) => h.codigo);

test('desorden: subir la semana 3, luego el inventario, la 1, la 2 y las compras da el mismo resultado final', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma En Desorden', nrc: '904036-1', nit: NIT });
  const id = empresa.cuerpo._id;
  const excel = await excelDeInventario(JSON.parse(fixture('inventario-puma-corregido.json')));
  const estado = async () => (await pedir(`/empresas/${id}/revision`)).cuerpo;

  await subir(`/empresas/${id}/documentos/ventas`, semana('04 - Ventas de la semana 3.pdf'));
  let r = await estado();
  assert.equal(r.estado, 'pausado');
  assert.ok(r.hallazgos.some((h) => h.codigo === 'CORRELATIVO' && /Faltan los documentos del 1 al 90/.test(h.detalle)));
  assert.ok(codigosError(r).includes('INVENTARIO INICIAL'));

  await subir(`/empresas/${id}/documentos/inventario`, excel, 'inventario.xlsx', XLSX, '2026-08-03');
  await subir(`/empresas/${id}/documentos/ventas`, await sinImagen('puma-sin-errores.pdf'));
  r = await estado();
  assert.equal(r.estado, 'pausado');
  assert.ok(r.hallazgos.some((h) => h.codigo === 'CORRELATIVO' && /Faltan los documentos del 46 al 90 \(¿falta subir esa semana\?\)/.test(h.detalle)));
  assert.deepEqual([...new Set(codigosError(r))], ['CORRELATIVO']);

  await subir(`/empresas/${id}/documentos/ventas`, semana('02 - Ventas de la semana 2.pdf'));
  assert.equal((await estado()).estado, 'listo');
  await subir(`/empresas/${id}/documentos/compras`, semana('03 - Compras de la semana 2.pdf'));
  await subir(`/empresas/${id}/documentos/compras`, semana('01 - Compras de la semana 1.pdf'));
  assert.equal((await estado()).estado, 'listo');

  const { semanas } = (await pedir(`/empresas/${id}/inventario`)).cuerpo;
  const total = (s, campo) => s.filas.reduce((a, f) => a + f[campo], 0);
  assert.deepEqual(semanas.map((s) => total(s, 'final')), [466, 406, 387]);
  assert.deepEqual(semanas.map((s) => total(s, 'compras')), [0, 132, 142]);
});

test('solo compras e inventario, sin facturas de venta: se calcula el inventario y no se rompe nada', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Solo Compras', nrc: '904036-1', nit: NIT });
  const id = empresa.cuerpo._id;
  const excel = await excelDeInventario(JSON.parse(fixture('inventario-puma-corregido.json')));
  await subir(`/empresas/${id}/documentos/inventario`, excel, 'inventario.xlsx', XLSX, '2026-08-03');
  await subir(`/empresas/${id}/documentos/compras`, semana('01 - Compras de la semana 1.pdf'));
  assert.equal((await pedir(`/empresas/${id}/revision`)).cuerpo.estado, 'listo');
  const { semanas, inventario } = (await pedir(`/empresas/${id}/inventario`)).cuerpo;
  assert.equal(semanas.length, 1);
  assert.equal(inventario.totales.compras, 132);
  assert.equal(inventario.totales.final, 607 + 132);
  assert.equal((await pedir(`/empresas/${id}/libro`)).status, 200);
});

test('solo el inventario, sin ninguna factura: el libro avisa que aún no hay semanas', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Solo Inventario', nrc: '904036-1', nit: NIT });
  const id = empresa.cuerpo._id;
  const excel = await excelDeInventario(JSON.parse(fixture('inventario-puma-corregido.json')));
  await subir(`/empresas/${id}/documentos/inventario`, excel, 'inventario.xlsx', XLSX, '2026-08-03');
  assert.equal((await pedir(`/empresas/${id}/revision`)).cuerpo.estado, 'listo');
  const libro = await pedir(`/empresas/${id}/libro`);
  assert.equal(libro.status, 409);
  assert.match(libro.cuerpo.error, /Todavía no hay semanas/);
});

test('inventario con fecha posterior a las facturas: el sistema lo detecta y pausa', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Fecha Tardía', nrc: '904036-1', nit: NIT });
  const id = empresa.cuerpo._id;
  const excel = await excelDeInventario(JSON.parse(fixture('inventario-puma-corregido.json')));
  await subir(`/empresas/${id}/documentos/inventario`, excel, 'inventario.xlsx', XLSX, '2026-08-17');
  await subir(`/empresas/${id}/documentos/ventas`, await sinImagen('puma-sin-errores.pdf'));
  const r = (await pedir(`/empresas/${id}/revision`)).cuerpo;
  assert.equal(r.estado, 'pausado');
  assert.ok(r.hallazgos.some((h) => h.codigo === 'ANTERIOR AL INVENTARIO' && h.gravedad === 'ERROR'));
});

test('formato de la Ñaña: el PDF de la semana 4 se sube sin IA y el sistema señala los errores reales de las facturas', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Agua la Ñaña', nrc: '287555-3', nit: '015-06082026-001-8' });
  const id = empresa.cuerpo._id;
  const { _id, empresa: _empresa, fecha: _fecha, createdAt, updatedAt, __v, ...tabla } = JSON.parse(fixture('inventario-agua.json'));
  await InventarioInicial.create({ ...tabla, empresa: id, fecha: new Date('2026-08-24T00:00:00Z') });
  let llamadas = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (url, opciones) => (String(url).startsWith('https://generativelanguage') ? (llamadas++, Promise.reject(new Error('no debe usar IA'))) : original(url, opciones));
  let r;
  try {
    r = await subir(`/empresas/${id}/documentos/ventas`, fixture('nana-semana4.pdf'), 'semana4.pdf');
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(r.status, 201, JSON.stringify(r.cuerpo));
  assert.equal(llamadas, 0);
  assert.equal(r.cuerpo.facturas, 50);
  assert.equal(r.cuerpo.estado, 'pausado');

  const revision = (await pedir(`/empresas/${id}/revision`)).cuerpo;
  const errores = revision.hallazgos.filter((h) => h.gravedad === 'ERROR').map((h) => `${h.codigo}${h.correlativo ? ` ${h.correlativo}` : ''}`).sort();
  assert.deepEqual(errores, ['CORRELATIVO 136', 'CORRELATIVO 16', 'PRODUCTO SIN IDENTIFICAR 145', 'TOTAL 157', 'TOTAL 173'].sort());
  assert.equal((await pedir(`/empresas/${id}/carta`)).status, 200);
});
