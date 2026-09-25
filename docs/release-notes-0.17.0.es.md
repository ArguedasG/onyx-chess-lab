# Onyx Chess Lab 0.17.0

Esta versión rediseña el módulo de repertorios para que sea más fácil explorar, organizar y
entrenar líneas, y añade ayudas importantes a los ejercicios tácticos y a la práctica de aperturas.

## Nueva experiencia de repertorios

- Nueva biblioteca visual de repertorios con nombre, descripción, cantidad de líneas y progreso.
- Navegación jerárquica y clara entre repertorio, secciones y líneas, sin desplegar listas extensas
  dentro de una sola pantalla.
- Cada línea muestra su nombre completo y la secuencia de jugadas; el tramo nuevo respecto de las
  líneas anteriores se resalta para facilitar la comparación.
- El desplazamiento y el lugar de origen se conservan al abrir una línea y regresar, incluida la
  vuelta desde una sesión de entrenamiento a su sección correspondiente.
- Las coincidencias exactas encontradas desde una posición del tablero enlazan directamente con la
  línea correspondiente dentro del repertorio.

## Importación, organización y edición

- La importación permite elegir entre crear secciones a partir de los capítulos de un estudio o
  incorporar sus capítulos y subvariantes como líneas dentro de una sección.
- Nuevas estrategias de agrupación para PGN: agrupación inteligente, una sección por registro o una
  sola sección combinada, con vista previa antes de confirmar.
- Herramienta para consolidar secciones relacionadas y reducir repertorios fragmentados sin perder
  el progreso de las líneas que continúan coincidiendo.
- Exportación más flexible de repertorios y secciones.
- Administración de repertorios más explícita, con terminología unificada, ayuda contextual,
  creación, importación, selección de líneas entrenables y eliminación protegida por confirmación.
- Al editar una línea en el tablero, Onyx distingue claramente entre guardar solo el PGN, guardar y
  actualizar la estructura de entrenamiento, o descartar los cambios.

## Entrenamiento de aperturas

- Flechas diferenciadas muestran en el tablero la continuación principal y las alternativas
  disponibles del árbol PGN.
- La práctica no modifica el PGN por evaluaciones del motor ni por dibujos temporales del tablero.
- Después de una jugada incorrecta se puede mostrar la jugada esperada o reintentar; la ayuda no
  contabiliza dos veces el mismo error.
- Los controles de regreso recuerdan si la práctica comenzó en la biblioteca, un repertorio, una
  sección o la pantalla de administración.

## Entrenamiento táctico

- Nueva opción **Ver la solución**, protegida por confirmación.
- Mostrarla reproduce la solución completa que debe ejecutar el estudiante y registra el ejercicio
  como fallado.
- Cuando una táctica no incluye una solución preparada, Onyx puede consultar el motor para construir
  una continuación útil.

## Compatibilidad y actualización

- Actualización estable y firmada para Windows x64 mediante el actualizador integrado de Onyx.
- Conserva repertorios, estudios, progreso de entrenamiento, bases, análisis y configuración
  existentes.
- El identificador de datos permanece sin cambios para que la actualización use el mismo perfil
  local de las instalaciones anteriores.
