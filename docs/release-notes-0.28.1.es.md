# Onyx Chess Lab 0.28.1

Arreglos a partir de los avisos de dos usuarios nuevos: entradas repetidas en las listas de
descarga, un error con la carpeta de puzzles y un botón de girar el tablero difícil de encontrar.

## Listas de descarga

- Las listas de bases de puzzles y de partidas mostraban algunas bases dos veces. La segunda copia
  era una versión nueva en DuckDB que ahora ofrece el catálogo de En Croissant, con los mismos
  puzzles o partidas en un archivo más pequeño (por ejemplo, Lichess Puzzles 2026 aparecía con
  1,09 GB y con 309,51 MB). Onyx solo lee su propio formato, así que esa copia fallaba después de
  descargarse.
- Ahora solo se listan las bases que Onyx puede abrir, una vez cada una.

## Puzzles

- Una carpeta de puzzles con otros archivos de base de datos (por ejemplo, una base de partidas)
  mostraba el error «no such table: puzzles», varias veces. Ahora esos archivos se omiten sin error.
- Cuando cambiaba la carpeta de puzzles o se borraba la base seleccionada, Onyx seguía abriendo la
  ruta antigua y dejaba ahí un archivo vacío. Ahora sigue la base a la carpeta nueva si hay un
  archivo con el mismo nombre, elige la única base cuando hay solo una y, si no, te pide escoger.
  Un archivo que falta o que no corresponde se indica como tal («…is not a puzzle database»).

## Girar el tablero

- El botón de girar el tablero está ahora en el extremo izquierdo de la barra de jugadas, junto a
  los botones de movimiento, en el análisis y en las partidas contra el motor. Antes era el último
  icono de la columna junto a la notación. Su ayuda muestra el atajo (F por defecto, que se puede
  cambiar en Ajustes).

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
