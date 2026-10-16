# Onyx Chess Lab 0.21.0

La versión de **Jugadores**. Onyx tiene ahora una sección propia para cualquier jugador —tú, tus
rivales y tus alumnos— con su ficha completa, un generador de repertorios desde estadísticas,
herramientas para preparar partidas contra un rival concreto (incluido un bot gemelo que juega su
repertorio) y un entrenamiento que convierte tus propios errores en ejercicios con repaso espaciado.
Reúne las fases 8.4 a 8.7.

## Jugadores: ficha y estadísticas (8.4)

- **Sección «Jugadores»** en la barra lateral, separada de «Cuentas» (que queda para conectar
  Lichess y Chess.com): busca a cualquier jugador en todas tus bases locales y guarda fichas de ti,
  tus rivales, tus alumnos u otros. Bases de datos → Jugadores muestra la misma ficha.
- **Ficha completa:** resumen con cifras, evolución del rating y actividad; partidas filtrables con
  actualizar, abrir, analizar con motor, añadir a un estudio y exportar PGN; aperturas por familia,
  variante y subvariante; rivales (más enfrentado, némesis, rival favorable y «Contra ti»); y el
  análisis con motor de siempre, ahora dentro de la ficha.
- **Rating par:** toda tabla de resultados compara la puntuación con la que predicen las diferencias
  de Elo, para que «38 % con esta línea» se pueda interpretar.
- **Momentos destacados, hábitos y reloj:** error más costoso, mayor remontada, mayor sorpresa,
  rachas, cómo terminan las derrotas, errores por tramo de jugadas y según el reloj. Siempre con su
  muestra y sin diagnósticos psicológicos.
- **Alias y FIDE:** une varios registros del mismo jugador a mano y vincula su perfil FIDE con una
  consulta puntual.

## Generador de repertorios y sorpresas (8.5)

- **«Generar repertorio desde aquí»** (menú del tablero): un repertorio nuevo y editable a partir de
  Lichess, Lichess Masters o una base local, eligiendo cómo escoger tus jugadas —mejor resultado
  práctico, mejor puntuación, menos derrotas, menos teoría, más fiel al motor, difícil para el rival
  o sorpresas— y siempre a pocos centipeones de la mejor jugada del motor. Las respuestas del rival
  son las más jugadas o las que predice Maia a un Elo.
- Anotado con estadísticas, evaluación, transposiciones y una partida modelo por jugada, y listo para
  el modo Aprender de Aperturas.
- **«Buscar sorpresas en esta línea»**, inspirado en el Novelty Grinder de Matthew Sadler: jugadas
  que el motor aprueba y casi nadie juega, ordenadas por lo difícil que es la posición para el rival.

## Preparación contra rivales (8.6)

Nueva pestaña **Preparación** en cada ficha:

- **Cómo jugarle:** las líneas, estructuras y tipos de partida donde el rival puntúa por debajo de lo
  esperado, sus fases más flojas si hay análisis con motor y un veredicto («juega tu repertorio» si
  nada destaca). Se presenta como una orientación experimental, no como una certeza.
- **Repertorio probable:** su árbol de jugadas con puntuación y rating par, y las desviaciones
  recientes marcadas como «Nueva».
- **Posiciones clave:** la probabilidad de que el rival encuentre una buena jugada en las posiciones
  a las que llegan sus líneas, para saber hacia dónde llevar la partida.
- **Estructuras de peones:** peón aislado, Carlsbad, peones colgantes, Caro-Kann/Eslava, cadena
  francesa, Maróczy, erizo e india de rey, con ella y contra ella, más damas cambiadas pronto y
  finales.
- **Contra mi repertorio:** las respuestas del rival que tu repertorio de Onyx no contesta; en tu
  propia ficha, dónde te sales de tu repertorio y qué respuestas no tienes preparadas.
- **Líneas y sorpresas contra el rival:** el generador y el buscador de sorpresas usando sus
  partidas.
- **Bot gemelo:** juega contra un bot con el repertorio real del rival que, fuera de él, juega como
  un jugador de su rating (Maia), con una medición de lo fiel que es.
- **Exportar preparación (PGN)** y **añadir partidas de un rival** desde su cuenta de Lichess o
  Chess.com, un PGN o las **retransmisiones oficiales de Lichess** de torneos presenciales.
- En Aperturas, **«Posiciones difíciles para mí»**: dónde es más probable que te equivoques en tu
  propio repertorio.

## Entrenamiento desde errores (8.7)

Nueva pestaña **Entrenamiento** en tu ficha y en las de tus alumnos:

- **Mis errores:** los errores de tus partidas analizadas como ejercicios («en la partida jugaste X,
  encuentra una jugada mejor»), juzgados por el motor, con explicación y flechas, y con repaso
  espaciado. Se añaden a mano o automáticamente tras cada análisis (opcional), se filtran por fase y
  por tipo de error y llevan a la partida original.
- **Prioridades:** qué entrenar primero, cada punto con su evidencia y un paso concreto.
- **Conversión y defensa:** vuelve a jugar contra Maia tus posiciones ganadoras que no ganaste y tus
  posiciones peores.
- **Fugas:** tus errores agrupados en categorías comprobables (pieza colgada, horquillas, mate no
  visto, ventaja tirada, apuro de tiempo…), ordenados por lo que te costaron y con su evolución por
  trimestre.

## Otras mejoras y correcciones

- Las insignias moradas «Motor · N partidas» llevan al análisis con motor, y donde todavía no hay
  análisis aparece el botón «Analizar con el motor».
- Filtro de **últimas N partidas** en toda la ficha de jugador.
- Los bots ya no salen de su libro de aperturas cuando el usuario enroca.
- La cola de errores vive en su propio archivo y se lee al abrir una ficha, sin afectar al arranque.

Para aprovechar todo lo nuevo de Entrenamiento conviene volver a analizar algunas partidas con el
motor (la caché lo hace rápido): los análisis anteriores no guardaban algunos datos que ahora se
usan.

Tus repertorios, estudios, progreso de entrenamiento, bases, análisis y ajustes se conservan.
