import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';

process.env.GEMINI_API_KEY = 'clave-de-prueba';
const { leerMixto, clasificarPagina } = await import('../src/services/parsers/mixto.js');
const { leerInventarioExcel } = await import('../src/services/parsers/inventarioExcel.js');
const { leerInventarioArchivo } = await import('../src/services/parsers/inventarioInicial.js');
const { leerPaginas } = await import('../src/services/parsers/pdfText.js');
const { revisarLote } = await import('../src/services/rules/index.js');
const { leerFacturas } = await import('../src/services/parsers/index.js');

const fixture = (nombre) => fs.readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url));

async function unir(partes) {
  const destino = await PDFDocument.create();
  for (const [nombre, indices] of partes) {
    const origen = await PDFDocument.load(fixture(nombre));
    const paginas = await destino.copyPages(origen, indices ?? origen.getPageIndices());
    paginas.forEach((p) => destino.addPage(p));
  }
  return Buffer.from(await destino.save());
}

async function paginaConTexto(texto) {
  const pdf = await PDFDocument.create();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText(texto, { x: 50, y: 700, size: 12, font: fuente });
  return Buffer.from(await pdf.save());
}

function simularGemini(respuesta) {
  const original = globalThis.fetch;
  const estado = { llamadas: 0 };
  globalThis.fetch = async () => {
    estado.llamadas++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(respuesta) }] } }] }) };
  };
  return { estado, restaurar: () => (globalThis.fetch = original) };
}

test('mixto: separa en un solo archivo las ventas, las compras y la imagen del inventario', async () => {
  const buffer = await unir([['puma-sin-errores.pdf', [0, 1, 2, 3]], ['semanas/01 - Compras de la semana 1.pdf', [0, 1]]]);
  const r = await leerMixto(buffer);
  assert.equal(r.ventas.length, 3);
  assert.equal(r.compras.length, 2);
  assert.deepEqual(r.paginasImagen, [1]);
  assert.equal(r.sinClasificar.length, 0);
  assert.ok([...r.ventas, ...r.compras].every((x) => x.ok));
  assert.deepEqual(r.ventas.map((x) => x.factura.tipo), ['CF', 'CF', 'CF']);
  assert.equal(r.compras[0].factura.tipo, 'COMPRA');
});

test('mixto: no depende del orden de las páginas', async () => {
  const buffer = await unir([['semanas/01 - Compras de la semana 1.pdf', [0]], ['puma-sin-errores.pdf', [1]], ['semanas/01 - Compras de la semana 1.pdf', [1]], ['puma-sin-errores.pdf', [47]]]);
  const r = await leerMixto(buffer);
  assert.deepEqual([r.ventas.length, r.compras.length], [2, 2]);
  assert.deepEqual(r.ventas.map((x) => x.factura.tipo), ['CF', 'CCF']);
});

test('mixto: clasifica por el contenido de la página', async () => {
  const paginas = await leerPaginas(await unir([['puma-sin-errores.pdf', [1]], ['semanas/01 - Compras de la semana 1.pdf', [0]]]));
  assert.deepEqual(paginas.map((p) => clasificarPagina(p)), ['venta', 'compra']);
});

test('mixto: una página que no es factura queda sin clasificar y se explica', async () => {
  const r = await leerMixto(await paginaConTexto('Hola, esto no es una factura'));
  assert.equal(r.sinClasificar.length, 1);
  assert.match(r.sinClasificar[0].motivo, /no reconoce el formato/);
});

