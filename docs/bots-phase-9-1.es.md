# Fase 9.1 — Bots

Inicio: 2026-10-17. Ideas: I-47, I-48, I-49, I-50 e I-52 (partida guiada) del estudio de mercado
(`docs/market-study.es.md`).

## Decisiones del autor (2026-10-17)

- **Fuerza independiente del ritmo.** El bot juega igual a cualquier ritmo (Maia 3 no usa el reloj:
  los pesos publicados se entrenaron sin `include_time_info`). Todo el efecto del tiempo va en la
  etiqueta de Elo (I-50), nunca en la fuerza (I-48), para no contarlo dos veces.
- **I-48: probabilidad de verificar p(Elo).** 0 en niveles bajos (Maia pura), creciente en una zona
  de transición (~1900–2300, a medir) y 1 arriba, con un margen cada vez más estrecho.
- **I-49: escalera** 800, 900, 1000 y de 50 en 50 hasta 2800 (39 puestos); repeticiones de 1300 a 2400. El techo bajó a 2600 con el primer método y volvió a 2800 con el de Maia puro hasta 2400.
- **I-50: etiquetas por ritmo**, con parámetros en una tabla versionada:
  - Blitz: el Elo del bot (escala de Lichess blitz, la nativa de Maia).
  - Rápida: `E − (100 + 0,07·(E − 1000))` (2000 → 1830, 2800 → 2574).
  - Clásica: `E − (175 + 0,15·(E − 1000))` (2000 → 1675, 2800 → 2355).
  - Revisada el 2026-10-18 tras la prueba a ciegas (antes 0,05 y 0,10): los errores de Maia, que
    aprendió sobre todo de partidas blitz, resultan bruscos vistos con calma.
  - Significado: el rating que necesitaría un humano en ese ritmo para puntuar el 50 % contra el bot
    (no los grupos de rápida y clásica de Lichess).
  - Ritmo según Lichess: base + 40 × incremento; menos de 8 min es blitz, menos de 25 rápida, el
    resto clásica. **Bullet, sin tiempo y partidas con ayudas: siempre amistosas.**
  - Rating del usuario: Glicko-2, uno por ritmo, provisional al inicio; sus resultados no mueven el
    rating de los bots.
- **Partidas contra bots en la ficha:** se guardan en una base local («Partidas contra bots de
  Onyx») que aparece en la ficha propia como una fuente más; por defecto solo las puntuables.
- **Tiempos de reflexión por ritmo:** multiplicador blitz ×1, rápida ×1,6, clásica ×2,5 sobre el
  perfil; libro rápido, primera jugada fuera de libro la más larga, más tiempo en posiciones
  críticas, forzadas rápidas.
- **Mediciones en lotes cortos**, nunca por la noche; la v1 es aproximada y se afina con las
  partidas del autor y la opinión de los usuarios.
- Los nombres de las personalidades no copian los de Chessiverse:

  | Personalidad de juego | Ejes                  | Id interno     |
  | --------------------- | --------------------- | -------------- |
  | Rematador (Striker)   | agresivo, simplifica  | `rematador`    |
  | Salvaje               | agresivo, complica    | `salvaje`      |
  | Guardián              | defensivo, simplifica | `guardian`     |
  | Acechador (Lurker)    | defensivo, complica   | `acechador`    |
  | Equilibrista          | centro                | `equilibrista` |

  | Estilo de apertura | Ejes                |
  | ------------------ | ------------------- |
  | Aventurero         | aguda, poca teoría  |
  | Esgrimista         | aguda, teórica      |
  | Práctico           | sólida, poca teoría |
  | Clásico            | sólida, teórica     |

- Laboratorio de estilos: propuesta B (2 Elos × 5 estilos × 20 partidas, en 4 lotes).

## Orden de trabajo

1. Probabilidades de Maia y verificación de candidatas con Stockfish. **Hecho.**
2. Rasgos de cada jugada y reordenamiento por estilo (I-47). **Hecho y conectado a las partidas.**
3. Laboratorio de estilos en lotes; prueba a ciegas y partidas del autor. **Primera ronda hecha.**
4. Filtro de I-48 con p(Elo). **Hecho y calibrado hasta 2400–2600.**
5. Tiempos de reflexión por ritmo. **Hecho.**
6. Rating por ritmo, partidas puntuables y amistosas, base de partidas y fuente en la ficha. **Hecho.**
7. Catálogo completo y explorador de bots. **Hecho.**
8. Partida guiada (I-52). **Hecho.**
9. Jugadores generados con semilla fija (I-49), para los torneos de 9.2. **Hecho.**

## Paso 1 — Candidatas de Maia y verificación con Stockfish

Maia 3 calcula la probabilidad de cada jugada pero su interfaz UCI no la imprime: con MultiPV solo
da las candidatas ordenadas.

- `src-tauri/resources/maia/onyx_maia_policy.py`: lanzador de Onyx que ejecuta el mismo Maia (sin
  modificar su código) y, antes de cada `bestmove`, imprime
  `info string onyx-policy v1 <uci>:<p> ...` con la probabilidad de cada jugada legal (temperatura
  1, sin top-p). Los clientes UCI normales ignoran `info string`. Licencia AGPL-3.0, como Maia.
