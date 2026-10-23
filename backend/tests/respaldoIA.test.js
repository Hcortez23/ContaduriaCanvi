import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';

process.env.GEMINI_API_KEY = 'clave-de-prueba';
const { leerFacturas, leerCompras } = await import('../src/services/parsers/index.js');
const { revisarLote } = await import('../src/services/rules/index.js');

const fixture = (nombre) => fs.readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url));

async function pdfConPaginas(nombre, indices) {
  const origen = await PDFDocument.load(fixture(nombre));
  const copia = await PDFDocument.create();
  (await copia.copyPages(origen, indices)).forEach((p) => copia.addPage(p));
  return Buffer.from(await copia.save());
}

async function paginasRaras(cantidad) {
  const pdf = await PDFDocument.create();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < cantidad; i++) pdf.addPage().drawText(`Comprobante de formato raro ${i + 1}`, { x: 50, y: 700, size: 12, font: fuente });
  return Buffer.from(await pdf.save());
}

const VENTA = {
  tipo: 'CF',
  titulo: 'FACTURA DE CONSUMIDOR FINAL',
  correlativo: 7,
  numeroDocumento: '555',
  fecha: '2026-08-03',
  condicionPago: 'al contado',
  emisor: { nombre: 'Otra Empresa', nit: '1', nrc: '2', direccion: 'x', dui: '' },
  cliente: { nombre: 'Cliente Uno', nitDui: '', nrc: '', direccion: 'y', giro: '' },
  lineas: [{ descripcion: 'Producto', cantidad: 2, precioUnitario: 50, descuento: 0, base: 100, iva: 13, total: 113 }],
  subtotal: 113,
  iva: null,
  percepcion: null,
  descuentos: 0,
  total: 113,
  observaciones: '',
  rotuloPercepcion: null,
};

const COMPRA = {
  tipoDocumento: 'Crédito Fiscal',
  numeroFactura: '321',
  fecha: '2026-08-04',
  proveedor: { nombre: 'Proveedor SA', direccion: 'a', ciudad: 'b', telefono: 'c', giro: 'd' },
  facturarA: { nombre: 'Empresa', direccion: '', ciudad: '', telefono: '', nit: '1', nrc: '2' },
  lineas: [{ descripcion: 'Caja', cantidad: 10, precioUnitario: 2, total: 20 }],
  subtotal: 20,
  iva: 2.6,
  percepcion: null,
  otros: 0,
  total: 22.6,
  condicionPago: '',
};

function simularGemini(respuesta) {
  const original = globalThis.fetch;
  const estado = { llamadas: 0 };
  globalThis.fetch = async () => {
    estado.llamadas++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(respuesta) }] } }] }) };
  };
  return { estado, restaurar: () => (globalThis.fetch = original) };
}


function simularLote(documento) {
  const original = globalThis.fetch;
  const estado = { llamadas: 0, paginasPorLlamada: [] };
  globalThis.fetch = async (url, opciones) => {
    estado.llamadas++;
    const cuerpo = JSON.parse(opciones.body);
    const n = Number(cuerpo.contents[0].parts[0].text.match(/tiene (\d+) páginas/)[1]);
    estado.paginasPorLlamada.push(n);
    const documentos = Array.from({ length: n }, (_, i) => ({ pagina: i + 1, ...documento }));
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ documentos }) }] } }] }) };
  };
  return { estado, restaurar: () => (globalThis.fetch = original) };
}

test('respaldo IA: una página que el lector normal no entiende se lee con IA y queda marcada', async () => {
  const gemini = simularLote(VENTA);
  try {
    const r = await leerFacturas(await paginasRaras(2), 'generico', { respaldoIA: true });
    assert.equal(gemini.estado.llamadas, 1);
    assert.deepEqual(gemini.estado.paginasPorLlamada, [2]);
    assert.ok(r.every((x) => x.ok && x.lectura.origen === 'ia'));
    assert.equal(r[0].factura.correlativo, 7);
    assert.equal(r[0].factura.lineas[0].n, 1);
    assert.equal(r[0].lectura.tipoDocumento, 'Consumidor final');
  } finally {
    gemini.restaurar();
  }
});

test('respaldo IA: sin activarlo, esas páginas quedan como no legibles y no se llama a la IA', async () => {
  const gemini = simularGemini(VENTA);
  try {
    const r = await leerFacturas(await paginasRaras(2));
    assert.equal(gemini.estado.llamadas, 0);
    assert.ok(r.every((x) => !x.ok));
  } finally {
    gemini.restaurar();
  }
});

