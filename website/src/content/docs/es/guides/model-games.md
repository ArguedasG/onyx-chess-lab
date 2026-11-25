---
title: Partidas modelo
description: Genera partidas entre motores y bots desde cualquier posición para ver cómo se juega, una a una o por lotes.
---

El **Generador de partidas modelo** juega partidas entre dos motores o bots desde la posición que elijas. Sirve para ver cómo suele seguir una posición: qué planes aparecen, quién gana y cómo, o cómo jugaría un final un jugador de cierto nivel.

## Abrir el generador

- Desde el inicio o la barra lateral, con **Generador de partidas modelo**. La tarjeta de posición inicial tiene **Editar tablero / FEN** para elegir desde dónde empezar.
- Desde el tablero de análisis, en la posición que te interese. El generador conserva las jugadas que llevaron hasta ella, para que reglas como la triple repetición funcionen bien.

## Configurar los jugadores

Blancas y negras se configuran por separado. Cada lado puede ser:

- un **motor UCI**, como Stockfish o Lc0, con un ajuste limitado, fuerte, de referencia o personalizado;
- un **bot humano**, que juega como una persona de su nivel (ver [Bots y torneos](../bots-and-tournaments/)).

Según el jugador se elige el tiempo, la profundidad o los nodos por jugada. Para comparar, por ejemplo, cómo juegan una posición un jugador de 1500 y uno de 2200, enfrenta dos bots de esos niveles.

## Una partida o un lote

Con una sola partida ves el resultado jugada a jugada y puedes repetirla con la misma configuración o editarla.

Con **Ejecutar un lote** generas hasta 1000 partidas:

- **Alternar colores** cambia los jugadores de lado cada dos partidas.
- **Aperturas variadas** empieza desde 20 aperturas equilibradas, cada una con ambos colores, para que las partidas no se repitan.
- Puedes limitar cuántas partidas se juegan a la vez y cuánta CPU y memoria usan, pausar el lote y reanudarlo.

El lote sigue en marcha aunque cambies de pestaña.

## Experimentos

Cada partida o lote se guarda como un **experimento**, con sus partidas, su configuración y el resultado. Desde **Ver experimentos** puedes:

- abrir cualquier partida en el tablero de análisis;
- guardar las partidas en un estudio (una por capítulo), en un repertorio como partidas modelo o en un PGN;
- exportar la carpeta completa del experimento o eliminarlo.

Desde el generador también se abren los **torneos de bots**, ligas automáticas en las que varios bots juegan todos contra todos.
