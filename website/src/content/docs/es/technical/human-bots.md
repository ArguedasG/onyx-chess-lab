---
title: Bots humanos
description: Cómo se construyeron y calibraron los bots de Onyx, que juegan como personas de un nivel concreto y con una personalidad propia.
---

Los bots de Onyx no son un motor fuerte debilitado a propósito. Un Stockfish limitado juega casi perfecto y de pronto regala una pieza sin motivo, algo que ninguna persona haría. Los bots de Onyx parten de un modelo que imita a jugadores humanos y, encima de él, añaden repertorio, estilo, control de fuerza y tiempos de reflexión.

Hay más de 70 bots, de 800 a 2800, cada uno con nombre, personalidad de juego, estilo de apertura y repertorio propio.

## La base: Maia 3

[Maia 3](https://github.com/CSSLab/maia3) es una red neuronal entrenada con partidas humanas de Lichess. Dada una posición y un nivel, no busca la mejor jugada: predice qué jugaría una persona de ese Elo, con sus imprecisiones típicas incluidas. Por eso sus errores se parecen a los de la gente.

Maia solo da sus candidatas ordenadas. Para poder razonar sobre ellas, Onyx la lanza a través de un pequeño script propio que, antes de cada jugada, imprime la probabilidad de cada jugada legal. El código de Maia no se modifica, y un cliente UCI normal ignora esas líneas.

## Qué pasa en cada jugada

1. **Repertorio.** Si la partida sigue una de las líneas del bot, juega su apertura. Hay unas 120 líneas agrupadas en 49 familias, y cada bot tiene una con blancas y una contra e4, contra d4 y contra aperturas de flanco. Los bots menos teóricos dejan el libro antes.
2. **Candidatas de Maia.** Las jugadas más probables hasta cubrir el 90 % de la probabilidad, con un máximo de seis.
3. **Verificación.** Una sola búsqueda corta de Stockfish (unos 150 ms), limitada a esas candidatas, mide cuánto pierde cada una frente a la mejor.
4. **Estilo.** Dentro del grupo de jugadas aceptables, la personalidad del bot reparte la probabilidad hacia las jugadas que le van.
5. **Fuerza.** En los niveles altos se descartan las candidatas que pierden demasiado.
6. **Elección.** Se sortea la jugada con la temperatura del bot, como hace Maia con su propia política.
7. **Tiempo.** Por último se decide cuánto «piensa» antes de mover.

Maia y la verificación juntas tardan menos de medio segundo, muy por debajo del tiempo de reflexión simulado.

## Personalidades

Cada jugada candidata se describe con dos rasgos medidos en el tablero:

- **Agresión:** jaques, ataques sobre las casillas del rey rival, piezas que se acercan a él, peones que avanzan frente a su rey. Restan los movimientos que refuerzan el propio rey, las retiradas y el enroque.
- **Simplificación:** cambios de piezas de valor parecido, capturas y menos tensión en el tablero. Restan las posiciones con muchas piezas atacadas.

Con esos dos ejes salen cinco personalidades:

| Personalidad | Agresión | Complejidad |
| --- | --- | --- |
| Rematador | agresivo | simplifica |
| Salvaje | agresivo | complica |
| Guardián | defensivo | simplifica |
| Acechador | defensivo | complica |
| Equilibrista | neutro | neutro |

Y cuatro estilos de apertura (Aventurero, Esgrimista, Práctico y Clásico), según lo aguda y lo teórica que sea su elección.

**La regla más importante: un estilo no cambia la fuerza.** La primera versión sí la cambiaba: al empujar hacia ciertas jugadas, los estilos agresivos se volvían más fuertes y los defensivos cometían más errores (uno de ellos perdía unos 500 puntos). Ahora el estilo solo reparte la probabilidad **dentro** del grupo de jugadas que Stockfish deja cerca de la mejor, y ese grupo conserva su peso total. Los errores humanos de Maia siguen teniendo exactamente la misma probabilidad. Además, el estilo se atenúa en los finales, para que no retrase una jugada técnica necesaria.

## La escalera de fuerza

- **Hasta 2400:** Maia pura a su nivel. La escalera de Maia es coherente consigo misma, errores incluidos: un 1900 le gana a un 1800 con la frecuencia con que lo haría una persona.
- **Por encima de 2400:** Maia 2400 con un filtro. El bot solo puede elegir entre candidatas a menos de un margen de la mejor: 400 centipeones a 2450, 220 a 2600, 175 a 2700 y 140 a 2800. Así sigue jugando jugadas humanas, pero deja de cometer los errores que un jugador de ese nivel no cometería.

Antes de llegar aquí se probaron otros tres planes que mezclaban el filtro desde 1800. Alteraban una escalera que ya funcionaba y por encima de 2600 no conseguían separar niveles, así que se descartaron.

## Cómo se calibró

Todo se midió con matches entre bots dentro de la propia app, con más de mil partidas en total, siempre en lotes cortos de 10 a 30 minutos, colores alternados y semillas fijas para poder repetir cada experimento.

- **Laboratorio de estilos.** Cada personalidad contra un bot neutro del mismo Elo, a 1500 y 2000, en tres rondas de 200 partidas. Se midieron jaques, cambios, piezas atacadas, material y duración de las partidas para comprobar que cada estilo se distingue de los demás, y la probabilidad que Maia daba a las jugadas elegidas, para comprobar que seguían siendo humanas (bajó solo entre 1 y 4 puntos).
- **Prueba a ciegas.** El autor revisó 20 partidas sin saber qué estilo jugaba cada bot. El estilo se reconocía cuando la posición lo permitía, igual que con jugadores reales; en partidas decididas pronto o con una sola jugada buena no se distinguía.
- **Fuerza.** Cinco rondas de calibración para los niveles altos y después matches de 40 partidas contra Maia 2400.

Tres problemas de medida salieron por el camino, y corregirlos importó tanto como los ajustes:

1. **El laboratorio no usaba el bot real**, sino Maia sin estilo ni filtro. Ahora juega exactamente como en una partida normal.
2. **Las partidas se repetían.** Con repertorio y Maia eligiendo su jugada más probable, las 40 partidas de un match salían de dos o tres líneas. La solución fue un juego de 20 aperturas equilibradas, cada una jugada una vez con cada color.
3. **El ruido.** Con 40 partidas, el margen de error es de unos ±100 Elo. Un resultado llamativo de un solo match desaparecía al repetirlo, así que la regla es no recalibrar por un único match.

Resultados con aperturas variadas, 40 partidas por match:

| Match | Puntos | Diferencia medida | Esperada |
| --- | --- | --- | --- |
| Bot 2400 contra Maia 2400 | 18 – 22 | −35 | 0 |
| Bot 2450 contra Maia 2400 | 25 – 15 | +89 | +50 |
| Bot 2500 contra Maia 2400 | 29 – 11 | +169 | +100 |
| Bot 2550 contra Maia 2400 | 25,5 – 14,5 | +98 | +150 |
| Bot 2600 contra Maia 2400 | 31,5 – 8,5 | +228 | +200 |
| Bot 2700 contra Maia 2400 | 34 – 6 | +301 | +300 |
| Bot 2800 contra bot 2600 | 26,5 – 13,5 | +117 | +200 |

Todos caen dentro del ruido esperado. Las personalidades, enfrentadas a un bot neutro del mismo nivel, dieron una diferencia media de −7 ± 25 Elo: cambian cómo juega el bot, no su fuerza.

## El Elo según el ritmo

Maia aprendió sobre todo de partidas blitz y no usa el reloj, así que el bot juega igual a cualquier ritmo. Lo que cambia es la etiqueta: el número de un bot es su Elo en blitz, y en rápida y clásica se muestra más bajo, porque sus errores pesan más cuando el rival tiene tiempo para aprovecharlos. Por ejemplo, un bot de 2000 aparece como 1830 en rápida y 1675 en clásica. La fórmula se ajustó tras la prueba a ciegas.

Tu propio rating contra los bots usa Glicko-2, uno por ritmo, como Lichess. Es una escala interna de Onyx: no equivale a un Elo FIDE ni al de ninguna plataforma.

## Tiempo de reflexión

Un bot que contesta al instante no se siente humano. Cada bot tiene un perfil de tiempos, y la duración de cada jugada depende de:

- el ritmo de la partida (más lento en rápida y en clásica);
- la primera jugada fuera de su repertorio, que es donde una persona más se detiene;
- las posiciones críticas, cuando solo una jugada es claramente mejor;
- las recapturas obvias, que van más rápido.

## Límites y próximos pasos

La versión actual es aproximada a propósito, y se seguirá afinando con partidas reales y la opinión de quienes juegan contra los bots.

- **Repertorios más realistas.** Hoy las líneas y su popularidad están escritas a mano. El siguiente paso es medirlas en la base de Lichess por rango de Elo, para que un bot de 1200 abra como lo hace la gente de 1200.
- **Estilos más marcados.** El eje agresivo y defensivo separa bien, pero el de simplificar y complicar es más débil en niveles bajos, y el Acechador todavía da tantos jaques como un bot neutro. Hay margen para nuevos rasgos y más personalidades.
- **Más bots.** El catálogo tiene sitio para más perfiles, y los jugadores generados con semilla, que ya usan los torneos, podrían aparecer en el explorador.
- **Los niveles más altos.** El 2800 rinde algo por debajo de su número en varias mediciones. Si se confirma, se estrechará su margen; a más largo plazo, una búsqueda guiada por el modelo humano podría dar niveles altos más naturales.
- **Ligas con aperturas variadas.** Las ligas entre bots todavía usan repertorios, así que dos bots pueden repetir casi la misma partida cada vez que se enfrentan.
