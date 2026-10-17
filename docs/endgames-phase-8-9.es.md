# Fase 8.9 — Finales: evaluación por jugada

Fecha de implementación: 16 de octubre de 2026. Ideas del estudio de mercado: I-07 (veredicto y
error por jugada, el cambio principal), I-08 (familia y objetivo calculados al importar), I-09
(filtro por tema) y la parte de I-52 de **mates básicos cronometrados**.

## Dónde está

**Entrenamiento → Finales**, ahora con tres vistas: **Por tema**, **Tus sets de finales** y
**Mates básicos**. El selector **Rival de práctica** queda arriba a la derecha y se recuerda.

## El objetivo se comprueba tras cada jugada (I-07)

Un final no es un ejercicio táctico: no se pide la mejor jugada, sino **cumplir el objetivo**. Tras
cada jugada del estudiante se comprueba solo si el objetivo **sigue siendo alcanzable contra la
defensa perfecta**; si era mate en 10 y pasa a mate en 25, no hay error.

Panel nuevo en la partida (`components/boards/EndgameObjectiveWatch.tsx`, lógica pura en
`utils/endgameVerdict.ts`):

- estado discreto: «Sigue ganado / Siguen siendo tablas», con la fuente (**Tablebase** o
  **Motor**), o «Comprobando tu jugada…» mientras tanto;
- si el objetivo deja de ser alcanzable: aviso con **«Reintentar desde la jugada N»** (vuelve a la
  última posición verificada, sin partida nueva) y **«Seguir jugando»** (el aviso se cierra y no
  vuelve salvo que el objetivo se recupere y se pierda otra vez). Si el rival práctico se equivoca y
  el objetivo vuelve a ser alcanzable, el aviso desaparece solo;
- botón **Veredicto**: resultado teórico de la posición actual (tablebase con mate en N, o
  «Probablemente…» con la evaluación del motor);
- al terminar una partida fallida con objetivo perdido, **«Reintentar desde la jugada N»** en la
  pantalla de resultado.

### Cómo se decide

| Piezas | Fuente    | Regla                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≤ 7    | Tablebase | Exacto. «cursed-win» y «blessed-loss» cuentan como tablas (la regla de los 50 movimientos cuenta); las categorías «maybe-» no deciden nada.                                                                                                                                                                                                                                 |
| > 7    | Stockfish | Ganar sigue siendo alcanzable con +0,70 o más para el estudiante; tablas, con −1,50 o más. Si el motor ya veía la posición inicial cerca del umbral, el umbral baja a la evaluación inicial − 1,50 (no ve claro ese final y solo cuenta una caída clara). Un aviso de motor exige **dos lecturas seguidas** por debajo, salvo mate o una caída de 1,50 más allá del umbral. |

El lenguaje es prudente cuando decide el motor («Probablemente ya no se puede ganar»).

### Rendimiento (petición del autor)

El tablero nunca espera a la comprobación:

- con **Mejor defensa** (rival por defecto) la comprobación es **gratis**: con 7 piezas o menos el
  rival juega la mejor jugada de la tablebase de Lichess desde Rust y devuelve la categoría de la
  posición; con más piezas, cada respuesta de Stockfish trae la evaluación de su propia búsqueda
  (`GameMove.engineEval`, leída de las líneas `info` que ya producía). No se lanza ningún motor
  más. Sin conexión, la tablebase se sustituye por Stockfish;
- con **Práctico · Maia** (opción) la evaluación de Maia no sirve: Onyx consulta la tablebase o una
  búsqueda corta de Stockfish (0,7 s, un hilo, 32 MB), **una a la vez y siempre de la posición más
  nueva**: si el estudiante juega rápido, la comprobación anterior se descarta, como proponía el
  autor. Puede llegar una jugada más tarde, y el reintento vuelve igualmente a la última posición
  verificada;
- la evaluación de la posición inicial (para el umbral) se hace una vez, mientras el estudiante
  piensa su primera jugada.

Nada de esto se activa fuera de Finales: el panel solo existe en partidas de entrenamiento de
finales, y la defensa con tablebase solo se envía al motor de partidas en ese caso aunque el ajuste
quede guardado.

### Cambios en el motor de partidas (Rust)

- `PlayerConfig::Engine.tablebaseDefense`: con ≤ 7 piezas y sin enroques, pide la jugada a
  `tablebase.lichess.org` (4 s de espera máxima) antes de buscar.
- `GameMove.engineEval` y `GameMove.tablebaseCategory`.
- Comando `rewind_game(gameId, ply)`: vuelve a la posición tras `ply` jugadas (nunca antes de las
  jugadas iniciales) y avisa al motor si le toca.

## Importación de finales (I-08)

La importación ahora pasa por una **vista previa** (`endgames/EndgameImportModal.tsx`,
`utils/endgameImport.ts`):

- cada posición muestra su **familia de material calculada desde la posición** (no desde el
  título, que en los libros no es fiable), sus piezas, el capítulo del PGN y el objetivo escrito en
  él si lo hay;
- **Organizar como:** **un set**, **por tema** (un set por familia) o **por capítulo** (`ChapterName`
  o `Event`; solo se ofrece si agrupa varias posiciones);
- **Destino:** set nuevo o **añadir a un set existente**;
- casillas para excluir posiciones;
- **Calcular objetivos después de importar** (activado): tablebase hasta 7 piezas y Stockfish por
  encima (1,5 s, un hilo); entre una ventaja clara y unas tablas claras el motor no decide. Un
  objetivo escrito en el PGN **no se sobrescribe**: si el cálculo no coincide, la posición muestra
  «Usar …» con la explicación, y el set cuenta cuántas no coinciden. El cálculo se puede detener.

## Filtro por tema (I-09)

La vista **Por tema** cubre el contenido incluido y el importado: chips de familia con su número de
posiciones y, si hay contenido propio, un filtro **Todo / Incluidos / Importados**. Sin filtros de
dificultad ni de obra, como decidió el autor.

## Mates básicos cronometrados (I-52)

Dama, torre, dos alfiles y alfil y caballo contra rey (`utils/basicMates.ts`):

- **una posición al azar cada vez**, legal, con blancas a mover, el rey solo lejos del borde, sin
  piezas propias junto a él y alfiles de colores distintos;
- reloj solo para el estudiante (60 s, 2, 3 y 5 min por defecto; de 30 s a 10 min), rival con la
  mejor defensa y regla de los 50 movimientos;
- resultado con el tiempo, **mejor tiempo** y aciertos por tipo (`endgames.basicMates`, campo
  opcional de los datos de entrenamiento), y **«Otra posición»**.

## Datos

Todos los cambios del esquema son campos opcionales (`computedObjective`, `computedSource`,
`basicMates`): no cambia la versión del archivo de entrenamiento ni hace falta migración. Las
importaciones nuevas calculan la familia desde la posición; el contenido incluido conserva la suya.

## Pruebas

`utils/endgameVerdict.test.ts` (categorías de la tablebase, umbrales del motor, confirmación,
respuestas tardías, reintento) y `utils/endgameImport.test.ts` (familias, agrupación, añadir a un
set, conflicto de objetivos, generador de mates y mejor tiempo). Validación manual pendiente.
