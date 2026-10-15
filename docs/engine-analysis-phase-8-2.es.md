# Fase 8.2 — Motor y análisis

Fecha de implementación: 15 de octubre de 2026. Ideas del estudio de mercado: I-53, I-14, I-15,
I-24, I-46 e I-54 (primera versión).

## Presupuesto de motores (I-53, primera versión)

`src-tauri/src/engine_budget.rs` calcula cuántos motores pueden trabajar a la vez en análisis por
lotes y con cuántos hilos y cuánta memoria cada uno:

- procesos por lotes: núcleos físicos − 1 (entre 1 y 6), para dejar un núcleo libre a la interfaz y
  a un motor interactivo;
- hilos por proceso: (hilos lógicos − 2) / procesos, al menos 1;
- hash por proceso: 1/16 de la RAM (entre 16 MB y 1 GB en total), repartido y redondeado a una
  potencia de dos.

En la máquina de referencia (i5-1135G7, 4 núcleos / 8 hilos, 16 GB) son **3 motores de 2 hilos y
256 MB**. Los análisis por lotes (`priority: "batch"`, hoy Player Analysis) esperan un turno de un
semáforo global y reciben `Threads` y `Hash` del presupuesto, porque la configuración del motor está
pensada para un solo proceso. El reporte de la partida abierta, el análisis en vivo y los bots
conservan la configuración del usuario y no esperan turno.

Cada motor de análisis en vivo que esté buscando ocupa un turno: con uno activo, los lotes usan
2 motores en vez de 3 (nunca menos de uno). Los bots que están pensando en una partida cuentan
igual.

## Caché de evaluaciones (I-14)

`src-tauri/src/analysis_cache.rs` guarda las líneas del motor por posición en
`analysis-cache-v1.sqlite`, en los datos privados de Onyx: archivo y conexión propios, nunca dentro
de una base de partidas, con WAL y `busy_timeout`. Cualquier fallo de la caché se ignora y el
análisis usa el motor.

- **Clave:** posición (piezas, turno, enroques y captura al paso; sin contadores), motor (ruta,
  tamaño y fecha del ejecutable, argumentos y opciones salvo `Threads`, `Hash` y `MultiPV`), límite
  de búsqueda exacto y número de líneas. Cambiar cualquiera de ellos no reutiliza la entrada.
- **Límites:** 200.000 posiciones (~80 MB); al superarlo se borra la décima parte menos usada.
- **Versión:** `user_version = 1`; una versión desconocida se descarta y se recrea (es una caché).
- **Borrado:** Ajustes → Directorios → «Caché de análisis» muestra posiciones y tamaño y la vacía.
- **Advertencia:** la repetición de posiciones y la regla de 50 jugadas no forman parte de la clave;
  en esas posiciones raras una evaluación guardada puede diferir de una nueva.

El motor solo se arranca cuando hay una posición que la caché no conoce: reanalizar una partida ya
analizada no lanza Stockfish.

## Novedades en caché

El reporte marca como novedad la primera posición de la partida que no aparece en la base de
referencia. Esa búsqueda recorre toda la base (20–30 s en la Gigabase de 10,3 M de partidas) y era
lo único lento al repetir un reporte con las evaluaciones ya en caché. Su resultado se guarda en la
tabla `novelties` de la misma caché; la clave incluye la ruta, el tamaño y la fecha de la base, la
fecha o los jugadores de referencia y las posiciones, así que una base actualizada vuelve a buscar.
Se conservan las 5.000 más recientes.

## Presupuesto de rendimiento: línea base (I-54)

- Bundle web (`vite build`, 2026-10-15): 5,67 MB de JavaScript (1,71 MB comprimido) y 340 kB de CSS.
- Análisis: tabla del benchmark de abajo.
- Arranque: tiempo desde que arranca el proceso hasta que se muestra la ventana principal; se
  registra en el log («startup: main window shown after … ms») y se ve en Ajustes → Directorios →
  «Caché de análisis».
- Ficha de jugador: el log registra «player card: N games of player … in … ms».
- Memoria en lote: acotada por diseño a 3 × 256 MB de hash de Stockfish más el propio proceso.
- Pendiente: tomar esas cifras en la máquina de referencia y registrarlas por release.

## Segunda pasada dirigida

Tras la primera pasada, las posiciones a ambos lados de cada jugada que pierde más de 4 puntos de
probabilidad de victoria se analizan otra vez con `go depth 22 movetime 1500`, como mucho 12 por
partida (las mayores pérdidas primero), y sus resultados sustituyen a los de la primera pasada. Se
guardan en la caché con su propio límite.

