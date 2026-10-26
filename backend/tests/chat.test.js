import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { conversar } from '../src/services/ai/chat.js';

const original = globalThis.fetch;
const mensajes = [{ role: 'user', content: 'No me lee el PDF' }];

test('chat: responde con el primer modelo disponible', async () => {
  config.geminiApiKey = 'x';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Sube el PDF' }] } }] }) });
  assert.equal((await conversar({ mensajes })).respuesta, 'Sube el PDF');
});

test('chat: si todos los modelos están sin cuota avisa SIN_TOKENS', async () => {
  config.geminiApiKey = 'x';
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(conversar({ mensajes }), (e) => e.status === 429 && e.detalle.codigo === 'SIN_TOKENS');
});

test('chat: sin claves de IA avisa que no está configurado', async () => {
  config.geminiApiKey = '';
  await assert.rejects(conversar({ mensajes }), (e) => e.detalle.codigo === 'SIN_CONFIGURAR');
});

test('chat: exige un mensaje del usuario', async () => {
  await assert.rejects(conversar({ mensajes: [] }), (e) => e.status === 400);
  globalThis.fetch = original;
});
