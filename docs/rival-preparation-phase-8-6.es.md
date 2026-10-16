# Fase 8.6 — Preparación contra rivales

Fecha de implementación: 16 de octubre de 2026. Modifica la antigua 8.2. Ideas del estudio de
mercado: I-19, I-31 (ocho estructuras), I-32, I-33, I-41, I-43 (gemelo, versión 1) e I-04 (solo
retransmisiones para rivales). Completa también lo que 8.5 dejó para aquí: el generador y el
buscador de sorpresas **contra un rival concreto y desde su ficha**.

## Dónde está

**Jugadores → ficha → pestaña Preparación.** Sirve para cualquier ficha:

- **Rival, alumno u otro:** Cómo jugarle, Repertorio probable, Posiciones clave, Estructuras,
  Contra mi repertorio y Bot gemelo; abajo, **Líneas contra este rival**, **Sorpresas contra este
  rival** y **Exportar preparación (PGN)**.
- **Ficha propia (tipo «Yo» o cuentas):** las mismas herramientas apuntadas a las partidas propias
  (sin «Cómo jugarle»): repertorio contra realidad, dónde suelo equivocarme, estructuras y el
  generador desde cualquier posición del árbol propio.

Los filtros de la ficha (ritmo, periodo, color) se aplican también aquí, y hay uno nuevo para toda
la ficha: **últimas N partidas** (20, 50, 100, 200 o 500), que pedía la definición de 8.6.

## Fuentes de partidas del rival

**Ficha → Ficha (menú) → Añadir partidas (cuenta, PGN, retransmisiones)**, en fichas guardadas.
Cada fuente termina en una base local y el usuario elige qué registro de esa base es el rival (la
regla vigente: Onyx no infiere identidades). La preparación no depende de una base de referencia.

- **Cuenta de Lichess o Chess.com:** la misma descarga incremental de 7.3.3
  (`syncAccountGames`), ahora para cualquier usuario, no solo para las cuentas conectadas.
- **Archivo PGN:** se convierte a una base con el nombre del archivo.
- **Retransmisiones de Lichess (I-04, parte de rivales):** ver abajo.

### I-04: qué se hizo y qué queda para la Fase 10

La decisión del 2026-10-15 lleva el **catálogo propio de descargas y las bases alojadas** a la
Fase 10. Lo que sí cabe en 8.6 sin ese catálogo, y es lo que la preparación de rivales OTB
necesita, es la descarga **bajo demanda**:

- búsqueda de torneos en la API pública de retransmisiones de Lichess (`/api/broadcast/search`)
  por nombre, país o ciudad; cada resultado muestra lugar, ritmo y fechas;
- descarga de todas las rondas de los torneos elegidos (`/api/broadcast/{id}.pgn`) a una base
  local **«Lichess broadcasts»**;
- duplicados exactos eliminados tras cada importación (`delete_duplicated_games`), para que volver
  a importar un torneo no duplique sus partidas terminadas, y registro de qué torneos se
  importaron y cuándo (`broadcast-imports-v1`), visible como «Importado»;
- licencia: las retransmisiones de Lichess son CC BY-SA; la descripción de la base lo indica y
  cada partida conserva su torneo y lugar.

Verificado el 2026-10-16: la búsqueda «costa rica» devuelve los campeonatos nacionales por
categorías, y su PGN trae `WhiteFideId`/`BlackFideId`, ritmo y relojes.

**Queda para la Fase 10 (pipeline completo de I-04):** la descarga mensual completa de
`database.lichess.org`, la actualización incremental automática, la etiqueta de procedencia por
partida, la deduplicación por huella entre fuentes distintas y la entrada en el catálogo propio.
Una partida de un torneo **en curso** puede cambiar entre dos importaciones; la versión anterior
no se borra sola.

## El árbol del jugador (`get_player_tree`)

