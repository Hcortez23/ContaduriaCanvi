import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { leerFacturas } from '../src/services/parsers/index.js';
import { ANCHO, ALTO, Pagina, completarFactura, dibujarCF, dibujarCCF, imagenInventario, redondear, dinero } from './lib/pdfPuma.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(aqui, '../tests/fixtures');
const SALIDA = process.argv[2] || path.join(aqui, '../../../Puma Footwear - facturas sin errores.pdf');

const CORRECCIONES_TEXTO = [
  [/\b(clor|coor|colr)\b/gi, 'color'],
  [/\btala\b/gi, 'talla'],
  [/\bFuturo\b/g, 'Future'],
  [/\bVelocy\b/g, 'Velocity'],
  [/\b(Gravitio|Gravition|Gaviton)\b/g, 'Graviton'],
  [/\bElectryfy\b/g, 'Electrify'],
  [/blancoy/g, 'blanco y'],
  [/\bFlyer runner\b/g, 'Flyer Runner'],
  [/\bCourt classic\b/g, 'Court Classic'],
  [/talla 49/g, 'talla 40'],
  [/Gris y blanco/g, 'Gris y azul'],
];

const corregirDescripcion = (texto) => CORRECCIONES_TEXTO.reduce((t, [re, nuevo]) => t.replace(re, nuevo), texto);

function corregirFactura(f, nrcClienteCCF) {
  const lineas = f.lineas.map((l) => ({ ...l, descripcion: corregirDescripcion(l.descripcion) }));
  const base = { ...f, lineas };
  if (f.tipo === 'CCF') {
    base.emisor = { ...f.emisor, nombre: 'Puma Footwear' };
    base.cliente = { ...f.cliente, nrc: nrcClienteCCF };
  }
  return completarFactura(base);
}

async function main() {
  const original = fs.readFileSync(path.join(fixtures, 'puma-original.pdf'));
  const inventarioLeido = JSON.parse(fs.readFileSync(path.join(fixtures, 'inventario-puma-original.json'), 'utf8'));
  const resultados = (await leerFacturas(original)).map((r) => r.factura);
  const nrcCliente = resultados.find((f) => f.tipo === 'CCF').cliente.nrc;
  const facturas = resultados.map((f) => corregirFactura(f, nrcCliente));

  const subtotal = redondear(inventarioLeido.filas.reduce((s, f) => s + f.totalModelo, 0));
  const iva = redondear(subtotal * 0.13);
  const total = redondear(subtotal + iva);

  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  const imagen = await pdf.embedPng(imagenInventario(inventarioLeido, subtotal, iva, total));
  const portada = pdf.addPage([ANCHO, ALTO]);
  const escala = Math.min((ANCHO - 40) / imagen.width, (ALTO - 40) / imagen.height);
  portada.drawImage(imagen, { x: (ANCHO - imagen.width * escala) / 2, y: (ALTO - imagen.height * escala) / 2, width: imagen.width * escala, height: imagen.height * escala });

  for (const f of facturas) {
    const pagina = new Pagina(pdf, normal, negrita);
    if (f.tipo === 'CF') dibujarCF(pagina, f);
    else dibujarCCF(pagina, f);
  }
  fs.writeFileSync(SALIDA, await pdf.save());
  console.log(`PDF generado: ${path.resolve(SALIDA)} (${facturas.length + 1} páginas)`);
  console.log(`Inventario inicial corregido: subtotal ${dinero(subtotal)}, IVA ${dinero(iva)}, total ${dinero(total)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