Medición contra una referencia fuerte (2 s por jugada), mismas 8 partidas, 92 errores y 58 errores
graves en la referencia:

| Configuración              |   Tiempo | Recall | Precisión | ?? conservados | Misma clase |
| -------------------------- | -------: | -----: | --------: | -------------: | ----------: |
| Referencia fuerte: 2000 ms | 1072,0 s |      — |         — |      58 (base) |           — |
| 500 ms (reporte)           |  275,6 s | 94,6 % |    93,5 % |          58/58 |      93,9 % |
| 500 ms + segunda pasada    |  410,4 s | 97,8 % |    94,7 % |          58/58 |      95,0 % |
| 250 ms (Player Analysis)   |  141,4 s | 93,5 % |    91,5 % |          58/58 |      93,3 % |
| 250 ms + segunda pasada    |  275,2 s | 95,7 % |    95,7 % |          58/58 |      93,7 % |

La segunda pasada acerca el resultado al de una búsqueda cuatro veces más larga en las dos
configuraciones, y 250 ms con segunda pasada es mejor que 500 ms sin ella por el mismo tiempo. Las
diferencias son de pocos errores (92 en total), así que se toman como tendencia, no como cifra exacta.
Por eso el reporte usa por defecto 250 ms por jugada con segunda pasada (solo para quien no tenga
ya ajustes guardados); Player Analysis no la usa todavía porque duplicaría el tiempo de los lotes.

## Apertura desde la nube de Lichess (opcional)

Casilla del reporte, desactivada por defecto: envía las posiciones de la apertura a Lichess. Se
piden, una a una, las primeras 36 medias jugadas mientras la nube las tenga con profundidad ≥ 20,
con 80 ms entre peticiones y un presupuesto de 12 s; la primera ausencia o un `429` terminan. Las
líneas se convierten al formato del motor (el enroque «e1h1» de Lichess pasa a «e1g1»). La última
posición tomada de la nube la analiza también el motor, para que la jugada que sale de la nube
compare dos evaluaciones del mismo origen. Las evaluaciones de la nube no se guardan en la caché.

## Límite «profundidad con tope de tiempo»

`GoMode::DepthTime { depth, time }` envía `go depth D movetime T`: las posiciones sencillas terminan
al alcanzar la profundidad y las difíciles no superan el tope.

## Benchmark (I-14 e I-54)

`src-tauri/src/analysis_benchmark.rs`, prueba ignorada que necesita un motor y un PGN:

```text
ONYX_BENCH_ENGINE=<stockfish.exe> ONYX_BENCH_PGN=<partidas.pgn> ONYX_BENCH_GAMES=8 \
  cargo test analysis_benchmark::analysis_benchmark -- --ignored --nocapture
```

Cada configuración analiza las mismas partidas. Las jugadas se clasifican como el reporte (pérdida
de más de 5, 10 y 20 puntos de probabilidad de victoria) y se comparan con la referencia. La
referencia se ejecuta dos veces porque una búsqueda por tiempo no es determinista: el acuerdo entre
esas dos ejecuciones es el **ruido** contra el que se juzga cualquier otra configuración.

### Resultados (2026-10-15)

Máquina de referencia: i5-1135G7 (4 núcleos / 8 hilos, 16 GB), Stockfish (AVX2) con 64 MB de hash
por proceso. Conjunto: las 8 primeras partidas de 40–120 medias jugadas de una exportación propia de
Chess.com (548 jugadas). «Recall» es la parte de los errores y errores graves (?, ??) de la
referencia que la configuración también marca; «precisión», la parte de los suyos que la referencia
confirma.

| Configuración                              |  Tiempo | ms/jugada | Recall | Precisión | ?? conservados | Misma clase |
| ------------------------------------------ | ------: | --------: | -----: | --------: | -------------: | ----------: |
| Referencia: 500 ms, 2 hilos                | 275,8 s |       503 |      — |         — |      61 (base) |           — |
| Referencia repetida (ruido)                | 277,3 s |       506 | 94,8 % |    97,8 % |          61/61 |      95,2 % |
| 250 ms (predeterminado de Player Analysis) | 142,2 s |       260 | 94,8 % |    95,8 % |          61/61 |      93,0 % |
| Profundidad 16, tope 500 ms                | 237,5 s |       433 | 97,9 % |    96,9 % |          61/61 |      94,1 % |
| Profundidad 18, tope 1000 ms               | 493,9 s |       901 | 92,7 % |    95,7 % |          61/61 |      94,8 % |
| 500 ms, 3 procesos × 2 hilos (presupuesto) |  98,8 s |       180 | 90,6 % |    94,6 % |          61/61 |      92,4 % |
| 500 ms con caché (fría)                    | 263,1 s |       480 | 94,8 % |    97,8 % |          61/61 |      95,6 % |
| … las mismas partidas, caché caliente      |   0,2 s |       0,3 | 94,8 % |    97,8 % |          61/61 |      95,6 % |

