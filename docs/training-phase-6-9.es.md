# Fase 6.9 — Reconocimiento y demostración de finales

## Objetivo

Antes de jugar una posición de Finales, el estudiante observa el tablero inicial y clasifica su
resultado con juego óptimo: ganan blancas, tablas o ganan negras. Esta actividad mide reconocimiento
de posiciones; la partida posterior mide la capacidad de convertir o defender el final. Sus métricas
permanecen separadas.

## Flujo implementado

1. La tarjeta de una posición incluida oculta el objetivo y muestra **Predecir el resultado**.
2. **Entrenar** abre una vista a pantalla completa con un tablero no interactivo de hasta el 84 % de
   la altura visible, orientado como el color del estudiante, e indica qué color mueve según la FEN.
3. El estudiante responde **Ganan blancas**, **Tablas**, **Ganan negras** o **No sé · Mostrar
   respuesta**.
4. La aplicación registra exactamente un intento. «No sé» revela la solución y cuenta como fallo.
5. La respuesta muestra el resultado teórico absoluto, no solo el objetivo desde la perspectiva del
   estudiante.
6. Después de responder se puede **Analizar posición** o **Demostrar jugando**. Esta última acción
   reutiliza sin cambios el ejercicio actual contra Maia máximo o Stockfish.
7. **Jugar directamente** permite omitir el reconocimiento desde la tarjeta o desde el cuestionario.
8. **Posición aleatoria** escoge un ejercicio dentro del tema activo y evita repetir inmediatamente
   el anterior cuando existe otra alternativa.

Las posiciones cuyo objetivo todavía sea desconocido deben calcularlo mediante tablebase o fijarlo
manualmente antes de usar este modo. Esto evita presentar como verdad teórica una estimación ausente.

## Persistencia

`training-areas-v1` sube al esquema 11. Cada posición añade `progress.recognition` con:

- intentos, aciertos y fallos;
- tiempo total dedicado a responder;
- última respuesta, si la hubo;
- si el último intento fue correcto;
- fecha del último intento.

La migración desde el esquema 10 inicializa estos campos a cero y conserva intactos los intentos,
victorias, tiempo y estado completado del modo de juego anterior. Contestar correctamente no marca
por sí solo la partida práctica como completada. La interfaz solo muestra una posición como
completada si existe al menos un intento jugado que haya alcanzado el objetivo; analizar, responder
o abandonar no aumenta el porcentaje.

## Confirmaciones de guardado relacionadas

Las acciones explícitas **Guardar cambios**, **Guardar como PGN nuevo** y **Exportar copia PGN**
muestran una notificación verde únicamente después de terminar la escritura. Los errores muestran
una notificación roja. El autoguardado continúa silencioso para no producir avisos repetitivos.

## Matriz manual pendiente

- abrir una posición con blancas al turno y otra con negras al turno;
- comprobar las tres respuestas correctas posibles;
- comprobar una respuesta incorrecta y **No sé**;
- cerrar y reabrir la aplicación y verificar el contador de reconocimiento;
- abrir análisis después de responder y activar un motor objetivo;
- demostrar jugando con Maia y con Stockfish;
- comprobar que abandonar la partida no crea un intento de juego artificial;
- guardar un repertorio desde su panel y desde el menú PGN;
- probar Guardar como, Exportar y un error de escritura;
- repetir en el ejecutable empaquetado de Windows.
