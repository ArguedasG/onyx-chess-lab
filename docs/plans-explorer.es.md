# Explorador de planes

Estado: **primera entrega probada por el autor (2026-11-18); segunda entrega implementada,
pendiente de su prueba**.
Fecha: 2026-11-17. Fase: la decide el autor. Si se registra como idea del estudio de mercado, sería
la I-66.

## Decisiones aceptadas (2026-11-17)

1. Primero la vista del panel; la sección «Planes típicos» del informe va en una segunda entrega.
2. La puntuación es **rendimiento sobre lo esperado por Elo**, comparado con el de la posición.
3. Planes por estructura de peones, en la segunda entrega.
4. Bando por defecto: el que mueve. Si el usuario elige otro, la pestaña lo conserva.

## Lo implementado

- **Rust:** `src-tauri/src/db/position_plans.rs`, comando `position_plans(token, { white, window },
tab_id)`. Un recorrido por el snapshot, por lotes y cancelable. Devuelve los movimientos con al
  menos el 5 % de las partidas (como mucho 24), con partidas, capturas, jugada típica media,
  puntuación y esperado sobre las partidas con rating y resultado, y la matriz de co-apariciones.
  Por encima de **100.000 partidas** lee una muestra uniforme (una de cada k) y lo dice. Libera el
  permiso de consultas en cuanto abre el índice, para no frenar al explorador mientras cuenta.
- **El plan se arma en TypeScript** (`src/components/panels/database/plans.ts`), no en Rust: así el
  umbral y «ocultar capturas» se aplican sin recalcular. Regla voraz por frecuencia: sin choques
  (la misma pieza saliendo de la misma casilla hacia dos destinos, que también cubre O-O frente a
  O-O-O) y cada par debe coincidir en al menos la mitad de las partidas del menos jugado. Como mucho
  5 flechas, numeradas por la jugada típica.
- **Vista** (`PlansPanel.tsx`): bando, ventana (3, 4, 6 u 8 jugadas), umbral (10, 20, 30 o 50 %),
  «Mostrar en el tablero» y «Ocultar capturas»; las preferencias se guardan y el bando va por
  pestaña. Cada fila: paso del plan, jugada típica, movimiento (`Ng1-f3`, `Bb4×c3` si suele
  capturar), partidas, barra, porcentaje y diferencia de puntuación (solo con 30 partidas con
  rating). Al desplegarla: «se juega junto a…». Pasar el ratón resalta la flecha (o la añade en
  amarillo si no es del plan).
- **Flechas** por `overlayShapes` del tablero de análisis, desde un átomo por pestaña que la vista
  limpia al cerrarse.
- La línea de estado muestra «calculado en N s», para medir con la base real sin otra herramienta.

**Cambios frente a la propuesta:** no hay plan B (con un plan dominante salía casi igual al A); el
tooltip que explicaría por qué Planes está deshabilitado con Lichess no está, porque el control
segmentado no lo permite en una opción deshabilitada.

**Medición del autor (2026-11-18), posición inicial con su base grande:** 0,8 s con 4 jugadas y 1,0 s
con 8, leyendo la muestra de 100.000. El tope se mantiene: duplicarlo duplicaría la espera, y con
100.000 partidas el margen de error de un porcentaje ya es de unas décimas de punto.

## Segunda entrega (2026-11-18)

- **Informe de aperturas (versión 6):** sección «Planes típicos», con una tabla por bando: jugada
  típica, movimiento, porcentaje de las partidas del bando y rendimiento frente al Elo. Se calcula
  al generar el informe, en el mismo recorrido, sobre la misma muestra de hasta 100.000 partidas y
  con una ventana fija de 4 jugadas. Rust guarda **celdas por movimiento, año y franja Elo** (y las
  del propio bando, que son la base de cada porcentaje), como ya hacía con las continuaciones, así
  que los filtros de franja y periodo también se aplican a los planes. Se guardan los 16
  movimientos más jugados por bando; la vista muestra los 8 primeros que llegan al 10 % con el
  filtro elegido. La exportación HTML incluye la tabla sin filtrar. Los informes guardados antes no
  tienen planes y lo dicen.
- **Planes por estructura de peones:** la vista Planes del panel se habilita también con «Buscar por
  → Estructura de peones». Los peones conservan su casilla de origen; las piezas se cuentan por su
  destino (`N→f3`), porque en cada partida están en otro sitio, y se dibujan como círculos
  numerados. Dos destinos de la misma pieza no se consideran incompatibles. La búsqueda por patrón
  sigue sin planes.