- `src-tauri/src/bot_candidates.rs`:
  - `policy_launch`: si el motor es un lanzador `maia3-*` con su Python al lado (la instalación
    administrada lo es), devuelve cómo lanzarlo a través del script, que escribe en una carpeta de
    Onyx. No cambia la configuración registrada del motor.
  - `wait_for_maia_move`: `bestmove` y, si llegó, la política. Un Maia sin el script sigue jugando
    con su propia jugada.
  - `top_candidates`: las más probables hasta cubrir una masa de probabilidad, con un máximo.
  - `verify_candidates`: una sola búsqueda de Stockfish limitada a las candidatas (`MultiPV` y
    `searchmoves`, que va al final porque consume todo lo que le sigue).
- Aún no está conectado a las partidas: lo usa el paso 2.

**Medido en el equipo de desarrollo** (Maia 3 5M en CPU, Stockfish de 1 hilo y 32 MB de hash, 6
candidatas, 12 posiciones de una Italiana):

| Límite de Stockfish | Maia (mediana) | Stockfish (mediana / máx.) | Profundidad alcanzada |
| ------------------- | -------------- | -------------------------- | --------------------- |
| 100 ms              | 48 ms          | 101 / 103 ms               | 11–12                 |
| 250 ms              | 95 ms          | 252 / 254 ms               | 12–13                 |
| Profundidad 14      | 75 ms          | 713 / 1.635 ms             | 14                    |

Conclusiones: con 100–250 ms por jugada el coste total (~0,15–0,35 s) cabe de sobra dentro del
tiempo de reflexión (2,8–6 s de media). La profundidad fija es demasiado lenta. Entre 100 y 250 ms
las evaluaciones de jugadas parecidas cambian 10–25 cp, así que **los márgenes de I-47 e I-48 no
deben bajar de ~30 cp**.

Prueba con motores reales (ignorada por defecto):

```bash
cargo test real_engines -- --ignored --nocapture
```

con `ONYX_MAIA_PATH`, `ONYX_MAIA_ARGS` (separados por `|`) y `ONYX_STOCKFISH_PATH`.

## Paso 2 — Estilos de juego

`src-tauri/src/bot_style.rs`. Un estilo **no inventa jugadas**: reordena las candidatas de Maia.

- **Rasgos de cada jugada**, medidos en el tablero:
  - _agresión_: jaque (+1), más ataques sobre las casillas del rey rival (+0,25 por ataque), pieza
    que se acerca al rey rival (+0,15 por casilla), avance de peón frente a su rey (+0,4); en
    contra: más defensores del propio rey (−0,15 por defensor), retirada hacia la primera fila
    (−0,3) y enroque (−0,4);
  - _simplificación_: cambio de piezas de valor parecido (+1,5), captura de una pieza (+0,5), dama
    ofrecida a cambio (+0,6) y menos piezas atacadas en el tablero (+0,25 por pieza; más tensión
    resta).
- **Pesos** de −1 a 1 en cada eje: Rematador (1, 1), Salvaje (1, −1), Guardián (−1, 1), Acechador
  (−1, −1), Equilibrista (0, 0).
- **Reordenamiento**: la probabilidad de cada candidata se multiplica por
  `exp(1,2 · (agresión·peso + simplificación·peso))`, **solo si Stockfish la deja a menos de un
  margen de la mejor** (`120 − 0,04·Elo` cp, entre 30 y 80: 60 cp a 1500, 40 a 2000). Las demás
  conservan su probabilidad, así que los errores humanos de Maia siguen ahí, pero el estilo nunca
  empuja hacia una jugada peor.
- **Qué se verifica**: las candidatas que cubren el 90 % de la probabilidad (máximo 6) y hasta 3
  jugadas menos probables (≥ 1 %) que el estilo favorece; si no, una jugada agresiva rara nunca se
  jugaría. Una sola búsqueda de Stockfish de 150 ms.
- Después se aplican la temperatura y el top-p del bot, como hace Maia con su política.

## Laboratorio de estilos: propuestas

Cinco personalidades contra un bot neutro del mismo Elo. Estimación por partida a velocidad de
máquina: ~11 s de cálculo con procesos reutilizados (la liga actual arranca Maia en cada partida,
~10 s más) y ~6–8 s efectivos con 2 partidas a la vez. Se confirmará con el primer lote.

| Propuesta  | Partidas                      | Duración total | Lotes           | Qué permite ver                                                    |
| ---------- | ----------------------------- | -------------- | --------------- | ------------------------------------------------------------------ |
| A          | 1 Elo × 5 estilos × 10 = 50   | ~5–10 min      | 1               | Diferencias groseras y PGN para revisar; Elo ±170.                 |
| **B** (\*) | 2 Elos × 5 estilos × 20 = 200 | ~20–40 min     | 4 de ~7–10 min  | Rasgos por jugada (jaques, capturas, cambios, material); Elo ±120. |
| C          | 2 Elos × 5 estilos × 50 = 500 | ~50–100 min    | 10 de ~7–10 min | Rasgos con buena precisión; Elo ±80.                               |

(\*) Elegida por el autor. Duración real de la primera ronda: 4 lotes de 7–8 min, **31 min en
total** (~120 medias jugadas por partida, 17–19 s por partida y 2 partidas a la vez).

Las métricas por partida (porcentaje de partidas decisivas, enroques opuestos) necesitan cientos de
partidas: no se usan en la v1. Los resultados se acumulan entre lotes, que se pueden pausar y
reanudar. La calibración de la escalera de Elo con los bots fuertes de I-48 se estima aparte cuando
llegue el paso 4.

