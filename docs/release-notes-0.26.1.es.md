# Onyx Chess Lab 0.26.1

Arreglo urgente para macOS y Linux, a partir del aviso de un usuario.

## Instalación de Stockfish en macOS y Linux

- Desde 0.20.0, instalar Stockfish desde «Motores recomendados» fallaba siempre en macOS y Linux y
  solo mostraba «Falló». Stockfish publica esas versiones como archivos `.tar.gz`, que Onyx
  descargaba pero no descomprimía, así que después no encontraba el motor. Ahora los `.tar.gz` (y
  `.tgz`) se descomprimen con las mismas reglas de seguridad que los `.zip` y `.tar`. En Windows no
  cambia nada: allí Stockfish se descarga como `.zip` y siempre funcionó.
- Comprobado con los archivos oficiales de Stockfish 19 para macOS y Linux: el motor queda en la
  ruta que espera el catálogo.

## Cuando una instalación falla

- El motivo del fallo se queda escrito debajo de «Falló» en vez de desaparecer con la notificación.
- Si Stockfish no se puede instalar, el mismo diálogo explica cómo instalarlo a mano en dos o tres
  pasos (con el aviso de seguridad de macOS) y el botón **«Añadirlo a mano»** abre directamente
  «Agregar motor».
- Los errores de la descarga ya no se pierden: antes un fallo al descargar aparecía después como
  otro error confuso.
- El README explica en inglés cómo instalar motores a mano, y el aviso sobre Maia 3 ya no remite a
  una guía que no existía: dice que su instalación guiada es solo para Windows por ahora.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
