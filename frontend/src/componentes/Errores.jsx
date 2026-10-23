import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { Panel, Enlace, BotonEnlace, Etiqueta, Aviso, Ayuda, CAMPO } from './ui.jsx';

const NOMBRES_TIPO = { CF: 'Consumidor final', CCF: 'Crédito fiscal', COMPRA: 'Compra', INVENTARIO: 'Inventario inicial', TODAS: 'General' };

function Punto({ error }) {
  return <span className={`mt-1.5 size-2 shrink-0 rounded-full border border-black ${error ? 'bg-black' : 'bg-white'}`} title={error ? 'Error' : 'Advertencia'} />;
}

function agruparPorDocumento(hallazgos) {
  const grupos = new Map();
  for (const h of hallazgos) {
    const clave = `${h.tipo}|${h.correlativo}|${h.pagina}`;
    if (!grupos.has(clave)) grupos.set(clave, { tipo: h.tipo, correlativo: h.correlativo, pagina: h.pagina, items: [] });
    grupos.get(clave).items.push(h);
  }
  const errores = (g) => g.items.filter((h) => h.gravedad === 'ERROR').length;
  return [...grupos.values()].sort((x, y) => errores(y) - errores(x));
}

function Documento({ grupo }) {
  const titulo = `${NOMBRES_TIPO[grupo.tipo] || grupo.tipo}${grupo.correlativo !== null ? ` ${grupo.correlativo}` : ''}`;
  return (
    <div className="rounded-xl border border-neutral-200">
      <div className="flex items-baseline justify-between gap-3 border-b border-neutral-100 px-4 py-2.5">
        <p className="m-0 text-sm font-semibold">{titulo}</p>
        {grupo.pagina !== null && <p className="m-0 text-xs text-neutral-500">pág. {grupo.pagina}</p>}
      </div>
      <ul className="m-0 grid list-none gap-3 p-4">
        {grupo.items.map((h, i) => (
          <li key={i} className="flex gap-3">
            <Punto error={h.gravedad === 'ERROR'} />
            <div className="min-w-0">
              <p className="m-0 text-sm">
                <span className="mr-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">{h.codigo}</span>
                {h.detalle}
              </p>
              <p className="m-0 mt-0.5 text-xs text-neutral-500">{h.correccion}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Errores({ empresa, revision, irADocumentos }) {
  const [gravedad, setGravedad] = useState('TODAS');
  const [codigo, setCodigo] = useState('TODOS');
  const datos = revision.datos;

  const codigos = useMemo(() => (datos ? [...new Set(datos.hallazgos.map((h) => h.codigo))].sort() : []), [datos]);
  const visibles = useMemo(
    () => (datos ? datos.hallazgos.filter((h) => (gravedad === 'TODAS' || h.gravedad === gravedad) && (codigo === 'TODOS' || h.codigo === codigo)) : []),
    [datos, gravedad, codigo]
  );

  if (revision.error) return <Aviso>{revision.error.message}</Aviso>;
  if (!datos) return <Ayuda>Revisando…</Ayuda>;

  return (
    <div className="grid gap-6">
      <Panel>
        {datos.estado === 'pausado' ? (
          <p className="m-0 text-sm leading-relaxed">
            Corrige estos errores en las facturas y <Enlace onClick={irADocumentos}>sube el PDF corregido</Enlace>. El proceso continúa solo cuando no queda ningún error. Las advertencias no detienen el proceso.
          </p>
        ) : datos.estado === 'vacio' ? (
          <p className="m-0 text-sm">Todavía no hay documentos cargados.</p>
        ) : (
          <p className="m-0 text-sm">No hay errores. {datos.resumen.advertencias > 0 ? 'Las advertencias no detienen el proceso.' : ''}</p>
        )}
        {datos.hallazgos.length > 0 && (
          <div className="mt-4">
            <BotonEnlace icono="descargar" href={api.urlCarta(empresa._id)} download>
              Descargar carta de correcciones (Word)
            </BotonEnlace>
          </div>
        )}
      </Panel>

      {datos.hallazgos.length > 0 && (
        <Panel>
          <div className="mb-5 flex flex-wrap items-end gap-4">
            <Etiqueta texto="Gravedad">
              <select className={CAMPO} value={gravedad} onChange={(e) => setGravedad(e.target.value)}>
                <option value="TODAS">Todas</option>
                <option value="ERROR">Errores</option>
                <option value="ADVERTENCIA">Advertencias</option>
              </select>
            </Etiqueta>
            <Etiqueta texto="Tipo de problema">
              <select className={CAMPO} value={codigo} onChange={(e) => setCodigo(e.target.value)}>
                <option value="TODOS">Todos</option>
                {codigos.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Etiqueta>
            <p className="m-0 pb-2.5 text-sm text-neutral-500">
              {visibles.length} de {datos.hallazgos.length}
            </p>
          </div>
          <div className="grid gap-3">
            {agruparPorDocumento(visibles).map((g) => (
              <Documento key={`${g.tipo}|${g.correlativo}|${g.pagina}`} grupo={g} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