test('mixto: con IA, una página de formato desconocido se clasifica y se lee', async () => {
  const VENTA = {
    tipo: 'CF', titulo: 'FACTURA', correlativo: 9, numeroDocumento: '1', fecha: '2026-08-03', condicionPago: '',
    emisor: { nombre: 'X', nit: '1', nrc: '2', direccion: '', dui: '' }, cliente: { nombre: 'Y', nitDui: '', nrc: '', direccion: '', giro: '' },
    lineas: [{ descripcion: 'Producto', cantidad: 1, precioUnitario: 10, descuento: 0, base: 10, iva: 1.3, total: 11.3 }],
    subtotal: 11.3, iva: null, percepcion: null, descuentos: 0, total: 11.3, observaciones: '', rotuloPercepcion: null,
  };
  const gemini = simularGemini({ clase: 'venta', venta: VENTA, compra: null });
  try {
    const r = await leerMixto(await paginaConTexto('Otro formato de factura'), { respaldoIA: true });
    assert.equal(gemini.estado.llamadas, 1);
    assert.equal(r.ventas.length, 1);
    assert.equal(r.ventas[0].lectura.origen, 'ia');
    assert.equal(r.sinClasificar.length, 0);
  } finally {
    gemini.restaurar();
  }
});

test('mixto: con IA, una página que no es factura se rechaza con el motivo', async () => {
  const gemini = simularGemini({ clase: 'otro', venta: null, compra: null });
  try {
    const r = await leerMixto(await paginaConTexto('Recibo de luz'), { respaldoIA: true });
    assert.equal(r.ventas.length + r.compras.length, 0);
    assert.match(r.sinClasificar[0].motivo, /no es una factura de venta ni de compra/);
  } finally {
    gemini.restaurar();
  }
});

async function excelInventario({ conCabecera = true } = {}) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Inventario');
  hoja.addRow(['INVENTARIO DE ZAPATOS PUMA']);
  hoja.addRow([]);
  if (conCabecera) hoja.addRow(['N.°', 'Código', 'Modelo de zapato Puma', 'Color', 'Talla', 'Existencia', 'Precio unitario', 'Total por modelo']);
  hoja.addRow([1, 'PM-001', 'Smash V2', 'Blanco', 40, 30, 55, { formula: 'F4*G4', result: 1650 }]);
  hoja.addRow([2, 'PM-002', 'Suede Classic', 'Negro', 41, 32, 65, 2080]);
  hoja.addRow([]);
  hoja.addRow(['SUBTOTAL', null, null, null, null, null, null, 3730]);
  hoja.addRow(['IVA (13%)', null, null, null, null, null, null, 484.9]);
  hoja.addRow(['TOTAL', null, null, null, null, null, null, 4214.9]);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

test('inventario en Excel: lee la tabla y los totales sin usar IA', async () => {
  const r = await leerInventarioExcel(await excelInventario());
  assert.equal(r.titulo, 'INVENTARIO DE ZAPATOS PUMA');
  assert.deepEqual(r.filas.map((f) => [f.codigo, f.modelo, f.color, f.talla, f.existencia, f.precioUnitario, f.totalModelo]), [
    ['PM-001', 'Smash V2', 'Blanco', 40, 30, 55, 1650],
    ['PM-002', 'Suede Classic', 'Negro', 41, 32, 65, 2080],
  ]);
  assert.deepEqual([r.subtotal, r.iva, r.total], [3730, 484.9, 4214.9]);
});

test('inventario en Excel: si no hay una tabla de inventario, avisa qué columnas faltan', async () => {
  await assert.rejects(leerInventarioExcel(await excelInventario({ conCabecera: false })), /columnas de producto.*existencia.*precio unitario/);
});

