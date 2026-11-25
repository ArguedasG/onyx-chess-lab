# Plan de lanzamiento público — Onyx Chess Lab

> Documento de contexto y traspaso entre sesiones.
> Última actualización: 2026-11-25 (Etapa 3: sitio, guías y catálogo desacoplado; quedan pasos del autor en GitHub).

## 1. Contexto y restricciones del proyecto

- **Producto:** Onyx Chess Lab (`ArguedasG/onyx-chess-lab`), fork open-source (GPLv3) de En Croissant, orientado a estudio local-first, entrenamiento (táctica, aperturas FSRS, finales), lectura de libros PDF con reconocedor propio de diagramas ONNX, bots humanos con Maia 3 gestionada y preparación contra rivales.
- **Objetivo actual:** dejar la aplicación, su distribución y su documentación listas para compartirla con muchos más usuarios (comunidad/clubes) y presentarla como pieza sólida de portafolio de ingeniería de software, datos y ML.
- **Público:**
  - Primer lanzamiento amplio: un grupo de ajedrez de la ciudad del autor (~100 miembros, todos hispanohablantes).
  - Usuarios actuales: en su mayoría usan la app en inglés y ayudan a probarla desde antes de que exista la web.
  - Por eso la web y la documentación van **completas en español e inglés, con la misma prioridad**. Cómo se elige el idioma está en la Etapa 3.
- **Presupuesto y límites acordados:**
  - **\$0** en certificados de Apple (descartado pagar \$99/año por Apple Developer; macOS mantiene firma ad-hoc `"-"` y guía clara con `xattr -cr`).
  - **\$0** en firma de Windows usando **SignPath Foundation** (certificado gratuito para proyectos open-source; el certificado está a nombre de _SignPath Foundation_, no del autor).
  - **Sin ataduras de dominio pago:** la infraestructura interna de la app (actualizador, catálogo de descargas, bases) no debe depender de un dominio que pueda vencer. Un dominio barato solo se usa para la web.

---

## 2. Decisiones arquitectónicas ya cerradas

1. **Identificador y editor definitivos:**
   - `identifier`: `io.github.arguedasg.onyxchesslab` (estándar reverse-DNS de GitHub, permanente y gratuito).
   - `publisher`: `Gabriel Arguedas`; `authors` en `Cargo.toml`: `["Gabriel Arguedas", "Francisco Salgueiro <fgcdbs@gmail.com>"]` (conservando atribución GPLv3 en `README.md`, `LICENSE` y `About.tsx`).
2. **Estrategia de página web y dominio:**
   - Desplegar gratis primero en **GitHub Pages** (`arguedasg.github.io/onyx-chess-lab`) con **Astro (+ Starlight)**: cero cuentas nuevas ni tarjetas. _(Nota: Cloudflare actualmente orienta sitios nuevos hacia Workers Static Assets en lugar de Pages)._
   - La web vive en la carpeta **`website/`** de este mismo repositorio, con su propio workflow de Pages filtrado por ruta.
   - **Bilingüe completa ES + EN** con el i18n de Starlight. Ninguna página se publica en un solo idioma. La estructura de URLs está en la Etapa 3.
   - Si Onyx gana tracción, comprar `onyxchesslab.org` (~\$9–\$12/año en Porkbun o Cloudflare Registrar) y conectarlo como dominio personalizado (GitHub redirige `github.io` con 301), sin tocar el `identifier` ni migrar carpetas de usuarios. Al conectarlo se quita el `base: "/onyx-chess-lab"` de Astro.
