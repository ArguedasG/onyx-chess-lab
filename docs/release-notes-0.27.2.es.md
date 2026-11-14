# Onyx Chess Lab 0.27.2

Arreglos y mejoras a partir de los avisos de un usuario de Mac que probó a fondo el análisis de
jugador, la revisión de errores y la importación de cursos.

## Importar cursos

- Muchos cursos exportados empiezan capítulos o líneas desde una posición del curso (una etiqueta
  `[FEN]`, a menudo con contadores falsos como «0 1») en vez de la posición inicial. Onyx solo unía
  registros con el mismo inicio, así que cada uno acababa en su propia sección, incluso con «Una sola
  sección combinada». Ahora un registro así se une a las líneas que llegan a esa posición, aunque
  esté en otro registro del archivo, y si no se puede unir queda en una sección aparte en vez de
  hacer fallar la importación.
- Los títulos de línea que empiezan con un número de jugada («3.Nc3/Nd2 - 5.Bc4 #1») se tomaban por
  números de capítulo y partían un capítulo entero en una sección por línea.
- Los capítulos de «Typical Plans» van a secciones informativas, como la táctica y los ejercicios,
  y un capítulo que es casi todo planes o táctica va entero, introducción incluida.
- Con los dos cursos del aviso: la Jobava London pasa de 37 secciones mezcladas a 28, una por
  capítulo, y The French: Simplified conserva sus capítulos de teoría enteros, con los planes, la
  táctica y las partidas modelo aparte.
- En la revisión del import, cada sección tiene un botón visible «No importar esta sección» (antes
  solo estaba en el menú «⋯»).

## Análisis de jugador

- El análisis con motor sigue en segundo plano. Ya seguía al salir de la ficha, pero al volver no
  se veía la barra y Cancelar quedaba desactivado; ahora se ve «X de N partidas analizadas», Cancelar
  funciona y no se puede lanzar por error un segundo análisis de la misma ficha.
- El progreso se guarda cada minuto: cerrar la app pierde como mucho el último minuto, y las
  partidas ya analizadas no se repiten. Recalcular ya no borra el análisis del motor.
- Con partidas elegidas en la pestaña Partidas, la pestaña Motor muestra solo esas partidas y un
  botón «Analizar N partidas», sin el límite de 10 ni la «×» que volvía a las más recientes.
- Los filtros tienen los atajos «Todo / 12 meses / 3 meses / 1 mes», como la pestaña Partidas.
- El desplazamiento ya no salta hacia atrás con muestras grandes (cientos de partidas analizadas).
- «Añadir todos a Mis errores» en «Candidatas para entrenamiento» añade todos los errores del
  análisis de una vez.

## Repasar mis errores

- Después de cada respuesta aparecen tres líneas con su evaluación: tu jugada, la mejor del motor y
  la de la partida con cómo se castiga. Se recorren en el tablero pulsando una jugada o con las
  flechas, para ver la diferencia entre ellas.
- Las flechas solo se dibujan en la posición inicial, no sobre la posición después de tu jugada.

## Jugadores

- Jugadores abre tu propia ficha en vez de la primera ficha guardada (esperando a que carguen tus
  cuentas), «Abrir mi ficha» en Cuentas la selecciona, y si las fichas de tus cuentas no se pueden
  cargar se ve el motivo con un botón para reintentar.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
Los repertorios ya importados no cambian; para aprovechar la nueva agrupación, vuelve a importar el
curso.
