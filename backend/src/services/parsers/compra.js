import { agruparFilas } from './pdfText.js';
import { dinero, parsearFecha } from './plantilla.js';

const quitarEtiqueta = (texto, re) => {
  const m = texto.match(re);
  return m ? m[1].trim() : null;
};

function leerProveedor(filas) {
  const proveedor = { nombre: '', direccion: '', ciudad: '', telefono: '', giro: '' };
  const derecha = [];
  let tipoDocumento = '';
  filas.forEach((fila, indice) => {
    for (const item of fila.items) {
      if (item.x > 400) {
        derecha.push(item.s);
        continue;
      }
      const direccion = quitarEtiqueta(item.s, /^Direcci[oó]n:\s*(.*)/i);
      const ciudad = quitarEtiqueta(item.s, /^Ciudad, c[oó]digo postal:\s*(.*)/i);
      const telefono = quitarEtiqueta(item.s, /^Tel[eé]fono\s*\|\s*Fax:\s*(.*)/i);
      if (direccion !== null) proveedor.direccion = direccion;
      else if (ciudad !== null) proveedor.ciudad = ciudad;
      else if (telefono !== null) proveedor.telefono = telefono;
      else if (indice === 0 && !proveedor.nombre) proveedor.nombre = item.s;
    }
  });
  if (/cr[eé]dito fiscal/i.test(derecha[0] || '')) tipoDocumento = derecha[0];
  const fecha = derecha.map((t) => quitarEtiqueta(t, /^FECHA:\s*(.*)/i)).find((v) => v !== null) || '';
  const iNumero = derecha.findIndex((t) => /DE FACTURA/i.test(t));
  const numeroFactura = iNumero >= 0 ? derecha[iNumero + 1] || '' : '';
  const iGiro = derecha.findIndex((t) => /^GIRO:/i.test(t));
  proveedor.giro = iGiro >= 0 ? derecha.slice(iGiro + 1).join(' ') : '';
  return { proveedor, tipoDocumento, fecha, numeroFactura };
}

function leerFacturarA(filas) {
  const datos = { nombre: '', direccion: '', ciudad: '', telefono: '', nit: '', nrc: '' };
  for (const { items } of filas) {
    for (const { s } of items) {
      const nombre = quitarEtiqueta(s, /^FACTURAR A:\s*(.*)/i);
      const direccion = quitarEtiqueta(s, /^Direcci[oó]n:\s*(.*)/i);
      const ciudad = quitarEtiqueta(s, /^Ciudad:\s*(.*)/i);
      const telefono = quitarEtiqueta(s, /^Tel[eé]fono:\s*(.*)/i);
      const nit = quitarEtiqueta(s, /^NIT:\s*(.*)/i);
      const nrc = quitarEtiqueta(s, /^NRC:\s*(.*)/i);
      if (nombre !== null) datos.nombre = nombre;
      else if (direccion !== null) datos.direccion = direccion;
      else if (ciudad !== null) datos.ciudad = ciudad;
      else if (telefono !== null) datos.telefono = telefono;
      else if (nit !== null) datos.nit = nit;
      else if (nrc !== null) datos.nrc = nrc;
    }
  }
  return datos;
}

function leerLineas(filas, cabecera) {
  const x = Object.fromEntries(
    cabecera.items.map((i) => [i.s.toLowerCase().replace(/[^a-z]/g, ''), i.x])
  );
  const xCantidad = x.cantidad - 5;
  const xPrecio = x.preciouni - 5;
  const xTotal = x.total - 5;
  const numericos = [];
  const descripciones = [];
  for (const fila of filas) {
    for (const item of fila.items) {
      if (item.x < xCantidad - 15) descripciones.push(item);
      else if (item.s !== '$' && item.s !== '-' && dinero(item.s) !== null) numericos.push(item);
    }
  }
  const filasNumericas = agruparFilas(numericos)
    .map((f) => ({
      y: f.y,
      cantidad: f.items.find((i) => i.x >= xCantidad && i.x < xPrecio),
      precio: f.items.find((i) => i.x >= xPrecio && i.x < xTotal),
      total: f.items.find((i) => i.x >= xTotal),
      descripciones: [],
    }))
    .filter((f) => f.cantidad && f.precio && f.total);
  for (const d of descripciones) {
    const cercana = filasNumericas.reduce((a, b) => (Math.abs(b.y - d.y) < Math.abs(a.y - d.y) ? b : a), filasNumericas[0]);
    if (cercana) cercana.descripciones.push(d);
  }
  return filasNumericas.map((f, i) => ({
    n: i + 1,
    descripcion: f.descripciones.sort((a, b) => b.y - a.y).map((d) => d.s).join(' '),
    cantidad: dinero(f.cantidad.s),
    precioUnitario: dinero(f.precio.s),
    descuento: 0,
    base: null,
    iva: null,
    total: dinero(f.total.s),
  }));
}

