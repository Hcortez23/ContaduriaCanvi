import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.GEMINI_API_KEY = 'clave-de-prueba';
const { leerFacturas } = await import('../src/services/parsers/index.js');
const { leerMixto, clasificarPagina } = await import('../src/services/parsers/mixto.js');
const { leerPaginas } = await import('../src/services/parsers/pdfText.js');
const { revisarLote } = await import('../src/services/rules/index.js');
const { catalogoDeInventario } = await import('../src/services/inventario/catalogoBase.js');
const { resolverProductos } = await import('../src/services/inventario/productos.js');
const { reporteVentas } = await import('../src/services/inventario/ventas.js');

const fixture = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url));
const inventario = JSON.parse(fixture('inventario-agua.json'));
const catalogo = catalogoDeInventario(inventario);
const EMPRESA = { nrc: '287555-3', nit: '015-06082026-001-8' };

const ventas = await leerFacturas(fixture('nana-semana4.pdf'), 'generico', { respaldoIA: false });
const ordenadas = [...ventas].sort((a, b) => a.factura.correlativo - b.factura.correlativo);
const paraMotor = [...ordenadas.filter((x) => x.factura.tipo === 'CF'), ...ordenadas.filter((x) => x.factura.tipo === 'CCF')];
const doc = (tipo, correlativo) => ventas.find((x) => x.factura.tipo === tipo && x.factura.correlativo === correlativo).factura;

