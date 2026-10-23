import { extraerJson } from '../ai/gemini.js';
import { extraerPaginas } from './paginas.js';

const TEXTO = { type: 'STRING', nullable: true };
const NUMERO = { type: 'NUMBER', nullable: true };

const INSTRUCCIONES_VENTA = `La página es una factura de venta de El Salvador, de consumidor final o de crédito fiscal.
Transcribe exactamente lo que se ve, sin corregir errores de ortografía ni recalcular montos.
tipo es "CF" si es consumidor final y "CCF" si es crédito fiscal. fecha va en formato AAAA-MM-DD.
Los montos van como números sin símbolo ni separador de miles. Si un dato no aparece, devuelve null.
rotuloPercepcion es el texto exacto de la línea del 1% si existe.`;

const INSTRUCCIONES_COMPRA = `La página es una factura de compra (crédito fiscal) emitida por un proveedor.
Transcribe exactamente lo que se ve, sin corregir errores de ortografía ni recalcular montos.
fecha va en formato AAAA-MM-DD. Los montos van como números sin símbolo ni separador de miles. Si un dato no aparece, devuelve null.`;

const ESQUEMA_VENTA = {
  type: 'OBJECT',
  properties: {
    tipo: { type: 'STRING', enum: ['CF', 'CCF'] },
    titulo: TEXTO,
    correlativo: NUMERO,
    numeroDocumento: TEXTO,
    fecha: TEXTO,
    condicionPago: TEXTO,
    emisor: { type: 'OBJECT', properties: { nombre: TEXTO, nit: TEXTO, nrc: TEXTO, direccion: TEXTO, dui: TEXTO } },
    cliente: { type: 'OBJECT', properties: { nombre: TEXTO, nitDui: TEXTO, nrc: TEXTO, direccion: TEXTO, giro: TEXTO } },
    lineas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { descripcion: TEXTO, cantidad: NUMERO, precioUnitario: NUMERO, descuento: NUMERO, base: NUMERO, iva: NUMERO, total: NUMERO },
        required: ['descripcion', 'cantidad', 'precioUnitario'],
      },
    },
    subtotal: NUMERO,
    iva: NUMERO,
    percepcion: NUMERO,
    descuentos: NUMERO,
    total: NUMERO,
    observaciones: TEXTO,
    rotuloPercepcion: TEXTO,
  },
  required: ['tipo', 'lineas', 'total'],
};

const ESQUEMA_COMPRA = {
  type: 'OBJECT',
  properties: {
    tipoDocumento: TEXTO,
    numeroFactura: TEXTO,
    fecha: TEXTO,
    proveedor: { type: 'OBJECT', properties: { nombre: TEXTO, direccion: TEXTO, ciudad: TEXTO, telefono: TEXTO, giro: TEXTO } },
    facturarA: { type: 'OBJECT', properties: { nombre: TEXTO, direccion: TEXTO, ciudad: TEXTO, telefono: TEXTO, nit: TEXTO, nrc: TEXTO } },
    lineas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { descripcion: TEXTO, cantidad: NUMERO, precioUnitario: NUMERO, total: NUMERO },
        required: ['descripcion', 'cantidad', 'precioUnitario', 'total'],
      },
    },
    subtotal: NUMERO,
    iva: NUMERO,
    percepcion: NUMERO,
    otros: NUMERO,
    total: NUMERO,
    condicionPago: TEXTO,
  },
  required: ['numeroFactura', 'lineas', 'total'],
};

const texto = (v) => v ?? '';

function faltantesDe(factura, extra) {
  const f = [];
  if (!factura.fecha) f.push('fecha');
  if (factura.total === null || factura.total === undefined) f.push('total');
  if (!factura.lineas.length) f.push('lineas');
  return [...f, ...extra.filter(Boolean)];
}

export async function leerVentaConIA(buffer, numeroPagina) {
  const pdf = await extraerPaginas(buffer, [numeroPagina]);
  const d = await extraerJson({ instrucciones: INSTRUCCIONES_VENTA, archivo: pdf, mime: 'application/pdf', esquema: ESQUEMA_VENTA });
  return mapearVenta(d, numeroPagina);
}

export function mapearVenta(d, numeroPagina) {
  const factura = {
    tipo: d.tipo,
    correlativo: d.correlativo ?? null,
    numeroDocumento: texto(d.numeroDocumento),
    fecha: d.fecha || null,
    condicionPago: texto(d.condicionPago),
    emisor: {
      nombre: texto(d.emisor?.nombre),
      nit: texto(d.emisor?.nit),
      nrc: texto(d.emisor?.nrc),
      direccion: texto(d.emisor?.direccion),
      dui: texto(d.emisor?.dui),
    },
    cliente: {
      nombre: texto(d.cliente?.nombre),
      nitDui: texto(d.cliente?.nitDui),
      nrc: texto(d.cliente?.nrc),
      direccion: texto(d.cliente?.direccion),
      giro: texto(d.cliente?.giro),
    },
    lineas: (d.lineas || []).map((l, i) => ({
      n: i + 1,
      descripcion: texto(l.descripcion),
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      descuento: l.descuento ?? 0,
      base: l.base ?? null,
      iva: l.iva ?? null,
      total: l.total ?? null,
    })),
    subtotal: d.subtotal ?? null,
    iva: d.iva ?? null,
    percepcion: d.percepcion ?? null,
    descuentos: d.descuentos ?? 0,
    total: d.total ?? null,
    observaciones: texto(d.observaciones),
    pagina: numeroPagina,
  };
  const rotulos = d.rotuloPercepcion ? { percepcion: d.rotuloPercepcion } : {};
  const faltantes = faltantesDe(factura, [factura.correlativo === null && 'correlativo']);
  return {
    pagina: numeroPagina,
    ok: faltantes.length === 0,
    factura,
    lectura: {
      titulo: texto(d.titulo),
      tipoDocumento: d.tipo === 'CCF' ? 'Crédito fiscal' : 'Consumidor final',
      rotulos,
      avisos: [],
      faltantes,
      origen: 'ia',
    },
  };
}

