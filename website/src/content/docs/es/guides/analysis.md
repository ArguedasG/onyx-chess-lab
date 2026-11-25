---
title: Análisis
description: El tablero de análisis de Onyx, el reporte de una partida, el panel de base de datos y lo que se puede hacer con cualquier posición.
---

El tablero de análisis es el centro de Onyx. Desde él se analiza con el motor, se consultan tus bases y cualquier posición pasa al entrenamiento, a un estudio o a un repertorio.

## Abrir una partida

- **Tablero de análisis** en el inicio o en la barra lateral abre un tablero vacío.
- Desde **Bases de datos**, **Estudios**, **Jugadores** o un archivo PGN, cualquier partida se abre en una pestaña nueva.
- Con **Importar** pegas un PGN o una FEN. En el editor de posición, **Desde imagen** convierte una captura de pantalla en una posición.

Las jugadas, variantes, comentarios y anotaciones (!, ?, !?, ±…) se editan directamente en la notación. Con la flecha derecha avanzas, con la izquierda retrocedes, y la barra espaciadora juega la mejor jugada del motor.

## El panel derecho

Las tres pestañas principales son:

- **Análisis:** los motores que tengas activos, con sus líneas, la evaluación y la profundidad. Puedes tener varios a la vez y cambiar sus opciones con la tuerca.
- **Base de datos:** lo que se jugó en esta posición en tu base local, en Lichess o en Lichess Masters. Tiene cuatro vistas:
  - **Jugadas**, con su puntuación;
  - **Partidas**, la lista de partidas que pasaron por aquí;
  - **Planes**, qué suele hacer cada bando en las próximas jugadas, en cualquier orden, dibujado en el tablero con flechas numeradas;
  - **Informe**, un informe completo de la posición o de la apertura.
- **Información:** los datos de la partida: jugadores, evento, fecha y resultado.

En la cabecera de la notación aparece el nombre de la apertura y, cuando la reconoce, la estructura de peones de la posición.

En **Base de datos**, **Buscar por** cambia la búsqueda por posición exacta por la de **estructura de peones** o la de **patrón** (solo las piezas que importan), y **Filtros** limita por Elo, fecha, ritmo o resultado.

## El reporte de una partida

En la pestaña **Análisis**, **Generar reporte** analiza toda la partida con el motor:

- clasifica imprecisiones, errores y errores graves según la probabilidad de ganar que se pierde, no solo los centipeones;
- muestra los **Momentos clave**, las jugadas que decidieron la partida;
- marca la primera jugada que no está en tu base de referencia (la novedad).

Por defecto dedica 250 ms a cada posición y vuelve a mirar más a fondo las jugadas dudosas. Las posiciones ya analizadas se guardan, así que repetir un reporte es casi instantáneo. Si quieres, puede tomar de la nube de Lichess las evaluaciones de las primeras jugadas; está desactivado por defecto porque envía esas posiciones a Lichess.

Después, **Aprende de tus errores** te lleva a cada error para que encuentres una jugada mejor. Al terminar, Onyx explica qué permitía tu jugada, con flechas en el tablero.

## Acciones de la posición

El menú de la posición actual permite:

- buscar la posición en tus repertorios, distinguiendo si llegaste por la misma ruta o por una transposición;
- crear un ejercicio de táctica o de finales a partir de ella;
- añadirla a un estudio o a un repertorio;
- **Generar repertorio desde aquí** o **Buscar sorpresas en esta línea**;
- abrir el generador de partidas modelo en esa posición (ver [Partidas modelo](../model-games/)).
