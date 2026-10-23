import mongoose from 'mongoose';

const empresaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    nrc: { type: String, required: true, trim: true, unique: true },
    nit: { type: String, trim: true, default: '' },
    direccion: { type: String, trim: true, default: '' },
    perfilLectura: { type: String, default: 'generico' },
    activa: { type: Boolean, default: true },
    recetas: [{ _id: false, creada: { type: Date, default: Date.now }, receta: mongoose.Schema.Types.Mixed }],
  },
  { timestamps: true }
);

export default mongoose.model('Empresa', empresaSchema);
