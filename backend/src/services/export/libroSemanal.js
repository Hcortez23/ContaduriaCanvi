import ExcelJS from 'exceljs';
import { celda } from './estilos.js';

const MONEDA = '"$"#,##0.00';
const formatoFecha = (iso) => iso.split('-').reverse().join('/');

function encabezado(hoja, empresa, titulo, hasta) {
  celda(hoja, `A1:${hasta}1`, `${empresa.nombre} — NRC ${empresa.nrc} — NIT ${empresa.nit}`, { negrita: true, alinear: 'center' });
  celda(hoja, `A2:${hasta}2`, titulo, { negrita: true, tamano: 14, alinear: 'center' });
}

function tablaFacturas(hoja, fila, tipo, docs) {
  const titulo = tipo === 'CF' ? 'CONSUMIDORES FINALES' : 'CRÉDITOS FISCALES';
  celda(hoja, `A${fila}:L${fila}`, titulo, { negrita: true, alinear: 'center' });
  const cab = fila + 1;
  celda(hoja, `A${cab}:B${cab}`, 'Fecha', { negrita: true, alinear: 'center' });
  celda(hoja, `C${cab}:C${cab}`, 'Caj-Tur', { negrita: true, alinear: 'center' });
  celda(hoja, `D${cab}:G${cab}`, 'N. CORRELATIVO', { negrita: true, alinear: 'center' });
  celda(hoja, `H${cab}:J${cab}`, 'Nombre del Cliente', { negrita: true, alinear: 'center' });
  celda(hoja, `K${cab}:K${cab}`, 'Monto', { negrita: true, alinear: 'center' });
  celda(hoja, `L${cab}:L${cab}`, 'Forma de pago', { negrita: true, alinear: 'center' });
  const ordenadas = [...docs].sort((a, b) => a.factura.correlativo - b.factura.correlativo);
  ordenadas.forEach(({ factura: f }, i) => {
    const r = cab + 1 + i;
    celda(hoja, `A${r}:B${r}`, new Date(`${f.fecha}T00:00:00Z`), { formato: 'dd/mm/yyyy' });
    celda(hoja, `C${r}:C${r}`, f.cajaTurno || '-', { alinear: 'center' });
    celda(hoja, `D${r}:G${r}`, `000-${f.correlativo}`);
    celda(hoja, `H${r}:J${r}`, f.cliente.nombre.trim());
    celda(hoja, `K${r}:K${r}`, f.total, { formato: MONEDA });
    celda(hoja, `L${r}:L${r}`, f.formaPago || (tipo === 'CF' ? 'EFECTIVO' : 'CREDITO'));
  });
  const primera = cab + 1;
  const ultima = Math.max(cab + ordenadas.length, primera);
  const t = cab + ordenadas.length + 1;
  celda(hoja, `A${t}:C${t}`, 'Total de Registros', { negrita: true });
  celda(hoja, `D${t}:G${t}`, { formula: `COUNTA(D${primera}:D${ultima})` }, { negrita: true, alinear: 'center', formato: '0' });
  celda(hoja, `H${t}:J${t}`, 'Gran Total', { negrita: true });
  celda(hoja, `K${t}:L${t}`, { formula: `SUM(K${primera}:K${ultima})` }, { negrita: true, alinear: 'right', formato: MONEDA });
  return { siguiente: t + 2, total: `K${t}` };
}

