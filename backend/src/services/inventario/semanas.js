import { resolverProductos } from './productos.js';

const DIA = 86400000;
const aTiempo = (iso) => new Date(`${iso}T00:00:00Z`).getTime();
const aIso = (ms) => new Date(ms).toISOString().slice(0, 10);

export const sumarDias = (iso, dias) => aIso(aTiempo(iso) + dias * DIA);
export const inicioSemana = (iso) => aIso(aTiempo(iso) - ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) * DIA);

function movimientos(documentos, catalogo, signo) {
  const { resueltas } = resolverProductos(documentos, catalogo);
  // las líneas sin identificar quedan fuera; ya se reportan como ADVERTENCIA GRAVE
  return resueltas.map(({ clave, factura, linea }) => ({ clave, fecha: factura.fecha, cantidad: linea.cantidad * signo }));
}

const suma = (lista) => lista.reduce((s, m) => s + m.cantidad, 0);

export function calcularSemanas({ ventas, compras = [], catalogo, apertura = [], ingresos = [] }) {
  const entradas = [...movimientos(compras, catalogo, 1), ...ingresos];
  const salidas = movimientos(ventas, catalogo, -1);
  const fechas = [...ventas, ...compras].map((d) => d.factura.fecha).sort();
  if (!fechas.length) return [];
  const aperturas = new Map(apertura.map((a) => [a.clave, a.cantidad]));
  const productos = catalogo.filter((p) => p.modelo || aperturas.has(p.clave));
  const semanas = [];
  const ultimo = inicioSemana(fechas[fechas.length - 1]);
  for (let lunes = inicioSemana(fechas[0]), numero = 1; lunes <= ultimo; lunes = sumarDias(lunes, 7), numero++) {
    const domingo = sumarDias(lunes, 6);
    const previo = sumarDias(lunes, -7);
    const filas = productos.map((p) => {
      const mias = (lista) => lista.filter((m) => m.clave === p.clave);
      const saldo =
        (aperturas.get(p.clave) ?? 0) +
        suma(mias(entradas).filter((m) => m.fecha < (numero === 1 ? '0000-00-00' : previo))) +
        suma(mias(salidas).filter((m) => m.fecha < lunes));
      const comprasSemana = suma(mias(entradas).filter((m) => (numero === 1 ? m.fecha < lunes : m.fecha >= previo && m.fecha < lunes)));
      const vendidas = -suma(mias(salidas).filter((m) => m.fecha >= lunes && m.fecha <= domingo));
      return {
        clave: p.clave,
        modelo: p.marca ? `${p.marca} ${p.modelo}` : p.modelo,
        color: p.color,
        talla: p.talla,
        precioUnitario: p.precioUnitario,
        saldo,
        compras: comprasSemana,
        despuesDeCompras: saldo + comprasSemana,
        vendidas,
        final: saldo + comprasSemana - vendidas,
      };
    });
    semanas.push({
      numero,
      desde: lunes,
      hasta: domingo,
      ventas: ventas.filter((d) => d.factura.fecha >= lunes && d.factura.fecha <= domingo),
      filas,
      alertas: filas.filter((f) => f.final < 0).map((f) => ({ clave: f.clave, final: f.final })),
    });
  }
  return semanas;
}
