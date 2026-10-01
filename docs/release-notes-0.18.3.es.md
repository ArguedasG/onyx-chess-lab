# Onyx Chess Lab 0.18.3

Esta versión permite importar cursos grandes, como los exportados de Chessable, sin errores y con
una agrupación mucho más ordenada. También hace más cómodo el modo Aprender.

## Cursos grandes y progreso de entrenamiento

- El progreso de entrenamiento (táctica, aperturas y finales) ya no se guarda en el almacenamiento
  interno del navegador, que tenía un límite de unos 5 MB. Ahora se guarda en un archivo dentro de
  los datos privados de Onyx, de forma segura y sin límite práctico de tamaño. Esto corrige el error
  “exceeded the quota” al importar un curso grande.
- La primera vez que se abre esta versión, el progreso existente se traslada automáticamente al
  archivo nuevo y se conserva una copia de respaldo. No hace falta hacer nada.
- Los cambios pendientes se guardan antes de cerrar la ventana o de instalar una actualización.
- Si una importación falla, el error aparece dentro de la ventana de importación y no queda un PGN
  editable huérfano en la carpeta de documentos.

## Agrupación inteligente al importar

- Los capítulos de un curso se reconocen aunque no estén numerados, también los del tipo
  “18 A)” y “18 B)”.
- Todos los capítulos Quickstarter se reúnen en una sola sección.
- Todas las partidas modelo se reúnen en una sola sección.
- Los puzzles y ejercicios que empiezan desde su propia posición se dejan fuera por defecto, con un
  aviso; pueden restaurarse desde “No se importarán”. Con un curso de 1.129 registros, la vista
  previa pasa de 208 a 45 secciones.

## Velocidad

- Importar un curso con muchas partidas en una misma sección es mucho más rápido.
- La administración de repertorios grandes ya no se vuelve lenta: el contenido de un repertorio se
  muestra solo al desplegarlo y, en repertorios de más de 150 líneas, las líneas de cada sección se
  despliegan bajo demanda.

## Modo Aprender

- Tras la jugada del rival, el tablero espera un segundo antes de mostrar la jugada que hay que
  aprender, para que se vea qué jugó el rival.
- Los botones de las tarjetas de sección (Ver líneas, Aprender, Repasar y Entrenar) ya no se cortan.

## Carpeta de documentos

- Las instalaciones nuevas guardan los PGN editables en `Documentos\Onyx Chess Lab`. Las
  instalaciones existentes siguen usando `Documentos\EnCroissant`, sin mover ni perder archivos.

## Compatibilidad y actualización

- Actualización estable y firmada para Windows x64 mediante el actualizador integrado de Onyx.
- Linux y macOS siguen publicándose como vista previa sin probar.
- Conserva repertorios, estudios, progreso de entrenamiento, bases, análisis y configuración
  existentes.
- Después de actualizar no conviene volver a una versión anterior: las versiones previas no leen el
  progreso desde el archivo nuevo, aunque los datos siguen a salvo en él y en su copia de respaldo.
