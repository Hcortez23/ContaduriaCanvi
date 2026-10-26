import { inicioSemana } from '../inventario/semanas.js';
import { hallazgo } from './hallazgo.js';

const formato = (iso) => iso.split('-').reverse().join('/');

export function revisarFechasContraInventario(ventas, compras, tablas) {
  const fecha = tablas[0]?.fecha;
  if (!fecha) return [];
  const lunes = inicioSemana(fecha);
  const hallazgos = [];

  const anteriores = ventas.map((r) => r.factura.fecha).filter((f) => f < lunes).sort();
  if (anteriores.length) {
    hallazgos.push(
      hallazgo(
        null,
        'ADVERTENCIA',
        'ANTERIOR AL INVENTARIO',
        `Hay ${anteriores.length} facturas de venta con fecha anterior a la semana del inventario inicial (${formato(fecha)}); la primera es del ${formato(anteriores[0])}. No se sabe cuánto había antes del inventario.`,
        'Verificar la fecha del inventario inicial, o subir el inventario de la semana en que empiezan las facturas.'
      )
    );
  }
  const comprasAnteriores = compras.map((r) => r.factura.fecha).filter((f) => f < lunes).sort();
  if (comprasAnteriores.length) {
    hallazgos.push(
      hallazgo(
        null,
        'ADVERTENCIA',
        'ANTERIOR AL INVENTARIO',
        `Hay ${comprasAnteriores.length} facturas de compra anteriores a la semana del inventario inicial (${formato(fecha)}); la primera es del ${formato(comprasAnteriores[0])}. El inventario podría ya incluirlas y contarse dos veces.`,
        'Confirmar si esas compras ya están dentro del inventario inicial.'
      )
    );
  }
  return hallazgos;
}
