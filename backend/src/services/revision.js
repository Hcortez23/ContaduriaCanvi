import { cargarLote } from './repositorio.js';
import { procesarLote } from './lote.js';

export async function revisarEmpresa(empresa) {
  const lote = await cargarLote(empresa._id);
  return procesarLote(lote.ventas, {
    compras: lote.compras,
    inventariosIniciales: lote.inventariosIniciales,
    empresa: { nrc: empresa.nrc, nit: empresa.nit },
  });
}
