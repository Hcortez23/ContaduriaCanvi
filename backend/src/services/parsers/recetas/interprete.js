import { agruparFilas } from '../pdfText.js';
import { dinero, parsearFecha } from '../plantilla.js';

export const LUGARES = ['mismo', 'derecha', 'abajo', 'cerca', 'cualquiera', 'inicioFila'];
export const ZONAS = ['todo', 'encabezado', 'cliente', 'cuerpo'];

const regex = (patron) => new RegExp(patron, 'i');
const coincide = (patron, texto) => regex(patron).test(texto);

export function reconoce(pagina, receta) {
  return receta.reconoce.every((patron) => pagina.items.some((i) => coincide(patron, i.s)));
}

function zonasDe(items, receta) {
  const yCliente = items.find((i) => coincide(receta.zonas.cliente, i.s))?.y ?? 0;
  const yTabla = items.find((i) => coincide(receta.zonas.tabla, i.s))?.y ?? Infinity;
  return {
    todo: items,
    encabezado: items.filter((i) => i.y > yCliente + 3),
    cliente: items.filter((i) => i.y <= yCliente + 3 && i.y > yTabla),
    cuerpo: items.filter((i) => i.y < yTabla),
  };
}

function extraer(campo, texto) {
  if (!campo.patron) return texto.trim();
  const m = texto.match(regex(campo.patron));
  return m ? (m[1] ?? m[0]).trim() : null;
}

function valorDe(campo, zonas) {
  if (!campo) return '';
  const valor = valorSegunLugar(campo, zonas);
  if (valor || !campo.etiqueta || !campo.patron || campo.lugar === 'cerca') return valor;
  return valorSegunLugar({ ...campo, lugar: 'cerca', zona: 'todo' }, zonas);
}

function valorSegunLugar(campo, zonas) {
  const lista = zonas[campo.zona] ?? zonas.todo;
  if (campo.lugar === 'cualquiera' || !campo.etiqueta) {
    for (const i of lista) {
      const v = extraer(campo, i.s);
      if (v) return v;
    }
    return '';
  }
  const etiqueta = lista.find((i) => coincide(campo.etiqueta, i.s));
  if (!etiqueta) return '';
  if (campo.lugar === 'mismo') return extraer(campo, etiqueta.s) ?? '';

  const resto = lista.filter((i) => i !== etiqueta);
  const mismaFila = (i) => Math.abs(i.y - etiqueta.y) <= 3;
  if (campo.lugar === 'inicioFila') return resto.concat(etiqueta).filter(mismaFila).sort((a, b) => a.x - b.x)[0]?.s ?? '';
  if (campo.lugar === 'derecha') {
    const candidatos = resto.filter((i) => mismaFila(i) && i.x > etiqueta.x).sort((a, b) => a.x - b.x);
    for (const i of candidatos) {
      const v = extraer(campo, i.s);
      if (v !== null) return v;
    }
    const vecinos = resto.filter((i) => !mismaFila(i) && Math.abs(i.y - etiqueta.y) <= 12 && i.x > etiqueta.x).sort((a, b) => Math.abs(a.y - etiqueta.y) - Math.abs(b.y - etiqueta.y) || a.x - b.x);
    for (const i of vecinos) {
      const v = extraer(campo, i.s);
      if (v !== null && campo.patron) return v;
    }
    return '';
  }
  if (campo.lugar === 'abajo') {
    return resto
      .filter((i) => i.y < etiqueta.y - 3 && etiqueta.y - i.y < 20 && i.x > etiqueta.x - 30 && i.x < etiqueta.x + 100)
      .sort((a, b) => a.x - b.x)
      .map((i) => i.s)
      .join(' ');
  }
  const candidatos = resto
    .filter((i) => Math.abs(i.y - etiqueta.y) <= 16 && i.x >= etiqueta.x - 5)
    .sort((a, b) => Math.abs(a.y - etiqueta.y) - Math.abs(b.y - etiqueta.y) || a.x - b.x);
  for (const i of candidatos) {
    const v = extraer(campo, i.s);
    if (v !== null) return v;
  }
  return '';
}

