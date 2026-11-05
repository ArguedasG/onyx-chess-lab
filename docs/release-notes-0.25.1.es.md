# Onyx Chess Lab 0.25.1

Arreglos tras la prueba del autor de 0.25.0 desde cero en otra computadora.

## Lichess

- Un inicio de sesión con el navegador sin terminar (pestaña cerrada, o Lichess pidió iniciar
  sesión primero y perdió la autorización) quedaba pendiente cinco minutos y los intentos siguientes
  fallaban sin aviso: parecía que eliminar la cuenta y volver a añadirla no servía. Ahora un intento
  nuevo reemplaza al anterior y los errores se muestran.
- Mientras Lichess está abierto en el navegador, Cuentas muestra «Esperando a Lichess…», qué hacer
  allí y los botones «Abrir Lichess de nuevo» y «Cancelar»; al terminar, un aviso confirma la sesión
  y que los exploradores de Lichess y Maestros ya están disponibles.
- Las cuentas añadidas sin iniciar sesión tienen un botón **«Iniciar sesión»** en su tarjeta, y el
  panel de base de datos del tablero ofrece **«Iniciar sesión como …»** con esa cuenta.
- El formulario de añadir cuenta explica que iniciar sesión es opcional: sin ello se descargan y
  analizan las partidas y la cuenta sirve de base; solo el explorador de aperturas de Lichess lo
  necesita, porque Lichess lo abre únicamente a usuarios con sesión iniciada.
- Eliminar un jugador entero también borra sus credenciales de Lichess guardadas.

## Puzzles

- La base de puzzles pasa de requisito a **recomendación** (los sets propios en PGN funcionan sin
  ella): línea gris «Recomendado» en la tarjeta de Táctica del inicio, tarjeta «Recomendado» en los
  primeros pasos (que desaparecen con los motores y la base de partidas) y un texto en Táctica que
  lo aclara, con la descarga a un clic.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
