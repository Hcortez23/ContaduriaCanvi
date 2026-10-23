import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';

process.env.GEMINI_API_KEY = 'clave-de-prueba';
const { leerFacturas } = await import('../src/services/parsers/index.js');
const { aprenderReceta, recetaValida } = await import('../src/services/parsers/recetas/aprender.js');
const { leerPaginas } = await import('../src/services/parsers/pdfText.js');

async function pdfNuevoFormato(correlativos) {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (const n of correlativos) {
    const pagina = doc.addPage([600, 800]);
    const texto = (s, x, y) => pagina.drawText(s, { x, y, size: 10, font: fuente });
    texto('FACTURA CONSUMIDOR FINAL', 200, 780);
    texto('Comercial Xyz', 10, 760);
    texto('NIT:', 150, 760);
    texto('0614-111111-101-1', 180, 760);
    texto('NRC:', 150, 748);
    texto('99999-9', 180, 748);
    texto('Documento No.', 400, 760);
    texto(`0-${n}`, 480, 760);
    texto('05/09/2026', 480, 745);
    texto('Cliente: Pedro Perez', 50, 700);
    texto('Cant', 50, 650);
    texto('Detalle', 120, 650);
    texto('P.Unit', 300, 650);
    texto('Importe', 400, 650);
    texto('2', 50, 630);
    texto('Caja de botella 600 ml Alpina', 120, 630);
    texto('$5.00', 310, 630);
    texto('$10.00', 410, 630);
    texto('Total', 350, 500);
    texto('$10.00', 410, 500);
  }
  return Buffer.from(await doc.save());
}

const AUSENTE = { etiqueta: '', lugar: 'cualquiera', patron: '(?!)', zona: 'todo' };
const respuestaIA = (correlativo) => ({
  clase: 'venta',
  lectura: { tipo: 'CF', numeroDocumento: `0-${correlativo}`, fecha: '2026-09-05', total: 10, lineas: [{ cantidad: 2, precioUnitario: 5 }] },
  receta: {
    reconoce: ['^P\\.Unit$', '^Importe$', '^Documento No\\.$'],
    tituloPatron: 'factura consumidor final|credito fiscal',
    ccfPatron: 'credito fiscal',
    precioConIvaEnCF: true,
    etiquetaNumero: 'Documento No.',
    correlativoPatron: '^\\d+-(\\d+)',
    zonaClienteInicio: '^Cliente:',
    tablaInicio: '^Cant$',
    tablaPrecio: '^P\\.Unit$',
    tablaTotal: '^Importe$',
    tablaFin: '^Total$',
    campos: {
      numero: { etiqueta: '^Documento No\\.$', lugar: 'derecha', patron: '', zona: 'encabezado' },
      fecha: { etiqueta: '', lugar: 'cualquiera', patron: '^\\d{2}/\\d{2}/\\d{4}$', zona: 'todo' },
      emisorNombre: { etiqueta: '^NIT:$', lugar: 'inicioFila', patron: '', zona: 'encabezado' },
      emisorNit: { etiqueta: '^NIT:$', lugar: 'derecha', patron: '', zona: 'encabezado' },
      emisorNrc: { etiqueta: '^NRC:$', lugar: 'derecha', patron: '', zona: 'encabezado' },
      emisorDireccion: AUSENTE,
      clienteNombre: { etiqueta: '^Cliente:', lugar: 'mismo', patron: '^Cliente:\\s*(.*)', zona: 'cliente' },
      clienteNit: AUSENTE,
      clienteNrc: AUSENTE,
      clienteDireccion: AUSENTE,
      clienteCiudad: AUSENTE,
      condicionPago: AUSENTE,
    },
    totales: { subtotal: '(?!)', iva: '(?!)', percepcion: '(?!)', total: '^Total$' },
  },
});

function simularIA(datos) {
  const original = globalThis.fetch;
  const estado = { llamadas: 0 };
  globalThis.fetch = async () => {
    estado.llamadas++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(datos) }] } }] }) };
  };
  return { estado, restaurar: () => (globalThis.fetch = original) };
}

test('aprendizaje: una sola consulta a la IA enseña el formato y las demás páginas se leen sin IA', async () => {
  const ia = simularIA(respuestaIA(77));
  try {
    const aprendidas = [];
    const buffer = await pdfNuevoFormato([77, 78, 79, 80]);
    const r = await leerFacturas(buffer, 'generico', { respaldoIA: true, alAprender: async (receta) => aprendidas.push(receta) });
    assert.equal(ia.estado.llamadas, 1);
    assert.equal(aprendidas.length, 1);
    assert.deepEqual(r.map((x) => x.factura.correlativo), [77, 78, 79, 80]);
    assert.ok(r.every((x) => x.ok));
    const primera = r[0].factura;
    assert.deepEqual([primera.tipo, primera.fecha, primera.cliente.nombre, primera.emisor.nit, primera.emisor.nombre, primera.total], ['CF', '2026-09-05', 'Pedro Perez', '0614-111111-101-1', 'Comercial Xyz', 10]);
    assert.deepEqual(primera.lineas.map((l) => [l.cantidad, l.descripcion, l.precioUnitario, l.total]), [[2, 'Caja de botella 600 ml Alpina', 5, 10]]);

    const otraVez = await leerFacturas(buffer, 'generico', { respaldoIA: true, recetas: aprendidas, alAprender: async () => assert.fail('no debe volver a aprender') });
    assert.equal(ia.estado.llamadas, 1);
    assert.ok(otraVez.every((x) => x.ok));
  } finally {
    ia.restaurar();
  }
});

test('aprendizaje: una receta que no reproduce lo que la IA leyó se descarta', async () => {
  const ia = simularIA(respuestaIA(999));
  try {
    const buffer = await pdfNuevoFormato([77]);
    const [pagina] = await leerPaginas(buffer);
    assert.equal(await aprenderReceta(buffer, pagina), null);
  } finally {
    ia.restaurar();
  }
});

test('aprendizaje: una receta con una expresión inválida no es válida', () => {
  const receta = JSON.parse(JSON.stringify({ reconoce: ['a', 'b'], tipo: { titulo: 'x', ccf: 'y' }, correlativoPatron: '(', zonas: { cliente: 'c', tabla: 't' }, campos: { numero: { etiqueta: 'n', lugar: 'derecha', zona: 'todo' } }, tabla: {}, totales: {} }));
  assert.equal(recetaValida(receta), false);
});
