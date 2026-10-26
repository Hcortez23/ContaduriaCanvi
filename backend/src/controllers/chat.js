import { conversar } from '../services/ai/chat.js';
import { revisarEmpresa } from '../services/revision.js';

async function contextoDe(empresa) {
  try {
    const { estado, resumen, hallazgos } = await revisarEmpresa(empresa);
    const lista = hallazgos.slice(0, 10).map((h) => `- [${h.gravedad}] ${h.codigo}: ${h.detalle}`).join('\n');
    return `Empresa: ${empresa.nombre}. Estado: ${estado}. Documentos: ${resumen.documentos}, errores: ${resumen.errores}, advertencias graves: ${resumen.advertenciasGraves ?? 0}, advertencias: ${resumen.advertencias}.${lista ? `\nPrimeros avisos:\n${lista}` : ''}`;
  } catch {
    return '';
  }
}

export async function chat(req, res) {
  res.json(await conversar({ mensajes: req.body?.mensajes, contexto: await contextoDe(req.empresa) }));
}
