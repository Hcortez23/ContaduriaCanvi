import { hallazgo } from './hallazgo.js';

const tallaDe = (texto) => {
  const m = texto.match(/talla\s*(\d{2})|\bT(\d{2})\b/i);
  return m ? Number(m[1] || m[2]) : null;
};

function revisarTallas(lineas, hallazgos) {
  const cuenta = new Map();
  const conTalla = lineas.map((l) => ({ ...l, talla: tallaDe(l.linea.descripcion) })).filter((l) => l.talla !== null);
  for (const { talla } of conTalla) cuenta.set(talla, (cuenta.get(talla) || 0) + 1);
  for (const { factura, linea, talla } of conTalla) {
    if (cuenta.get(talla) > 2) continue;
    const otras = [...cuenta.keys()].filter((t) => t !== talla);
    if (otras.length && Math.min(...otras.map((t) => Math.abs(t - talla))) >= 5) {
      hallazgos.push(hallazgo(factura, 'ADVERTENCIA', 'TALLA', `Línea ${linea.n}: la talla ${talla} está muy fuera del rango del resto del lote (${Math.min(...otras)} a ${Math.max(...otras)}).`, 'Confirmar la talla real.'));
    }
  }
}

export function revisarDescripciones(resultados) {
  const lineas = resultados.flatMap((r) => r.factura.lineas.map((linea) => ({ factura: r.factura, linea })));
  const hallazgos = [];
  revisarTallas(lineas, hallazgos);
  return hallazgos;
}
