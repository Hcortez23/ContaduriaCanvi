import { api } from '../api.js';
import { useCarga, dinero, numero } from '../useCarga.js';
import Bloqueado from './Bloqueado.jsx';
import { Panel, Titulo, Ayuda, Aviso, Dato, Datos } from './ui.jsx';

const nombreMes = (mes) => {
  const [anio, numeroMes] = mes.split('-').map(Number);
  const texto = new Date(Date.UTC(anio, numeroMes - 1, 1)).toLocaleDateString('es-SV', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

function Avance({ etiqueta, valor, meta, porcentaje }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium">{etiqueta}</span>
        <span className="tabular-nums text-neutral-600">
          <strong className="text-black">{numero(valor)}</strong> de {numero(meta)} · {porcentaje}%
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-valuemin={0} aria-valuemax={meta} aria-valuenow={valor} aria-label={etiqueta}>
        <div className="h-full rounded-full bg-black transition-all" style={{ width: `${Math.min(porcentaje, 100)}%` }} />
      </div>
    </div>
  );
}

function Meses({ empresa }) {
  const carga = useCarga(() => api.mensual(empresa._id), [empresa._id]);
  if (carga.error) return <Aviso>{carga.error.message}</Aviso>;
  if (!carga.datos) return <Ayuda>Cargando…</Ayuda>;
  if (!carga.datos.length) return <Ayuda>Todavía no hay meses con movimientos.</Ayuda>;

  return (
    <div className="grid gap-6">
      {carga.datos.map((m) => (
        <Panel key={m.mes}>
          <Titulo icono="hojas">{nombreMes(m.mes)}</Titulo>
          <div className="mb-6 grid gap-5 sm:grid-cols-2">
            <Avance etiqueta="Documentos emitidos" valor={m.documentos.total} meta={m.meta.documentos} porcentaje={m.avance.documentos} />
            <Avance etiqueta="Créditos fiscales" valor={m.documentos.ccf} meta={m.meta.ccf} porcentaje={m.avance.ccf} />
          </div>
          <Datos>
            <Dato etiqueta="Consumidor final" valor={numero(m.documentos.cf)} />
            <Dato etiqueta="Crédito fiscal" valor={numero(m.documentos.ccf)} />
            <Dato etiqueta="Facturas de compra" valor={numero(m.compras)} />
            {m.ventas && <Dato etiqueta="Unidades vendidas" valor={numero(m.ventas.unidades)} />}
            {m.ventas && <Dato etiqueta="Ventas con IVA" valor={dinero(m.ventas.total)} />}
            {m.ventas && <Dato etiqueta="Base sin IVA" valor={dinero(m.ventas.base)} />}
          </Datos>
        </Panel>
      ))}
      <Ayuda className="mb-0">El avance se calcula contra la meta mensual de documentos. No detiene el proceso: un mes a medias aparece con menos del 100%.</Ayuda>
    </div>
  );
}

export default function Mensual({ empresa, bloqueo, irAErrores, irADocumentos }) {
  return bloqueo ? <Bloqueado bloqueo={bloqueo} irAErrores={irAErrores} irADocumentos={irADocumentos} /> : <Meses empresa={empresa} />;
}
