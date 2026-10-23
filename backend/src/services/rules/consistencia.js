import { normalizar, moda } from '../../utils/texto.js';
import { hallazgo } from './hallazgo.js';

const TITULOS = { CF: /consumidor final/, CCF: /credito fiscal/ };
const RE_TITULO = /^(FACTURA|COMPROBANTE)/i;

function revisarCorrelativos(resultados, hallazgos) {
  for (const tipo of ['CF', 'CCF']) {
    let previo = null;
    for (const { factura: f } of resultados.filter((r) => r.factura.tipo === tipo)) {
      const esperado = previo === null ? 1 : previo.correlativo + 1;
      if (f.correlativo !== esperado) {
        const motivo =
          f.correlativo === previo?.correlativo ? 'repetido' : f.correlativo < esperado ? 'fuera de orden' : 'con salto';
        const faltan =
          motivo === 'con salto'
            ? ` ${esperado === f.correlativo - 1 ? `Falta el documento ${esperado}` : `Faltan los documentos del ${esperado} al ${f.correlativo - 1}`}${previo === null ? ' (¿falta subir las semanas anteriores?)' : ' (¿falta subir esa semana?)'}.`
            : '';
        hallazgos.push(
          hallazgo(f, 'ERROR', 'CORRELATIVO', `Correlativo ${f.correlativo} ${motivo}: se esperaba el ${esperado}.${faltan}`, 'Respetar la numeración consecutiva, sin saltos ni repetidos; si faltan documentos, subirlos para continuar.')
        );
      }
      if (previo && f.fecha && previo.fecha && f.fecha < previo.fecha) {
        hallazgos.push(hallazgo(f, 'ERROR', 'FECHA', `La fecha ${f.fecha} es anterior a la del documento previo (${previo.fecha}).`, 'La fecha debe seguir el orden del correlativo.'));
      }
      previo = f;
    }
  }
}

function revisarEmisor(resultados, hallazgos) {
  const campos = [
    ['nombre', 'El nombre'],
    ['nit', 'El NIT'],
    ['nrc', 'El NRC'],
  ];
  for (const [campo, etiqueta] of campos) {
    const valores = resultados.map((r) => normalizar(r.factura.emisor[campo])).filter(Boolean);
    const comun = moda(valores);
    if (!comun) continue;
    for (const { factura: f } of resultados) {
      const valor = f.emisor[campo];
      if (valor && normalizar(valor) !== comun) {
        const comunOriginal = resultados.find((r) => normalizar(r.factura.emisor[campo]) === comun).factura.emisor[campo];
        hallazgos.push(hallazgo(f, 'ERROR', 'EMISOR', `${etiqueta} del emisor es "${valor}" y en el resto de los documentos es "${comunOriginal}".`, 'Escribir los datos del emisor exactamente igual en todos los documentos.'));
      }
    }
  }
  for (const tipo of ['CF', 'CCF']) {
    const docs = resultados.filter((r) => r.factura.tipo === tipo && r.factura.numeroDocumento);
    const comun = moda(docs.map((r) => r.factura.numeroDocumento));
    for (const { factura: f } of docs) {
      if (f.numeroDocumento !== comun) {
        hallazgos.push(hallazgo(f, 'ADVERTENCIA', 'NUMERO DOCUMENTO', `El número de documento es "${f.numeroDocumento}" y en los demás ${tipo} es "${comun}".`, 'Verificar el número de documento del emisor; debe ser el mismo en todos.'));
      }
    }
  }
}

function revisarClientesCCF(resultados, hallazgos) {
  const ccf = resultados.filter((r) => r.factura.tipo === 'CCF').map((r) => r.factura);
  const porCliente = new Map();
  for (const f of ccf) {
    const clave = normalizar(f.cliente.nombre);
    if (!porCliente.has(clave)) porCliente.set(clave, []);
    porCliente.get(clave).push(f);
  }
  for (const docs of porCliente.values()) {
    const nrcs = new Set(docs.map((f) => f.cliente.nrc).filter(Boolean));
    if (nrcs.size > 1) {
      for (const f of docs) {
        hallazgos.push(hallazgo(f, 'ERROR', 'CLIENTE', `El cliente "${f.cliente.nombre}" aparece con NRC ${f.cliente.nrc || '(vacío)'}; en el lote usa ${nrcs.size} NRC distintos (${[...nrcs].join(', ')}).`, 'Un mismo contribuyente tiene un solo NRC; verificarlo con su tarjeta de IVA y corregir los demás.'));
      }
    }
  }
  for (const f of ccf) {
    if (!f.cliente.nrc && !f.cliente.nitDui) {
      hallazgos.push(hallazgo(f, 'ERROR', 'CLIENTE', 'El crédito fiscal no trae el NRC ni el NIT del cliente.', 'Registrar el NRC o el NIT del cliente.'));
    }
  }
}

