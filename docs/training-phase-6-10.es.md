# Fase 6.10 — Estadísticas de sets tácticos

Estado vigente: **cerrada y validada manualmente** como parte de la Fase 6.

## Objetivo

Cada set táctico ofrece una lectura clara de su historial sin crear otra sesión ni cambiar el formato
persistido. La vista usa los intentos y ciclos que ya guarda `training-areas-v1`, por lo que también
funciona con actividad anterior a esta fase.

## Acceso y métricas

La tarjeta de cada set incorpora **Estadísticas**. La vista muestra:

- aciertos, errores e intentos que no pudieron evaluarse;
- porcentaje de acierto con su muestra explícita: `aciertos / (aciertos + errores)`;
- tiempo total de los intentos y tiempo promedio por intento;
- problemas distintos intentados y resueltos respecto al tamaño total del set;
- evolución de los últimos ocho días con actividad, con porcentaje, muestra, cantidad de intentos y
  tiempo promedio de cada día.

Un reintento cuenta como otro intento: un error seguido de una respuesta correcta produce un error y
un acierto. Esto permite medir el trabajo real y no únicamente si la posición terminó resuelta. Un
intento `unsupported` se presenta como **No evaluable** y no entra en el porcentaje. Sí entra en el
tiempo total y promedio porque representa tiempo de entrenamiento registrado.

La cobertura mide problemas distintos. **Intentados** incluye cualquier resultado registrado y
**Resueltos** requiere al menos un acierto. Por eso repetir muchas veces el mismo problema modifica
los intentos y el porcentaje, pero no infla la cobertura.

## Ciclos Woodpecker

La vista separa dos fuentes de datos:

- **Ciclo actual**: número, problemas resueltos, fallos acumulados, porcentaje con muestra y último
  tiempo de ciclo guardado. Ese tiempo se actualiza al persistir el progreso; no simula un reloj en
  vivo desde el dashboard.
- **Historial de ciclos completados**: fecha, problemas completados, fallos, porcentaje, tiempo total
  y promedio por decisión evaluable para cada ciclo.

El porcentaje de un ciclo usa `problemas completados / (problemas completados + fallos)`. Esta
definición conserva el valor de los reintentos y permite comparar ciclos sin ocultar el denominador.
Los sets guiados no muestran bloques de ciclos porque ese concepto no forma parte de su modo.

## Persistencia y compatibilidad

No se crea una migración. Los cálculos se derivan de `TacticsAttempt`, `TacticsActiveCycle` y
`TacticsCycleSummary`; el esquema de Entrenamiento permanece en la versión 12. Los PGN fuente no se
leen para abrir las estadísticas y los sets grandes no se cargan en memoria.

## Validación

Las pruebas de cálculo cubren:

- reintentos y porcentaje sobre la muestra evaluable;
- exclusión visible de intentos sin evaluación;
- tiempo total y promedio;
- cobertura por problemas distintos;
- agrupación cronológica por día activo;
- separación entre ciclo actual e historial completado;
- ausencia de un porcentaje inventado cuando no existe ninguna decisión evaluable.

La matriz manual de cierre consistió en abrir un set guiado y uno Woodpecker con historial, revisar
la vista en español e inglés y confirmar que los valores coincidieran con una sesión corta conocida.
La Fase 6 se declaró posteriormente cerrada y validada manualmente.

La validación automática del cierre pasa 175 pruebas frontend en 31 archivos, typecheck, lint de los
archivos modificados, auditoría de 1.762 claves en cada catálogo de referencia y build web de
producción.
