import test, { before, after } from 'node:test';
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

const hayBase = Boolean(config.mongoUri);
const fixture = (nombre) => fs.readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url));
let servidor;
let base;

async function pdfSinImagen(nombre) {
  const origen = await PDFDocument.load(fixture(nombre));
  const copia = await PDFDocument.create();
  const paginas = await copia.copyPages(origen, origen.getPageIndices().slice(1));
  paginas.forEach((p) => copia.addPage(p));
  return Buffer.from(await copia.save());
}

const pedir = async (ruta, opciones = {}) => {
  const r = await fetch(`${base}/api${ruta}`, opciones);
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, tipo, cuerpo: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const crearEmpresa = (datos) =>
  pedir('/empresas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
const subir = (ruta, buffer, nombre = 'semana.pdf', tipo = 'application/pdf') => {
  const forma = new FormData();
  forma.append('archivo', new Blob([buffer], { type: tipo }), nombre);
  return pedir(ruta, { method: 'POST', body: forma });
};

before(async () => {
  if (!hayBase) return;
  await connectDatabase({ dbName: 'facturas_test' });
  await mongoose.connection.dropDatabase();
  servidor = app.listen(0);
  base = `http://localhost:${servidor.address().port}`;
});

after(async () => {
  if (!hayBase) return;
  servidor.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('api: crear empresa, subir ventas y ver el proceso pausado por falta de inventario inicial', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Footwear', nrc: '904036-1', nit: '850-79398290-103-7' });
  assert.equal(empresa.status, 201);
  const id = empresa.cuerpo._id;

  const sinPdf = await pedir(`/empresas/${id}/documentos/ventas`, { method: 'POST', body: new FormData() });
  assert.equal(sinPdf.status, 400);
  const noPdf = await subir(`/empresas/${id}/documentos/ventas`, Buffer.from('hola'), 'a.txt', 'text/plain');
  assert.equal(noPdf.status, 400);

  const subida = await subir(`/empresas/${id}/documentos/ventas`, await pdfSinImagen('puma-original.pdf'));
  assert.equal(subida.status, 201);
  assert.equal(subida.cuerpo.facturas, 50);
  assert.equal(subida.cuerpo.inventarioInicial, false);
  assert.equal(subida.cuerpo.estado, 'pausado');

  const revision = await pedir(`/empresas/${id}/revision`);
  assert.ok(revision.cuerpo.hallazgos.some((h) => h.codigo === 'INVENTARIO INICIAL'));
});

test('api: con el inventario inicial cargado se revisan totales y productos, y el libro queda bloqueado', { skip: !hayBase }, async () => {
  const { cuerpo: empresas } = await pedir('/empresas');
  const id = empresas[0]._id;
  await InventarioInicial.create({ empresa: id, ...JSON.parse(fixture('inventario-puma-original.json')) });

  const { cuerpo } = await pedir(`/empresas/${id}/revision`);
  const cuenta = (codigo) => cuerpo.hallazgos.filter((h) => h.gravedad === 'ERROR' && h.codigo === codigo).length;
  const graves = (codigo) => cuerpo.hallazgos.filter((h) => h.gravedad === 'ADVERTENCIA_GRAVE' && h.codigo === codigo).length;
  assert.equal(cuerpo.estado, 'pausado');
  assert.equal(cuenta('TOTAL'), 45);
  assert.equal(graves('PRODUCTO SIN IDENTIFICAR'), 3);
  assert.equal(cuenta('SUBTOTAL'), 1);
  assert.equal(cuenta('INVENTARIO INICIAL'), 0);

  const libro = await pedir(`/empresas/${id}/libro`);
  assert.equal(libro.status, 409);
  assert.ok(libro.cuerpo.detalle.hallazgos.length > 0);
  assert.equal((await pedir(`/empresas/${id}/reporte-ventas`)).status, 409);
});

test('api: volver a subir el mismo PDF reemplaza las facturas y no las duplica', { skip: !hayBase }, async () => {
  const { cuerpo: empresas } = await pedir('/empresas');
  const id = empresas[0]._id;
  const otra = await subir(`/empresas/${id}/documentos/ventas`, await pdfSinImagen('puma-original.pdf'));
  assert.equal(otra.status, 201);
  assert.equal((await pedir(`/empresas/${id}/facturas`)).cuerpo.length, 50);
});

test('api: sube las 8 facturas de compra y las lista', { skip: !hayBase }, async () => {
  const { cuerpo: empresas } = await pedir('/empresas');
  const id = empresas[0]._id;
  const subida = await subir(`/empresas/${id}/documentos/compras`, fixture('compras.pdf'), 'compras.pdf');
  assert.equal(subida.status, 201);
  assert.equal(subida.cuerpo.compras, 8);
  const compras = await pedir(`/empresas/${id}/compras`);
  assert.equal(compras.cuerpo.length, 8);
  assert.equal(compras.cuerpo[0].lineas.length > 0, true);
});

function factura(empresa, correlativo, fecha, descripcion, cantidad, precio) {
  const base = cantidad * precio;
  const total = Math.round(base * 113) / 100;
  return {
    empresa,
    tipo: 'CF',
    correlativo,
    fecha,
    numeroDocumento: '10',
    emisor: { nombre: 'Demo', nit: '1', nrc: '2' },
    cliente: { nombre: `Cliente ${correlativo}`, nitDui: '123', nrc: '' },
    lineas: [{ n: 1, descripcion, cantidad, precioUnitario: precio, descuento: 0, base, iva: Math.round(base * 13) / 100, total }],
    subtotal: total,
    total,
    lectura: { titulo: 'FACTURA DE CONSUMIDOR FINAL', tipoDocumento: 'Consumidor final', rotulos: {}, avisos: [], faltantes: [] },
  };
}

test('api: un lote sin errores queda listo y descarga el libro con tres hojas por semana', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Demo', nrc: '2', nit: '1' });
  const id = empresa.cuerpo._id;
  await InventarioInicial.create({
    empresa: id,
    pagina: 1,
    filas: [{ numero: 1, codigo: 'X-001', modelo: 'Zapato Uno', color: 'Negro', talla: 40, existencia: 10, precioUnitario: 100, totalModelo: 1000 }],
    subtotal: 1000,
    iva: 130,
    total: 1130,
  });
  await Factura.insertMany([
    factura(id, 1, '2026-08-04', 'Zapato Uno color negro talla 40', 3, 100),
    factura(id, 2, '2026-08-11', 'Zapato Uno color negro talla 40', 2, 100),
  ]);

  const revision = await pedir(`/empresas/${id}/revision`);
  assert.equal(revision.cuerpo.estado, 'listo');

  const ventas = await pedir(`/empresas/${id}/reporte-ventas`);
  assert.equal(ventas.status, 200);
  assert.equal(ventas.cuerpo.totales.unidades, 5);

  const inventario = await pedir(`/empresas/${id}/inventario`);
  assert.deepEqual(inventario.cuerpo.semanas.map((s) => s.filas[0].final), [7, 5]);

  const libro = await pedir(`/empresas/${id}/libro`);
  assert.equal(libro.status, 200);
  assert.match(libro.tipo, /spreadsheetml/);
  const excel = new ExcelJS.Workbook();
  await excel.xlsx.load(libro.cuerpo);
  assert.deepEqual(excel.worksheets.map((h) => h.name), [
    'Facturas S1', 'Inventario inicial S1', 'Inventario final S1',
    'Facturas S2', 'Inventario inicial S2', 'Inventario final S2',
  ]);
});

test('api: empresa inexistente o identificador inválido', { skip: !hayBase }, async () => {
  assert.equal((await pedir('/empresas/123/revision')).status, 400);
  assert.equal((await pedir('/empresas/64b7f0f0f0f0f0f0f0f0f0f0/revision')).status, 404);
});

function conGemini(responder) {
  const original = globalThis.fetch;
  globalThis.fetch = (url, opciones) => {
    if (String(url).startsWith('https://generativelanguage.googleapis.com')) return Promise.resolve(responder());
    return original(url, opciones);
  };
  return () => (globalThis.fetch = original);
}

const respuestaGemini = (cuerpo) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(cuerpo) }] } }] }) });
const geminiFalla = () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'servicio no disponible' } }) });
const codigos = (revision) => revision.hallazgos.filter((h) => h.gravedad === 'ERROR').map((h) => h.codigo);

