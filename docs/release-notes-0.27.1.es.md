# Onyx Chess Lab 0.27.1

Arreglo urgente para los repertorios importados de cursos, a partir del aviso de un usuario.

## Repertorios que crecían hasta fallar con «Invalid string length»

- Cuando una jugada tenía más de un glifo de calidad (por ejemplo «!» y «?!»), Onyx los escribía
  pegados con comas: `Nf3!,?!!,?!`. Es habitual en cursos que repiten la misma jugada en varias
  líneas con glifos distintos, porque al importar se fusionan en un solo árbol.
- Al leer ese texto de nuevo, cada glifo contaba aparte, así que los glifos se multiplicaban, y cada
  guardado los elevaba al cuadrado (2, 4, 16, 256, 65 536…). Con el curso del aviso (681 KB), el
  repertorio pasaba de 424 KB a 101 MB en tres guardados. Al siguiente, añadir una sección, importar
  más líneas o reorganizar fallaba con «Invalid string length».
- Ahora el glifo de calidad se escribe una sola vez pegado a la jugada y el resto de anotaciones como
  NAG (`$16`…). Comprobado con el mismo curso: el repertorio mantiene su tamaño tras seis guardados
  seguidos.

## Repertorios ya afectados

- Se reparan solos: al abrirlos, los glifos repetidos se leen como uno y el siguiente guardado deja
  el archivo limpio.
- Si un repertorio creció tanto que ya no se puede abrir, importa el curso de nuevo en un repertorio
  nuevo.

## Anotaciones

- Igual que en el editor de anotaciones, una jugada conserva como máximo un glifo de calidad y una
  valoración. Al fusionar líneas de fuentes distintas, la jugada mantiene el glifo que ya tenía.
- El gráfico de evaluación muestra las anotaciones de una jugada sin comas.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
