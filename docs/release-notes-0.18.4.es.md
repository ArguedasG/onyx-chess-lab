# Onyx Chess Lab 0.18.4

Esta versión hace el modo Aprender más fluido, al estilo de Chessable, permite guardar solo el tramo
de una partida que interesa como táctica, añade atajos de teclado y corrige errores de conexión que
aparecían de vez en cuando.

## Modo Aprender

- Una sola pausa por jugada: el rival juega, el tablero espera un momento y se muestra la jugada que
  hay que aprender. El panel enseña juntas la jugada del rival y la tuya, cada una con su
  comentario; al hacer clic en una de ellas se ve su posición con sus flechas.
- La pausa solo espera al estudiante si alguna de las dos jugadas tiene comentario o flechas; si no,
  la sesión sigue sola.
- Nuevo ajuste “Pausa entre jugadas en el modo Aprender” (de 0 a 5 segundos; 0,9 por defecto), junto
  a “Líneas nuevas por sesión”.
- Enter o la barra espaciadora continúan después de una pausa, pasan a la siguiente línea al
  terminar y siguen la línea preparada tras una buena jugada fuera del repertorio.

## Siguiente línea

- Al terminar una sesión de Aprender aparecen “Entrenar esta línea” y la siguiente línea del
  repertorio.
- Al completar la última línea de una sesión de entrenamiento aparece la siguiente línea del
  repertorio, con “Aprender siguiente línea” o “Entrenar siguiente línea” según si ya está aprendida.

## Tácticas desde una partida

- Al guardar una posición en un set táctico se puede elegir desde qué jugada de la partida empieza
  el ejercicio y cuál es la última jugada de la solución. Ya no se copia toda la partida.
- Si la posición mostrada es el final de la partida, se puede elegir un inicio anterior.

## Atajos de teclado

- Shift+1 a Shift+0 añaden las valoraciones de posición: +-, ±, ⩲, =, ∞, ⩱, ∓, -+, ⇆ y =∞.
  Funcionan con cualquier distribución de teclado.
- T muestra u oculta la amenaza del rival en el análisis del motor.
- Todos pueden cambiarse en Ajustes → Atajos de teclado.

## Correcciones

- Moverse rápido entre jugadas mientras se consulta el explorador de Lichess ya no muestra el
  aviso “No se pudo completar la consulta de esta posición” por consultas canceladas.
- Las listas de motores, bases de datos y problemas para descargar se piden con reintentos; si el
  servidor no responde, se muestra la última lista recibida. El error, cuando aparece, tiene un
  botón “Reintentar”.

## Compatibilidad y actualización

- Actualización estable y firmada para Windows x64 mediante el actualizador integrado de Onyx.
- Linux y macOS siguen publicándose como vista previa sin probar.
- Conserva repertorios, estudios, progreso de entrenamiento, bases, análisis y configuración
  existentes.
