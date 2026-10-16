# Fase 8.7 — Entrenamiento desde errores

Fecha de implementación: 16 de octubre de 2026. Ideas del estudio de mercado: I-17 (cola
automática con repaso espaciado; es el antiguo «set táctico automático»), I-18 (diagnóstico con
prioridades sin LLM), I-21 (conversión y defensa desde posiciones propias) e I-29 (catálogo de
fugas con coste y evolución).

## Dónde está

**Jugadores → ficha propia o de un alumno → pestaña Entrenamiento**, con cuatro secciones: **Mis
errores**, **Prioridades**, **Conversión y defensa** y **Fugas**. Todas usan el análisis con motor
de la pestaña Análisis (Player Analysis), dentro de los filtros de la ficha.

Las fichas propias (cuentas y fichas «Yo») comparten **una sola cola**; cada alumno tiene la suya.
Las fichas de rivales no tienen esta pestaña: lo suyo es la Preparación.

## Acceso al análisis con motor (comentario del autor tras 8.6)

Para que un usuario nuevo no tenga que encontrar la pestaña Análisis por su cuenta:

- toda insignia morada **«Motor · N partidas»** de la ficha (Resumen, hábitos, momentos, «Cómo
  jugarle», Entrenamiento) es ahora un enlace: abre **Análisis → Motor**, donde se ven esas partidas
  y se pueden analizar más;
- donde falta el análisis, el aviso trae un botón **«Analizar con el motor»** que lleva al mismo
  sitio (momentos destacados, hábitos, fases de «Cómo jugarle», las cuatro secciones de
  Entrenamiento).

Se hizo con un contexto de la ficha (`EngineAnalysisContext`), así que fuera de una ficha las
insignias siguen siendo etiquetas.

## Datos nuevos del análisis

`buildEngineGameMetrics` guarda ahora (campos opcionales, sin cambiar la versión del perfil):

- en cada error: la **probabilidad de ganar antes de la jugada**, el **reloj** antes de la jugada
  como parte del tiempo base y si la mejor línea del motor era **mate**;
- en cada partida: la **primera posición a +1,5 o mejor** y la **primera a −1,5 o peor**, con su
  probabilidad de ganar (los mismos umbrales que ya marcaban «tuvo ventaja» e «inferior»).

Los análisis anteriores no los tienen: las secciones lo dicen y piden volver a analizar (la caché
de 8.2 lo hace rápido).

## Mis errores (I-17)

`utils/mistakes/queue.ts`. Un elemento por **posición y jugada jugada** (la posición sin
contadores): el mismo error en varias partidas se repasa una vez y recuerda todas sus partidas.

- **Entrada:** errores y errores graves (las imprecisiones, solo si se activa) con una jugada
  mejor del motor. Se añaden con **«Añadir desde el análisis»**, con **«A Mis errores»** en la tabla
  de candidatas de Análisis → Motor o, si se activa, **automáticamente tras cada análisis**
  (desactivado por defecto, como pedía el estudio). Cada análisis se añade una vez (se recuerda su
  fecha por perfil) y lo que el usuario quita **no vuelve**.
- **Repaso espaciado:** FSRS, como las líneas de Aperturas. Encontrar una jugada aceptada al primer
  intento es «Good», tras un intento fallido «Hard» y ver la solución «Again». Un elemento nuevo
  está pendiente de inmediato. «Aprendido»: dos repasos o más, el último sin fallar y el próximo a
  una semana o más.
- **Sesión:** hasta 20 pendientes (los más atrasados y, entre los nuevos, los más costosos), o los
  de un filtro. En cada posición, desde el lado del jugador: «En la partida jugaste X. Encuentra una
  jugada mejor». El motor juzga con la misma tolerancia que «Aprende de tus errores» (3 puntos de
  probabilidad); al acertar o ver la solución aparecen la explicación factual y las flechas de 8.2
  (I-24, I-46) y **«Abrir la partida»** lleva a la partida original en esa jugada.
- **Vista:** pendientes hoy, total, aprendidos y próximo repaso; filtros por **fase** y por
  **categoría** (las de I-29) con pendientes/total; tabla paginada con partida, categoría (con su
  regla), fase, pérdida y próximo repaso, y acciones de repasar, abrir y quitar.
- **Persistencia:** archivo propio `mistake-queue-v1.json` en los datos de la aplicación, leído la
  primera vez que hace falta (no se carga al arrancar, regla 4 de rendimiento del estudio),
  escrito de forma atómica y con espera. Un archivo inválido se aparta (`.invalid-<fecha>`) en vez
  de sobrescribirse. **Exportar la cola (JSON)** y **Vaciar la cola** (con confirmación).

## Catálogo de fugas (I-29)

`utils/mistakes/leaks.ts`. Cada error va a la **primera** categoría cuya regla se cumple. Las
tácticas exigen una pérdida de 10 puntos de probabilidad o más (umbral de «error»):