test('inventario inicial: un PDF sin la imagen deja el proceso pausado con un solo error claro', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Sin Imagen', nrc: '111-1', nit: '1' });
  const id = empresa.cuerpo._id;
  const subida = await subir(`/empresas/${id}/documentos/ventas`, await pdfSinImagen('puma-sin-errores.pdf'));
  assert.equal(subida.status, 201);
  assert.equal(subida.cuerpo.facturas, 50);
  assert.equal(subida.cuerpo.inventarioInicial, false);
  assert.equal(subida.cuerpo.estado, 'pausado');

  const revision = (await pedir(`/empresas/${id}/revision`)).cuerpo;
  assert.deepEqual(codigos(revision).sort(), ['EMPRESA', 'INVENTARIO INICIAL']);
  const hallazgo = revision.hallazgos.find((h) => h.codigo === 'INVENTARIO INICIAL');
  assert.match(hallazgo.correccion, /primera página/);
  assert.equal((await pedir(`/empresas/${id}/libro`)).status, 409);
});

test('inventario inicial: si la IA falla al leer la imagen, las facturas se guardan y se avisa el motivo', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'IA Caída', nrc: '222-2', nit: '2' });
  const id = empresa.cuerpo._id;
  const restaurar = conGemini(geminiFalla);
  try {
    const subida = await subir(`/empresas/${id}/documentos/ventas`, fixture('puma-sin-errores.pdf'));
    assert.equal(subida.status, 201);
    assert.equal(subida.cuerpo.inventarioInicial, false);
    assert.match(subida.cuerpo.errorInventario, /servicio no disponible/);
    assert.equal(subida.cuerpo.estado, 'pausado');
  } finally {
    restaurar();
  }
  assert.equal((await pedir(`/empresas/${id}/facturas`)).cuerpo.length, 50);
  assert.deepEqual(codigos((await pedir(`/empresas/${id}/revision`)).cuerpo).sort(), ['EMPRESA', 'INVENTARIO INICIAL']);
  assert.equal((await pedir(`/empresas/${id}/inventarios-iniciales`)).cuerpo.length, 0);
});

