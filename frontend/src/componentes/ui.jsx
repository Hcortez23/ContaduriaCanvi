const ICONOS = {
  alerta: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  check: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
  subir: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  descargar: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  archivo: ['M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z', 'M14 2v6h6'],
  mas: ['M12 5v14', 'M5 12h14'],
  edificio: ['M3 21h18', 'M5 21V7l8-4v18', 'M19 21V11l-6-4', 'M9 9v.01', 'M9 12v.01', 'M9 15v.01', 'M9 18v.01'],
  bandeja: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'],
  candado: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  hojas: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z'],
  basura: ['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
};

export function Icono({ nombre, className = 'size-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      {ICONOS[nombre].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const BOTON =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold no-underline shadow-sm transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none disabled:active:scale-100';

const VARIANTES = {
  primario: 'border-black bg-black text-white hover:bg-neutral-800',
  secundario: 'border-neutral-300 bg-white text-black hover:border-black hover:bg-neutral-50',
};

export const estiloBoton = (variante = 'primario') => `${BOTON} ${VARIANTES[variante]}`;

export function Boton({ variante = 'primario', icono, className = '', children, ...props }) {
  return (
    <button type="button" className={`${estiloBoton(variante)} ${className}`} {...props}>
      {icono && <Icono nombre={icono} className="size-4" />}
      {children}
    </button>
  );
}

export function BotonEnlace({ icono, className = '', children, ...props }) {
  return (
    <a className={`${estiloBoton('primario')} ${className}`} {...props}>
      {icono && <Icono nombre={icono} className="size-4" />}
      {children}
    </a>
  );
}

export function Enlace({ className = '', ...props }) {
  return (
    <button
      type="button"
      className={`cursor-pointer rounded font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${className}`}
      {...props}
    />
  );
}

export function Panel({ className = '', ...props }) {
  return <section className={`rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm ${className}`} {...props} />;
}

export const CAMPO =
  'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-black transition hover:border-neutral-400 focus:border-black focus:outline-none focus:ring-4 focus:ring-black/10';

export function Etiqueta({ texto, children }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
      {texto}
      <span className="normal-case tracking-normal">{children}</span>
    </label>
  );
}

export function Aviso({ className = '', children, ...props }) {
  return (
    <div role="alert" className={`mt-4 flex gap-3 rounded-xl border border-black bg-neutral-50 px-4 py-3 text-sm ${className}`} {...props}>
      <Icono nombre="alerta" className="mt-0.5 size-5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Titulo({ children, icono }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-base font-semibold tracking-tight">
      {icono && <Icono nombre={icono} className="size-5 text-neutral-500" />}
      {children}
    </h2>
  );
}

export function Ayuda({ className = '', ...props }) {
  return <p className={`mb-4 text-sm leading-relaxed text-neutral-500 ${className}`} {...props} />;
}

export function Tabla({ children }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export const TH = 'whitespace-nowrap border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500';
export const TD = 'border-b border-neutral-100 px-4 py-3 align-top';
export const FILA = 'transition-colors hover:bg-neutral-50';

export function Dato({ etiqueta, valor }) {
  return (
    <div className="rounded-xl border border-neutral-200 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{etiqueta}</dt>
      <dd className="m-0 mt-1 text-2xl font-semibold tracking-tight">{valor}</dd>
    </div>
  );
}

export function Datos({ children }) {
  return <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">{children}</dl>;
}
