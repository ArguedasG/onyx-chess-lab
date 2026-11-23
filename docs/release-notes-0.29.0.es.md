# Onyx Chess Lab 0.29.0

Onyx tiene ahora una identidad propia, separada de En Croissant: su propia carpeta de datos, su
propio editor y su propia entrada en el instalador. Tus datos pasan a la carpeta nueva solos la
primera vez que abres esta versión. Esta versión también trae avisos de actualización en macOS y
Linux y mejoras en el entrenamiento de táctica para cursos de visualización.

## Tus datos pasan a la carpeta propia de Onyx

- Onyx tiene ahora su propio identificador de aplicación (`io.github.arguedasg.onyxchesslab`) y su
  propio editor (Gabriel Arguedas). Hasta ahora seguía usando los de En Croissant.
- La primera vez que abres la 0.29, tu carpeta de datos pasa sola a la ubicación nueva:
  - bases de partidas y de puzzles;
  - motores;
  - repertorios y progreso de entrenamiento;
  - perfiles de Análisis de jugadores;
  - ajustes y archivos recientes.

  Las rutas guardadas se actualizan y no se borra nada.

- En Windows, el instalador también traslada su propia entrada del registro, así que actualizar y
  desinstalar siguen funcionando y se conserva tu carpeta de instalación.
- Las instalaciones nuevas crean `Documentos/Onyx Chess Lab`. Las existentes conservan la carpeta
  de documentos que ya usan.

## Si también usas En Croissant

- Hasta ahora Onyx y En Croissant compartían una carpeta de datos. Esa carpeta pasa ahora a Onyx,
  así que En Croissant empezará vacío la próxima vez que lo abras.
- Si Onyx detecta que la carpeta era compartida, te avisa una sola vez, la primera vez que arranca.
  No se borra nada.

## Maia 3 después de actualizar

- El entorno de Python de Maia 3 depende de la carpeta donde vive, así que hay que reconstruirlo
  después del cambio.
- La primera vez que abres la 0.29, Onyx abre **Motores recomendados** con un botón **Reparar
  Maia 3**: con un clic se reinstala.
- Si cierras esa ventana, queda un aviso arriba en **Motores**. La reparación nunca deja a Maia
  repetida en la lista.

## Avisos de actualización en macOS y Linux

- Onyx ahora busca versiones nuevas también en macOS y Linux. Muestra las notas de la versión en
  la misma ventana que en Windows, con un botón que abre la página de descarga.
- Windows conserva sus actualizaciones automáticas firmadas.
- El aviso funciona a partir de la 0.29, así que esta actualización todavía hay que descargarla a
  mano en macOS y Linux.

## Táctica

- **A ciegas en ejercicios donde mueves tú primero.** El tablero se queda congelado en la posición
  inicial mientras juegas toda la línea de memoria. Las respuestas del rival aparecen escritas
  debajo del tablero y como flecha. Así funcionan los cursos de visualización: juegas mentalmente
  las jugadas indicadas y luego buscas la táctica. También funciona en Tormenta, Racha y
  Contrarreloj.
- **Mostrar comentarios del PGN.** Cuando un ejercicio tiene comentarios, una opción en el panel
  lateral muestra:
  - el comentario inicial, por ejemplo las jugadas que debes visualizar;
  - los comentarios de las jugadas ya hechas.

  Los comentarios de las jugadas que faltan nunca se muestran, porque suelen revelar la solución.
  Al terminar el ejercicio aparecen los del resto de la línea. La opción se recuerda.

- **Se omiten los registros sin jugadas.** Al importar un PGN, los registros que solo tienen texto,
  como la introducción de un curso, ya no cuentan como ejercicios. Los sets importados antes de
  esta versión los conservan; importa de nuevo el PGN para quitarlos.
- **Revisar set** muestra ahora la lista completa de puzzles desde que se abre. Antes aparecía vacía
  la primera vez y, en sets largos, solo se dibujaban las primeras filas.

## Otros cambios

- Se quitó una biblioteca de analítica heredada de En Croissant que Onyx nunca usó.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