`src-tauri/src/db/player_tree.rs`. El frontend envía, por base, los ids de las partidas que pasan
los filtros de la ficha; Rust las lee de una vez (por bloques de 900 ids) y construye con el
constructor de árboles de 8.5 (`build_tree`) dos árboles desde la posición inicial: el del jugador
con blancas y con negras, hasta 20 medias jugadas. Cada jugada lleva resultados, rating par, la
**fecha de su primera y última partida** y, como partida modelo, la **más reciente** (opción nueva
`modelByRecent`; para un rival importa más lo último que jugó que la partida de mayor Elo).
Devuelve además las **secuencias de apertura** de cada partida (las 20 primeras medias jugadas,
iguales fusionadas): el libro exacto del gemelo. Las partidas desde posición propia no entran.

En el frontend (`utils/preparation/book.ts`) los árboles de varias bases (alias) se fusionan por
posición. El resultado se guarda en la caché SWR mientras dura la sesión, por ficha y filtro.

## Cómo jugarle (I-32)

`utils/preparation/howToPlay.ts`. Con blancas y con negras, las aperturas (familia, variante o
subvariante) donde el rival puntúa **al menos 5 puntos por debajo** de lo que predicen los ratings
(I-30), con **al menos 10 partidas con rating**, ordenadas por la diferencia ponderada por la
muestra (40 partidas a −8 pesan más que 10 a −9); si una familia y una de sus variantes dicen lo
mismo, queda solo la más informativa. Además: las dos líneas que **mejor le van** (mejor evitarlas),
las estructuras y los tipos de partida por debajo del par y, con análisis de motor de esas mismas
partidas, la fase con más errores (al menos 1,5 veces la media, con 60 jugadas o más), la de menos
y sus tasas de conversión y defensa (desde 5 partidas).

Veredicto por plantilla: **objetivos** («llevar la partida ahí es un plan razonable, no una
garantía»), **juega tu repertorio** si nada queda por debajo del par, o **muy pocas partidas**
(menos de 15).

**Aviso visible (pedido por el autor):** una franja discreta «Una orientación, no una certeza ·
Experimental» acompaña a «Cómo jugarle» y a las posiciones clave: resume tendencias de N partidas
pasadas; los rivales cambian, preparan sorpresas y juegan distinto en el tablero; es un punto de
partida y cada línea se comprueba. El mismo aviso abre el resumen del paquete exportado.

## Repertorio probable

Explorador del árbol del rival por color: tablero, migas de pan de la línea y, en cada posición,
sus jugadas con proporción, victorias/tablas/derrotas, puntuación y rating par **del rival**
(naranja por debajo de −5 y verde por encima de +5 con 10 partidas con rating). La insignia
**«Nueva»** marca una **desviación reciente**: una jugada jugada por primera vez en los últimos 90
días de sus partidas cuando al menos 3 partidas anteriores fueron por otro camino. Desde cualquier
posición: **Abrir en el tablero**, **Preparar líneas desde aquí** y **Sorpresas en esta línea**.

## Líneas contra el rival y sorpresas (I-41, cierre de 8.5)

El generador de 8.5 recibe ahora un **rival** (`GeneratorRival`): sus partidas, como un
`StatsSource` más (`bookSource`), sustituyen a la fuente de estadísticas.

- **Respuestas del rival:** las suyas, por frecuencia (desde 2 partidas en la posición; Maia a su
  rating donde tiene menos).
- **Mis jugadas:** las jugadas que **sus rivales** probaron contra él, elegidas por el enfoque: el
  «mejor resultado práctico» elige la que deja **su** rating par más bajo; «difícil para el rival»
  usa Maia a su rating (I-33); «sorpresas», las jugadas que el motor aprueba y que él casi nunca o
  nunca ha enfrentado. Siempre a pocos centipeones de la mejor del motor.
- **Buscador de sorpresas:** recorre su línea más jugada (o la línea elegida en el explorador y su
  continuación más jugada) y se detiene cuando él tiene menos de 2 partidas en la posición.
