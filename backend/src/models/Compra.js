import mongoose from 'mongoose';

const lineaCompraSchema = new mongoose.Schema(
  {
    n: { type: Number, default: null },
    descripcion: { type: String, required: true },
    productoClave: { type: String, default: '' },
    cantidad: { type: Number, required: true },
    precioUnitario: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false }
);

const compraSchema = new mongoose.Schema(
  {
    empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
    tipoDocumento: { type: String, default: 'Crédito Fiscal' },
    numeroFactura: { type: String, required: true },
    fecha: { type: Date, required: true },
    proveedor: {
      nombre: { type: String, required: true },
      direccion: { type: String, default: '' },
      ciudad: { type: String, default: '' },
      telefono: { type: String, default: '' },
      giro: { type: String, default: '' },
    },
    facturarA: {
      nombre: { type: String, default: '' },
      direccion: { type: String, default: '' },
      ciudad: { type: String, default: '' },
      telefono: { type: String, default: '' },
      nit: { type: String, default: '' },
      nrc: { type: String, default: '' },
    },
    lineas: [lineaCompraSchema],
    subtotal: { type: Number, required: true },
    iva: { type: Number, required: true },
    percepcion: { type: Number, default: 0 },
    otros: { type: Number, default: 0 },
    total: { type: Number, required: true },
    condicionPago: { type: String, default: '' },
    archivo: { type: String, default: '' },
    pagina: { type: Number, default: null },
  },
  { timestamps: true }
);

compraSchema.index({ empresa: 1, fecha: 1 });
compraSchema.index({ empresa: 1, 'proveedor.nombre': 1, numeroFactura: 1 });

export default mongoose.model('Compra', compraSchema);
