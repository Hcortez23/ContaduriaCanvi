import { agruparFilas } from './pdfText.js';

const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ETIQUETAS = [
  ['numeroCorrelativo', /^numero correlativo(?![a-z])/],
  ['nitDui', /^nit\s*\/\s*dui(?![a-z])/],
  ['nit', /^nit(?![a-z])/],
  ['nrc', /^nrc(?![a-z])/],
  ['nombre', /^nombre(?:\s*\/(?:\s*razon social)?)?(?![a-z])/],
  ['direccion', /^direccion(?:\s*\/\s*telefono\s*\/\s*correo)?(?![a-z])/],
  ['condicionPago', /^condicion de pago(?![a-z])/],
  ['duiEmisor', /^documento\s*(?:\/\s*dui)?(?![a-z])/],
  ['numero', /^numero(?![a-z])/],
  ['fecha', /^fecha(?![a-z])/],
  ['giro', /^giro(?![a-z])/],
];

const COLUMNAS = [
  ['descripcion', /^descripcion/],
  ['cantidad', /^cantidad/],
  ['precioUnitario', /^precio/],
  ['descuento', /^descuento/],
  ['base', /^base/],
  ['iva', /^iva/],
  ['total', /^total/],
];

const TOTALES = [
  ['subtotal', /^subtotal/],
  ['iva', /^iva/],
  ['descuentos', /^descuento/],
  ['percepcion', /^1\s*%/],
  ['total', /^total a pagar/],
];

const RE_CORRELATIVO = /^N\s*[°º*]\s*(\d+)$/;

