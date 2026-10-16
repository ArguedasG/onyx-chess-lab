# Fase 8.4 — Jugadores: ficha y estadísticas

Fecha de implementación: 15 de octubre de 2026. Ideas del estudio de mercado: I-02, I-03
(consulta puntual), I-13, I-22, I-30, I-42, I-44 e I-45. Modifica la antigua 8.2.

## Sección «Jugadores»

Nueva entrada de la barra lateral (`/players`), separada de «Cuentas», que queda solo para conectar
Lichess y Chess.com (ahí un aviso lleva a la ficha propia).

- **Columna izquierda:** búsqueda de jugadores en **todas** las bases locales (tokens normalizados de
  I-01, seis resultados por base, ordenados por partidas) y fichas agrupadas: _Mis cuentas_
  (derivadas de las cuentas conectadas), _Yo (otras fuentes)_, _Rivales_, _Alumnos_ y _Otros_.
- **Ficha:** la misma vista para el usuario, un rival o un alumno (I-02). Un resultado de búsqueda se
  ve completo sin guardarlo y se guarda con **Guardar ficha** (nombre, tipo y notas).
- **Bases de datos → Jugadores** muestra la misma ficha. Si una ficha guardada ya contiene ese
  registro, se muestra esa (con sus alias); si no, se puede guardar desde ahí.

Persistencia: `player-cards-v1` (almacenamiento local, pequeño: fichas, fuentes, FIDE y notas). Las
partidas nunca se copian; se leen de sus bases cada vez.

### Fuentes, alias e identidad

Una ficha agrupa registros de jugador de bases locales (`databasePath` + `playerId`). Los alias se
añaden a mano en **Ficha → Fuentes y alias**, eligiendo el registro en una base (decisión vigente:
Onyx no infiere identidades). Los alias que se añadieron antes en el panel de Player Analysis se
mueven una sola vez a su ficha, para que un alias quitado después no reaparezca.

El perfil de Player Analysis de cada ficha conserva su identificador: las fichas de cuentas usan el
mismo que la antigua tarjeta de Cuentas, y las de bases el mismo que la tarjeta de Bases de datos,
así que los perfiles y versiones guardados siguen apareciendo. Añadir alias no cambia el
identificador.

### FIDE (I-03, consulta puntual)

**Ficha → Vincular perfil FIDE** busca en la lista FIDE a través de la API de Lichess (una consulta,
con la búsqueda codificada en la URL), muestra hasta ocho candidatos con federación, año y ratings, y
el usuario confirma uno. Solo se guarda ese perfil (ID, nombre, título, federación y ratings del
momento, con su fecha). No se descargan listas FIDE ni se construye historial mensual (decisión del
autor del 2026-10-15).

## Datos: un comando por base

`get_player_games(file, playerIds)` (`src-tauri/src/db/player_games.rs`) devuelve en una llamada
todas las partidas de los registros pedidos con lo que la base no guarda:

- **apertura** nombrada desde las jugadas codificadas (las primeras 55 medias jugadas, como 8.2);
- **final en el tablero:** mate, ahogado, material insuficiente o abierto, y quién estaba en turno;
- **últimos relojes** `[%clk]` de cada bando en la línea principal (los de las variantes no cuentan);
- jugadores, Elo, fecha, hora, torneo, sitio, ritmo y número de jugadas.

Las jugadas solo se decodifican, nunca se convierten en PGN, y las partidas se procesan en paralelo.
El frontend agrupa los registros por base (una llamada por base), une los alias sin contar dos veces
una misma partida y guarda el resultado en caché SWR mientras dure la sesión.

## Pestañas de la ficha

Los filtros de la ficha (ritmo, periodo de 12 o 3 meses y color) se aplican a Resumen, Partidas,
Aperturas y Rivales. Análisis conserva sus propios filtros.

### Resumen

