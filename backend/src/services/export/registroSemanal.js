import ExcelJS from 'exceljs';

import { celda } from './estilos.js';

const HOJAS = {
  CF: {
    nombre: 'CONSUMIDOR FINAL',
    titulo: 'CONSUMIDORES FINALES',
    registro: (nrc) => `REGISTRO: ${nrc}`,
    empresa: (nombre) => `NOMBRE DE LA EMPRESA: ${nombre}`,
    formaPago: 'EFECTIVO',
  },
  CCF: {
    nombre: 'CREDITO FISCAL',
    titulo: 'CRÉDITOS FISCALES',
    registro: (nrc) => `N.R.C.: ${nrc}`,
    empresa: (nombre) => `NOMBRE DE EMPRESA: ${nombre}`,
    formaPago: 'CREDITO',
  },
};

const formatoFecha = (fecha) => {
  const [a, m, d] = fecha.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

function construirHoja(libro, tipo, empresa, facturas, tasaIva) {
  const cfg = HOJAS[tipo];
  const hoja = libro.addWorksheet(cfg.nombre, { pageSetup: { orientation: 'landscape', horizontalCentered: true } });
  [9.1, 9.1, 8.3, 11.1, 11.1, 11.1, 11.1, 10.3, 10.3, 10.3, 14.8, 15.8].forEach((w, i) => (hoja.getColumn(i + 1).width = w));

  const docs = facturas
    .filter((f) => f.tipo === tipo)
    .sort((a, b) => a.correlativo - b.correlativo);
  const fechas = docs.map((f) => String(f.fecha).slice(0, 10)).sort();

  celda(hoja, 'A1:D1', cfg.registro(empresa.nrc), { alinear: 'center' });
  celda(hoja, 'E1:H1', `NIT: ${empresa.nit}`, { alinear: 'center' });
  celda(hoja, 'I1:L1', cfg.empresa(empresa.nombre), { alinear: 'center' });
  celda(hoja, 'A2:L2', 'REPORTE DE VERIFICACIÓN DE DOCUMENTOS DE VENTA', { negrita: true, tamano: 14, alinear: 'center' });
  celda(hoja, 'A3:F3', `Fecha inicial: ${fechas.length ? formatoFecha(fechas[0]) : ''}`, { negrita: true, alinear: 'center' });
  celda(hoja, 'G3:L3', `Fecha final: ${fechas.length ? formatoFecha(fechas[fechas.length - 1]) : ''}`, { negrita: true, alinear: 'center' });
  celda(hoja, 'A4:L4', cfg.titulo, { negrita: true, alinear: 'center' });
  celda(hoja, 'A5:B5', 'Fecha', { negrita: true, alinear: 'center' });
  celda(hoja, 'C5:C5', 'Caj-Tur', { negrita: true, alinear: 'center' });
  celda(hoja, 'D5:G5', 'N. CORRELATIVO', { negrita: true, alinear: 'center' });
  celda(hoja, 'H5:J5', 'Nombre del Cliente', { negrita: true, alinear: 'center' });
  celda(hoja, 'K5:K5', 'Monto', { negrita: true, alinear: 'center' });
  celda(hoja, 'L5:L5', 'Forma de pago', { negrita: true, alinear: 'center' });

  docs.forEach((f, i) => {
    const r = 6 + i;
    const fecha = new Date(`${String(f.fecha).slice(0, 10)}T00:00:00Z`);
    celda(hoja, `A${r}:B${r}`, fecha, { formato: 'dd/mm/yyyy' });
    celda(hoja, `C${r}:C${r}`, f.cajaTurno || '-', { alinear: 'center' });
    celda(hoja, `D${r}:G${r}`, `000-${f.correlativo}`);
    celda(hoja, `H${r}:J${r}`, f.cliente.nombre.trim());
    celda(hoja, `K${r}:K${r}`, f.total, { formato: '"$"#,##0.00' });
    celda(hoja, `L${r}:L${r}`, f.formaPago || cfg.formaPago);
  });

  const ultima = 5 + docs.length;
  const t = ultima + 1;
  const rango = docs.length ? (c) => `${c}6:${c}${ultima}` : (c) => `${c}6:${c}6`;
  const moneda = '"$"#,##0.00';
  celda(hoja, `A${t}:C${t}`, 'Total de Registros', { negrita: true });
  celda(hoja, `D${t}:G${t}`, { formula: `COUNTA(${rango('D')})` }, { negrita: true, alinear: 'center', formato: '0' });
  celda(hoja, `H${t}:J${t}`, 'Sub-Total', { negrita: true });
  celda(hoja, `K${t}:L${t}`, { formula: `SUM(${rango('K')})` }, { negrita: true, alinear: 'right', formato: moneda });
  celda(hoja, `A${t + 1}:G${t + 1}`, 'Formas de Pago', { negrita: true });
  celda(hoja, `H${t + 1}:J${t + 1}`, 'Gran Total', { negrita: true });
  celda(hoja, `K${t + 1}:L${t + 1}`, { formula: `K${t}` }, { negrita: true, alinear: 'right', formato: moneda });
  if (tipo === 'CF') {
    celda(hoja, `A${t + 2}:C${t + 2}`, 'Total Efectivo con IVA');
    celda(hoja, `D${t + 2}:G${t + 2}`, { formula: `K${t + 1}` }, { alinear: 'right', formato: moneda });
    celda(hoja, `A${t + 3}:C${t + 3}`, 'Total sin IVA');
    celda(hoja, `D${t + 3}:G${t + 3}`, { formula: `D${t + 2}/${1 + tasaIva}` }, { alinear: 'right', formato: moneda });
  } else {
    celda(hoja, `A${t + 2}:C${t + 2}`, 'Total Efectivo');
    celda(hoja, `D${t + 2}:G${t + 2}`, { formula: `K${t + 1}` }, { alinear: 'right', formato: moneda });
    celda(hoja, `A${t + 3}:C${t + 3}`, 'Total Tarjeta de Crédito');
    celda(hoja, `D${t + 3}:G${t + 3}`, { formula: `SUMIF(${rango('L')},"Tarjeta de Crédito",${rango('K')})` }, { alinear: 'right', formato: moneda });
    celda(hoja, `A${t + 4}:C${t + 4}`, 'Total Cheque');
    celda(hoja, `D${t + 4}:G${t + 4}`, { formula: `SUMIF(${rango('L')},"Cheque",${rango('K')})` }, { alinear: 'right', formato: moneda });
  }
}

export async function generarRegistroSemanal({ empresa, facturas, iva }) {
  const libro = new ExcelJS.Workbook();
  construirHoja(libro, 'CF', empresa, facturas, iva);
  construirHoja(libro, 'CCF', empresa, facturas, iva);
  return Buffer.from(await libro.xlsx.writeBuffer());
}
