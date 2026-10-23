import { normalizar, distancia } from './texto.js';

export const palabras = (texto) => normalizar(texto).match(/[a-z]{4,}/g) || [];

export function frecuencias(descripciones) {
  const cuenta = new Map();
  for (const descripcion of descripciones) {
    for (const p of palabras(descripcion)) cuenta.set(p, (cuenta.get(p) || 0) + 1);
  }
  return cuenta;
}

export function candidataPara(palabra, cuenta) {
  const maximo = palabra.length <= 5 ? 1 : 2;
  const veces = cuenta.get(palabra);
  let mejor = null;
  for (const [otra, n] of cuenta) {
    if (otra === palabra || n < veces * 2) continue;
    const d = distancia(palabra, otra);
    if (d > maximo) continue;
    if (!mejor || d < mejor.d || (d === mejor.d && n > mejor.n)) mejor = { otra, d, n };
  }
  return mejor && mejor.otra;
}

export function corregirPalabra(palabra, cuenta) {
  if (!/^[a-z]{4,}$/.test(palabra) || !cuenta.has(palabra) || cuenta.get(palabra) > 2) return palabra;
  return candidataPara(palabra, cuenta) || palabra;
}
