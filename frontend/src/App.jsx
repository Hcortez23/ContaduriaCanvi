import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useCarga } from './useCarga.js';
import NuevaEmpresa from './componentes/NuevaEmpresa.jsx';
import Documentos from './componentes/Documentos.jsx';
import Errores from './componentes/Errores.jsx';
import Ventas from './componentes/Ventas.jsx';
import Inventario from './componentes/Inventario.jsx';
import Mensual from './componentes/Mensual.jsx';
import Libro from './componentes/Libro.jsx';
import { Boton, Aviso, Icono, CAMPO } from './componentes/ui.jsx';

const CLAVE_EMPRESA = 'empresaActiva';

function leerGuardada() {
  try {
    return localStorage.getItem(CLAVE_EMPRESA) || '';
  } catch {
    return '';
  }
}

function guardar(id) {
  try {
    localStorage.setItem(CLAVE_EMPRESA, id);
  } catch {
    return;
  }
}

function Cifra({ valor, etiqueta, tenue }) {
  return (
    <div className="min-w-20">
      <p className="m-0 text-3xl font-semibold leading-none tracking-tight">{valor}</p>
      <p className={`m-0 mt-1 text-xs uppercase tracking-wide ${tenue ? 'text-white/60' : 'text-neutral-500'}`}>{etiqueta}</p>
    </div>
  );
}