function revisarTitulos(resultados, hallazgos) {
  for (const tipo of ['CF', 'CCF']) {
    const docs = resultados.filter((r) => r.factura.tipo === tipo);
    const validos = docs.map((r) => r.lectura.titulo).filter((t) => TITULOS[tipo].test(normalizar(t)));
    const comun = moda(validos);
    for (const { factura: f, lectura } of docs) {
      const titulo = lectura.titulo;
      if (!titulo || !RE_TITULO.test(titulo)) {
        hallazgos.push(hallazgo(f, 'ERROR', 'ENCABEZADO', 'El documento no tiene el título de la factura.', 'Imprimir el documento con su título completo.'));
      } else if (!TITULOS[tipo].test(normalizar(titulo))) {
        hallazgos.push(hallazgo(f, 'ERROR', 'ENCABEZADO', `El título dice "${titulo}" pero el documento es de tipo ${tipo === 'CF' ? 'consumidor final' : 'crédito fiscal'}.`, 'Corregir el título del documento.'));
      } else if (comun && titulo !== comun) {
        hallazgos.push(hallazgo(f, 'ADVERTENCIA', 'ENCABEZADO', `El título dice "${titulo}" y en los demás documentos dice "${comun}".`, 'Usar el mismo título en todos los documentos.'));
      }
    }
  }
}

function revisarAvisosLectura(resultados, hallazgos) {
  for (const { factura: f, lectura } of resultados) {
    if (lectura.origen === 'ia') {
      hallazgos.push(hallazgo(f, 'ADVERTENCIA', 'LECTURA IA', 'Este documento no se pudo leer con el lector normal y lo leyó la IA.', 'Comparar los datos con la factura original antes de darlos por buenos.'));
    }
    for (const aviso of lectura.avisos) {
      if (aviso.campo.startsWith('encabezado.')) {
        hallazgos.push(hallazgo(f, 'ERROR', 'ENCABEZADO', `Texto extraño en el encabezado ${aviso.campo.split('.')[1].toUpperCase()}: "${aviso.valores.join(' ')}".`, 'Borrar el texto y dejar solo el rótulo.'));
      } else {
        hallazgos.push(hallazgo(f, 'ADVERTENCIA', 'CAMPO DUPLICADO', `El campo ${aviso.campo} trae más de un valor superpuesto: ${aviso.valores.join(' / ')}.`, 'Dejar un solo valor en el campo.'));
      }
    }
  }
}

function revisarEmpresaEmisora(resultados, empresa, hallazgos) {
  const nrcs = resultados.map((r) => r.factura.emisor.nrc).filter(Boolean);
  const comun = moda(nrcs.map(normalizar));
  if (!empresa?.nrc || !comun || comun === normalizar(empresa.nrc)) return;
  const original = nrcs.find((n) => normalizar(n) === comun);
  hallazgos.push(
    hallazgo(null, 'ERROR', 'EMPRESA', `Las facturas de venta traen como emisor el NRC ${original}, pero la empresa seleccionada tiene el NRC ${empresa.nrc}. Puede que se hayan subido a la empresa equivocada.`, 'Subir estas facturas a la empresa correcta, o corregir el NRC del emisor en las facturas.')
  );
}

export function revisarConsistencia(resultados, empresa = null) {
  const hallazgos = [];
  revisarCorrelativos(resultados, hallazgos);
  revisarEmisor(resultados, hallazgos);
  revisarClientesCCF(resultados, hallazgos);
  revisarTitulos(resultados, hallazgos);
  revisarAvisosLectura(resultados, hallazgos);
  revisarEmpresaEmisora(resultados, empresa, hallazgos);
  return hallazgos;
}