- Ajustes propios (`repertoire-generator-rival-v1`), para no mezclar los umbrales de un rival
  (pocas partidas) con los de Lichess o una base grande; el rating del rival se aplica solo.

## Dificultad práctica (I-33) en todos los lugares

| Lugar                                                                            | Estado                      |
| -------------------------------------------------------------------------------- | --------------------------- |
| 8.5 Generador: enfoque «difícil para el rival» y orden del buscador de sorpresas | Ya estaba (8.5); no se tocó |
| 8.6 Posiciones clave del rival                                                   | **Nuevo**                   |
| 8.6 Generador y sorpresas contra un rival, con su rating                         | **Nuevo**                   |
| 8.6 Ficha propia: «Dónde suelo equivocarme»                                      | **Nuevo**                   |
| Aperturas: «Posiciones difíciles para mí» en cada repertorio                     | **Nuevo**                   |

**Posiciones clave** (`utils/preparation/keyPositions.ts`): posiciones del árbol con el rival en
turno, desde la jugada 3, alcanzadas por al menos 3 partidas y el 4 % de sus partidas con ese
color (12 como máximo, las frecuentes primero con un plus por profundidad). Al pulsar **Medir**,
Stockfish (5 líneas, 400 ms) marca las jugadas que mantienen la evaluación (como en 8.5: a 5
puntos de probabilidad de la mejor) y la frecuencia sale **de sus propias elecciones** si tiene 8
partidas o más en la posición, o de **Maia a su rating** si no. Se muestra la probabilidad, la
escala (fácil, exigente, trampa), qué juega él y la jugada del motor con el porcentaje de veces que
la eligió. Las más bajas primero: ahí conviene llevar la partida.

**Repertorio propio** (`utils/preparation/repertoireDifficulty.ts`, botón «Posiciones difíciles
para mí» en Entrenamiento → Aperturas): las posiciones de un repertorio en las que le toca jugar
al usuario (40 como máximo, las compartidas por más líneas primero), con la probabilidad de que un
jugador de su nivel (por defecto, su rating de Lichess) mantenga la evaluación según Maia y el
motor. Marca «Revisar» cuando la jugada preparada no está entre las que mantienen la evaluación, y
cada fila abre la práctica de esa línea. Es una estimación de dificultad, no una medida de la
memoria del usuario (eso ya lo hace el FSRS).

## Repertorio contra realidad (I-19)

`utils/preparation/repertoireReality.ts`. Las líneas de teoría (no partidas modelo) de los
repertorios de Onyx de un color que empiezan en la posición inicial forman un árbol; las partidas
del árbol del jugador se recorren a lo largo de él:

- **ficha propia:** una jugada propia distinta de la preparada es una **línea olvidada**; una
  respuesta que el repertorio no contempla es una respuesta **sin cubrir** (hueco de
  preparación). Se cuentan también las partidas que llegaron al final de una línea preparada y se
  listan las **líneas estudiadas que casi no aparecen**;
- **ficha de un rival:** el mismo recorrido contra sus partidas con el otro color, mostrando solo
  sus respuestas que el repertorio del usuario no contesta (lo que hicieron sus otros rivales no
  es preparación del usuario).

Cada salida muestra la línea, la jugada, el tipo, las partidas, la puntuación y el rating par, y se
abre en el tablero, donde «Añadir al repertorio» (6.A) la incorpora.

## Estructuras de peones (I-31)

`src-tauri/src/db/pawn_structures.rs`. Las ocho del estudio, cada una con una regla sobre los
peones escrita para el bando que la «tiene», con filas contadas desde ese bando; la misma regla se
aplica a los dos colores, así que las versiones invertidas salen solas:

| Estructura           | Regla (bando que la tiene)                                                           |
| -------------------- | ------------------------------------------------------------------------------------ |
| Peón aislado de dama | Un peón d en la cuarta fila sin peones c ni e propios; el rival sin peón d           |
| Carlsbad             | d4 y e3/e2 sin peón c contra c6/c7 y d5 sin peón e (el bando del ataque de minorías) |
| Peones colgantes     | c4 y d4 sin peones b ni e propios; el rival sin peones c ni d                        |
| Caro-Kann / Eslava   | c6 y e6 sin peón d contra d4, al rival le falta el peón e o el c                     |
| Cadena francesa      | e6/d5 contra d4/e5                                                                   |
| Maróczy              | c4 y e4 sin peón d contra un peón d y sin peón c                                     |
| Erizo                | a6, b6, d6 y e6 contra c4 y e4                                                       |
| India de rey         | d6/e5 contra d5/e4                                                                   |

Se mira entre las medias jugadas 23 y 50 (jugadas 12–25) y una estructura cuenta si se mantiene
**6 medias jugadas seguidas**. Se calcula en Rust dentro de `get_player_games`, en el mismo
recorrido que ya nombraba la apertura (sin coste apreciable), así que todos los filtros y pestañas
la tienen. El mismo recorrido marca dos tipos de partida sin motor: **damas cambiadas antes de la
jugada 25** y **partidas que llegan a un final** (sin damas y seis piezas o menos, la definición
de Player Analysis).

La pestaña muestra cada estructura **con ella** y **contra ella** con partidas, puntuación y
rating par, la regla al pasar el cursor, el último ejemplo en el tablero y la cobertura (cuántas
partidas tienen alguna).

### Validación

- **Pruebas con posiciones construidas** de cada estructura y de la ventana y la racha.
- **Muestra de la Gigabase** (`structure_frequency`, 20.000 partidas con blancas ≥ 2200, solo
  lectura): 4.689 partidas (23 %) tienen alguna. Por estructura y dueño: IQP 3,7 % blancas / 3,1 %
  negras, India de rey 4,4 % negras, Caro-Kann/Eslava 3,4 % negras, Francesa 3,2 % negras, Maróczy
  2,2 % blancas, Carlsbad 1,6 % blancas, Erizo 0,6 % negras, colgantes 0,2–0,3 %. Se revisó a mano
  la posición del primer ejemplo de cada estructura y dueño (16): todas cumplen la regla y son la
  estructura que dicen ser.