| Categoría              | Regla                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Permitió mate          | La línea de respuesta del motor termina en mate contra el jugador                          |
| Mate no visto          | La mejor línea del motor era mate para el jugador                                          |
| Pieza colgada          | La mejor respuesta captura una pieza propia (caballo o más) que nada puede recapturar      |
| Permitió una horquilla | La mejor respuesta pone una pieza que ataca dos piezas propias de caballo o más (o el rey) |
| Horquilla no vista     | La mejor jugada del motor era esa horquilla para el jugador                                |
| Captura no vista       | La mejor jugada del motor capturaba una pieza rival de caballo o más                       |
| Coronación no vista    | La mejor jugada del motor coronaba                                                         |
| Ventaja tirada         | Desde 80 % de probabilidad o más, la jugada deja por debajo del 60 %                       |
| Derrumbe al estar peor | Entre 10 % y 40 % de probabilidad, un error o peor                                         |
| Apuro de tiempo        | Menos del 10 % del tiempo base en el reloj                                                 |
| Desliz de apertura     | En las diez primeras jugadas, sin categoría más específica                                 |
| Desliz en el final     | En el final, sin categoría más específica                                                  |
| Sin clasificar         | Ninguna regla se puede comprobar: conserva su pérdida, sin causa                           |

Respecto al catálogo de FlexiChess se dejaron fuera las que no se pueden verificar con un hecho
del tablero o del motor sin interpretar (escudo del rey, concesiones estructurales, malos cambios,
última fila, «ventaja que se escapa» sin un error aislado), conforme a los principios del estudio
para temas posicionales. Las de 7.3.4 («pieza movida castigada», «captura», «coronación») quedan
cubiertas por pieza colgada, captura y coronación.

La sección ordena por **coste** (puntos de probabilidad regalados, en total y por partida
analizada) y muestra las **partidas perdidas** con un error de la categoría cometido desde un 40 %
de probabilidad o más, el ejemplo más costoso y **«Repasarlos en Mis errores»**. La **evolución
por trimestre** muestra los errores de las cuatro categorías más costosas por cada 100 jugadas
(trimestres con 100 jugadas analizadas o más). **No hay comparación con otros jugadores:** no hay
partidas de referencia del mismo ritmo, nivel y ajustes de motor, y sin eso el «×N» engaña (es la
crítica a FlexiChess del estudio).

## Prioridades (I-18)

`utils/mistakes/diagnosis.ts`. Una lista con orden **fijo y escrito**, cada punto con su evidencia
y un paso concreto:

1. **fuga más costosa** (sin contar «sin clasificar», desde 3 errores) → repasar esos errores o ver
   las fugas;
2. **fase con más errores** (1,5 veces la media, desde 60 jugadas; la misma regla que «Cómo
   jugarle») → repasar los errores de esa fase;
3. **más errores con poco tiempo** (menos del 10 % del tiempo base, 1,5 veces el resto, desde 40
   jugadas) → repasar los errores de apuro de tiempo;
4. **conversión** por debajo del 70 % y **defensa** por debajo del 30 % (desde 5 partidas) →
   practicar conversión o defensa;
5. sin motor: la **apertura más floja** con cada color (por debajo del par con 10 partidas con
   rating) → comparar con el repertorio (Preparación → Repertorio vs. partidas) y el **ritmo más
   flojo**.

Los textos son plantillas sobre hechos medidos; ningún modelo los redacta ni decide (sección 5 del
estudio). La muestra y la cobertura de motor se muestran siempre.

## Conversión y defensa (I-21)

`utils/mistakes/practice.ts`. Las posiciones de las partidas analizadas a +1,5 o mejor que **no se
ganaron** (para convertir, las más claras primero) y a −1,5 o peor (para defender, las perdidas
primero), con el rival, la fecha, la jugada, la probabilidad y el resultado. **«Jugar contra Maia
N»** abre una partida desde esa posición contra Maia al **rating del rival de esa partida**; el
objetivo (ganar o al menos tablas) se indica en la sección. Se avisa de que Maia juega como un
humano de ese rating, no como el rival real.

## Validación

- Frontend: `utils/mistakes/mistakes.test.ts` (categorías tácticas y de situación, umbral táctico,
  coste, partidas perdidas y tendencia por trimestre; cola con deduplicación, fuentes, FSRS,
  pendientes, quitar sin que vuelva y lectura de archivos sin los campos nuevos) y nuevas
  comprobaciones en `playerAnalysis.test.ts` (posición de ventaja y probabilidad antes del error).
- Validación manual: hecha por el autor el 2026-10-16 (tras ella, el tablero del repaso se agrandó).

## Fuera de alcance

- FSRS y Elo táctico para los puzzles de Lichess y los sets (I-06, 8.8): la cola usa su propio FSRS.
- Objetivos medidos en partidas reales (I-23, Fase 10), que enlazarán con la evolución de fugas.
- Comparación de fugas con una referencia del mismo ritmo, nivel y motor: no existe todavía.