3. **Almacenamiento y pipeline de bases de datos:**
   - **No** migrar a DuckDB (Onyx mantiene su motor SQLite + índice `mmap` optimizado).
   - Desacoplar los JSON del catálogo (`databases.json`, `puzzle_databases.json`, `engines.json`) de `encroissant.org` hacia un host propio (manteniendo siempre el respaldo empaquetado en `src/data/catalog/`).
   - **URL permanente del catálogo:** las versiones publicadas de Onyx llevan la URL escrita en el código, así que debe ser una que no cambie nunca. Preferencia: `https://raw.githubusercontent.com/ArguedasG/onyx-chess-lab/main/...` (no depende de dominio ni de redirecciones). Si se usa la URL de Pages, hay que probar que el plugin HTTP de Tauri sigue la redirección 301 al dominio propio.
   - **Destino principal inicial de las bases (sin dominio propio):** **GitHub Releases en un repositorio dedicado de datos** (p. ej. `ArguedasG/onyx-chess-data`, **nunca** en `onyx-chess-lab` para no pisar `releases/latest` del actualizador de la app), usando `GITHUB_TOKEN`, compresión alta **`zstd` (`.db3.zst`)** —el crate `zstd` ya está en `Cargo.toml`— y borrando versiones viejas para conservar solo la actual y la anterior. GitHub limita cada archivo a 2 GiB: medir primero si cada base comprimida cabe; si no, dividir con `split` y unir en streaming en Onyx.
   - **Paso de publicación desacoplado + R2 futuro:** escribir el publisher sin acoplarlo al destino para que, cuando se compre `onyxchesslab.org`, se pueda añadir **Cloudflare R2** (compatible con S3, 10 GB gratis, egress ilimitado) como espejo con dominio propio _(nota: la URL gratuita `r2.dev` tiene límites agresivos y Cloudflare prohíbe usarla en producción; requiere dominio propio)_.
   - **Licencias de las fuentes:**
     - LumbrasGigaBase: base principal **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**; los datos de Lichess incluidos por separado, **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**. Redistribuir las versiones `.db3` convertidas es compatible si se hace sin fines comerciales, con atribución, y manteniendo CC BY-SA en lo derivado de Lichess. Escribir igualmente al autor por cortesía y para acordar cómo atribuirlo.
     - Lichess Puzzles: CC0.
     - La licencia y la atribución de cada base deben verse en la web y, si es posible, en el catálogo.
4. **Sincronización futura con En Croissant:**
   - Se siguen portando bugfixes y mejoras seleccionadas por commits/parches (solo la capa de bases diverge por DuckDB).

---

## 3. Trabajo completado

### Etapa 1 — Identidad propia, migración segura y limpieza pública (Completada)

- **Identidad y metadatos:**
  - `src-tauri/tauri.conf.json`: `identifier` → `io.github.arguedasg.onyxchesslab`, `publisher` → `Gabriel Arguedas`, y hook NSIS `bundle.windows.nsis.installerHooks = "windows/nsis-hooks.nsh"`.
  - `src-tauri/Cargo.toml`: `authors` actualizado con `Gabriel Arguedas` + atribución upstream.
  - `src-tauri/src/oauth.rs`: `client_id` de Lichess PKCE cambiado a `io.github.arguedasg.onyxchesslab`.
  - `src/utils/directories.ts`: eliminado el fallback automático a `Documentos/EnCroissant` para que instalaciones nuevas siempre creen `Documentos/Onyx Chess Lab` (las existentes conservan su `document-dir` guardado).
  - `scripts/audit-update-isolation.mjs`: auditoría ampliada para rechazar cualquier regreso a `org.encroissant.app` o `Francisco Salgueiro` en `tauri.conf.json`, `main.rs` u `oauth.rs`.
