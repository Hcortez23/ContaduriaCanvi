import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { leerFacturas, leerCompras } from '../src/services/parsers/index.js';
import { procesarLote } from '../src/services/lote.js';
import { sumarDias } from '../src/services/inventario/semanas.js';
import { Pagina, completarFactura, dibujarCF, dibujarCCF, redondear } from './lib/pdfPuma.mjs';
import { dibujarCompra, tamanoCompra } from './lib/pdfCompra.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(aqui, '../../..');
const BASE = path.join(RAIZ, 'Puma Footwear - facturas sin errores.pdf');
const SALIDA = path.join(RAIZ, 'pruebas-puma');
const inventario = JSON.parse(fs.readFileSync(path.join(aqui, '../tests/fixtures/inventario-puma-corregido.json'), 'utf8'));

function generador(semilla) {
  let s = semilla;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = generador(2026);
const entero = (a, b) => a + Math.floor(azar() * (b - a + 1));
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
const ponderado = (opciones) => {
  let r = azar();
  for (const [valor, peso] of opciones) {
    r -= peso;
    if (r < 0) return valor;
  }
  return opciones[opciones.length - 1][0];
};

const NOMBRES = ['Marta', 'José', 'Carlos', 'Ana', 'Luis', 'Rosa', 'Miguel', 'Karla', 'Oscar', 'Elena', 'Jorge', 'Sandra', 'Pedro', 'Gloria', 'Walter', 'Diana', 'Ricardo', 'Lidia', 'Mauricio', 'Teresa', 'Hugo', 'Beatriz', 'Nelson', 'Yesenia'];
const APELLIDOS = ['Martínez', 'Hernández', 'López', 'García', 'Rivera', 'Flores', 'Chacón', 'Portillo', 'Alas', 'Guevara', 'Reyes', 'Mejía', 'Orellana', 'Tejada', 'Avelar', 'Bonilla', 'Menjívar', 'Landaverde', 'Cruz', 'Serrano'];
const LUGARES = ['Agua Caliente', 'Nueva Concepción', 'Tejutla', 'Obrajuelo', 'San Antonio', 'Metayate', 'El Coyolito', 'Chalatenango', 'La Palma', 'Santa Rosa'];
const usados = new Set();
function nombreNuevo() {
  for (;;) {
    const nombre = `${elegir(NOMBRES)} ${elegir(NOMBRES)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`;
    if (!usados.has(nombre)) {
      usados.add(nombre);
      return nombre;
    }
  }
}

const EMISOR_CF = { nombre: 'Puma Footwear', nit: '850-79398290-103-7', nrc: '904036-1', direccion: 'Agua caliente chalatenango', dui: '79380025-1' };
const EMISOR_CCF = { ...EMISOR_CF, dui: '', direccion: 'Barrio el centro, Agua Caliente distrito Chalatenango Centro' };

const productos = inventario.filas.map((f) => ({ ...f, colores: f.color.split(' y ').map((c) => c.toLowerCase()) }));

function lineasAleatorias(stock, cantidadLineas, cantidadPor, formato) {
  const elegidas = new Set();
  const lineas = [];
  for (let i = 0; i < cantidadLineas; i++) {
    const cantidad = cantidadPor();
    const posibles = productos.filter((p) => !elegidas.has(p.codigo) && stock.get(p.codigo) >= cantidad);
    if (!posibles.length) break;
    const p = elegir(posibles);
    elegidas.add(p.codigo);
    stock.set(p.codigo, stock.get(p.codigo) - cantidad);
    lineas.push({ descripcion: formato(p), cantidad, precioUnitario: p.precioUnitario });
  }
  return lineas;
}

const descripcionCF = (p) => `${p.modelo} color ${elegir(p.colores)} talla ${p.talla}`;
const descripcionCCF = (p) => `${p.modelo}, ${p.color}, T${p.talla}`;

function armarCF(fecha, correlativo, stock) {
  const cantidadLineas = ponderado([[1, 0.25], [2, 0.6], [3, 0.15]]);
  const lineas = lineasAleatorias(stock, cantidadLineas, () => ponderado([[1, 0.55], [2, 0.35], [3, 0.1]]), descripcionCF);
  return completarFactura({
    tipo: 'CF',
    correlativo,
    numeroDocumento: '9000-7095',
    fecha,
    condicionPago: 'al contado',
    emisor: EMISOR_CF,
    cliente: { nombre: nombreNuevo(), nitDui: '', nrc: '', direccion: `${elegir(LUGARES)}, chalatenango`, giro: '' },
    lineas,
  });
}

function armarCCF(fecha, correlativo, stock) {
  const lineas = lineasAleatorias(stock, 2, () => entero(2, 5), descripcionCCF);
  return completarFactura({
    tipo: 'CCF',
    correlativo,
    numeroDocumento: '6185-0746',
    fecha,
    condicionPago: '',
    emisor: EMISOR_CCF,
    cliente: { nombre: 'Alberto Maldonado', nitDui: '', nrc: '164575-7', direccion: 'Nueva Concepción, Chalatenango', giro: 'venta y compra de zapatos' },
    lineas,
  });
}

function ventasDeLaSemana(lunes, primerCF, primerCCF, stock) {
  const cf = [];
  const ccf = [];
  for (let d = 0; d < 5; d++) {
    const fecha = sumarDias(lunes, d);
    for (let i = 0; i < 9; i++) cf.push(armarCF(fecha, primerCF + cf.length, stock));
    ccf.push(armarCCF(fecha, primerCCF + ccf.length, stock));
  }
  return [...cf, ...ccf];
}

const PROVEEDORES = [
  { nombre: 'Distribuidora Deportiva Centroamericana, S.A. de C.V.', direccion: 'Boulevard del Ejército, km 4, local 12', ciudad: 'San Salvador, 1101', telefono: '2250-4410' },
  { nombre: 'Importadora de Calzado Cuscatlán, S.A. de C.V.', direccion: 'Avenida Roosevelt, local 7, colonia Escalón', ciudad: 'San Salvador, 1101', telefono: '2263-1180' },
  { nombre: 'Comercial Zapatos y Más, S.A. de C.V.', direccion: 'Calle Principal, local 3, Barrio El Centro', ciudad: 'Chalatenango, 1301', telefono: '2301-7745' },
];
const FACTURAR_A = { nombre: 'Puma Footwear', direccion: 'Agua caliente chalatenango', ciudad: 'Chalatenango', telefono: '2301-0000', nit: '850-79398290-103-7', nrc: '904036-1' };

function comprasDeLaSemana(fechas, primerNumero, stock) {
  const menores = [...productos].sort((a, b) => stock.get(a.codigo) - stock.get(b.codigo)).slice(0, 9);
  return PROVEEDORES.map((proveedor, i) => {
    const lineas = menores.slice(i * 3, i * 3 + 3).map((p) => {
      const cantidad = entero(10, 20);
      const precioUnitario = redondear(p.precioUnitario * 0.6);
      return { codigo: p.codigo, descripcion: `${p.modelo} color ${p.colores[0]} talla ${p.talla}`, cantidad, precioUnitario, total: redondear(cantidad * precioUnitario) };
    });
    const subtotal = redondear(lineas.reduce((s, l) => s + l.total, 0));
    const iva = redondear(subtotal * 0.13);
    const percepcion = subtotal > 250 ? redondear(subtotal * 0.01) : null;
    return {
      proveedor,
      numeroFactura: String(primerNumero + i),
      fecha: fechas[i],
      facturarA: FACTURAR_A,
      lineas,
      subtotal,
      iva,
      percepcion,
      total: redondear(subtotal + iva + (percepcion ?? 0)),
    };
  });
}

async function escribirVentas(archivo, facturas) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const f of facturas) {
    const pagina = new Pagina(pdf, normal, negrita);
    if (f.tipo === 'CF') dibujarCF(pagina, f);
    else dibujarCCF(pagina, f);
  }
  fs.writeFileSync(archivo, await pdf.save());
}

