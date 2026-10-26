import { PDFDocument } from 'pdf-lib';
import { createCanvas, loadImage } from '@napi-rs/canvas';

// Convierte una imagen (PNG, JPG, WEBP) en un PDF de una página para usar el mismo camino de lectura con IA.
export async function imagenAPdf(buffer, mime) {
  const pdf = await PDFDocument.create();
  let imagen;
  if (mime === 'image/png') imagen = await pdf.embedPng(buffer);
  else if (mime === 'image/jpeg') imagen = await pdf.embedJpg(buffer);
  else {
    const origen = await loadImage(buffer);
    const canvas = createCanvas(origen.width, origen.height);
    canvas.getContext('2d').drawImage(origen, 0, 0);
    imagen = await pdf.embedPng(canvas.toBuffer('image/png'));
  }
  pdf.addPage([imagen.width, imagen.height]).drawImage(imagen, { x: 0, y: 0, width: imagen.width, height: imagen.height });
  return pdf.save();
}

export async function contarPaginas(buffer) {
  return (await PDFDocument.load(buffer)).getPageCount();
}
