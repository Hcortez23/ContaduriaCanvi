import mongoose from 'mongoose';

const filaSchema = new mongoose.Schema(
  {
    numero: { type: Number, default: null },
    codigo: { type: String, default: null },
    marca: { type: String, default: null },
    modelo: { type: String, default: null },
    color: { type: String, default: null },
    talla: { type: Number, default: null },
    existencia: { type: Number, default: null },
    precioUnitario: { type: Number, default: null },
    totalModelo: { type: Number, default: null },
  },
  { _id: false }
);

const inventarioInicialSchema = new mongoose.Schema(
  {
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
    fecha: { type: Date, default: null },
    titulo: { type: String, default: null },
    pagina: { type: Number, default: null },
    archivo: { type: String, default: '' },
    filas: [filaSchema],
    subtotal: { type: Number, default: null },
    iva: { type: Number, default: null },
    total: { type: Number, default: null },
  },
  { timestamps: true }
);

inventarioInicialSchema.index({ empresa: 1, fecha: 1 }, { unique: true });

export default mongoose.model('InventarioInicial', inventarioInicialSchema);