## Laboratorio — primera ronda (2026-10-17)

`src-tauri/src/style_lab.rs`: 200 partidas (1500 y 2000 × 5 estilos × 20) contra un Maia neutro
del mismo Elo, colores alternados, un solo Maia y un Stockfish por proceso de trabajo. Resultados en
`lab-results/style-lab-v1/` (fuera de git): `summary.md`, las partidas y un set a ciegas.

Medias del bot con estilo (intervalo del 95 % entre paréntesis cuando importa):

| Métrica                           | Rematador | Salvaje | Guardián | Acechador | Equilibrista |
| --------------------------------- | --------- | ------- | -------- | --------- | ------------ |
| Jaques/jugada, 1500 (%)           | 12,9      | 11,7    | 4,1      | 3,5       | 5,4          |
| Jaques/jugada, 2000 (%)           | 13,6      | 14,1    | 4,8      | 4,9       | 8,0          |
| Cambios/jugada, 1500 (%)          | 9,6       | 8,5     | 12,2     | 7,2       | 10,4         |
| Material medio, 2000              | 47,8      | 55,3    | 44,4     | 51,6      | 47,8         |
| Medias jugadas, 2000              | 96        | 82      | 114      | 96        | 98           |
| Prob. Maia de su jugada, 2000 (%) | 58        | 55      | 55       | 53        | 56           |
| Elo frente al neutro, 1500        | −17       | 0       | −191     | −512      | −147         |
| Elo frente al neutro, 2000        | +89       | +70     | −147     | −127      | −35          |

Conclusiones:

1. **El eje agresivo ↔ defensivo funciona con claridad**: los estilos agresivos dan 2–3 veces más
   jaques que los defensivos, con intervalos que no se solapan, en los dos Elos.
2. **El eje simplificar ↔ complicar funciona a medias**: a 2000 el material sobre el tablero separa
   bien (Salvaje y Acechador mantienen más piezas que Rematador y Guardián) y el Guardián alarga las
   partidas; a 1500 la separación es pequeña. Hay que reforzar ese eje.
3. **Las jugadas siguen siendo humanas**: la probabilidad que Maia da a las jugadas elegidas es la
   misma con y sin estilo (53–58 % a 2000).
4. **Defecto de diseño encontrado y corregido**: el estilo cambiaba la fuerza. Al favorecer jugadas
   dentro del margen, los estilos agresivos se volvían algo más fuertes; al penalizarlas, los
   defensivos hacían relativamente más probables las jugadas fuera del margen, es decir, los
   errores (Acechador −512 a 1500). Ahora el estilo solo redistribuye la probabilidad **dentro** del
   grupo de jugadas aceptables, que conserva su masa total, y los errores de Maia quedan con la
   misma probabilidad.
5. **Ruido de la medición de Elo**: el Equilibrista juega exactamente como el neutro y aun así salió
   −147 a 1500. Con 20 partidas, ±150 Elo es ruido; solo las diferencias muy grandes cuentan.

## Laboratorio — segunda ronda (2026-10-17)

Misma propuesta B (mismas semillas) con la fuerza corregida (el estilo solo redistribuye dentro del
grupo de jugadas aceptables) y la simplificación reforzada (cambio +1,5; tensión 0,25 por pieza).
4 lotes de 6–7 min, **26 min en total**. Resultados en `lab-results/style-lab-v2/`. El Equilibrista
coincide con la primera ronda partida por partida, como debe (mismas semillas y sin estilo).

| Métrica                    | Rematador | Salvaje | Guardián | Acechador | Equilibrista |
| -------------------------- | --------- | ------- | -------- | --------- | ------------ |
| Jaques/jugada, 1500 (%)    | 10,8      | 8,6     | 5,7      | 11,1      | 5,4          |
| Jaques/jugada, 2000 (%)    | 12,9      | 15,5    | 7,4      | 7,0       | 8,0          |
| Cambios/jugada, 1500 (%)   | 11,8      | 8,6     | 11,8     | 8,1       | 10,4         |
| Cambios/jugada, 2000 (%)   | 11,2      | 9,0     | 11,3     | 10,8      | 11,0         |
| Piezas atacadas, 1500      | 2,81      | 3,80    | 2,97     | 3,47      | 3,05         |
| Material medio, 1500       | 48,3      | 55,7    | 48,3     | 49,6      | 49,6         |
| Elo frente al neutro, 1500 | +89       | −17     | −127     | +89       | −147         |
| Elo frente al neutro, 2000 | −70       | +70     | −35      | +17       | −35          |

Conclusiones:

1. **La fuerza ya no depende del estilo**: todas las diferencias de Elo caen dentro del ruido de
   ±150 (el Acechador pasa de −512 a +89 a 1500). La corrección funciona.
2. **La simplificación mejora a 1500**: cambios, tensión y material separan los estilos que
   simplifican de los que complican. A 2000 la separación es pequeña.
3. **La agresión se debilitó**: a 2000 sigue clara (12,9–15,5 % de jaques frente a 7,0–7,4 %), pero
   a 1500 el Acechador da tantos jaques como el Rematador. Al redistribuir solo dentro del grupo
   aceptable, el estilo actúa menos a menudo (si solo hay una jugada aceptable, no cambia nada) y
   su efecto es más suave.
