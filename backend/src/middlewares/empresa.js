import mongoose from 'mongoose';
import Empresa from '../models/Empresa.js';
import { HttpError } from '../utils/errores.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const cargarEmpresa = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Identificador de empresa inválido');
  const empresa = await Empresa.findById(id);
  if (!empresa) throw new HttpError(404, 'Empresa no encontrada');
  req.empresa = empresa;
  next();
});
