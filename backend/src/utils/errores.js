export class HttpError extends Error {
  constructor(status, mensaje, detalle = null) {
    super(mensaje);
    this.status = status;
    this.detalle = detalle;
  }
}
