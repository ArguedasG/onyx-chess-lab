# Onyx Chess Lab 0.26.0

Carpetas para organizar y entrenar los sets de táctica, y el arreglo del enroque en los sets.
Ambas cosas salen de los comentarios de un usuario que prueba la app.

## Carpetas de táctica

- **Importar una carpeta de PGN**: un libro o curso dividido en un PGN por tema (por ejemplo
  «01. Double Attack.pgn», «02. Pin.pgn»…) se importa como una carpeta, con un set por PGN y en el
  orden de los archivos. Si en la carpeta hay archivos con número y otros sin él, los que no tienen
  número (normalmente el libro completo u otro curso) empiezan sin marcar. El modo y la validación
  elegidos se aplican a todos los sets.
- **Nueva carpeta**: agrupa cualquier set que ya exista, por ejemplo varios sets de Lichess creados
  por tema y nivel, en el orden en que se marcan. Desde el menú ⋯ de cada tarjeta un set se añade a
  una carpeta, se mueve a otra, se saca o, dentro de su carpeta, sube o baja. «Configurar set» tiene
  también un campo «Carpeta».
- Cada carpeta muestra su progreso total. Dentro, **«Continuar: …»** abre el primer set con
  ejercicios pendientes, y **«Entrenar toda la carpeta»** abre una sesión que mezcla ejercicios de
  todos sus sets: sin resolver, fallados antes o todos; de 10 a 100 ejercicios o todos; con los sets
  mezclados o en orden. Cada respuesta cuenta en el progreso de su propio set; los ciclos Woodpecker
  no se tocan. Los sets que solo se validan con el motor quedan fuera de esa sesión, con un aviso.
- Una carpeta se puede renombrar (con el nombre de otra, se fusionan), quitar conservando sus sets o
  eliminar junto con ellos. Los archivos PGN siempre se quedan en el disco.
- Mientras no hay ninguna carpeta, una tarjeta explica para qué sirven, con los botones para crear
  una o importarla.

## Arreglos

- Los sets de táctica daban por incorrecto el enroque al mover el rey dos casillas: la solución
  guardaba el enroque como «rey captura torre» y el tablero enviaba el paso de dos casillas. Ahora
  se aceptan las dos formas en las sesiones guiadas, a ciegas y de formatos rápidos, y con
  validación por motor.
- En el entrenador de puzzles de Lichess también se acepta enrocar soltando el rey sobre la torre.
- Un nombre de set largo ya no recorta el contador de ejercicios ni el botón ⋯ de su tarjeta: el
  título se parte en varias líneas.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