- **Pendiente: los ejemplos etiquetados del libro de Mauricio Flores Rios** (material privado del
  autor). La prueba ya está preparada: `ONYX_STRUCTURE_PGN=<pgn> cargo test --release
structure_validation -- --ignored --nocapture` lee la estructura de cada partida desde las
  cabeceras `Structure`, `ChapterName` o `Event` (palabras como «Carlsbad», «IQP», «Hedgehog»,
  «King's Indian»…) y da, por capítulo, qué parte reconoce y qué otras estructuras marca. Hasta
  entonces la interfaz las presenta como **experimentales**.

## Bot gemelo (I-43, versión 1)

`utils/preparation/twin.ts` y `state/twinBots.ts`. **Jugar contra el gemelo** abre una partida
contra un bot humano cuyo **libro son las secuencias de apertura del rival** con ese color (las
partidas de los filtros, cada secuencia con su número de partidas como peso: el repertorio de los
bots de la Fase 4, modo `weighted`) y que, fuera del libro, juega **Maia 3 a su rating** con
muestreo puro (`Temperature` 1, `TopP` 1), sin el estilo de un perfil del catálogo. El rating sale
del ritmo más jugado y se puede ajustar (los ratings de otras páginas o presenciales no coinciden
exactamente con la escala de Maia; la interfaz lo dice).

- El libro (hasta miles de líneas) vive en memoria durante la sesión, no en los ajustes
  persistidos de la partida; si se reinicia Onyx, el formulario de rivales avisa de que hay que
  abrirlo otra vez desde la ficha.
- Las partidas contra el gemelo no entran en el historial ni en las mediciones de los bots del
  catálogo; la cabecera `WhiteTwinOf`/`BlackTwinOf` dice de quién es el gemelo.
- Corrección en Rust: el libro reconocía un enroque solo si llegaba como `e1g1`; el tablero lo
  envía como `e1h1`, así que el bot salía del libro tras enrocar el usuario. Ahora se comparan
  normalizados (también beneficia a los repertorios de los bots del catálogo).

**Fidelidad** («¿Qué tan fiel es?»): el 20 % más reciente de sus partidas con ese color (al menos
5, y 15 en total como mínimo) queda fuera del libro. En cada posición suya **dentro del libro** de
esas partidas, se compara con qué probabilidad el gemelo jugaría la jugada real (la frecuencia del
libro) y si es su primera opción, frente a **Maia sin más al mismo rating** (8 muestras por
posición, hasta 120 posiciones, las de más partidas primero). Fuera del libro el gemelo _es_ Maia,
así que ahí no hay nada que comparar y solo se cuentan esas jugadas. Si no mejora, se dice.

## Paquete exportable

**Exportar preparación (PGN):** un archivo local con un capítulo de resumen (los objetivos de
«Cómo jugarle», el aviso de prudencia) y el **repertorio probable con blancas y con negras** hasta
16 medias jugadas: la jugada más jugada como línea principal y hasta 3 alternativas con 2
partidas o más como variantes, cada una con «partidas / partidas en la posición · puntuación ·
rating par · última partida». Se abre en Onyx o en cualquier lector PGN y se puede importar a un
estudio o a un repertorio. Sin cuentas, nube ni colaboración, como pedía la fase.

## Rendimiento

- Las estructuras se detectan en el recorrido que `get_player_games` ya hacía.
- El árbol del jugador es una consulta por base y un recorrido en Rust; se calcula al abrir la
  pestaña (no al abrir la ficha) y se guarda por filtro.
- Motor y Maia solo bajo demanda (posiciones clave, dificultad del repertorio, fidelidad,
  generador), con progreso y cancelación, a través del analizador por lotes y el presupuesto de
  motores de 8.2; Maia se cierra al terminar cada medición.

| Medición (i5-1135G7)                                             | Resultado                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Estructuras en 20.000 partidas de la Gigabase (debug, una hebra) | 22,9 s (≈ 1,1 ms por partida, junto con apertura, final y relojes)                                           |
| Árbol de Carlsen en la Gigabase (3.934 partidas, release)        | 634 ms de lectura + 236 ms de árbol; 17.740 + 15.619 posiciones y 1.914 + 1.736 secuencias, 12,5 MB enviados |

Un rival típico tiene decenas o pocos cientos de partidas: su árbol es casi instantáneo. El caso
de un jugador con miles de partidas pesa sobre todo por enviar el FEN de cada posición; si llega a
notarse, el primer recorte es bajar el libro de 20 a 16 medias jugadas.

## Fuera de alcance

- Pipeline completo de retransmisiones y catálogo (I-04, Fase 10).
- Ampliación de estructuras y entrenamiento por estructura (I-31, 9.3); gemelo con estilo medido
  (9.3) y Maia ajustada a un jugador (I-43 versión 2, Fase 10).
- Validación de las estructuras con el libro de Flores Rios: preparada, pendiente del material.

## Validación

- Rust: estructuras (7 pruebas), árbol del jugador (colores, fechas, modelo reciente, líneas),
  enroque en el libro de los bots; mediciones ignoradas `structure_frequency`,
  `structure_validation` y `player_tree_bench`.
- Frontend: `utils/preparation/preparation.test.ts` (fusión de árboles, rating par de cualquier
  bando, fuente del generador y línea principal, posiciones clave, repertorio contra realidad propio
  y de rival, veredicto, estructuras y tipos de partida, libro y fidelidad del gemelo, dificultad
  del repertorio propio y PGN del paquete).
- Validación manual nativa: pendiente.