4. Las jugadas siguen siendo humanas (probabilidad de Maia de la jugada elegida sin cambios).

## Laboratorio — tercera ronda (2026-10-17)

Igual que la segunda con `STYLE_STRENGTH` = 2,0. 4 lotes de 7–8 min, ~30 min. Resultados en
`lab-results/style-lab-v3/`.

| Métrica                           | Rematador | Salvaje | Guardián | Acechador | Equilibrista |
| --------------------------------- | --------- | ------- | -------- | --------- | ------------ |
| Jaques/jugada, 1500 (%)           | 9,8       | 11,6    | 5,1      | 8,1       | 5,4          |
| Jaques/jugada, 2000 (%)           | 14,0      | 14,0    | 5,4      | 8,2       | 8,0          |
| Cambios/jugada, 1500 (%)          | 10,6      | 7,2     | 12,4     | 7,6       | 10,4         |
| Cambios/jugada, 2000 (%)          | 12,1      | 9,2     | 10,2     | 7,2       | 11,0         |
| Piezas atacadas, 2000             | 3,30      | 3,55    | 2,95     | 3,60      | 3,32         |
| Medias jugadas, 2000              | 98        | 95      | 112      | 94        | 98           |
| Prob. Maia de su jugada, 2000 (%) | 55        | 54      | 53       | 54        | 56           |
| Elo frente al neutro, 1500        | −53       | −89     | +17      | +53       | −147         |
| Elo frente al neutro, 2000        | +17       | +53     | −127     | +17       | −35          |

Conclusiones:

1. **Los dos ejes separan los estilos en los dos Elos**: jaques (agresivos 10–14 %, Guardián 5 %) y
   cambios (los que simplifican 10–12 %, los que complican 7–9 %). Cada personalidad se distingue
   de las demás en al menos una medida.
2. **La fuerza sigue sin depender del estilo**: todas las diferencias caen dentro del ruido.
3. **Las jugadas siguen siendo humanas**: la probabilidad de Maia de la jugada elegida baja solo
   1–4 puntos.
4. **Pendiente**: el Acechador no da menos jaques que el Equilibrista. Probablemente porque complicar
   (más piezas atacadas) premia los jaques que atacan piezas. Se revisará después de la prueba a
   ciegas.

**Decisión provisional**: `STYLE_STRENGTH` = 2,0 para la v1. Siguiente paso: la prueba a ciegas del
autor con `lab-results/style-lab-v3/blind.pgn` (20 partidas, 2 por estilo y Elo; la clave está en
`blind-key.md`).

## Prueba a ciegas del autor (2026-10-18)

20 partidas de la tercera ronda. Resultado: el estilo se reconoce **cuando la posición lo permite**
(partidas 12 y 15, acertadas de lleno: un final donde se evitó el cambio de damas y un ataque con
muchos cambios); en partidas decididas pronto, con un plan natural o con una única jugada buena, no
se distingue, igual que con jugadores reales. Valoración del autor: los estilos se quedan así.

Observaciones que se aplican:

- **A nivel bajo, «defensivo» se ve como «pasivo»**: es coherente con el ajedrez real (un 1000 no
  tiene estilo) y con mantener el Elo fijo; no se corrige.
- **Riesgo en los finales**: un estilo podría retrasar una jugada técnica necesaria (por ejemplo,
  acercar piezas al rey) si hay otra igual de buena. Además del margen de Stockfish, el estilo se
  atenúa con el material: completo con 30 puntos de piezas o más, 30 % con 10 o menos
  (`StyleWeights::for_position`).
- **Errores bruscos para el Elo** (por ejemplo, un 2000 que regala su ventaja): se ajusta la fórmula
  de rápida y clásica (arriba). Los errores de los niveles altos los reduce además I-48.

## Estilos en las partidas reales (2026-10-18)

- `PlayerConfig::Engine` tiene un campo nuevo, `botPlay` (`BotPlayConfig`): pesos del estilo, Elo,
  temperatura, top-p y el Stockfish verificador.
- Al empezar la partida (`spawn_player_engine` en `game.rs`), un bot con `botPlay` lanza Maia a
  través del script de la política y, si tiene estilo, un Stockfish pequeño (1 hilo, 32 MB). Si Maia
  no se puede envolver o el verificador no arranca, el bot juega como un Maia normal.
- En su turno, `choose_bot_move` (la misma función que usa el laboratorio) elige la jugada; el
  repertorio y el libro siguen teniendo prioridad. La evaluación guardada en la jugada es la de la
  verificación.
- Los 15 bots actuales usan sus ejes editoriales como pesos reales: agresión alta, media o baja →
  1, 0 o −1; complejidad alta → complica (−1), baja → simplifica (1). El verificador es el mismo
  Stockfish que usan los Finales; sin Stockfish instalado, el bot juega sin estilo.
- El Generador de partidas modelo sigue con el muestreo de Maia sin estilo, para que sus
  experimentos sigan siendo comparables.

## Paso 5 — Tiempos de reflexión por ritmo (2026-10-18)

`calculate_human_think_time` en `game.rs`, con un `ThinkContext` por jugada:

- **Ritmo** (estimación de Lichess, base + 40 × incremento): bullet ×0,6, blitz ×1, rápida ×1,6,
  clásica ×2,5 sobre el mínimo, la media y el máximo del perfil. Sin reloj, como blitz. Con el
  perfil «deliberado» (4,5 s de media en blitz) una clásica queda en ~11 s de media.
- **Primera jugada propia fuera del repertorio o del libro**: ×2 (donde un humano más se detiene).
- **Posición crítica** (la mejor candidata verificada supera a la segunda en 1,5 peones o más, con la
  partida sin decidir): ×1,5.
- **Recaptura** en la casilla donde el rival acaba de capturar: la mitad.
- Se mantienen el ajuste por jaque o pocas jugadas, la reserva de reloj y que el tiempo de cálculo
  (Maia + Stockfish) cuente como reflexión. El tiempo se decide cuando la jugada ya está elegida.
- El verificador se arranca también para los bots sin estilo, para detectar las posiciones críticas.

## Paso 4 — Bots fuertes (I-48)

`src-tauri/src/bot_strength.rs`, `strength_plan(elo)`. Al filtrar, el bot solo puede jugar
candidatas de Maia verificadas a menos del margen de la mejor; el estilo se aplica antes y sigue
repartiendo la probabilidad entre ellas. En la partida, `spawn_player_engine` fija `SelfElo` al Elo
pedido a Maia.

### Calibración, ronda 1 (plan v1)

Filtro desde 2000 (completo en 2400), margen de 150 a 40 cp, hasta 150 puntos menos a Maia. 50
partidas, ~17,5 min (el segundo lote se canceló para no pasar del tiempo previsto).

| Enfrentamiento    | Filtradas | Puntuación | Elo medido | Esperado |
| ----------------- | --------- | ---------- | ---------- | -------- |
| 2100 vs Maia 2100 | 29 %      | 90 %       | +382       | 0        |
| 2300 vs Maia 2300 | 72 %      | 80 %       | +241       | 0        |
| 2500 vs Maia 2300 | 100 %     | 100 %      | > +400     | +200     |
| 2700 vs bot 2500  | 100 %     | 75 %       | +191       | +200     |
| 2800 vs bot 2600  | 100 %     | 50 %       | 0          | +200     |

Conclusiones: el filtro vale muchísimo más de lo supuesto (filtrar una de cada cuatro jugadas ya
suma ~400 puntos frente a Maia); y estrechar el margen por debajo de ~70 cp ya no suma fuerza.

### Plan v2

| Elo  | Filtrar | Margen | Elo pedido a Maia | Temperatura | Verificación |
| ---- | ------- | ------ | ----------------- | ----------- | ------------ |
| 1800 | 0       | 300    | 1800              | ×1          | 150 ms       |
| 2000 | 0,5     | 300    | 1850              | ×1          | 150 ms       |
| 2200 | 1       | 225    | 1900              | ×1          | 150 ms       |
| 2400 | 1       | 150    | 2100              | ×1          | 150 ms       |
| 2600 | 1       | 105    | 2200              | ×0,85       | 275 ms       |
| 2800 | 1       | 60     | 2200              | ×0,7        | 400 ms       |

- Hasta 2000 el margen de 300 cp solo quita los errores bruscos (lo que el autor notó en la prueba
  a ciegas) y deja las imprecisiones humanas.
- A Maia se le pide hasta 300 puntos menos con filtro completo.
- Arriba de 2400 lo que separa los niveles es la consistencia: temperatura más baja y margen más
  estrecho.

### Calibración, ronda 2 (plan v2)

50 partidas, ~13 min.

| Enfrentamiento    | Puntuación | Elo medido | Esperado |
| ----------------- | ---------- | ---------- | -------- |
| 2000 vs Maia 2000 | 50 %       | 0          | 0        |
| 2200 vs Maia 2200 | 85 %       | +301       | 0        |
| 2400 vs Maia 2200 | 70 %       | +147       | +200     |
| 2600 vs bot 2400  | 85 %       | +301       | +200     |
| 2800 vs bot 2600  | 55 %       | +35        | +200     |

Modelo que sale de las dos rondas: con filtro activo y margen de 225 cp o menos, el bot juega
~400 puntos por encima del Elo pedido a Maia; con el margen amplio de 2000 (300 cp, la mitad de las
jugadas), ~150. Por encima de ~100 cp, estrechar el margen ya no separa niveles; lo que separa 2800
de 2600 es pedir más a Maia.

### Plan v3

| Elo  | Filtrar | Margen | Elo pedido a Maia | Temperatura | Verificación |
| ---- | ------- | ------ | ----------------- | ----------- | ------------ |
| 1800 | 0       | 300    | 1800              | ×1          | 150 ms       |
| 2000 | 0,5     | 300    | 1850              | ×1          | 150 ms       |
| 2200 | 1       | 225    | 1800              | ×1          | 150 ms       |
| 2400 | 1       | 150    | 2000              | ×1          | 150 ms       |
| 2600 | 1       | 105    | 2200              | ×0,85       | 275 ms       |
| 2800 | 1       | 60     | 2400              | ×0,7        | 400 ms       |

### Calibración, ronda 3 (plan v3, vigente)

Solo los puntos que cambian; 30 partidas, ~7 min. Tiempo total de las tres rondas: ~38 min.

