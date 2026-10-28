# Fase 9.3 — Interpretación estratégica

Inicio: 2026-10-27. Ideas: I-31 (ampliación y entrenamiento por estructura) e I-43 (gemelo con
estilo medido) del estudio de mercado (`docs/market-study.es.md`). Material del autor: las
introducciones de los capítulos y los esqueletos de las 20 estructuras de _Chess Structures_ de
Mauricio Flores Rios que faltaban (carpeta temporal `9.3 - Estructuras`).

## Decisiones

- **Nombres como en el libro, agrupados por familia.** Cada tipo tiene su regla y sus planes
  (India de rey I, II y III, abierta y complejo; Najdorf I y II; Francesa I, II y III; Benoni
  asimétrica y simétrica), y la interfaz los agrupa en ocho familias: la vista por defecto es la
  familia y se despliega hasta cada estructura.
- **Caro-Kann y Eslava se separan**, como en el libro (capítulos 3 y 4). La «Cadena India de rey»
  genérica de 8.6 desaparece: la cubren los tipos I, II y III. La francesa de 8.6 pasa a llamarse
  **Francesa tipo III**.
- **Textos propios.** Los planes y resúmenes son resúmenes de Onyx con sus propias palabras,
  citando el libro como fuente; el texto del libro no entra en Onyx, que es público.
- **La ficha de estructura no es un área nueva de Entrenamiento**: se abre desde la ficha del
  jugador (Preparación → Estructuras) y desde el tablero.
- **El gemelo solo usa un estilo medido si mejora a Maia** en las partidas recientes del jugador,
  que quedan fuera del ajuste. Si no mejora, juega sin estilo propio y la interfaz lo dice.

## Estructuras (I-31)

`src-tauri/src/db/pawn_structures.rs`: 28 estructuras, cada una con una regla sobre los peones
escrita para el bando que la «tiene», el que da nombre a la formación. La misma regla vale para los
dos colores. Ventana y racha sin cambios: entre las jugadas 12 y 25, y cuenta si se mantiene tres
jugadas. La máscara de detección pasa de 16 a 64 bits.

| Familia                             | Estructuras                                                    |
| ----------------------------------- | -------------------------------------------------------------- |
| Peón aislado y colgantes            | Peón aislado de dama, peones colgantes                         |
| Gambito de dama, Caro-Kann y Eslava | Carlsbad, Caro-Kann, Eslava, Panov, 3-3 contra 4-2             |
| Holandesa y Grünfeld                | Stonewall, centro Grünfeld                                     |
| Siciliana                           | Najdorf I y II, Scheveningen, formación Dragón, Maróczy, erizo |
| Benoni                              | Benoni asimétrica y simétrica, Benko                           |
| India de rey                        | Tipos I, II y III, India de rey abierta, complejo India de rey |
| Francesa                            | Tipos I, II y III                                              |
| Ruy López                           | Ruy López cerrada, formación López                             |

Las reglas de una familia se excluyen entre sí donde el libro las separa: los tipos de la India de
rey por los peones c; la Francesa I exige los dos peones c (o ninguno) para no confundirse con un
Carlsbad visto desde el otro bando; Dragón y Scheveningen excluyen c4 (eso es Maróczy o erizo). El
complejo India de rey incluye el cambio dxe5 dxe5, que es la línea propia del capítulo.

### Validación

- **Esqueletos del libro:** los 20 del PGN (y su versión con colores invertidos) se reconocen como
  su estructura y como ninguna otra. Lo mismo para los esqueletos que muestra la interfaz de las
  ocho anteriores (el erizo también es un Maróczy visto desde las blancas, a propósito).
- **Gigabase OTB**, 20.000 partidas con blancas ≥ 2200 (`structure_frequency`, solo lectura, 2 s en
  release): el **42 %** tiene alguna estructura (23 % con las ocho de 8.6). Las más frecuentes:
  peón aislado 3,3 % blancas / 3,1 % negras, Najdorf II 3,3 %, 3-3 contra 4-2 3,3 % blancas,
  Scheveningen 3,0 %, Francesa III 3,0 %, Maróczy 2,4 %, Caro-Kann 2,2 %, Francesa II 2,1 %. Las
  más raras: Ruy López cerrada 0,1 %, peones colgantes 0,2 %, Panov 0,2 %.
- **Revisión de ejemplos:** se miró la posición del primer ejemplo de cada estructura y bando.
  Tres reglas eran demasiado amplias y se corrigieron: el 3-3 contra 4-2 ahora exige las mayorías
  (aceptaba un 2-3 contra 2-3), el Stonewall excluye el peón rival en e5 (es una cadena francesa
  con ...f5) y el Panov exige el peón e del rival en casa. Tras la corrección, los ejemplos
  revisados son la estructura que dicen ser.

## Ficha de estructura

`components/structures/StructureDetailModal.tsx`. Se abre al pulsar una estructura en la ficha del
jugador o el indicador del tablero:

- **Esqueleto** con flechas de las rupturas típicas (verde blancas, azul negras), orientado desde
  el bando que la tiene.
- **Resumen y planes** de cada color (`components/structures/texts.ts`, generado desde una sola
  tabla para que inglés y español no se desincronicen) y **la regla** con la que Onyx la reconoce.
- **Relacionadas:** las estructuras a las que suele transformarse o de las que viene; se abren en
  la misma ficha.
- **Partidas del jugador** (desde su ficha): con ella y contra ella, puntuación y rating par, y
  cada partida se abre donde aparece la estructura.