function hojaFacturas(libro, empresa, semana, tasaIva) {
  const hoja = libro.addWorksheet(`Facturas S${semana.numero}`, { pageSetup: { orientation: 'landscape', horizontalCentered: true } });
  [9.1, 9.1, 8.3, 11.1, 11.1, 11.1, 11.1, 10.3, 10.3, 10.3, 14.8, 15.8].forEach((w, i) => (hoja.getColumn(i + 1).width = w));
  encabezado(hoja, empresa, `FACTURAS — SEMANA ${semana.numero} (${formatoFecha(semana.desde)} al ${formatoFecha(semana.hasta)})`, 'L');
  const cf = semana.ventas.filter((d) => d.factura.tipo === 'CF');
  const ccf = semana.ventas.filter((d) => d.factura.tipo === 'CCF');
  const tCF = tablaFacturas(hoja, 4, 'CF', cf);
  const tCCF = tablaFacturas(hoja, tCF.siguiente, 'CCF', ccf);
  const suma = (docs, campo) => Math.round(docs.reduce((s, d) => s + (d.factura[campo] ?? 0), 0) * 100) / 100;
  let r = tCCF.siguiente;
  celda(hoja, `A${r}:L${r}`, 'RESUMEN DE VENTAS DE LA SEMANA', { negrita: true, alinear: 'center' });
  const linea = (etiqueta, valor, negrita = false) => {
    r += 1;
    celda(hoja, `A${r}:G${r}`, etiqueta, { negrita });
    celda(hoja, `H${r}:J${r}`, valor, { negrita, alinear: 'right', formato: MONEDA });
    return `H${r}`;
  };
  const totalCF = linea('Total consumidor final (con IVA)', { formula: tCF.total });
  const cfSinIva = linea('Total consumidor final sin IVA', { formula: `${totalCF}/${1 + tasaIva}` });
  const baseCCF = linea('Total crédito fiscal (base sin IVA)', suma(ccf, 'subtotal'));
  linea('IVA crédito fiscal', suma(ccf, 'iva'));
  linea('1% percepción crédito fiscal', suma(ccf, 'percepcion'));
  linea('Total crédito fiscal', { formula: tCCF.total });
  linea('TOTAL GENERAL DE VENTAS (sin IVA)', { formula: `${cfSinIva}+${baseCCF}` }, true);
}

function tablaInventario(hoja, semana, cols, filaCab) {
  cols.forEach(([titulo], i) => celda(hoja, `${String.fromCharCode(65 + i)}${filaCab}:${String.fromCharCode(65 + i)}${filaCab}`, titulo, { negrita: true, alinear: 'center' }));
}

function totales(hoja, fila, colTotal, ultimaFila, primeraFila, tasaIva, colEtiqueta = 'A', hastaEtiqueta = 'F') {
  const filaSub = fila;
  celda(hoja, `${colEtiqueta}${filaSub}:${hastaEtiqueta}${filaSub}`, 'SUBTOTAL', { negrita: true });
  celda(hoja, `${colTotal}${filaSub}:${colTotal}${filaSub}`, { formula: `SUM(${colTotal}${primeraFila}:${colTotal}${ultimaFila})` }, { negrita: true, formato: MONEDA });
  celda(hoja, `${colEtiqueta}${filaSub + 1}:${hastaEtiqueta}${filaSub + 1}`, `IVA (${Math.round(tasaIva * 100)}%)`, { negrita: true });
  celda(hoja, `${colTotal}${filaSub + 1}:${colTotal}${filaSub + 1}`, { formula: `ROUND(${colTotal}${filaSub}*${tasaIva},2)` }, { negrita: true, formato: MONEDA });
  celda(hoja, `${colEtiqueta}${filaSub + 2}:${hastaEtiqueta}${filaSub + 2}`, 'TOTAL', { negrita: true });
  celda(hoja, `${colTotal}${filaSub + 2}:${colTotal}${filaSub + 2}`, { formula: `${colTotal}${filaSub}+${colTotal}${filaSub + 1}` }, { negrita: true, formato: MONEDA });
}