| Enfrentamiento    | Puntuación | Elo medido (95 %)  | Esperado |
| ----------------- | ---------- | ------------------ | -------- |
| 2200 vs Maia 2200 | 70 %       | +147 (−43 a +558)  | 0        |
| 2400 vs Maia 2200 | 85 %       | +301 (+101 a +798) | +200     |
| 2800 vs bot 2600  | 55 %       | +35 (−165 a +265)  | +200     |

Conclusiones:

1. **Hasta 2400 la escala es coherente** dentro del ruido de 10 partidas (±200): 2000 exacto, 2200
   y 2400 con el signo y el orden correctos.
2. **Por encima de 2600 no se consigue separar niveles**: en tres rondas y tres configuraciones
   (margen más estrecho, temperatura más baja, más Elo pedido a Maia, más tiempo de verificación)
   el 2800 empata con el 2600. Las etiquetas por encima de ~2600 no son fiables con este método.
   Decisión pendiente del autor para el catálogo (ver abajo).
3. La v1 es aproximada, como se acordó: se afinará con partidas reales y la opinión de los usuarios.

**Decisión del autor (2026-10-18)**: el techo del catálogo queda en **2600** hasta encontrar otro
método para los niveles más altos (por ejemplo, búsqueda con el modelo humano, como _Allie_). Con la
fórmula de ritmos, el bot más fuerte queda en 2388 en rápida y 2185 en clásica.

### Cambio de enfoque (2026-10-18): Maia puro hasta 2400

Propuesta del autor, adoptada: la escalera de Maia es coherente entre sí (un 1900 le gana a un 1800
con la frecuencia con que lo haría un humano), errores incluidos, y mezclar el filtro desde 1800 la
alteraba sin medir los saltos intermedios. Ahora:

- **Hasta 2400, Maia puro** a su Elo (sin filtro, sin compensación). Los planes v1 a v3 de arriba
  quedan solo como historia.
- **Por encima de 2400, Maia 2400 con filtro**, cada nivel medido contra Maia 2400.
- Si el autor decide más adelante que los bots son más débiles que su número, se baja solo el número
  mostrado (`BOT_RATING_DISPLAY_OFFSET` en `src/utils/botRating.ts`, aplicado antes de la fórmula
  de ritmos), nunca el motor.

### Calibración v4 (Maia 2400 + filtro)

60 partidas, ~11 min.

| Bot  | Margen | Puntuación | Elo medido (95 %)  | Esperado |
| ---- | ------ | ---------- | ------------------ | -------- |
| 2500 | 400    | 83 %       | +280 (+108 a +798) | +100     |
| 2600 | 250    | 67 %       | +120 (−43 a +371)  | +200     |
| 2700 | 150    | 90 %       | +382 (+198 a +798) | +300     |
| 2800 | 80     | 97 %       | +585 (+384 a +798) | +400     |

Hay escalera por encima de 2400: un 2800 ya juega muy por encima. Incluso un margen de 400 cp (solo
los errores catastróficos) suma ~250 puntos, así que el 2500 solo filtra la mitad de las jugadas.

### Calibración v5 y márgenes vigentes

60 partidas, ~13 min. Las dos rondas (v4 y v5) suman ~24 min.

| Bot  | Margen                     | Puntuación | Elo medido (95 %)  | Esperado |
| ---- | -------------------------- | ---------- | ------------------ | -------- |
| 2500 | 400 (mitad de las jugadas) | 57 %       | +47 (−119 a +239)  | +100     |
| 2600 | 400                        | 53 %       | +23 (−139 a +197)  | +200     |
| 2700 | 200                        | 80 %       | +241 (+100 a +552) | +300     |
| 2800 | 130                        | 93 %       | +458 (+244 a +798) | +400     |

Juntando v4 y v5 (30 partidas por margen) la curva es coherente: 400 cp ~+150, 250 cp ~+120,
200 cp ~+240, 150 cp ~+380, 130 cp ~+460, 80 cp ~+585 frente a Maia 2400. **Márgenes vigentes**: 2500
→ 400 cp con la mitad de las jugadas filtradas, 2600 → 220, 2700 → 175 y 2800 → 140 (interpolados
para los puestos intermedios). Con 15–30 partidas por punto el ruido es de ±150–200: se afinará con
las partidas reales. _Revisados el 2026-10-23; ver la sección siguiente._

**Techo**: el método funciona, así que el catálogo vuelve a llegar a **2800** (cuatro bots entre 2650
y 2800).

### Revisión con el laboratorio de modelos (2026-10-21 a 2026-10-27)

El autor midió los bots del catálogo en el laboratorio de modelos (Generador), con matches de 40
partidas (~30 min cada uno). Hubo tres problemas de medida antes de llegar a datos fiables:

1. **El laboratorio no usaba el bot real.** En modo Generador `botPlay` era nulo: sin estilo ni
   filtro, y un bot de 2750 era Maia pedido a 2750 (fuera de su rango) con `OppoElo` 1500. Valentina
   2750 perdió contra Maia 2400 (8,5 – 11,5). Corregido: el Generador juega el bot como en una
   partida real si hay Stockfish, y pasa el Elo objetivo del rival Maia como `OppoElo`.
2. **Partidas casi idénticas.** Con repertorio (hasta el ply 18 en los teóricos) y Maia sin estilo
   eligiendo siempre su jugada más probable (`Temperature 0`), las 40 partidas de un match salían de
   dos líneas: todas las de Javier con negras eran la misma Najdorf. Un match medía quién juega mejor
   esa posición. Solución: opción **Aperturas variadas** del lote (`opening_suite` en
   `model_game_batch.rs`): 20 aperturas equilibradas de 8 plies, cada una una vez con cada color, sin
   repertorios ni libro.
