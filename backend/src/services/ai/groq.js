import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { config } from '../../config.js';

const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions';

function aEsquemaJson(nodo) {
  if (Array.isArray(nodo)) return nodo.map(aEsquemaJson);
  if (!nodo || typeof nodo !== 'object') return nodo;
  const salida = {};
  for (const [clave, valor] of Object.entries(nodo)) {
    if (clave === 'nullable') continue;
    salida[clave] = clave === 'type' ? String(valor).toLowerCase() : aEsquemaJson(valor);
  }
  if (nodo.nullable && salida.type) salida.type = [salida.type, 'null'];
  if (salida.type === 'object' && salida.properties) {
    salida.additionalProperties = false;
    salida.required = Object.keys(salida.properties);
  }
  return salida;
}

const MAXIMO_IMAGENES = 3;

async function imagenesDe(archivo, mime) {
  if (mime.startsWith('image/')) return [{ mime, datos: Buffer.from(archivo) }];
  const doc = await getDocument({ data: new Uint8Array(archivo), useSystemFonts: true, verbosity: 0 }).promise;
  if (doc.numPages > MAXIMO_IMAGENES) throw new Error(`Groq acepta hasta ${MAXIMO_IMAGENES} imágenes por consulta y el archivo tiene ${doc.numPages} páginas`);
  const imagenes = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const viewport = pagina.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    imagenes.push({ mime: 'image/png', datos: canvas.toBuffer('image/png') });
  }
  return imagenes;
}

function segundosDeEspera(mensaje) {
  const m = String(mensaje).match(/try again in (?:(\d+)m)?(?:([\d.]+)(ms|s))?/i);
  if (!m || (!m[1] && !m[2])) return null;
  const minutos = Number(m[1] ?? 0);
  const resto = m[2] ? (m[3] === 'ms' ? Number(m[2]) / 1000 : Number(m[2])) : 0;
  return minutos * 60 + resto;
}

export const groqDisponible = () => Boolean(config.groqApiKey);

export async function extraerJsonGroq({ instrucciones, archivo, mime, esquema }) {
  const conImagen = Boolean(archivo);
  const modelo = conImagen ? config.groqModeloVision : config.groqModeloTexto;
  const contenido = conImagen
    ? [
        { type: 'text', text: instrucciones },
        ...(await imagenesDe(archivo, mime)).map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.datos.toString('base64')}` } })),
      ]
    : instrucciones;
  const cuerpoPeticion = JSON.stringify({
    model: modelo,
    temperature: 0,
    max_completion_tokens: 6000,
    ...(modelo.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    messages: [{ role: 'user', content: contenido }],
    response_format: { type: 'json_schema', json_schema: { name: 'resultado', schema: aEsquemaJson(esquema), strict: true } },
  });
  let cuerpo;
  for (let intento = 0; ; intento++) {
    const respuesta = await fetch(URL_GROQ, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groqApiKey}` },
      body: cuerpoPeticion,
      signal: AbortSignal.timeout(60000),
    });
    cuerpo = await respuesta.json();
    if (respuesta.ok) break;
    const mensaje = cuerpo.error?.message ?? 'error desconocido';
    const espera = respuesta.status === 429 ? segundosDeEspera(mensaje) : null;
    if (espera !== null && espera <= 30 && intento < 2) {
      await new Promise((resolver) => setTimeout(resolver, (espera + 1) * 1000));
      continue;
    }
    throw new Error(`Groq respondió ${respuesta.status}: ${mensaje}`);
  }
  const texto = cuerpo.choices?.[0]?.message?.content;
  if (!texto) throw new Error('Groq no devolvió contenido');
  return JSON.parse(texto);
}
