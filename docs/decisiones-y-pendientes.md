# Decisiones y pendientes

Documento para llevar al cliente y al contador. Está dividido en lo que ya se decidió, lo que se supuso y debe confirmarse, y las preguntas abiertas.

## 1. Cómo funciona hoy el flujo

1. Se crea la empresa (nombre, NRC, NIT).
2. Se sube el PDF de facturas de venta. La primera página puede traer el inventario inicial como imagen.
3. El sistema lee las facturas (texto) y el inventario inicial (imagen, con IA) y revisa todo.
4. Si hay **un solo error**, el proceso queda **pausado**: se muestran los errores, se puede descargar la carta de correcciones en Word y no se genera inventario ni libro.
5. El emisor corrige las facturas, se vuelve a subir el PDF corregido (reemplaza las facturas con el mismo tipo y número) y se revisa otra vez.
6. Sin errores, el proceso queda **listo** y se pueden ver ventas, vista mensual e inventario por semana, y descargar el libro de Excel.

Las **advertencias** (por ejemplo, una descripción mal escrita) no detienen el proceso. Los **errores** sí.

### Cuadros de subida

| Cuadro | Para qué |
| --- | --- |
| Todo en un solo archivo | PDF con ventas, compras y/o inventario mezclados. El sistema separa cada página por su contenido. |
| Facturas de venta | PDF solo de ventas. Si trae la imagen del inventario, también la lee. |
| Facturas de compra | PDF solo de compras. |
| Inventario inicial | Inventario aparte (PDF, imagen o Excel) con la fecha en que se tomó. |

La semana de cada documento se decide **por su fecha**, nunca por el nombre ni por el orden de los archivos.

## 2. Decisiones tomadas

| Tema | Decisión |
| --- | --- |
| Corrección de errores | Siempre se corrige en la factura y se vuelve a subir. No hay aprobación manual de excepciones. |
| Libro de Excel | Un solo libro por empresa, con tres hojas por semana en este orden: Facturas, Inventario inicial, Inventario final. Se repite para cada semana. |
| Inventario inicial | Sale de la imagen del PDF de facturas, o se sube aparte (PDF, imagen o Excel) con su fecha. Si llega otra tabla en una semana posterior, **se suma** a las existencias (no reemplaza). Si se vuelve a subir el mismo PDF corregido (misma fecha de primera factura), reemplaza la tabla de esa fecha. |
| Cadena entre semanas | **Confirmado por el cliente:** el inventario de una semana parte del final de la anterior. Las compras se suman y las ventas se restan. Es el comportamiento de Villa Lactea. |
| Compras | Las compras de una semana entran al inventario inicial de la **semana siguiente** (columna "Compras"), como en Villa Lactea. |
| Semanas | De lunes a domingo. |
| Identificación de productos | Se hace contra la tabla del inventario inicial: por modelo y talla, y el color de la factura debe estar dentro del color de la tabla. Los errores de digitación del modelo se corrigen automáticamente. Si no coincide, es un error y el lote se pausa. |
| 1% | Solo se aplica cuando el crédito fiscal sobrepasa **$250**, calculado sobre el subtotal (base sin IVA). Con $250 exactos no se aplica. **Confirmado por el cliente.** |
| DUI del cliente | No se valida. El cliente indicó que no importa. |
| Vista mensual | Muestra documentos y créditos fiscales del mes contra la meta de 200 y 20. Es informativa, no detiene el proceso. |
| IA (Gemini) | Se usa para leer la imagen del inventario inicial y como respaldo cuando el lector no entiende una factura. Lo que lee la IA se marca como tal para que se verifique. |

## 3. Supuestos a confirmar con el contador

- El 1% sobre $250 se calcula sobre el subtotal (confirmado). Es **percepción y se suma** al total (confirmado por el cliente).
- El IVA es 13% en todas las empresas.
- Las semanas de lunes a domingo coinciden con la forma en que el cliente cierra cada semana.
- Que las compras entren en la semana siguiente es lo que hace Villa Lactea; confirmar que aplica a todas las empresas.
- Que un mes completo son unos 200 documentos, de los cuales unos 20 son créditos fiscales.

## 4. Preguntas abiertas para el cliente

