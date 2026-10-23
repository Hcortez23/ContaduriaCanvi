import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { leerCompras } from '../src/services/parsers/index.js';
import { catalogoDeInventario } from '../src/services/inventario/catalogoBase.js';
import { resolverProductos } from '../src/services/inventario/productos.js';
import { procesarLote } from '../src/services/lote.js';

const fixture = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url));
const inventario = JSON.parse(fixture('inventario-agua.json'));
const catalogo = catalogoDeInventario(inventario);
const nombre = (clave) => catalogo.find((p) => p.clave === clave).nombre;

const compras = await leerCompras(fixture('compras.pdf'));

test('agua: las 20 líneas de compra se asocian al producto correcto usando al proveedor como marca', () => {
  const { resueltas, sinIdentificar } = resolverProductos(compras, catalogo);
  assert.deepEqual(sinIdentificar.map((s) => s.linea.descripcion), []);
  assert.equal(resueltas.length, 20);
  const asignado = (proveedor, descripcion) =>
    nombre(resueltas.find((r) => r.factura.proveedor.nombre.startsWith(proveedor) && r.linea.descripcion === descripcion).clave).toLowerCase();

  assert.equal(asignado('AQUA PURA', 'Caja de botellas con agua 500 ml'), 'aqua pura caja de botella 500 ml');
  assert.equal(asignado('AGUA PURIFICADA EVIAN', 'Caja de botellas con agua 500 ml'), 'evian caja de botella 500 ml');
  assert.equal(asignado('AQUA PURA', 'Caja de botellas con agua 1.5 L'), 'aqua pura caja de botella 1.5 l');
  assert.equal(asignado('AQUA PURA', 'Caja de botellas con agua 1 L'), 'aqua pura caja de botella 1 l');
  assert.equal(asignado('AGUA SALUD', 'Salud caja de botella 600ml'), 'salud caja de botella 600 ml');
  assert.equal(asignado('AGUA SALUD', 'Salud caja de botella 1.5L'), 'salud caja de botella 1.5 l');
  assert.equal(asignado('AGUA PURIFICADA LAS PERLITAS', 'Caja de garrafones con agua 5 galones'), 'las perlitas caja de garrafón 5 galones');
  assert.equal(asignado('AGUA PURA CRISTAL', 'Caja garrafon 5 galones'), 'cristal caja de garrafón 5 galones');
  assert.equal(asignado('AGUA PURA CRISTAL', 'Caja de botellas de 330 ml'), 'cristal caja de botella 330 ml');
  assert.equal(asignado('AGUA PURIFICADA PERRIER', 'Caja Agua con gas, 750 ml'), 'perrier caja de agua con gas, 750 ml');
  assert.equal(asignado('SAN PELLEGRINO', 'San Pellegrino'), 'san pellegrino caja de agua con gas, 500ml');
  assert.equal(asignado('ALPINA', 'Alpina Caja de botella 1.5L'), 'alpina caja de botella 1.5 l');
});

test('agua: ningún producto del inventario recibe dos líneas de la misma compra por error', () => {
  const { resueltas } = resolverProductos(compras, catalogo);
  const repetidos = new Map();
  for (const r of resueltas) {
    const k = `${r.factura.numeroFactura}|${r.clave}`;
    repetidos.set(k, (repetidos.get(k) ?? 0) + 1);
  }
  assert.deepEqual([...repetidos.values()].filter((n) => n > 1), []);
});

test('agua: sin la marca ni el proveedor, la descripción no basta para decidir', () => {
  const doc = { factura: { tipo: 'COMPRA', correlativo: 1, pagina: 1, fecha: '2026-08-04', lineas: [{ n: 1, descripcion: 'Caja de botellas con agua 500 ml', cantidad: 1, precioUnitario: 1, total: 1 }] } };
  const { sinIdentificar } = resolverProductos([doc], catalogo);
  assert.equal(sinIdentificar.length, 1);
});

test('agua: la marca sola solo sirve si no contradice el tamaño', () => {
  const doc = (descripcion) => ({ factura: { tipo: 'COMPRA', correlativo: 1, pagina: 1, fecha: '2026-08-04', proveedor: { nombre: 'SAN PELLEGRINO' }, lineas: [{ n: 1, descripcion, cantidad: 1, precioUnitario: 1, total: 1 }] } });
  assert.equal(resolverProductos([doc('San Pellegrino')], catalogo).sinIdentificar.length, 0);
  assert.equal(resolverProductos([doc('San Pellegrino 750 ml')], catalogo).sinIdentificar.length, 1);
});

test('agua: el lote completo de compras con el inventario queda listo', () => {
  const resultado = procesarLote([], { compras, inventarioInicial: { ...inventario, fecha: '2026-08-03' }, empresa: { nrc: '287555-3', nit: '015-06082026-001-8' } });
  assert.equal(resultado.estado, 'listo', JSON.stringify(resultado.hallazgos.slice(0, 3)));
});
