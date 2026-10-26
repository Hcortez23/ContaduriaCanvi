const BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api`;

async function pedir(ruta, opciones) {
  const respuesta = await fetch(`${BASE}${ruta}`, opciones);
  const esJson = (respuesta.headers.get('content-type') || '').includes('json');
  const cuerpo = esJson ? await respuesta.json() : null;
  if (!respuesta.ok) {
    const error = new Error(cuerpo?.error || `Error ${respuesta.status}`);
    error.status = respuesta.status;
    error.detalle = cuerpo?.detalle ?? null;
    throw error;
  }
  return cuerpo;
}

const json = (metodo, datos) => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });

export const api = {
  empresas: () => pedir('/empresas'),
  crearEmpresa: (datos) => pedir('/empresas', json('POST', datos)),
  eliminarEmpresa: (id) => pedir(`/empresas/${id}`, { method: 'DELETE' }),
  facturas: (id) => pedir(`/empresas/${id}/facturas`),
  compras: (id) => pedir(`/empresas/${id}/compras`),
  inventariosIniciales: (id) => pedir(`/empresas/${id}/inventarios-iniciales`),
  subir: (id, tipo, archivo, campos = {}) => {
    const forma = new FormData();
    for (const [clave, valor] of Object.entries(campos)) forma.append(clave, valor);
    forma.append('archivo', archivo);
    return pedir(`/empresas/${id}/documentos/${tipo}`, { method: 'POST', body: forma });
  },
  borrar: (id, tipo) => pedir(`/empresas/${id}/documentos/${tipo}`, { method: 'DELETE' }),
  revision: (id) => pedir(`/empresas/${id}/revision`),
  reporteVentas: (id) => pedir(`/empresas/${id}/reporte-ventas`),
  mensual: (id) => pedir(`/empresas/${id}/mensual`),
  inventario: (id) => pedir(`/empresas/${id}/inventario`),
  chat: (id, mensajes) => pedir(`/empresas/${id}/chat`, json('POST', { mensajes })),
  subirDesdeChat: (id, archivo, campos = {}) => {
    const forma = new FormData();
    for (const [clave, valor] of Object.entries(campos)) if (valor) forma.append(clave, valor);
    forma.append('archivo', archivo);
    return pedir(`/empresas/${id}/chat/archivo`, { method: 'POST', body: forma });
  },
  urlLibro: (id) => `${BASE}/empresas/${id}/libro`,
  urlCarta: (id) => `${BASE}/empresas/${id}/carta`,
};