export function dinero(s) {
  const limpio = String(s).replace(/[$,\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : null;
}

export function parsearFecha(s) {
  const m = String(s || '').match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!m) return null;
  const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function detectarEtiqueta(texto) {
  if (/^DOCUMENTO(?![A-Za-z])/.test(texto)) {
    return { etiqueta: 'tipoDocumento', resto: texto.replace(/^DOCUMENTO\s*:?\s*/, '') };
  }
  const n = normalizar(texto);
  for (const [etiqueta, re] of ETIQUETAS) {
    const m = n.match(re);
    if (m) return { etiqueta, resto: texto.slice(m[0].length).replace(/^\s*:?\s*/, '') };
  }
  return null;
}

function leerFila(items) {
  const campos = [];
  const libres = [];
  const correlativos = [];
  let actual = null;
  for (const item of items) {
    const corr = item.s.match(RE_CORRELATIVO);
    if (corr) {
      correlativos.push(Number(corr[1]));
      continue;
    }
    const det = detectarEtiqueta(item.s);
    if (det) {
      actual = { etiqueta: det.etiqueta, valores: det.resto ? [det.resto] : [] };
      campos.push(actual);
    } else if (actual) {
      actual.valores.push(item.s);
    } else {
      libres.push(item.s);
    }
  }
  return { campos, libres, correlativos };
}

function guardar(destino, avisos, bloque, campo, valores, unir = false) {
  if (!valores.length) return;
  if (unir) {
    destino[campo] = valores.join(' ');
    return;
  }
  destino[campo] = valores[0];
  if (valores.length > 1) avisos.push({ campo: `${bloque}.${campo}`, valores });
}

export function parsearPagina(pagina) {
  const filas = agruparFilas(pagina.items);
  const avisos = [];
  const rotulos = {};
  const emisor = { nombre: '', nit: '', nrc: '', direccion: '', dui: '' };
  const cliente = { nombre: '', nitDui: '', nrc: '', direccion: '', giro: '' };
  const doc = { numeroDocumento: '', fecha: null, condicionPago: '', tipoDocumento: '' };
  const encabezado = [];
  const observaciones = [];
  let correlativo = null;
  let bloque = 'titulo';
  let columnas = null;
  const lineas = [];
  const totales = {};
  let libresEmisor = 0;

  for (const fila of filas) {
    const textos = fila.items.map((i) => i.s);
    const primero = textos[0];

    if (bloque === 'titulo' && /^EMISOR/.test(primero)) bloque = 'emisor';
    else if (/^CLIENTE/.test(primero)) bloque = 'cliente';
    else if (primero === 'No.' && textos.some((t) => normalizar(t).startsWith('descripcion'))) {
      bloque = 'tabla';
      columnas = fila.items
        .map((i) => {
          const col = COLUMNAS.find(([, re]) => re.test(normalizar(i.s)));
          return col ? { clave: col[0], x: i.x } : null;
        })
        .filter(Boolean);
      continue;
    } else if (/^Subtotal/i.test(primero)) bloque = 'totales';
    else if (/^Observaciones/i.test(primero)) {
      bloque = 'observaciones';
      continue;
    }

    if (bloque === 'titulo') {
      encabezado.push(...textos);
      continue;
    }

    if (bloque === 'emisor' || bloque === 'cliente') {
      const { campos, libres, correlativos } = leerFila(fila.items);
      if (correlativos.length) correlativo = correlativos[0];
      const marca = bloque === 'emisor' ? 'EMISOR' : 'CLIENTE';
      const libresUtiles = libres.filter((t) => {
        if (t.startsWith(marca)) {
          if (t !== marca) avisos.push({ campo: `encabezado.${marca.toLowerCase()}`, valores: [t.slice(marca.length)] });
          return false;
        }
        return true;
      });
      for (const c of campos) {
        if (bloque === 'emisor') {
          if (c.etiqueta === 'nombre') guardar(emisor, avisos, 'emisor', 'nombre', c.valores);
          else if (c.etiqueta === 'nit') guardar(emisor, avisos, 'emisor', 'nit', c.valores);
          else if (c.etiqueta === 'nrc') guardar(emisor, avisos, 'emisor', 'nrc', c.valores);
          else if (c.etiqueta === 'direccion') guardar(emisor, avisos, 'emisor', 'direccion', c.valores, true);
          else if (c.etiqueta === 'duiEmisor') guardar(emisor, avisos, 'emisor', 'dui', c.valores);
          else if (c.etiqueta === 'numero') guardar(doc, avisos, 'documento', 'numeroDocumento', c.valores);
          else if (c.etiqueta === 'fecha') guardar(doc, avisos, 'documento', 'fecha', c.valores);
          else if (c.etiqueta === 'condicionPago') guardar(doc, avisos, 'documento', 'condicionPago', c.valores, true);
          else if (c.etiqueta === 'tipoDocumento') guardar(doc, avisos, 'documento', 'tipoDocumento', c.valores, true);
        } else {
          if (c.etiqueta === 'nombre') guardar(cliente, avisos, 'cliente', 'nombre', c.valores);
          else if (c.etiqueta === 'nitDui' || c.etiqueta === 'nit') guardar(cliente, avisos, 'cliente', 'nitDui', c.valores);
          else if (c.etiqueta === 'nrc') guardar(cliente, avisos, 'cliente', 'nrc', c.valores);
          else if (c.etiqueta === 'direccion') guardar(cliente, avisos, 'cliente', 'direccion', c.valores, true);
          else if (c.etiqueta === 'giro') guardar(cliente, avisos, 'cliente', 'giro', c.valores, true);
        }
      }
      if (bloque === 'emisor') {
        for (const t of libresUtiles) {
          if (/^Plantilla/i.test(t)) continue;
          if (libresEmisor === 0 && !emisor.nombre) {
            emisor.nombre = t.replace(/^[^:]{1,10}:\s*/, '');
          } else if (!emisor.direccion) {
            emisor.direccion = t;
          }
          libresEmisor++;
        }
      }
      continue;
    }

    if (bloque === 'tabla') {
      if (!columnas || fila.items.length < 2) continue;
      const [numero, ...resto] = fila.items;
      if (!/^\d{1,2}$/.test(numero.s)) continue;
      const celdas = {};
      for (const it of resto) {
        const col = [...columnas].reverse().find((c) => it.x >= c.x - 2);
        if (!col) continue;
        celdas[col.clave] = celdas[col.clave] ? `${celdas[col.clave]} ${it.s}` : it.s;
      }
      if (!celdas.descripcion) continue;
      lineas.push({
        n: Number(numero.s),
        descripcion: celdas.descripcion,
        cantidad: celdas.cantidad ? Number(String(celdas.cantidad).replace(/[^\d.]/g, '')) : null,
        precioUnitario: dinero(celdas.precioUnitario ?? ''),
        descuento: dinero(celdas.descuento ?? '') ?? 0,
        base: dinero(celdas.base ?? ''),
        iva: dinero(celdas.iva ?? ''),
        total: dinero(celdas.total ?? ''),
      });
      continue;
    }

    if (bloque === 'totales') {
      for (const it of fila.items) {
        const t = TOTALES.find(([, re]) => re.test(normalizar(it.s)));
        if (!t) continue;
        const valor = fila.items.find((o) => o.x > it.x && dinero(o.s) !== null);
        totales[t[0]] = valor ? dinero(valor.s) : null;
        rotulos[t[0]] = it.s;
      }
      continue;
    }

    if (bloque === 'observaciones') observaciones.push(...textos);
  }

  const titulo = encabezado.find((t) => /^FACTURA|^COMPROBANTE|^CR[EÉ]DITO/i.test(t)) || '';
  const tipo = /credito/.test(normalizar(`${doc.tipoDocumento} ${titulo}`)) ? 'CCF' : 'CF';

  const factura = {
    tipo,
    correlativo,
    numeroDocumento: doc.numeroDocumento,
    fecha: parsearFecha(doc.fecha),
    condicionPago: doc.condicionPago,
    emisor,
    cliente,
    lineas,
    subtotal: totales.subtotal ?? null,
    iva: totales.iva ?? null,
    percepcion: totales.percepcion ?? null,
    descuentos: totales.descuentos ?? 0,
    total: totales.total ?? null,
    observaciones: observaciones.join(' '),
    pagina: pagina.numero,
  };

  const faltantes = [];
  if (correlativo === null) faltantes.push('correlativo');
  if (!factura.fecha) faltantes.push('fecha');
  if (factura.total === null) faltantes.push('total');
  if (!lineas.length) faltantes.push('lineas');

  return {
    pagina: pagina.numero,
    ok: faltantes.length === 0,
    factura,
    lectura: { titulo, tipoDocumento: doc.tipoDocumento, rotulos, avisos, faltantes },
  };
}
