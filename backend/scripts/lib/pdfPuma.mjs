import { rgb } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';

export const ANCHO = 841.8;
export const ALTO = 595.2;

export const redondear = (n) => Math.round(n * 100 + 1e-7) / 100;
export const dinero = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function completarFactura(f) {
  const lineas = f.lineas.map((l) => {
    const base = redondear(l.cantidad * l.precioUnitario);
    const iva = redondear(base * 0.13);
    return { ...l, base, iva, total: redondear(base + iva) };
  });
  const sumar = (campo) => redondear(lineas.reduce((s, l) => s + l[campo], 0));
  if (f.tipo === 'CF') return { ...f, lineas, subtotal: sumar('base'), iva: sumar('iva'), total: sumar('total'), percepcion: null };
  const subtotal = sumar('base');
  const iva = redondear(subtotal * 0.13);
  const percepcion = subtotal > 250 ? redondear(subtotal * 0.01) : null;
  return { ...f, lineas, subtotal, iva, percepcion, total: redondear(subtotal + iva + (percepcion ?? 0)) };
}

const fechaCF = (iso) => {
  const [a, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}/${a}`;
};
const fechaCCF = (iso) => {
  const [a, m, d] = iso.split('-');
  return `${d}-${m}-${a.slice(2)}`;
};

export class Pagina {
  constructor(pdf, normal, negrita, tamano = [ANCHO, ALTO]) {
    this.pagina = pdf.addPage(tamano);
    this.ancho = tamano[0];
    this.normal = normal;
    this.negrita = negrita;
  }

  texto(s, x, y, { negrita = false, tamano = 8.5 } = {}) {
    if (s === null || s === undefined || s === '') return;
    this.pagina.drawText(String(s), { x, y, size: tamano, font: negrita ? this.negrita : this.normal, color: rgb(0, 0, 0) });
  }

  derecha(s, xDerecha, y, opciones = {}) {
    const fuente = opciones.negrita ? this.negrita : this.normal;
    this.texto(s, xDerecha - fuente.widthOfTextAtSize(String(s), opciones.tamano ?? 8.5), y, opciones);
  }

  centrado(s, y, opciones = {}) {
    const fuente = opciones.negrita ? this.negrita : this.normal;
    this.texto(s, (this.ancho - fuente.widthOfTextAtSize(s, opciones.tamano ?? 8.5)) / 2, y, opciones);
  }

  banda(y, x, ancho, alto = 13) {
    this.pagina.drawRectangle({ x, y: y - 3.5, width: ancho, height: alto, color: rgb(0.93, 0.93, 0.93) });
  }

  linea(x1, y, x2) {
    this.pagina.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  }
}

export function dibujarCF(p, f) {
  p.centrado('FACTURA DE CONSUMIDOR FINAL', 516, { negrita: true, tamano: 12 });
  p.banda(473.2, 130, 580);
  p.texto('EMISOR', 146, 473.2, { negrita: true });
  p.texto('DOCUMENTO', 525.7, 473.2, { negrita: true });
  p.texto('Consumidor final', 626.1, 473.2);
  const fila = (y, e1, v1, e2, v2) => {
    p.texto(e1, 146, y);
    p.texto(v1, 208.8, y);
    if (e2) {
      p.texto(e2, 525.7, y);
      p.texto(v2, 626.1, y);
    }
  };
  fila(458.9, 'Nombre', f.emisor.nombre, 'Número', f.numeroDocumento);
  fila(444.8, 'NIT', f.emisor.nit, 'Fecha', fechaCF(f.fecha));
  p.texto(`N°${String(f.correlativo).padStart(3, '0')}`, 736.8, 435.8, { negrita: true, tamano: 10 });
  fila(430.6, 'NRC', f.emisor.nrc, 'Condición de pago', f.condicionPago);
  fila(416.4, 'Dirección', f.emisor.direccion, 'Documento / DUI', f.emisor.dui);
  p.banda(387.9, 130, 580);
  p.texto('CLIENTE', 146, 387.9, { negrita: true });
  fila(373.7, 'Nombre', f.cliente.nombre, 'NIT / DUI', f.cliente.nitDui);
  fila(359.5, 'Dirección', f.cliente.direccion, 'NRC:', f.cliente.nrc);

  p.banda(331.1, 130, 710);
  const cab = [['No.', 168], ['Descripción', 208.8], ['Cantidad', 385.3], ['Precio unitario', 448.1], ['Descuento', 525.7], ['Base gravada', 626.1], ['IVA 13%', 697.6], ['Total', 760.4]];
  cab.forEach(([t, x]) => p.texto(t, x, 331.1, { negrita: true }));
  for (let i = 0; i < 10; i++) {
    const y = 316.9 - 14.2 * i;
    p.texto(String(i + 1), i === 9 ? 170.6 : 173.2, y);
    const l = f.lineas[i];
    if (l) {
      p.texto(l.descripcion, 208.8, y);
      p.texto(String(l.cantidad), 438.9, y);
      p.derecha(dinero(l.precioUnitario), 523, y);
      p.derecha(dinero(l.base), 692, y);
      p.derecha(dinero(l.iva), 757, y);
      p.derecha(dinero(l.total), 818, y);
    }
    p.linea(130, y - 4, 840);
  }
  const totales = [['Subtotal gravado', 619.5, 160.7, f.subtotal], ['IVA 13%', 657.5, 146.4, f.iva], ['Descuentos', 643, 132.3, 0], ['TOTAL A PAGAR', 621.1, 117.8, f.total]];
  totales.forEach(([t, x, y, v], i) => {
    p.texto(t, x, y, { negrita: i === 3 });
    p.derecha(dinero(v), 818, y, { negrita: i === 3 });
  });
  p.texto('Observaciones / notas', 146, 89, { negrita: true });
}

export function dibujarCCF(p, f) {
  p.centrado('FACTURA DE CRÉDITO FISCAL', 552, { negrita: true, tamano: 12 });
  p.banda(529.8, 10, 820);
  p.texto('EMISOR', 20.4, 529.8, { negrita: true });
  p.texto('DOCUMENTO', 394.9, 529.8, { negrita: true });
  p.texto('Crédito fiscal', 458.9, 529.8);
  p.texto(`Nombre: ${f.emisor.nombre}`, 20.4, 515.4);
  p.texto('Número correlativo', 533.3, 515.4);
  p.texto(`NIT: ${f.emisor.nit}`, 20.4, 501.6);
  p.texto(`Número ${f.numeroDocumento}`, 343.3, 501.6);
  p.texto(`N° ${String(f.correlativo).padStart(3, '0')}`, 566.7, 491.2, { negrita: true, tamano: 10 });
  p.texto(`NRC: ${f.emisor.nrc}`, 20.4, 487.2);
  p.texto(`Fecha: ${fechaCCF(f.fecha)}`, 351.1, 487.2);
  p.texto(f.emisor.direccion, 20.4, 472.2);
  p.banda(443.4, 10, 820);
  p.texto('CLIENTE', 20.4, 443.4, { negrita: true });
  p.texto(`Nombre: ${f.cliente.nombre}`, 20.4, 428.9);
  p.texto(`Giro: ${f.cliente.giro}`, 394.9, 428.9);
  p.texto(`Dirección: ${f.cliente.direccion}`, 20.4, 414.6);
  p.texto(`NRC: ${f.cliente.nrc}`, 394.9, 414.6);

  p.banda(385.7, 10, 820);
  const cab = [['No.', 42.8], ['Descripción', 84.4], ['Cantidad', 244.4], ['Precio unitario', 318.1], ['Descuento', 394.9], ['Base gravada', 458.9], ['IVA 13%', 533.3], ['Total', 597.4]];
  cab.forEach(([t, x]) => p.texto(t, x, 385.7, { negrita: true }));
  for (let i = 0; i < 10; i++) {
    const y = 371.3 - 14.4 * i;
    p.texto(String(i + 1), i === 9 ? 45.4 : 48.2, y);
    const l = f.lineas[i];
    if (l) {
      p.texto(l.descripcion, 84.4, y);
      p.texto(String(l.cantidad), 308.7, y);
      p.derecha(dinero(l.precioUnitario), 392, y);
      p.derecha(dinero(l.base), 527, y);
      p.derecha(dinero(l.iva), 592, y);
      p.derecha(dinero(l.total), 656, y);
    }
    p.linea(10, y - 4, 830);
  }
  p.texto('Subtotal gravado', 453.7, 212.9);
  p.derecha(dinero(f.subtotal), 656, 212.9);
  p.texto('IVA 13%', 492.7, 198.5);
  p.derecha(dinero(f.iva), 656, 198.5);
  p.texto('1% percepción', 465.7, 184.1);
  if (f.percepcion !== null) p.derecha(dinero(f.percepcion), 656, 184.1);
  p.texto('TOTAL A PAGAR', 456.5, 169.4, { negrita: true });
  p.derecha(dinero(f.total), 656, 169.4, { negrita: true });
  p.texto('Observaciones / notas', 20.4, 140.3, { negrita: true });
}

export function imagenInventario(inventario, subtotal, iva, total) {
  const ancho = 1800;
  const alto = 1230;
  const canvas = createCanvas(ancho, alto);
  const c = canvas.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, ancho, alto);
  c.fillStyle = '#e8eef8';
  c.fillRect(40, 60, ancho - 80, alto - 120);

  c.fillStyle = '#10337a';
  c.font = 'bold 44px Arial';
  c.textAlign = 'center';
  c.fillText('INVENTARIO DE ZAPATOS PUMA', ancho / 2, 125);

  const columnas = [
    ['N.°', 90, 'center'],
    ['Código', 190, 'center'],
    ['Modelo de zapato Puma', 380, 'left'],
    ['Color', 260, 'left'],
    ['Talla', 110, 'center'],
    ['Existencia', 170, 'center'],
    ['Precio unitario', 200, 'right'],
    ['Total por modelo', 240, 'right'],
  ];
  const x0 = 70;
  const yCabecera = 160;
  const altoCabecera = 70;
  const altoFila = 38;
  const anchoTabla = columnas.reduce((s, col) => s + col[1], 0);

  c.fillStyle = '#10337a';
  c.fillRect(x0, yCabecera, anchoTabla, altoCabecera);
  c.fillStyle = '#ffffff';
  c.font = 'bold 22px Arial';
  let x = x0;
  for (const [titulo, ancho_, alinear] of columnas) {
    c.textAlign = alinear === 'left' ? 'left' : alinear === 'right' ? 'right' : 'center';
    const px = alinear === 'left' ? x + 12 : alinear === 'right' ? x + ancho_ - 12 : x + ancho_ / 2;
    c.fillText(titulo, px, yCabecera + 43);
    x += ancho_;
  }

  inventario.filas.forEach((f, i) => {
    const y = yCabecera + altoCabecera + i * altoFila;
    c.fillStyle = '#ffffff';
    c.fillRect(x0, y, anchoTabla, altoFila);
    c.strokeStyle = '#9fb0cf';
    c.lineWidth = 1;
    c.strokeRect(x0, y, anchoTabla, altoFila);
    c.fillStyle = '#111111';
    c.font = '22px Arial';
    const valores = [String(f.numero), f.codigo, f.modelo, f.color, String(f.talla), String(f.existencia), dinero(f.precioUnitario), dinero(f.totalModelo)];
    let cx = x0;
    columnas.forEach(([, w, alinear], k) => {
      c.textAlign = alinear === 'left' ? 'left' : alinear === 'right' ? 'right' : 'center';
      const px = alinear === 'left' ? cx + 12 : alinear === 'right' ? cx + w - 12 : cx + w / 2;
      c.fillText(valores[k], px, y + 27);
      cx += w;
    });
  });

  const yPie = yCabecera + altoCabecera + inventario.filas.length * altoFila + 36;
  const pie = [['SUBTOTAL', subtotal], ['IVA (13%)', iva], ['TOTAL', total]];
  pie.forEach(([titulo, valor], i) => {
    const y = yPie + i * 52;
    c.fillStyle = i === 2 ? '#10337a' : '#dbe5f5';
    c.fillRect(x0, y, anchoTabla, 46);
    c.fillStyle = i === 2 ? '#ffffff' : '#10337a';
    c.font = 'bold 28px Arial';
    c.textAlign = 'left';
    c.fillText(titulo, x0 + 16, y + 33);
    c.textAlign = 'right';
    c.fillText(dinero(valor), x0 + anchoTabla - 40, y + 33);
  });
  return canvas.toBuffer('image/png');
}
