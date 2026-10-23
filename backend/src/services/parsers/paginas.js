import { PDFDocument } from 'pdf-lib';

export async function extraerPaginas(buffer, numeros) {
  const origen = await PDFDocument.load(buffer);
  const destino = await PDFDocument.create();
  const copiadas = await destino.copyPages(origen, numeros.map((n) => n - 1));
  copiadas.forEach((p) => destino.addPage(p));
  return destino.save();
}

export async function enParalelo(tareas, limite = 3) {
  const resultados = new Array(tareas.length);
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(limite, tareas.length) }, async () => {
    while (siguiente < tareas.length) {
      const i = siguiente++;
      resultados[i] = await tareas[i]();
    }
  });
  await Promise.all(trabajadores);
  return resultados;
}

export async function resolverPorLotes(pendientes, buffer, leerLote, tamano) {
  const resultados = new Map();
  const porClase = new Map();
  for (const p of pendientes) porClase.set(p.clase, [...(porClase.get(p.clase) ?? []), p.pagina]);
  const trabajos = [];
  for (const [clase, numeros] of porClase) {
    for (let i = 0; i < numeros.length; i += tamano) trabajos.push({ clase, numeros: numeros.slice(i, i + tamano) });
  }
  await enParalelo(
    trabajos.map((t) => async () => {
      try {
        const leidos = await leerLote(buffer, t.numeros, t.clase);
        t.numeros.forEach((n, i) => resultados.set(n, leidos[i] ? { resultado: leidos[i] } : { error: 'la IA no devolvió esta página' }));
      } catch (err) {
        for (const n of t.numeros) resultados.set(n, { error: err.message });
      }
    }),
    2
  );
  return resultados;
}