- **Migración automática al arranque (`org.encroissant.app` → `io.github.arguedasg.onyxchesslab`):**
  - `src-tauri/src/identifier_migration.rs` + `src-tauri/src/main.rs`: corre en `main()` **antes** de inicializar Tauri, logs, estado de ventana o WebView. Solo actúa si detecta marcadores exclusivos de Onyx (nunca toca instalaciones puras de En Croissant). Mueve atómicamente datos y WebView (con rollback si falla en Windows), reescribe rutas absolutas en JSON de datos y deja el estado en `.onyx-identifier-migration-v1.json`.
  - Ese archivo de estado es **permanente**: guarda las carpetas vieja y nueva, si `localStorage` ya se reescribió, si la carpeta era compartida con En Croissant y si ya se mostró el aviso. Lo expone el comando `get_identifier_migration`; `complete_identifier_migration` y `acknowledge_en_croissant_notice` lo actualizan.
  - `src/utils/identifierMigration.ts` + `src/index.tsx`: antes del primer render, reescribe rutas heredadas dentro de `localStorage` (`databases-dir`, `engines-dir`, `puzzles-dir`, `reference-database`, `puzzle-db`, `recent-files`, `tabs`, etc.) y marca la migración como completada.
  - `src-tauri/windows/nsis-hooks.nsh`: migra la clave de registro de Windows `HKCU\Software\Francisco Salgueiro\Onyx Chess Lab` → `HKCU\Software\Gabriel Arguedas\Onyx Chess Lab` en `MUI_CUSTOMFUNCTION_GUIINIT` (y respaldo en `NSIS_HOOK_PREINSTALL`), permitiendo desinstalar/actualizar `0.28.x` sin `NSIS Error: Error launching installer` y conservando carpetas personalizadas; limpia la clave vieja con `/ifempty` en `NSIS_HOOK_POSTINSTALL`.
- **Ajustes tras la revisión (2026-11-22):**
  - **Análisis de jugadores:** los ids de perfil son un hash de `nombre|rutaDeLaBase:playerId`, así que cambiaban al moverse la carpeta. `toLegacyDataPath` (en `identifierMigration.ts`) traduce las rutas de la carpeta nueva a su nombre antiguo antes del hash (`src/state/playerAnalysis.ts`): los perfiles ya analizados siguen enganchados a sus tarjetas y los nuevos quedan consistentes. Sin migración no cambia nada.
  - **Carpeta compartida con En Croissant:** hasta la 0.28 ambas apps usaban la misma carpeta, y al moverla En Croissant empieza vacío. Antes de mover nada, la migración detecta si En Croissant está instalado (rutas típicas por SO) o si hay un `.log` suyo en la carpeta de logs. En ese caso, `src/App.tsx` muestra **una sola vez** una notificación persistente (`Migration.EnCroissant.Title/Body` en EN/ES) explicando que los datos pasaron a Onyx y que no se borró nada.
- **Maia 3 tras la migración (sin duplicados y reparación en 1 clic):**
  - La migración borra el `.venv` reubicado (que incrusta rutas viejas en binarios/symlinks) manteniendo `onyx-managed-maia3.json` para disparar `needsRepair: true`.
  - `src-tauri/src/managed_engine.rs`: si falla reanudar durante una reparación, cae automáticamente a reinstalación limpia.
  - `src/utils/managedMaia.ts`, `src/utils/engineSetup.ts`, `src/components/engines/ManagedMaiaCard.tsx`: `isManagedMaia` reconoce también entradas heredadas sin campo `managed` por patrón de ruta `managed/maia3/.venv/.../maia3-5m` y colapsa cualquier duplicado al reparar.
  - `src/App.tsx`, `src/hooks/useRecommendedEngines.ts`, `src/components/engines/RecommendedEngines.tsx`, `src/components/engines/EnginesPage.tsx`: al arrancar, si `needsRepair` es `true`, abre directamente el diálogo de Motores recomendados con aviso claro y botón **Reparar Maia 3** en 1 clic; si se cierra, queda un banner visible arriba en **Motores**.
- **Limpieza pública:**
  - Eliminados `.github/FUNDING.yml` (apuntaba al Buy Me a Coffee de En Croissant) y la dependencia sin uso `posthog-js` (-36 paquetes).
  - Actualizados `CONTRIBUTING.md` y `.github/ISSUE_TEMPLATE/bug.yml` hacia `ArguedasG/onyx-chess-lab`.
