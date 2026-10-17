# Fase 8.10 — Aperturas: repaso continuo y huecos

Fecha de implementación: 16 de octubre de 2026. Ideas del estudio de mercado: I-36 (modo «Repaso
continuo») e I-34 (huecos del repertorio por frecuencia real).

## Repaso continuo (I-36)

**Dónde:** el botón de entrenar de cada repertorio y sección (biblioteca, página del repertorio,
tarjetas y página de cada sección) tiene ahora una flecha con **«Repaso continuo»**. Es otra forma
de practicar las mismas líneas, no una acción aparte, así que no añade botones.

- Sesión **sin final ni calificación** sobre las líneas aprendidas del repertorio o la sección.
- El rival lleva hacia la **rama más débil**: el dominio de cada jugada se calcula con sus aciertos
  y fallos (estimación de Laplace) **sumados entre todas las líneas que la comparten**: fallar una
  jugada común en una línea la hace débil en todas. El dominio de una línea es el de su jugada más
  débil, y la siguiente línea se sortea con peso (1 − dominio)² + 0,03: las débiles salen mucho más;
  las dominadas, pocas veces. Las dos últimas líneas no se repiten seguidas.
- Una línea **fallada vuelve tras otras dos** (`utils/openingContinuous.ts`).
- **Pistas solo con dominio bajo** (por debajo de 0,6): el botón «Pista» dice qué pieza mover, sin
  dar la jugada.
- Barra propia con líneas jugadas, sin errores, cuántas volverán pronto y **Terminar**.
- **No toca el FSRS**, como decidió el autor: no reprograma tarjetas ni el mazo heredado y no pide
  calificación. Los aciertos y fallos por jugada sí se guardan, porque son la base del dominio.

En repertorios de los dos colores, las jugadas del estudiante son las que ya se preguntaron en
práctica.

## Huecos del repertorio (I-34)

**Dónde:** página del repertorio → tarjeta de progreso → **«Revisar cobertura»** (botón discreto
con explicación). Es una herramienta a demanda, como pidió el autor: nada se calcula ni se avisa
mientras no se pulse.

`components/training/RepertoireGapsModal.tsx`, lógica en `utils/repertoireGaps.ts`:

- **Fuente:** la misma del generador de repertorios (8.5): jugadores de Lichess, Lichess Masters o
  una base local leída en **una sola pasada** (`get_position_tree`). Con Lichess hace falta la
  cuenta conectada.
- Se recorre el repertorio (todo o una sección) desde sus posiciones iniciales, **primero las más
  probables**, y en cada turno del rival se buscan respuestas sin preparar con al menos un
  porcentaje (5 % por defecto) y 5 partidas.
- **Solo donde el repertorio ya contesta algo:** donde una línea termina a propósito, no se avisa.
- Orden por **«Te la encontrarás»**: probabilidad de llegar a la posición (producto de las
  proporciones del rival en el camino; las jugadas propias cuentan como seguras) por la proporción
  de la respuesta. Así un hueco temprano y frecuente va antes que uno raro y profundo.
- Hasta 150 posiciones del rival por búsqueda; los resultados aparecen mientras avanza y se puede
  detener.
- Acciones por hueco:
  - **Añadir a mano:** abre la línea hasta la respuesta sin cubrir en el tablero; se juega la
    respuesta propia y se usa «Añadir al repertorio» (flujo existente).
  - **Generar:** abre el generador de repertorios de 8.5 desde esa posición, con el color del
    repertorio; el resultado se revisa y se añade igual.

## Ajustes tras la primera prueba del autor (2026-10-17)

- La página de cada sección tiene **«Ocultar líneas pausadas (N)»**, que se recuerda; con un clic
  vuelven a mostrarse. Las líneas visibles conservan su número.
- La revisión de cobertura y la importación de finales usan modales más anchos.

## Pruebas

`utils/openingContinuous.test.ts`: jugadas del estudiante, dominio compartido entre líneas,
sorteo hacia lo débil, regreso de las falladas, pistas; huecos ponderados por frecuencia y sin
avisos donde una línea termina. Validación manual pendiente.
