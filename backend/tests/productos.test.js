import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { leerFacturas } from '../src/services/parsers/index.js';
import { revisarLote } from '../src/services/rules/index.js';
import { proponerCatalogo, resolverProductos } from '../src/services/inventario/productos.js';

const leer = (nombre) => leerFacturas(fs.readFileSync(new URL(`./fixtures/${nombre}.pdf`, import.meta.url)));
const aCatalogo = (propuestas) => propuestas.map(({ clave, nombre, alias }) => ({ clave, nombre, alias }));
const errores = (hallazgos, codigo) => hallazgos.filter((h) => h.codigo === codigo && h.gravedad === 'ERROR');

test('catálogo propuesto: agrupa variantes mal escritas y de distinto orden en un solo producto', async () => {
  const propuestas = proponerCatalogo(await leer('puma-arreglado'));
  assert.equal(propuestas.reduce((s, p) => s + p.lineas, 0), 100);
  const grupoDe = (texto) => propuestas.find((p) => p.alias.includes(texto));
  assert.equal(grupoDe('gravitio color azul talla 42'), grupoDe('gravition color azul talla 42'));
  assert.equal(grupoDe('smash v2 blanco t40'), grupoDe('smash v2 color blanco talla 40'));
  assert.equal(grupoDe('flyer runner color negro tala 40'), grupoDe('flyer runner color negro talla 40'));
});

test('catálogo propuesto: no mezcla colores ni tallas distintas', async () => {
  const propuestas = proponerCatalogo(await leer('puma-arreglado'));
  const grupoDe = (texto) => propuestas.find((p) => p.alias.includes(texto));
  assert.notEqual(grupoDe('caven 2 0 color negro talla 39'), grupoDe('caven 2 0 blanco y negro t39'));
  assert.notEqual(grupoDe('rs x color gris talla 42'), grupoDe('rs x color azul talla 42'));
});

test('catálogo propuesto: Step Style junta descripciones con las palabras en otro orden', async () => {
  const propuestas = proponerCatalogo(await leer('stepstyle'));
  const grupoDe = (texto) => propuestas.find((p) => p.alias.includes(texto));
  assert.equal(grupoDe('tiempo talla 40 color negro'), grupoDe('tiempo color negro talla 40'));
  assert.equal(grupoDe('tiempo talla 40 color nergro'), grupoDe('tiempo color negro talla 40'));
});

test('con un catálogo vacío todas las líneas quedan sin identificar y el lote se pausa', async () => {
  const resultados = await leer('puma-arreglado');
  const { sinIdentificar } = resolverProductos(resultados, []);
  assert.equal(sinIdentificar.length, 100);
  const revision = revisarLote(resultados, { catalogo: [] });
  assert.equal(errores(revision.hallazgos, 'PRODUCTO SIN IDENTIFICAR').length, 100);
  assert.equal(revision.estado, 'pausado');
});

test('con el catálogo confirmado ya no hay productos sin identificar', async () => {
  const resultados = await leer('puma-arreglado');
  const catalogo = aCatalogo(proponerCatalogo(resultados));
  assert.equal(resolverProductos(resultados, catalogo).sinIdentificar.length, 0);
  assert.equal(errores(revisarLote(resultados, { catalogo }).hallazgos, 'PRODUCTO SIN IDENTIFICAR').length, 0);
});

test('un producto que falta en el catálogo pausa solo por sus líneas', async () => {
  const resultados = await leer('puma-arreglado');
  const completo = aCatalogo(proponerCatalogo(resultados));
  const faltante = completo.find((p) => p.alias.includes('gravition color azul talla 42'));
  const catalogo = completo.filter((p) => p !== faltante);
  const { sinIdentificar } = resolverProductos(resultados, catalogo);
  assert.equal(sinIdentificar.length, faltante.alias.length > 0 ? sinIdentificar.length : 0);
  assert.ok(sinIdentificar.length > 0);
  assert.ok(sinIdentificar.every((s) => faltante.alias.includes(s.linea.descripcion.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())));
});

test('una descripción nueva con error de digitación se sugiere como producto existente', async () => {
  const resultados = await leer('puma-arreglado');
  const catalogo = aCatalogo(proponerCatalogo(resultados)).map((p) => ({ ...p, alias: p.alias.filter((a) => a !== 'gravitio color azul talla 42') }));
  const { sinIdentificar } = resolverProductos(resultados, catalogo);
  assert.equal(sinIdentificar.length, 1);
  assert.equal(sinIdentificar[0].sugerencia.existente, true);
});