- **Verificación:**
  - Tests: 9 tests Rust en `identifier_migration` (incluye carpeta solo de Onyx, log de En Croissant, En Croissant instalado y estados antiguos sin los campos nuevos), 11 en `managed_engine`, 5 en `identifierMigration.test.ts` (incluye que el id de un perfil de Análisis de jugadores no cambia tras mover la carpeta) y 5 en `managedMaia.test.ts`.
  - Prueba real en Windows: el autor validó la migración ejecutando el instalador NSIS **de forma normal** sobre una instalación existente.
  - **Pendiente:** la actualización desde la propia app (el actualizador ejecuta el instalador con `/P /UPDATE`), y la migración en macOS y Linux sobre una instalación real de 0.28.x (ver sección 5).

### Etapa 2 — Pulido técnico y multiplataforma (Completada y verificada)

- **Avisos de actualización in-app para macOS y Linux:**
  - `src/utils/appUpdater.ts`, `src/components/AppUpdater.tsx`, `src-tauri/capabilities/main.json`: en macOS y Linux consulta `https://api.github.com/repos/ArguedasG/onyx-chess-lab/releases/latest`, filtra drafts/prereleases y valida la URL oficial, muestra las notas en EN/ES en el mismo modal del actualizador y abre la página de descarga con un clic. Windows mantiene intacto su flujo firmado con `downloadAndInstall`.
  - Traducciones sincronizadas en `src/translation/en-US.json` y `src/translation/es-ES.json`; 5 tests en `src/utils/appUpdater.test.ts`.
  - En la revisión se quitó un bloque duplicado de `appUpdater.ts` (constantes, tipo y `parseManualReleaseUpdate` repetidos) que impedía compilar.
- **Revisión multiplataforma:**
  - Verificados `secureLichessTokens.ts` (Lichess persiste en `localStorage` en macOS/Linux sin depender de DPAPI), `engine/process.rs` (`start_kill` al salir) y `sound.rs` (servidor local de audio Linux).
  - Pruebas reales: dos testers en macOS confirmaron que todo funciona; Linux se probó en una VM hace un tiempo.
  - Actualizados `README.md` y `.github/workflows/release.yml` para reflejar estas pruebas en macOS (Apple Silicon e Intel) y Linux x64 y los nuevos avisos de actualización.
- **Limpieza de tooling y compilación:**
  - `vite.config.ts`: excluidos `.claude/**`, `dist/**` y `src-tauri/**` de Vitest.
  - `src-tauri/src/db/search.rs` y `src-tauri/src/db/search_index.rs`: marcados `#[cfg(test)]` los 3 helpers solo usados en tests → **0 warnings** en compilación Rust.
- **Verificación final:** `pnpm lint:ci` aprobado, `pnpm test` **108/108 archivos (638/638 tests)** aprobados, `cargo test` **232** en verde, `cargo build` con **0 warnings** y clippy limpio en la migración. _(Los cambios de Etapa 2 y de la revisión quedaron en el working tree listos para commit y release `v0.29.0`)._

---

## 4. Siguientes etapas por realizar

### Etapa 3 — Página Web + Desacoplar el Catálogo de descargas