- **Partidas modelo** de la base de referencia (`db/structure_games.rs`): recorre por bloques de id,
  de las más recientes a las más antiguas, las partidas en las que ambos jugadores llegan al rating
  mínimo (2400 por defecto), solo hasta la jugada 25; reúne cinco veces las pedidas y se queda con
  las 20 más fuertes. Se puede cancelar y tiene un presupuesto de 400.000 partidas. Cada una se abre donde la estructura queda establecida o se
  **juega desde ahí** contra Maia, con la estructura o contra ella y al nivel elegido.

En la ficha del jugador la sección Estructuras muestra las familias plegadas, con sus totales con
ella y contra ella; al desplegarlas aparecen sus estructuras.

## Estructura en el tablero

`components/structures/StructureBadge.tsx`, junto al nombre de la apertura en la cabecera de la
notación: la estructura de la posición actual (la regla sobre esa posición, sin la racha de la
partida), con su dueño en el tooltip. Al pulsarla se abre la ficha. La consulta se guarda por
disposición de peones, así que moverse por la partida no repite cálculos.

## Gemelo (I-43)

### Tiempo de reflexión

El gemelo jugaba al instante (`humanTiming: null`). Ahora piensa como el jugador:

- `get_player_games` calcula, de los `[%clk]` y la cabecera `TimeControl`, el tiempo de cada jugada
  del jugador (reloj anterior − reloj actual + incremento; nunca negativo). Se omite la primera
  jugada de cada bando, porque Lichess arranca los relojes después. Por partida devuelve las
  jugadas y segundos de las diez primeras y del resto, y un histograma de 8 tramos (0–1 s, 1–2 s…
  64 s o más).
- Por ritmo (bala, blitz, rápidas, clásicas, como Lichess): la **media por jugada** tras las diez
  primeras, la **velocidad de la apertura** (proporción frente a la media, que el modelo de tiempo
  usa para las jugadas de libro) y el **rango** (10 % más rápido y 5 % más lento).
- Con 60 jugadas o más al ritmo de la partida se usan tal cual (`fixedRhythm`: sin el escalado
  genérico desde blitz). Si no, se toman del ritmo más cercano con datos y se reescalan como los
  bots. Sin relojes, los tiempos del catálogo para su rating.
- El resto del modelo de tiempo es el de los bots: más tiempo al salir del libro y en posiciones
  críticas, menos en recapturas, y el límite según el reloj restante.

### Fuerza

El gemelo usa el mismo juego que los bots del catálogo (`botPlay`) si hay Stockfish: hasta 2800 de
rating, con el filtro de fuerza por encima del rango de Maia (I-48), y la detección de jugadas
críticas para el tiempo. Sin Stockfish juega como Maia pura, como antes.

### Estilo medido

`db/player_style.rs`, botón **Medir el estilo** en la sección del gemelo:

1. De hasta 200 partidas recientes del jugador se toman sus jugadas entre la 11 y la 40 (sin
   jaque, con más de una jugada legal), hasta 10 por partida, repartidas.
2. Maia, al rating del gemelo y con el rating real del rival de cada partida, da su probabilidad
   para cada jugada legal, y se miden los rasgos de cada una con la función de los bots
   (agresión y simplificación, `bot_style::move_traits`).
3. **Desviaciones:** media del rasgo de la jugada real menos la esperada por Maia, con su error
   estándar. Se califica «más agresivo / más defensivo / como lo esperado» solo con una diferencia
   de dos errores estándar.
4. **Pesos:** los de una cuadrícula de −1 a 1 por eje que hacen más probables sus jugadas en las
   partidas antiguas, aplicados como los aplican los bots (solo dentro del grupo de candidatas
   probables, que conserva su masa). En juego ese grupo lo decide Stockfish; aquí lo representan
   las candidatas probables de Maia: es una aproximación.
5. **Comprobación:** en el 20 % más reciente de las partidas (al menos 5), que no se usan para
   ajustar, se compara la log-verosimilitud media y la primera opción con y sin estilo. El gemelo
   usa los pesos solo si la verosimilitud mejora (más de 0,002 por jugada).

Unas 400 posiciones: uno o dos minutos con Maia 3 gestionado. El resultado se guarda por ficha
(`twin-styles-v1`), con fecha, rating y número de partidas.

## Rendimiento

- Estructuras y tiempo de reflexión en el recorrido de `get_player_games` que ya existía.
- Indicador del tablero: una consulta por disposición de peones.
- Partidas modelo y estilo: solo bajo demanda, con progreso y cancelación.

| Medición (Gigabase OTB, release)          | Resultado                                             |
| ----------------------------------------- | ----------------------------------------------------- |
| Estructuras en 20.000 partidas ≥ 2200     | 2,1 s (junto con apertura, final y relojes)           |
| Partidas modelo: Carlsbad ≥ 2400          | 0,5 s; la primera búsqueda con el disco en frío, 18 s |
| Partidas modelo: colgantes ≥ 2400         | 0,5 s                                                 |
| Partidas modelo: Ruy López cerrada ≥ 2200 | 0,9 s (60.000 partidas leídas: es la más rara)        |

## Validación

- Rust: estructuras (15 pruebas, entre ellas los esqueletos del libro), partidas modelo, tiempo de
  reflexión, tiempo con ritmo fijo y ajuste del estilo con jugadores sintéticos (uno agresivo, que
  recibe peso agresivo y mejora la predicción, y uno como Maia, que no recibe estilo). Mediciones
  ignoradas: `structure_frequency` y `structure_model_games_bench`.
- Frontend: familias de estructuras, tiempo por ritmo, percentiles y elección de la fuente del
  tiempo del gemelo.
- **Validación manual nativa: pendiente.**

## Fuera de alcance

- A qué estructuras lleva una línea en el informe de posición: necesita calcular las estructuras de
  las partidas del informe.
- Gemelo con Maia ajustada al jugador (I-43 versión 2, Fase 10).
