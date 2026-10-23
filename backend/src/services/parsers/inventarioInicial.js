import { leerPaginas } from './pdfText.js';
import { extraerPaginas } from './paginas.js';
import { leerInventarioExcel, completarInventario } from './inventarioExcel.js';
import { extraerJson } from '../ai/gemini.js';

const INSTRUCCIONES = `La imagen es una tabla de inventario de productos (por ejemplo zapatos, bebidas o lácteos). Transcribe exactamente lo que se ve, sin corregir ni recalcular nada.
Devuelve el título de la tabla y cada fila con: número, código (si no hay, null), marca (si no hay, null), modelo (el nombre o descripción del producto), color y talla (null si no existen), existencia (la cantidad), precio unitario y total por fila (null si no aparece).
Si al pie aparecen SUBTOTAL, IVA y TOTAL, devuélvelos; si no aparecen, devuelve null.
Los montos van como números sin símbolo ni separador de miles. Si un valor no se lee con claridad, devuelve null en ese campo.`;

const NUMERO = { type: 'NUMBER', nullable: true };
const TEXTO = { type: 'STRING', nullable: true };

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    titulo: TEXTO,
    filas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          numero: NUMERO,
          codigo: TEXTO,
          marca: TEXTO,
          modelo: TEXTO,
          color: TEXTO,
          talla: NUMERO,
          existencia: NUMERO,
          precioUnitario: NUMERO,
          totalModelo: NUMERO,
        },
        required: ['modelo', 'existencia', 'precioUnitario'],
      },
    },
    subtotal: NUMERO,
    iva: NUMERO,
    total: NUMERO,
  },
  required: ['filas'],
};

export async function paginasSinTexto(buffer) {
  const paginas = await leerPaginas(buffer);
  return paginas.filter((p) => !p.items.length).map((p) => p.numero);
}

export async function leerInventarioInicial(buffer, { paginas = null } = {}) {
  const numeros = paginas ?? (await paginasSinTexto(buffer));
  if (!numeros.length) return null;
  const pdf = await extraerPaginas(buffer, numeros);
  const datos = await extraerJson({ instrucciones: INSTRUCCIONES, archivo: pdf, mime: 'application/pdf', esquema: ESQUEMA });
  return completarInventario({ pagina: numeros[0], subtotal: null, iva: null, total: null, ...datos });
}

const EXCEL = new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

export async function leerInventarioArchivo({ buffer, mime }) {
  if (EXCEL.has(mime)) return leerInventarioExcel(buffer);
  if (mime.startsWith('image/')) {
    const datos = await extraerJson({ instrucciones: INSTRUCCIONES, archivo: buffer, mime, esquema: ESQUEMA });
    return completarInventario({ pagina: 1, subtotal: null, iva: null, total: null, ...datos });
  }
  const sinTexto = await paginasSinTexto(buffer);
  const paginas = sinTexto.length ? sinTexto : (await leerPaginas(buffer)).map((p) => p.numero);
  return leerInventarioInicial(buffer, { paginas });
}