function Estado({ empresa, revision, enCurso }) {
  const datos = revision.datos;
  const pausado = datos?.estado === 'pausado';
  const vacio = datos?.estado === 'vacio';
  const titulo = !datos ? 'Revisando…' : pausado ? 'Proceso pausado' : vacio ? 'Sin documentos' : 'Proceso listo';
  const detalle = !datos
    ? ''
    : pausado
      ? 'No se genera inventario ni libro hasta corregir las facturas y volver a subirlas.'
      : vacio
        ? 'Sube el PDF de facturas de venta, con el inventario inicial en la primera página, para empezar.'
        : 'Las facturas no tienen errores y el inventario está listo.';
  const icono = pausado ? 'alerta' : vacio ? 'bandeja' : 'check';

  const caja = pausado
    ? 'border-black bg-black text-white'
    : vacio
      ? 'border-dashed border-neutral-300 bg-neutral-50 text-black'
      : 'border-black bg-white text-black';

  return (
    <section aria-live="polite" className={`animate-entrada flex flex-wrap items-center justify-between gap-6 rounded-3xl border p-6 motion-reduce:animate-none sm:p-8 ${caja}`}>
      <div className="flex min-w-0 items-center gap-4">
        <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${pausado ? 'bg-white text-black' : 'bg-black text-white'}`}>
          <Icono nombre={icono} className="size-7" />
        </span>
        <div className="min-w-0">
          <p className={`m-0 text-xs font-medium uppercase tracking-wide ${pausado ? 'text-white/60' : 'text-neutral-500'}`}>
            {empresa.nombre} · NRC {empresa.nrc}
          </p>
          <p className="m-0 text-2xl font-semibold tracking-tight">{titulo}</p>
          <p className={`m-0 mt-1 max-w-md text-sm ${pausado ? 'text-white/70' : 'text-neutral-500'}`}>{detalle}</p>
          {enCurso && (
            <p className="m-0 mt-2 flex items-center gap-2 text-sm font-semibold" role="status">
              <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
              Leyendo documentos… los datos se actualizan solos.
            </p>
          )}
        </div>
      </div>
      {datos && !vacio && (
        <div className="flex gap-8">
          <Cifra valor={datos.resumen.errores} etiqueta="Errores" tenue={pausado} />
          <Cifra valor={datos.resumen.advertencias} etiqueta="Advertencias" tenue={pausado} />
          <Cifra valor={datos.resumen.documentos} etiqueta="Documentos" tenue={pausado} />
        </div>
      )}
    </section>
  );
}

export default function App() {
  const empresas = useCarga(api.empresas, []);
  const [empresaId, setEmpresaId] = useState(leerGuardada);
  const [creando, setCreando] = useState(false);
  const [pestana, setPestana] = useState('documentos');
  const [subidas, setSubidas] = useState({});
  const [version, setVersion] = useState(0);

  const lista = empresas.datos || [];
  const empresa = lista.find((e) => e._id === empresaId) || null;

  useEffect(() => {
    if (!empresas.datos) return;
    if (!empresa && lista.length) setEmpresaId(lista[0]._id);
  }, [empresas.datos]);

  useEffect(() => {
    if (empresaId) guardar(empresaId);
  }, [empresaId]);

  const revision = useCarga(() => (empresaId ? api.revision(empresaId) : Promise.resolve(null)), [empresaId]);
  const datosRevision = revision.datos;
  const bloqueo = datosRevision?.estado === 'pausado' ? 'pausado' : datosRevision?.estado === 'vacio' ? 'vacio' : null;

  const recargarRevision = useRef(revision.recargar);
  recargarRevision.current = revision.recargar;

  const enCurso = Object.entries(subidas).some(([clave, estado]) => clave.startsWith(`${empresaId}:`) && estado.enviando);
  const subidasDe = (id) => Object.fromEntries(['mixto', 'ventas', 'compras', 'inventario'].map((tipo) => [tipo, subidas[`${id}:${tipo}`]]));

  const subir = async (id, tipo, archivo, campos = {}) => {
    const clave = `${id}:${tipo}`;
    setSubidas((s) => ({ ...s, [clave]: { enviando: true, nombre: archivo.name } }));
    try {
      const resultado = await api.subir(id, tipo, archivo, campos);
      setSubidas((s) => ({ ...s, [clave]: { enviando: false, nombre: archivo.name, resultado } }));
    } catch (error) {
      setSubidas((s) => ({ ...s, [clave]: { enviando: false, nombre: archivo.name, error } }));
    } finally {
      setVersion((v) => v + 1);
      recargarRevision.current();
    }
  };

  const datosCambiaron = () => {
    setVersion((v) => v + 1);
    recargarRevision.current();
  };

  useEffect(() => {
    if (empresaId) recargarRevision.current();
  }, [pestana]);

  useEffect(() => {
    if (!enCurso) return undefined;
    const intervalo = setInterval(datosCambiaron, 8000);
    const avisar = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('beforeunload', avisar);
    };
  }, [enCurso]);

  const empresaCreada = (nueva) => {
    empresas.recargar();
    setEmpresaId(nueva._id);
    setCreando(false);
  };

  const empresaEliminada = () => {
    setEmpresaId('');
    empresas.recargar();
  };

  const pestanas = [
    ['documentos', 'Documentos'],
    ['errores', datosRevision && datosRevision.resumen.errores ? `Errores · ${datosRevision.resumen.errores}` : 'Errores'],
    ['ventas', 'Ventas'],
    ['mensual', 'Mes'],
    ['inventario', 'Inventario'],
    ['libro', 'Libro'],
  ];
  const navegacion = {
    irAErrores: () => setPestana('errores'),
    irADocumentos: () => setPestana('documentos'),
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-black text-white">
              <Icono nombre="hojas" className="size-5" />
            </span>
            <h1 className="m-0 text-base font-semibold tracking-tight">Revisión de facturas e inventario</h1>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {lista.length > 0 && (
              <div className="relative w-full sm:w-60">
                <label htmlFor="empresa" className="sr-only">
                  Empresa
                </label>
                <Icono nombre="edificio" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
                <select id="empresa" className={`${CAMPO} pl-9 font-medium`} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
                  {lista.map((e) => (
                    <option key={e._id} value={e._id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Boton variante="secundario" icono={creando ? undefined : 'mas'} onClick={() => setCreando((v) => !v)}>
              {creando ? 'Cancelar' : 'Nueva empresa'}
            </Boton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        {empresas.error && <Aviso>No se pudo conectar con el servidor: {empresas.error.message}</Aviso>}
        {creando && <NuevaEmpresa onCreada={empresaCreada} />}

        {!empresa && !creando && !empresas.cargando && !empresas.error && (
          <section className="animate-entrada grid place-items-center rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-20 text-center motion-reduce:animate-none">
            <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-black text-white">
              <Icono nombre="edificio" className="size-7" />
            </span>
            <h2 className="mb-1 text-xl font-semibold tracking-tight">Aún no hay empresas</h2>
            <p className="mb-6 max-w-sm text-sm text-neutral-500">Crea la primera empresa para empezar a subir sus facturas e inventario.</p>
            <Boton icono="mas" onClick={() => setCreando(true)}>
              Crear empresa
            </Boton>
          </section>
        )}

        {empresa && (
          <div className="grid gap-6">
            <Estado empresa={empresa} revision={revision} enCurso={enCurso} />

            <nav aria-label="Secciones" className="flex w-full gap-1 overflow-x-auto rounded-2xl bg-neutral-100 p-1 sm:w-fit">
              {pestanas.map(([clave, texto]) => (
                <button
                  key={clave}
                  type="button"
                  aria-current={pestana === clave ? 'page' : undefined}
                  onClick={() => setPestana(clave)}
                  className={`cursor-pointer whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${
                    pestana === clave ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-black'
                  }`}
                >
                  {texto}
                </button>
              ))}
            </nav>

            <div key={`${empresa._id}-${pestana}`} className="animate-entrada motion-reduce:animate-none">
              {pestana === 'documentos' && <Documentos empresa={empresa} subidas={subidasDe(empresa._id)} version={version} onSubir={(tipo, archivo, campos) => subir(empresa._id, tipo, archivo, campos)} onCambio={datosCambiaron} onEliminada={empresaEliminada} />}
              {pestana === 'errores' && <Errores empresa={empresa} revision={revision} irADocumentos={navegacion.irADocumentos} />}
              {pestana === 'ventas' && <Ventas empresa={empresa} bloqueo={bloqueo} {...navegacion} />}
              {pestana === 'mensual' && <Mensual empresa={empresa} bloqueo={bloqueo} {...navegacion} />}
              {pestana === 'inventario' && <Inventario empresa={empresa} bloqueo={bloqueo} {...navegacion} />}
              {pestana === 'libro' && <Libro empresa={empresa} bloqueo={bloqueo} {...navegacion} />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
