import { extraerJson } from '../../ai/gemini.js';
import { extraerPaginas } from '../paginas.js';
import { LISTA_SIMPLE } from './incorporadas.js';
import { leerConReceta, reconoce, LUGARES, ZONAS } from './interprete.js';

const TEXTO = { type: 'STRING' };
const CAMPO = {
  type: 'OBJECT',
  properties: { etiqueta: TEXTO, lugar: { type: 'STRING', enum: LUGARES }, patron: TEXTO, zona: { type: 'STRING', enum: ZONAS } },
  required: ['etiqueta', 'lugar', 'patron', 'zona'],
};

const NOMBRES_CAMPOS = [
  'numero',
  'fecha',
  'emisorNombre',
  'emisorNit',
  'emisorNrc',
  'emisorDireccion',
  'clienteNombre',
  'clienteNit',
  'clienteNrc',
  'clienteDireccion',
  'clienteCiudad',
  'condicionPago',
];
const NOMBRES_TOTALES = ['subtotal', 'iva', 'percepcion', 'total'];

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    clase: { type: 'STRING', enum: ['venta', 'compra', 'otro'] },
    lectura: {
      type: 'OBJECT',
      properties: {
        tipo: { type: 'STRING', enum: ['CF', 'CCF'] },
        numeroDocumento: TEXTO,
        fecha: TEXTO,
        total: { type: 'NUMBER', nullable: true },
        lineas: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: { cantidad: { type: 'NUMBER' }, precioUnitario: { type: 'NUMBER' } }, required: ['cantidad', 'precioUnitario'] },
        },
      },
      required: ['tipo', 'numeroDocumento', 'fecha', 'lineas'],
    },
    receta: {
      type: 'OBJECT',
      properties: {
        reconoce: { type: 'ARRAY', items: TEXTO },
        tituloPatron: TEXTO,
        ccfPatron: TEXTO,
        precioConIvaEnCF: { type: 'BOOLEAN' },
        etiquetaNumero: TEXTO,
        correlativoPatron: TEXTO,
        zonaClienteInicio: TEXTO,
        tablaInicio: TEXTO,
        tablaPrecio: TEXTO,
        tablaTotal: TEXTO,
        tablaFin: TEXTO,
        campos: { type: 'OBJECT', properties: Object.fromEntries(NOMBRES_CAMPOS.map((n) => [n, CAMPO])), required: NOMBRES_CAMPOS },
        totales: { type: 'OBJECT', properties: Object.fromEntries(NOMBRES_TOTALES.map((n) => [n, TEXTO])), required: NOMBRES_TOTALES },
      },
      required: ['reconoce', 'tituloPatron', 'ccfPatron', 'precioConIvaEnCF', 'etiquetaNumero', 'correlativoPatron', 'zonaClienteInicio', 'tablaInicio', 'tablaPrecio', 'tablaTotal', 'tablaFin', 'campos', 'totales'],
    },
  },
  required: ['clase', 'lectura', 'receta'],
};

