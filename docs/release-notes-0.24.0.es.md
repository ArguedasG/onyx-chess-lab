# Onyx Chess Lab 0.24.0

La versión de **Libros** (Fase 9.4): leer PDF de ajedrez junto al tablero, convertir diagramas y
capturas en posiciones y abrir las partidas impresas en el texto. Incluye también la ampliación de
los gemelos y la preparación, y la pantalla de inicio nueva tras la crítica de un usuario. El paso
6 opcional de 9.4 (vídeo local junto al tablero) se aplaza a la versión siguiente.

## Libros (9.4)

- **Biblioteca** de PDF propios: Onyx guarda la ruta y una huella del archivo, nunca una copia.
  Portadas, búsqueda, «Continuar leyendo» con el último punto de lectura, arrastrar PDF y
  «Localizar…» si un archivo cambia de sitio. Tarjeta **Libros** en el Inicio.
- **Lector en dos columnas**: el libro y una columna de estudio con tablero grande, botones rápidos,
  notación (ocultable) y herramientas debajo. Zoom con Ctrl + rueda, seleccionar texto o mano, modo
  **Diagramas** que marca los diagramas de las páginas visibles y diagrama anterior/siguiente.
  `pdf.js` se carga solo al abrir un libro y las páginas se virtualizan: un libro de 700 páginas no
  carga lo que no se ve.
- **Doble clic en un diagrama** → el tablero en esa posición, con el turno y el número de jugada
  leídos del texto cuando aparecen. Funciona con diagramas incrustados como imagen y con páginas
  escaneadas (un detector encuentra los tableros de la página). Si hay casillas dudosas se abre el
  editor con ellas en rojo; nunca se presenta como segura una lectura dudosa.
- **Adaptación por libro**: el lector aprende de las correcciones del usuario en cada libro (memoria
  local por libro, que nunca sale del PC). En la evaluación privada, las casillas que corregir
  bajaron de 382 a 43 en 143 tableros, sin ningún tablero aceptado mal leído; en los libros con la
  fuente Alpha, de 352 a 15. Las casillas que la memoria cambia quedan siempre por revisar. Se
  puede olvidar lo aprendido desde el menú del lector.
- **«Abrir esta partida»**: doble clic en una jugada del texto y la línea hasta ella (y lo que sigue)
  pasa al tablero, desde el diagrama de encima, el tablero o la posición inicial. Lee letras en
  inglés, español y alemán, figurines y figurines dañados por el OCR, variantes entre paréntesis y
  partidas que cruzan páginas. Una jugada que no se puede jugar se marca en rojo en la página y el
  tablero se queda en la anterior. En los PDF digitales limpios casi todas las líneas se abren; en
  los escaneos el límite es el OCR (62 de 122 jugadas en la evaluación privada).
- Correcciones guardadas por libro en JSON versionado.

## Posición desde imagen y reconocedor propio (9.4)

- **«Desde imagen»** en el editor de posición: abrir, pegar o arrastrar una captura (Chess.com,
  Lichess, un vídeo o un PDF), con las casillas dudosas en rojo hasta corregirlas.
- **diagram-squares 1.2.0**: clasificador por casilla propio (1,2 MB), inferido en Rust con `rten`
  (unos 76 ms por imagen), entrenado **solo con datos sintéticos** de licencia limpia: posiciones de
  la base de puzzles de Lichess (CC0) dibujadas con juegos de piezas libres en estilo impreso y
  pantalla. Sintético: 91 % de tableros exactos sin filtrar y 99,87 % entre los aceptados. Los
  libros del usuario solo sirven de evaluación privada y nunca entrenan el modelo distribuido.
- Model card, dataset card, entrenamiento reproducible y prueba de paridad entre Python y la app en
  `ml/diagram-recognizer/`.

## Gemelos y preparación (ampliación de 9.3)

- El **gemelo** se guarda, se edita, se actualiza y se autoajusta, con un perfil por ritmo (el bala y
  las clásicas de un jugador no se mezclan). También se puede añadir a mano a un torneo.
- **Tablero interactivo en «Repertorio probable»**: se mueve cualquier pieza, con flechas para las
  jugadas más jugadas y un aviso, con vuelta atrás, al salir de las partidas del jugador.
- **Fuente «Rival»** en el panel de base de datos del tablero: una línea abierta desde Preparación
  muestra en cada posición las jugadas del jugador con las mismas cifras que «Repertorio probable»;
  un clic juega la jugada.

## Inicio y navegación

- **Pantalla de inicio nueva**: el tablero de análisis como acción principal, Jugar, Continuar y
  todas las secciones con su propósito, con vista compacta. Ajuste «Al abrir la aplicación: Inicio /
  Tablero de análisis», en Ajustes y en el propio inicio.
- Entrada **Inicio** en la barra lateral, **botones de variante** (solo si la partida tiene
  variantes), el atajo de cada botón de movimiento en su tooltip y **consejos de primer uso** que se
  descartan y se pueden volver a mostrar.
- El botón **«+»** muestra una pestaña sin usar del mismo tipo en lugar de abrir otra igual; nunca
  reutiliza una pestaña con trabajo.

## Release

- Las notas de la página de la release vuelven a estar en inglés y español visibles; la app sigue
  leyendo las notas en español del bloque oculto.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
