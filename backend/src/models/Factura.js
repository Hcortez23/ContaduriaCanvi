import mongoose from 'mongoose';

const lineaSchema = new mongoose.Schema(
  {
    n: Number,
    descripcion: { type: String, required: true },
    productoClave: { type: String, default: '' },
    cantidad: { type: Number, required: true },
    precioUnitario: { type: Number, required: true },
    descuento: { type: Number, default: 0 },
    base: { type: Number, default: null },
    iva: { type: Number, default: null },
    total: { type: Number, default: null },
  },
  { _id: false }
);

const facturaSchema = new mongoose.Schema(
  {
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
    tipo: { type: String, enum: ['CF', 'CCF'], required: true },
    correlativo: { type: Number, required: true },
    numeroDocumento: { type: String, default: '' },
    fecha: { type: Date, required: true },
    condicionPago: { type: String, default: '' },
    formaPago: {
      type: String,
      enum: ['EFECTIVO', 'CREDITO', 'TARJETA DE CREDITO', 'CHEQUE'],
    },
    cajaTurno: { type: String, default: '-' },
    emisor: {
      nombre: { type: String, default: '' },
      nit: { type: String, default: '' },
      nrc: { type: String, default: '' },
      direccion: { type: String, default: '' },
      dui: { type: String, default: '' },
    },
    cliente: {
      nombre: { type: String, default: '' },
      nitDui: { type: String, default: '' },
      nrc: { type: String, default: '' },
      direccion: { type: String, default: '' },
      giro: { type: String, default: '' },
    },
    lineas: [lineaSchema],
    subtotal: { type: Number, default: null },
    iva: { type: Number, default: null },
    percepcion: { type: Number, default: null },
    descuentos: { type: Number, default: 0 },
    total: { type: Number, default: null },
    precioIncluyeIva: { type: Boolean, default: false },
    observaciones: { type: String, default: '' },
    archivo: { type: String, default: '' },
    pagina: { type: Number, default: null },
    lectura: {
      titulo: { type: String, default: '' },
      tipoDocumento: { type: String, default: '' },
      rotulos: { type: mongoose.Schema.Types.Mixed, default: {} },
      avisos: [{ _id: false, campo: String, valores: [String] }],
      faltantes: [String],
      origen: { type: String, default: 'texto' },
    },
  },
  { timestamps: true }
);

facturaSchema.index({ empresa: 1, tipo: 1, correlativo: 1 });
facturaSchema.index({ empresa: 1, fecha: 1 });

export default mongoose.model('Factura', facturaSchema);
