export function hallazgo(factura, gravedad, codigo, detalle, correccion) {
  return {
    tipo: factura ? factura.tipo : 'TODAS',
    correlativo: factura ? factura.correlativo : null,
    pagina: factura ? factura.pagina : null,
    gravedad,
    codigo,
    detalle,
    correccion,
  };
}