function hojaInicial(libro, empresa, semana, tasaIva) {
  const hoja = libro.addWorksheet(`Inventario inicial S${semana.numero}`);
  encabezado(hoja, empresa, `INVENTARIO INICIAL — SEMANA ${semana.numero}`, 'J');
  const cols = [['N.°'], ['Código'], ['Modelo'], ['Color'], ['Talla'], ['Saldo anterior'], ['Compras'], ['Existencia después de compras'], ['Precio unitario'], ['Total por modelo']];
  [6, 11, 24, 18, 8, 12, 11, 16, 14, 16].forEach((w, i) => (hoja.getColumn(i + 1).width = w));
  tablaInventario(hoja, semana, cols, 4);
  semana.filas.forEach((f, i) => {
    const r = 5 + i;
    celda(hoja, `A${r}:A${r}`, i + 1, { alinear: 'center' });
    celda(hoja, `B${r}:B${r}`, f.clave);
    celda(hoja, `C${r}:C${r}`, f.modelo);
    celda(hoja, `D${r}:D${r}`, f.color);
    celda(hoja, `E${r}:E${r}`, f.talla, { alinear: 'center' });
    celda(hoja, `F${r}:F${r}`, f.saldo, { alinear: 'center' });
    celda(hoja, `G${r}:G${r}`, f.compras, { alinear: 'center' });
    celda(hoja, `H${r}:H${r}`, { formula: `F${r}+G${r}` }, { alinear: 'center' });
    celda(hoja, `I${r}:I${r}`, f.precioUnitario, { formato: MONEDA });
    celda(hoja, `J${r}:J${r}`, { formula: `H${r}*I${r}` }, { formato: MONEDA });
  });
  const ultima = 4 + semana.filas.length;
  totales(hoja, ultima + 2, 'J', ultima, 5, tasaIva, 'G', 'I');
}

function hojaFinal(libro, empresa, semana, tasaIva) {
  const hoja = libro.addWorksheet(`Inventario final S${semana.numero}`);
  encabezado(hoja, empresa, `INVENTARIO FINAL — SEMANA ${semana.numero}`, 'J');
  const cols = [['N.°'], ['Código'], ['Modelo'], ['Color'], ['Talla'], ['Existencia inicial'], ['Vendidas'], ['Existencia final'], ['Precio unitario'], ['Total por modelo']];
  [6, 11, 24, 18, 8, 12, 11, 14, 14, 16].forEach((w, i) => (hoja.getColumn(i + 1).width = w));
  tablaInventario(hoja, semana, cols, 4);
  const origen = `'Inventario inicial S${semana.numero}'`;
  semana.filas.forEach((f, i) => {
    const r = 5 + i;
    celda(hoja, `A${r}:A${r}`, i + 1, { alinear: 'center' });
    celda(hoja, `B${r}:B${r}`, f.clave);
    celda(hoja, `C${r}:C${r}`, f.modelo);
    celda(hoja, `D${r}:D${r}`, f.color);
    celda(hoja, `E${r}:E${r}`, f.talla, { alinear: 'center' });
    celda(hoja, `F${r}:F${r}`, { formula: `${origen}!H${r}` }, { alinear: 'center' });
    celda(hoja, `G${r}:G${r}`, f.vendidas, { alinear: 'center' });
    celda(hoja, `H${r}:H${r}`, { formula: `F${r}-G${r}` }, { alinear: 'center', negrita: true });
    celda(hoja, `I${r}:I${r}`, f.precioUnitario, { formato: MONEDA });
    celda(hoja, `J${r}:J${r}`, { formula: `H${r}*I${r}` }, { formato: MONEDA });
  });
  const ultima = 4 + semana.filas.length;
  hoja.addConditionalFormatting({
    ref: `H5:H${ultima}`,
    rules: [{ type: 'cellIs', operator: 'lessThan', formulae: [0], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8CBAD' } } } }],
  });
  totales(hoja, ultima + 2, 'J', ultima, 5, tasaIva, 'G', 'I');
}

export async function generarLibroSemanal({ empresa, semanas, iva }) {
  const libro = new ExcelJS.Workbook();
  for (const semana of semanas) {
    hojaFacturas(libro, empresa, semana, iva);
    hojaInicial(libro, empresa, semana, iva);
    hojaFinal(libro, empresa, semana, iva);
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}