const INSTRUCCIONES = `Eres el módulo que aprende el formato de una factura de venta de El Salvador (consumidor final CF o crédito fiscal CCF) para que un lector automático la lea sin IA.
Recibes el texto de UNA página con la posición (x, y) de cada fragmento; y crece hacia arriba. También recibes la página como PDF.
Devuelve:
1. clase: "venta" si es una factura emitida por la empresa (CF o CCF), "compra" si es una factura de un proveedor, "otro" si no es factura.
2. lectura: lo que ves en la página (tipo, numeroDocumento exactamente como se imprime —por ejemplo 0-180-135 o 000-5-5—, fecha AAAA-MM-DD, total, y cantidad y precio unitario de cada línea de la tabla).
3. receta: instrucciones para que un programa lea cualquier página de este mismo formato.

Reglas de la receta (todos los patrones son expresiones regulares de JavaScript, sin barras ni banderas, sin mayúsculas/minúsculas; escapa con doble barra donde haga falta):
- reconoce: 2 a 4 patrones de rótulos fijos que aparezcan completos en un fragmento y que identifiquen este formato (por ejemplo "^Precio por unidad$"). No incluyas el título del documento porque cambia entre consumidor final y crédito fiscal; usa rótulos de la tabla y del encabezado que estén en todos los documentos.
- tituloPatron: fragmento del título del documento; ccfPatron: palabras que SOLO aparecen en el título de un crédito fiscal (ej. "cr[eé]dito fiscal"), sin anticipaciones ni negaciones; aunque esta página sea consumidor final, escribe el patrón del crédito fiscal.
- precioConIvaEnCF: true si en consumidor final el precio unitario ya incluye el IVA.
- etiquetaNumero: texto con el que se antepone el número de documento en observaciones (ej. "N° de factura").
- correlativoPatron: expresión con UN grupo de captura que extrae el correlativo del número de documento (ej. "^\\d+-(\\d+)" saca 180 de 0-180-135).
- zonaClienteInicio: fragmento donde empieza el bloque del cliente. tablaInicio: encabezado de la columna de cantidad. tablaPrecio y tablaTotal: encabezados de las columnas de precio unitario y total de línea. tablaFin: primer rótulo bajo la tabla (ej. "^Subtotal$"); si no existe, un rótulo del total.
- campos: para cada campo indica etiqueta (patrón del fragmento rótulo, "" si no hay), lugar donde está el valor respecto a la etiqueta:
  "mismo" = dentro del mismo fragmento (usa patron con UN grupo de captura para sacar el valor),
  "derecha" = fragmento a la derecha en la misma fila, "abajo" = fragmentos justo debajo,
  "cerca" = fragmento cercano que cumpla patron, "inicioFila" = primer fragmento de la fila de la etiqueta,
  "cualquiera" = el primer fragmento de la zona que cumpla patron (etiqueta vacía).
  patron: "" si se toma el fragmento completo. Usa grupos no capturantes (?:...) salvo el que extrae el valor.
  zona: "encabezado" = arriba de la fila del cliente (datos del emisor), "cliente" = entre el cliente y la tabla, "cuerpo" = debajo del encabezado de la tabla, "todo".
  Si un campo no existe en el formato, déjalo con etiqueta "", lugar "cualquiera", patron "(?!)" y zona "todo".
- totales: patrón del rótulo de subtotal, iva, percepcion (el 1%) y total; "(?!)" si no existe.
El campo numero debe extraer el número de documento COMPLETO tal como se imprime (ej. 0-180-135), sin grupos de captura; el correlativo se saca después con correlativoPatron. Los campos emisorNit, emisorNrc y clienteNit son solo el valor sin rótulo.
Un programa aplicará tu receta a esta misma página y comparará con tu lectura; si no coinciden, tu receta se descarta.
A continuación va un ejemplo de receta ya probada de otro formato (solo ilustra la estructura, no la copies):
`;

const longitudMaxima = 160;

function limpiar(receta) {
  const campos = {};
  for (const n of NOMBRES_CAMPOS) {
    const { etiqueta, lugar, patron, zona } = receta.campos[n];
    campos[n] = { ...(etiqueta ? { etiqueta } : {}), lugar, ...(patron ? { patron } : {}), zona };
  }
  return {
    nombre: 'aprendida',
    reconoce: receta.reconoce,
    tipo: { titulo: `(?:${receta.tituloPatron})|consumidor final|cr[eé]dito fiscal`, ccf: LISTA_SIMPLE.tipo.ccf },
    precioConIvaEnCF: Boolean(receta.precioConIvaEnCF),
    etiquetaNumero: receta.etiquetaNumero,
    correlativoPatron: receta.correlativoPatron,
    zonas: { cliente: receta.zonaClienteInicio, tabla: receta.tablaInicio },
    campos,
    tabla: { inicio: receta.tablaInicio, precio: receta.tablaPrecio, total: receta.tablaTotal, fin: receta.tablaFin },
    totales: Object.fromEntries(NOMBRES_TOTALES.map((n) => [n, receta.totales[n] && receta.totales[n] !== '(?!)' ? receta.totales[n] : LISTA_SIMPLE.totales[n]])),
  };
}

