import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useCarga } from '../useCarga.js';
import { Boton, Panel, Titulo, Ayuda, Aviso, Dato, Datos, Icono, CAMPO } from './ui.jsx';

const tamano = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const TIPOS_ACEPTADOS = {
  pdf: ['application/pdf'],
  inventario: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

const formatoFecha = (iso) => iso.split('-').reverse().join('/');

function textoResultado(tipo, r) {
  if (tipo === 'mixto') {
    const partes = [`${r.facturas} facturas de venta`, `${r.compras} de compra`];
    if (r.inventarioInicial) partes.push('el inventario inicial');
    return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]} leídos.`;
  }
  if (tipo === 'inventario') return `Inventario inicial de ${r.productos} productos guardado${r.fecha ? ` con fecha ${formatoFecha(r.fecha)}` : ' como punto de partida, sin fecha'}.`;
  if (tipo === 'ventas') return `${r.facturas} facturas leídas${r.inventarioInicial ? ' y el inventario inicial' : ''}.`;
  return `${r.compras} facturas de compra leídas.`;
}

function Subida({ tipo, titulo, icono, ayuda, destacada, aceptar, conFecha, fechaSugerida, estado, onSubir }) {
  const [archivo, setArchivo] = useState(null);
  const [fecha, setFecha] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const [clave, setClave] = useState(0);
  const enviando = Boolean(estado?.enviando);
  const resultado = estado?.resultado;
  const error = estado?.error;
  const tipos = TIPOS_ACEPTADOS[aceptar];

  useEffect(() => {
    if (conFecha && !fecha && fechaSugerida) setFecha(fechaSugerida);
  }, [fechaSugerida]);

  const elegir = (lista) => {
    const candidato = lista && lista[0];
    if (candidato && (tipos.includes(candidato.type) || (aceptar === 'inventario' && /\.xlsx$/i.test(candidato.name)))) setArchivo(candidato);
  };

  const soltar = (e) => {
    e.preventDefault();
    setArrastrando(false);
    if (!enviando) elegir(e.dataTransfer.files);
  };

  const enviar = (e) => {
    e.preventDefault();
    if (!archivo || enviando) return;
    onSubir(archivo, conFecha && fecha ? { fecha } : {});
    setArchivo(null);
    setClave((c) => c + 1);
  };

  return (
    <Panel className={destacada ? 'border-black' : ''}>
      <form onSubmit={enviar}>
        <Titulo icono={icono}>
          {titulo}
          {destacada && <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Recomendado</span>}
        </Titulo>
        <Ayuda>{ayuda}</Ayuda>
        {conFecha && (
          <div className="mb-4">
            <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Fecha del inventario (opcional)
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${CAMPO} normal-case tracking-normal sm:w-56`} />
            </label>
            <p className="m-0 mt-1.5 text-xs text-neutral-500">
              Si no la sabes, déjala vacía: el primer inventario será el punto de partida. Solo es obligatoria para sumar otro inventario a uno ya cargado.
            </p>
          </div>
        )}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={soltar}
          className={`mb-4 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-4 py-8 text-center transition focus-within:border-black focus-within:ring-4 focus-within:ring-black/10 hover:border-black ${
            arrastrando ? 'border-black bg-neutral-100' : 'border-neutral-300 bg-neutral-50'
          }`}
        >
          <Icono nombre={archivo ? 'archivo' : 'subir'} className="size-7" />
          <span className="max-w-full truncate text-sm font-semibold">{archivo ? archivo.name : aceptar === 'inventario' ? 'Elegir PDF, imagen o Excel' : 'Elegir un archivo PDF'}</span>
          <span className="text-xs text-neutral-500">{archivo ? tamano(archivo.size) : 'o arrástralo hasta aquí'}</span>
          <input
            key={clave}
            type="file"
            accept={aceptar === 'inventario' ? 'application/pdf,image/png,image/jpeg,image/webp,.xlsx' : 'application/pdf'}
            className="sr-only"
            disabled={enviando}
            onChange={(e) => elegir(e.target.files)}
          />
        </label>
        <Boton type="submit" icono="subir" disabled={!archivo || enviando} className="w-full sm:w-auto">
          {enviando ? 'Leyendo y revisando…' : 'Subir y revisar'}
        </Boton>
        {enviando && (
          <p role="status" className="mb-0 mt-3 flex items-start gap-2 text-sm text-neutral-600">
            <span className="mt-1 size-3.5 shrink-0 animate-spin rounded-full border-2 border-black border-t-transparent" aria-hidden="true" />
            <span>
              Leyendo <strong className="text-black">{estado.nombre}</strong>. Puedes cambiar de pestaña, pero no cierres esta página. Si trae una imagen, puede tardar uno o dos minutos.
            </span>
          </p>
        )}
        {resultado && !enviando && (
          <p role="status" className="mt-4 text-sm font-semibold">
            {textoResultado(tipo, resultado)}{' '}
            <span className="font-normal text-neutral-600">
              Proceso {resultado.estado === 'pausado' ? 'pausado' : resultado.estado === 'vacio' ? 'sin documentos' : 'listo'} ({resultado.resumen.errores} errores).
            </span>
          </p>
        )}
        {resultado?.formatoAprendido && !enviando && (
          <p className="mt-2 text-sm text-neutral-600">Este formato de factura era nuevo: el sistema lo aprendió con una sola consulta a la IA y las próximas facturas con este formato se leerán sin IA.</p>
        )}
        {resultado?.errorInventario && !enviando && (
          <Aviso>No se pudo leer el inventario inicial: {resultado.errorInventario}. Los demás documentos sí se guardaron; vuelve a subir el archivo para reintentar la lectura.</Aviso>
        )}
        {error && !enviando && (
          <Aviso>
            <p className="m-0">{error.message}</p>
            {Array.isArray(error.detalle) && (
              <ul className="mt-2 list-disc pl-5">
                {error.detalle.map((d) => (
                  <li key={`${d.pagina}-${d.faltantes.join()}`}>
                    Página {d.pagina}: {d.faltantes.length && d.faltantes[0] !== 'clasificación' ? `falta ${d.faltantes.join(', ')}` : 'no se pudo clasificar'}
                    {d.errorIA ? ` (${d.errorIA})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Aviso>
        )}
      </form>
    </Panel>
  );
}

function Borrar({ texto, onConfirmar }) {
  const [seguro, setSeguro] = useState(false);
  if (!seguro) {
    return (
      <Boton variante="secundario" icono="basura" onClick={() => setSeguro(true)}>
        {texto}
      </Boton>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 rounded-xl border border-black px-3 py-1.5 text-sm font-medium">
      ¿Seguro?
      <Boton
        className="px-3 py-1.5"
        onClick={() => {
          setSeguro(false);
          onConfirmar();
        }}
      >
        Sí, borrar
      </Boton>
      <Boton variante="secundario" className="px-3 py-1.5" onClick={() => setSeguro(false)}>
        No
      </Boton>
    </span>
  );
}

export default function Documentos({ empresa, subidas, version, onSubir, onCambio, onEliminada }) {
  const carga = useCarga(
    async () => {
      const [facturas, compras, inventario] = await Promise.all([api.facturas(empresa._id), api.compras(empresa._id), api.inventariosIniciales(empresa._id)]);
      return { facturas, compras, inventario };
    },
    [empresa._id, version]
  );
  const datos = carga.datos;
  const cf = datos ? datos.facturas.filter((f) => f.tipo === 'CF').length : 0;
  const ccf = datos ? datos.facturas.filter((f) => f.tipo === 'CCF').length : 0;
  const primeraFactura = datos && datos.facturas.length ? datos.facturas.map((f) => f.fecha.slice(0, 10)).sort()[0] : '';

  const borrar = (tipo) => async () => {
    await api.borrar(empresa._id, tipo);
    onCambio();
  };

  const eliminarEmpresa = async () => {
    await api.eliminarEmpresa(empresa._id);
    onEliminada();
  };

  return (
    <div className="grid gap-6">
      <Panel>
        <Titulo icono="archivo">Documentos cargados</Titulo>
        {datos ? (
          <Datos>
            <Dato etiqueta="Consumidor final" valor={cf} />
            <Dato etiqueta="Crédito fiscal" valor={ccf} />
            <Dato etiqueta="Facturas de compra" valor={datos.compras.length} />
            <Dato etiqueta="Inventario inicial" valor={datos.inventario.length ? `${datos.inventario.length} ${datos.inventario.length === 1 ? 'tabla' : 'tablas'}` : 'No cargado'} />
          </Datos>
        ) : (
          <Ayuda className="mb-0">Cargando…</Ayuda>
        )}
      </Panel>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-6">
        <Subida
          tipo="mixto"
          titulo="Todo en un solo archivo"
          icono="hojas"
          destacada
          aceptar="pdf"
          ayuda="Si el PDF trae ventas, compras y el inventario inicial mezclados, súbelo aquí: el sistema separa cada documento solo. La semana de cada factura se decide por su fecha, no por el archivo."
          estado={subidas.mixto}
          onSubir={(archivo, campos) => onSubir('mixto', archivo, campos)}
        />
        <Subida
          tipo="ventas"
          titulo="Facturas de venta"
          icono="subir"
          aceptar="pdf"
          ayuda="PDF con las facturas de consumidor final y crédito fiscal. Si trae el inventario inicial como imagen, también se lee. Para corregir, sube el PDF corregido: reemplaza las facturas con el mismo número y de la misma semana."
          estado={subidas.ventas}
          onSubir={(archivo, campos) => onSubir('ventas', archivo, campos)}
        />
        <Subida
          tipo="compras"
          titulo="Facturas de compra"
          icono="subir"
          aceptar="pdf"
          ayuda="PDF con las facturas de compra. Las compras de una semana se suman al inventario inicial de la semana siguiente."
          estado={subidas.compras}
          onSubir={(archivo, campos) => onSubir('compras', archivo, campos)}
        />
        <Subida
          tipo="inventario"
          titulo="Inventario inicial"
          icono="archivo"
          aceptar="inventario"
          conFecha
          fechaSugerida={primeraFactura}
          ayuda="Solo si el inventario viene en su propio archivo (PDF, imagen o Excel). Si viene dentro del PDF de las facturas, no hace falta: se lee solo."
          estado={subidas.inventario}
          onSubir={(archivo, campos) => onSubir('inventario', archivo, campos)}
        />
      </div>

      <Panel>
        <Titulo icono="basura">Borrar datos</Titulo>
        <div className="flex flex-wrap items-center gap-3">
          <Borrar texto="Borrar facturas de venta" onConfirmar={borrar('ventas')} />
          <Borrar texto="Borrar facturas de compra" onConfirmar={borrar('compras')} />
          <Borrar texto="Borrar inventario inicial" onConfirmar={borrar('inventario')} />
          <Borrar texto="Eliminar empresa" onConfirmar={eliminarEmpresa} />
        </div>
      </Panel>
    </div>
  );
}
