import Empresa from '../models/Empresa.js';
import Factura from '../models/Factura.js';
import Compra from '../models/Compra.js';
import InventarioInicial from '../models/InventarioInicial.js';
import { leerFacturas, leerCompras } from '../services/parsers/index.js';
import { leerInventarioInicial, leerInventarioArchivo } from '../services/parsers/inventarioInicial.js';
import { leerMixto } from '../services/parsers/mixto.js';
import { leerPaginaConIA } from '../services/parsers/facturaIA.js';
import { enParalelo } from '../services/parsers/paginas.js';
import { imagenAPdf, contarPaginas } from '../services/parsers/imagen.js';
import { inicioSemana, sumarDias } from '../services/inventario/semanas.js';
import { revisarEmpresa } from '../services/revision.js';
import { HttpError } from '../utils/errores.js';

const fechaUTC = (iso) => new Date(`${iso}T00:00:00Z`);

const detalleIlegibles = (resultados) =>
  resultados.filter((r) => !r.ok).map((r) => ({ pagina: r.pagina, faltantes: r.lectura.faltantes, errorIA: r.lectura.errorIA ?? null }));

function exigirLegibles(resultados) {
  if (!resultados.length) throw new HttpError(422, 'El PDF no contiene documentos con texto legible');
  const ilegibles = detalleIlegibles(resultados);
  if (ilegibles.length) throw new HttpError(422, 'Hay páginas que no se pudieron leer; no se guardó nada', ilegibles);
}

const resumen = ({ estado, resumen: datos }) => ({ estado, resumen: datos });

async function guardarVentas(req, resultados) {
  const empresa = req.empresa._id;
  const semanas = new Map();
  for (const { factura } of resultados) {
    const lunes = inicioSemana(factura.fecha);
    semanas.set(`${factura.tipo}|${factura.correlativo}|${lunes}`, {
      tipo: factura.tipo,
      correlativo: factura.correlativo,
      fecha: { $gte: fechaUTC(lunes), $lte: fechaUTC(sumarDias(lunes, 6)) },
    });
  }
  await Factura.deleteMany({ empresa, $or: [...semanas.values()] });
  await Factura.insertMany(
    resultados.map((r) => ({ ...r.factura, empresa, lectura: r.lectura, archivo: req.file.originalname })),
    { ordered: true }
  );
}

async function guardarCompras(req, resultados) {
  const empresa = req.empresa._id;
  const claves = resultados.map((r) => ({ 'proveedor.nombre': r.factura.proveedor.nombre, numeroFactura: r.factura.numeroFactura }));
  await Compra.deleteMany({ empresa, $or: claves });
  const documentos = resultados.map(({ factura: f }) => {
    const { tipo, correlativo, ...resto } = f;
    return { ...resto, empresa, archivo: req.file.originalname };
  });
  await Compra.insertMany(documentos, { ordered: true });
}

async function guardarInventario(req, inventario, fecha) {
  const empresa = req.empresa._id;
  const fechaInventario = fecha ? fechaUTC(fecha) : null;
  await InventarioInicial.findOneAndReplace(
    { empresa, fecha: fechaInventario },
    { ...inventario, empresa, fecha: fechaInventario, archivo: req.file.originalname },
    { upsert: true }
  );
}

async function inventarioDelArchivo(req, leer, fecha) {
  try {
    const inventario = await leer();
    if (inventario) await guardarInventario(req, inventario, fecha);
    return { inventario, errorInventario: null };
  } catch (err) {
    console.error(`Lectura del inventario inicial de ${req.empresa.nombre}: ${err.message}`);
    return { inventario: null, errorInventario: err.message };
  }
}

const primeraFecha = (resultados) => resultados.map((r) => r.factura.fecha).sort()[0];

const recetasDe = (empresa) => empresa.recetas.map((r) => r.receta);

function aprendizaje(req) {
  const estado = { aprendido: false };
  const alAprender = async (receta) => {
    await Empresa.updateOne({ _id: req.empresa._id }, { $push: { recetas: { receta } } });
    estado.aprendido = true;
  };
  return { estado, opciones: { respaldoIA: true, recetas: recetasDe(req.empresa), alAprender } };
}

export async function subirVentas(req, res) {
  const { estado, opciones } = aprendizaje(req);
  const resultados = await leerFacturas(req.file.buffer, 'generico', opciones);
  exigirLegibles(resultados);
  await guardarVentas(req, resultados);
  const { inventario, errorInventario } = await inventarioDelArchivo(req, () => leerInventarioInicial(req.file.buffer), primeraFecha(resultados));
  res.status(201).json({
    facturas: resultados.length,
    formatoAprendido: estado.aprendido,
    inventarioInicial: Boolean(inventario),
    errorInventario,
    ...resumen(await revisarEmpresa(req.empresa)),
  });
}

export async function subirCompras(req, res) {
  const resultados = await leerCompras(req.file.buffer, { respaldoIA: true });
  exigirLegibles(resultados);
  await guardarCompras(req, resultados);
  res.status(201).json({ compras: resultados.length, ...resumen(await revisarEmpresa(req.empresa)) });
}