Cifras (partidas, puntuación, rating par y Elo actual y máximo del ritmo principal), resultados por
color y por ritmo con barra V/T/D, **evolución del rating** (último rating de cada mes, hasta cuatro
ritmos), **actividad** por meses o años, momentos destacados y hábitos.

### Momentos destacados (I-22)

Hechos de las partidas visibles, cada uno abre su partida:

| Momento                  | Definición                                                                       | Nivel     |
| ------------------------ | -------------------------------------------------------------------------------- | --------- |
| Error más costoso        | Jugada que más puntos de probabilidad de ganar perdió (antes: «jugada más cara») | Motor     |
| Mayor remontada          | Victoria (o, si no hay, tablas) desde la menor probabilidad, por debajo de 25 %  | Motor     |
| Mayor sorpresa           | Victoria con la mayor diferencia de Elo en contra                                | Sin motor |
| Rival más fuerte vencido | Victoria contra el Elo más alto                                                  | Sin motor |
| Mejor racha de victorias | Más victorias seguidas en orden de juego (al menos dos)                          | Sin motor |
| Racha actual             | Resultados iguales seguidos hasta la última partida (desde dos)                  | Sin motor |
| Mate más rápido          | Mate dado en menos jugadas, desde la posición inicial                            | Sin motor |
| Partida más larga        | Más jugadas                                                                      | Sin motor |
| Rival más difícil        | La némesis de la pestaña Rivales                                                 | Sin motor |

Los momentos de motor solo usan las partidas analizadas que están dentro de los filtros. Los
análisis anteriores a 8.4 no guardan la pérdida de probabilidad: el error más costoso usa entonces
los centipeones, y la remontada necesita volver a analizar (la caché de 8.2 lo hace rápido).

### Partidas (I-13)

Lista paginada y ordenable (fecha, rival y Elo, resultado, ritmo, apertura, jugadas y si está
analizada), búsqueda por rival, apertura o torneo, filtros por resultado y **Sin analizar**,
selección múltiple y doble clic para abrir. Acciones sobre las elegidas o, sin selección, sobre las
visibles:

- **Actualizar** (fichas con cuentas conectadas): la misma sincronización incremental de 7.3.3, que
  ahora vive en `utils/players/accountSync.ts` y comparten Cuentas y la ficha;
- **Analizar con motor:** lleva esas partidas a Análisis → Motor, que las analiza en lugar de «las
  N más recientes» y las añade a la muestra guardada (genera el perfil si no existía);
- **Añadir a un estudio** y **Exportar PGN** (hasta 500 partidas, leídas de cuatro en cuatro).

### Aperturas (I-42 con I-30)

Dos columnas, blancas y negras, en **Familia → Variante → Subvariante** plegables, cada nivel con
partidas, porcentaje del color, puntuación, rating par y barra de resultados exactos (no promedios de
promedios). Desde cada fila: ver esas partidas (abre Partidas filtrada) y abrir la línea en el
tablero.

### Rivales (I-45)

Rival más enfrentado, **némesis** y **rival favorable** (al menos 5 partidas), la lista completa
ordenable con las partidas de cada rival desplegables y, en la ficha de un rival, **Contra ti**: sus
partidas contra los registros propios (fichas de cuentas y fichas de tipo «Yo») en las mismas bases.

Némesis y favorable se ordenan por **rating par** cuando hay partidas con rating suficientes (como
mínimo 10 o todas las partidas), y si no por puntuación frente al 50 %: un rival más fuerte no es
némesis solo por ser más fuerte, que era la crítica a ChessStalker del estudio.

### Hábitos, reloj y errores (I-44)

Descripciones con su muestra, nunca diagnósticos.

Sin motor:

- **siguiente partida del mismo día** tras una derrota, una victoria o unas tablas, frente a la media,
  con rating par; la frase solo compara con 10 partidas o más;