- **Avance (2026-11-24): primera versión del sitio, sin publicar.**
  - Hecho en `website/` (ver `website/README.md`):
    - Astro 6 + Starlight 0.40 (Astro 7 exige Node ≥ 22.23.4).
    - Portada y página de descarga hechas a mano en los dos idiomas.
    - 20 páginas de documentación en español y en inglés: introducción, primeros pasos, instalación por SO, guías (bases, motores, análisis, entrenamiento, estudios, jugadores y preparación, libros, bots y torneos, partidas modelo), recursos, arquitectura, bots humanos (cómo se construyeron y calibraron), privacidad, política de firma y créditos.
    - Raíz `/` que elige el idioma, `hreflang`, imagen para redes y workflow `.github/workflows/website.yml`.
  - Diseño (cuarta propuesta, aceptada como base el 2026-11-25): la paleta exacta de la app (Mantine oscuro `#1a1b1e`, azul por defecto), tipografía Geist, íconos Tabler, sin resplandores ni pastillas. Hero con la captura de análisis entera, metadatos como etiquetas PGN (`[Version "…"]`), secciones numeradas como jugadas, listas con filetes y un tablero muy tenue de fondo en el hero. Cinco capturas reales (`analysis`, `database`, `training`, `preparation`, `books`) con los valores por defecto: tema oscuro, piezas maestro, tablero gray.
  - Raíz del repo: `website/**` excluido de oxlint, oxfmt y Vitest.
  - **Catálogo desacoplado (2026-11-25):**
    - Las listas viven en `catalog/` (`databases.json`, `puzzle_databases.json`, `engines.json`, con un README que prohíbe moverlas) y la app las lee de `https://raw.githubusercontent.com/ArguedasG/onyx-chess-lab/main/catalog` (`CATALOG_URL` en `src/utils/http.ts`, permitido en `capabilities/main.json`). `encroissant.org` sigue permitido para las descargas hasta la Etapa 5.
    - Cambio de comportamiento: la lista viva **reemplaza** a la empaquetada en vez de mezclarse con ella, para que quitar o corregir un enlace en `main` tenga efecto. La copia de `src/data/catalog/` solo se usa sin conexión (y sin caché) o si la lista viva no tiene nada utilizable. La caché local pasa a `catalog-cache-v2:` para no reutilizar listas de En Croissant.
    - El catálogo de motores ya no manda `?os=…&bmi2=…` (era un filtro del servidor de En Croissant); la app filtra igual que antes.
    - Pruebas: `src/utils/catalog.test.ts` comprueba la elección entre lista viva y empaquetada y que `catalog/` tenga entradas válidas (bases `.db3` y Stockfish para cada sistema y CPU).
  - **Revisión de textos (2026-11-25):** inglés unificado en ortografía estadounidense, como la app; introducción, primeros pasos y portada enlazan las guías; privacidad y arquitectura explican el catálogo en GitHub.
  - **Pendiente (lo hace el autor):**
    - Subir `catalog/` a `main` **antes o junto con** la primera versión que lo lea; hasta entonces esa URL da 404 y la app usa la copia empaquetada.
    - Activar Pages en GitHub (_Settings → Pages → Source: GitHub Actions_) y hacer push de `website/` y del workflow.
    - Activar MFA en GitHub antes de pedir SignPath (la política de firma ya lo afirma).
    - Lectura final de los textos; sustituir o añadir capturas en las guías cuando haga falta.
- **Objetivo:** tener el sitio oficial de Onyx listo para compartir con usuarios nuevos y para el portafolio, alojar la política de firma exigida por SignPath y dejar de depender de `encroissant.org` como catálogo primario.
- **Stack:** **Astro + Starlight** en `website/`, desplegado gratis en **GitHub Pages** (`arguedasg.github.io/onyx-chess-lab`, con `base: "/onyx-chess-lab"`), sin cuentas nuevas ni tarjeta.
- **Idiomas:** todo el sitio en **español e inglés**, con el mismo contenido en ambos: landing, descarga, guías, tutoriales, sección técnica, recursos y política de firma. Cada página nueva se escribe en los dos idiomas antes de publicarse.
  - **Decidido (2026-11-24):** URLs simétricas `/es/...` y `/en/...`, sin idioma en la raíz. La raíz (`/`) es una página mínima que redirige según el idioma del navegador (`es-*` → `/es/`, cualquier otro → `/en/`) y recuerda la elección manual en `localStorage`. Sin JavaScript, muestra dos enlaces.
  - "Por defecto" solo decide tres cosas: qué ve quien no habla ni español ni inglés (inglés), qué página indexan los buscadores como `x-default` (inglés) y de qué idioma se rellenan las traducciones que falten (ninguna, porque todo se publica en los dos).
  - El selector de idioma de Starlight sigue en cada página. Los enlaces compartidos apuntan directo al idioma (`/es/` en el grupo local, `/en/` en Reddit o el portafolio).
