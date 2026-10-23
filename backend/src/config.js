import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || '',
  iva: Number(process.env.IVA) || 0.13,
  percepcion: Number(process.env.PERCEPCION) || 0.01,
  umbralPercepcion: Number(process.env.UMBRAL_PERCEPCION) || 250,
  metaDocumentosMes: Number(process.env.META_DOCUMENTOS_MES) || 200,
  metaCcfMes: Number(process.env.META_CCF_MES) || 20,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModeloTexto: process.env.GROQ_MODELO_TEXTO || 'openai/gpt-oss-120b',
  groqModeloVision: process.env.GROQ_MODELO_VISION || 'qwen/qwen3.8-27b',
  geminiModelos: (process.env.GEMINI_MODELOS || 'gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview,gemini-3.1-flash-lite')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean),
};