- **cómo terminan las derrotas y las victorias:** mate, **probablemente por tiempo** y abandono u otra
  causa. La base no guarda la causa del final: una derrota sin mate, con el perdedor en turno y
  15 s o menos en su último reloj se lee como probable derrota por tiempo; las partidas por
  correspondencia nunca cuentan como tal. Se muestra cuántas tienen reloj.

Con motor (insignia «Motor · N partidas»):

- **errores y errores graves por tramo de jugadas** (1–10, 11–20, 21–30, 31–40, 41–60, 61+) por cada
  100 jugadas, con una conclusión por plantilla solo si un tramo con 60 jugadas o más supera en un
  50 % la media;
- **errores según el reloj** antes de cada jugada como parte del tiempo base (más de un tercio, entre
  10 % y un tercio, menos de 10 %) y **jugadas rápidas** (2 s o menos desde la jugada 11, solo con
  base + incremento) frente al resto;
- **derrotas en posiciones no perdidas:** derrotas sin mate ni probable tiempo cuya evaluación final
  era −1,5 o mejor para el jugador, con enlaces a las partidas.

Para esto, cada partida analizada guarda ahora (campos opcionales, sin cambiar la versión del perfil)
la probabilidad más baja y la final, las jugadas y errores por tramo y por banda de reloj, las
jugadas rápidas y la pérdida de probabilidad de cada posición crítica. Los análisis anteriores
muestran «vuelve a analizar la muestra».

## Rating par (I-30)

`utils/ratingPar.ts`: la puntuación de las partidas con ambos ratings y resultado conocido frente a
la que predice la fórmula de Elo, en puntos porcentuales y con su muestra en el tooltip. Por debajo
de 10 partidas con rating se muestra atenuado y no se interpreta. Se aplica a toda tabla de
resultados de la ficha (resumen, color, ritmo, aperturas, rivales, hábitos) y a las de Player
Analysis (por color, fuerza del rival, ritmo y aperturas), como columna «vs. esperado». Los perfiles
de Player Analysis generados antes muestran «—» hasta recalcularlos.

## Análisis

Es Player Analysis, ahora dentro de la ficha. `PlayerAnalysisPanel.tsx` (1.727 líneas) se dividió en
`components/players/analysis/`: contenedor (≈940 líneas), carga de partidas con sus cachés, secciones
Resumen, Hallazgos y Motor, y el diálogo de perspectiva. Los alias se gestionan desde la ficha.

Las pestañas de partidas abiertas desde una ficha vuelven a la misma ficha y pestaña (flecha o
cierre). Las que se abrieron desde la antigua tarjeta de Cuentas vuelven ahora a Jugadores.

## Rendimiento

- Una llamada por base con trabajo en Rust y en paralelo; la interfaz solo agrega (miles de partidas
  en milisegundos) y memoriza cada cálculo por filtros.
- Medición (`cargo test --release player_games_bench -- --ignored --nocapture`, i5-1135G7): ver la
  tabla de abajo.
- Las tablas largas están paginadas; las pestañas se montan solo al abrirlas.

| Jugador y base                      | Partidas | Tiempo | Datos enviados |
| ----------------------------------- | -------- | ------ | -------------- |
| Carlsen, Magnus · Gigabase (10,3 M) | 3.934    | 953 ms | 1,7 MB         |
| Cuenta Chess.com propia (2.564)     | 2.564    | 99 ms  | 1,0 MB         |

En la Gigabase el tiempo lo dominan las lecturas dispersas de un archivo de 3 GB; en una base de
cuenta, el trabajo completo cabe en una décima de segundo.

## Validación

- Rust: pruebas de `parse_clock` y del resumen de la línea principal (mate, turno, relojes que ignoran
  variantes, apertura); `player_games_bench` ignorada para bases reales.
- Frontend: `utils/players/players.test.ts` (rating par, fechas PGN, alias, filtros, aperturas,
  actividad, ratings, momentos, hábitos, rivales) y nuevas comprobaciones en
  `playerAnalysis.test.ts` para los campos de motor.
- Validación manual: hecha por el autor el 2026-10-15.