1. **Forma de pago.** El registro pide efectivo, tarjeta de crédito o cheque, pero las facturas solo dicen "al contado". Hoy se usa por defecto EFECTIVO en consumidor final y CREDITO en crédito fiscal, y no se puede cambiar. Preguntar: ¿usan tarjeta o cheque? ¿Dónde se sabe? Si sí, se agrega una lista para elegir la forma de pago de cada factura.
2. **Caja o turno (Caj-Tur).** Hoy siempre va "-". Preguntar si alguna empresa usa cajas o turnos y de dónde sale el dato.
3. **Método de costeo.** Hoy el inventario final se valora con el precio unitario de la tabla de inventario inicial; el costo de las compras no se usa. Opciones: precio de la tabla (actual), costo promedio ponderado (usa lo pagado en cada compra) o PEPS (lo primero que entra es lo primero que sale). La decide el contador o la política de la empresa.
4. **Primera página de los PDF de semanas siguientes.** ¿Trae solo las existencias nuevas, o toda la existencia que hay? Si trae todo, sumar contaría doble y habría que compararla en vez de sumarla.
5. **Excel de ventas o compras.** Hoy solo se leen PDF. Si las facturas también llegan en Excel, hace falta un ejemplo para leerlas.
6. **Numeración al cambiar de mes.** El sistema espera que el correlativo siga de una semana a otra. Si una empresa reinicia la numeración (por ejemplo cada mes), las facturas con número repetido se marcan como error.
7. **Otros documentos.** ¿Hay notas de crédito, facturas anuladas o documentos de reemplazo? Hoy no se manejan.
8. **Tercera empresa.** Todavía no hay ejemplos de sus facturas. Con el respaldo de IA una empresa nueva funciona desde el primer día; si su formato se repite mucho, se le escribe un lector propio.
9. **Errores en las tablas de inventario inicial.** En los dos ejemplos el subtotal no coincide con la suma de las filas (Puma: $38,816.00 contra $38,736.00; Step Style: $95,500.00 contra $89,840.00). Preguntar al cliente cuál es el dato correcto.

## 5. PDF de prueba

En la carpeta `pruebas-puma` hay cuatro PDF generados (datos ficticios, sin errores) para probar la cadena de semanas. Se regeneran con `npm run generar:semanas` dentro de `backend`. El primer PDF, `Puma Footwear - facturas sin errores.pdf`, se genera con `npm run generar:puma`.

## 6. Limitaciones conocidas

- Las fórmulas del libro de Excel se comprobaron como texto, pero no se abrió el libro en Excel. Falta abrirlo y comprobar que calcule.
- Un lote sin errores solo se ha probado con datos de prueba; los PDF de ejemplo siempre traen errores.
- Si Gemini está saturado, el inventario inicial no se lee y hay que volver a subir el PDF. Las facturas sí se guardan.
- No hay inicio de sesión: la aplicación es para uso en una sola computadora.

## 7. Seguridad

- La contraseña de MongoDB y la clave de Gemini se compartieron por chat. Antes de usar datos reales hay que cambiarlas y actualizar el archivo `backend/.env`.
- El archivo `.env` está excluido de git.

## Aprendizaje de formatos nuevos

- Los formatos de factura simples (como los de la Ñaña) se leen con una receta: datos que dicen dónde está cada campo, no código. La receta incorporada está en `backend/src/services/parsers/recetas/incorporadas.js` y el intérprete en `interprete.js`.
- Puma y Step Style siguen con su lector propio (`plantilla.js`); no se pasaron a recetas.
- Si en una subida de ventas (o "todo en un solo archivo") la mitad o más de las páginas no se reconocen, y son 3 o más, se hace UNA consulta a Gemini con una página de muestra. La IA devuelve lo que lee y una receta. El sistema aplica la receta a esa página y la guarda solo si reproduce exactamente lo que la IA leyó (tipo, correlativo, fecha, líneas, total) y lee bien al menos el 80% de las páginas desconocidas.
- La receta se guarda en la empresa (`Empresa.recetas`). Para olvidar los formatos aprendidos: `DELETE /api/empresas/:id/formatos`.
- Instrucciones para la IA: `backend/src/services/parsers/recetas/aprender.js`.
- Límites: solo facturas de venta con texto digital; no aplica a compras ni a PDFs escaneados. Cada documento se sigue revisando con las reglas normales, así que una receta que lea mal se nota en los errores de cálculo.

## Respaldo con Groq

- Si Gemini falla (cuota agotada, saturado o tiempo agotado), `extraerJson` prueba con Groq: `openai/gpt-oss-120b` para consultas de solo texto (aprendizaje de formatos) y `qwen/qwen3.8-27b` para imágenes y PDFs de hasta 3 páginas (inventario inicial escaneado). Los nombres se cambian con `GROQ_MODELO_TEXTO` y `GROQ_MODELO_VISION` en `backend/.env`.
- Límite gratuito de Groq: unos 8,000 tokens por minuto. Un aprendizaje de formato usa ~5,500; una lectura de inventario con imagen, un poco más. Solo cabe una consulta por minuto; el sistema espera y reintenta hasta 2 veces si Groq indica que faltan 30 s o menos.
- No cubre la lectura de páginas de factura en lotes (8 páginas): excede las 3 imágenes por consulta.
- Las pruebas automáticas desactivan Groq (`tests/aislar.js`).

## Despliegue (Render + Vercel)

- API en Render: `render.yaml` en la raíz de `app-facturas` (carpeta `backend`, `npm start`, comprobación en `/api/health`). Variables: `MONGODB_URI`, `GEMINI_API_KEY`, `GROQ_API_KEY`. Atlas debe permitir la IP de Render (acceso desde cualquier IP).
- Frontend en Vercel: carpeta raíz `frontend`, comando `npm run build`, salida `dist`. Variable `VITE_API_URL` con la dirección de la API en Render (sin `/api` al final).
- Decisión del usuario: sin login y sin rotar las llaves; el sistema queda abierto a quien tenga el enlace.
- Render gratuito: se duerme sin uso y la primera consulta tarda; memoria limitada (512 MB).
