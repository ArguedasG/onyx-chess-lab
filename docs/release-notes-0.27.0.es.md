# Onyx Chess Lab 0.27.0

Maia 3 llega a macOS y Linux con la misma instalación de un clic que en Windows, las bases de datos
ganan una búsqueda por patrón de piezas y cada sección explica qué se puede hacer en ella. También
arregla los libros en Macs con un Safari antiguo y detecta las descargas de bases dañadas, a partir
del aviso de un usuario de Mac.

## Maia 3 en macOS y Linux

- «Motores recomendados» instala Maia 3, el motor de los bots humanos, los torneos y los gemelos,
  también en macOS (Apple Silicon e Intel) y Linux x64. Onyx descarga su propio Python 3.11,
  PyTorch y el modelo Maia3-5M, comprobados por versión y suma SHA-256; no hace falta tener Python
  en el sistema.
- **Apple Silicon:** necesita macOS 14 (Sonoma) o más nuevo, como exige PyTorch. En versiones
  anteriores la instalación se detiene al principio con un mensaje claro.
- **Mac Intel:** PyTorch dejó de publicarse para ellos en la versión 2.2.2, a la que le falta una
  pieza que usa Maia 3 (`RMSNorm`). Onyx añade un pequeño módulo de compatibilidad solo en esos Mac;
  probado con las mismas posiciones y semilla, da exactamente las mismas evaluaciones y jugadas que
  la versión actual.
- **Linux:** se instala PyTorch solo para CPU desde el servidor de PyTorch, sin los varios GB de
  librerías de CUDA. Necesita glibc 2.28 o más nuevo (Ubuntu 20.04, Debian 10 o posteriores).
- Por ahora solo se ha validado en Windows. El README explica los requisitos y cómo instalar Maia a
  mano si la instalación guiada falla.

## Una guía en cada sección

- Táctica, Aperturas, Finales, Libros, Estudios, Bases de datos, Jugadores y Torneos tienen un botón
  **«¿Qué puedo hacer aquí?»**: para qué sirve la sección, qué se puede hacer y por dónde empezar.

## Bases de datos

- **Búsqueda por patrón** (botón «Patrón» del panel Base de datos): se dibujan solo las piezas que
  importan, se marcan las casillas que deben estar vacías, se elige el turno o «Solo estas piezas»,
  y aparecen las partidas en las que ese patrón se dio en algún momento, sea cual sea el resto del
  tablero. La primera búsqueda prepara la base una sola vez (unos dos minutos y 2 GB para 10
  millones de partidas); después, cada patrón tarda segundos.
- **Filtros comunes** de Elo (también del jugador y del rival) y fechas en la lista de partidas, el
  panel Base de datos del tablero y el Análisis del jugador, con un botón para limpiarlos.
- Nueva cabecera de la partida en el tablero: evento, lugar, ronda, Elo y apertura, con textos
  claros cuando faltan.
- Con la zona de herramientas plegada, el tablero ya no consulta la base de referencia en cada
  jugada.

## Entrenamiento

- **Aperturas:** «Buscar una jugada» encuentra una jugada en todas las secciones del repertorio,
  entrenadas o no, en cualquier momento y variante, y abre la sección en ella.
- **Táctica:** «Entrenar fallados», en el menú ⋯ de cada set, repite solo los ejercicios cuyo último
  intento falló, al azar o en orden.
- **Entrenador de puzzles:** el botón de marcador guarda un puzzle ya terminado en uno de tus sets.

## Interfaz

- Ctrl+Mayús+B oculta la barra lateral y Ctrl+Mayús+T la barra de pestañas (Cmd en macOS), para
  dar más espacio al tablero. Se cambian en Configuración → Atajos de teclado.
- Al borrar un estudio se muestra su nombre y se recuerda que va a la papelera.
- Jugadores: nuevo periodo «1 mes».

## Arreglos

- **Libros en Macs antiguos:** con un Safari anterior a 17.4, abrir un PDF fallaba con «Promise.withResolvers
  is not a function». pdf.js usa funciones recientes sin alternativa; Onyx las añade cuando faltan,
  también en el proceso que lee el PDF. En Windows no cambia nada.
- **Descargas de bases:** si lo descargado no es una base SQLite (por ejemplo, una página web puesta
  en su lugar por un proxy, un antivirus o un cortafuegos), no se guarda y el error explica qué llegó.
  Una base dañada ya no espera 30 segundos para decir «timed out waiting for connection»: explica el
  motivo al instante, y su panel tiene un botón **Eliminar** para quitarla y descargarla otra vez.
- Los bots humanos muestran su Elo en el ritmo de la partida (el del catálogo es un nivel de blitz),
  en el tablero y en el historial de bots.
- Los filtros de fecha de jugadores guardados antes de esta versión vuelven a compararse bien.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
