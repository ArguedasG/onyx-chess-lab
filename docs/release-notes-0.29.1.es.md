# Onyx Chess Lab 0.29.1

Un arreglo a partir del aviso de un usuario: cambiar una carpeta de datos en Ajustes dejaba todo
atrás, así que había que volver a instalar motores y bases, y las partidas importadas de Lichess
parecían perdidas.

## Mover carpetas de datos

- Al elegir una carpeta nueva para bases, motores, puzzles o archivos en Ajustes → Directorios,
  Onyx muestra ahora lo que hay en la carpeta actual (número de archivos y tamaño) y pregunta qué
  hacer:
  - **Mover**: el contenido pasa a la carpeta nueva y se actualiza todo lo que apunta a él: motores,
    bases de referencia y de puzzles, pestañas abiertas, sesiones y perfiles de Análisis de
    jugadores. Después Onyx se recarga y te dice qué se movió.
  - **Usar sin mover**: el comportamiento de antes. Tus datos actuales se quedan en la carpeta
    anterior.
- Hasta ahora solo cambiaba la ruta. No se borraba nada: los datos seguían en la carpeta anterior.
- Si la carpeta nueva ya tiene un archivo con el mismo nombre, se conserva ese y el antiguo se queda
  donde estaba. Onyx te los muestra antes y después del traslado.
- No se borra nada de la carpeta anterior hasta que todo está en la nueva. Si algo falla (por
  ejemplo, un archivo en uso), todo vuelve a su sitio y no se mueve nada.
- Mover a otro disco copia primero los archivos, así que las bases grandes pueden tardar unos
  minutos.
- Después de mover la carpeta de motores, Maia 3 pide su reparación de un clic.

## Recuperar datos de un cambio de carpeta anterior

1. En Ajustes → Directorios, elige la carpeta antigua y pulsa **Usar sin mover**. Tus datos vuelven
   a aparecer.
2. Elige otra vez la carpeta nueva y pulsa **Mover**.

En macOS, la carpeta por defecto es `~/Library/Application Support/io.github.arguedasg.onyxchesslab`.
La carpeta Library está oculta: pulsa Command + Shift + G en el selector de carpetas y pega la ruta.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
