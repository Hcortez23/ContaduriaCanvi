import { useState } from 'react';
import { api } from '../api.js';
import { useCarga, numero } from '../useCarga.js';
import Bloqueado from './Bloqueado.jsx';
import { Panel, Etiqueta, Ayuda, Aviso, Tabla, TH, TD, FILA, CAMPO } from './ui.jsx';

const formato = (iso) => iso.split('-').reverse().join('/');
const NUM = 'text-right tabular-nums whitespace-nowrap';

function Semanas({ empresa }) {
  const carga = useCarga(() => api.inventario(empresa._id), [empresa._id]);
  const [elegida, setElegida] = useState(1);
  if (carga.error) return <Aviso>{carga.error.message}</Aviso>;
  if (!carga.datos) return <Ayuda>Cargando…</Ayuda>;
  const { semanas } = carga.datos;
  if (!semanas.length) return <Ayuda>Todavía no hay semanas con movimientos.</Ayuda>;
  const semana = semanas.find((s) => s.numero === elegida) || semanas[0];

  return (
    <Panel>
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <Etiqueta texto="Semana">
          <select className={CAMPO} value={semana.numero} onChange={(e) => setElegida(Number(e.target.value))}>
            {semanas.map((s) => (
              <option key={s.numero} value={s.numero}>
                Semana {s.numero} ({formato(s.desde)} al {formato(s.hasta)})
              </option>
            ))}
          </select>
        </Etiqueta>
        <p className="m-0 pb-2.5 text-sm text-neutral-500">{semana.alertas.length ? `${semana.alertas.length} productos con inventario negativo` : 'Sin inventario negativo'}</p>
      </div>
      <Tabla>
        <thead>
          <tr>
            <th className={TH}>Código</th>
            <th className={TH}>Modelo</th>
            <th className={TH}>Color</th>
            <th className={`${TH} text-right`}>Talla</th>
            <th className={`${TH} text-right`}>Saldo anterior</th>
            <th className={`${TH} text-right`}>Compras</th>
            <th className={`${TH} text-right`}>Vendidas</th>
            <th className={`${TH} text-right`}>Existencia final</th>
          </tr>
        </thead>
        <tbody>
          {semana.filas.map((f) => (
            <tr key={f.clave} className={FILA}>
              <td className={TD}>{f.clave}</td>
              <td className={TD}>{f.modelo}</td>
              <td className={TD}>{f.color}</td>
              <td className={`${TD} ${NUM}`}>{f.talla}</td>
              <td className={`${TD} ${NUM}`}>{numero(f.saldo)}</td>
              <td className={`${TD} ${NUM}`}>{numero(f.compras)}</td>
              <td className={`${TD} ${NUM}`}>{numero(f.vendidas)}</td>
              <td className={`${TD} ${NUM} ${f.final < 0 ? 'font-bold underline' : ''}`}>{f.final < 0 ? `▼ ${numero(f.final)}` : numero(f.final)}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </Panel>
  );
}

export default function Inventario({ empresa, bloqueo, irAErrores, irADocumentos }) {
  return bloqueo ? <Bloqueado bloqueo={bloqueo} irAErrores={irAErrores} irADocumentos={irADocumentos} /> : <Semanas empresa={empresa} />;
}
