# Onyx Chess Lab 0.19.0

Esta versión reorganiza la interfaz tomando como referencia ChessBase para Mac: el panel derecho
se puede plegar y ordenar, el motor queda siempre a la vista bajo el tablero, la anotación vive
junto a la notación y la base de datos se lee en secciones. El informe de aperturas se rediseña
con filtros y gráficas, la táctica gana un modo enfoque y los estudios muestran sus capítulos.

## Panel derecho

- Dos zonas, notación y herramientas, cada una con su cabecera: se pliegan, se maximizan (también
  con doble clic en la cabecera), se intercambian arriba/abajo y se redimensionan arrastrando la
  separación (doble clic la deja al 50 %).
- Cada tipo de pantalla recuerda su propia distribución. En Análisis la notación va arriba; en
  repertorios, Jugar, el Generador y Puzzles, su panel sigue arriba.
- Las pestañas Análisis, Base de datos e Información viven en la cabecera de la zona, así que
  siguen visibles con la zona plegada; elegir una la despliega.

## Motor

- Franja de motor bajo el tablero: nombre del motor con selector para activar o desactivar
  motores, chips de líneas, núcleos y memoria (abren los ajustes), botón para añadir otro motor,
  profundidad y velocidad, amenaza e interruptor. Plegada, cada motor ocupa una línea con su
  evaluación y su mejor variante.
- Se muestran 2 líneas por motor (con “+1 más” para ver el resto) y los motores apagados quedan
  como botones en una sola fila. En finales de hasta 7 piezas aparece la tablebase.
- La subpestaña Análisis → Motores muestra la misma franja en grande; mientras está abierta, la
  franja de abajo se oculta. En Ajustes → Tablero se puede desactivar la franja por completo.
- La franja se oculta durante la práctica de repertorios y al editar una posición.

## Tablero

- El tablero mide el espacio disponible y lo ocupa entero; las barras de jugador solo aparecen
  cuando hay nombres, reloj, entrada de jugadas por teclado o un aviso.
- Barra de evaluación más fina y redondeada; el valor exacto aparece al pasar el ratón.

## Notación y anotación

- Una sola cabecera para la notación: título, nombre de la apertura y los botones de vista.
- Barra de anotación bajo la notación: `!! ! !? ?! ? ??`, símbolos de evaluación y otros,
  comentario en un editor compacto (tecla D), promover variante, borrar flechas y borrar desde la
  jugada. Se oculta con el botón “!?” de la cabecera.
- Desaparece la pestaña Anotar.

## Base de datos

- Barra superior compacta (fuente, base, estructura de peones, filtros, recargar, número de
  partidas y selector Explorador/Informe).
- Explorador con dos secciones plegables, Referencia y Partidas, cuyo orden se puede intercambiar.
  Los filtros se despliegan bajo la barra.
- Un clic en una partida muestra una vista previa con mini tablero sin salir de la posición; doble
  clic la abre, como antes.
- Al llegar desde un jugador del informe, desde “ver partidas” o al volver de una partida, se
  muestran las partidas primero.

## Informe de aperturas

- Lo más útil primero: resumen con partidas, puntuación del bando que mueve, ELO medio y período, y
  una barra de resultados.
- Filtros por rango de ELO y período que recalculan al instante la tabla de jugadas, el
  rendimiento por ELO y el resumen.
- Tabla de jugadas con barras de popularidad y de resultados; rendimiento por rango de ELO;
  gráficas de cómo ha cambiado la moda y de cómo puntuó cada jugada, suavizadas a cinco años y
  solo cuando hay datos suficientes.
- Quién la juega: jugadores más frecuentes o más fuertes, con ELO, partidas, puntuación, colores y
  años en que la jugaron. Un clic lleva a sus partidas.
- Líneas teóricas, partidas modelo, órdenes de jugadas, transposiciones y detalles técnicos en
  secciones plegables.
- El informe de Lichess usa el mismo estilo. El modal es más ancho y ya no se desplaza de lado.
- Los informes guardados con versiones anteriores se abren igual, pero para filtrarlos hay que
  generarlos de nuevo.

## Táctica

- Modo enfoque: el tablero ocupa todo el alto y el panel lateral muestra a quién le toca, qué
  buscar, los tiempos y el resultado; pista, solución y análisis quedan discretos abajo, y la
  navegación y los ajustes en una sección plegable.
- Un check verde o una X roja aparece con una animación suave sobre la casilla de destino de cada
  jugada.

## Capítulos y partidas

- Nueva pestaña Capítulos al abrir un estudio, y Partidas al abrir un PGN con varias partidas: la
  lista completa con la actual resaltada, anterior/siguiente y los atajos de partida siguiente y
  anterior. Si hay cambios sin guardar, pregunta antes de cambiar.

## Archivos

- Botón “Importar PGN” (y arrastrar archivos .pgn a la ventana): copia los archivos a la carpeta
  elegida sin sobrescribir ni tocar el original.
- Menú “Usar en…” en cada archivo: añadir a un estudio (un capítulo por partida) o a un repertorio,
  o crear un repertorio, un set de táctica o un set de finales a partir del PGN.
- Cada archivo indica dónde se usa (repertorio, set de táctica o estudio) y avisa antes de
  duplicarlo; un repertorio no puede recibir su propia copia editable.

## Compatibilidad

Los repertorios, estudios, progreso de entrenamiento, bases de datos, análisis y ajustes se
conservan. La distribución del panel derecho empieza con los valores nuevos; el ancho entre tablero
y panel se mantiene.
