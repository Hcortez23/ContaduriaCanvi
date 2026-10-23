import { config } from '../../config.js';
import { extraerJsonGroq, groqDisponible } from './groq.js';

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const REINTENTABLES = new Set([500, 503]);
const SIGUIENTE_MODELO = new Set([404, 429]);
const ESPERAS_MS = [2000, 5000, 10000, 20000];

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

function cuandoVuelve(mensaje) {
  const m = String(mensaje).match(/retry in ((?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/i);
  if (!m || !m[1]) return '';
  const horas = Number(m[1].match(/(\d+)h/)?.[1] ?? 0);
  const minutos = Number(m[1].match(/(\d+)m/)?.[1] ?? 0);
  if (horas) return `vuelve en unas ${horas} h${minutos ? ` ${minutos} min` : ''}`;
  if (minutos) return `vuelve en unos ${minutos} min`;
  return 'vuelve en unos segundos';
}

class ErrorGemini extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

async function consultar(modelo, cuerpoPeticion, esperas) {
  for (let intento = 0; ; intento++) {
    const respuesta = await fetch(`${URL_BASE}/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
      body: cuerpoPeticion,
      signal: AbortSignal.timeout(60000),
    });
    const cuerpo = await respuesta.json();
    if (respuesta.ok) {
      const texto = cuerpo.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
      if (!texto) throw new ErrorGemini(200, 'Gemini no devolvió contenido');
      return JSON.parse(texto);
    }
    const mensaje = cuerpo.error?.message || 'error desconocido';
    if (REINTENTABLES.has(respuesta.status) && intento < esperas.length) {
      await esperar(esperas[intento]);
      continue;
    }
    throw new ErrorGemini(respuesta.status, mensaje);
  }
}

async function extraerJsonGemini({ instrucciones, archivo, mime, esquema, esperas = ESPERAS_MS, modelos = config.geminiModelos }) {
  if (!config.geminiApiKey) throw new Error('Falta GEMINI_API_KEY en el archivo .env');
  const cuerpoPeticion = JSON.stringify({
    contents: [{ parts: [{ text: instrucciones }, ...(archivo ? [{ inline_data: { mime_type: mime, data: Buffer.from(archivo).toString('base64') } }] : [])] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: esquema },
  });

  const fallos = [];
  for (const modelo of modelos) {
    try {
      return await consultar(modelo, cuerpoPeticion, esperas);
    } catch (error) {
      if (!(error instanceof ErrorGemini)) throw error;
      const sePuedeProbarOtro = SIGUIENTE_MODELO.has(error.status) || REINTENTABLES.has(error.status);
      if (!sePuedeProbarOtro) throw new Error(`Gemini respondió ${error.status}: ${error.message}`);
      const vuelve = cuandoVuelve(error.message);
      const motivo = error.status === 429 ? `cuota agotada${vuelve ? ` (${vuelve})` : ''}` : error.status === 404 ? 'modelo no disponible' : 'saturado';
      fallos.push(`${modelo}: ${error.status} ${motivo}`);
    }
  }
  throw new Error(`Gemini respondió con error en todos los modelos probados: ${fallos.join('; ')}`);
}

export async function extraerJson(opciones) {
  try {
    return await extraerJsonGemini(opciones);
  } catch (errorGemini) {
    const { instrucciones, archivo, mime, esquema, soloTexto } = opciones;
    const sinArchivo = soloTexto || !archivo;
    const puedeGroq = groqDisponible() && (sinArchivo || mime?.startsWith('image/') || mime === 'application/pdf');
    if (!puedeGroq) throw errorGemini;
    try {
      return await extraerJsonGroq({ instrucciones, archivo: sinArchivo ? null : archivo, mime, esquema });
    } catch (errorGroq) {
      throw new Error(`${errorGemini.message}; ${errorGroq.message}`);
    }
  }
}