test('inventario inicial: el PDF completo y corregido queda listo; volver a subirlo no duplica la tabla', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Completo', nrc: '904036-1', nit: '850-79398290-103-7' });
  const id = empresa.cuerpo._id;
  const restaurar = conGemini(() => respuestaGemini(JSON.parse(fixture('inventario-puma-corregido.json'))));
  try {
    const subida = await subir(`/empresas/${id}/documentos/ventas`, fixture('puma-sin-errores.pdf'));
    assert.equal(subida.status, 201);
    assert.equal(subida.cuerpo.inventarioInicial, true);
    assert.equal(subida.cuerpo.errorInventario, null);
    assert.equal(subida.cuerpo.estado, 'listo');
    assert.equal(subida.cuerpo.resumen.errores, 0);

    const otra = await subir(`/empresas/${id}/documentos/ventas`, fixture('puma-sin-errores.pdf'));
    assert.equal(otra.cuerpo.estado, 'listo');
  } finally {
    restaurar();
  }
  const tablas = (await pedir(`/empresas/${id}/inventarios-iniciales`)).cuerpo;
  assert.equal(tablas.length, 1);
  assert.equal(tablas[0].fecha.slice(0, 10), '2026-08-03');
  assert.equal((await pedir(`/empresas/${id}/facturas`)).cuerpo.length, 50);

  const ventas = (await pedir(`/empresas/${id}/reporte-ventas`)).cuerpo;
  assert.equal(ventas.totales.unidades, 141);
  const mensual = (await pedir(`/empresas/${id}/mensual`)).cuerpo;
  assert.deepEqual([mensual[0].documentos.total, mensual[0].documentos.ccf], [50, 5]);
  const libro = await pedir(`/empresas/${id}/libro`);
  assert.equal(libro.status, 200);
});

