# Onyx Chess Lab 0.28.0

Una función nueva, Planes, inspirada en otras herramientas de análisis, y una ronda de orden en las
partes con más ruido: el panel de base de datos y el Análisis del jugador. También prepara Onyx para
bases del tamaño de la Mega Database (unos 12,6 millones de partidas).

## Planes

- Nueva vista **Planes** en el panel de base de datos. Responde a «¿qué hace este bando en sus
  próximas jugadas, en cualquier orden?», no solo a «¿qué se juega ahora?». Cada movimiento se
  cuenta una vez por partida y se identifica por su casilla de origen y de destino (`Ng1-f3`), así
  que no importa en qué orden llegó.
- Se elige el bando (por defecto el que mueve), cuántas jugadas leer (3, 4, 6 u 8) y el porcentaje
  mínimo de partidas (10, 20, 30 o 50 %). Cambiar el porcentaje no vuelve a calcular nada.
- **El plan típico se dibuja en el tablero** con flechas numeradas en el orden en que suele jugarse.
  Entran los movimientos más frecuentes que no chocan entre sí (el mismo caballo no puede ir a f3 y
  a e2) y que suelen aparecer en las mismas partidas, como mucho cinco.
- Cada fila muestra la jugada en que suele hacerse, el número de partidas, el porcentaje y, con al
  menos 30 partidas con rating, cómo puntuaron frente a lo que predecían los ratings, comparado con
  toda la posición. Así no se confunde un buen plan con uno que solo juegan los más fuertes. Es una
  correlación, no una causa. Al desplegar una fila se ve con qué movimientos suele jugarse.
- **Con la búsqueda por estructura de peones** también hay planes. Como las piezas están en otro
  sitio en cada partida, un movimiento de pieza cuenta por su destino (`N→f3`) y se dibuja como un
  círculo numerado; los peones conservan su casilla de origen.
- **Informe de aperturas:** sección nueva, Planes típicos, con una tabla por bando (ventana de
  4 jugadas). Sigue los filtros de franja de rating y periodo del informe y se incluye en la
  exportación HTML. Los informes guardados antes no tienen planes; basta con generarlos de nuevo.
- Las posiciones muy amplias se leen sobre una muestra uniforme de 100 000 partidas, y la vista lo
  indica. Medido con una base de 12 millones de partidas: la posición inicial tarda 0,8 s con
  4 jugadas y 1,0 s con 8.
- Una partida con jugadas ilegibles en la base se deja fuera de los planes en lugar de impedir que
  se calculen.

## Panel de base de datos

- Una vista a la vez: **Jugadas | Partidas | Planes | Informe**. Antes la tabla de jugadas y la
  lista de partidas se apilaban en secciones plegables, y con la notación abierta era demasiado.
- La barra de herramientas tiene dos filas ordenadas en vez de una que se partía sola:
  - Arriba, qué se consulta: fuente, base, un menú **Buscar por** (posición del tablero, estructura
    de peones, patrón) y el botón **Filtros**, que resume lo activo (por ejemplo
    `Blitz, Rapid · 1600–2000` o `Elo 1600– · 1-0`).
  - Abajo, qué se mira: la vista, la etiqueta de búsqueda por patrón, el número de partidas y
    refrescar.
- Ninguna función se perdió: la estructura de peones y el patrón están en Buscar por, y el aviso de
  partidas débiles va dentro del resumen de Filtros.
- Los filtros se miden con el panel, no con la ventana: con el panel de notación grande se pueden
  desplazar hasta el final. El texto del botón Filtros vuelve a estar centrado.

## Bases grandes

- **Una búsqueda guarda hasta 22,4 millones de partidas** en lugar de 11,2 millones. Cada partida
  encontrada ocupa 12 bytes en lugar de 24 en el archivo temporal de la búsqueda, sin perder ningún
  dato ni la comprobación contra el índice.
- Antes, en la posición inicial de una base de más de 11,2 millones de partidas, la lista y el
  informe dejaban fuera las últimas de la base, probablemente las más recientes, y el panel lo
  avisaba («Very broad position…»). Con la Mega Database ya entran todas.
- **Estadísticas en vivo:** en una búsqueda larga, la vista Jugadas se va llenando mientras busca. El
  número de partidas encontradas y la tabla de jugadas se actualizan unas cuatro veces por segundo
  hasta que llega el resultado completo. Las búsquedas rápidas se ven igual que antes.
- Referencia con la Mega Database 2027, solo 1.e4: Onyx 8 s, ChessBase 26 11,6 s.

## Análisis del jugador

- La pestaña Análisis se veía distinta del resto de la ficha. Ahora los filtros caben en una línea,
  con el mismo aspecto que Resumen o Rivales: periodo, un botón para un rango de fechas a mano,
  color, Elo del rival y ritmo.
- Las acciones secundarias (biblioteca de análisis, guardar versión, exportar JSON o HTML,
  desactivar el análisis y eliminar el perfil) están en un menú **⋯** junto a **Recalcular**.
  Eliminar el perfil queda al final, lejos de un clic accidental.
- Resumen, Aperturas, Hallazgos y Motor son pestañas propias con icono. **Motor** muestra «Sin
  analizar» hasta que el motor haya analizado las partidas, porque otras partes dependen de él.
- Los ajustes del motor caben en una fila. Cuando ya hay resultados, se pliegan en una línea de
  resumen («Stockfish · 10 de 54 partidas (Blitz) · 250 ms por posición») con los botones Ajustes y
  Analizar, para que los resultados queden primero.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
