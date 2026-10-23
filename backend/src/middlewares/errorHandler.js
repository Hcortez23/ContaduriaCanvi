import { HttpError } from '../utils/errores.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, detalle: err.detalle });
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: err.message });
  if (err.name === 'MulterError') return res.status(400).json({ error: err.message });
  if (err.code === 11000) return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno' });
}
