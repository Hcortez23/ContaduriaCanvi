import { useCallback, useEffect, useState } from 'react';

export function useCarga(cargar, dependencias) {
  const [estado, setEstado] = useState({ datos: null, error: null, cargando: true });

  const recargar = useCallback(() => {
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true }));
    cargar()
      .then((datos) => vigente && setEstado({ datos, error: null, cargando: false }))
      .catch((error) => vigente && setEstado({ datos: null, error, cargando: false }));
    return () => {
      vigente = false;
    };
  }, dependencias);

  useEffect(() => recargar(), [recargar]);

  return { ...estado, recargar };
}

export const dinero = (n) => (n === null || n === undefined ? '' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
export const numero = (n) => (n === null || n === undefined ? '' : n.toLocaleString('en-US'));
