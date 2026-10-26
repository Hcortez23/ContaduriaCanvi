import { normalizar, moda } from '../../utils/texto.js';
import { frecuencias, corregirPalabra } from '../../utils/vocabulario.js';
import { prepararBase, coincidir } from './catalogoBase.js';

const SOBRANTES = new Set(['color', 'talla', 'y', 'de', 'el', 'la', 't']);

export const descripcionNormalizada = (descripcion) =>
  normalizar(descripcion).replace(/[^a-z0-9]+/g, ' ').trim();

function claveDe(descripcion, cuenta) {
  const tokens = descripcionNormalizada(descripcion)
    .split(' ')
    .filter(Boolean)
    .map((t) => corregirPalabra(t, cuenta))
    .map((t) => t.replace(/^t(\d{2})$/, '$1'))
    .filter((t) => !SOBRANTES.has(t));
  return [...new Set(tokens)].sort().join(' ');
}

function todasLasLineas(resultados) {
  return resultados.flatMap((r) => r.factura.lineas.map((linea) => ({ factura: r.factura, linea })));
}

export function proponerCatalogo(resultados, catalogo = []) {
  const lineas = todasLasLineas(resultados);
  const cuenta = frecuencias(lineas.map((l) => l.linea.descripcion));
  const conocidas = new Map(catalogo.flatMap((p) => p.alias.map((a) => [a, p.clave])));
  const grupos = new Map();
  for (const { linea } of lineas) {
    const normal = descripcionNormalizada(linea.descripcion);
    const clave = conocidas.get(normal) || claveDe(linea.descripcion, cuenta);
    if (!grupos.has(clave)) grupos.set(clave, { clave, originales: [], alias: new Set(), lineas: 0, unidades: 0 });
    const g = grupos.get(clave);
    g.originales.push(linea.descripcion);
    g.alias.add(normal);
    g.lineas += 1;
    g.unidades += linea.cantidad;
  }
  const existentes = new Set(catalogo.map((p) => p.clave));
  return [...grupos.values()]
    .map((g) => ({
      clave: g.clave,
      nombre: moda(g.originales),
      alias: [...g.alias],
      lineas: g.lineas,
      unidades: g.unidades,
      existente: existentes.has(g.clave),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function resolverProductos(resultados, catalogo = []) {
  const porAlias = new Map(catalogo.flatMap((p) => p.alias.map((a) => [a, p.clave])));
  const propuestas = new Map(proponerCatalogo(resultados, catalogo).map((p) => [p.clave, p]));
  const cuenta = frecuencias(todasLasLineas(resultados).map((l) => l.linea.descripcion));
  const base = prepararBase(catalogo);
  const resueltas = [];
  const sinIdentificar = [];
  for (const { factura, linea } of todasLasLineas(resultados)) {
    const clave = porAlias.get(descripcionNormalizada(linea.descripcion));
    const automatica = !clave && base.entradas.length ? coincidir(linea.descripcion, base, factura.proveedor?.nombre ?? '') : null;
    if (clave || automatica?.clave) {
      resueltas.push({ factura, linea, clave: clave || automatica.clave, aproximada: !clave && !!automatica.aproximada });
    } else if (automatica) {
      sinIdentificar.push({ factura, linea, sugerencia: { clave: '', nombre: linea.descripcion, existente: false, razon: automatica.razon } });
    } else {
      const sugerida = claveDe(linea.descripcion, cuenta);
      const propuesta = propuestas.get(sugerida);
      sinIdentificar.push({
        factura,
        linea,
        sugerencia: { clave: sugerida, nombre: propuesta ? propuesta.nombre : linea.descripcion, existente: catalogo.some((p) => p.clave === sugerida) },
      });
    }
  }
  return { resueltas, sinIdentificar };
}
