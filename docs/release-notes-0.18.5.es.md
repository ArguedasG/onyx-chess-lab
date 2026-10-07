# Onyx Chess Lab 0.18.5

Esta versión añade timers y pistas a los sets tácticos, permite buscar partidas por estructura de
peones, hace más cómodo trabajar con los experimentos del generador de partidas modelo y corrige
los reportes de análisis que se quedaban cargando o salían vacíos.

## Tácticas

- Timer por ejercicio, como en los puzzles de Lichess. Se activa o desactiva al crear o editar el
  set y también durante la sesión.
- Botón “Pista”: marca la pieza que hay que mover y, al pulsarlo otra vez, la jugada completa. Como
  en los puzzles de Lichess, usar la pista cuenta como error. Necesita una solución preparada.
- Los tiempos se muestran en recuadros: tiempo del ejercicio, tiempo del ciclo y errores en
  Woodpecker, todos a la vez.
- Botón para pausar los timers. Se reanudan al jugar, al cambiar de ejercicio o al pulsarlo de
  nuevo; el tiempo en pausa no se registra.

## Base de datos

- Nueva búsqueda “Estructura de peones”: encuentra partidas que llegaron exactamente a los mismos
  peones, sin importar dónde estén las demás piezas. Se activa desde la cabecera del panel de base
  de datos o desde Opciones, y sigue al tablero mientras se juega.
- El selector de base de datos ya no se encoge hasta mostrar solo la primera letra.

## Generador de partidas modelo

- “Generar partida modelo desde esta posición” abre el generador en la posición elegida.
- Al analizar una partida de un experimento y volver, el experimento sigue abierto con la misma
  selección.
- Las partidas de un experimento se pueden seleccionar y guardar en un estudio (una por capítulo),
  en un repertorio como partidas modelo o en un archivo PGN.

## Reporte de análisis

- Cambiar de pestaña mientras se genera un reporte ya no lo pierde: el resultado llega a su pestaña
  y el botón ya no se queda cargando.
- Las novedades se buscan en una sola pasada por la base de referencia en vez de una por posición,
  lo que antes podía tardar muchos minutos con bases grandes.
- La novedad se calcula contra partidas anteriores a la fecha de la partida, así una partida tomada
  de la propia base también muestra su novedad. Sin fecha, se excluyen las partidas entre los mismos
  jugadores.
- Mientras se buscan novedades, las búsquedas del panel de base de datos tienen prioridad.
- Cancelar responde de inmediato, volver a generar el reporte cancela el anterior y los errores se
  muestran en lugar de producir un reporte vacío. Si el motor deja de responder en modo tiempo, el
  reporte se detiene con un aviso.

## Correcciones

- Menos casos de “database is locked”: las conexiones esperan a que termine otra operación antes de
  fallar.
- Las pestañas ya no reconstruyen toda la partida en cada redibujado, por ejemplo al mover los
  paneles.
- El modo de puzzles ya no bloquea la ventana al pedir un puzzle, no queda inutilizable si una base
  falla al abrirse y no mezcla puzzles al cambiar de base.
- Las listas de estudios y repertorios se abren por encima de su ventana al guardar partidas de un
  experimento.

## Compatibilidad y actualización

- Actualización estable y firmada para Windows x64 mediante el actualizador integrado de Onyx.
- Linux y macOS siguen publicándose como vista previa sin probar.
- Conserva repertorios, estudios, progreso de entrenamiento, bases, análisis y configuración
  existentes.
