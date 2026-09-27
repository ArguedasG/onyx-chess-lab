# Onyx Chess Lab 0.18.0

Esta versión completa el ciclo de entrenamiento de aperturas —aprender, practicar y repasar—, hace
editable la importación de repertorios y corrige un error que podía borrar flechas de los PGN.
También incluye las primeras compilaciones de Linux y macOS como vista previa.

## Modo Aprender

- Nueva acción **Aprender** por repertorio, sección o línea, en lotes de líneas nuevas (5 por
  defecto; el tamaño se ajusta en la administración de repertorios).
- Cada línea se enseña en dos etapas: primero guiada, con una flecha que indica la jugada, los
  comentarios del PGN visibles y respuesta automática del rival; después se repite de memoria.
- Al completar la repetición sin errores, la línea queda aprendida y la sesión pasa sola a la
  siguiente. Con errores se puede repetir con guía, repetir de memoria o saltarla.
- El tramo que ya conoces por otras líneas aprendidas se reproduce automáticamente y la enseñanza
  empieza en la divergencia.
- Los errores cometidos mientras aprendes no afectan tus estadísticas.
- Cada línea muestra si es **Nueva** o **Aprendida**, y cada repertorio y sección, su progreso.
- Las líneas que ya habías practicado antes cuentan como aprendidas: no se pierde ningún progreso.
- Entrenar un repertorio o una sección usa las líneas aprendidas; una línea individual siempre puede
  entrenarse desde su sección.

## Repaso espaciado

- Nueva acción **Repasar**, que entrena solo las líneas cuyo repaso ya toca, empezando por las más
  atrasadas.
- Aprender una línea programa su primer repaso, y cada práctica completada lo reprograma según tu
  calificación o la calculada automáticamente.
- Cada línea indica si tiene un repaso pendiente o cuándo será el próximo.
- El calendario se guarda junto a cada línea, por lo que se conserva al reorganizar secciones y en
  las copias de seguridad.

## Importación de repertorios editable

- La vista previa de la importación ahora se puede modificar antes de importar: arrastrar líneas
  entre secciones, reordenar líneas y secciones, crear secciones nuevas, cambiar nombres y fusionar
  secciones.
- Es posible dejar fuera de la importación líneas sueltas o secciones completas, y restaurarlas.
- Cada sección puede marcarse como teoría entrenable o como partidas modelo.
- La importación de PGN grandes es más rápida: el archivo ya no se lee ni se analiza dos veces.

## Correcciones y mejoras

- Practicar o aprender ya no borra las flechas incluidas en el PGN al hacer clic en el tablero, ni
  marca el repertorio como modificado; por eso ya no aparece el aviso de guardar cambios al cerrar.
- El error por falta de nombre al crear un repertorio se muestra junto al campo.
- Escribir en los formularios de creación e importación de repertorios ya no se ralentiza con
  repertorios grandes.
- El recuadro **Listo para analizar** ya no se recorta en la parte superior.
- Más mensajes de error y textos generados están disponibles en español e inglés.

## Linux y macOS (vista previa)

- Se publican compilaciones para Linux x64 (AppImage y .deb) y para macOS con Apple Silicon e Intel.
- Estas compilaciones **todavía no se han probado** y pueden fallar. Windows x64 sigue siendo la
  plataforma validada.
- En macOS la aplicación no está firmada por Apple y hay que desbloquearla la primera vez; los pasos
  están en el README del repositorio.
- La instalación guiada de Maia 3 sigue disponible solo en Windows x64.

## Compatibilidad y actualización

- Actualización estable y firmada para Windows x64 mediante el actualizador integrado de Onyx.
- Conserva repertorios, estudios, progreso de entrenamiento, bases, análisis y configuración
  existentes.
- El identificador de datos permanece sin cambios para que la actualización use el mismo perfil
  local de las instalaciones anteriores.
