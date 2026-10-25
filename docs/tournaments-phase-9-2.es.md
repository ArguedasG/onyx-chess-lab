# Fase 9.2 — Torneos

Inicio: 2026-10-18. Idea: I-51 del estudio de mercado (`docs/market-study.es.md`). **El usuario es
el protagonista**: solo sus partidas se juegan en el tablero; los torneos solo de bots siguen siendo
un experimento del Generador (liga de bots de la Fase 4.5).

## Decisiones

- **Sección propia** «Torneos» en la barra lateral, debajo de «Jugar», con la misma estructura que
  Jugadores: la lista de torneos a la izquierda y el torneo elegido (o el calendario y las
  plantillas) a la derecha.
- **«Todos de mi nivel» = ±100** de tu rating por defecto, ajustable en la creación (de 25 a 400).
  Todas las plantillas se calculan sobre tu rating contra los bots **en el ritmo del torneo**
  (I-50); si es provisional se avisa y se puede corregir a mano para ese torneo.
- **Rendimiento (I-51, regla 6 de la sección 7 del estudio):** los tableros sin el usuario se
  resuelven con un modelo estadístico, nunca con motores. Un abierto de 100 jugadores a 9 rondas
  se simula en milisegundos.
- **Los demás tableros se revelan al terminar tu partida**, como si se jugaran a la vez; la ronda
  avanza sola en cuanto tu partida termina.
- **Partidas puntuables por torneo:** se decide al crearlo (activado por defecto si es posible:
  mismo reloj, no bullet y Stockfish instalado). Las partidas de torneo se juegan sin ayudas, sin
  libro de aperturas compartido y sin deshacer jugadas.
- **Desempate de eliminación:** una o dos partidas por enfrentamiento y, si hay empate, una partida
  de armagedón (las blancas deben ganar; con tablas pasan las negras) con el mismo reloj. Las
  blancas del armagedón son para quien llevó negras en la primera partida.
- **Retirarse:** la partida pendiente se pierde por incomparecencia, no se te vuelve a emparejar y
  el resto del torneo se simula hasta el final.
- **Una partida anulada antes de la primera jugada no cuenta**: sigue pendiente y se puede jugar de
  nuevo. Una partida rendida o perdida por tiempo cuenta.

## Formatos

| Formato             | Emparejamiento                                                                                                                                                                                                                                                                                                                                                               | Desempates                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Todos contra todos  | Tablas de Berger (método del círculo), sorteo de números con la semilla; doble vuelta opcional.                                                                                                                                                                                                                                                                              | Sonneborn-Berger, victorias, rating                |
| Suizo               | Idea del sistema holandés: grupos de puntos, mitad superior contra inferior, sin repetir rival, colores alternados. Búsqueda acotada; solo en último caso se repite rival. Descanso (1 punto) para el último sin descanso previo, **nunca para el usuario si otro puede tomarlo**.                                                                                           | Buchholz -1, Buchholz, Sonneborn-Berger, victorias |
| Eliminación directa | Cuadro estándar (1 contra el último cabeza de serie), descansos para los primeros si el número no es potencia de 2.                                                                                                                                                                                                                                                          | Ronda de eliminación                               |
| Doble eliminación   | Cuadro de ganadores como el anterior; en el de perdedores, los que caen se cruzan con los supervivientes cuando hay tantos de unos como de otros y, si no, el grupo mayor juega entre sí; los que caen después esperan su turno. Gran final con desempate si gana el campeón de perdedores. Para 8 jugadores reproduce el cuadro clásico (7 + 6 enfrentamientos y la final). | Ronda de eliminación                               |

Tamaños: todos contra todos 3–16, suizo 6–150, eliminación 4–64, doble eliminación 4–32.

## Modelo de los tableros simulados

`src/utils/tournaments/simulation.ts`:

- Puntuación esperada por la fórmula de Elo, con 20 puntos de ventaja para las blancas.
- Tablas según el nivel medio (5 % a 1000, 7 % a 1500, 12 % a 2000, 20 % a 2400, 32 % a 2800,
  aproximadamente lo que muestra Lichess en blitz), reducidas cuando la diferencia es grande.
- Personalidad de juego (9.1): Rematador ×0,8 y Salvaje ×0,75 en las tablas; Guardián ×1,25;
  Acechador ×1,1.
