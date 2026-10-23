import { Pagina, dinero } from './pdfPuma.mjs';

const TAMANO = [612, 792];
const fechaTexto = (iso) => iso.split('-').reverse().join('/');
const sinSimbolo = (n) => dinero(n).slice(1);

export const tamanoCompra = TAMANO;

export function dibujarCompra(p, c) {
  p.texto(c.proveedor.nombre, 35.2, 719.3, { negrita: true, tamano: 13 });
  p.texto('Crédito Fiscal', 459.8, 719.3, { negrita: true, tamano: 11 });
  p.texto('"Calzado deportivo para toda la familia"', 34.4, 703.9, { tamano: 9 });
  p.texto(`Dirección: ${c.proveedor.direccion}`, 34.4, 681.7, { tamano: 9 });
  p.texto(`FECHA: ${fechaTexto(c.fecha)}`, 426.3, 681.7, { tamano: 9 });
  p.texto(`Ciudad, código postal: ${c.proveedor.ciudad}`, 34.4, 670.7, { tamano: 9 });
  p.texto('N.º DE FACTURA', 426.3, 670.7, { tamano: 9 });
  p.texto(c.numeroFactura, 503.4, 670.7, { negrita: true, tamano: 9 });
  p.texto(`Teléfono | Fax: ${c.proveedor.telefono}`, 34.4, 660.1, { tamano: 9 });
  p.texto('GIRO:', 426.3, 660.1, { tamano: 9 });
  p.texto('Venta al por mayor de', 503.4, 660.1, { tamano: 9 });
  p.texto('calzado deportivo', 503.4, 650, { tamano: 9 });

  p.texto(`FACTURAR A: ${c.facturarA.nombre}`, 34.4, 626.4, { negrita: true, tamano: 9 });
  p.texto(`Dirección: ${c.facturarA.direccion}`, 34.4, 611.1, { tamano: 9 });
  p.texto(`Ciudad: ${c.facturarA.ciudad}`, 34.4, 595.4, { tamano: 9 });
  p.texto(`Teléfono: ${c.facturarA.telefono}`, 34.4, 584.9, { tamano: 9 });
  p.texto(`NIT: ${c.facturarA.nit}`, 34.4, 573.3, { tamano: 9 });
  p.texto(`NRC: ${c.facturarA.nrc}`, 34.4, 561, { tamano: 9 });

  p.banda(543.2, 30, 550);
  p.texto('DESCRIPCIÓN', 172.3, 543.2, { negrita: true, tamano: 9 });
  p.texto('Cantidad', 380.1, 543.2, { negrita: true, tamano: 9 });
  p.texto('Precio Uni', 444.8, 543.2, { negrita: true, tamano: 9 });
  p.texto('Total', 537.1, 543.2, { negrita: true, tamano: 9 });
  for (let i = 0; i < 10; i++) {
    const y = 521.2 - 21.95 * i;
    const l = c.lineas[i];
    if (l) {
      p.texto(l.descripcion, 34.4, y, { tamano: 9 });
      p.texto(String(l.cantidad), 413.8, y, { tamano: 9 });
      p.texto('$', 428.8, y, { tamano: 9 });
      p.derecha(sinSimbolo(l.precioUnitario), 498, y, { tamano: 9 });
      p.texto('$', 505.8, y, { tamano: 9 });
      p.derecha(sinSimbolo(l.total), 588, y, { tamano: 9 });
    } else {
      p.texto('$', 507.6, y, { tamano: 9 });
      p.texto('-', 573.7, y, { tamano: 9 });
    }
    p.linea(30, y - 5, 580);
  }
  const totales = [
    ['SUBTOTAL', 447.3, 301.6, c.subtotal],
    ['IVA 13%', 459, 279.6, c.iva],
    ['1% PERCEPCION', 422.8, 257.7, c.percepcion],
    ['OTROS', 461.5, 235.7, null],
    ['TOTAL', 464, 213.7, c.total],
  ];
  totales.forEach(([t, x, y, v]) => {
    p.texto(t, x, y, { negrita: t === 'TOTAL', tamano: 9 });
    if (v !== null && v !== undefined) {
      p.texto('$', 505.8, y, { tamano: 9 });
      p.derecha(sinSimbolo(v), 588, y, { negrita: t === 'TOTAL', tamano: 9 });
    }
  });
  p.texto(`Todos los cheques se extenderán a nombre de ${c.proveedor.nombre}.`, 34.4, 192.1, { tamano: 9 });
  p.texto('Total a pagar en 15 días. Cuentas vencidas sujetas a un cargo por servicios de 1% al mes.', 34.4, 170.2, { tamano: 9 });
  p.centrado('GRACIAS POR SU CONFIANZA', 141.9, { negrita: true, tamano: 9 });
}

export { Pagina };
