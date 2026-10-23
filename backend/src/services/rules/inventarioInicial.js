import { redondear, dinero } from '../../utils/numeros.js';
import { normalizar } from '../../utils/texto.js';
import { hallazgo } from './hallazgo.js';

const REDONDEO = 0.5 + 1e-9;
const fueraDelRedondeo = (a, b, filas = 1) => Math.abs(a - b) > REDONDEO * filas;

export function revisarInventarioInicial(inventario, op, etiqueta = 'Inventario inicial') {
  const hallazgos = [];
  const ref = { tipo: 'INVENTARIO', correlativo: null, pagina: inventario.pagina };
  const aviso = (codigo, detalle, correccion) => hallazgos.push(hallazgo(ref, 'ERROR', codigo, `${etiqueta}: ${detalle}`, correccion));

  const campos = ['codigo', 'modelo', 'existencia', 'precioUnitario'];
  inventario.filas.forEach((f, i) => {
    const vacios = campos.filter((c) => f[c] === null || f[c] === undefined || f[c] === '');
    if (vacios.length) aviso('LECTURA', `la fila ${f.numero ?? i + 1} tiene campos ilegibles (${vacios.join(', ')}).`, 'Revisar la imagen y corregir los datos de esa fila.');
  });
  const filas = inventario.filas.filter((f) => campos.every((c) => f[c] !== null && f[c] !== undefined));

  for (const f of filas) {
    const esperado = redondear(f.existencia * f.precioUnitario);
    if (f.totalModelo !== null && f.totalModelo !== undefined && fueraDelRedondeo(f.totalModelo, esperado)) {
      aviso('CALCULO', `${f.codigo} ${f.modelo}: el total es ${dinero(f.totalModelo)} y debería ser ${dinero(esperado)} (${f.existencia} x ${dinero(f.precioUnitario)}).`, 'Total por modelo = existencia x precio unitario.');
    }
  }
  const vistos = new Map();
  for (const f of filas) {
    for (const clave of [`codigo:${normalizar(f.codigo)}`, `modelo:${[f.marca, f.modelo, f.color, f.talla].map((x) => normalizar(x ?? '')).join('|')}`]) {
      if (vistos.has(clave)) aviso('DUPLICADO', `${f.codigo} ${f.modelo}${f.talla ? ` talla ${f.talla}` : ''} aparece repetido.`, 'Cada producto debe aparecer una sola vez.');
      vistos.set(clave, true);
    }
  }

  const suma = redondear(filas.reduce((s, f) => s + (f.totalModelo ?? redondear(f.existencia * f.precioUnitario)), 0));
  if (inventario.subtotal !== null && fueraDelRedondeo(inventario.subtotal, suma, filas.length)) {
    const iva = redondear(suma * op.iva);
    aviso(
      'SUBTOTAL',
      `el subtotal dice ${dinero(inventario.subtotal)} y la suma de los modelos es ${dinero(suma)} (diferencia ${dinero(inventario.subtotal - suma)}).`,
      `Corregir el subtotal a ${dinero(suma)}, el IVA a ${dinero(iva)} y el total a ${dinero(redondear(suma + iva))}.`
    );
  }
  if (inventario.subtotal !== null && inventario.iva !== null) {
    const iva = redondear(inventario.subtotal * op.iva);
    if (fueraDelRedondeo(inventario.iva, iva)) aviso('IVA', `el IVA dice ${dinero(inventario.iva)} y sobre su subtotal debería ser ${dinero(iva)}.`, 'IVA = subtotal x 0.13.');
  }
  if (inventario.subtotal !== null && inventario.iva !== null && inventario.total !== null) {
    const total = redondear(inventario.subtotal + inventario.iva);
    if (fueraDelRedondeo(inventario.total, total)) aviso('TOTAL', `el total dice ${dinero(inventario.total)} y debería ser ${dinero(total)}.`, 'Total = subtotal + IVA.');
  }
  return hallazgos;
}