- **Secciones clave de la web:**
  1. **Landing + descarga inteligente:**
     - Detecta el SO del visitante y ofrece el archivo correcto (Windows x64, macOS Apple Silicon, macOS Intel, Linux AppImage/`.deb`).
     - En macOS el navegador no distingue de forma fiable Apple Silicon de Intel (Safari siempre informa "Intel"): mostrar los dos botones y recomendar Apple Silicon.
     - Resolver la última versión **al construir el sitio** (workflow que se dispara con `release: published`) y usar la API `releases/latest` desde el navegador solo como respaldo (la API sin autenticar permite 60 consultas por hora por IP).
  2. **Guías de instalación claras por SO:** macOS (comando `xattr -cr` con botón de copiar y pasos de Privacidad y seguridad), Windows (SmartScreen hasta tener SignPath) y Linux (`chmod +x` / `libfuse2t64` / `.deb`).
  3. **Tour de funcionalidades (posicionamiento en tres capas, ver abajo).**
  4. **Documentación y tutoriales de uso.**
  5. **Sección técnica / "Cómo está hecho" (Portafolio):** arquitectura Tauri + Rust, entrenamiento sintético del modelo ONNX `diagram-squares-1.2.0`, índice `mmap` para bases de ~10 M+ partidas y diseño del pipeline de bases.
  6. **Recursos gratuitos recomendados:** links directos a LumbrasGigaBase, Lichess Puzzles, Stockfish y colecciones PGN libres, con su licencia y atribución, e instrucciones breves para importarlos en Onyx.
  7. **Política de firma (Signing Policy):** página pública requerida por SignPath Foundation (quién aprueba, builds reproducibles en CI, privacidad/sin telemetría).
- **Posicionamiento del sitio:**
  - Onyx se presenta primero como **un programa de ajedrez completo para el escritorio** (bases, motores, análisis), y desde ahí como el lugar donde el análisis se convierte en entrenamiento y preparación. Las funciones llamativas (libros, Maia, partidas modelo) son la tercera capa, no la portada.
  - **Diferenciación** (sin nombrar a nadie): no vender "gestor de bases y motores", que es lo mínimo de cualquier GUI, sino el **flujo conectado**: _analiza → detecta → entrena → prepara_. Cualquier posición (de una partida, un libro, un rival o un estudio) pasa a táctica, repertorio o finales en un par de clics.
  - **Lema propuesto:**
    - ES: _"Tu laboratorio de ajedrez: bases de datos, motores y análisis, con el entrenamiento y la preparación integrados."_
    - EN: _"Your chess lab: databases, engines and analysis, with training and preparation built in."_
  - **Capa 1 — Lo esencial, bien hecho:** bases locales de millones de partidas con búsqueda por posición exacta y parcial (índice `mmap`, rápido con 10 M+), importar PGN y descargar bases recomendadas, motores UCI con instalación guiada de Stockfish, análisis de partidas, informes de aperturas y estudios con capítulos PGN.
  - **Capa 2 — Del análisis al entrenamiento:** táctica (Storm, Streak, Countdown, tablero a ciegas), repertorios de aperturas con repetición espaciada y finales, alimentados desde tus propias partidas, estudios y posiciones.
  - **Capa 3 — Herramientas avanzadas:** análisis de jugadores y preparación contra rivales, bots humanos con Maia 3, libros PDF junto al tablero con reconocimiento local de diagramas, explorador de planes y generación de partidas modelo.
  - **Rasgos transversales:** local-first (sin cuenta ni telemetría), gratis y open-source (GPLv3), Windows/macOS/Linux, completamente en español e inglés.
  - La mención "fork de En Croissant" no va en la portada, pero sí en el pie de página o en "Acerca de" y en la sección técnica (atribución GPLv3 y honestidad del portafolio).
