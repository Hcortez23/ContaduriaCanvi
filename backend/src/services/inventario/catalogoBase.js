import { normalizar, distancia } from '../../utils/texto.js';

const descripcionNormalizada = (texto) => normalizar(texto).replace(/[^a-z0-9]+/g, ' ').trim();
const ARTICULOS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en']);
const SOBRANTES = new Set(['color', 'talla', 'y', 't']);

const EQUIVALENTES = { gal: 'galones', galon: 'galones', mll: 'ml' };
const separarNumeros = (texto) => texto.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2');
const tokensDe = (texto) =>
  separarNumeros(descripcionNormalizada(texto ?? ''))
    .split(' ')
    .map((t) => EQUIVALENTES[t] ?? t)
    .filter((t) => t && !ARTICULOS.has(t));

export function catalogoDeInventario(inventario) {
  return inventario.filas
    .filter((f) => f.codigo && f.modelo)
    .map((f) => ({
      clave: f.codigo,
      nombre: [f.marca, f.modelo, f.color, f.talla ? `talla ${f.talla}` : null].filter(Boolean).join(' '),
      marca: f.marca ?? null,
      modelo: f.modelo,
      color: f.color ?? null,
      talla: f.talla ?? null,
      precioUnitario: f.precioUnitario,
      existencia: f.existencia,
      alias: [],
    }));
}

export function prepararBase(catalogo) {
  const entradas = catalogo
    .filter((p) => p.modelo)
    .map((p) => {
      const marca = tokensDe(p.marca);
      const producto = tokensDe(p.modelo);
      return {
        clave: p.clave,
        talla: p.talla ? Number(p.talla) : null,
        marca,
        producto,
        tokens: [...marca, ...producto],
        colores: tokensDe(p.color).filter((t) => !SOBRANTES.has(t)),
      };
    });
  const vocabulario = new Set(['color', 'talla', ...entradas.flatMap((e) => [...e.tokens, ...e.colores])]);
  return { entradas, vocabulario };
}

function corregir(token, vocabulario) {
  if (vocabulario.has(token) || !/^[a-z]{4,}$/.test(token)) return token;
  const maximo = token.length <= 5 ? 1 : 2;
  let mejor = null;
  let empate = false;
  for (const v of vocabulario) {
    if (!/^[a-z]{4,}$/.test(v)) continue;
    const d = distancia(token, v);
    if (d > maximo) continue;
    if (!mejor || d < mejor.d) {
      mejor = { v, d };
      empate = false;
    } else if (d === mejor.d) empate = true;
  }
  return mejor && !empate ? mejor.v : token;
}

function quitarUna(lista, token) {
  const i = lista.indexOf(token);
  if (i >= 0) lista.splice(i, 1);
}

function evaluar(entrada, tokens, tallasDisponibles) {
  const restantes = [...tokens];
  for (const t of entrada.tokens) quitarUna(restantes, t);
  if (entrada.talla !== null) {
    const tallas = restantes.filter((t) => /^\d{2}$/.test(t)).map(Number);
    if (!tallas.includes(entrada.talla)) {
      return {
        razon: tallas.length
          ? `la talla ${tallas.join(', ')} no existe para ese modelo (inventario inicial: ${tallasDisponibles})`
          : 'la descripción no trae talla',
        prioridad: 1,
      };
    }
    quitarUna(restantes, String(entrada.talla));
  }
  if (entrada.colores.length) {
    const ajenos = restantes.filter((t) => /^[a-z]+$/.test(t)).filter((c) => !entrada.colores.includes(c));
    if (ajenos.length) return { razon: `el color "${ajenos.join(' ')}" no coincide con el inventario inicial (${entrada.colores.join(' ')})`, prioridad: 2 };
  }
  return { clave: entrada.clave };
}

function soloPorMarca(base, tokens, disponibles) {
  const conMarca = base.entradas.filter((e) => e.marca.length && e.marca.every((t) => disponibles.has(t)));
  if (!conMarca.length) return null;
  const largo = Math.max(...conMarca.map((e) => e.marca.length));
  const delaMarca = conMarca.filter((e) => e.marca.length === largo);
  if (delaMarca.length !== 1) return null;
  const [entrada] = delaMarca;
  const numeros = tokens.filter((t) => /^\d+$/.test(t));
  if (numeros.some((n) => !entrada.tokens.includes(n))) return null;
  return { clave: entrada.clave };
}

function lineaEsAbreviatura(base, tokens, disponibles) {
  const candidatas = base.entradas.filter((e) => {
    if (e.marca.length && !e.marca.every((t) => disponibles.has(t))) return false;
    const propios = tokens.filter((t) => !e.marca.includes(t));
    return propios.length >= 2 && propios.every((t) => e.tokens.includes(t));
  });
  return candidatas.length === 1 ? { clave: candidatas[0].clave } : null;
}

function aproximar(entrada, tokens, holgura = 0) {
  const libres = [...tokens];
  const resultado = [];
  for (const t of entrada.tokens) {
    let i = libres.indexOf(t);
    if (i < 0 && /^[a-z]{4,}$/.test(t)) {
      const maximo = (t.length <= 5 ? 1 : 2) + holgura;
      i = libres.findIndex((x) => /^[a-z]{4,}$/.test(x) && distancia(x, t) <= maximo);
    }
    if (i < 0) return null;
    resultado.push(libres[i]);
    libres.splice(i, 1);
  }
  return [...resultado, ...libres];
}

function porAproximacion(base, tokens, holgura = 0) {
  const candidatas = [];
  for (const e of base.entradas) {
    const lista = aproximar(e, tokens, holgura);
    if (!lista) continue;
    const reparada = [...e.tokens, ...lista.slice(e.tokens.length)];
    const r = evaluar(e, reparada, '');
    if (r.clave) candidatas.push({ clave: r.clave, largo: e.tokens.length });
  }
  if (!candidatas.length) return null;
  const largo = Math.max(...candidatas.map((c) => c.largo));
  const mejores = candidatas.filter((c) => c.largo === largo);
  return mejores.length === 1 ? { clave: mejores[0].clave, aproximada: holgura > 0 } : null;
}

export function coincidir(descripcion, base, contexto = '') {
  const tokens = tokensDe(descripcion)
    .map((t) => corregir(t, base.vocabulario))
    .filter((t) => t !== 'color' && t !== 'talla' && t !== 'y' && t !== 't');
  const disponibles = new Set([...tokens, ...tokensDe(contexto)]);

  const contenidas = base.entradas.filter((e) => e.producto.every((t) => tokens.includes(t)) && e.marca.every((t) => disponibles.has(t)));
  if (!contenidas.length) {
    return lineaEsAbreviatura(base, tokens, disponibles) ?? soloPorMarca(base, tokens, disponibles) ?? porAproximacion(base, tokens) ?? porAproximacion(base, tokens, 1) ?? { razon: 'el modelo no está en el inventario inicial' };
  }
  const largo = Math.max(...contenidas.map((e) => e.tokens.length));
  const candidatas = contenidas.filter((e) => e.tokens.length === largo);
  const tallasDisponibles = candidatas.map((e) => e.talla).filter(Boolean).join(', ');

  let peor = null;
  for (const entrada of candidatas) {
    const r = evaluar(entrada, tokens, tallasDisponibles);
    if (r.clave) return r;
    if (!peor || r.prioridad > peor.prioridad) peor = r;
  }
  return { razon: peor.razon };
}
