# Onyx Chess Lab 0.19.1

Versión pequeña de mejoras y correcciones. El reporte de análisis permite repasar los errores
propios al estilo de Lichess, las partidas de referencia se pueden seleccionar y usar con clic
derecho, los comentarios pueden enlazar partidas de la base de datos y las partidas contra bots
avisan cuando quedan pocos segundos y cuando terminan. Se corrigen dos fallos del tablero.

## Tablero

- Corregido: al empezar una partida contra un bot (o entre bots) el tablero podía quedar demasiado
  grande y tapar el nombre y el reloj del jugador de abajo hasta mover el panel derecho.
- Corregido: tras aparecer las barras de jugador, los clics podían caer una fila más abajo (al
  pulsar un peón se tomaba la pieza de detrás).
- Al pasar el cursor sobre la barra de evaluación aparece el valor exacto (por ejemplo +1.20) junto
  al cursor.

## Aprende de tus errores

- Al terminar el reporte de análisis aparecen los botones Blancas y Negras, con el número de
  errores (?) y errores graves (??) de cada bando. Las imprecisiones no se incluyen.
- Cada error se plantea como un ejercicio desde la posición anterior: hay que encontrar una jugada
  mejor que la de la partida. El motor valida cada intento; se acepta si conserva prácticamente la
  misma ventaja que la mejor jugada.
- Se puede reintentar, ver la solución o saltar al siguiente; al final se muestra un resumen.
- Como en Lichess, el motor en vivo se apaga al empezar y la notación se oculta mientras dura el
  repaso, para no revelar la respuesta. La partida no se modifica.
- Necesita Stockfish u otro motor local.

## Partidas de referencia

- La paginación pasa a la cabecera, junto al orden ascendente/descendente: más espacio para la
  lista.
- Selección múltiple como en el explorador de archivos: Ctrl + clic (o Ctrl + clic derecho) añade
  o quita partidas y Mayús + clic selecciona un rango.
- Clic derecho abre un menú que actúa sobre todas las seleccionadas: abrir en el tablero de
  análisis, añadir a un estudio, enlazar en el comentario de la jugada actual, copiar enlace,
  copiar PGN y guardar como PGN.

## Enlaces a partidas en los comentarios

- Un comentario puede enlazar una partida de una base de datos local. Al hacer clic en el enlace
  (marcado con un pequeño icono) la partida se abre en una pestaña nueva, en la misma posición.
- Se crea desde el menú de clic derecho de las partidas de referencia (“Enlazar en el comentario
  de la jugada actual” o “Copiar enlace a la partida” para pegarlo en cualquier comentario).
- El enlace es un link Markdown normal dentro del comentario, así que se conserva al exportar el
  PGN. Apunta a la base por su nombre de archivo y a la partida por su número dentro de ella.

## Jugar contra bots

- Los bots humanos piensan más tiempo por jugada (aproximadamente el doble), sin dejar de adaptar
  la pausa al reloj para no perder por tiempo.
- Con poco tiempo el reloj se pone rojo y suena un aviso una vez por partida.
- Al terminar la partida suena un acorde (victoria, derrota o tablas) y aparece un aviso breve con
  el motivo, por ejemplo “Jaque mate · ¡Ganaste!”. En un mate, el rey mateado queda marcado con un
  círculo rojo.

## Entrenamiento

- Sonido al acertar una jugada en táctica y en aperturas.

## Estudios y bases de datos

- “Añadir a un estudio” propone el último estudio usado en lugar del primero de la lista.
- El botón para crear un capítulo se llama ahora “Nuevo”.
- “Eliminar duplicados” y “Eliminar partidas vacías” muestran cuántas partidas se eliminaron.

## Compatibilidad

- Se conservan repertorios, estudios, progreso de entrenamiento, bases de datos, análisis y
  ajustes.
