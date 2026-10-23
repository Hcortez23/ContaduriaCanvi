import multer from 'multer';
import { HttpError } from '../utils/errores.js';

const subir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new HttpError(400, 'El archivo debe ser un PDF'));
    cb(null, true);
  },
}).single('archivo');

export function subirPdf(req, res, next) {
  subir(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return next(new HttpError(400, 'Falta el archivo PDF (campo "archivo")'));
    next();
  });
}

const TIPOS_INVENTARIO = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const subirInventario = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!TIPOS_INVENTARIO.has(file.mimetype)) return cb(new HttpError(400, 'El inventario inicial debe ser un PDF, una imagen (PNG o JPG) o un Excel (.xlsx)'));
    cb(null, true);
  },
}).single('archivo');

export function subirArchivoInventario(req, res, next) {
  subirInventario(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return next(new HttpError(400, 'Falta el archivo del inventario inicial (campo "archivo")'));
    next();
  });
}
