import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function leerPaginas(buffer) {
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
  }).promise;
  const paginas = [];
  for (let numero = 1; numero <= doc.numPages; numero++) {
    const page = await doc.getPage(numero);
    const { items } = await page.getTextContent();
    paginas.push({
      numero,
      items: items
        .filter((i) => i.str.trim())
        .map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] })),
    });
  }
  return paginas;
}

export function agruparFilas(items, tolerancia = 3) {
  const orden = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const filas = [];
  for (const item of orden) {
    const fila = filas.find((f) => Math.abs(f.y - item.y) <= tolerancia);
    if (fila) fila.items.push(item);
    else filas.push({ y: item.y, items: [item] });
  }
  return filas.map((f) => ({ y: f.y, items: f.items.sort((a, b) => a.x - b.x) }));
}
