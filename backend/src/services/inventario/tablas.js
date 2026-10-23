import { catalogoDeInventario } from './catalogoBase.js';
import { inicioSemana, sumarDias } from './semanas.js';

export function normalizarTablas({ inventariosIniciales = null, inventarioInicial = null } = {}) {
  const lista = inventariosIniciales ?? (inventarioInicial ? [inventarioInicial] : []);
  return [...lista].sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''));
}

export function catalogoDeTablas(tablas) {
  const porClave = new Map();
  for (const tabla of tablas) {
    for (const entrada of catalogoDeInventario(tabla)) porClave.set(entrada.clave, { ...porClave.get(entrada.clave), ...entrada });
  }
  return [...porClave.values()];
}

const filasValidas = (tabla) => tabla.filas.filter((f) => f.codigo && f.existencia !== null && f.existencia !== undefined);

export function movimientosDeTablas(tablas) {
  const [primera, ...siguientes] = tablas;
  return {
    apertura: primera ? filasValidas(primera).map((f) => ({ clave: f.codigo, cantidad: f.existencia })) : [],
    ingresos: siguientes.flatMap((tabla) =>
      filasValidas(tabla).map((f) => ({ clave: f.codigo, cantidad: f.existencia, fecha: sumarDias(inicioSemana(tabla.fecha), -1) }))
    ),
  };
}