export function recetaValida(receta) {
  const patrones = [
    ...receta.reconoce,
    receta.tipo.titulo,
    receta.tipo.ccf,
    receta.correlativoPatron,
    receta.zonas.cliente,
    receta.zonas.tabla,
    ...Object.values(receta.tabla),
    ...Object.values(receta.totales),
    ...Object.values(receta.campos).flatMap((c) => [c.etiqueta, c.patron].filter((x) => x !== undefined)),
  ];
  if (receta.reconoce.length < 2) return false;
  if (!receta.campos.numero?.etiqueta && !receta.campos.numero?.patron) return false;
  for (const p of patrones) {
    if (typeof p !== 'string' || p.length > longitudMaxima || !p) return false;
    try {
      new RegExp(p, 'i');
    } catch {
      return false;
    }
  }
  return Object.values(receta.campos).every((c) => LUGARES.includes(c.lugar) && ZONAS.includes(c.zona));
}

const cerca = (a, b) => Math.abs(a - b) < 0.011;

const sinEspacios = (s) => String(s ?? '').replace(/\s+/g, '');

export function coincideConLectura(lectura, resultado) {
  if (!resultado.ok) return false;
  const f = resultado.factura;
  const partes = sinEspacios(resultado.lectura.numeroImpreso).split('-');
  if (lectura.tipo !== f.tipo || lectura.fecha !== f.fecha) return false;
  if (sinEspacios(lectura.numeroDocumento) !== partes.join('-') || !partes.includes(String(f.correlativo))) return false;
  if (lectura.lineas.length !== f.lineas.length) return false;
  if (!lectura.lineas.every((l, i) => l.cantidad === f.lineas[i].cantidad && cerca(l.precioUnitario, f.lineas[i].precioUnitario))) return false;
  return lectura.total === null || lectura.total === undefined || f.total === null || cerca(lectura.total, f.total);
}

export async function aprenderReceta(buffer, pagina) {
  const texto = pagina.items.map((i) => `x=${Math.round(i.x)} y=${Math.round(i.y)} ${JSON.stringify(i.s)}`).join('\n');
  const ejemplo = JSON.stringify(LISTA_SIMPLE);
  const datos = await extraerJson({
    instrucciones: `${INSTRUCCIONES}${ejemplo}\n\nTEXTO DE LA PÁGINA:\n${texto}`,
    archivo: await extraerPaginas(buffer, [pagina.numero]),
    mime: 'application/pdf',
    esquema: ESQUEMA,
    soloTexto: true,
  });
  const rechazar = (motivo) => {
    console.error(`Aprendizaje de formato descartado: ${motivo}`);
    return null;
  };
  if (datos.clase !== 'venta') return rechazar(`la IA clasificó la página como "${datos.clase}"`);
  const receta = limpiar(datos.receta);
  if (!recetaValida(receta)) return rechazar('la receta tiene expresiones inválidas');
  if (!reconoce(pagina, receta)) return rechazar('la receta no reconoce la página de muestra');
  const leida = leerConReceta(pagina, receta);
  if (!coincideConLectura(datos.lectura, leida)) {
    return rechazar(`la receta leyó ${JSON.stringify({ ok: leida.ok, tipo: leida.factura.tipo, correlativo: leida.factura.correlativo, fecha: leida.factura.fecha, lineas: leida.factura.lineas.length, total: leida.factura.total })} y la IA ${JSON.stringify(datos.lectura)}`);
  }
  return receta;
}

export async function intentarAprender(buffer, paginas) {
  try {
    const receta = await aprenderReceta(buffer, paginas[0]);
    if (!receta) return null;
    const propias = paginas.filter((p) => reconoce(p, receta));
    const leidas = propias.filter((p) => leerConReceta(p, receta).ok);
    return propias.length && leidas.length / paginas.length >= 0.8 ? receta : null;
  } catch (error) {
    console.error(`Aprendizaje de formato: ${error.message}`);
    return null;
  }
}