async function escribirCompras(archivo, compras) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const c of compras) dibujarCompra(new Pagina(pdf, normal, negrita, tamanoCompra), c);
  fs.writeFileSync(archivo, await pdf.save());
}


async function escribirInventarioExcel(archivo) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Inventario');
  hoja.addRow(['INVENTARIO DE ZAPATOS PUMA']);
  hoja.addRow(['N.°', 'Código', 'Modelo de zapato Puma', 'Color', 'Talla', 'Existencia', 'Precio unitario', 'Total por modelo']);
  for (const f of inventario.filas) hoja.addRow([f.numero, f.codigo, f.modelo, f.color, f.talla, f.existencia, f.precioUnitario, f.totalModelo]);
  hoja.addRow(['SUBTOTAL', null, null, null, null, null, null, inventario.subtotal]);
  hoja.addRow(['IVA (13%)', null, null, null, null, null, null, inventario.iva]);
  hoja.addRow(['TOTAL', null, null, null, null, null, null, inventario.total]);
  hoja.columns.forEach((c) => (c.width = 20));
  await libro.xlsx.writeFile(archivo);
}

async function unirPdfs(archivo, origenes) {
  const destino = await PDFDocument.create();
  for (const o of origenes) {
    const doc = await PDFDocument.load(fs.readFileSync(o));
    (await destino.copyPages(doc, doc.getPageIndices())).forEach((p) => destino.addPage(p));
  }
  fs.writeFileSync(archivo, await destino.save());
}