test('respaldo IA: las páginas que el lector normal sí entiende no gastan IA', async () => {
  const gemini = simularGemini(VENTA);
  try {
    const r = await leerFacturas(await pdfConPaginas('puma-original.pdf', [1, 2, 3]), 'generico', { respaldoIA: true });
    assert.equal(gemini.estado.llamadas, 0);
    assert.ok(r.every((x) => x.ok && x.lectura.origen === undefined));
  } finally {
    gemini.restaurar();
  }
});

test('respaldo IA: un documento leído por IA genera una advertencia para verificarlo', async () => {
  const gemini = simularLote(VENTA);
  try {
    const r = await leerFacturas(await paginasRaras(1), 'generico', { respaldoIA: true });
    const { hallazgos } = revisarLote(r);
    const aviso = hallazgos.find((h) => h.codigo === 'LECTURA IA');
    assert.equal(aviso.gravedad, 'ADVERTENCIA');
  } finally {
    gemini.restaurar();
  }
});

test('respaldo IA: si la IA falla, la página sigue como no legible y se informa el motivo', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'petición inválida' } }) });
  try {
    const r = await leerFacturas(await paginasRaras(1), 'generico', { respaldoIA: true });
    assert.equal(r[0].ok, false);
    assert.match(r[0].lectura.errorIA, /400.*petición inválida/);
  } finally {
    globalThis.fetch = original;
  }
});

test('respaldo IA: facturas de compra de otro formato también se leen con IA', async () => {
  const gemini = simularLote(COMPRA);
  try {
    const r = await leerCompras(await paginasRaras(2), { respaldoIA: true });
    assert.equal(gemini.estado.llamadas, 1);
    assert.ok(r.every((x) => x.ok && x.lectura.origen === 'ia'));
    assert.equal(r[0].factura.numeroFactura, '321');
    assert.equal(r[0].factura.correlativo, 321);
    assert.equal(r[0].factura.tipo, 'COMPRA');
  } finally {
    gemini.restaurar();
  }
});

test('respaldo IA: demasiadas páginas ilegibles se rechazan antes de gastar IA', async () => {
  const gemini = simularGemini(VENTA);
  try {
    await assert.rejects(leerCompras(await paginasRaras(101), { respaldoIA: true }), /máximo para leerlas con IA es 100/);
    assert.equal(gemini.estado.llamadas, 0);
  } finally {
    gemini.restaurar();
  }
});

test('tipo equivocado: unas compras subidas como ventas se rechazan sin gastar IA', async () => {
  const gemini = simularGemini(VENTA);
  try {
    const r = await leerFacturas(fixture('compras.pdf'), 'generico', { respaldoIA: true });
    assert.equal(gemini.estado.llamadas, 0);
    assert.equal(r.length, 8);
    assert.ok(r.every((x) => !x.ok));
    assert.match(r[0].lectura.errorIA, /parece una factura de compra.*"Facturas de compra".*"Todo en un solo archivo"/);
  } finally {
    gemini.restaurar();
  }
});

test('tipo equivocado: unas ventas subidas como compras se rechazan sin gastar IA', async () => {
  const gemini = simularGemini(COMPRA);
  try {
    const r = await leerCompras(await pdfConPaginas('puma-original.pdf', [1, 2]), { respaldoIA: true });
    assert.equal(gemini.estado.llamadas, 0);
    assert.ok(r.every((x) => !x.ok));
    assert.match(r[0].lectura.errorIA, /parece una factura de venta.*"Facturas de venta"/);
  } finally {
    gemini.restaurar();
  }
});

test('respaldo IA: un archivo de 20 páginas desconocidas se lee en 3 solicitudes, no en 20', async () => {
  const gemini = simularLote(VENTA);
  try {
    const r = await leerFacturas(await paginasRaras(20), 'generico', { respaldoIA: true });
    assert.equal(r.length, 20);
    assert.ok(r.every((x) => x.ok && x.lectura.origen === 'ia'));
    assert.equal(gemini.estado.llamadas, 3);
    assert.deepEqual([...gemini.estado.paginasPorLlamada].sort(), [4, 8, 8]);
    assert.deepEqual(r.map((x) => x.pagina), Array.from({ length: 20 }, (_, i) => i + 1));
  } finally {
    gemini.restaurar();
  }
});

test('respaldo IA: si la IA omite una página del lote, esa página queda como no legible', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ documentos: [{ pagina: 1, ...VENTA }] }) }] } }] }) });
  try {
    const r = await leerFacturas(await paginasRaras(2), 'generico', { respaldoIA: true });
    assert.equal(r[0].ok, true);
    assert.equal(r[1].ok, false);
    assert.match(r[1].lectura.errorIA, /no devolvió esta página/);
  } finally {
    globalThis.fetch = original;
  }
});
