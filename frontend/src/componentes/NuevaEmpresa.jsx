import { useState } from 'react';
import { api } from '../api.js';
import { Boton, Panel, Titulo, Etiqueta, Aviso, CAMPO } from './ui.jsx';

export default function NuevaEmpresa({ onCreada }) {
  const [datos, setDatos] = useState({ nombre: '', nrc: '', nit: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      onCreada(await api.crearEmpresa(datos));
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Panel className="animate-entrada mb-6 motion-reduce:animate-none">
      <form onSubmit={enviar}>
        <Titulo icono="edificio">Nueva empresa</Titulo>
        <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <Etiqueta texto="Nombre">
            <input className={CAMPO} value={datos.nombre} onChange={cambiar('nombre')} required />
          </Etiqueta>
          <Etiqueta texto="NRC">
            <input className={CAMPO} value={datos.nrc} onChange={cambiar('nrc')} required />
          </Etiqueta>
          <Etiqueta texto="NIT">
            <input className={CAMPO} value={datos.nit} onChange={cambiar('nit')} />
          </Etiqueta>
        </div>
        {error && <Aviso className="mb-5 mt-0">{error}</Aviso>}
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar empresa'}
        </Boton>
      </form>
    </Panel>
  );
}
