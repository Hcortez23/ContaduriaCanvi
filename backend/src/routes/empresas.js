import { Router } from 'express';
import { asyncHandler as a } from '../utils/asyncHandler.js';
import { cargarEmpresa } from '../middlewares/empresa.js';
import { subirPdf, subirArchivoInventario } from '../middlewares/subida.js';
import * as empresas from '../controllers/empresas.js';
import * as documentos from '../controllers/documentos.js';
import * as reportes from '../controllers/reportes.js';

const router = Router();

router.get('/', a(empresas.listar));
router.post('/', a(empresas.crear));

router.use('/:id', cargarEmpresa);
router.get('/:id', a(empresas.obtener));
router.delete('/:id', a(empresas.eliminar));

router.post('/:id/documentos/ventas', subirPdf, a(documentos.subirVentas));
router.post('/:id/documentos/compras', subirPdf, a(documentos.subirCompras));
router.post('/:id/documentos/mixto', subirPdf, a(documentos.subirMixto));
router.post('/:id/documentos/inventario', subirArchivoInventario, a(documentos.subirInventario));
router.delete('/:id/documentos/ventas', a(documentos.borrarVentas));
router.delete('/:id/documentos/compras', a(documentos.borrarCompras));
router.delete('/:id/documentos/inventario', a(documentos.borrarInventario));
router.delete('/:id/formatos', a(documentos.borrarFormatosAprendidos));

router.get('/:id/facturas', a(documentos.listarFacturas));
router.get('/:id/compras', a(documentos.listarCompras));
router.get('/:id/inventarios-iniciales', a(documentos.listarInventariosIniciales));

router.get('/:id/revision', a(reportes.revision));
router.get('/:id/reporte-ventas', a(reportes.reporteVentas));
router.get('/:id/inventario', a(reportes.inventario));
router.get('/:id/mensual', a(reportes.mensual));
router.get('/:id/libro', a(reportes.libro));
router.get('/:id/carta', a(reportes.carta));

export default router;
