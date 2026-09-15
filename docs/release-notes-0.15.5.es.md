# Onyx Chess Lab 0.15.5

Esta versión reúne correcciones surgidas del uso real y completa las estadísticas de sets tácticos y
el alcance funcional de Player Analysis 7.2.

## Novedades

- Cada set táctico incorpora estadísticas de aciertos, errores, muestra evaluable, tiempos,
  cobertura y evolución por días activos.
- Woodpecker separa el ciclo actual del historial de ciclos completados.
- Player Analysis permite combinar varios ritmos al seleccionar las últimas partidas para el
  análisis con motor.
- Al añadir un error personal a un set táctico se puede elegir entre **Mejorar mi decisión** y
  **Castigar mi error**.
- Las partidas contra bots ofrecen revancha y se pueden abortar antes de la primera jugada del
  usuario sin registrar un resultado artificial.

## Correcciones

- Motor conserva la muestra y los filtros del perfil correcto al alternar perfiles o recalcularlos.
- Las partidas de evidencia regresan al perfil de Player Analysis que las abrió.
- El panel Motor permite desplazarse hasta todos sus controles y acciones.
- Las partidas y líneas abiertas desde un informe regresan al informe de origen.
- Los filtros, la paginación y los paneles pequeños de bases, aperturas y repertorios se conservan al
  regresar a su pestaña.
- La navegación rápida por posiciones trata las consultas canceladas o reemplazadas como carga, sin
  mostrar un error transitorio al usuario.
- El entrenamiento oculta dibujos y flechas que podrían revelar una respuesta; las instalaciones
  nuevas borran dibujos con un clic de forma predeterminada.

## Compatibilidad

- Actualización estable para Windows x64 mediante el actualizador integrado.
- Conserva el almacenamiento y los repertorios existentes.
- El identificador de datos se mantiene sin cambios para evitar una migración de perfil en esta
  versión.
