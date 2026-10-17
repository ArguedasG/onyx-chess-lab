# Onyx Chess Lab 0.22.0

La versión de **Entrenamiento**. Táctica, finales y aperturas reciben nuevos modos: sesiones
contrarreloj y por rachas, un constructor de sets, finales que se comprueban jugada a jugada,
importación de finales con vista previa, repaso continuo de aperturas y búsqueda de huecos en el
repertorio. Reúne las fases 8.8 a 8.10 y los ajustes pedidos por el autor tras probarlas, más las
correcciones a partir de los comentarios de un usuario.

## Táctica: modos y sets (8.8)

- **Modos de sesión:** Libre, **Tormenta** (reloj global de 3 o 5 min y dificultad creciente),
  **Racha** (1–3 vidas, se guarda la mejor racha) y **Contrarreloj** (el mismo tiempo para cada
  puzzle), más el filtro **Longitud de la solución** y la opción de **jugadas candidatas**.
- **Entrenador de puzzles de Lichess:** varios temas a la vez («Cualquiera» o «Todos a la vez»),
  **excluir temas**, filtro de **calidad** (popularidad e intentos) y notación contraída. El muestreo
  de puzzles pasó de unos 6,6 s a 20–50 ms.
- **Elo táctico local** y **repaso espaciado** de los puzzles y ejercicios fallados.
- **Constructor de sets** con plantillas (mate en 2, ataques dobles, clavadas y enfiladas,
  desviación y atracción…) y precisión reciente y tiempo en cada tarjeta de set.
- **Visualización:** tablero **sin piezas** y modo **a ciegas**.

## Finales: evaluación por jugada (8.9)

- **El objetivo se comprueba tras cada jugada:** «Sigue ganado» o «Siguen siendo tablas» con su
  fuente (tablebase hasta 7 piezas, Stockfish por encima), aviso si el objetivo deja de ser
  alcanzable, **«Reintentar desde la jugada N»** y botón **Veredicto**.
- **Importación de finales** con vista previa: un set, por tema o por capítulo, en un set nuevo o
  existente, con los objetivos calculados después de importar.
- **Vista por tema** sobre todo el contenido y **mates básicos cronometrados** desde posiciones al
  azar.

## Aperturas: repaso continuo y huecos (8.10)

- **Repaso continuo** de un repertorio, con pistas solo donde el dominio es bajo y sin tocar la
  programación del repaso espaciado.
- **Huecos del repertorio:** jugadas habituales del rival (Lichess, Masters o una base local) que tu
  repertorio todavía no contesta, con acciones para rellenarlos.
- **Ocultar líneas pausadas** en la página de una sección.

## Otras mejoras y correcciones

- **Varios ritmos a la vez** en el filtro de la ficha de jugador (lo usan Preparación y el resto de
  pestañas); ventanas más anchas en la importación de finales y en la revisión de cobertura.
- **Jugar la mejor jugada del motor con la barra espaciadora** en el tablero de análisis. Se cambia
  en Configuración → Atajos de teclado. No actúa en práctica, editando la posición, con la amenaza
  activada ni en «Aprende de tus errores».
- **Las flechas ya no se quedan atrapadas en las pestañas:** las pestañas, botones e interruptores
  en los que se hace clic con el ratón devuelven el teclado, así que las flechas y la barra
  espaciadora siguen actuando sobre el tablero. Los controles a los que se llega con Tab lo
  conservan. Se desactiva en Configuración → Atajos de teclado.
- **Lc0 ya no se queda en «Cargando…»:** el Lc0 del catálogo es la versión CUDA, que solo arranca
  con tarjeta gráfica NVIDIA; sin ella, el motor informaba de un error que Onyx ignoraba. Ahora los
  errores del motor se muestran en la tira de motores, el Lc0 CUDA indica que necesita NVIDIA y el
  catálogo añade el **Lc0 oficial para CPU** (0.32.1), que funciona en cualquier equipo, aunque más
  lento.
- **Novedades:** una ventana con los cambios de cada versión aparece tras actualizar y en
  Ayuda → Novedades. La ventana de actualización muestra ahora las novedades de la versión ofrecida
  antes de instalarla. Las notas están en `src/data/changelog.json`, en inglés y español, y el
  workflow de release las usa como descripción y falla si falta la entrada de la versión.

Tus repertorios, estudios, progreso de entrenamiento, bases, análisis y ajustes se conservan.