test('formato de la Ñaña: se leen las 50 páginas sin usar IA', async () => {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = async () => (llamadas++, { ok: false, status: 500, json: async () => ({}) });
  try {
    const r = await leerFacturas(fixture('nana-semana4.pdf'), 'generico', { respaldoIA: true });
    assert.equal(llamadas, 0);
    assert.equal(r.length, 50);
    assert.ok(r.every((x) => x.ok));
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(ventas.filter((x) => x.factura.tipo === 'CF').length, 45);
  assert.equal(ventas.filter((x) => x.factura.tipo === 'CCF').length, 5);
});

test('formato de la Ñaña: la factura de consumidor final 180 se lee completa', () => {
  const f = doc('CF', 180);
  assert.equal(f.fecha, '2026-08-31');
  assert.equal(f.observaciones, 'N° de factura 0-180-135');
  assert.equal(f.numeroDocumento, '');
  assert.equal(f.precioIncluyeIva, true);
  assert.equal(f.emisor.nrc, '287555-3');
  assert.equal(f.emisor.nit, '015-06082026-001-8');
  assert.equal(f.cliente.nombre, 'Marie Girron');
  assert.equal(f.cliente.nitDui, '016-03032026-004-4');
  assert.equal(f.condicionPago, 'Pago contra entrega');
  assert.deepEqual(f.lineas.map((l) => [l.cantidad, l.descripcion, l.precioUnitario, l.total]), [
    [3, 'Caja de Botella 500 ml Evian', 5.99, 17.97],
    [2, 'Caja de Botella 500 ml Aqua Pura', 6.33, 12.66],
    [3, 'Caja de Botella 600 ml Las Perlitas', 4.75, 14.24],
  ]);
  assert.equal(f.total, 44.87);
});

test('formato de la Ñaña: el crédito fiscal 20 trae el IVA al final', () => {
  const f = doc('CCF', 20);
  assert.equal(f.precioIncluyeIva, false);
  assert.deepEqual([f.subtotal, f.iva, f.total], [22.5, 2.93, 25.43]);
  assert.equal(f.cliente.nrc, '');
  assert.equal(f.cliente.nitDui, '038-0042026-05-5');
});

test('formato de la Ñaña: una factura sin total se lee igual y queda sin total', () => {
  const f = doc('CF', 173);
  assert.equal(f.total, null);
  assert.equal(f.lineas.length, 2);
});

test('formato de la Ñaña: se reconoce como venta aunque venga mezclado con otros documentos', async () => {
  const paginas = await leerPaginas(fixture('nana-semana4.pdf'));
  assert.ok(paginas.every((p) => clasificarPagina(p) === 'venta'));
  const mezcla = await leerMixto(fixture('nana-semana4.pdf'));
  assert.equal(mezcla.ventas.length, 50);
  assert.equal(mezcla.sinClasificar.length, 0);
});

test('formato de la Ñaña: el motor encuentra solo los errores reales de las facturas', () => {
  const r = revisarLote(paraMotor, { inventariosIniciales: [{ ...inventario, fecha: '2026-08-24' }], catalogo, empresa: EMPRESA });
  const errores = r.hallazgos.filter((h) => h.gravedad === 'ERROR');
  const por = (codigo) => errores.filter((h) => h.codigo === codigo);
  const correlativos = r.hallazgos.filter((h) => h.codigo === 'CORRELATIVO');
  assert.equal(correlativos.length, 2);
  assert.ok(correlativos.every((h) => h.gravedad === 'ADVERTENCIA' && /Faltan los documentos del 1 al/.test(h.detalle)));
  assert.deepEqual(por('TOTAL').map((h) => h.correlativo).sort(), [157, 173]);
  assert.match(por('TOTAL').find((h) => h.correlativo === 173).detalle, /no trae el total/);
  const sinIdentificar = r.hallazgos.filter((h) => h.codigo === 'PRODUCTO SIN IDENTIFICAR');
  assert.equal(sinIdentificar.length, 1);
  assert.equal(sinIdentificar[0].gravedad, 'ADVERTENCIA_GRAVE');
  assert.match(sinIdentificar[0].detalle, /Garrafón 1\.5 L/);
  assert.equal(errores.length, 2);
  assert.equal(r.hallazgos.filter((h) => h.codigo === 'NUMERO DOCUMENTO').length, 0);
  assert.equal(r.hallazgos.filter((h) => h.codigo === 'CLIENTE').length, 0);
});

test('formato de la Ñaña: el precio de la factura no se compara con el del inventario', () => {
  const r = revisarLote(paraMotor, { inventariosIniciales: [{ ...inventario, fecha: '2026-08-24' }], catalogo, empresa: EMPRESA });
  assert.equal(r.hallazgos.filter((h) => h.codigo === 'PRECIO').length, 0);
});

test('precio con IVA incluido: el total de línea se compara con cantidad por precio', () => {
  const lote = (total) => [{
    factura: { tipo: 'CF', correlativo: 1, fecha: '2026-08-24', pagina: 1, precioIncluyeIva: true, emisor: { nombre: 'X', nit: '1', nrc: '2' }, cliente: { nombre: 'C', nitDui: '', nrc: '' }, numeroDocumento: '', subtotal: total, iva: null, percepcion: null, total, lineas: [{ n: 1, descripcion: 'Producto', cantidad: 3, precioUnitario: 4.75, descuento: 0, base: null, iva: null, total }] },
    lectura: { titulo: 'Factura de consumidor final', rotulos: {}, avisos: [], faltantes: [] },
  }];
  assert.equal(revisarLote(lote(14.24)).hallazgos.filter((h) => h.codigo === 'CALCULO').length, 0);
  assert.equal(revisarLote(lote(14.25)).hallazgos.filter((h) => h.codigo === 'CALCULO').length, 0);
  assert.equal(revisarLote(lote(16.1)).hallazgos.filter((h) => h.codigo === 'CALCULO').length, 1);
});

test('precio con IVA incluido: el reporte de ventas separa la base y el IVA', () => {
  const lineas = [{ n: 1, descripcion: 'Caja de Botella 500 ml Evian', cantidad: 3, precioUnitario: 5.99, descuento: 0, base: null, iva: null, total: 17.97 }];
  const factura = { tipo: 'CF', correlativo: 1, fecha: '2026-08-24', precioIncluyeIva: true, total: 17.97, lineas };
  const v = reporteVentas([{ factura }], catalogo, { iva: 0.13 });
  assert.deepEqual([v.totales.base, v.totales.iva, v.totales.total], [15.9, 2.07, 17.97]);
});

test('productos abreviados: "Garrafon 5 galones Cristal" se reconoce, pero un tamaño que no existe no', () => {
  const linea = (descripcion) => ({ factura: { tipo: 'CF', correlativo: 1, pagina: 1, fecha: '2026-08-24', lineas: [{ n: 1, descripcion, cantidad: 1, precioUnitario: 1 }] } });
  const { resueltas, sinIdentificar } = resolverProductos([linea('Garrafon 5 galones Cristal'), linea('Caja Garrafón 1.5 L Cristal')], catalogo);
  assert.equal(resueltas.length, 1);
  assert.equal(catalogo.find((p) => p.clave === resueltas[0].clave).nombre, 'Cristal Caja de Garrafón 5 galones');
  assert.equal(sinIdentificar.length, 1);
});

test('ortografía: se deduce el producto más parecido sin marcar error', () => {
  const linea = (descripcion) => ({ factura: { tipo: 'CF', correlativo: 1, pagina: 1, fecha: '2026-08-24', lineas: [{ n: 1, descripcion, cantidad: 1, precioUnitario: 1 }] } });
  const nombre = (d) => {
    const { resueltas } = resolverProductos([linea(d)], catalogo);
    return resueltas.length ? catalogo.find((p) => p.clave === resueltas[0].clave).nombre : null;
  };
  assert.equal(nombre('Agua pura Caja de botella 500 ml'), 'Aqua Pura Caja de Botella 500 ml');
  assert.equal(nombre('Caja de botella 660 ml Aqua Pura'), null);
});

test('centavos: una diferencia de hasta $0.05 no es error', () => {
  const lote = (subtotal) => [{
    factura: { tipo: 'CCF', correlativo: 1, fecha: '2026-08-24', pagina: 1, emisor: { nombre: 'X', nit: '1', nrc: '2' }, cliente: { nombre: 'C', nitDui: '1', nrc: '1' }, numeroDocumento: '', subtotal, iva: 2.93, percepcion: null, total: 25.43, lineas: [{ n: 1, descripcion: 'P', cantidad: 1, precioUnitario: 22.5, descuento: 0, base: 22.5, iva: null, total: null }] },
    lectura: { titulo: 'Comprobante de crédito fiscal', rotulos: {}, avisos: [], faltantes: [] },
  }];
  assert.equal(revisarLote(lote(22.54)).hallazgos.filter((h) => h.codigo === 'TOTAL').length, 0);
  assert.equal(revisarLote(lote(22.6)).hallazgos.filter((h) => h.codigo === 'TOTAL').length, 1);
});

test('crédito fiscal con el precio ya con IVA: se marca que el IVA se suma otra vez', () => {
  const lote = (precio) => {
    const base = Math.round(precio * 200) / 100;
    const iva = Math.round(base * 13) / 100;
    return [{
      factura: { tipo: 'CCF', correlativo: 1, fecha: '2026-08-24', pagina: 1, emisor: { nombre: 'X', nit: '1', nrc: '287555-3' }, cliente: { nombre: 'C', nitDui: '1', nrc: '1' }, numeroDocumento: '', subtotal: base, iva, percepcion: null, total: Math.round((base + iva) * 100) / 100, lineas: [{ n: 1, descripcion: 'Caja de Botella 600 ml Las Perlitas', cantidad: 2, precioUnitario: precio, descuento: 0, base, iva: null, total: null }] },
      lectura: { titulo: 'Comprobante de crédito fiscal', rotulos: {}, avisos: [], faltantes: [] },
    }];
  };
  const revisar = (precio) => revisarLote(lote(precio), { inventariosIniciales: [{ ...inventario, fecha: '2026-08-24' }], catalogo, empresa: EMPRESA }).hallazgos.filter((h) => h.codigo === 'IVA DUPLICADO');
  assert.equal(revisar(4.2).length, 0);
  const dup = revisar(4.75);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].gravedad, 'ERROR');
});
