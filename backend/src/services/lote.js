import { config } from '../config.js';
import { revisarLote } from './rules/index.js';
import { reporteVentas } from './inventario/ventas.js';
import { calcularInventario } from './inventario/inventario.js';
import { calcularSemanas } from './inventario/semanas.js';
import { resumenMensual } from './inventario/mensual.js';
import { normalizarTablas, catalogoDeTablas, movimientosDeTablas } from './inventario/tablas.js';

const SIN_RESULTADOS = { ventas: null, inventario: null, semanas: null, mensual: null };

export function procesarLote(
  ventas,
  { catalogo = [], compras = [], empresa = null, inventarioInicial = null, inventariosIniciales = null, desde = null, hasta = null, ...opciones } = {}
) {
  const tablas = normalizarTablas({ inventariosIniciales, inventarioInicial });

  if (!ventas.length && !compras.length && !tablas.length) {
    return { estado: 'vacio', hallazgos: [], resumen: { documentos: 0, errores: 0, advertencias: 0 }, ...SIN_RESULTADOS };
  }
  if (!tablas.length && !catalogo.length) {
    const sinCatalogo = revisarLote(ventas, { compras, empresa, ...opciones });
    const hallazgos = [
      {
        tipo: 'INVENTARIO',
        correlativo: null,
        pagina: null,
        gravedad: 'ERROR',
        codigo: 'INVENTARIO INICIAL',
        detalle: 'Esta empresa todavía no tiene inventario inicial. Sin él no se puede calcular el inventario.',
        correccion: 'Subir el PDF de facturas de venta con la página del inventario inicial (la imagen) como primera página.',
      },
      ...sinCatalogo.hallazgos,
    ];
    return { estado: 'pausado', hallazgos, resumen: { ...sinCatalogo.resumen, errores: sinCatalogo.resumen.errores + 1 }, ...SIN_RESULTADOS };
  }

  const catalogoTotal = tablas.length ? [...catalogoDeTablas(tablas), ...catalogo] : catalogo;
  const revision = revisarLote(ventas, { catalogo: catalogoTotal, compras, empresa, inventariosIniciales: tablas, ...opciones });
  if (revision.estado === 'pausado') return { ...revision, ...SIN_RESULTADOS };

  const { apertura, ingresos } = movimientosDeTablas(tablas);
  return {
    ...revision,
    ventas: reporteVentas(ventas, catalogoTotal, { iva: opciones.iva ?? config.iva }),
    inventario: calcularInventario({ ventas, compras, catalogo: catalogoTotal, apertura, ingresos, desde, hasta }),
    semanas: calcularSemanas({ ventas, compras, catalogo: catalogoTotal, apertura, ingresos }),
    mensual: resumenMensual({
      ventas,
      compras,
      catalogo: catalogoTotal,
      iva: opciones.iva ?? config.iva,
      metas: { documentos: config.metaDocumentosMes, ccf: config.metaCcfMes },
    }),
  };
}