3. **Ruido.** Con 40 partidas el intervalo al 95 % es de ±100 Elo, y la diferencia entre dos matches
   de ±140. Un «estilo que complica cuesta 80 Elo» salió de dos matches y desapareció al repetirlos.
   El control equilibrista contra equilibrista del laboratorio de estilos ya había dado −147 con 20
   partidas. **Regla**: no recalibrar por un solo match de 40; repetirlo y sumar.

**Cambios que quedan**:

- **Filtro en todas las jugadas desde 2450** (`bot_strength.rs`). Filtrar solo una parte hasta 2600
  dejaba 2450–2550 sin ganancia: −12 ± 28 Elo juntando 120 partidas. Márgenes: 2450 → 400 cp, 2600 →
  220, 2700 → 175, 2800 → 140 (lineales entre medias).
- **Estilo que complica** (`bot_style.rs`): no penaliza una recaptura en la casilla donde el rival
  acaba de capturar, y una pieza propia atacada solo cuenta como tensión si está defendida y ningún
  atacante vale menos. Es una corrección de lógica; su efecto en la fuerza no se pudo medir.

**Resultados con aperturas variadas** (40 partidas cada uno; Elo del bot):

| Match                      | Puntos      | Elo medido | Esperado |
| -------------------------- | ----------- | ---------- | -------- |
| Atlas 2400 – Maia 2400     | 18 – 22     | −35        | 0        |
| Inés 2450 – Maia 2400      | 25 – 15     | +89        | +50      |
| Javier 2500 – Maia 2400    | 29 – 11     | +169       | +100     |
| Karla 2550 – Maia 2400     | 25,5 – 14,5 | +98        | +150     |
| Lorenzo 2600 – Maia 2400   | 31,5 – 8,5  | +228       | +200     |
| Sebastián 2700 – Maia 2400 | 34 – 6      | +301       | +300     |
| Maximiliano 2800 – Lorenzo | 26,5 – 13,5 | +117       | +200     |

Todos dentro de ~1σ. El tramo 2450–2550 promedia +119 en 2500 (esperado +100). Maximiliano queda en
~+345 sobre Maia 2400 (esperado +400): dentro del ruido, pero es la tercera medida en que rinde algo
menos; si se confirma, bajar el margen de 2800 a ~125 cp.

**Estilos** (bot con estilo contra un equilibrista del mismo Elo, 40 partidas):

| Match                          | Puntos      | Elo |
| ------------------------------ | ----------- | --- |
| Ximena (salvaje) – Tobías 1700 | 21,5 – 18,5 | +26 |
| Julia (acechador) – Tomás 2300 | 17 – 23     | −52 |
| Laura (guardián) – Atlas 2400  | 16,5 – 23,5 | −61 |
| Dora (rematador) – Ariel 2000  | 23,5 – 16,5 | +61 |

Media −7 ± 25: las personalidades cambian cómo juega el bot, no su nivel, al menos en nada que
40 partidas puedan distinguir (~100 Elo).

**Pendiente**: las ligas de bots del Generador juegan con repertorio, así que dos bots pueden repetir
casi la misma partida cada vez que se enfrentan; revisar si conviene variar las aperturas también ahí.

## Paso 6 — Rating por ritmo y partidas puntuables (2026-10-18)

- `src/utils/botRating.ts`: ritmo de Lichess, Elo del bot por ritmo (fórmula revisada), Glicko-2
  con un periodo por partida (como Lichess; el bot cuenta como rating fijo con desviación 60) y
  provisional con desviación > 110 («?»). Estado en `bot-ratings.json`.
- **Preparación de la partida**: «Tipo de partida» Amistosa / Puntuable, solo contra bots del
  catálogo. Si no puede ser puntuable se explica por qué: posición inicial distinta, sin reloj,
  relojes distintos, bullet, libro de aperturas activo o sin Stockfish. Muestra el ritmo, tu rating
  y el del bot. Por defecto, amistosa.
- **Tarjeta del bot**: su Elo en el ritmo del reloj elegido, con los tres ritmos al pasar el ratón.
- **Durante la partida**: deshacer una jugada la convierte en amistosa, con aviso.
- **Al terminar**: aviso con el rating nuevo y el cambio; el historial guarda tipo, ritmo y rating
  antes y después.
- **Bases de partidas**: cada partida se añade a «Partidas puntuables contra bots de Onyx» o
  «Partidas amistosas contra bots de Onyx» (`onyx-bot-games-*.db3` en la carpeta de bases), con el
  nombre de tu ficha y los Elo de ambos.
- **Ficha** (corregido el 2026-10-18 tras la prueba del autor): las partidas contra bots no se
  mezclan con las fuentes de la ficha. En la cabecera, junto a las pestañas, un selector **Cuentas /
  Bots / Todas** elige qué partidas se ven y se analizan; cada opción tiene su propio perfil de
  análisis, y «Cuentas» conserva el de siempre. La primera versión las añadía como una fuente más,
  lo que cambiaba el identificador del perfil de análisis (se calcula con las fuentes) y dejaba la
  pestaña Análisis aparentemente vacía; los datos no se perdían. En el panel de partidas contra bots
  se elige cuáles quedan disponibles: puntuables (por defecto), puntuables y amistosas, o ninguna.
