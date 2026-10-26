import { redondear, difiere, dinero } from '../../utils/numeros.js';
import { normalizar } from '../../utils/texto.js';
import { hallazgo } from './hallazgo.js';

export function revisarCompras(compras, op, empresa = null) {
  const hallazgos = [];
  const vistas = new Map();
  for (const { factura: c } of compras) {
    const ref = { ...c, correlativo: c.correlativo };
    const aviso = (gravedad, codigo, detalle, correccion) => hallazgos.push(hallazgo(ref, gravedad, codigo, `Compra ${c.numeroFactura} (${c.proveedor.nombre}): ${detalle}`, correccion));

    for (const l of c.lineas) {
      const esperado = redondear(l.cantidad * l.precioUnitario);
      if (difiere(l.total, esperado)) {
        aviso('ERROR', 'CALCULO', `línea ${l.n}: el total es ${dinero(l.total)} y debería ser ${dinero(esperado)} (${l.cantidad} x ${dinero(l.precioUnitario)}).`, 'El total de la línea es cantidad x precio unitario.');
      }
    }
    const subtotal = redondear(c.lineas.reduce((s, l) => s + l.total, 0));
    if (c.subtotal !== null && difiere(c.subtotal, subtotal)) {
      aviso('ERROR', 'TOTAL', `el subtotal es ${dinero(c.subtotal)} y la suma de las líneas es ${dinero(subtotal)}.`, 'El subtotal es la suma de los totales de línea.');
    }
    const iva = redondear(subtotal * op.iva);
    if (c.iva === null || difiere(c.iva, iva)) {
      aviso('ERROR', 'IVA', `el IVA es ${c.iva === null ? 'inexistente' : dinero(c.iva)} y debería ser ${dinero(iva)}.`, 'El IVA se calcula al final: subtotal x 0.13.');
    }
    const debePercibir = subtotal > op.umbralPercepcion;
    const percepcion = redondear(subtotal * op.percepcion);
    if (debePercibir && (c.percepcion === null || difiere(c.percepcion, percepcion))) {
      aviso('ERROR', 'PERCEPCION', `el 1% es ${c.percepcion === null ? 'inexistente' : dinero(c.percepcion)} y debería ser ${dinero(percepcion)} (supera ${dinero(op.umbralPercepcion)}).`, 'Agregar el 1% sobre el subtotal.');
    } else if (!debePercibir && c.percepcion) {
      aviso('ERROR', 'PERCEPCION', `se aplicó el 1% con un subtotal de ${dinero(subtotal)}; solo corresponde sobre ${dinero(op.umbralPercepcion)}.`, 'Quitar el 1% y recalcular el total.');
    }
    const total = redondear(subtotal + iva + (c.percepcion ?? 0) + (c.otros ?? 0));
    if (c.total !== null && difiere(c.total, total)) {
      aviso('ERROR', 'TOTAL', `el total es ${dinero(c.total)} y debería ser ${dinero(total)} (subtotal + IVA + 1% + otros).`, 'Total = subtotal + IVA + 1% + otros.');
    }
    const clave = `${normalizar(c.proveedor.nombre)}|${c.numeroFactura}`;
    if (vistas.has(clave)) {
      aviso('ADVERTENCIA', 'DUPLICADO', 'el mismo proveedor repite el número de factura.', 'Cada factura de un proveedor debe tener un número único.');
    }
    vistas.set(clave, true);
    if (empresa) {
      if (empresa.nrc && c.facturarA.nrc && normalizar(c.facturarA.nrc) !== normalizar(empresa.nrc)) {
        aviso('ADVERTENCIA', 'EMPRESA', `está facturada al NRC ${c.facturarA.nrc} y la empresa es ${empresa.nrc}.`, 'La factura debe emitirse a nombre de la empresa.');
      }
      if (empresa.nit && c.facturarA.nit && normalizar(c.facturarA.nit) !== normalizar(empresa.nit)) {
        aviso('ADVERTENCIA', 'EMPRESA', `está facturada al NIT ${c.facturarA.nit} y la empresa es ${empresa.nit}.`, 'La factura debe emitirse a nombre de la empresa.');
      }
    }
  }
  return hallazgos;
}
