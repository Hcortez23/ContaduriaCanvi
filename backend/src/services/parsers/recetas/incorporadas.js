export const LISTA_SIMPLE = {
  nombre: 'lista-simple',
  reconoce: ['^Precio por unidad$', '^Total de l[ií]nea$', '^N[°º] de factura'],
  tipo: { titulo: '(factura de consumidor final|comprobante de cr[eé]dito fiscal|cr[eé]dito fiscal)', ccf: 'cr[eé]dito fiscal' },
  precioConIvaEnCF: true,
  etiquetaNumero: 'N° de factura',
  correlativoPatron: '^\\d+-(\\d+)',
  zonas: { cliente: '^Cliente:', tabla: '^Cant\\.$' },
  campos: {
    numero: { etiqueta: '^N[°º] de factura', lugar: 'cerca', patron: '^\\d+(?:-\\d+)+$', zona: 'encabezado' },
    fecha: { lugar: 'cualquiera', patron: '^\\d{2}[/-]\\d{2}[/-]\\d{4}$', zona: 'todo' },
    emisorNombre: { etiqueta: '^NIT:$', lugar: 'inicioFila', zona: 'encabezado' },
    emisorNit: { etiqueta: '^NIT:$', lugar: 'derecha', zona: 'encabezado' },
    emisorNrc: { etiqueta: '^NRC\\.?:$', lugar: 'derecha', zona: 'encabezado' },
    emisorDireccion: { etiqueta: '^Direcci[oó]n:$', lugar: 'derecha', zona: 'encabezado' },
    clienteNombre: { etiqueta: '^Cliente:', lugar: 'mismo', patron: '^Cliente:\\s*(.*)', zona: 'cliente' },
    clienteNit: { etiqueta: '^NIT:\\s*\\d', lugar: 'mismo', patron: '^NIT:\\s*(\\d.*)', zona: 'cliente' },
    clienteDireccion: { etiqueta: '^Direcci[oó]n:\\s*\\S', lugar: 'mismo', patron: '^Direcci[oó]n:\\s*(.+)', zona: 'cliente' },
    clienteCiudad: { etiqueta: '^Ciudad:\\s*\\S', lugar: 'mismo', patron: '^Ciudad:\\s*(.+)', zona: 'cliente' },
    condicionPago: { etiqueta: '^Condiciones de pago$', lugar: 'abajo', zona: 'todo' },
  },
  tabla: { inicio: '^Cant\\.$', precio: '^Precio por unidad$', total: '^Total de l[ií]nea$', fin: '^Subtotal$' },
  totales: { subtotal: '^Subtotal$', iva: '^IVA\\b', percepcion: '^1\\s*%', total: '^Total$' },
};

export const INCORPORADAS = [LISTA_SIMPLE];
