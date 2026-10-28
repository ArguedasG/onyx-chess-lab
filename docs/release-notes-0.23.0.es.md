# Onyx Chess Lab 0.23.0

La versión de la **Fase 9**. Reúne 9.1 (bots), 9.2 (torneos) y 9.3 (estructuras de peones y gemelo),
la revisión de la calibración de los bots y varias mejoras pedidas por el autor tras usar la app.

## Bots (9.1)

- **Catálogo de 74 bots** de 800 a 2800, cada uno con una personalidad de juego (rematador,
  salvaje, guardián, acechador, equilibrista), un estilo de apertura y un repertorio propio de
  unas 120 líneas agrupadas en 49 familias. **Explorador de bots** con búsqueda, rango de Elo y
  filtros por personalidad y apertura.
- **Estilos reales:** el bot pide a Maia sus candidatas y reordena sus probabilidades según el
  estilo, solo entre las jugadas que Stockfish mantiene cerca de la mejor. El estilo cambia cómo
  juega, no su nivel.
- **Bots fuertes:** desde 2450 Stockfish descarta las candidatas de Maia que pierden más de un
  margen, cada vez más estrecho hasta 2800. Calibrado con matches contra Maia 2400 y con aperturas
  variadas en el Generador.
- **Tiempo de reflexión humano** por ritmo (rápidas ×1,6, clásicas ×2,5 sobre blitz), con más
  tiempo al salir del libro y en posiciones críticas y menos en recapturas.
- **Rating contra los bots** en blitz, rápidas y clásicas (Glicko-2, provisional al principio).
  Partidas puntuables y amistosas, guardadas en la base «Partidas contra bots de Onyx», que aparece
  como fuente en tu ficha. Bullet, sin reloj y con ayudas: siempre amistosas.
- **Panel único** para jugar contra un bot: rival, ritmo, tipo de partida, color, ayuda y opciones
  avanzadas plegadas.
- **Partida guiada:** avisos en los momentos críticos y, con pistas, la pieza y después la jugada.
- **Generador:** juega los bots igual que en una partida real y añade la opción **Aperturas
  variadas** (20 aperturas, cada una con ambos colores) para medir sin repetir la misma partida.

## Torneos (9.2)

- Nueva sección **Torneos**, en la que el protagonista eres tú: todos contra todos, suizo,
  eliminación directa y doble eliminación.
- **Plantillas** sobre tu rating en el ritmo del torneo (todos de mi nivel, soy el favorito, todos
  son mejores que yo, campo mixto y otras experimentales) que llenan el campo con bots del catálogo
  y jugadores generados.
- Los tableros sin ti se resuelven con un modelo de Elo y estilo, marcados como simulados.
- **Calendario local** opcional (diario, semanal y mensual), partidas puntuables por torneo,
  armagedón en las eliminatorias, retirada, rendimiento, puntos frente a lo esperado y exportación
  PGN.

## Estructuras de peones y gemelo (9.3)

- **28 estructuras con nombre en ocho familias**, siguiendo _Chess Structures_ de Mauricio Flores
  Rios: Caro-Kann y Eslava por separado, India de rey I, II y III, abierta y complejo, Najdorf I y
  II, Francesa I, II y III, Benoni asimétrica y simétrica, Stonewall, centro Grünfeld, Panov,
  Dragón, Scheveningen, Benko, Ruy López cerrada, formación López y 3-3 contra 4-2, además de las
  anteriores. Validadas con los esqueletos del libro y 20.000 partidas de la Gigabase.
- **Ficha de cada estructura:** esqueleto con las rupturas típicas, planes de cada bando (resúmenes
  propios), estructuras relacionadas, las partidas del jugador y **partidas modelo** de tu base de
  referencia, que se abren donde aparece la estructura o se **juegan desde ahí** contra Maia.
- En la ficha del jugador, las estructuras se agrupan por familias que se despliegan.
- **La estructura de la posición** aparece junto al nombre de la apertura en el tablero.
- **Gemelo:** piensa como el jugador, según los relojes de sus partidas en cada ritmo; su **estilo
  se mide frente a Maia** a su nivel y solo se usa si predice mejor sus partidas recientes; por
  encima de 2600 lo revisa Stockfish, hasta 2800.

## Otras mejoras

- **Buscar la estructura de peones** del tablero en tus repertorios (Acciones de la posición →
  Repertorios → Estructura de peones).
- **Secciones informativas** en los repertorios (estrategia, finales, ejercicios): se ven y analizan
  pero no se entrenan. Al importar un curso, los ejercicios que empiezan en su propia posición van a
  secciones informativas por capítulo en lugar de quedar fuera, y cualquier sección se puede marcar
  como informativa.
- **Más opciones del motor** en los ajustes del motor del tablero: todas las opciones UCI del motor
  (el Elo de Maia, por ejemplo), no solo líneas, núcleos y hash.
- **Novedades en tu idioma** en la ventana de actualización, que además es más ancha. Tendrá
  efecto a partir de la próxima actualización (la versión instalada debe saber leer las notas en
  español).

Tus repertorios, estudios, progreso de entrenamiento, bases, análisis y ajustes se conservan.
