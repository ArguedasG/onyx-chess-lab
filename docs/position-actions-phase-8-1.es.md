# Fase 8.1 — Acciones de posición desde el tablero

Fecha de implementación: 17 de septiembre de 2026.

## Contrato de producto

La acción trabaja sobre la posición visible, no necesariamente sobre el final de la línea principal.
No crea nuevas colecciones: las copias tácticas y de finales usan directamente las estructuras
persistentes de Entrenamiento.

## Repertorios locales

Onyx recorre las líneas entrenables guardadas y compara la posición legal mediante las cuatro
primeras partes de la FEN: piezas, turno, enroques y captura al paso.

- **Coincidencia exacta:** la línea y el tablero parten de la misma posición inicial y usan el mismo
  orden de jugadas hasta la posición visible.
- **Transposición:** la posición legal coincide, pero se alcanzó desde otra posición inicial o con
  otro orden de jugadas.

Cada resultado identifica repertorio, variante y línea, y muestra la ruta y las siguientes cuatro
medias jugadas disponibles. La búsqueda es local y no consulta bases remotas.

## Copia táctica revisada

Solo se puede crear si la posición visible ya tiene al menos una continuación analizada. El usuario
elige cuál rama representa la solución y debe confirmarla expresamente. Esa rama pasa a ser la
solución principal de la copia; las demás variantes se conservan en el PGN para que la política del
set decida cuáles se aceptan. Un set nuevo permite configurar primer actor y política de variantes;
un set existente conserva su configuración.

No se afirma automáticamente que una continuación sea tácticamente correcta y no se inventa una
solución con motor: la confirmación humana se basa en el análisis preparado en el tablero.

## Copia de final revisada

El usuario elige el set nuevo o existente, el color que debe entrenar y el objetivo: ganar, tablas o
defender una posición perdida. Las continuaciones existentes se conservan como referencia, pero no
se usan para inferir el objetivo.

## Regreso a Estudios

Los capítulos abiertos incluyen una acción de retorno en su pestaña. Esta vuelve a la biblioteca y
selecciona el estudio de origen sin cerrar el capítulo ni perder su estado.

## Validación automática

- distinción entre una ruta exacta y una transposición real;
- información de ruta y continuación;
- promoción de la rama táctica revisada a solución principal sin perder alternativas;
- objetivo y color explícitos en la copia de final;
- compatibilidad de la ruta de retorno de Estudios con el esquema persistido de pestañas;
- TypeScript sin errores, 37 archivos/194 pruebas Vitest aprobados, auditoría i18n completa, lint
  sin errores y build de producción correcto.

## Validación manual pendiente

- abrir un capítulo, usar el botón de retorno y comprobar que se selecciona su estudio;
- buscar una posición que exista exactamente en un repertorio;
- reproducir la misma posición mediante otro orden y comprobar que aparece como transposición;
- crear y ampliar un set táctico, confirmando que empieza desde la posición visible y sigue la rama
  elegida;
- crear y ampliar un set de finales y verificar color y objetivo;
- cerrar y reiniciar la aplicación para confirmar la persistencia de las copias.
