import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY = 'clave-de-prueba';
const { extraerJson } = await import('../src/services/ai/gemini.js');

const respuesta = (estado, cuerpo) => ({ ok: estado < 300, status: estado, json: async () => cuerpo });
const buena = respuesta(200, { candidates: [{ content: { parts: [{ text: '{"valor":1}' }] } }] });

test('gemini: reintenta cuando el modelo está saturado y devuelve el JSON', async () => {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = async () => (++llamadas < 3 ? respuesta(503, { error: { message: 'alta demanda' } }) : buena);
  try {
    const r = await extraerJson({ instrucciones: 'x', archivo: Buffer.from('a'), mime: 'application/pdf', esquema: {}, esperas: [0, 0, 0] });
    assert.deepEqual(r, { valor: 1 });
    assert.equal(llamadas, 3);
  } finally {
    globalThis.fetch = original;
  }
});

test('gemini: un error que no se reintenta falla de inmediato con el mensaje del servicio', async () => {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = async () => (llamadas++, respuesta(400, { error: { message: 'petición inválida' } }));
  try {
    await assert.rejects(extraerJson({ instrucciones: 'x', archivo: Buffer.from('a'), mime: 'application/pdf', esquema: {}, esperas: [0] }), /400.*petición inválida/);
    assert.equal(llamadas, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('gemini: si se agotan los reintentos, avisa el error', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => respuesta(503, { error: { message: 'alta demanda' } });
  try {
    await assert.rejects(extraerJson({ instrucciones: 'x', archivo: Buffer.from('a'), mime: 'application/pdf', esquema: {}, esperas: [0, 0] }), /503/);
  } finally {
    globalThis.fetch = original;
  }
});

const PETICION = { instrucciones: 'x', archivo: Buffer.from('a'), mime: 'application/pdf', esquema: {}, esperas: [0] };
const CUOTA = { error: { message: 'You exceeded your current quota. Please retry in 18h30m57.1s.' } };

test('gemini: si un modelo se queda sin cuota, usa el siguiente de la lista', async () => {
  const original = globalThis.fetch;
  const usados = [];
  globalThis.fetch = async (url) => {
    usados.push(String(url).match(/models\/([^:]+):/)[1]);
    return usados.length === 1 ? respuesta(429, CUOTA) : buena;
  };
  try {
    const r = await extraerJson({ ...PETICION, modelos: ['principal', 'respaldo'] });
    assert.deepEqual(r, { valor: 1 });
    assert.deepEqual(usados, ['principal', 'respaldo']);
  } finally {
    globalThis.fetch = original;
  }
});

test('gemini: si todos los modelos están sin cuota, explica cuál y cuándo vuelve', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => respuesta(429, CUOTA);
  try {
    await assert.rejects(extraerJson({ ...PETICION, modelos: ['uno', 'dos'] }), (error) => {
      assert.match(error.message, /uno: 429 cuota agotada \(vuelve en unas 18 h 30 min\)/);
      assert.match(error.message, /dos: 429 cuota agotada/);
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('gemini: un modelo que ya no existe se salta y se prueba el siguiente', async () => {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = async () => (++llamadas === 1 ? respuesta(404, { error: { message: 'no longer available' } }) : buena);
  try {
    assert.deepEqual(await extraerJson({ ...PETICION, modelos: ['viejo', 'nuevo'] }), { valor: 1 });
  } finally {
    globalThis.fetch = original;
  }
});

test('gemini: un error de petición inválida no prueba otros modelos', async () => {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = async () => (llamadas++, respuesta(400, { error: { message: 'petición inválida' } }));
  try {
    await assert.rejects(extraerJson({ ...PETICION, modelos: ['uno', 'dos'] }), /400.*petición inválida/);
    assert.equal(llamadas, 1);
  } finally {
    globalThis.fetch = original;
  }
});
