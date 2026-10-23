import { revisarEmpresa } from '../services/revision.js';
import { generarLibroSemanal } from '../services/export/libroSemanal.js';
import { generarCarta } from '../services/export/carta.js';
import { config } from '../config.js';
import { HttpError } from '../utils/errores.js';

async function procesoListo(empresa) {
  const revision = await revisarEmpresa(empresa);
  if (revision.estado === 'vacio') throw new HttpError(409, 'Todavía no hay documentos cargados', { estado: revision.estado, resumen: revision.resumen, hallazgos: [] });
  if (revision.estado === 'pausado') {
    throw new HttpError(409, 'El proceso está pausado: hay errores por corregir en las facturas', {
      estado: revision.estado,
      resumen: revision.resumen,
      hallazgos: revision.hallazgos,
    });
  }
  return revision;
}

export async function revision(req, res) {
  const { estado, resumen, hallazgos } = await revisarEmpresa(req.empresa);
  res.json({ estado, resumen, hallazgos });
}

export async function reporteVentas(req, res) {
  res.json((await procesoListo(req.empresa)).ventas);
}

export async function mensual(req, res) {
  res.json((await procesoListo(req.empresa)).mensual);
}

export async function inventario(req, res) {
  const r = await procesoListo(req.empresa);
  res.json({ inventario: r.inventario, semanas: r.semanas.map(({ ventas, ...semana }) => semana) });
}

export async function libro(req, res) {
  const r = await procesoListo(req.empresa);
  if (!r.semanas.length) throw new HttpError(409, 'Todavía no hay semanas con facturas para generar el libro');
  const buffer = await generarLibroSemanal({
    empresa: { nombre: req.empresa.nombre, nrc: req.empresa.nrc, nit: req.empresa.nit },
    semanas: r.semanas,
    iva: config.iva,
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="libro-${req.empresa.nrc}.xlsx"`);
  res.send(buffer);
}

export async function carta(req, res) {
  const { hallazgos } = await revisarEmpresa(req.empresa);
  if (!hallazgos.length) throw new HttpError(409, 'No hay errores ni observaciones para incluir en una carta');
  const buffer = await generarCarta({
    empresa: { nombre: req.empresa.nombre, nrc: req.empresa.nrc, nit: req.empresa.nit },
    hallazgos,
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="carta-${req.empresa.nrc}.docx"`);
  res.send(buffer);
}
