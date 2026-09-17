# Fase 7.3 — Estado de implementación

Fecha de corte: 16 de septiembre de 2026.

Este documento registra el estado técnico de la fase activa. El alcance contractual y el orden de
las entregas permanecen en `PROJECT_ROADMAP.md`.

## 7.3.1 — Fundamentos

Implementado:

- comando `get_game_metadata`, con los mismos filtros, orden y paginación que la consulta de
  partidas, pero sin leer ni decodificar el blob de jugadas;
- hidratación del PGN únicamente al abrir evidencia o justo antes de analizar una partida con motor;
- checkpoint incremental por `game_id`, deduplicación por base e id y cachés de perfiles/fuentes
  acotadas durante la sesión;
- coordinador global de solicitudes Lichess con una sola solicitud activa, cancelación, caché LRU
  acotada, espera mínima de 60 segundos ante `429` y un reintento;
- lectura incremental de NDJSON para el explorador de jugador, conservando únicamente el último
  snapshot completo;
- biblioteca privada `analysis-library-v1`, con manifiesto reconstruible, documentos JSON con
  esquema, historial de versiones, ids validados, escritura temporal, copia de respaldo y
  recuperación;
- comandos para listar, leer, guardar una versión, borrar y exportar artefactos;
- creación de versiones únicamente desde acciones explícitas **Guardar versión**.

Validación realizada:

- `cargo check --offline`: correcto;
- pruebas de escritura atómica y recuperación: correctas;
- generación explícita de bindings Specta: correcta;
- `npm run lint`: correcto, con 40 advertencias preexistentes y sin errores;
- la suite Rust completa conserva siete fallos preexistentes en expectativas de evaluación estática
  de `chess::tests`; 98 pruebas pasan, 9 están ignoradas y las pruebas nuevas pasan;
- la suite Vitest completa pasa: 183 pruebas en 34 archivos;
- el build de producción de Vite termina correctamente;
- la auditoría de traducciones pasa con 1.856 claves coincidentes en inglés y español, sin claves
  usadas ausentes ni diferencias de placeholders;
- Vitest y Vite necesitaron durante la verificación un *shim* temporal, no incorporado al proyecto,
  porque `os.userInfo()` falla con `ENOMEM` en este host antes de cargar la configuración;
- `tauri build --no-bundle` no llegó a ejecutar el empaquetado porque su `beforeBuildCommand` intentó
  consultar el registro de pnpm y después rechazó purgar `node_modules` sin TTY. La compilación Rust y
  el build Vite se validaron por separado; el build nativo empaquetado queda dentro de la validación
  manual pendiente.

Pendiente antes de declarar validación manual:

- abrir un perfil con una base grande y confirmar memoria, progreso, refresco incremental y análisis
  de una muestra con motor;
- simular cancelación y `429` en la aplicación nativa;
- guardar, volver a abrir, exportar y borrar artefactos desde la vista de biblioteca.

## 7.3.2 — Informes de apertura

Implementado en el primer corte remoto:

- pestaña de informe habilitada para Lichess todo y Lichess Masters bajo la sesión Lichess ya
  requerida por el explorador;
- diseño compacto propio con resumen, resultados, continuaciones, frecuencia, rating medio,
  evolución cuando la API la ofrece y referencias destacadas o recientes;
- aviso único y visible de que se usan agregados de Lichess y no se descarga ni recorre el corpus;
- cero consultas recursivas para construir una falsa teoría remota;
- guardado manual de versiones en la biblioteca JSON;
- biblioteca capaz de listar, exportar y borrar todos los artefactos, restaurar la última versión
  de un perfil compatible y reabrir informes locales o remotos como instantáneas históricas de solo
  lectura;
- filtros locales opcionales por texto literal de evento y por control de tiempo exacto, aplicados
  por lotes sin ampliar el índice permanente; las continuaciones y denominadores se recalculan sobre
  el subconjunto filtrado;
- partidas modelo locales ordenadas por una heurística visible de 0–100: hasta 70 puntos por ELO
  medio, 20 por recencia y 10 por cobertura de la continuación. Se muestra el desglose y se aclara que
  no es una evaluación de calidad del motor;
- primera desviación de cada partida modelo frente a posiciones y jugadas de partidas con fecha
  estrictamente anterior dentro del cohorte filtrado y acotado; se muestran jugada, ply, corte y
  tamaño de referencia y se aclara que no es novedad histórica ni cobertura exhaustiva de la base.

## 7.3.3 — Player Analysis

Implementado:

- metadatos paginados sin PGN, hidratación bajo demanda, checkpoint incremental y deduplicación;
- guardado manual y durable de versiones del perfil;
- alias añadidos y retirados únicamente por selección explícita dentro de cada base, sin inferencias
  entre nombres, cuentas online o identidades reales;
- exportación explícita del perfil actual a JSON y HTML autónomo;
- comparación entre años del mismo perfil y filtros, mostrando tamaños de muestra y aclaración
  observacional;
- biblioteca para listar, exportar y borrar artefactos, además de restaurar la última versión de un
  perfil compatible;
- comparación entre dos versiones guardadas, con muestras, filtros y disponibilidad de motor
  visibles y aviso cuando los filtros no son equivalentes;
- cobertura de reloj visible sobre la muestra seleccionada para motor y clasificación mediante los
  cuatro niveles acordados;
- estadísticas agregadas solo con cobertura suficiente: decisiones medibles, duración media,
  jugadas y errores críticos con 30 segundos o menos. La duración se reconstruye únicamente con
  relojes consecutivos y controles simples `base+incremento`.

La persistencia de checkpoints entre reinicios no se incorpora por ahora: era una optimización
condicionada a mediciones. El checkpoint de sesión, la paginación y la deduplicación cubren el
contrato actual; si la validación con una base grande demuestra que no basta, se registrará como
mantenimiento medido y no como persistencia especulativa.

## 7.3.4 — Inteligencia verificable

Implementada de forma acotada:

- los errores recurrentes ya no se agrupan por la combinación amplia apertura/fase/severidad;
- ahora requieren la misma posición normalizada, la misma jugada realizada y la misma severidad,
  con referencias concretas a las partidas;
- catálogo inicial de motivos demostrables: pieza movida inmediatamente perdida, captura directa
  omitida y promoción omitida; cada clasificación tiene confianza alta porque deriva de ocupación
  del tablero y primera jugada del motor, y todo caso ambiguo queda sin clasificar;
- cobertura visible como posiciones clasificadas sobre posiciones críticas totales;
- familias reproducibles por material para posiciones marcadas como final o con diez piezas o menos:
  peones, torres, piezas menores, damas o material mixto;
- consulta manual de la tablebase estándar de Lichess solo para posiciones de siete piezas o menos,
  pasando por el coordinador remoto cacheado y secuencial;
- observación antes/después únicamente para posiciones exactas añadidas manualmente a entrenamiento,
  con intentos, precisión evaluable, muestra y pérdida media visibles; nunca se expresa causalidad.

## Estado de salida

La implementación de 7.3.1–7.3.4 está terminada. Antes del cierre formal queda ejecutar la lista de
validación manual nativa indicada arriba y confirmar visualmente los nuevos bloques con datos reales.
