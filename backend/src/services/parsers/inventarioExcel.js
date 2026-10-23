import ExcelJS from 'exceljs';
import { normalizar } from '../../utils/texto.js';
import { HttpError } from '../../utils/errores.js';

const limpiar = (texto) => normalizar(texto).replace(/[^a-z0-9]+/g, ' ').trim();
const empieza = (h, ...prefijos) => prefijos.some((p) => h === p || h.startsWith(`${p} `) || (p.length > 3 && h.startsWith(p)));

const COLUMNAS = [
  ['codigo', (h) => empieza(h, 'codigo', 'cod', 'sku')],
  ['numero', (h) => h === 'n' || h === 'no' || h === 'numero' || empieza(h, 'item')],
  ['marca', (h) => h === 'marca'],
  ['modelo', (h) => empieza(h, 'modelo', 'descripcion', 'producto', 'articulo', 'detalle')],
  ['color', (h) => h === 'color'],
  ['talla', (h) => h === 'talla'],
  ['existencia', (h) => empieza(h, 'existencia', 'cantidad', 'stock', 'unidades')],
  ['precioUnitario', (h) => empieza(h, 'precio', 'costo')],
  ['totalModelo', (h) => h.startsWith('total')],
];

function crudo(celda) {
  let v = celda.value;
  if (v && typeof v === 'object') {
    if ('result' in v) v = v.result;
    else if (v.richText) v = v.richText.map((t) => t.text).join('');
    else if ('text' in v) v = v.text;
  }
  return v ?? null;
}

function aNumero(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isNaN(n) ? null : n;
}

const aTexto = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());

function encontrarCabecera(hoja) {
  for (let r = 1; r <= Math.min(hoja.rowCount, 30); r++) {
    const columnas = {};
    hoja.getRow(r).eachCell((celda, c) => {
      const encabezado = limpiar(String(crudo(celda) ?? ''));
      if (!encabezado) return;
      const columna = COLUMNAS.find(([clave, regla]) => !(clave in columnas) && regla(encabezado));
      if (columna) columnas[columna[0]] = c;
    });
    if ('modelo' in columnas && 'existencia' in columnas && 'precioUnitario' in columnas) return { fila: r, columnas };
  }
  return null;
}

export function completarInventario(inventario) {
  const filas = inventario.filas.map((f, i) => ({
    ...f,
    numero: f.numero ?? i + 1,
    codigo: aTexto(f.codigo) ?? `P-${String(i + 1).padStart(3, '0')}`,
    marca: aTexto(f.marca),
    color: aTexto(f.color),
    talla: f.talla ?? null,
  }));
  return { ...inventario, filas };
}

export async function leerInventarioExcel(buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  for (const hoja of libro.worksheets) {
    const cabecera = encontrarCabecera(hoja);
    if (!cabecera) continue;
    const { fila, columnas } = cabecera;
    const celda = (r, clave) => (clave in columnas ? crudo(hoja.getCell(r, columnas[clave])) : null);

    const filas = [];
    let r = fila + 1;
    for (; r <= hoja.rowCount; r++) {
      const modelo = aTexto(celda(r, 'modelo'));
      if (!modelo) break;
      filas.push({
        numero: aNumero(celda(r, 'numero')) ?? filas.length + 1,
        codigo: aTexto(celda(r, 'codigo')),
        marca: aTexto(celda(r, 'marca')),
        modelo,
        color: aTexto(celda(r, 'color')),
        talla: aNumero(celda(r, 'talla')),
        existencia: aNumero(celda(r, 'existencia')),
        precioUnitario: aNumero(celda(r, 'precioUnitario')),
        totalModelo: aNumero(celda(r, 'totalModelo')),
      });
    }

    const totales = { subtotal: null, iva: null, total: null };
    for (; r <= hoja.rowCount; r++) {
      let etiqueta = null;
      let valor = null;
      hoja.getRow(r).eachCell((c) => {
        const v = crudo(c);
        if (etiqueta === null && typeof v === 'string' && limpiar(v)) etiqueta = limpiar(v);
        else if (etiqueta !== null && valor === null && aNumero(v) !== null) valor = aNumero(v);
      });
      if (etiqueta === null || valor === null) continue;
      if (etiqueta.startsWith('subtotal')) totales.subtotal = valor;
      else if (etiqueta.startsWith('iva')) totales.iva = valor;
      else if (etiqueta === 'total' && totales.subtotal !== null) totales.total = valor;
    }

    let titulo = null;
    for (let t = 1; t < fila && titulo === null; t++) {
      hoja.getRow(t).eachCell((c) => {
        const v = crudo(c);
        if (titulo === null && typeof v === 'string' && v.trim()) titulo = v.trim();
      });
    }
    return completarInventario({ pagina: 1, titulo, filas, ...totales });
  }
  throw new HttpError(422, 'No encontré una tabla de inventario. Debe tener, como mínimo, las columnas de producto (modelo o descripción), existencia (o cantidad) y precio unitario');
}