function leerLineas(items, receta) {
  const { tabla } = receta;
  const encabezado = items.find((i) => coincide(tabla.inicio, i.s));
  if (!encabezado) return [];
  const xCantidad = encabezado.x + 16;
  const xPrecio = (items.find((i) => coincide(tabla.precio, i.s))?.x ?? 437) - 10;
  const xTotal = items.find((i) => coincide(tabla.total, i.s))?.x ?? 555;
  const yFin = items.find((i) => coincide(tabla.fin, i.s))?.y ?? 0;
  const lineas = [];
  for (const fila of agruparFilas(items).filter((f) => f.y < encabezado.y - 3 && f.y > yFin + 3)) {
    const cantidad = fila.items.find((i) => i.x < xCantidad && /^\d+$/.test(i.s));
    const descripcion = fila.items.filter((i) => i.x >= xCantidad && i.x < xPrecio).map((i) => i.s).join(' ');
    const precio = fila.items.find((i) => i.x >= xPrecio && i.x < xTotal && dinero(i.s) !== null);
    const total = fila.items.find((i) => i.x >= xTotal && dinero(i.s) !== null);
    if (!cantidad || !descripcion || !precio) continue;
    lineas.push({
      n: lineas.length + 1,
      descripcion,
      cantidad: Number(cantidad.s),
      precioUnitario: dinero(precio.s),
      descuento: 0,
      base: null,
      iva: null,
      total: total ? dinero(total.s) : null,
    });
  }
  return lineas;
}

function leerTotales(items, receta) {
  const { totales, tabla } = receta;
  const xEtiqueta = (items.find((i) => coincide(tabla.precio, i.s))?.x ?? 400) - 5;
  const valores = {};
  const rotulos = {};
  for (const fila of agruparFilas(items)) {
    for (const [clave, patron] of Object.entries(totales)) {
      const etiqueta = fila.items.find((i) => i.x > xEtiqueta && coincide(patron, i.s));
      if (!etiqueta) continue;
      const valor = fila.items.find((i) => i.x > etiqueta.x && dinero(i.s) !== null);
      valores[clave] = valor ? dinero(valor.s) : null;
      rotulos[clave] = etiqueta.s;
      break;
    }
  }
  return { valores, rotulos };
}

export function leerConReceta(pagina, receta) {
  const items = pagina.items;
  const zonas = zonasDe(items, receta);
  const campo = (nombre) => valorDe(receta.campos[nombre], zonas);

  const titulo = items.find((i) => coincide(receta.tipo.titulo, i.s))?.s ?? '';
  const tipo = coincide(receta.tipo.ccf, titulo) && !/consumidor final/i.test(titulo) ? 'CCF' : 'CF';
  const numero = campo('numero');
  const correlativo = Number(numero.match(regex(receta.correlativoPatron))?.[1] ?? (/^\d+$/.test(numero) ? numero : NaN));
  const ciudad = campo('clienteCiudad');
  const direccionCliente = [campo('clienteDireccion'), ciudad].filter(Boolean).join(', ');
  const { valores, rotulos } = leerTotales(items, receta);
  const lineas = leerLineas(items, receta);

  const factura = {
    tipo,
    correlativo: Number.isFinite(correlativo) ? correlativo : null,
    numeroDocumento: '',
    fecha: parsearFecha(campo('fecha')),
    condicionPago: campo('condicionPago'),
    precioIncluyeIva: receta.precioConIvaEnCF && tipo === 'CF',
    emisor: { nombre: campo('emisorNombre'), nit: campo('emisorNit'), nrc: campo('emisorNrc'), direccion: campo('emisorDireccion'), dui: '' },
    cliente: { nombre: campo('clienteNombre'), nitDui: campo('clienteNit'), nrc: campo('clienteNrc'), direccion: direccionCliente, giro: '' },
    lineas,
    subtotal: valores.subtotal ?? null,
    iva: valores.iva ?? null,
    percepcion: valores.percepcion ?? null,
    descuentos: 0,
    total: valores.total ?? null,
    observaciones: numero ? `${receta.etiquetaNumero} ${numero}` : '',
    pagina: pagina.numero,
  };

  const faltantes = [];
  if (factura.correlativo === null) faltantes.push('correlativo');
  if (!factura.fecha) faltantes.push('fecha');
  if (!lineas.length) faltantes.push('lineas');
  return {
    pagina: pagina.numero,
    ok: faltantes.length === 0,
    factura,
    lectura: { titulo, tipoDocumento: tipo === 'CCF' ? 'Crédito fiscal' : 'Consumidor final', rotulos, avisos: [], faltantes, numeroImpreso: numero },
  };
}