export async function leerCompraConIA(buffer, numeroPagina) {
  const pdf = await extraerPaginas(buffer, [numeroPagina]);
  const d = await extraerJson({ instrucciones: INSTRUCCIONES_COMPRA, archivo: pdf, mime: 'application/pdf', esquema: ESQUEMA_COMPRA });
  return mapearCompra(d, numeroPagina);
}

export function mapearCompra(d, numeroPagina) {
  const factura = {
    tipo: 'COMPRA',
    tipoDocumento: texto(d.tipoDocumento),
    numeroFactura: texto(d.numeroFactura),
    correlativo: Number(d.numeroFactura) || null,
    fecha: d.fecha || null,
    proveedor: {
      nombre: texto(d.proveedor?.nombre),
      direccion: texto(d.proveedor?.direccion),
      ciudad: texto(d.proveedor?.ciudad),
      telefono: texto(d.proveedor?.telefono),
      giro: texto(d.proveedor?.giro),
    },
    facturarA: {
      nombre: texto(d.facturarA?.nombre),
      direccion: texto(d.facturarA?.direccion),
      ciudad: texto(d.facturarA?.ciudad),
      telefono: texto(d.facturarA?.telefono),
      nit: texto(d.facturarA?.nit),
      nrc: texto(d.facturarA?.nrc),
    },
    lineas: (d.lineas || []).map((l, i) => ({
      n: i + 1,
      descripcion: texto(l.descripcion),
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      descuento: 0,
      base: null,
      iva: null,
      total: l.total,
    })),
    subtotal: d.subtotal ?? null,
    iva: d.iva ?? null,
    percepcion: d.percepcion ?? null,
    otros: d.otros ?? 0,
    total: d.total ?? null,
    condicionPago: texto(d.condicionPago),
    pagina: numeroPagina,
  };
  const faltantes = faltantesDe(factura, [!factura.numeroFactura && 'numeroFactura', !factura.proveedor.nombre && 'proveedor']);
  return { pagina: numeroPagina, ok: faltantes.length === 0, factura, lectura: { avisos: [], faltantes, rotulos: {}, origen: 'ia' } };
}

const INSTRUCCIONES_DESCONOCIDA = `La página es parte de un lote de documentos contables de El Salvador.
Primero clasifícala en "clase": "venta" si es una factura de venta (consumidor final o crédito fiscal emitida por la empresa), "compra" si es una factura de compra recibida de un proveedor, o "otro" si no es ninguna de las dos.
Si es "venta", llena el objeto "venta"; si es "compra", llena el objeto "compra"; el que no corresponde déjalo en null.
Transcribe exactamente lo que se ve, sin corregir errores de ortografía ni recalcular montos. Las fechas van en formato AAAA-MM-DD y los montos como números.`;

const ESQUEMA_DESCONOCIDA = {
  type: 'OBJECT',
  properties: {
    clase: { type: 'STRING', enum: ['venta', 'compra', 'otro'] },
    venta: { ...ESQUEMA_VENTA, nullable: true },
    compra: { ...ESQUEMA_COMPRA, nullable: true },
  },
  required: ['clase'],
};

export async function leerPaginaConIA(buffer, numeroPagina) {
  const pdf = await extraerPaginas(buffer, [numeroPagina]);
  const d = await extraerJson({ instrucciones: INSTRUCCIONES_DESCONOCIDA, archivo: pdf, mime: 'application/pdf', esquema: ESQUEMA_DESCONOCIDA });
  if (d.clase === 'venta' && d.venta) return { clase: 'venta', resultado: mapearVenta(d.venta, numeroPagina) };
  if (d.clase === 'compra' && d.compra) return { clase: 'compra', resultado: mapearCompra(d.compra, numeroPagina) };
  return { clase: 'otro', resultado: null };
}

export const TAMANO_LOTE = 8;

export async function leerLoteConIA(buffer, numeros, clase) {
  const pdf = await extraerPaginas(buffer, numeros);
  const esquemaDoc = clase === 'venta' ? ESQUEMA_VENTA : ESQUEMA_COMPRA;
  const esquema = {
    type: 'OBJECT',
    properties: {
      documentos: {
        type: 'ARRAY',
        items: { type: 'OBJECT', properties: { pagina: { type: 'INTEGER' }, ...esquemaDoc.properties }, required: ['pagina', ...esquemaDoc.required] },
      },
    },
    required: ['documentos'],
  };
  const base = clase === 'venta' ? INSTRUCCIONES_VENTA : INSTRUCCIONES_COMPRA;
  const instrucciones = `${base}
El PDF tiene ${numeros.length} páginas y cada página es un documento distinto. Devuelve en "documentos" un elemento por página, con "pagina" igual al número de página dentro de este PDF (empezando en 1).`;
  const d = await extraerJson({ instrucciones, archivo: pdf, mime: 'application/pdf', esquema });
  const porPagina = new Map((d.documentos || []).map((x) => [x.pagina, x]));
  return numeros.map((numero, i) => {
    const documento = porPagina.get(i + 1);
    if (!documento) return null;
    return clase === 'venta' ? mapearVenta(documento, numero) : mapearCompra(documento, numero);
  });
}
