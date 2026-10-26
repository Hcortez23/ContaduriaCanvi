import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { imagenAPdf, contarPaginas } from '../src/services/parsers/imagen.js';

const foto = (formato) => {
  const canvas = createCanvas(40, 60);
  canvas.getContext('2d').fillRect(0, 0, 20, 20);
  return canvas.toBuffer(formato);
};

test('imagen: PNG, JPG y WEBP se convierten en un PDF de una página', async () => {
  for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
    assert.equal(await contarPaginas(await imagenAPdf(foto(mime), mime)), 1, mime);
  }
});
