# Onyx Chess Lab 0.27.3

Arreglos a partir de los avisos de dos usuarios: un PGN de un libro de aperturas que no se podía
importar y una sesión de Repasar mis errores que se perdía al abrir una partida.

## PGN con el formato antiguo de Mac

- Algunos archivos PGN, a menudo exportaciones antiguas de editoriales de ajedrez, usan los saltos
  de línea del Mac clásico (solo CR, sin LF) y una codificación de texto que no es UTF-8 (Latin-1 o
  Windows-1252). Onyx partía las líneas solo por LF, así que leía el archivo entero como una sola
  línea; al no ser UTF-8 válido, la descartaba, no encontraba partidas y fallaba con
  «invalid args `pgn` for command `lex_pgn`».
- Ahora el lector acepta saltos LF, CRLF y CR solo, y lee como Windows-1252 las líneas que no son
  UTF-8 en vez de descartarlas. Comprobado con el archivo del aviso (650 KB): se leen sus 96 partidas
  y se conservan los acentos, como la «ü» de Grünfeld.
- Lo mismo vale para importar estudios, repertorios de aperturas, finales y táctica desde un archivo.
- Las líneas que empiezan con «%» antes de la primera partida (como «%BOOKTITLE») se ignoran, como
  indica el estándar PGN. Antes contaban como una primera partida vacía, que era la que se abría al
  importar.

## Importar desde un archivo

- Si la importación falla, la ventana de Importar muestra el motivo y el botón se puede volver a
  usar. Antes se quedaba cargando y había que cerrar Onyx para probar otro archivo.
- Un archivo sin partidas lo indica: «No se encontraron partidas en este archivo PGN».

## Repasar mis errores

- Abrir una partida desde una sesión de repaso cerraba la página y perdía la sesión, su posición y
  el filtro con el que habías llegado. Al volver había que empezar de nuevo y recordar qué errores
  ya estaban repasados.
- Ahora, al volver con la flecha de la pestaña de la partida, la sesión se reabre en el mismo error,
  con su contador, y conserva el filtro (por ejemplo, piezas colgadas desde Prioridades).
- Abrir una partida desde la lista te devuelve a la misma lista filtrada y a la misma página.
- Cerrar la sesión con la X la termina como antes. El estado se guarda mientras Onyx está abierto,
  no entre reinicios.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
