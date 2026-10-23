import { redondear, difiere, dinero, TOLERANCIA_CENTAVOS } from '../../utils/numeros.js';
import { hallazgo } from './hallazgo.js';

const REGLA_PERCEPCION = /percepci[oó]n|retenci[oó]n/i;

function baseLinea(l) {
  return redondear(l.cantidad * l.precioUnitario - (l.descuento || 0));
}

function lineaConIvaIncluido(f, l, hallazgos) {
  if (l.total === null) return;
  const esperado = baseLinea(l);
  if (Math.abs(l.total - esperado) > Math.max(0.005 * l.cantidad + 0.011, TOLERANCIA_CENTAVOS + 1e-7)) {
    hallazgos.push(
      hallazgo(f, 'ERROR', 'CALCULO', `Línea ${l.n}: el total es ${dinero(l.total)} y debería ser ${dinero(esperado)} (${l.cantidad} x ${dinero(l.precioUnitario)}).`, 'El total de la línea es cantidad x precio unitario.')
    );
  }
}

function revisarLineas(f, op, hallazgos) {
  for (const l of f.lineas) {
    if (f.precioIncluyeIva) {
      lineaConIvaIncluido(f, l, hallazgos);
      continue;
    }
    const baseEsperada = baseLinea(l);
    if (l.base !== null && difiere(l.base, baseEsperada)) {
      hallazgos.push(
        hallazgo(f, 'ERROR', 'CALCULO', `Línea ${l.n}: la base es ${dinero(l.base)} y debería ser ${dinero(baseEsperada)} (${l.cantidad} x ${dinero(l.precioUnitario)}).`, 'La base de la línea es cantidad x precio unitario.')
      );
    }
    const base = l.base ?? baseEsperada;
    if (l.iva !== null) {
      const ivaEsperado = redondear(base * op.iva);
      if (difiere(l.iva, ivaEsperado)) {
        hallazgos.push(hallazgo(f, 'ERROR', 'IVA', `Línea ${l.n}: el IVA es ${dinero(l.iva)} y debería ser ${dinero(ivaEsperado)}.`, 'El IVA de la línea es la base x 0.13.'));
      }
    }
    if (l.total !== null) {
      const conIva = f.tipo === 'CF' || l.iva !== null;
      const totalEsperado = conIva ? redondear(base * (1 + op.iva)) : base;
      if (difiere(l.total, totalEsperado)) {
        hallazgos.push(
          hallazgo(f, 'ERROR', 'CALCULO', `Línea ${l.n}: el total es ${dinero(l.total)} y debería ser ${dinero(totalEsperado)}.`, f.tipo === 'CF' ? 'En consumidor final el total de la línea es base x 1.13.' : 'Revisar el cálculo de la línea.')
        );
      }
    }
  }
}

function revisarTotalCF(f, hallazgos) {
  if (f.total === null) {
    hallazgos.push(hallazgo(f, 'ERROR', 'TOTAL', 'La factura no trae el total a pagar.', 'Completar el total: debe ser la suma de los totales de línea.'));
    return;
  }
  const sumaLineas = redondear(f.lineas.reduce((s, l) => s + (l.total ?? (f.precioIncluyeIva ? baseLinea(l) : 0)), 0));
  if (!difiere(f.total, sumaLineas)) return;
  const sumaBases = redondear(f.lineas.reduce((s, l) => s + (l.base ?? baseLinea(l)), 0));
  const pista = !difiere(f.total, sumaBases) ? ' Se sumaron las bases sin el IVA.' : '';
  hallazgos.push(
    hallazgo(f, 'ERROR', 'TOTAL', `El total es ${dinero(f.total)} y la suma de las líneas es ${dinero(sumaLineas)}.${pista}`, 'El total debe ser la suma de los totales de línea (precio x cantidad x 1.13).')
  );
}

