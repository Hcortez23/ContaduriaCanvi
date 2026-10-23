export const FUENTE = { name: 'Arial', size: 10 };
export const BORDE = { style: 'thin' };
export const BORDES = { left: BORDE, right: BORDE, top: BORDE, bottom: BORDE };
export const FONDO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };


export function celda(hoja, rango, valor, { negrita = false, tamano = 10, alinear = 'left', formato } = {}) {
  const [desde, hasta] = rango.split(':');
  if (desde !== hasta) hoja.mergeCells(rango);
  const c = hoja.getCell(desde);
  c.value = valor;
  c.font = { ...FUENTE, size: tamano, bold: negrita };
  c.alignment = { horizontal: alinear, vertical: 'middle' };
  if (formato) c.numFmt = formato;
  const [ini, fin] = rango.split(':');
  const filas = [hoja.getCell(ini).row, hoja.getCell(fin).row];
  const cols = [hoja.getCell(ini).col, hoja.getCell(fin).col];
  for (let r = filas[0]; r <= filas[1]; r++) {
    for (let k = cols[0]; k <= cols[1]; k++) {
      const x = hoja.getCell(r, k);
      x.border = BORDES;
      x.fill = FONDO;
    }
  }
}