test('inventario inicial: una empresa que ya lo tiene puede subir facturas sin la imagen', { skip: !hayBase }, async () => {
  const { cuerpo: empresas } = await pedir('/empresas');
  const id = empresas.find((e) => e.nombre === 'Puma Completo')._id;
  const subida = await subir(`/empresas/${id}/documentos/ventas`, await pdfSinImagen('puma-sin-errores.pdf'));
  assert.equal(subida.status, 201);
  assert.equal(subida.cuerpo.inventarioInicial, false);
  assert.equal(subida.cuerpo.estado, 'listo');
  assert.equal((await pedir(`/empresas/${id}/inventarios-iniciales`)).cuerpo.length, 1);
});

test('semanas: la secuencia de cuatro subidas encadena el inventario de la semana 1 a la 3', { skip: !hayBase }, async () => {
  const empresa = await crearEmpresa({ nombre: 'Puma Semanas', nrc: '904036-1', nit: '850-79398290-103-7' });
  const id = empresa.cuerpo._id;
  const semana = (nombre) => fixture(`semanas/${nombre}`);

  const restaurar = conGemini(() => respuestaGemini(JSON.parse(fixture('inventario-puma-corregido.json'))));
  try {
    const primera = await subir(`/empresas/${id}/documentos/ventas`, fixture('puma-sin-errores.pdf'));
    assert.equal(primera.cuerpo.estado, 'listo');
  } finally {
    restaurar();
  }

  const pasos = [
    ['compras', '01 - Compras de la semana 1.pdf', 'compras'],
    ['ventas', '02 - Ventas de la semana 2.pdf', 'facturas'],
    ['compras', '03 - Compras de la semana 2.pdf', 'compras'],
    ['ventas', '04 - Ventas de la semana 3.pdf', 'facturas'],
  ];
  for (const [tipo, archivo, campo] of pasos) {
    const r = await subir(`/empresas/${id}/documentos/${tipo}`, semana(archivo), archivo);
    assert.equal(r.status, 201, archivo);
    assert.equal(r.cuerpo.estado, 'listo', `${archivo}: ${JSON.stringify(r.cuerpo)}`);
    assert.equal(r.cuerpo[campo], tipo === 'ventas' ? 50 : 3);
  }

  const inventario = (await pedir(`/empresas/${id}/inventario`)).cuerpo;
  const total = (semana, campo) => semana.filas.reduce((s, f) => s + f[campo], 0);
  assert.deepEqual(inventario.semanas.map((s) => total(s, 'final')), [466, 406, 387]);
  assert.deepEqual(inventario.semanas.map((s) => total(s, 'compras')), [0, 132, 142]);
  assert.deepEqual(inventario.semanas.map((s) => total(s, 'saldo')), [607, 466, 406]);
  assert.ok(inventario.semanas.every((s) => s.alertas.length === 0));

  const mensual = (await pedir(`/empresas/${id}/mensual`)).cuerpo;
  assert.deepEqual([mensual[0].documentos.total, mensual[0].documentos.ccf, mensual[0].compras], [150, 15, 6]);

  const libro = await pedir(`/empresas/${id}/libro`);
  assert.equal(libro.status, 200);
  const excel = new ExcelJS.Workbook();
  await excel.xlsx.load(libro.cuerpo);
  assert.equal(excel.worksheets.length, 9);
  assert.equal(excel.worksheets[8].name, 'Inventario final S3');
});
