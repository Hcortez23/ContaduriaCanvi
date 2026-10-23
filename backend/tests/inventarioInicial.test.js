import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { leerFacturas } from '../src/services/parsers/index.js';
import { revisarInventarioInicial } from '../src/services/rules/inventarioInicial.js';
import { catalogoDeInventario } from '../src/services/inventario/catalogoBase.js';
import { resolverProductos } from '../src/services/inventario/productos.js';
import { procesarLote } from '../src/services/lote.js';

const leerPdf = (n) => leerFacturas(fs.readFileSync(new URL(`./fixtures/${n}.pdf`, import.meta.url)));
const leerInv = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/inventario-${n}.json`, import.meta.url)));
const op = { iva: 0.13 };

test('inventario inicial de Puma: las filas cuadran pero el subtotal no', () => {
  const h = revisarInventarioInicial(leerInv('puma-original'), op);
  assert.equal(h.length, 1);
  assert.equal(h[0].codigo, 'SUBTOTAL');
  assert.match(h[0].detalle, /\$38816\.00/);
  assert.match(h[0].correccion, /\$38736\.00.*\$5035\.68.*\$43771\.68/);
});

test('inventario inicial de Step Style: el subtotal difiere por $5,660', () => {
  const h = revisarInventarioInicial(leerInv('stepstyle'), op);
  assert.deepEqual(h.map((x) => x.codigo), ['SUBTOTAL']);
  assert.match(h[0].detalle, /\$89840\.00/);
});

test('inventario inicial: detecta fila mal multiplicada, código repetido y campos ilegibles', () => {
  const inv = structuredClone(leerInv('puma-original'));
  inv.filas[0].totalModelo = 1000;
  inv.filas[1].codigo = inv.filas[0].codigo;
  inv.filas[2].existencia = null;
  const codigos = revisarInventarioInicial(inv, op).map((x) => x.codigo);
  for (const esperado of ['CALCULO', 'DUPLICADO', 'LECTURA']) assert.ok(codigos.includes(esperado), esperado);
});

test('catálogo de Puma: 97 de 100 líneas se identifican y las 3 restantes son discrepancias reales', async () => {
  const resultados = await leerPdf('puma-original');
  const { resueltas, sinIdentificar } = resolverProductos(resultados, catalogoDeInventario(leerInv('puma-original')));
  assert.equal(resueltas.length, 97);
  const razones = sinIdentificar.map((s) => `${s.linea.descripcion}: ${s.sugerencia.razon}`);
  assert.equal(razones.filter((r) => /talla 49 no existe.*40/.test(r)).length, 2);
  assert.ok(razones.some((r) => /RS-X, Gris y blanco, T42.*color "blanco"/.test(r)));
});

test('catálogo: los errores de digitación del modelo se corrigen contra el inventario inicial', async () => {
  const resultados = await leerPdf('puma-original');
  const { resueltas } = resolverProductos(resultados, catalogoDeInventario(leerInv('puma-original')));
  const claveDe = (texto) => resueltas.find((r) => r.linea.descripcion === texto)?.clave;
  assert.equal(claveDe('Gravitio color azul talla 42'), 'PM-019');
  assert.equal(claveDe('Velocy Nitro color negro talla 41'), 'PM-013');
  assert.equal(claveDe('Futuro Rider color verde talla 41'), 'PM-010');
  assert.equal(claveDe('Smash V2, blanco, T40'), 'PM-001');
});

test('catálogo de Step Style: marca tallas y colores que no existen en el inventario inicial', async () => {
  const resultados = await leerPdf('stepstyle');
  const { sinIdentificar } = resolverProductos(resultados, catalogoDeInventario(leerInv('stepstyle')));
  const razones = sinIdentificar.map((s) => `${s.linea.descripcion}: ${s.sugerencia.razon}`);
  assert.ok(razones.some((r) => /Air Max 90 Talla 39.*talla 39 no existe.*42/.test(r)));
  assert.ok(razones.some((r) => /Pegasus color gris talla 41.*talla 41 no existe/.test(r)));
  assert.ok(razones.some((r) => /Air Force 1 07 Talla 41 color Blanco.*color "blanco"/.test(r)));
});

function inventario(subtotal) {
  return {
    pagina: 1,
    filas: [
      { numero: 1, codigo: 'X-001', modelo: 'Zapato Uno', color: 'Negro', talla: 40, existencia: 10, precioUnitario: 100, totalModelo: 1000 },
      { numero: 2, codigo: 'X-002', modelo: 'Bota Dos', color: 'Azul y blanco', talla: 42, existencia: 5, precioUnitario: 50, totalModelo: 250 },
    ],
    subtotal,
    iva: Math.round(subtotal * 13) / 100,
    total: Math.round(subtotal * 113) / 100,
  };
}

function venta(correlativo, descripcion, cantidad, precio) {
  const base = cantidad * precio;
  const total = Math.round(base * 113) / 100;
  return {
    factura: {
      tipo: 'CF',
      correlativo,
      fecha: '2026-08-03',
      pagina: correlativo,
      emisor: { nombre: 'Demo', nit: '1', nrc: '2' },
      cliente: { nombre: `Cliente ${correlativo}`, nitDui: '123', nrc: '' },
      lineas: [{ n: 1, descripcion, cantidad, precioUnitario: precio, descuento: 0, base, iva: Math.round(base * 13) / 100, total }],
      subtotal: total,
      iva: null,
      percepcion: null,
      total,
      numeroDocumento: '10',
    },
    lectura: { titulo: 'FACTURA DE CONSUMIDOR FINAL', rotulos: {}, avisos: [], faltantes: [] },
  };
}

test('lote completo: inventario inicial correcto + ventas limpias = inventario final por código', () => {
  const ventas = [venta(1, 'Zapato Uno color negro talla 40', 3, 100), venta(2, 'Bota Dos color azul talla 42', 1, 50)];
  const r = procesarLote(ventas, { inventarioInicial: inventario(1250) });
  assert.equal(r.estado, 'listo');
  const final = Object.fromEntries(r.inventario.productos.map((p) => [p.clave, p.final]));
  assert.deepEqual(final, { 'X-001': 7, 'X-002': 4 });
  assert.equal(r.ventas.totales.unidades, 4);
});

test('lote completo: el subtotal mal sumado del inventario inicial pausa todo', () => {
  const ventas = [venta(1, 'Zapato Uno color negro talla 40', 3, 100)];
  const r = procesarLote(ventas, { inventarioInicial: inventario(1300) });
  assert.equal(r.estado, 'pausado');
  assert.ok(r.hallazgos.some((h) => h.tipo === 'INVENTARIO' && h.codigo === 'SUBTOTAL'));
  assert.equal(r.inventario, null);
});

test('lote completo: vender más de lo que hay en el inventario inicial genera alerta de negativo', () => {
  const ventas = [venta(1, 'Bota Dos color azul talla 42', 6, 50)];
  const r = procesarLote(ventas, { inventarioInicial: inventario(1250) });
  assert.equal(r.estado, 'listo');
  assert.deepEqual(r.inventario.alertas.map((a) => [a.clave, a.final]), [['X-002', -1]]);
});

const aguaRedondeada = (filas) => ({
  pagina: 1,
  filas: filas.map(([codigo, existencia, precioUnitario, totalModelo], i) => ({ numero: i + 1, codigo, modelo: `Producto ${codigo}`, marca: null, color: null, talla: null, existencia, precioUnitario, totalModelo })),
  subtotal: null,
  iva: null,
  total: null,
});

test('inventario inicial: un total por modelo redondeado al dólar no es un error', () => {
  const h = revisarInventarioInicial(aguaRedondeada([['A', 134, 5.6, 750], ['B', 134, 4.2, 563], ['C', 101, 4.5, 455], ['D', 69, 7.5, 518]]), op);
  assert.deepEqual(h, []);
});

test('inventario inicial: una diferencia mayor al redondeo en un modelo sí se marca', () => {
  const h = revisarInventarioInicial(aguaRedondeada([['A', 134, 5.6, 751], ['B', 10, 5, 500]]), op);
  assert.deepEqual(h.map((x) => [x.codigo, /\bA\b/.test(x.detalle) || /Producto A|^.*A /.test(x.detalle)]), [['CALCULO', true], ['CALCULO', false]]);
});

test('inventario inicial: un subtotal que difiere solo por el redondeo de las filas no es un error', () => {
  const inv = aguaRedondeada([['A', 134, 5.6, 750], ['B', 134, 4.2, 563], ['C', 101, 4.5, 455]]);
  Object.assign(inv, { subtotal: 1768.7, iva: 229.93, total: 1998.63 });
  assert.deepEqual(revisarInventarioInicial(inv, op), []);
});

test('inventario inicial: el redondeo no tapa un subtotal realmente mal sumado', () => {
  const inv = aguaRedondeada([['A', 134, 5.6, 750], ['B', 134, 4.2, 563]]);
  Object.assign(inv, { subtotal: 1500, iva: 195, total: 1695 });
  assert.deepEqual(revisarInventarioInicial(inv, op).map((x) => x.codigo), ['SUBTOTAL']);
});
