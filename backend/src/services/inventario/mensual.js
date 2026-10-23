import { redondear } from '../../utils/numeros.js';
import { reporteVentas } from './ventas.js';

const porcentaje = (valor, meta) => (meta ? Math.round((valor / meta) * 100) : 0);

export function resumenMensual({ ventas, compras = [], catalogo, iva, metas }) {
  const meses = [...new Set([...ventas, ...compras].map((d) => d.factura.fecha.slice(0, 7)))].sort();
  return meses.map((mes) => {
    const delMes = (docs) => docs.filter((d) => d.factura.fecha.startsWith(mes));
    const v = delMes(ventas);
    const cf = v.filter((d) => d.factura.tipo === 'CF').length;
    const ccf = v.filter((d) => d.factura.tipo === 'CCF').length;
    const reporte = v.length ? reporteVentas(v, catalogo, { iva }) : null;
    return {
      mes,
      documentos: { cf, ccf, total: cf + ccf },
      compras: delMes(compras).length,
      meta: { documentos: metas.documentos, ccf: metas.ccf },
      avance: { documentos: porcentaje(cf + ccf, metas.documentos), ccf: porcentaje(ccf, metas.ccf) },
      ventas: reporte && {
        unidades: reporte.totales.unidades,
        base: reporte.totales.base,
        totalCF: reporte.documentos.CF.total,
        totalCCF: reporte.documentos.CCF.total,
        total: redondear(reporte.documentos.CF.total + reporte.documentos.CCF.total),
      },
    };
  });
}
