export const redondear = (n) => Math.round(n * 100 + 1e-7) / 100;

export const TOLERANCIA_CENTAVOS = 0.05;

export const difiere = (a, b) => Math.abs(a - b) > TOLERANCIA_CENTAVOS + 1e-7;

export const dinero = (n) => `$${n.toFixed(2)}`;
