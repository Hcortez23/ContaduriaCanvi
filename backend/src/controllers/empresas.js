import Empresa from '../models/Empresa.js';
import Factura from '../models/Factura.js';
import Compra from '../models/Compra.js';
import InventarioInicial from '../models/InventarioInicial.js';

export async function listar(req, res) {
  res.json(await Empresa.find().sort({ nombre: 1 }));
}

export async function crear(req, res) {
  const { nombre, nrc, nit, direccion } = req.body;
  res.status(201).json(await Empresa.create({ nombre, nrc, nit, direccion }));
}

export async function obtener(req, res) {
  res.json(req.empresa);
}

export async function eliminar(req, res) {
  const empresa = req.empresa._id;
  await Promise.all([Factura.deleteMany({ empresa }), Compra.deleteMany({ empresa }), InventarioInicial.deleteMany({ empresa })]);
  await req.empresa.deleteOne();
  res.status(204).end();
}
