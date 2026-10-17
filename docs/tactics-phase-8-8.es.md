# Fase 8.8 — Táctica: modos y sets

Fecha de implementación: 16 de octubre de 2026. Ideas del estudio de mercado: I-05 (modos de
sesión), I-06 (repaso espaciado y Elo táctico local), I-20 (constructor de sets desde la base de
puzzles) e I-38 (visualización a ciegas y sin piezas), más tres peticiones del autor sobre el
entrenador de puzzles de Lichess.

## Peticiones del autor

### Calidad de los puzzles de Lichess

La base de Lichess sí trae señales de calidad: **popularidad** (de −100 a 100, calculada con los
votos «me gusta / no me gusta» de los jugadores) y **número de intentos** (pocos intentos = rating
todavía inestable). En la base instalada del autor (5,75 M puzzles): popularidad media 86, un 3 %
por debajo de 50 y un 12 % con menos de 50 intentos.

Filtro **Calidad** en el entrenador y en el constructor:

| Opción                       | Regla                             |
| ---------------------------- | --------------------------------- |
| Todos                        | sin filtro                        |
| Bien valorados (por defecto) | popularidad ≥ 70 y ≥ 50 intentos  |
| Los mejor valorados          | popularidad ≥ 90 y ≥ 300 intentos |

### Varios temas a la vez

Los temas son ahora una **selección múltiple** con **«Cualquiera (mezcla)»** o **«Todos a la
vez»**. Por defecto, mezcla.

### Excluir temas

Además de los temas a incluir, **«Excluir temas»** deja fuera los puzzles que tengan cualquiera de
los elegidos (en el entrenador y en el constructor de sets). La exclusión manda sobre la inclusión;
en Rust se comprueba sobre cada tanda candidata con el índice de temas, sin cambiar la velocidad del
muestreo.

### Notación contraída

En el entrenador de puzzles la notación empieza **contraída**; el historial de la sesión pasó al
panel principal. Si el usuario la abre o la cierra, su elección se respeta
(`rightColumnLayout.collapseChosen`); las demás pantallas no cambian.

### Muestreo rápido (Rust)

`ORDER BY RANDOM()` leía todas las filas del rango de rating: con filtros de calidad, **~6,6 s** por
cada tanda de 20 puzzles. El muestreo nuevo (`puzzle.rs`) salta a un id aleatorio (de la tabla o del
índice de un tema) y toma el primer puzzle que cumple el filtro: **~17 ms** sin temas y **~50 ms**
con tres temas en la base real. Con «todos a la vez» se recorre el tema más pequeño y se comprueban
los demás. Comandos: `get_puzzle(file, filter)` y `sample_puzzles(file, filter, count, exclude)`.

## Modos de sesión (I-05)

En el entrenador de puzzles, selector **Libre · Tormenta · Racha · Contrarreloj**
(`puzzles/PuzzleModePanel.tsx`, lógica en `utils/puzzleSession.ts`):

- **Libre:** como antes; el primer intento cuenta para el Elo táctico.
- **Tormenta:** reloj global (3 o 5 min), dificultad creciente (+40 por puzzle resuelto desde tu
  Elo − 300) y cada fallo cuesta 10 s. Resumen con resueltos, mejor combo, el más difícil y mejor
  resultado guardado.
- **Racha:** 1–3 vidas, dificultad creciente (+60 desde tu Elo − 200); se guarda la mejor racha.
- **Contrarreloj:** el mismo tiempo para cada puzzle (15 s – 2 min); agotarlo es fallo.
- **Profundidad:** filtro **Longitud de la solución** (corta 1–2, media 3, larga 4+ jugadas
  propias).
- **Jugadas candidatas:** opción del entrenador; la primera jugada se elige entre la solución y
  tres señuelos que un humano jugaría: **Maia al rating del puzzle** si está instalada (su proceso
  se mantiene vivo entre puzzles) y, si no, las siguientes mejores de Stockfish. Un señuelo nunca es
  mate.

Tormenta y racha no puntúan el Elo (suben a propósito) y desactivan pistas y solución.