- Reproducible: el resultado sale de la semilla del torneo y el id de la partida.
- En la interfaz se marca como **simulado** (icono de dado con la explicación); tus partidas, como
  jugadas en el tablero. No se presentan como partidas reales.

## Plantillas y autorrelleno

`src/utils/tournaments/templates.ts`. Rango sobre tu rating:

| Plantilla                     | Rivales                                                |
| ----------------------------- | ------------------------------------------------------ |
| Todos de mi nivel             | ±100 (ajustable)                                       |
| Soy el favorito               | de −400 a −100                                         |
| Todos son mejores que yo      | de +50 a +400                                          |
| Campo mixto                   | de −300 a +300                                         |
| Especialistas en una apertura | ±250, todos con la apertura elegida (experimental)     |
| Un solo estilo                | ±200, todos con la personalidad elegida (experimental) |
| Un gigante en el torneo       | ±150 y un rival ~450 por encima (experimental)         |
| Personalizado                 | filtros a mano                                         |

- Se reparten ratings objetivo por el rango; cada uno toma el **bot del catálogo** más cercano
  (hasta 60 puntos) y, si no hay, un **jugador generado** (I-49) con ese rating cuya semilla da la
  personalidad o la apertura pedidas. El mismo sorteo da siempre el mismo campo.
- En el tercer paso se ve el campo, se puede volver a sortear, quitar rivales (se reemplazan),
  añadir bots desde el explorador y cambiar filtros (rango, personalidades, estilo de apertura,
  apertura concreta y si se completa con generados).
- **País ficticio**: no existe todavía en los bots; queda pendiente.

## Calendario local

`src/utils/tournaments/calendar.ts`, opcional (interruptor «Mostrar»). Generado solo con la fecha,
sin servidor; cada periodo se puede jugar una vez:

- **Diario**, rota cada día: suizo de 24 a 5 rondas (3+2), todos contra todos de 6 (5+3),
  eliminación de 8 (3+2) o suizo de 16 a 4 rondas (5+0).
- **Semanal**, rota cada semana: suizo de 40 a 7 rondas (10+5), todos contra todos de 8 (10+0) o
  doble eliminación de 8 (10+5).
- **Mensual**: abierto suizo de 60 a 9 rondas (15+10).
- Campo «mixto» alrededor de tu rating en el momento de inscribirte.

## Partidas del usuario

- «Jugar» abre una pestaña con la partida ya configurada (rival, reloj, color) y la empieza sola.
- Durante la partida, una tarjeta recuerda el torneo, la ronda y lo que hay en juego.
- Al terminar: resultado, puesto y un botón directo a la siguiente partida («Ronda 4 contra X»).
- La partida se guarda en el torneo (PGN) y en la base de partidas contra bots, con el nombre del
  torneo como `Event` y la ronda en `Round`.
- Desde el torneo: analizar cualquier partida tuya y exportarlas todas en un PGN.
- Estadísticas: puesto, puntos, **rendimiento** (rating de actuación) y **puntos frente a lo
  esperado** según los ratings.

## Persistencia

`tournaments-v1.json` en la carpeta de datos, con el mismo esquema que `mistake-queue-v1.json`:
fuera del arranque, leído la primera vez que se abre la sección o termina una partida de torneo,
escritura atómica y archivo inválido apartado sin sobrescribir. La sección se carga de forma
diferida (`lazyRouteComponent`).

## Pruebas

`src/utils/tournaments/*.test.ts` (25): colores y rivales de Berger, suizo sin rivales repetidos y
con colores equilibrados, abierto de 100 jugadores a 9 rondas en menos de 3 s (unos milisegundos en
la práctica), descanso nunca para el usuario, retirada, cuadro y descansos de eliminación,
armagedón, doble eliminación con 3, 6, 8 y 16 jugadores, plantillas (±100 por defecto, favorito,
mejores, estilo único, gigante) y calendario.

## Validación manual pendiente

1. Crear un torneo con cada formato desde el asistente y comprobar el campo de cada plantilla.
2. Jugar una ronda completa: arranque automático, tarjeta durante la partida, resultado y botón de
   la siguiente ronda.
3. Partida puntuable dentro de un torneo: cambio de rating y partida en la base de puntuables.
4. Anular antes de la primera jugada (sigue pendiente) y rendirse (cuenta).
5. Empate en eliminación directa y armagedón.
6. Calendario: inscribirse, continuar y ocultarlo.
7. Retirarse, eliminar un torneo y exportar el PGN.