test('inventario aparte: una imagen se lee con IA y un Excel se lee directo', async () => {
  const gemini = simularGemini({ titulo: 'INVENTARIO', filas: [{ numero: 1, codigo: 'X-1', modelo: 'M', color: 'C', talla: 40, existencia: 5, precioUnitario: 10, totalModelo: 50 }], subtotal: 50, iva: 6.5, total: 56.5 });
  try {
    const imagen = await leerInventarioArchivo({ buffer: Buffer.from('png'), mime: 'image/png' });
    assert.equal(imagen.filas[0].codigo, 'X-1');
    assert.equal(gemini.estado.llamadas, 1);
    const excel = await leerInventarioArchivo({ buffer: await excelInventario(), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    assert.equal(excel.filas.length, 2);
    assert.equal(gemini.estado.llamadas, 1);
  } finally {
    gemini.restaurar();
  }
});

test('empresa equivocada: facturas con otro NRC de emisor generan un solo error claro', async () => {
  const ventas = await leerFacturas(fixture('puma-sin-errores.pdf'));
  const igual = revisarLote(ventas, { empresa: { nrc: '904036-1', nit: '' } });
  assert.equal(igual.hallazgos.filter((h) => h.codigo === 'EMPRESA').length, 0);
  const distinta = revisarLote(ventas, { empresa: { nrc: '258437-1', nit: '' } });
  const errores = distinta.hallazgos.filter((h) => h.codigo === 'EMPRESA');
  assert.equal(errores.length, 1);
  assert.match(errores[0].detalle, /904036-1.*258437-1/);
});

test('inventario de otro tipo de producto: se lee el formato de Villa Lactea (marca, descripción, cantidad y precio)', async () => {
  const r = await leerInventarioExcel(fixture('villa-lactea.xlsx'));
  assert.equal(r.filas.length, 19);
  assert.deepEqual(
    [r.filas[0].codigo, r.filas[0].marca, r.filas[0].modelo, r.filas[0].existencia, r.filas[0].precioUnitario],
    ['P-001', 'Dos Pinos', 'Leche entera, 1 L', 99, 13.2]
  );
  assert.equal(r.filas[0].color, null);
  assert.equal(r.filas[0].talla, null);
  assert.equal(r.subtotal, null);
});

test('inventario de otro tipo de producto: las descripciones de las facturas se asocian por marca y descripción', async () => {
  const { catalogoDeInventario } = await import('../src/services/inventario/catalogoBase.js');
  const { resolverProductos } = await import('../src/services/inventario/productos.js');
  const inventario = await leerInventarioExcel(fixture('villa-lactea.xlsx'));
  const catalogo = catalogoDeInventario(inventario);
  const doc = (descripcion) => ({ factura: { tipo: 'CF', correlativo: 1, pagina: 1, fecha: '2026-08-03', lineas: [{ n: 1, descripcion, cantidad: 1, precioUnitario: 1 }] } });
  const { resueltas, sinIdentificar } = resolverProductos(
    [doc('Leche entera 1 L Dos Pinos'), doc('Leche entera, 1 L Salud'), doc('Leche entera 1 L Sula'), doc('Leche entra 1 L Dos Pinos'), doc('Yogur de fresa, 1 L Yoplait')],
    catalogo
  );
  const nombres = (clave) => catalogo.find((p) => p.clave === clave).nombre;
  assert.deepEqual(resueltas.map((x) => nombres(x.clave)), ['Dos Pinos Leche entera, 1 L', 'Salud Leche entera, 1 L', 'Sula Leche entera, 1 L', 'Dos Pinos Leche entera, 1 L', 'Yoplait Yogur de fresa, 1 L']);
  assert.equal(sinIdentificar.length, 0);
});

test('inventario de otro tipo de producto: una descripción que no está en el inventario se rechaza con motivo', async () => {
  const { catalogoDeInventario } = await import('../src/services/inventario/catalogoBase.js');
  const { resolverProductos } = await import('../src/services/inventario/productos.js');
  const catalogo = catalogoDeInventario(await leerInventarioExcel(fixture('villa-lactea.xlsx')));
  const doc = { factura: { tipo: 'CF', correlativo: 1, pagina: 1, fecha: '2026-08-03', lineas: [{ n: 1, descripcion: 'Agua purificada 500 ml', cantidad: 1, precioUnitario: 1 }] } };
  const { sinIdentificar } = resolverProductos([doc], catalogo);
  assert.match(sinIdentificar[0].sugerencia.razon, /no está en el inventario inicial/);
});