## Repaso espaciado y Elo táctico (I-06)

- **Elo táctico local:** Glicko-2 contra el rating y la desviación de cada puzzle, solo el primer
  intento y solo en libre y contrarreloj (`utils/tacticsRating.ts`). Desviación mínima 50 para que
  siga moviéndose; provisional mientras supere 110. «Mi nivel» ajusta la banda a ±150.
- **Repaso de tácticas falladas:** los puzzles fallados del entrenador y los ejercicios fallados de
  los sets (con solución preparada) entran en una cola FSRS (`utils/tacticsReview.ts`). Primer
  intento = «Good», con pista o tras fallar = «Hard», fallo o ver la solución = «Again». Cada
  elemento guarda su posición y solución, así que sobrevive al borrado de su set. Se puede
  desactivar «Añadir fallos».
- **Persistencia:** archivo propio `tactics-review-v1.json`, leído bajo demanda (no al arrancar),
  escritura atómica y con espera, y archivo inválido apartado, como `mistake-queue-v1.json`.
- En **Entrenamiento → Táctica**, dos tarjetas arriba: **Elo táctico** con tendencia (últimos 60) y
  **Repaso** con pendientes, total, próximo repaso y botón **Repasar**.

## Constructor de sets (I-20)

**Táctica → Bases de puzzles instaladas → «Crear un set»** (`tactics/PuzzleSetBuilder.tsx`,
`utils/puzzleSets.ts`):

- temas (varios, mezcla o todos), banda de rating (con «Mi nivel»), calidad, longitud, **máximo de
  piezas** (para graduar la visualización sin piezas), tamaño (5–500), nombre sugerido y tipo
  (guiado o Woodpecker);
- **plantillas:** mate en 2, ataques dobles, clavadas y enfiladas, desviación y atracción,
  tranquilas y posicionales (los temas posicionales de ChessRamp), finales, defensa y «para
  visualizar» (≤ 10 piezas, soluciones cortas);
- el set es embebido: primera jugada del rival, solución preparada, temas como etiquetas y banda
  como nivel recomendado; tiene todos los modos de los sets (guiado, Woodpecker, temporizador,
  estadísticas, visualización);
- **estantería:** cada tarjeta de set muestra precisión reciente (últimos 30 intentos) y tiempo
  medio.

## Visualización (I-38)

En la sesión de cualquier set, selector **Normal · Sin piezas · A ciegas**
(`tactics/TacticsBoards.tsx`, `utils/tacticsVisualization.ts`):

- **Sin piezas:** el tablero sigue funcionando (clic en origen y destino) pero no dibuja las piezas;
  debajo, la lista de piezas por casilla con figuras (♔g1 ♕f3…), que se actualiza con cada jugada.
- **A ciegas:** muestra una posición anterior, lista las jugadas ocultas con su número y pide la
  jugada en la posición real con un buscador de jugadas legales. Al acertar se ve la posición real
  y se sigue en el tablero. Disponible cuando el ejercicio sabe qué llevó a la posición:
  - puzzles cuya primera jugada es del rival (todos los de Lichess y los sets del constructor): esa
    jugada;
  - ejercicios de Player Analysis: se lee su partida y se retroceden **N medias jugadas** (1–6).
- Cada intento guarda su visualización (`variant`), y las estadísticas del set la muestran aparte.

Además, como en Lichess, **cualquier mate cuenta como correcto** en los sets guiados aunque el
registro tenga otro.

## Estructura

`TacticsSessionV2Page.tsx` bajó de 1.429 a ~1.250 líneas: los tableros guiado y de motor pasaron a
`tactics/TacticsBoards.tsx`, que reutiliza el repaso.

## Pruebas

`utils/tacticsProgress.test.ts` (filtro, tormenta, racha, Glicko-2, repaso FSRS, mejores
resultados, visualización a ciegas), `puzzle.rs` (calidad, longitud y piezas) y
`rightColumnLayout.test.ts` (notación contraída). Validación manual pendiente.
