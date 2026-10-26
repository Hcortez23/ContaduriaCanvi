import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icono, CAMPO } from './ui.jsx';

const SALUDO = { role: 'assistant', content: 'Hola, te ayudo si no puedes subir un archivo o el sistema no lo está leyendo. Cuéntame qué archivo es y qué aviso ves.' };

const ACEPTA = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx';

function resumenSubida(r) {
  const partes = [r.facturas && `${r.facturas} factura(s) de venta`, r.compras && `${r.compras} factura(s) de compra`, r.inventarioInicial && `inventario inicial (${r.productos} productos)`].filter(Boolean);
  return `Listo, se leyó y se guardó: ${partes.join(' y ') || 'el archivo'}. Las páginas leídas con IA aparecen como advertencia para que las verifiques.${r.estado === 'pausado' ? ' El proceso sigue pausado: revisa la pestaña Errores.' : ''}`;
}

function errorSubida(error) {
  const paginas = Array.isArray(error.detalle) ? error.detalle.map((p) => `• Página ${p.pagina}: ${p.errorIA || `falta ${p.faltantes.join(', ')}`}`).join(String.fromCharCode(10)) : '';
  return `${error.message}${paginas ? `
${paginas}` : ''}`;
}

export default function Chat({ empresaId, onSubido }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([SALUDO]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sinTokens, setSinTokens] = useState(false);
  const [tipo, setTipo] = useState('facturas');
  const [fecha, setFecha] = useState('');
  const fin = useRef(null);
  const selector = useRef(null);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' });
  }, [mensajes, abierto, enviando]);

  const enviar = async (e) => {
    e.preventDefault();
    const contenido = texto.trim();
    if (!contenido || enviando || sinTokens) return;
    const historial = [...mensajes, { role: 'user', content: contenido }];
    setMensajes(historial);
    setTexto('');
    setEnviando(true);
    try {
      const { respuesta } = await api.chat(empresaId, historial.slice(1));
      setMensajes([...historial, { role: 'assistant', content: respuesta }]);
    } catch (error) {
      const agotado = error.detalle?.codigo === 'SIN_TOKENS';
      if (agotado) setSinTokens(true);
      setMensajes([...historial, { role: 'assistant', content: error.message, aviso: true }]);
    } finally {
      setEnviando(false);
    }
  };

  const adjuntar = async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo || enviando || sinTokens) return;
    const nota = texto.trim();
    const historial = [...mensajes, { role: 'user', content: `📎 ${archivo.name}${nota ? `
${nota}` : ''}` }];
    setMensajes(historial);
    setTexto('');
    setEnviando(true);
    try {
      const r = await api.subirDesdeChat(empresaId, archivo, { tipo, nota, fecha: tipo === 'inventario' ? fecha : '' });
      setMensajes([...historial, { role: 'assistant', content: resumenSubida(r) }]);
      onSubido?.();
    } catch (error) {
      setMensajes([...historial, { role: 'assistant', content: errorSubida(error), aviso: true }]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-20 flex flex-col items-end gap-3">
      {abierto && (
        <section aria-label="Asistente de ayuda" className="flex h-[28rem] max-h-[75vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-black bg-white shadow-xl">
          <header className="border-b border-neutral-200 bg-black px-4 py-3 text-white">
            <p className="m-0 text-sm font-semibold">Asistente de archivos</p>
            <p className="m-0 text-xs text-white/60">Solo ayuda a subir y leer archivos · la nota escrita guía la lectura del adjunto</p>
          </header>
          <div className="flex-1 overflow-y-auto p-3" aria-live="polite">
            <ul className="m-0 grid list-none gap-2 p-0">
              {mensajes.map((m, i) => (
                <li
                  key={i}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === 'user' ? 'justify-self-end bg-black text-white' : m.aviso ? 'border border-dashed border-black bg-neutral-50' : 'bg-neutral-100'
                  }`}
                >
                  {m.content}
                </li>
              ))}
              {enviando && <li className="justify-self-start rounded-2xl bg-neutral-100 px-3 py-2 text-sm text-neutral-500">Escribiendo…</li>}
            </ul>
            <div ref={fin} />
          </div>
          <div className="flex items-center gap-2 border-t border-neutral-200 px-3 pt-3 text-xs">
            <select className={`${CAMPO} !py-1 text-xs`} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Qué archivo vas a adjuntar">
              <option value="facturas">Adjuntar facturas</option>
              <option value="inventario">Adjuntar inventario inicial</option>
            </select>
            {tipo === 'inventario' && <input type="date" className={`${CAMPO} !py-1 text-xs`} value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha del inventario" />}
          </div>
          <form onSubmit={enviar} className="flex gap-2 p-3">
            <input ref={selector} type="file" accept={ACEPTA} className="hidden" onChange={adjuntar} />
            <button type="button" onClick={() => selector.current.click()} disabled={enviando || sinTokens} aria-label="Adjuntar archivo" title="Adjuntar archivo: la IA lo lee y lo guarda directo" className="cursor-pointer rounded-xl border border-neutral-300 bg-white px-3 text-sm hover:border-black disabled:cursor-not-allowed disabled:text-neutral-400">
              📎
            </button>
            <input
              className={CAMPO}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={1000}
              disabled={sinTokens}
              placeholder={sinTokens ? 'Sin tokens por ahora' : 'Escribe tu duda…'}
              aria-label="Mensaje"
            />
            <button type="submit" disabled={enviando || sinTokens || !texto.trim()} className="cursor-pointer rounded-xl border border-black bg-black px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400">
              Enviar
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={abierto ? 'Cerrar el asistente' : 'Abrir el asistente'}
        className="grid size-14 cursor-pointer place-items-center rounded-full border border-black bg-black text-white shadow-lg transition hover:bg-neutral-800 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
        <Icono nombre={abierto ? 'mas' : 'chat'} className={`size-6 ${abierto ? 'rotate-45' : ''}`} />
      </button>
    </div>
  );
}
