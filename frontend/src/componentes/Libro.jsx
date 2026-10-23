import { api } from '../api.js';
import Bloqueado from './Bloqueado.jsx';
import { Panel, Titulo, BotonEnlace, Icono } from './ui.jsx';

const HOJAS = ['Facturas', 'Inventario inicial', 'Inventario final'];

export default function Libro({ empresa, bloqueo, irAErrores, irADocumentos }) {
  if (bloqueo) return <Bloqueado bloqueo={bloqueo} irAErrores={irAErrores} irADocumentos={irADocumentos} />;
  return (
    <Panel>
      <Titulo icono="hojas">Libro de Excel</Titulo>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-neutral-600">
        Un solo documento con tres hojas por semana, en este orden. El patrón se repite para cada semana.
      </p>
      <ol className="mb-6 grid list-none gap-3 p-0 sm:grid-cols-3">
        {HOJAS.map((hoja, i) => (
          <li key={hoja} className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3">
            <span className="grid size-8 place-items-center rounded-lg bg-black text-sm font-semibold text-white">{i + 1}</span>
            <span className="text-sm font-semibold">{hoja}</span>
          </li>
        ))}
      </ol>
      <BotonEnlace icono="descargar" href={api.urlLibro(empresa._id)} download>
        Descargar libro (.xlsx)
      </BotonEnlace>
    </Panel>
  );
}