- **Desacoplar el catálogo en Onyx:**
  - **Qué es y qué no es:** el catálogo son solo las _listas_ (JSON) de bases, puzzles y motores que Onyx muestra para descargar. Desacoplarlo cambia de dónde se lee la lista, no de dónde se descargan los archivos. **Para el usuario no cambia nada:** ve las mismas entradas y descarga igual que hoy. Los `.db3` de `db.encroissant.org` siguen disponibles (comprobado el 2026-11-24: Gigabase 2025-06, Caissabase y Lichess Puzzles 2026 responden 200).
  - **Cómo funciona hoy:** `src/utils/catalog.ts` descarga la lista viva de `encroissant.org`, la mezcla con la copia empaquetada en `src/data/catalog/` y descarta entradas `.duckdb`. Si el servidor cae, queda la copia empaquetada.
  - **Por qué hacerlo ya:** a partir de la versión que lo incluya, la lista vendrá de este repo. En la Etapa 5, cambiar un enlace será editar un JSON en `main`, sin publicar una versión: todas las instalaciones con esa versión o una posterior lo verán. Las versiones anteriores seguirán leyendo `encroissant.org` más su copia empaquetada.
  - **Tareas:**
    - Publicar `databases.json`, `puzzle_databases.json` y `engines.json` en una URL permanente propia (ver decisión 2.3; preferencia `raw.githubusercontent.com`).
    - Actualizar `CATALOG_URL` en `src/utils/http.ts` y `src-tauri/capabilities/main.json` para consultar el catálogo propio de Onyx, **conservando siempre el respaldo incluido en `src/data/catalog/`**.
    - Los `downloadLink` de las bases (Gigabase 2025-06, Caissabase, AJ-COR, AJ-OTB, mb-3) y el de Lc0 CUDA siguen apuntando a `db.encroissant.org`. Mantener `encroissant.org` en `capabilities/main.json` hasta que la Etapa 5 los reemplace.
  - **Riesgo independiente de esta tarea:** En Croissant puede retirar los `.db3` en cualquier momento, ahora que usa DuckDB. Si pasa, las descargas fallan en todas las versiones, desacoplado o no. El desacople es lo que permite arreglarlo sin una versión nueva. Si se caen antes de la Etapa 5, adelantar el alojamiento de las bases.

### Etapa 4 — Firma gratuita de Windows con SignPath Foundation (\$0)

