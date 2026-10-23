export const sinAcentos = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');

export const normalizar = (s) => sinAcentos(s).toLowerCase().trim().replace(/\s+/g, ' ');

export function distancia(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) m[i][j] = Math.min(m[i][j], m[i - 2][j - 2] + 1);
    }
  }
  return m[a.length][b.length];
}

export function moda(valores) {
  const cuenta = new Map();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) || 0) + 1);
  let mejor = null;
  let max = 0;
  for (const [v, n] of cuenta) {
    if (n > max) {
      mejor = v;
      max = n;
    }
  }
  return mejor;
}
