import { api } from '../api.js';
import { useCarga, dinero, numero } from '../useCarga.js';
import Bloqueado from './Bloqueado.jsx';
import { Panel, Titulo, Ayuda, Aviso, Dato, Datos, Tabla, TH, TD, FILA } from './ui.jsx';

const NUM = 'text-right tabular-nums whitespace-nowrap';

function Reporte({ empresa }) {
  const carga = useCarga(() => api.reporteVentas(empresa._id), [empresa._id]);
  if (carga.error) return <Aviso>{carga.error.message}</Aviso>;
  if (!carga.datos) return <Ayuda>Cargando…</Ayuda>;
  const { productos, documentos, totales } = carga.datos;

  return (
    <div className="grid gap-6">
      <Panel>
        <Titulo icono="hojas">Resumen de ventas</Titulo>
        <Datos>
          <Dato etiqueta="Consumidor final" valor={`${numero(documentos.CF.cantidad)} docs · ${dinero(documentos.CF.total)}`} />
          <Dato etiqueta="Crédito fiscal" valor={`${numero(documentos.CCF.cantidad)} docs · ${dinero(documentos.CCF.total)}`} />
          <Dato etiqueta="Unidades vendidas" valor={numero(totales.unidades)} />
          <Dato etiqueta="Base sin IVA" valor={dinero(totales.base)} />
        </Datos>
      </Panel>
      <Panel>
        <Titulo icono="archivo">Ventas por producto</Titulo>
        <Tabla>
          <thead>
            <tr>
              <th className={TH}>Producto</th>
              <th className={`${TH} text-right`}>Unidades</th>
              <th className={`${TH} text-right`}>Base</th>
              <th className={`${TH} text-right`}>IVA</th>
              <th className={`${TH} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.clave} className={FILA}>
                <td className={TD}>
                  {p.clave} · {p.nombre}
                </td>
                <td className={`${TD} ${NUM}`}>{numero(p.unidades)}</td>
                <td className={`${TD} ${NUM}`}>{dinero(p.base)}</td>
                <td className={`${TD} ${NUM}`}>{dinero(p.iva)}</td>
                <td className={`${TD} ${NUM}`}>{dinero(p.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-neutral-50 font-semibold">
              <th className="border-t border-neutral-200 px-4 py-3 text-left">Total</th>
              <th className={`border-t border-neutral-200 px-4 py-3 ${NUM}`}>{numero(totales.unidades)}</th>
              <th className={`border-t border-neutral-200 px-4 py-3 ${NUM}`}>{dinero(totales.base)}</th>
              <th className={`border-t border-neutral-200 px-4 py-3 ${NUM}`}>{dinero(totales.iva)}</th>
              <th className={`border-t border-neutral-200 px-4 py-3 ${NUM}`}>{dinero(totales.total)}</th>
            </tr>
          </tfoot>
        </Tabla>
      </Panel>
    </div>
  );
}

export default function Ventas({ empresa, bloqueo, irAErrores, irADocumentos }) {
  return bloqueo ? <Bloqueado bloqueo={bloqueo} irAErrores={irAErrores} irADocumentos={irADocumentos} /> : <Reporte empresa={empresa} />;
}
