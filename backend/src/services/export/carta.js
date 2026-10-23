import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType } from 'docx';

const FUENTE = 'Arial';
const TIPOS = { CF: 'Consumidor final', CCF: 'Crédito fiscal', COMPRA: 'Compra', INVENTARIO: 'Inventario inicial', TODAS: 'General' };
const ORIGENES = [
  ['emitidas', 'Facturas emitidas'],
  ['inventario', 'Inventario inicial'],
  ['compras', 'Facturas de compra recibidas de proveedores'],
];

const origenDe = (h) => (h.tipo === 'INVENTARIO' ? 'inventario' : h.tipo === 'COMPRA' ? 'compras' : 'emitidas');

const texto = (t, opciones = {}) => new TextRun({ text: t, font: FUENTE, size: 22, ...opciones });
const parrafo = (hijos, opciones = {}) => new Paragraph({ children: Array.isArray(hijos) ? hijos : [texto(hijos)], spacing: { after: 160 }, ...opciones });

const etiquetaDocumento = (h) => `${TIPOS[h.tipo] || h.tipo}${h.correlativo !== null ? ` ${h.correlativo}` : ''}`;

function agrupar(hallazgos) {
  const grupos = new Map();
  for (const h of hallazgos) {
    const clave = `${h.codigo}|${h.correccion}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(h);
  }
  return [...grupos.values()];
}

const BORDE = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const BORDES = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };

const celda = (contenido, ancho, { negrita = false, relleno } = {}) =>
  new TableCell({
    width: { size: ancho, type: WidthType.PERCENTAGE },
    borders: BORDES,
    shading: relleno ? { type: ShadingType.CLEAR, fill: relleno, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [texto(contenido, { size: 20, bold: negrita })] })],
  });

function tabla(grupo, etiquetaDetalle) {
  const filas = [new TableRow({ tableHeader: true, children: [celda('Documento', 28, { negrita: true, relleno: 'EDEDED' }), celda(etiquetaDetalle, 72, { negrita: true, relleno: 'EDEDED' })] })];
  for (const h of grupo) filas.push(new TableRow({ cantSplit: true, children: [celda(etiquetaDocumento(h), 28), celda(h.detalle, 72)] }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: filas });
}

function bloque(titulo, hallazgos, etiquetaDetalle) {
  if (!hallazgos.length) return [];
  const filas = [parrafo([texto(titulo, { bold: true, size: 26 })], { spacing: { before: 320, after: 120 } })];
  for (const origen of ORIGENES) {
    const delOrigen = hallazgos.filter((h) => origenDe(h) === origen[0]);
    if (!delOrigen.length) continue;
    filas.push(parrafo([texto(origen[1], { bold: true, italics: true })], { spacing: { before: 160, after: 80 } }));
    for (const grupo of agrupar(delOrigen)) {
      const cuantos = grupo.length > 1 ? ` (${grupo.length} casos)` : '';
      filas.push(
        parrafo([texto(grupo[0].codigo, { bold: true }), texto(cuantos)], { spacing: { before: 160, after: 40 }, keepNext: true }),
        parrafo([texto('Cómo corregirlo: ', { bold: true }), texto(grupo[0].correccion)], { spacing: { after: 80 }, keepNext: true }),
        tabla(grupo, etiquetaDetalle),
        parrafo('', { spacing: { after: 60 } })
      );
    }
  }
  return filas;
}

export async function generarCarta({ empresa, hallazgos, fecha = new Date() }) {
  const errores = hallazgos.filter((h) => h.gravedad === 'ERROR');
  const observaciones = hallazgos.filter((h) => h.gravedad !== 'ERROR');
  const fechaTexto = fecha.toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' });

  const hijos = [
    parrafo([texto(fechaTexto)], { alignment: AlignmentType.RIGHT }),
    parrafo('Señores'),
    parrafo([texto(empresa.nombre.toUpperCase(), { bold: true })], { spacing: { after: 40 } }),
    parrafo(`NRC ${empresa.nrc}${empresa.nit ? ` · NIT ${empresa.nit}` : ''}`),
    new Paragraph({
      children: [texto('Asunto: errores encontrados en la revisión de sus facturas e inventario y forma de corregirlos.', { bold: true })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 6 } },
      spacing: { before: 200, after: 240 },
    }),
    parrafo('Estimados señores:'),
    parrafo('Al revisar sus documentos encontramos los puntos de abajo. Les pedimos corregirlos y entregarnos de nuevo los documentos; mientras existan errores no podemos generar el inventario ni el libro de la semana.'),
    parrafo([texto('Resumen: ', { bold: true }), texto(`${errores.length} errores${observaciones.length ? ` y ${observaciones.length} observaciones` : ''}.`)]),
    ...bloque('A. Errores que deben corregirse', errores, 'Qué pasó'),
    ...bloque('B. Observaciones (no detienen el proceso, pero deben corregirse)', observaciones, 'Qué pasó'),
    parrafo([texto('Criterios: ', { bold: true, size: 20 }), texto('numeración consecutiva y sin repetidos; en consumidor final el precio ya incluye el IVA de 13%; en crédito fiscal el IVA se calcula al final sobre la suma de las bases.', { size: 20 })], { spacing: { before: 320, after: 240 } }),
    parrafo('Quedamos atentos para resolver cualquier duda.'),
    parrafo('Atentamente,', { spacing: { after: 600 } }),
    parrafo([texto('[Nombre y firma del contador]', { bold: true })]),
  ];

  const documento = new Document({
    creator: 'Revisión de facturas e inventario',
    title: `Carta de correcciones - ${empresa.nombre}`,
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1304, right: 1304 } } }, children: hijos }],
  });
  return Packer.toBuffer(documento);
}
