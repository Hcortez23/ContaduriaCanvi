import { config } from '../../config.js';
import { revisarCalculos } from './calculos.js';
import { revisarConsistencia } from './consistencia.js';
import { revisarDescripciones } from './descripciones.js';
import { revisarCompras } from './compras.js';
import { revisarProductos } from './productos.js';
import { revisarInventarioInicial } from './inventarioInicial.js';
import { normalizarTablas } from '../inventario/tablas.js';
import { revisarFechasContraInventario } from './fechasInventario.js';

const GRAVEDAD = { ERROR: 0, ADVERTENCIA: 1 };

export function revisarLote(ventas, opciones = {}) {
  const { catalogo, compras = [], empresa = null, inventarioInicial = null, inventariosIniciales = null, ...resto } = opciones;
  const tablas = normalizarTablas({ inventariosIniciales, inventarioInicial });
  const op = {
    iva: config.iva,
    percepcion: config.percepcion,
    umbralPercepcion: config.umbralPercepcion,
    ...resto,
  };
  const hallazgos = [
    ...revisarConsistencia(ventas, empresa),
    ...revisarCalculos(ventas, op),
    ...revisarDescripciones(ventas),
    ...tablas.flatMap((t) => revisarInventarioInicial(t, op, tablas.length > 1 && t.fecha ? `Inventario inicial del ${t.fecha.split('-').reverse().join('/')}` : 'Inventario inicial')),
    ...revisarCompras(compras, op, empresa),
    ...revisarFechasContraInventario(ventas, compras, tablas),
    ...(catalogo ? revisarProductos([...ventas, ...compras], catalogo, op.iva) : []),
  ].sort(
    (a, b) =>
      GRAVEDAD[a.gravedad] - GRAVEDAD[b.gravedad] ||
      a.tipo.localeCompare(b.tipo) ||
      (a.correlativo ?? 0) - (b.correlativo ?? 0)
  );
  const errores = hallazgos.filter((h) => h.gravedad === 'ERROR').length;
  return {
    estado: errores ? 'pausado' : 'listo',
    hallazgos,
    resumen: {
      documentos: ventas.length + compras.length,
      errores,
      advertencias: hallazgos.length - errores,
    },
  };
}
