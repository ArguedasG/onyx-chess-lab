# Onyx Chess Lab 0.25.0

Versión de **mantenimiento y primer uso** tras la prueba del autor con una instalación limpia en
otra computadora: primeros pasos en el inicio, los dos motores en un clic, avisos claros cuando falta
algo, el tablero a ciegas completo y los formatos rápidos en táctica, y una revisión de los cambios
de En Croissant entre el 2026-10-12 y el 2026-11-04.

## Primer uso

- **Primeros pasos** en la pantalla de inicio: instalar los motores, añadir una base de partidas,
  descargar puzzles y, opcionalmente, conectar una cuenta. Cada tarjeta dice para qué sirve el paso
  y tiene un único botón; el bloque desaparece al completar los tres obligatorios o con «Ocultar».
- **Motores recomendados**: un diálogo con Stockfish y Maia 3, su estado y su progreso, y «Instalar
  los dos». Se abre en el sitio desde «Instalar Maia 3», desde el aviso de Stockfish de las partidas
  puntuables y desde Motores vacío. Una instalación de Maia a medias se repara.
- Maia instalada muestra **«Instalado»**; «Reparar instalación» pasa a acción secundaria con
  explicación.
- **Base de datos sin base**: el panel del tablero ya no lanza la consulta ni muestra un error, sino
  un aviso con «Añadir una base», que abre directamente la descarga. La primera base añadida queda
  como referencia. Lichess y Maestros sin sesión explican cómo conectarse.
- **Táctica sin base de puzzles**: explicación y descarga directa.
- Cada sección del inicio muestra lo que le falta mientras falte («Necesita: Maia 3, Stockfish»).
- **Idioma**: el primer arranque elige con dos botones, sin opción preseleccionada que aceptar por
  error.
- Los logos remotos del catálogo de motores, bloqueados por la política de contenido, se sustituyen
  por iconos.

## Táctica

- **A ciegas completo**: el tablero queda congelado en la imagen inicial y el usuario juega toda la
  línea sobre la posición real, que está encima con las piezas invisibles. Se toma cada pieza desde
  donde está de verdad (se iluminan sus casillas); solo se ve la pieza arrastrada; las jugadas se
  escriben debajo y la última del rival se dibuja como flecha roja.
- **Formatos rápidos** sobre cualquier set con solución preparada: Tormenta (tiempo total, cada
  error resta 10 s), Racha (vidas, primero los más fáciles si el set tiene rating) y Contrarreloj
  (tiempo por ejercicio), con vista normal, sin piezas o a ciegas y récord por set. Es una sesión
  aparte: no cambia el progreso ni los ciclos Woodpecker.
- El botón «+» de los puzzles de Lichess pasa a **«Nuevo puzzle»**.

## Tablero, jugadores y ajustes

- **Navegación fija** al pie de la columna derecha, con la jugada actual: plegar la notación ya no la
  oculta. En el modo libro sigue bajo el tablero.
- **Jugadores**: «Cargar desde Lichess o Chess.com» descarga las partidas de cualquier usuario y abre
  su ficha, lista para guardarla como rival, alumno u otro.
- Tuerca en las tarjetas de ajustes del motor.
- Portado de En Croissant: notación algebraica larga, velocidad de animación de las piezas, ocultar
  el material, tablero blue4, editor del código Markdown de los comentarios y atajos de teclado
  traducidos.

## Arreglos

- Portados de En Croissant y comprobados en Onyx: casilla del enroque con jaque o mate, relojes a
  0:00, fecha del registro de repaso, flechas y puntos de destino en los puzzles, motores duplicados
  que compartían ajustes, ids de motor repetidos, hilos que no son potencia de dos, fechas ISO en
  PGN, relojes sin tiempo, ritmos diario y por correspondencia, cuentas de Chess.com sin desviación,
  error de la tablebase, pantalla de error, selección al borrar variantes, nombres de partidas al
  pasar de página, amenaza estando en jaque, modo de límite del informe, bases ya descargadas, Elo
  del motor en el PGN y hora UTC al guardar. Además, dos mejoras de rendimiento de la notación.
- Borrar una jugada durante una partida queda bloqueado: desincronizaba el tablero del juego.
- **Ayuda → Abrir logs** abría `en-croissant.log`, que no existe; ahora abre `onyx-chess-lab.log`.
- Cada jugada de un bot se escribe en el registro: probabilidad de Maia, si Stockfish verificó, si
  se aplicó el filtro de fuerza, los rasgos de la jugada y la evaluación; también las de repertorio.
- **Telemetría desactivada**: la heredada enviaba a la clave de PostHog de En Croissant. Una
  telemetría propia y opcional queda para la Fase 10.
- Errores de Chess.com y Lichess y diálogos de Ayuda traducidos.

## En Croissant

- Lo que no se portó, con lo que se puede aprender de ello (ChessQ, DuckDB, enlaces `onyx://`…), en
  `docs/upstream-ideas-en-croissant.es.md`.

Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.
