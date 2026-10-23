import { Boton, Icono } from './ui.jsx';

export default function Bloqueado({ bloqueo, irAErrores, irADocumentos }) {
  const vacio = bloqueo === 'vacio';
  return (
    <section className="grid place-items-center rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-16 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-black text-white">
        <Icono nombre={vacio ? 'bandeja' : 'candado'} className="size-6" />
      </span>
      <h2 className="mb-1 text-lg font-semibold tracking-tight">{vacio ? 'Sin documentos' : 'Proceso pausado'}</h2>
      <p className="mb-6 max-w-sm text-sm text-neutral-500">
        {vacio ? 'Esta sección se genera cuando hay facturas cargadas y sin errores.' : 'Esta sección se genera cuando las facturas no tienen errores.'}
      </p>
      <Boton onClick={vacio ? irADocumentos : irAErrores}>{vacio ? 'Ir a Documentos' : 'Ver errores por corregir'}</Boton>
    </section>
  );
}
