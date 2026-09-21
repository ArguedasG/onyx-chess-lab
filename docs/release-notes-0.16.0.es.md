# Onyx Chess Lab 0.16.0

Esta versión incorpora la biblioteca personal de estudios, nuevas acciones desde cualquier posición
del tablero, la finalización de la Fase 7.3 y una ronda de endurecimiento y correcciones surgidas de
las pruebas reales de la aplicación.

## Estudios y preparación

- Nueva biblioteca local de estudios organizados por capítulos, con edición, orden, descripciones,
  papelera, historial y recuperación.
- Importación de archivos PGN o texto PGN pegado directamente, con validación visible cuando el
  contenido no es válido.
- Exportación de capítulos individuales o estudios completos como PGN y respaldo integral en JSON.
- Una partida o análisis abierto puede añadirse como capítulo y regresar posteriormente a su estudio
  sin cerrar la pestaña ni perder el estado.
- Los capítulos seleccionados pueden copiarse a sets de Táctica o Finales y a repertorios de
  Aperturas. El estudio original permanece intacto.
- La revisión previa permite elegir posición y solución táctica, o color y objetivo del estudiante
  para los finales.

## Aperturas y análisis

- Informes compactos para Lichess general y Masters sin descargar ni recorrer su corpus completo.
- Versiones guardadas manualmente para informes y perfiles, exportación JSON/HTML y restauración
  desde la Biblioteca de análisis.
- Comparaciones entre periodos y versiones, cobertura de relojes, patrones recurrentes verificables
  y referencias concretas a las partidas.
- Acciones sobre la posición visible para buscar coincidencias y transposiciones en repertorios y
  crear copias entrenables revisadas.

## Seguridad, privacidad y robustez

- Los comentarios PGN ya no interpretan HTML crudo y los enlaces se limitan a destinos HTTP/HTTPS.
- Política CSP explícita, permisos de archivos reducidos y descargas protegidas frente a transportes,
  redirecciones, tamaños o archivos comprimidos inseguros.
- OAuth de Lichess renueva CSRF, PKCE, puerto y listener en cada intento y expira solicitudes
  abandonadas.
- La sesión OAuth se procesa globalmente y conserva el token que necesita el explorador aunque la
  copia cifrada adicional de Windows no esté disponible.
- La telemetría está desactivada de forma predeterminada en instalaciones nuevas y no usa captura
  automática ni grabación de sesiones.
- CI valida frontend y Rust en Windows y fija las acciones externas por hash de commit.

## Correcciones

- Lichess general y Masters vuelven a reconocer inmediatamente una cuenta autenticada y continúan
  funcionando después de reiniciar Onyx.
- Los sets tácticos donde comienza el rival ejecutan exactamente una jugada automática y esperan el
  turno del estudiante.
- Las consultas remotas canceladas durante navegación rápida ya no dejan bloqueado el explorador.
- El panel de informe permite desplazarse hasta Biblioteca de análisis y Generar informe aunque se
  amplíe mucho la notación.
- La navegación de capítulos incluye retorno directo a la biblioteca de estudios.

## Compatibilidad y actualización

- Actualización estable para Windows x64 mediante el actualizador integrado de Onyx.
- Conserva estudios, entrenamiento, repertorios, bases, análisis y configuración existentes.
- El identificador de datos permanece sin cambios para evitar separar esta versión del perfil local
  de instalaciones anteriores.