export async function subirMixto(req, res) {
  const { estado, opciones } = aprendizaje(req);
  const lectura = await leerMixto(req.file.buffer, opciones);
  const { ventas, compras, paginasImagen, sinClasificar } = lectura;
  const problemas = [
    ...detalleIlegibles([...ventas, ...compras]),
    ...sinClasificar.map((s) => ({ pagina: s.pagina, faltantes: ['clasificación'], errorIA: s.motivo })),
  ];
  if (problemas.length) throw new HttpError(422, 'Hay páginas que no se pudieron clasificar o leer; no se guardó nada', problemas);
  if (!ventas.length && !compras.length && !paginasImagen.length) throw new HttpError(422, 'El PDF no contiene documentos que se puedan leer');

  const fechas = [...ventas, ...compras].map((r) => r.factura.fecha).sort();
  if (paginasImagen.length && !fechas.length) {
    throw new HttpError(422, 'El archivo trae un inventario inicial pero ninguna factura con fecha; súbelo en el cuadro "Inventario inicial" indicando la fecha');
  }
  if (ventas.length) await guardarVentas(req, ventas);
  if (compras.length) await guardarCompras(req, compras);
  const { inventario, errorInventario } = paginasImagen.length
    ? await inventarioDelArchivo(req, () => leerInventarioInicial(req.file.buffer, { paginas: paginasImagen }), fechas[0])
    : { inventario: null, errorInventario: null };

  res.status(201).json({
    facturas: ventas.length,
    compras: compras.length,
    formatoAprendido: estado.aprendido,
    inventarioInicial: Boolean(inventario),
    errorInventario,
    ...resumen(await revisarEmpresa(req.empresa)),
  });
}

async function primeraFechaCargada(empresa) {
  const [factura, compra] = await Promise.all([
    Factura.findOne({ empresa }).sort({ fecha: 1 }).lean(),
    Compra.findOne({ empresa }).sort({ fecha: 1 }).lean(),
  ]);
  const fechas = [factura?.fecha, compra?.fecha].filter(Boolean).map((f) => f.toISOString().slice(0, 10)).sort();
  return fechas[0] ?? null;
}

export async function subirInventario(req, res) {
  let fecha = String(req.body.fecha ?? '').trim();
  if (fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(fechaUTC(fecha).getTime())) {
      throw new HttpError(400, 'La fecha del inventario inicial debe tener el formato AAAA-MM-DD');
    }
  } else {
    if (await InventarioInicial.countDocuments({ empresa: req.empresa._id })) {
      throw new HttpError(400, 'Ya hay un inventario inicial cargado. Indica la fecha del nuevo para sumarlo (si es el mismo corregido, usa su misma fecha).');
    }
    fecha = await primeraFechaCargada(req.empresa._id);
  }
  let inventario;
  try {
    inventario = await leerInventarioArchivo({ buffer: req.file.buffer, mime: req.file.mimetype });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error(`Lectura del inventario inicial de ${req.empresa.nombre}: ${err.message}`);
    throw new HttpError(502, `No se pudo leer el inventario inicial: ${err.message}`);
  }
  if (!inventario || !inventario.filas?.length) throw new HttpError(422, 'No se encontró una tabla de inventario en el archivo');
  await guardarInventario(req, inventario, fecha);
  res.status(201).json({ inventarioInicial: true, productos: inventario.filas.length, fecha, ...resumen(await revisarEmpresa(req.empresa)) });
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Subida desde el chat: lee cada página con IA (acepta también fotos) y guarda directo; si algo no se lee, no guarda nada.
export async function subirAsistido(req, res) {
  if (req.body.tipo === 'inventario' || req.file.mimetype === XLSX) return subirInventario(req, res);
  const nota = String(req.body.nota ?? '').trim().slice(0, 500);
  const pdf = req.file.mimetype === 'application/pdf' ? req.file.buffer : await imagenAPdf(req.file.buffer, req.file.mimetype);
  const total = await contarPaginas(pdf);

  const leidas = await enParalelo(
    Array.from({ length: total }, (_, i) => async () => {
      try {
        return { pagina: i + 1, ...(await leerPaginaConIA(pdf, i + 1, nota)) };
      } catch (err) {
        return { pagina: i + 1, error: err.message };
      }
    })
  );
  const problemas = leidas.flatMap((l) => {
    if (l.error) return [{ pagina: l.pagina, faltantes: [], errorIA: l.error }];
    if (!l.resultado) return [{ pagina: l.pagina, faltantes: ['clasificación'], errorIA: 'no es una factura de venta ni de compra' }];
    return l.resultado.ok ? [] : [{ pagina: l.pagina, faltantes: l.resultado.lectura.faltantes, errorIA: null }];
  });
  if (problemas.length) throw new HttpError(422, 'Hay páginas que no se pudieron leer; no se guardó nada', problemas);

  const ventas = leidas.filter((l) => l.clase === 'venta').map((l) => l.resultado);
  const compras = leidas.filter((l) => l.clase === 'compra').map((l) => l.resultado);
  if (ventas.length) await guardarVentas(req, ventas);
  if (compras.length) await guardarCompras(req, compras);
  res.status(201).json({ facturas: ventas.length, compras: compras.length, ...resumen(await revisarEmpresa(req.empresa)) });
}

export async function listarFacturas(req, res) {
  res.json(await Factura.find({ empresa: req.empresa._id }).sort({ tipo: 1, correlativo: 1 }));
}

export async function listarCompras(req, res) {
  res.json(await Compra.find({ empresa: req.empresa._id }).sort({ fecha: 1, numeroFactura: 1 }));
}

export async function listarInventariosIniciales(req, res) {
  res.json(await InventarioInicial.find({ empresa: req.empresa._id }).sort({ fecha: 1 }));
}

export async function borrarVentas(req, res) {
  await Factura.deleteMany({ empresa: req.empresa._id });
  res.status(204).end();
}

export async function borrarFormatosAprendidos(req, res) {
  const { recetas } = req.empresa;
  await Empresa.updateOne({ _id: req.empresa._id }, { $set: { recetas: [] } });
  res.json({ borrados: recetas.length });
}

export async function borrarInventario(req, res) {
  await InventarioInicial.deleteMany({ empresa: req.empresa._id });
  res.status(204).end();
}

export async function borrarCompras(req, res) {
  await Compra.deleteMany({ empresa: req.empresa._id });
  res.status(204).end();
}
