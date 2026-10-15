# Onyx Chess Lab 0.20.0

Primera versión de la Fase 8 replanificada a partir del estudio de mercado. El análisis es más
rápido y más fiable (caché de evaluaciones, varias partidas a la vez en el análisis de jugador y una
segunda pasada sobre las jugadas dudosas), el reporte señala los momentos clave y explica los
errores, las bases de datos tienen un informe de calidad, la búsqueda de jugadores entiende nombres
en cualquier orden y el informe de posición compara cada jugada con lo esperado por Elo.

## Análisis de partidas

- **Caché de evaluaciones:** cada posición analizada se guarda (motor, límite y posición), así que
  volver a generar un reporte o analizar partidas con aperturas repetidas no vuelve a lanzar el
  motor. Vive en su propio archivo, se limita a 200.000 posiciones y se vacía desde Ajustes →
  Directorios → «Caché de análisis». También se guarda la búsqueda de novedades en la base de
  referencia, que era lo más lento al repetir un reporte.
- **Segunda pasada en las jugadas dudosas:** tras el primer análisis, las posiciones alrededor de
  las jugadas marcadas se analizan de nuevo más a fondo (profundidad 22, hasta 1,5 s, como mucho 12
  por partida). Medida contra una referencia de 2 s por jugada, 250 ms con segunda pasada encuentra
  tantos errores como 500 ms sin ella en la mitad de tiempo, así que el reporte usa ahora
  **250 ms + segunda pasada** por defecto (quien ya tenía ajustes guardados los conserva).
- **Profundidad con tope de tiempo:** nuevo límite del reporte (por ejemplo, profundidad 16 con tope
  de 500 ms): las posiciones sencillas terminan antes.
- **Apertura desde la nube de Lichess (opcional):** el reporte puede tomar de la nube de Lichess
  las evaluaciones de las primeras jugadas, mucho más profundas. Está desactivado por defecto porque
  envía esas posiciones a Lichess.
- **Momentos clave:** el reporte muestra hasta tres jugadas que decidieron la partida, con la
  probabilidad de ganar antes y después y una etiqueta (vuelco, victoria escapada o error costoso).
  Un clic lleva a la jugada.
- **Aprende de tus errores:** al acertar o ver la solución, Onyx explica con hechos del motor qué
  permitía la jugada (por ejemplo, «Nf6 permite mate en 1: Qxf7#» o «… permite Bxf7+, que captura
  el peón en f7»), cómo cambia la evaluación y cuál era la mejor. El tablero marca la jugada en rojo,
  la mejor en verde y la pieza perdida con un círculo.
- **Uso del equipo:** los análisis por lotes reparten motores, hilos y memoria según el ordenador
  (por ejemplo, 3 motores de 2 hilos y 256 MB en un portátil de 4 núcleos) y dejan sitio al análisis
  en vivo y a los bots.

## Análisis de jugador

- Analiza varias partidas a la vez (unas 3 veces más rápido en un portátil de 4 núcleos) y aprovecha
  la caché de evaluaciones.
- Imprecisiones, errores y errores graves se clasifican igual que en el reporte: por la
  probabilidad de ganar que se pierde, no por centipeones (que se siguen mostrando como ACPL). Al
  volver a lanzar el análisis de motor, los perfiles anteriores se recalculan.
- Las aperturas se agrupan por familia, variante y subvariante, plegables, con partidas, puntuación,
  V-T-D y Elo del rival en cada nivel. Pulsa «Recalcular» en perfiles existentes para verlo.
- Corregido: las aperturas salían como «Unknown opening» cuando la partida no traía ECO.

## Bases de datos

- **Búsqueda de jugadores:** cada palabra puede ir en cualquier orden y sin acentos («David Cabezas»
  encuentra «Cabezas Solano, David Alejandro»). Se ocultan jugadores sin partidas y los resultados
  se ordenan por número de partidas. Vale para la tabla de jugadores y para los filtros por jugador.
- **Informe de calidad:** en los ajustes avanzados de una base, «Revisar calidad» cuenta partidas
  sin jugadas, decisivas muy cortas, sin año, con fecha futura o rating inverosímil, y «Revisión
  completa» busca duplicados exactos y probables, nombres sospechosos y ratings incoherentes por
  jugador, en segundo plano y con botón para detenerla. Nada se borra.
- **Informe de posición:** nueva columna «vs. esperado» (puntuación de cada jugada menos la que
  predice la diferencia de Elo) y flechas para las jugadas que ganan o pierden popularidad en los
  últimos años. El informe ya no sobresale por la derecha.
- **Enlaces a partidas:** los enlaces nuevos guardan jugadores y año. Si la base cambió y el enlace
  ya no lleva a la partida correcta, Onyx ofrece «Restablecer enlace»: busca la partida por sus
  datos (al instante) o por la posición y deja elegirla, también en otra base.
- **Índice de posiciones:** guardar una partida o editar el título de una base ya no obliga a
  reconstruir todo el índice si no cambian las jugadas; cuando sí hay que reconstruirlo, el panel lo
  dice con el progreso.
- El catálogo de descargas de bases y motores viene incluido en la aplicación, así que sigue
  disponible aunque falle el servidor de En Croissant.
- Corregido: una búsqueda cancelada podía mostrarse como error de la base de datos.

## Aperturas

- El modo Aprender pide por defecto **2 repeticiones seguidas de memoria sin errores** para dar una
  línea por aprendida (configurable de 1 a 5 en los ajustes de Aperturas). Un error reinicia la
  cuenta.
- La ficha de jugador agrupa sus aperturas por familia, variante y subvariante.

## Rendimiento

- Ajustes → Directorios → «Caché de análisis» muestra cuánto tardó en arrancar la sesión y el
  presupuesto de motores del equipo.

## Compatibilidad

- Se conservan repertorios, estudios, progreso de entrenamiento, bases de datos, análisis y
  ajustes. Los informes de posición guardados antes muestran «—» en la columna «vs. esperado».