async function main() {
  const semana1 = (await leerFacturas(fs.readFileSync(BASE))).map((r) => r);
  const lote1 = procesarLote(semana1, { inventarioInicial: inventario });
  if (lote1.estado !== 'listo') throw new Error('El PDF de la semana 1 debe estar sin errores');
  const stock = new Map(lote1.semanas[0].filas.map((f) => [f.clave, f.final]));

  fs.mkdirSync(SALIDA, { recursive: true });
  const comprasS1 = comprasDeLaSemana(['2026-08-04', '2026-08-05', '2026-08-06'], 1031, stock);
  for (const c of comprasS1) for (const l of c.lineas) stock.set(l.codigo, stock.get(l.codigo) + l.cantidad);

  const ventasS2 = ventasDeLaSemana('2026-08-10', 46, 6, stock);
  const comprasS2 = comprasDeLaSemana(['2026-08-11', '2026-08-12', '2026-08-13'], 1034, stock);
  for (const c of comprasS2) for (const l of c.lineas) stock.set(l.codigo, stock.get(l.codigo) + l.cantidad);

  const ventasS3 = ventasDeLaSemana('2026-08-17', 91, 11, stock);

  const archivos = {
    compras1: path.join(SALIDA, '01 - Compras de la semana 1.pdf'),
    ventas2: path.join(SALIDA, '02 - Ventas de la semana 2.pdf'),
    compras2: path.join(SALIDA, '03 - Compras de la semana 2.pdf'),
    ventas3: path.join(SALIDA, '04 - Ventas de la semana 3.pdf'),
  };
  await escribirCompras(archivos.compras1, comprasS1);
  await escribirVentas(archivos.ventas2, ventasS2);
  await escribirCompras(archivos.compras2, comprasS2);
  await escribirVentas(archivos.ventas3, ventasS3);
  await escribirInventarioExcel(path.join(SALIDA, '00 - Inventario inicial (Excel).xlsx'));
  await unirPdfs(path.join(SALIDA, '05 - Todo en uno (compras semana 2 y ventas semana 3).pdf'), [archivos.compras2, archivos.ventas3]);

  const leerV = async (a) => leerFacturas(fs.readFileSync(a));
  const leerC = async (a) => leerCompras(fs.readFileSync(a));
  const ventas = [...semana1, ...(await leerV(archivos.ventas2)), ...(await leerV(archivos.ventas3))];
  const compras = [...(await leerC(archivos.compras1)), ...(await leerC(archivos.compras2))];
  const ilegibles = [...ventas, ...compras].filter((x) => !x.ok).length;
  const lote = procesarLote(ventas, { compras, inventarioInicial: inventario, empresa: { nrc: '904036-1', nit: '850-79398290-103-7' } });

  console.log(`Archivos en ${path.resolve(SALIDA)}`);
  console.log(`Documentos: ventas ${ventas.length}, compras ${compras.length}, no legibles ${ilegibles}`);
  console.log(`Estado de las tres semanas juntas: ${lote.estado} ${JSON.stringify(lote.resumen)}`);
  if (lote.estado !== 'listo') {
    for (const h of lote.hallazgos.filter((x) => x.gravedad === 'ERROR').slice(0, 15)) console.log(' -', h.tipo, h.correlativo, h.codigo, h.detalle);
    process.exit(1);
  }
  for (const s of lote.semanas) {
    const t = (campo) => s.filas.reduce((a, f) => a + f[campo], 0);
    console.log(`Semana ${s.numero}: saldo ${t('saldo')} + compras ${t('compras')} - vendidas ${t('vendidas')} = final ${t('final')} | negativos ${s.alertas.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