Origen: una app parecida a Onyx que alguien compartió en un grupo de Telegram (pestaña **Plans**), y
la imagen promocional del **Plans Explorer** de ChessBase 27 («planes típicos de partidas de
maestros, cada uno con su puntuación»). Lo que sigue sobre cómo funcionan es una **inferencia a
partir de capturas**, no algo comprobado.

## Qué es

El explorador responde «¿qué se juega ahora?». Planes responde **«¿qué hace este bando en las
próximas jugadas, en cualquier orden?»**. Ejemplo, tras 1.e4 e5 2.Nc3 Nc6 3.Bc4 Nf6 en la base de
referencia: las blancas juegan d2-d3 en el 91 % de las partidas dentro de sus 4 próximas jugadas,
Ng1-f3 en el 46 %, f2-f4 en el 32 % y O-O en el 29 %. En el tablero, flechas numeradas por el orden
típico: 1 d3, 2 f4, 3 Nf3, 4 O-O.

Lo que sabemos de las referencias:

- **App de Telegram:** base, bando («White's pieces»), ventana («4 moves»), umbral («20%+») y
  «Show on board». Cada fila: número de jugada típico, movimiento con casilla de origen
  (`Ng1-f3`), partidas y porcentaje. Hay 5 filas y solo 4 flechas: Nf3 y Ne2 mueven el mismo
  caballo, así que el plan dibujado elige uno.
- **ChessBase 27:** flechas con una puntuación relativa (+6 %, −10 %), es decir, cuánto mejor o peor
  puntúan las partidas con ese movimiento que la media.

## Por qué cabe bien en Onyx

La búsqueda por posición ya deja lo necesario (`src-tauri/src/db/position_query.rs`):

- El snapshot de la consulta guarda, por cada partida encontrada, un `MatchRecord` con `id`, `ply`
  (dónde aparece la posición) e `index_offset` (su entrada en el índice de búsqueda).
- La entrada del índice (`SearchGameEntryRef`) trae las jugadas codificadas, el resultado, los Elo
  y la fecha.
- El informe de aperturas (`src-tauri/src/db/opening_report.rs`) ya recorre todos los registros del
  snapshot por lotes, con cancelación, progreso y límite de tiempo, y ya sabe reproducir una
  partida hasta su `ply` (`continuation_after_match`).

Planes es **otra suma sobre ese mismo recorrido**: no hace falta otra consulta a la base ni un
índice nuevo. Las transposiciones ya están cubiertas porque el snapshot es por posición, no por
orden de jugadas.

## Cálculo (Rust)

Comando nuevo, junto al informe: `position_plans(token, options, tab_id) -> PositionPlans`.

```text
options = { side: "white" | "black", window: 3..8 (por defecto 4), min_share: 0.10..0.50 (0.20) }
```

Por cada partida del snapshot:

1. Reproducir hasta `record.ply` (como `continuation_after_match`).
2. Leer las siguientes `2 × window` medias jugadas y quedarse con las del bando elegido (como mucho
   `window`).
3. Convertir cada una en una **clave de movimiento**: pieza + origen + destino (`N g1 f3`).
   Enroques como `O-O` / `O-O-O`; promoción con la pieza (`e7-e8=Q`). Una clave **cuenta una sola
   vez por partida**.
4. Acumular por clave: partidas, suma de la jugada en que aparece (para el número típico), resultados
   desde el bando elegido y la puntuación esperada por Elo (`expected_white_score`, que ya existe).
5. Las partidas que terminan antes de mover el bando elegido no entran en el denominador.

Al final:

- **Movimientos:** los que superan `min_share`, ordenados por frecuencia. Como mucho unos 12.
- **Co-apariciones:** para esos movimientos, cuántas partidas tienen cada par. Son unos 12 × 12
  contadores, así que es barato. Sirve para que el plan no mezcle dos ideas distintas y para
  enseñar «se juega junto a…».
- **Plan dibujado (voraz):** se recorren los movimientos por frecuencia y se añade uno si no choca
  con los ya elegidos (la misma pieza no puede salir de la misma casilla hacia dos destinos) y
  aparece junto a los ya elegidos en al menos la mitad de sus partidas. Como mucho 5 flechas,
  numeradas por la jugada típica media. Un **plan B** repite el proceso sin el primer movimiento
  del plan A; solo se muestra si tiene muestra suficiente.
- **Puntuación:** se muestra solo con muestra suficiente (la misma regla que la tendencia). Ver la
  decisión 2.

Rendimiento y límites:

- El coste nuevo es reproducir cada partida hasta su `ply`, unos 10–40 movimientos por partida en
  aperturas. Para decenas de miles de partidas debería ir en menos de un segundo. Para posiciones
  muy amplias (cientos de miles) hay que **medirlo** antes de decidir un tope. Si hace falta, se usa
  la misma selección determinista que la teoría del informe (Elo medio más alto, luego más reciente)
  y la interfaz lo dice («calculado sobre N partidas»).
- La cancelación, el progreso y el límite de tiempo siguen el patrón del informe.
- La caché va en el snapshot, como el informe (`Mutex<Option<…>>`), por clave `(side, window)`. El
  umbral se aplica en la interfaz, así que cambiarlo no recalcula nada.

```text
PositionPlans {
  games: u32,              // partidas que continúan con el bando elegido
  sampled: Option<u32>,    // si se usó una selección, cuántas
  baseline_score: f64,     // puntuación media del bando en el universo
  moves: [ { key, san_from_to, piece, from, to, games, share, typical_move, score, expected, co: [u32] } ],
  plans: [ { moves: [index], games } ],   // A y, si hay muestra, B
}
```

## Interfaz

**Panel de base de datos:** una cuarta vista, **Jugadas | Partidas | Planes | Informe**.

- Solo con fuente local y búsqueda por posición exacta. Con Lichess está deshabilitada y el tooltip
  explica por qué: su API no da las partidas completas de una posición. Con patrón también.
- Controles en una fila: bando (por defecto, el que mueve), ventana, umbral y «Mostrar en el
  tablero».
- Lista: `4. d2-d3 · 13.004 · ███ 91 % · +3 %`. Al desplegar una fila se ve «se juega junto a: Nf3
  (60 %), O-O (55 %)», sacado de las co-apariciones.
- Flechas numeradas con las etiquetas de chessground (`label`, ya soportado en la versión 10.1.1),
  con el color del bando. Al pasar el ratón por una fila se resalta su flecha. Van por la ruta
  existente de `overlayShapes` del tablero, desde un átomo por pestaña que solo se llena mientras la
  vista Planes está abierta.
- Un clic en una fila **no** juega nada en el tablero: el movimiento no tiene por qué ser la jugada
  siguiente.

**Informe de aperturas, segunda entrega:** una sección «Planes típicos» para los dos bandos,
calculada al generar el informe y con sus filtros de franja Elo y periodo. Los filtros piden guardar
los contadores por franja y año, como ya se hace con las continuaciones (`top_move_breakdown`), y por
eso no van en la primera entrega. La exportación HTML puede incluir la lista sin diagrama.

## Riesgos y cómo se tratan

- **Movimientos obvios arriba** (recapturas, d3 en el 91 %). Es información correcta, pero puede
  tapar lo interesante. Las capturas se marcan y hay un interruptor para ocultarlas.
- **La puntuación tiene sesgo:** los jugadores fuertes eligen ciertos planes y además ganan más.
  Comparar contra lo esperado por Elo lo reduce. En cualquier caso es una correlación, no una causa,
  y el tooltip lo dice.
- **Muestras pequeñas:** sin puntuación por debajo del mínimo, y la lista indica sobre cuántas
  partidas se calculó.
- **Posiciones muy amplias:** tope y selección explícita, nunca un cálculo que se cuelgue.

## Fuera de esta propuesta

- **Planes por estructura de peones.** Las jugadas de peón comparan bien entre partidas con la misma
  estructura; las de pieza habría que agruparlas por destino (`N→f3`). Es una buena segunda versión
  y enlaza con las estructuras de 9.3.
- **Fuentes de Lichess y Rival:** no hay partidas completas por posición.
- **Colorear piezas con la evaluación de Stockfish 11** y los **diagramas abstractos de libro**: se
  comentaron y quedan descartados por ahora. El primero da un color sin explicación; el segundo
  necesita saber qué rutas importan, que es justo lo que Planes daría. Un modo «ver la estructura»
  con las flechas de Planes encima sería su versión barata, más adelante.

## Pruebas

- **Rust, con partidas sintéticas:** una vez por partida, ventana y bando, enroque y promoción,
  partidas que terminan antes, conflicto de la misma pieza, plan voraz y orden, co-apariciones,
  cancelación y caducidad del snapshot.
- **Medición con la base real del autor**, en tandas cortas y avisando antes de la duración:
  posición inicial (el peor caso), 1.e4 e5 2.Nc3 y una posición rara. Se mide el tiempo y si hace
  falta tope.
- **Interfaz:** vista deshabilitada según la fuente y el modo, flechas con etiquetas, umbral sin
  recálculo.

## Pendiente

- Prueba del autor de la segunda entrega: el informe tarda un poco más (el recorrido de planes suma
  alrededor de un segundo en posiciones amplias).
- Ideas para después, sin decidir: un modo «ver la estructura» en el tablero con las flechas de
  Planes, y planes del informe con mini diagrama en la exportación.
