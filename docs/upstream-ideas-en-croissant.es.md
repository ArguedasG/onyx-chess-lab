# Ideas a evaluar desde En Croissant

Revisión del 2026-11-04 de los cambios de En Croissant entre el 2026-10-12 y el 2026-11-04 (67
commits). Onyx no comparte historia con En Croissant desde el 2026-04-20, así que nada se fusiona
entero: los arreglos se portan uno a uno y estas ideas se **adaptan**, no se copian.

Lo ya portado (arreglos y funciones pequeñas) está en el registro operativo del roadmap del
2026-11-04. Lo de abajo son cambios que no se pueden traer tal cual, pero de los que se puede
aprender.

## 1. ChessQ (reconocimiento de tableros) — `dcfd4fcc`

- **Qué es:** un modelo ViT (encoder DINOv2 de Meta, ajustado) que lee la imagen entera del tablero
  a 644 × 644 y devuelve las 64 casillas. Pesa 63 MB y se ejecuta en Rust con `candle`.
- **Licencia real:** los pesos son **PolyForm Noncommercial 1.0.0** (no GPL); DINOv2 es Apache 2.0.
  Onyx también puede distribuirlos con fines no comerciales, con el aviso «Required Notice». La regla
  del roadmap que lo prohibía partía de un supuesto, no de la licencia. Hay que tener en cuenta que
  quien redistribuya Onyx no podría venderlo con esos pesos dentro, y que la descarga crecería mucho.
- **Comparado con diagram-squares (9.4):** el nuestro pesa 1,17 MB, tarda 36 ms y se entrenó solo
  con diagramas sintéticos impresos y de pantalla. ChessQ probablemente aguanta mejor fotos y
  capturas reales (I-58), a cambio de tamaño y latencia.
- **Idea:** medirlo con el mismo conjunto privado de libros y el sintético. Si gana en algún tipo de
  imagen, ofrecerlo como **descarga opcional** («lector avanzado») usado solo como segunda opinión
  para las casillas dudosas o las fotos, nunca incluido en el instalador.

## 2. Database v2 (DuckDB) — `29d410eb`

- **Qué es:** migración de SQLite a DuckDB con una extensión propia (`aixchess`), conversión de PGN
  nueva, comentarios guardados en la base y búsquedas estructurales tipo Scoutfish (condiciones
  sobre piezas y casillas, editor de sub-FEN).
- **Por qué no se trae:** Onyx amplió su propia base SQLite (snapshots, índices, búsqueda por
  tokens, calidad, estructuras) y migrar rompería formatos persistidos de usuarios.
- **Ideas:**
  - medir DuckDB solo para las consultas agregadas lentas (informe de calidad de 12–20 s en 10 M
    de partidas, estadísticas de jugador, árbol de aperturas, I-27) antes de decidir nada;
  - **búsqueda por patrón de piezas** (Scoutfish): «partidas con alfil en g7 y peón en h6»; encaja
    con estructuras (9.3) y con el entrenamiento por temas;
  - el **componente común de filtros** (Elo, evento, fechas) para unificar los filtros dispersos de
    Bases, Jugadores e informes.

## 3. Ficha personal y datos de la partida — `64955624`, `bd1ffdb8`, `00c99f52`

- Onyx tiene su propia ficha de jugador (8.4) y su barra de partida, más completas.
- **Ideas:** las pestañas de **rango de fechas** (último mes, año, todo) del resumen y el gráfico de
  ratings por ritmo; y la cabecera compacta de la partida para pantallas pequeñas.

## 4. Tableros 3D — `20b38611`

- Varios MB de imágenes en el instalador.
- **Idea:** un **paquete de temas descargable** (tableros y piezas extra) en el catálogo propio
  (I-25), de modo que el instalador no crezca y quien los quiera los baje.

## 5. Diseño compacto y ocultar barras — `c48af287`, `d64ce9ec`

- Choca con la reestructuración propia de la interfaz (0.19.0).
- **Ideas:** útil en portátiles (la prueba del autor fue en una laptop): un **modo compacto** del
  tablero de análisis y atajos para **ocultar la barra lateral y la de pestañas**.

## 6. TypeScript 7, pnpm y dependencias — `4d284fc6`, `f31931ea`, `80b6f9a5`, `63a3a239`

- Onyx ya usa `tsgo`. Fijar la versión de pnpm y actualizar dependencias es una tarea propia de
  mantenimiento, con su propia prueba completa, no algo a mezclar con funciones.

## 7. Enlaces `encroissant://` — `df722799`, `4dd01c83`

- Choca con el identificador heredado `org.encroissant.app` (decisión pendiente de Fase 10).
- **Idea:** un esquema **`onyx://`** para «Abrir en Onyx» desde el navegador (una partida de Lichess
  o Chess.com, un FEN). En Croissant prepara además una extensión de navegador
  (`feat/browser-extension`). Va junto con la migración del identificador.

## 8. Traducciones a otros idiomas

- Los catálogos de francés, chino, turco, etc. comparten muchas claves con Onyx.
- **Idea:** de vez en cuando, copiar las traducciones de En Croissant para las claves que Onyx
  conserva, sin tocar las propias de Onyx. Bajo esfuerzo, mejora los idiomas secundarios.

## Ramas de En Croissant para seguir

`feat/browser-extension`, `vision-chessq`, `duckdb`, `feature/maia-integration` (comparar con el
Maia 3 administrado de Onyx).
