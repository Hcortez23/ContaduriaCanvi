import { parsearPagina } from './plantilla.js';
import { INCORPORADAS } from './recetas/incorporadas.js';
import { leerConReceta, reconoce } from './recetas/interprete.js';

export const recetaDe = (pagina, recetas = []) => [...INCORPORADAS, ...recetas].find((r) => reconoce(pagina, r));

export function parsearVenta(pagina, recetas = []) {
  const receta = recetaDe(pagina, recetas);
  return receta ? leerConReceta(pagina, receta) : parsearPagina(pagina);
}