- **Panel**: tres casillas con tu rating de blitz, rápida y clásica, y una columna «Tipo» en el
  historial.

## Catálogo (2026-10-18)

- **74 bots**: los 15 originales sin cambios (su historial sigue valiendo) y 59 nuevos, entre ellos
  Lucy, Tiffany, Herson, Josymar, Jose, David, Brandon y Billy (India de Rey contra d4). Escalera
  800, 900, 1000 y de 50 en 50 hasta 2800; dos bots por puesto entre 1300 y 2400 y tres en los
  puestos más jugados. Margen para unos 10–15 más.
- **Fichas** en `src/utils/botCatalogSpecs.ts`: nombre, Elo, personalidad de juego, de apertura y
  cuatro familias (con blancas, contra e4, contra d4 y contra aperturas de flanco). Muestreo, tiempos y
  profundidad del repertorio salen del Elo y del estilo de apertura (los menos teóricos dejan el
  repertorio antes).
- **Repertorios** en `src/utils/botOpenings.ts`: ~120 líneas en SAN (Española, Italiana, Escocesa,
  Vienesa, gambitos, Gambito de Dama, Catalana, Londres, Colle-Zukertort, Trompowsky, Inglesa,
  Réti con g3 y con c4; Najdorf, Dragón, Sveshnikov, Taimanov, Francesa, Caro-Kann, Berlinesa, Petrov,
  Escandinava, Pirc, Moderna, Alekhine; GDR, Eslava, Semieslava, GDA, Nimzoindia, India de Rey,
  Grünfeld, Benoni, Benko, Holandesa, Albin, Chigorin…) agrupadas en 49 familias. Cada línea de un
  jugador de e4 incluye su respuesta propia a la Siciliana, la Francesa, la Caro-Kann, etc. Una
  prueba comprueba que todas son legales. Popularidad escrita a mano; la versión medida con la base
  de Lichess por rango de Elo queda para la Fase 10.
- **Explorador de bots**: en la preparación de la partida, una tarjeta del bot elegido (Elo en el
  ritmo del reloj, personalidades, aperturas y tu marcador contra él) con el botón «Cambiar», que abre
  el explorador: búsqueda por nombre o apertura, rango de Elo, filtros por personalidad de juego y de
  apertura y por apertura concreta.

## Panel de partida contra un bot (2026-10-18)

Tras la prueba del autor (el tipo de partida, el ritmo y el bot quedaban separados y el motor Maia
ocupaba el primer lugar):

- Cuando un humano juega contra un bot del catálogo, la preparación muestra un **panel único**
  (`BotGameSetup.tsx`) en lugar de las dos columnas de jugadores, en este orden: **rival** (tarjeta
  del bot y explorador), **ritmo** (relojes habituales agrupados en blitz, rápida y clásica, sin reloj
  o personalizado; el mismo reloj para los dos), **tipo de partida**, **color** y **opciones
  avanzadas** plegadas (tu nombre, tiempo de reflexión humano, motor Maia y libro de aperturas).
- El **explorador** incluye el selector de ritmo arriba: el Elo que muestra es el del ritmo elegido
  y se cambia sin salir.
- «Configurar jugadores a mano» vuelve a las dos columnas de siempre, y desde ahí un botón regresa
  al panel.
- En la vista manual, el selector del motor Maia pasa al final del bot.

## Partida guiada (I-52, 2026-10-18)

- En el panel de partida contra un bot, sección **Ayuda**: Sin ayuda (por defecto), Avisos, o Avisos
  y pistas. Con ayuda, la partida siempre es amistosa.
- En tu turno, una búsqueda corta de Stockfish (700 ms, MultiPV 2, 1 hilo) decide si el momento es
  **crítico**: la mejor jugada supera a la segunda en 1,5 peones o más con la partida sin decidir
  (`src/utils/guidedPlay.ts`). No avisa en partidas ya ganadas o perdidas, sí cuando una sola jugada
  salva una posición difícil.
- El panel «Partida guiada» de la partida muestra «Posición tranquila» o «Momento crítico». Con
  pistas, primero se puede pedir **la pieza** (círculo en el tablero) y después **la jugada**
  (flecha).

## Jugadores generados (I-49, 2026-10-18)

`src/utils/botGeneratedPlayers.ts`: con una semilla y un Elo se sortean nombre, personalidades y
familias de apertura acordes al estilo. El identificador `gen-<semilla>-<elo>` basta para
reconstruirlo idéntico (`getHumanBotProfile` lo entiende), así que un torneo solo guarda ids. Se usan
en 9.2; todavía no aparecen en el explorador.

## Validación manual pendiente

1. Panel de partida contra un bot: ritmo, tipo, color, ayuda y opciones avanzadas.
2. Explorador: filtros, búsqueda y selector de ritmo.
3. Partida puntuable completa en cada ritmo, cambio de rating y paso a amistosa al deshacer.
4. Partida guiada con avisos y con pistas.
5. Ficha: Cuentas / Bots / Todas.
6. Instalación limpia en otro PC: Maia desde Motores, Stockfish, partida puntuable con un bot de
   estilo y líneas `onyx-policy` en los registros del motor.
