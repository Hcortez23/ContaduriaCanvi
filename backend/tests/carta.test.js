import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import { leerFacturas } from '../src/services/parsers/index.js';
import { revisarLote } from '../src/services/rules/index.js';
import { catalogoDeInventario } from '../src/services/inventario/catalogoBase.js';
import { generarCarta } from '../src/services/export/carta.js';

const fixture = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url));

async function textoDe(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

test('carta: lista los errores y observaciones de Puma con su corrección', async () => {
  const resultados = await leerFacturas(fixture('puma-original.pdf'));
  const inventarioInicial = JSON.parse(fixture('inventario-puma-original.json'));
  const { hallazgos } = revisarLote(resultados, { catalogo: catalogoDeInventario(inventarioInicial), inventarioInicial });
  const buffer = await generarCarta({ empresa: { nombre: 'Puma Footwear', nrc: '904036-1', nit: '850-79398290-103-7' }, hallazgos, fecha: new Date('2026-10-23T12:00:00') });
  const texto = await textoDe(buffer);
  for (const esperado of ['PUMA FOOTWEAR', 'NRC 904036-1', 'A. Errores que deben corregirse', 'B. Observaciones', 'Facturas emitidas', 'Inventario inicial', 'TOTAL', 'Cómo corregirlo', '[Nombre y firma del contador]']) {
    assert.ok(texto.includes(esperado), esperado);
  }
  assert.match(texto, /Documento Qué pasó.* Consumidor final 1 .* Consumidor final 2 /);
  assert.match(texto, /45 casos/);
});

test('carta: un documento válido de Word', async () => {
  const buffer = await generarCarta({ empresa: { nombre: 'Demo', nrc: '1', nit: '' }, hallazgos: [{ tipo: 'CF', correlativo: 1, gravedad: 'ERROR', codigo: 'TOTAL', detalle: 'x', correccion: 'y' }] });
  const zip = await JSZip.loadAsync(buffer);
  assert.ok(zip.file('word/document.xml'));
  assert.ok(zip.file('[Content_Types].xml'));
});
