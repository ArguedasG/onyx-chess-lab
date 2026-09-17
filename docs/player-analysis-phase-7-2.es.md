# Fase 7.2 — Player Analysis local y accionable

Fecha: 2026-08-29; cierre funcional ampliado el 2026-09-07 e implementado el 2026-09-14. Estado
vigente: **cerrada y validada manualmente**. Las fuentes
principales son cuentas Lichess descargadas e
importaciones PGN que
ya forman parte de una base local. No se envían partidas, evaluaciones ni perfiles a servicios
externos.

## Flujo implementado

1. Abrir el perfil personal de una cuenta descargada o seleccionar un jugador dentro de una base.
2. Entrar en **Análisis** y elegir periodo, color, control de tiempo y rango ELO del rival.
3. Generar o recalcular el perfil descriptivo. El resultado guarda versión, fecha, fuentes, filtros,
   muestra y referencias de evidencia sin duplicar los PGN en `localStorage`.
4. Consultar resultados por color, control de tiempo, fuerza relativa, apertura/ECO, rival y año;
   abrir una partida de evidencia por su base e ID exactos en una pestaña separada, conservando el
   perfil para regresar o consultar otra evidencia.
5. Elegir uno o varios ritmos, un motor local distinto de Maia, cantidad de partidas recientes y
   tiempo acotado por posición. Los ritmos se combinan antes de aplicar el límite de últimas partidas.
   El análisis conserva ACPL, errores, fases, conversión, defensa y posiciones críticas.
6. Abrir una posición crítica en su ply o pulsar **Añadir al set**. Cada pulsación abre un diálogo
   para escoger **mejorar mi decisión** o **castigar mi error** antes de crear el ejercicio. Si no
   existe un set embebido seleccionable, se puede crear **Mis errores tácticos** desde la primera
   posición.

## Contrato y reproducibilidad

- `player-analysis-v1` conserva perfiles locales con `schemaVersion: 3`, fuente, jugador, filtros,
  fecha de cálculo, agregados y referencias. Se puede desactivar todo el perfil, recalcularlo o
  borrarlo. La versión 3 invalida los perfiles anteriores para guardar la selección múltiple, el
  total elegible y el aporte analizado por cada ritmo.
- El motor se registra con nombre, ruta, argumentos, opciones UCI y límite. Maia se excluye de las
  métricas objetivas.
- El análisis de motor usa las partidas más recientes dentro de los ritmos elegidos y la muestra
  filtrada. El usuario puede combinar categorías, elegir la cantidad en pasos de cinco o analizar
  explícitamente toda la muestra. La interfaz presenta el total elegible y, en el resultado guardado,
  cuántas partidas aportó cada ritmo. El valor predeterminado es 10 partidas y 250 ms por posición;
  no se inicia automáticamente al importar.
- Los resultados por partida se reutilizan cuando coinciden partida, motor y límite. Una ejecución
  cancelada conserva lo ya terminado y puede continuar después. El proceso activo recibe la misma
  cancelación cooperativa que el análisis de partidas existente.
- Al alternar perfiles, Motor carga automáticamente las partidas del perfil activo. Una caché LRU de
  sesión conserva como máximo tres perfiles para agilizar cambios frecuentes sin dejar crecer la RAM
  sin límite. La instancia visual también cambia con el identificador del perfil, por lo que filtros,
  conteos y cargas pendientes no se mezclan.
- Cada pestaña de evidencia conserva el identificador y nombre del perfil que la abrió. La flecha de
  regreso y el cierre de esa pestaña restauran ese perfil y su sección de análisis, incluso cuando no
  es el primer perfil configurado.
- ACPL y clasificación usan únicamente las jugadas del jugador. Los umbrales reproducen el pipeline
  existente: 40 cp para inexactitud, 100 cp para error y 200 cp para error grave.
- Apertura/medio juego/final se clasifican mediante ply, damas y cantidad de piezas no peón. Es una
  heurística declarada, no una segmentación teórica perfecta.
- Una partida ofrece oportunidad de conversión si el jugador alcanza al menos +150 cp al inicio de
  uno de sus turnos; cuenta como convertida si gana. Una partida inferior usa -150 cp y se considera
  salvada si termina en victoria o tablas. Estas métricas dependen del motor y presupuesto elegidos.
- Los errores recurrentes agrupan al menos dos posiciones por fase, severidad y ECO. Una cantidad
  de 18 significa 18 posiciones críticas dentro de ese grupo amplio; no 18 repeticiones de la misma
  jugada, posición, clavada u otro motivo. Todavía no se les asigna automáticamente un motivo
  táctico o estratégico.
