# Fase 8.0 — Biblioteca personal de estudios

Fecha de implementación: 16 de septiembre de 2026.

## Contrato de producto

Un **estudio** es una colección local ordenada. Cada **capítulo** contiene un árbol PGN completo e
independiente: encabezados, comentarios, anotaciones y variantes. Los nombres se mantienen por su
familiaridad con Lichess, pero Onyx no depende de Lichess ni sincroniza estos datos con una cuenta.

El estudio siempre sigue siendo la fuente. Enviar contenido a Táctica, Finales o Aperturas crea una
copia entrenable; nunca convierte ni modifica el estudio original.

## Flujos incluidos

- crear, renombrar, describir y ordenar estudios;
- crear capítulos vacíos, importar todos los registros de un PGN y ordenar o renombrar capítulos;
- añadir la partida o análisis abierto desde el menú PGN del tablero;
- abrir un capítulo en el tablero y guardar los cambios en su origen de estudio;
- exportar un capítulo o todo el estudio como PGN;
- guardar/restaurar un respaldo JSON completo;
- recuperar estudios y capítulos desde la papelera;
- recuperar una de las últimas 20 revisiones PGN de cada capítulo;
- crear un set táctico o añadir ejercicios a un set embebido existente;
- crear un set de finales o añadir posiciones a un set propio existente;
- crear un repertorio desde los capítulos seleccionados o usar la vista previa existente para
  añadirlos a un repertorio ya creado.

## Revisión antes de crear material entrenable

Para Táctica se selecciona una posición real del árbol. La continuación principal define la solución
base y el PGN recortado conserva las variantes desde esa posición. En un set nuevo se elige si se
acepta solo la línea principal, todas las respuestas del rival o todas las variantes, además de quién
mueve primero. En un set existente se conserva su configuración.

Para Finales se selecciona la posición, el color del estudiante y un objetivo explícito —ganar,
tablas o defender una posición perdida—. No se infiere automáticamente que una partida completa sea
un ejercicio válido.

Para Aperturas se copian los árboles completos. Una copia nueva usa un PGN fuente privado e
inmutable y otro PGN editable. Al añadir a un repertorio existente se reutiliza su vista previa,
comprobación de cambios concurrentes y copia de recuperación.

## Persistencia y recuperación

La biblioteca se guarda como JSON versionado en los datos privados de Onyx. Antes de reemplazar el
manifiesto se conserva su contenido anterior como copia de recuperación. Si el manifiesto principal
no se puede leer, Onyx intenta abrir esa copia y avisa en la interfaz.

La papelera es lógica y está limitada a 100 entradas. El historial se limita a 20 revisiones por
capítulo para impedir crecimiento indefinido. Los snapshots usados como fuente de repertorios se
guardan aparte y no enlazan el progreso de entrenamiento con el contenido editable del estudio.

## Límites deliberados de 8.0

- no hay sincronización en la nube ni edición colaborativa;
- no se importan estudios directamente desde una cuenta de Lichess;
- no se afirma que una posición sea táctica o final sin revisión humana;
- no se enlaza el progreso de una copia entrenable de vuelta al estudio;
- las carpetas anidadas adicionales quedan fuera mientras la jerarquía estudio → capítulo sea
  suficiente en uso real.

## Validación automática

- operaciones puras de creación, orden, historial, papelera, restauración y exportación;
- encabezados de agrupación y procedencia en la exportación PGN;
- selección de posiciones desde árboles con variantes;
- recorte del PGN desde la posición elegida y conservación de variantes tácticas;
- procedencia hacia estudio, capítulo y ruta seleccionada;
- compatibilidad de los esquemas existentes mediante campos opcionales;
- TypeScript sin errores, 36 archivos/191 pruebas Vitest aprobados, auditoría i18n completa y build
  de producción correcto.

## Validación manual pendiente

- crear el estudio «Mis partidas contra bots», añadir una partida desde el tablero, editarla,
  cerrarla y volverla a abrir;
- comprobar autoguardado activado y guardado explícito desactivándolo;
- importar y exportar un PGN con varios registros, comentarios y variantes;
- eliminar/restaurar un capítulo y restaurar una revisión anterior;
- crear y ampliar sets de Táctica y Finales, verificando la posición inicial y la solución;
- crear y ampliar repertorios y confirmar que editar la copia no cambia el estudio;
- reiniciar la aplicación y validar persistencia, respaldo y recuperación.
