import fs from 'node:fs';
import path from 'node:path';
import { leerMixto } from '../src/services/parsers/mixto.js';

const entradas = process.argv.slice(2);
const archivos = entradas.flatMap((e) => (fs.statSync(e).isDirectory() ? fs.readdirSync(e).filter((f) => f.toLowerCase().endsWith('.pdf')).map((f) => path.join(e, f)) : [e]));

let problemas = 0;
for (const archivo of archivos) {
  const r = await leerMixto(fs.readFileSync(archivo), { respaldoIA: false });
  const leidos = [...r.ventas, ...r.compras];
  const ilegibles = leidos.filter((x) => !x.ok).length;
  const estado = ilegibles || r.sinClasificar.length ? 'REVISAR' : 'ok';
  if (estado !== 'ok') problemas++;
  console.log(`${estado.padEnd(8)} ${path.basename(archivo).padEnd(58)} ventas ${r.ventas.length}  compras ${r.compras.length}  imagen ${r.paginasImagen.length}  ilegibles ${ilegibles}  sin reconocer ${r.sinClasificar.length}`);
}
console.log(problemas ? `\n${problemas} archivo(s) con páginas que el lector no reconoce (irían a la IA).` : '\nTodos los archivos se leen sin IA.');