function revisarTotalesCCF(f, op, hallazgos) {
  if (f.total === null) hallazgos.push(hallazgo(f, 'ERROR', 'TOTAL', 'La factura no trae el total a pagar.', 'Completar el total: subtotal + IVA + 1% si corresponde.'));
  const subtotal = redondear(f.lineas.reduce((s, l) => s + (l.base ?? baseLinea(l)), 0));
  if (f.subtotal !== null && difiere(f.subtotal, subtotal)) {
    hallazgos.push(hallazgo(f, 'ERROR', 'TOTAL', `El subtotal es ${dinero(f.subtotal)} y la suma de las bases es ${dinero(subtotal)}.`, 'El subtotal es la suma de las bases gravadas.'));
  }
  const ivaEsperado = redondear(subtotal * op.iva);
  if (f.iva === null) {
    hallazgos.push(hallazgo(f, 'ERROR', 'IVA', 'No se muestra el IVA al final del crédito fiscal.', 'Calcular el IVA al final: suma de bases x 0.13.'));
  } else if (difiere(f.iva, ivaEsperado)) {
    hallazgos.push(hallazgo(f, 'ERROR', 'IVA', `El IVA es ${dinero(f.iva)} y debería ser ${dinero(ivaEsperado)}.`, 'El IVA se calcula al final: suma de bases x 0.13.'));
  }
  if (f.percepcion !== null) {
    const percepcionEsperada = redondear(subtotal * op.percepcion);
    if (difiere(f.percepcion, percepcionEsperada)) {
      hallazgos.push(hallazgo(f, 'ERROR', 'PERCEPCION', `El 1% es ${dinero(f.percepcion)} y debería ser ${dinero(percepcionEsperada)}.`, 'Calcular el 1% sobre el subtotal.'));
    }
    if (subtotal <= op.umbralPercepcion) {
      hallazgos.push(hallazgo(f, 'ERROR', 'PERCEPCION', `Se aplicó el 1% con una base de ${dinero(subtotal)}; solo corresponde cuando el crédito fiscal sobrepasa ${dinero(op.umbralPercepcion)}.`, 'Quitar el 1% y recalcular el total.'));
    }
  } else if (subtotal > op.umbralPercepcion) {
    hallazgos.push(hallazgo(f, 'ERROR', 'PERCEPCION', `Base de ${dinero(subtotal)} sin 1%; el crédito fiscal sobrepasa ${dinero(op.umbralPercepcion)} y debe llevarlo.`, 'Agregar el 1% sobre el subtotal y recalcular el total.'));
  }
  if (f.total !== null) {
    const totalEsperado = redondear(subtotal + (f.iva ?? ivaEsperado) + (f.percepcion ?? 0));
    if (difiere(f.total, totalEsperado)) {
      hallazgos.push(hallazgo(f, 'ERROR', 'TOTAL', `El total es ${dinero(f.total)} y debería ser ${dinero(totalEsperado)} (subtotal + IVA + 1%).`, 'Total = subtotal + IVA + 1%.'));
    }
  }
  const rotulo = f.rotuloPercepcion;
  if (rotulo && !REGLA_PERCEPCION.test(rotulo)) {
    hallazgos.push(hallazgo(f, 'ADVERTENCIA', 'TEXTO', `La línea del 1% dice "${rotulo}".`, 'Rotularla como "1% percepción" (o "retención" si corresponde).'));
  }
}

export function revisarCalculos(resultados, op) {
  const hallazgos = [];
  let sinIvaCF = 0;
  for (const { factura, lectura } of resultados) {
    const f = { ...factura, rotuloPercepcion: lectura.rotulos.percepcion };
    revisarLineas(f, op, hallazgos);
    if (f.tipo === 'CF') {
      revisarTotalCF(f, hallazgos);
      if (f.iva === null && !f.precioIncluyeIva) sinIvaCF++;
    } else {
      revisarTotalesCCF(f, op, hallazgos);
    }
  }
  if (sinIvaCF) {
    hallazgos.push(
      hallazgo(null, 'ADVERTENCIA', 'TOTALES CF', `En ${sinIvaCF} facturas de consumidor final el recuadro de totales deja vacía la línea "IVA 13%".`, 'Mostrar el subtotal sin IVA, el IVA 13% desglosado y el total.')
    );
  }
  return hallazgos;
}