function leerTotales(filas) {
  const totales = {};
  const rotulos = {};
  for (const { items } of filas) {
    const etiqueta = items.find((i) => /^(SUBTOTAL|IVA|1\s*%|OTROS|TOTAL)$|^(IVA|1\s*%)/i.test(i.s) && i.s === i.s.toUpperCase());
    if (!etiqueta) continue;
    const valores = items.filter((i) => i.x > etiqueta.x && i.s !== '$' && dinero(i.s) !== null);
    const valor = valores.length ? dinero(valores[valores.length - 1].s) : null;
    const clave = /^SUBTOTAL/.test(etiqueta.s) ? 'subtotal' : /^IVA/.test(etiqueta.s) ? 'iva' : /^1/.test(etiqueta.s) ? 'percepcion' : /^OTROS/.test(etiqueta.s) ? 'otros' : 'total';
    totales[clave] = valor;
    rotulos[clave] = etiqueta.s;
  }
  return { totales, rotulos };
}

export function parsearCompra(pagina) {
  const filas = agruparFilas(pagina.items);
  const iFacturarA = filas.findIndex((f) => /^FACTURAR A/i.test(f.items[0].s));
  const iCabecera = filas.findIndex((f) => /^DESCRIPCI[OÓ]N$/i.test(f.items.find((i) => i.x > 100)?.s || f.items[0].s));
  const iSubtotal = filas.findIndex((f) => f.items.some((i) => /^SUBTOTAL$/.test(i.s)));
  if (iFacturarA < 0 || iCabecera < 0 || iSubtotal < 0) {
    return { pagina: pagina.numero, ok: false, factura: null, lectura: { avisos: [], faltantes: ['formato'], rotulos: {} } };
  }
  const encabezado = leerProveedor(filas.slice(0, iFacturarA));
  const facturarA = leerFacturarA(filas.slice(iFacturarA, iCabecera));
  const lineas = leerLineas(filas.slice(iCabecera + 1, iSubtotal), filas[iCabecera]);
  const { totales, rotulos } = leerTotales(filas.slice(iSubtotal));
  const textoPie = filas.slice(iSubtotal).flatMap((f) => f.items.map((i) => i.s)).join(' ');
  const condicion = textoPie.match(/Total a pagar en [^.]+/i);

  const factura = {
    tipo: 'COMPRA',
    tipoDocumento: encabezado.tipoDocumento,
    numeroFactura: encabezado.numeroFactura,
    correlativo: Number(encabezado.numeroFactura) || null,
    fecha: parsearFecha(encabezado.fecha),
    proveedor: encabezado.proveedor,
    facturarA,
    lineas,
    subtotal: totales.subtotal ?? null,
    iva: totales.iva ?? null,
    percepcion: totales.percepcion ?? null,
    otros: totales.otros ?? 0,
    total: totales.total ?? null,
    condicionPago: condicion ? condicion[0].trim() : '',
    pagina: pagina.numero,
  };

  const faltantes = [];
  if (!factura.numeroFactura) faltantes.push('numeroFactura');
  if (!factura.fecha) faltantes.push('fecha');
  if (!factura.proveedor.nombre) faltantes.push('proveedor');
  if (factura.total === null) faltantes.push('total');
  if (!lineas.length) faltantes.push('lineas');
  return { pagina: pagina.numero, ok: faltantes.length === 0, factura, lectura: { avisos: [], faltantes, rotulos } };
}