- **Requisitos cumplidos:** licencia GPLv3 (OSI), repo público sin código propietario, releases públicos, CI automatizado en GitHub Actions, página del proyecto y política de firma pública (alojadas en la web de Etapa 3).
- **Tareas:**
  1. Enviar solicitud a [signpath.org](https://signpath.org/) para el programa gratuito de open-source (se requiere MFA en GitHub).
  2. Integrar el paso de firma de SignPath en `.github/workflows/release.yml` para el instalador Windows NSIS (con aprobación manual por release).
  3. **Mantener válido el actualizador:** `tauri-action` genera la firma minisign (`.sig`) y `latest.json` sobre el instalador **sin** firmar. Si SignPath lo firma después, el archivo cambia y el actualizador lo rechaza. Tras firmar, regenerar la firma con `tauri signer sign` y reconstruir `latest.json` antes de publicar el release.
  4. Decidir si se firma también el ejecutable de la app que va dentro del instalador (relevante para Smart App Control), lo que exige firmar antes de empaquetar.
  5. Medir el efecto en Windows SmartScreen en instalaciones limpias. Funciona por reputación, así que el aviso puede tardar en desaparecer; Windows mostrará como editor a _SignPath Foundation_.

### Etapa 5 — Pipeline mensual automatizado de bases de datos (GitHub Releases + `zstd`, preparado para espejo R2)

- **Objetivo:** ofrecer bases `.db3` actualizadas con un pipeline reproducible, validado y desacoplado del destino de publicación:
  - **LumbrasGigaBase** (versión actual: ~13 M partidas);
  - **LumbrasGigaBase Online** (~6 M partidas);
  - **Lichess Puzzles**.
- **Tareas:**
  1. Escribir al autor de LumbrasGigaBase por cortesía, para avisar que se alojarán las versiones `.db3` convertidas y acordar la atribución (licencias confirmadas en la decisión 2.3).
  2. Medir el tamaño real de cada base comprimida con `zstd` en compresión alta. La de 9,57 M partidas pesaba 2,79 GB sin comprimir, así que la de ~13 M rondará ~3,8 GB: comprobar si queda por debajo de 2 GiB o si hay que dividirla.
  3. Añadir soporte en Rust (`src-tauri/src/fs.rs`, aprovechando el crate `zstd` ya presente) para descargar y descomprimir archivos `.db3.zst` en streaming (añadiendo soporte para partes divididas solo si la medición demuestra que alguna supera 2 GiB).
  4. Crear un **repositorio dedicado de datos** (p. ej. `ArguedasG/onyx-chess-data`, separado de `onyx-chess-lab` para no interferir con `releases/latest` del actualizador de la app) y un workflow mensual en GitHub Actions: descarga de fuentes oficiales → conversión a `.db3` → validaciones de calidad (conteos mínimos, integridad, SHA-256) → compresión `.db3.zst` → publicación mediante un paso desacoplado (inicialmente `gh release upload` con `GITHUB_TOKEN`, borrando releases viejos) → actualización automática del manifiesto/catálogo (`databases.json`, `puzzle_databases.json`), con la licencia de cada base.
  5. Decidir qué pasa con las bases del catálogo que no se regeneran (Caissabase, AJ-COR, AJ-OTB, mb-3): alojarlas también, si su licencia lo permite, o retirarlas del catálogo. Ninguna entrada debe seguir dependiendo de `db.encroissant.org` al cerrar esta etapa.
  6. Documentar el pipeline (ETL, validaciones, manifiesto versionado, decisiones de arquitectura) en la sección técnica de la web, en ambos idiomas.
  7. _(Opcional futuro, al comprar dominio propio)_: conectar **Cloudflare R2** (compatible con S3, 10 GB gratis, egress ilimitado) como espejo cambiando solo el paso de publicación.

### Etapa 6 — Difusión pública y futuro opcional (Cloud / IA)

- Compartir Onyx en comunidades una vez listas las Etapas 3–5 (con pequeños ciclos intermedios de bugfixes y mejoras):
  - primero el grupo de ajedrez local (hispanohablante);
  - después TEC, clubes, Discord y Reddit.
- Evaluar servicios opcionales en la nube o IA paga únicamente si existe masa crítica real de usuarios y demanda validada (la app local continúa 100 % libre bajo GPLv3).

---

## 5. Para retomar en el próximo chat

1. **Probar la actualización desde la app en Windows:** con 0.28.1 instalada, generar el instalador nuevo (`pnpm tauri build --bundles nsis`) y ejecutarlo con `/P /UPDATE`, igual que lo hace el actualizador. Comprobar que se conservan las bases, Análisis de jugadores y la clave de registro, y que Maia pide reparación. Si hay En Croissant instalado, comprobar que el aviso sale una sola vez.
2. **Hacer commit** de los cambios de la Etapa 2 y de la revisión.
3. **Publicar `v0.29.0` antes de empezar la web.** Las notas (EN/ES) deben mencionar:
   - la nueva identidad y la migración automática de datos;
   - que Maia 3 se repara en un clic tras actualizar;
   - el aviso para quienes compartían carpeta con En Croissant (En Croissant empezará vacío y no se borró nada);
   - los avisos de actualización en macOS y Linux.
4. **Pedir a los dos testers de macOS** que actualicen de 0.28.x a 0.29.0 y confirmen que sus datos siguen ahí. Repetir en la VM de Linux si es posible. Hasta ahora la migración en esos sistemas solo está cubierta por tests unitarios.
5. **Arrancar la Etapa 3** con las decisiones ya tomadas: web en `website/` dentro de este repo y completamente bilingüe (español por defecto, inglés con la misma prioridad).
