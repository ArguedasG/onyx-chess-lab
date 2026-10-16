# Fase 8.5 — Generador de repertorios y buscador de sorpresas

Fecha de implementación: 15 de octubre de 2026. Ideas del estudio de mercado: I-40 e I-33 (como
criterio «difícil para el rival»), más el **buscador de sorpresas** inspirado en el
[Novelty Grinder de Matthew Sadler](https://matthewsadler.me.uk/openings/the-mrbdzz-novelty-grinder/),
añadido por el autor a esta fase.

## Dónde está

Menú de acciones del tablero (los tres puntos junto al tablero):

- **Generar repertorio desde aquí:** desde la posición visible.
- **Buscar sorpresas en esta línea:** a lo largo de la línea del tablero (la rama actual hasta su
  final).

Ambos abren el mismo modal con dos modos. Nada se guarda hasta pulsar **Crear repertorio** o abrir el
resultado en una pestaña nueva; la partida del tablero nunca se modifica. Los ajustes se recuerdan
(`repertoire-generator-v1`).

## Generador de repertorios (I-40)

Una jugada propia en cada posición, elegida por el **enfoque** y siempre comprobada con el motor, y
las respuestas probables del rival, hasta la profundidad pedida.

### Fuentes de estadísticas

- **Jugadores de Lichess** por grupos de rating y ritmos, y **Lichess Masters**: una petición del
  explorador por posición (cola única, caché y reintento ante `429`, como el resto de Onyx; necesita
  una cuenta de Lichess conectada con inicio de sesión). Se piden hasta 50 jugadas por posición para
  no tomar por inexistente una jugada rara.
- **Base local** con Elo mínimo y años: una consulta de posición (la de 7.0) y **un solo recorrido**
  de las partidas que pasan por ella (`get_position_tree`). Cada partida se decodifica una vez hasta
  la profundidad pedida; las posiciones se unen por hash Zobrist, así que las transposiciones dentro
  del árbol comparten nodo. Si hay más de 200.000 partidas se leen las 200.000 de mayor Elo medio y
  la procedencia lo indica. Cada jugada guarda resultados, rating par (puntos frente a lo esperado
  por Elo del bando que la juega) y su partida de mayor Elo como partida modelo. Solo cuentan las
  partidas que pasaron por la posición de partida.

### Enfoques para mis jugadas

Solo compiten las jugadas que el motor deja a como mucho **N centipeones** de su mejor jugada (30 por
defecto, como el «Top Move Deviation» de qchess) y, salvo en sorpresas, con al menos **N partidas**
(30 por defecto). Las puntuaciones son **prudentes**: se usa el límite del intervalo de Wilson (90 %),
de modo que 30 partidas al 65 % no ganan a 3.000 al 58 %.

| Enfoque                 | Elige                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Mejor resultado práctico | Mayor rating par menos su incertidumbre (base local con ratings); si no, puntuación prudente |
| Mejor puntuación        | Mayor límite inferior de la puntuación (tablas = medio punto)                             |
| Menos derrotas          | Menor límite superior de la proporción de derrotas                                        |
| Menos teoría            | Menos respuestas del rival necesarias para cubrir el 80 % de sus partidas                 |
| Más fiel al motor       | La mejor del motor entre las jugadas con partidas suficientes                             |
| Difícil para el rival   | La jugada tras la que un rival del Elo elegido tiene menos probabilidad de acertar (I-33) |
| Sorpresas               | Entre las jugadas con como mucho 5 % de las partidas, la más difícil para el rival        |

Cuando la fuente no tiene partidas suficientes en una posición, se juega la mejor del motor y la línea
lo indica («Motor»). En sorpresas, fuera del libro de la fuente tampoco hay sorpresa posible.

### Respuestas del rival

- **Las más jugadas:** hasta N respuestas (3) con al menos un porcentaje (10 %) de las partidas.
- **Lo que predice Maia** al Elo elegido, con los mismos límites.
- Si la fuente no tiene partidas en una posición, se usa Maia cuando está instalada; si no, la línea
  termina ahí.

### Dificultad práctica (I-33)

Probabilidad de que un jugador del Elo elegido **mantenga la evaluación**: jugadas que pierden como
mucho 5 puntos de probabilidad de ganar frente a la mejor (Stockfish, 5 líneas), sumadas por la
frecuencia con que las juega ese nivel. La frecuencia sale de las **partidas** de la fuente si la
posición tiene 50 o más, y si no de **Maia**. Las jugadas fuera de las 5 líneas cuentan como fallo (es
la estimación más prudente para el usuario). Escala: fácil (≥ 75 %), exigente (45–75 %) y trampa
(< 45 %).

Maia no publica por UCI las probabilidades de sus jugadas, solo su orden. Onyx las estima pidiéndole
16 jugadas por posición con muestreo (`Temperature` 1, `TopP` 1): resolución de ~6 puntos, unos
1,6 s por posición con Maia 3 5M en CPU. El proceso de Maia (≈10 s en arrancar) se mantiene vivo
durante toda la generación y se cierra al terminar (`sample_engine_moves` / `close_engine_sampler`).

### Salida

- Vista previa del árbol: mis jugadas en negrita con partidas, puntuación y evaluación; las del rival
  con su porcentaje; insignias de sorpresa, motor, dificultad y transposición.
- **Crear repertorio:** PGN fuente inmutable con procedencia y repertorio editable en Entrenamiento →
  Aperturas (el mismo proceso que las copias de Estudios en 8.0), listo para el modo Aprender.
- **Abrir en el tablero:** el PGN en una pestaña nueva, para revisarlo o **añadir solo esa rama** a un
  repertorio existente con «Añadir al repertorio» (la vista previa de 6.A conserva el resto de
  ediciones). Así se regenera una rama sin tocar las demás.

Anotaciones: comentario con partidas, puntuación, rating par y evaluación en cada jugada propia;
porcentaje en las del rival; glifo `?!`/`?` si una jugada propia pierde 50/100 cp o más; **símbolo
de valoración** (=, ⩲, ±, +−…) al final de cada línea; aviso de transposición; **partida modelo**
enlazada con `onyx://game` (base local, abierta en la jugada exacta) o con su URL de Lichess, y un
comentario inicial con fuente, filtros, fecha, enfoque, rival, motor y límites.

## Buscador de sorpresas (Novelty Grinder)

Como en el script de Sadler: recorre la línea **desde la jugada 4**, **se detiene cuando la posición
tiene menos de 40 partidas** en la fuente y toma las jugadas que el motor mantiene cerca de su mejor
(25 cp por defecto) y que se juegan en **como mucho el 5 %** de las partidas (o nunca). Por defecto
solo mira las jugadas del bando que juego.

Diferencias con el original, como sugirió el autor:

- en vez del contempt de Leela (lento en CPU), Stockfish verifica la jugada y las sorpresas se
  **ordenan por la dificultad práctica para el rival** (I-33), con Maia o con las partidas;
- funciona con Lichess, Masters o una base local;
- la tabla dice qué jugada de la línea reemplaza cada sorpresa, si no tiene partidas o cuántas
  tiene, la evaluación y la dificultad. Cada una se abre en el tablero, y **Abrir la línea anotada**
  crea el PGN con todas como variantes y las flechas de Sadler: **roja** si no hay partidas en la
  fuente, **verde** si es rara.

## Motores

`evaluate_positions` reutiliza el analizador por lotes de 8.2: un proceso, presupuesto de motores,
caché persistente de evaluaciones (ahora con el número de líneas en la clave, que antes era siempre
2) y cancelación con `cancel_analysis`. Una posición sin jugadas se envía con su propio FEN.

## Rendimiento medido (i5-1135G7, compilación release)

| Operación                                                   | Resultado                       |
| ----------------------------------------------------------- | ------------------------------- |
| Árbol local de la Gigabase desde la posición inicial        | 200.000 partidas × 12 medias jugadas: 22.544 posiciones en 1,7 s (+0,7 s de selección) |
| Maia 3 5M: arranque                                         | ≈ 10 s, una vez por generación  |
| Maia 3 5M: una muestra                                      | ≈ 0,1 s (16 por posición)       |

## Fuera de alcance

- Jugadas prohibidas durante N jugadas y comentarios automáticos de planes (no hay reglas
  verificables, decisión vigente sobre evidencia).
- Contra un rival concreto (I-41) y desde su ficha: 8.6.

## Validación

- Rust: árbol con transposiciones y poda (`position_tree`), medición ignorada con una base real.
- Frontend: `utils/repertoireGenerator/generator.test.ts` (intervalos prudentes, rating par, menos
  teoría, respuestas populares, dificultad práctica, enroque en UCI, rechazo por motor, respuestas de
  Maia, sorpresas con parada por libro y flechas, PGN válido).
- Validación manual nativa: pendiente.