- Si una partida no contiene cabecera ECO, el backend recorre su línea principal y conserva el
  nombre de apertura más profundo reconocido por el catálogo local. El nombre derivado se usa en
  estadísticas, hallazgos y agrupaciones de errores del motor.

## Integración con Táctica

`training-areas-v1` migra al esquema 12. Cada ejercicio creado desde Player Analysis conserva:

- base e ID de la partida;
- modo y ply exacto de la perspectiva seleccionada;
- pérdida en centipeones y clasificación;
- FEN, bando al turno y solución propuesta por el motor;
- etiquetas `player-analysis`, modo, fase y severidad.

**Añadir al set** solo modifica sets propios embebidos. Los sets enlazados a un PGN y el contenido
incluido permanecen inmutables. Se deduplica la misma base, partida, ply y modo dentro de un set. Esta
procedencia permite una ampliación opcional futura que construya y mantenga automáticamente un set
de errores tácticos. Esa automatización no forma parte de 7.2 ni 7.3; se estudiará en la Fase 10.

## Requisitos implementados para cerrar 7.2

- El análisis de motor tiene selección múltiple de ritmos. Bullet, Blitz, Rapid, Classical y otras
  categorías presentes pueden combinarse, y la muestra versionada indica exactamente cuáles se
  analizaron y cuántas partidas aportaron.
- Al añadir una candidata al set, el usuario puede escoger **mejorar mi decisión** —posición antes
  del error, juega el usuario— o **castigar mi error** —posición después del error, juega el rival—.
- La procedencia distingue modo, ply, FEN, bando al turno y solución. Las dos perspectivas no se
  deduplican entre sí por accidente.
- La interfaz explica la semántica amplia del contador de errores recurrentes. La detección de
  jugada, posición o motivo táctico repetido continúa en 7.3 y deberá ser verificable.

## Alcance y límites actuales

- La estadística descriptiva pagina todas las partidas del jugador, pero el comando histórico
  `getGames` hidrata su movetexto. Es suficiente para cuentas personales normales; una ampliación
  deberá separar metadatos de PGN para perfiles con cientos de miles de partidas.
- Aperturas se agrupan inicialmente por ECO almacenado. La agrupación por posición crítica,
  desviaciones de repertorio y enlace directo a un Opening Report específico pasan a mejoras.
- No se calcula todavía administración del tiempo: la base normalizada no expone de forma uniforme
  los comentarios `[%clk]`. Debe declararse la cobertura antes de mostrar esa métrica.
- No se asignan motivos como horquilla, clavada, sobrecarga o debilidad estratégica sin un
  clasificador verificable. Las posiciones críticas sí quedan disponibles para revisión y sets.
- No hay aún análisis incremental automático al descargar nuevas partidas, exportación HTML/JSON,
  comparación entre periodos entrenados ni tablebases dentro de Player Analysis.
- La matriz manual histórica incluía cuenta Lichess, PGN genérico con alias, alternancia entre perfiles de
  tamaños distintos, retorno desde evidencia al segundo perfil, scroll completo de Motor,
  cancelación y continuación, diálogo de ambas perspectivas, borrado, ausencia de motor, set táctico
  existente/nuevo y build empaquetada. La fase fue validada manualmente posteriormente; las
  regresiones nuevas pertenecen a mantenimiento.

## Ampliación posterior

Estos pendientes se concentraron y se implementaron posteriormente en 7.3: fuente Lichess remota
para Opening Reports, biblioteca persistente, desviaciones relativas, filtros de evento/ritmo,
metadatos paginados de Player Analysis, relojes, motivos tácticos verificables, tablebases,
sincronización incremental y observación longitudinal del entrenamiento. El estado vigente y sus
límites están en `phase-7-3-progress.es.md`. La interpretación estratégica, los planes, los finales
típicos y el set táctico automático opcional permanecen en Fase 10.

## Validación ejecutada

- 172 pruebas frontend aprobadas en 30 archivos, incluidas métricas, selección múltiple, ambas
  perspectivas, evidencia, migración y
  deduplicación del ejercicio táctico;
- 53 pruebas del módulo de base de datos Rust aprobadas y cuatro omitidas por estar marcadas como
  ignoradas;
- `tsgo --noEmit --incremental false`, lint focalizado y auditoría de traducciones aprobados;
- 1.728 claves coincidentes en inglés y español, sin claves o placeholders ausentes;
- build web aprobada. La validación manual en el producto se confirmó posteriormente al cierre
  automático documentado aquí.