Segunda medición de las configuraciones en paralelo (nueva referencia, 93 errores y 59 errores
graves):

| Configuración                |  Tiempo | Recall | Precisión | ?? conservados |
| ---------------------------- | ------: | -----: | --------: | -------------: |
| Referencia: 500 ms, 2 hilos  | 274,9 s |      — |         — |      59 (base) |
| 500 ms, 3 procesos × 2 hilos |  98,7 s | 97,8 % |    96,8 % |          59/59 |
| 500 ms, 2 procesos × 2 hilos | 152,3 s | 93,5 % |    97,8 % |          59/59 |

Conclusiones:

- **Ruido:** dos ejecuciones idénticas de 500 ms solo coinciden en el ~95 % de los errores. Una
  configuración que quede en ese rango no es peor de forma demostrable.
- **Paralelo:** 2,8 veces más rápido y dentro del ruido (el 90,6 % de la primera medición no se
  repitió: 97,8 % en la segunda). Se mantiene el presupuesto de 3 × 2.
- **Profundidad 16 con tope de 500 ms:** un 14 % más rápida y dentro del ruido. Queda como opción del
  reporte; el predeterminado (500 ms) no cambia, porque la ganancia es pequeña.
- **Profundidad 18 con tope de 1 s:** casi el doble de tiempo sin mejor acuerdo con la referencia (la
  referencia es más débil que ella, así que el acuerdo no mide su calidad). Útil solo si se quiere más
  profundidad, no para ir más rápido.
- **Caché:** en un análisis de jugador las aperturas se repiten; en estas 8 partidas ya hubo 23
  posiciones repetidas en frío, y repetir el análisis cuesta 0,2 s.
- **Errores graves:** ninguna configuración perdió uno (61/61 y 59/59). Las diferencias están en el
  límite entre «?» y «?!».

## Probabilidad de victoria y momentos clave (I-15)

- Player Analysis clasifica ahora como el reporte: imprecisión, error y error grave por pérdida de
  más de 5, 10 y 20 puntos de probabilidad de victoria (fórmula de Lichess), en vez de 40/100/200
  centipeones. El ACPL se conserva como dato. El límite guardado incluye la versión de la
  clasificación (`winchance-v1`), así que los perfiles anteriores se recalculan al volver a lanzar
  el análisis de motor (con la caché, casi sin coste).
- El reporte muestra **Momentos clave**: hasta 3 jugadas de la línea principal con más de 10 puntos
  de pérdida, en orden de partida, con la probabilidad antes y después y una etiqueta: _vuelco_ (pasa
  de ≥ 55 % a ≤ 45 %), _victoria escapada_ (de ≥ 80 % a < 65 %) o _error costoso_. Un clic lleva a
  la jugada.
- No se añadió «brillante» con reglas nuevas: se mantiene la anotación existente.

## Explicaciones factuales y flechas (I-24, I-46)

En «Aprende de tus errores», al acertar o al ver la solución, Onyx busca con el motor cómo se
castigaba la jugada original (profundidad 16) y explica solo con hechos verificables:

- «Nf6 permite mate en 1: Qxf7#», o «… permite Bxf7+, que captura el peón en f7», o «… permite Nd5»;
- «La evaluación pasa de +0.30 a +M1»;
- «La mejor era g6» (o «…, con mate en 3»).

El tablero muestra la jugada original en rojo, la mejor en verde y un círculo rojo en la casilla de
la pieza que se pierde. Las frases son claves de i18n con parámetros (`src/utils/moveExplanation.ts`),
de modo que la redacción puede cambiar sin tocar los hechos.

## Validación automática

- Rust: presupuesto, claves y poda de la caché, conversión de líneas, clasificación y acuerdo del
  benchmark, lectura de PGN.
- Frontend: clasificación por probabilidad, momentos clave, explicaciones y flechas.
