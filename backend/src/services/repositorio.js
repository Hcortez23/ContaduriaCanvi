import Factura from '../models/Factura.js';
import Compra from '../models/Compra.js';
import InventarioInicial from '../models/InventarioInicial.js';

const iso = (fecha) => fecha.toISOString().slice(0, 10);

function ventaParaMotor(f) {
  const { _id, __v, createdAt, updatedAt, empresa, lectura, ...resto } = f;
  return {
    factura: { ...resto, fecha: iso(f.fecha) },
    lectura: { titulo: '', tipoDocumento: '', avisos: [], faltantes: [], ...lectura, rotulos: lectura?.rotulos ?? {} },
  };
}

function compraParaMotor(c) {
  const { _id, __v, createdAt, updatedAt, empresa, ...resto } = c;
  const lineas = c.lineas.map((l, i) => ({ ...l, n: l.n ?? i + 1 }));
  return { factura: { ...resto, lineas, tipo: 'COMPRA', correlativo: Number(c.numeroFactura) || null, fecha: iso(c.fecha) } };
}

export async function cargarLote(empresaId) {
  const [facturas, compras, inventario] = await Promise.all([
    Factura.find({ empresa: empresaId }).sort({ correlativo: 1, _id: 1 }).lean(),
    Compra.find({ empresa: empresaId }).sort({ fecha: 1, _id: 1 }).lean(),
    InventarioInicial.find({ empresa: empresaId }).sort({ fecha: 1 }).lean(),
  ]);
  const ventas = [...facturas.filter((f) => f.tipo === 'CF'), ...facturas.filter((f) => f.tipo === 'CCF')];
  return {
    ventas: ventas.map(ventaParaMotor),
    compras: compras.map(compraParaMotor),
    inventariosIniciales: inventario.map((t) => ({
      fecha: t.fecha ? iso(t.fecha) : null,
      pagina: t.pagina,
      titulo: t.titulo,
      filas: t.filas,
      subtotal: t.subtotal,
      iva: t.iva,
      total: t.total,
    })),
  };
}
