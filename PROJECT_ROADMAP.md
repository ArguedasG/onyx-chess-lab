# Onyx Chess Lab — Estado y roadmap

> Documento operativo y fuente vigente de verdad del proyecto.
>
> Última actualización: 2026-10-15.

## 1. Cómo utilizar este documento

Este archivo debe permitir que una conversación nueva comprenda rápidamente qué es Onyx Chess Lab,
qué está cerrado, cuál es la fase activa y qué decisiones siguen vigentes.

Antes de planificar o implementar una funcionalidad relevante se debe leer:

1. este documento completo;
2. la documentación específica enlazada desde la fase activa;
3. el código actual relacionado con la tarea.

El roadmap funciona como una **lista detallada de tareas y decisiones**, no como un calendario
obligatorio. Expresa intención y un orden orientativo, pero no autoriza automáticamente a implementar
fases futuras: solo se trabaja en la funcionalidad solicitada por el autor.

Las prioridades se mueven según las personas que usan o están por usar Onyx. Una necesidad concreta
de un usuario real —por ejemplo, que un profesor o miembros del grupo de ajedrez utilicen macOS o
Linux— puede adelantar tareas de fases posteriores sin que eso invalide el resto del documento. Los
cambios de prioridad se registran en el registro operativo.

Los estados significan:

- **Pendiente**: todavía no implementada;
- **En definición**: alcance y decisiones en preparación;
- **En progreso**: existe trabajo activo;
- **Implementada**: código terminado y validación automática proporcional;
- **Validada**: probada manualmente en el flujo real además de la validación automática;
- **Cerrada**: alcanzó el alcance acordado; sus ampliaciones pertenecen a otra fase;
- **Mantenimiento**: correcciones o endurecimiento continuo que no reabren una fase cerrada.

El documento acumulativo anterior se conserva únicamente como trazabilidad en
`docs/roadmap-history.es.md`. Sus prioridades, preguntas y decisiones no deben tratarse como vigentes
sin confirmarlas aquí.

---

## 2. Identidad y principios

Onyx Chess Lab es un fork experimental de
[En Croissant](https://github.com/franciscoBSalgueiro/en-croissant), distribuido bajo GPLv3. Ha
evolucionado hacia una plataforma local-first de entrenamiento, experimentación reproducible,
simulación de comportamiento humano, análisis estadístico, análisis de jugadores y preparación de
ajedrez.

Sus propósitos son:

- ofrecer una herramienta gratuita y útil para jugadores y para el equipo de ajedrez del TEC;
- reunir las herramientas que el autor necesita para estudiar, experimentar y entrenar;
- demostrar ingeniería de producto, datos, AI/ML aplicado y MLOps mediante evidencia reproducible.

### Principios vigentes

1. Medir antes de optimizar o afirmar.
2. No presentar ELO, estilos, motivos o planes como calibrados sin evidencia.
3. Separar comportamiento humano, fuerza limitada y fuerza de referencia.
4. Mantener privacidad local por defecto.
5. Versionar configuraciones, resultados y formatos persistidos.
6. Construir infraestructura compartida sin mezclar experiencias de usuario diferentes.
7. Preservar compatibilidad con upstream cuando sea razonable.
8. No rediseñar arquitectura sin un problema demostrado.
9. Diseñar borrado, exportación, backup y migración desde el inicio cuando se persistan datos.
10. Mostrar procedencia, cobertura, límites y tamaño de muestra de toda conclusión analítica.

---

## 3. Estado actual del producto

Onyx Chess Lab es una aplicación pública en etapa temprana. El repositorio
`ArguedasG/onyx-chess-lab` es público y cualquier persona puede descargar sus releases de GitHub,
aunque la distribución activa se ha limitado hasta ahora principalmente a amigos cercanos que la
prueban y comunican problemas.

- Primera versión compartida públicamente: **0.15.3**, aproximadamente una semana antes del
  2026-09-15.
- Última versión publicada: **0.20.0** (mantenimiento del estudio de mercado, 8.2 Motor y análisis
  y 8.3 Bases de referencia). Detalle: `docs/release-notes-0.20.0.es.md`.
- Canal disponible y validado: **Windows x64 mediante GitHub Releases**.
- Linux x64 (AppImage y .deb) y macOS (Apple Silicon e Intel) se publican desde 0.18.0 como **vista
  previa sin probar**, con advertencia y pasos de apertura en el README. macOS no está firmado ni
  notarizado por Apple.
- Actualizador: canal propio y firmado de Onyx operativo.
- Estado de producto: **alpha/beta pública temprana con mantenimiento continuo basado en uso real**.
- Usuarios: estudiantes y miembros de un grupo de ajedrez; es probable que pronto la utilicen un
  profesor y otras personas. Sus plataformas y necesidades determinan la prioridad real.
- Trabajo actual: **Fase 8 replanificada a partir del estudio de mercado**
  (`docs/market-study.es.md`, 2026-10-14). El mantenimiento del estudio, 8.2 y 8.3 se publicaron en
  0.20.0; **8.4 Jugadores: ficha y estadísticas** está implementada y pendiente de validación
  manual; la siguiente es **8.5 Generador de repertorios**. La reestructuración de la interfaz inspirada en ChessBase
  para Mac (0.19.0) sigue como criterio de diseño de las pantallas nuevas.

La existencia de usuarios reales aumenta la prioridad de compatibilidad de datos, recuperación,
actualizaciones seguras y corrección rápida de defectos. Un bug no reabre automáticamente la fase que
originó una función: se registra como mantenimiento P0–P3 y puede interrumpir el orden del roadmap si
su gravedad lo justifica.

### Mantenimiento conocido

- repetir de forma explícita las pruebas del actualizador con red caída y artefacto alterado, porque
  no existe certeza suficiente sobre la profundidad de las pruebas anteriores;
- confirmar mediante uso independiente una instalación administrada limpia de Maia 3 en Windows sin
  Python ni Git preinstalados; el flujo se considera disponible, pero todavía no se presenta como
  validado externamente;
- decidir en Fase 10 cómo migrar de forma segura el identificador heredado `org.encroissant.app` y el
  campo de publisher sin ocultar ni perder datos de instalaciones existentes; no deben cambiarse de
  manera aislada;
- terminar la limpieza pública de `CONTRIBUTING.md`, plantillas de issues y otros textos heredados de
  En Croissant;
- completar la internacionalización de textos fijos: los errores y nombres generados de aperturas,
  estudios, táctica, finales e importación ya usan i18n; quedan mensajes técnicos en inglés de
  bases, Lichess, Player Analysis y exportaciones HTML;
- dividir gradualmente archivos grandes cuando se modifiquen de forma sustancial, empezando por
  `OpeningDashboardPage.tsx` (`PracticePanel.tsx` ya se dividió en componentes para el modo
  Aprender);
- atender con prioridad cualquier regresión de instalación, actualización, migración o pérdida de
  datos comunicada por usuarios;
- conservar documentación de release, licencias y recuperación junto con cada versión pública.

#### Mantenimiento derivado del estudio de mercado

**Estado: Implementado y validado automáticamente (2026-10-15); validación manual nativa pendiente.**
Ideas del estudio: I-01, I-26 (mínima), I-37 e I-42.

- **Búsqueda de jugadores por tokens normalizados (I-01):** cada palabra de la búsqueda debe aparecer
  en el nombre, en cualquier orden y sin distinguir acentos, mayúsculas ni puntuación («David
  Cabezas» encuentra «Cabezas Solano, David Alejandro»). La normalización corre en Rust como función
  SQL registrada en cada conexión, sin cambiar el esquema de las bases. Las búsquedas ocultan
  jugadores sin partidas y el autocompletado y la tabla de jugadores ordenan por número de partidas
  (la tabla, solo mientras hay búsqueda; la búsqueda espera a que se deje de escribir). Medido en la
  Gigabase local (545 k jugadores, compilación debug): 0,32–0,45 s por búsqueda, incluido el orden.
- **Informe de calidad mínimo (I-26):** en los ajustes avanzados de una base, «Revisar calidad»
  cuenta sin borrar nada partidas sin jugadas, decisivas de menos de 20 medias jugadas, con resultado
  desconocido, sin año, con fecha futura, con el mismo jugador en ambos bandos, con rating fuera de
  100–2900 y desde posición propia. Es un único recorrido de `Games` (12–20 s en 10 M de partidas).
  Los duplicados exactos y probables quedan para la versión completa de 8.3.
- **Repeticiones de memoria configurables (I-37):** el modo Aprender exige por defecto **2
  repeticiones seguidas sin errores** para dar una línea por aprendida (antes, 1); configurable de 1
  a 5 en los ajustes de Aperturas. Un error reinicia la cuenta de esa línea.
- **Jerarquía de aperturas (I-42):** el panel de aperturas de la ficha de jugador agrupa por
  **Familia → Variante → Subvariante**, plegable, con partidas, porcentaje y resultados en cada nivel;
  normaliza «Defence/Defense». Las partidas con el nombre exacto de un nivel desplegado aparecen como
  «Sin una variante más concreta». El rating par (I-30) se añadió en 8.4.

---

## 4. Estado de las fases

| Fase                                        | Estado vigente                           | Resultado o continuación                                                                                          |
| ------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 0 — Base de bots humanos                    | Cerrada y validada                       | Bots humanos, mediciones e historial operativo.                                                                   |
| 1 — Motores e infraestructura experimental  | Cerrada y validada                       | Auditoría UCI, presets y manifiestos reproducibles.                                                               |
| 2 — Model Game Generator                    | Cerrada y validada                       | Generación individual, lotes y experimentos persistentes.                                                         |
| 3 — Experiment Analysis                     | Cerrada para su alcance                  | Análisis dual, análisis de partidas y benchmark W/D/L exploratorio.                                               |
| 4 — Beta de bots y torneos                  | Cerrada                                  | Sus ampliaciones avanzadas se concentran en Fase 9.                                                               |
| 5 — Identidad y distribución inicial        | Cerrada como lanzamiento público inicial | Marca, repositorio, release Windows y actualizador propios; endurecimiento residual pasa a mantenimiento/Fase 10. |
| 6 — Táctica, Aperturas y Finales            | Cerrada y validada manualmente           | Tres experiencias especializadas con persistencia, práctica y estadísticas.                                       |
| 6.A — Consolidación de Aperturas            | En curso                                 | Rediseño publicado en 0.17.0; importación editable y modo Aprender en desarrollo. Ver sección 7.A.                |
| 7.0 — Base escalable de consultas           | Cerrada y validada manualmente           | Snapshots, paginación, PGN bajo demanda, cancelación, caché y benchmark real.                                     |
| 7.1 — Opening Reports                       | Cerrada y validada manualmente           | Informe local por posición, teoría, transposiciones, jugadores y exportación.                                     |
| 7.2 — Player Analysis                       | Cerrada y validada manualmente           | Perfil local, motor, evidencia y posiciones entrenables.                                                          |
| 7.3 — Inteligencia de aperturas y jugadores | Cerrada                                  | 7.3.1–7.3.4 terminadas; las regresiones remotas y de scroll se corrigieron y verificaron antes de avanzar.        |
| 8 — Serious Preparation Tools               | En curso                                 | 8.0–8.4 implementadas; replanificada en 8.2–8.10 a partir del estudio de mercado. Ver sección 7.                  |
| 9 — Expansión avanzada                      | Pendiente                                | Bots con personalidad medida, torneos con el usuario e interpretación estratégica.                                |
| 10 — Consolidación pública y MLOps          | Pendiente (la última)                    | Producto, multiplataforma, datos, automatización y evidencia reproducible.                                        |

### Documentación de fases cerradas

- Motores y bots: `docs/engine-audit-phase-1-1.es.md`,
  `docs/engine-presets-and-manifests.es.md` y `docs/human-bots-phase-*.es.md`.
- Generación y experimentación: `docs/model-game-generator-phase-*.es.md` y
  `docs/experiment-analysis-phase-*.es.md`.
- Entrenamiento: `docs/training-phase-6-*.es.md`.
- Bases e informes: `docs/database-queries-phase-7-0.es.md` y
  `docs/opening-reports-phase-7-1.es.md`.
- Player Analysis: `docs/player-analysis-phase-7-2.es.md`; ficha de jugador:
  `docs/players-phase-8-4.es.md`.
- Estudio de mercado (insumo de 8.2–10, identificadores `I-xx`): `docs/market-study.es.md`.
- Release y actualizador: `docs/phase-5-brand-release-alpha-plan.es.md`,
  `docs/updater-phase-5-2.es.md` y `docs/managed-maia3.es.md`.

---

## 5. Prioridades y orden orientativo

```text
Producto público + mantenimiento continuo
        ↓
Necesidades de usuarios reales (entrenamiento diario, plataformas, bugs)
        ↓
Mantenimiento del estudio de mercado (I-01, I-26 mínima, I-37, I-42)
        ↓
8.2 Motor y análisis  ‖  8.3 Bases de referencia (calidad, rendimiento esperado, enlaces)
        ↓
8.4 Jugadores → 8.5 Generador de repertorios → 8.6 Preparación contra rivales
        ↓
8.7 Entrenamiento desde errores
        ↓
8.8 Táctica · 8.9 Finales · 8.10 Aperturas   (independientes; pueden adelantarse)
        ↓
9 — Expansión avanzada (bots, torneos, interpretación estratégica)
        ↓
10 — Consolidación pública, multiplataforma y MLOps (la última)
```

El orden es orientativo. Las prioridades se deciden así:

1. defectos críticos, riesgos de datos y seguridad de actualización;
2. lo que bloquea a personas que ya usan o van a usar Onyx: por ejemplo, un instalador de macOS o
   Linux se adelanta a la Fase 8 si un profesor o el grupo lo necesita;
3. mejoras en las experiencias de uso frecuente, especialmente el entrenamiento;
4. el resto de fases en el orden listado.

Un rediseño no planificado puede justificarse cuando una parte de la aplicación no se usa por su
diseño, como ocurrió con Aperturas en 0.17.0. Se registra como ampliación de la fase original sin
reabrir su cierre. El trabajo correctivo se registra como mantenimiento.

---

## 6. Fase 7.3 — Mejoras de inteligencia de aperturas y jugadores

**Estado: Cerrada para su alcance; ampliaciones posteriores pasan a las Fases 8 y 9.**

Progreso vigente:

- **7.3.1:** implementada, validada automáticamente y aceptada antes de avanzar a Fase 8.
- **7.3.2:** implementada: informe remoto compacto para Lichess todo y Masters, filtros locales de
  evento y control de tiempo, relevancia y partidas modelo, y primera desviación relativa al cohorte
  filtrado y fechado del informe.
- **7.3.3:** carga ligera, hidratación bajo demanda, checkpoint incremental, deduplicación, alias
  manuales, comparación anual, exportación, biblioteca y guardado de versiones implementados; la
  cobertura de relojes ya se clasifica, las estadísticas temporales demostrables respetan ese umbral
  y las versiones guardadas pueden compararse de forma descriptiva.
- **7.3.4:** implementada con agrupación reproducible, catálogo táctico acotado, cobertura,
  familias de finales, tablebase bajo demanda y relación observacional con entrenamiento.

  7.3 amplía 7.1 y 7.2 sin reabrir sus núcleos. Se divide en cuatro entregas suficientemente grandes
  para producir valor, pero separadas para controlar riesgo, persistencia y consumo de recursos.

### 7.3.1. Fundamentos de datos y persistencia

**Estado: Cerrada para su alcance.**

Objetivo: eliminar cuellos de botella conocidos y crear una base durable antes de añadir inteligencia.

- consultar y paginar metadatos de jugador sin hidratar el movetexto PGN;
- cargar PGN únicamente para partidas que se abran o analicen;
- introducir un coordinador de solicitudes remotas que respete una petición simultánea;
- procesar correctamente respuestas NDJSON del explorador de jugador;
- propagar cancelación real a la solicitud HTTP;
- implementar caché acotada, espera y recuperación explícita ante HTTP `429`;
- persistir informes y versiones guardadas mediante archivos JSON versionados en los datos privados
  de Onyx;
- usar un manifiesto pequeño para localizar artefactos, sin adoptar SQLite antes de demostrar que el
  volumen o las consultas lo requieren;
- definir escritura segura, migración, borrado, exportación y recuperación de archivos incompletos.

Las versiones de un perfil se crean únicamente cuando el usuario pulsa **Guardar versión**. Recalcular
actualiza la vista actual, pero no genera silenciosamente historial durable.

### 7.3.2. Opening Reports ampliados

**Estado: Cerrada para su alcance.**

Objetivo: ampliar el informe local y añadir informes remotos deliberadamente compactos.

#### Informe remoto

- habilitar un informe compacto para **Lichess todo** y **Lichess Masters**;
- requerir una sesión Lichess conectada para generar el informe;
- utilizar exclusivamente agregados y referencias ofrecidos por la API oficial;
- mostrar un diseño propio para fuente remota, no una versión vacía del informe local;
- explicar una sola vez que la cobertura depende de los agregados y límites de Lichess;
- incluir resultados, continuaciones principales, rating medio cuando exista, evolución disponible y
  referencias destacadas o recientes;
- limitar de forma explícita el número de posiciones remotas consultadas para construir teoría;
- consultar secuencialmente, con progreso, cancelación, caché y respeto de `429`;
- no descargar masivamente partidas ni intentar reproducir localmente la base de Lichess;
- no prometer jugadores exhaustivos, todas las partidas, transposiciones completas ni órdenes de
  llegada cuando la API no los expone.

#### Informe local

- añadir filtros de evento y control de tiempo cuando los metadatos existan;
- definir y documentar una puntuación de relevancia antes de ofrecer ese orden;
- seleccionar partidas modelo mediante criterios visibles y reproducibles;
- detectar la primera desviación de cada partida modelo respecto a partidas estrictamente anteriores
  del cohorte local filtrado y acotado;
- guardar informes en una biblioteca persistente con FEN, fuente, filtros, fecha, cobertura y versión;
- cargar títulos o perfiles remotos solo bajo demanda y sin inferir identidades reales.

Una “novedad” en 7.3 significa **primera desviación respecto al cohorte filtrado del informe**. La
fecha de la partida modelo funciona como corte, solo se comparan fechas estrictamente anteriores y la
interfaz declara el tamaño de referencia y el límite configurado de partidas de teoría. No se presenta
como novedad histórica mundial ni como búsqueda exhaustiva de toda la base.

### 7.3.3. Player Analysis escalable

**Estado: Cerrada para su alcance.**

Objetivo: mejorar escala, identidad explícita, sincronización y análisis temporal.

- construir perfiles desde metadatos paginados y cargar movetexto bajo demanda;
- permitir alias seleccionados manualmente por fuente o base;
- usar el username exacto para una cuenta Lichess descargada;
- no fusionar automáticamente nombres parecidos, cuentas online ni identidades reales;
- sincronizar partidas nuevas mediante checkpoint, deduplicación y actualización incremental;
- analizar administración del tiempo solo cuando exista cobertura `[%clk]` suficiente;
- exportar el perfil actual en JSON y HTML;
- guardar versiones únicamente por acción explícita;
- comparar periodos con filtros equivalentes, muestra y cobertura visibles;
- describir cualquier relación entre entrenamiento y resultados como observacional, no causal.

#### Cobertura de relojes

- **Insuficiente:** menos de 10 partidas utilizables o menos del 50 % de cobertura; no se publican
  conclusiones agregadas.
- **Exploratoria:** al menos 10 partidas y 50–69 % de cobertura.
- **Adecuada:** al menos 20 partidas y 70 % de cobertura.
- **Alta:** al menos 50 partidas y 85 % de cobertura.

La interfaz muestra siempre `partidas con reloj / partidas seleccionadas`. Estos niveles describen
cobertura, no garantizan por sí solos validez estadística.

### 7.3.4. Inteligencia verificable y evolución

**Estado: Cerrada para su alcance.**

Objetivo: sustituir agrupaciones amplias por hallazgos comprobables sin inventar motivos.

- agrupar errores por posición normalizada y por jugada repetida;
- introducir un catálogo inicial pequeño de motivos tácticos verificables;
- mostrar evidencia, confianza, cobertura y tamaño de muestra;
- mantener como “sin clasificar” todo caso ambiguo;
- clasificar finales por material y familias reproducibles;
- consultar tablebase en posiciones elegibles y declarar el criterio fuera de cobertura;
- comparar versiones y periodos del perfil;
- relacionar entrenamiento posterior y resultados únicamente como observación descriptiva.

### Fuera de alcance de 7.3

- temas estratégicos, planes y finales típicos de una apertura;
- patrones estratégicos amplios sin clasificador demostrado;
- creación o actualización automática de sets de errores tácticos;
- identidad automática entre usernames, nombres reales o perfiles FIDE;
- paridad entre el informe remoto y el informe local;
- descarga o indexación local masiva de la base pública de Lichess;
- colaboración en la nube o sincronización entre dispositivos.

### Criterios generales de salida

- ninguna consulta carga todos los PGN de un perfil si solo necesita metadatos;
- las solicitudes Lichess son secuenciales, cancelables, cacheadas y respetan límites remotos;
- los informes remotos muestran únicamente información respaldada por la API;
- todos los artefactos durables tienen versión, procedencia, borrado, exportación y recuperación;
- toda conclusión muestra evidencia y tamaño de muestra;
- las rutas nuevas se dividen antes de crear otro componente o módulo monolítico;
- las cuatro entregas cuentan con pruebas automáticas proporcionales y validación manual nativa.

---

## 7. Fase 8 — Serious Preparation Tools

**Estado: En curso. 8.0, 8.1, 8.3 y 8.4 implementadas; 8.2 con su primera versión implementada.**

Desde el 2026-10-15 las subfases 8.2–8.10 siguen el estudio de mercado (`docs/market-study.es.md`):
cada viñeta cita su idea (`I-xx`), cuya ficha en el estudio contiene el problema, la referencia y la
propuesta de implementación. La antigua 8.2 «Preparación individual y de equipo» se reparte entre
8.4 (ficha y estadísticas) y 8.6 (preparación contra rivales). Las reglas de rendimiento de la
sección 7 del estudio (un solo planificador de motores, trabajo pesado en Rust y en segundo plano,
ningún escaneo por celda, datos grandes fuera del JSON de arranque) se aplican a todas.

### 8.0. Biblioteca personal de estudios

**Estado: Implementada; validación automática completa y validación manual en curso.**

- biblioteca local de estudios con capítulos PGN ordenables y editables en el tablero existente;
- creación desde cero, importación PGN por lotes y acción para copiar la partida o análisis actual;
- guardado explícito o autoguardado según la preferencia global, con hasta 20 revisiones por capítulo;
- papelera recuperable, copia automática del manifiesto y respaldo/restauración JSON explícitos;
- exportación PGN por capítulo o estudio con `StudyName`, `ChapterName` e ids de procedencia;
- copia entrenable —sin modificar el estudio— hacia sets tácticos y de finales nuevos o existentes;
- revisión obligatoria de posición y solución/variantes para Táctica, y de posición, color y objetivo
  para Finales;
- copia de árboles PGN completos hacia un repertorio nuevo o importación con vista previa en uno
  existente;
- archivos fuente privados e inmutables para las copias de repertorio y procedencia conservada en
  ejercicios embebidos.

Contrato y validación técnica: `docs/studies-phase-8-0.es.md`.

### 8.1. Acciones de posición desde el tablero

**Estado: Implementada; validación automática completa y validación manual pendiente.**

- acción unificada sobre la posición visible del tablero, sin crear una biblioteca paralela;
- búsqueda en todas las líneas entrenables de los repertorios locales;
- separación demostrable entre coincidencia exacta —misma posición inicial y orden de jugadas— y
  transposición —misma posición legal mediante una ruta diferente—;
- ruta y continuación del repertorio visibles para explicar cada coincidencia;
- copia hacia un set táctico nuevo o embebido existente, con selección y confirmación obligatorias
  de una solución ya preparada en el árbol del tablero;
- conservación de las variantes analizadas y uso de la política de aceptación del set de Táctica;
- copia hacia un set de Finales nuevo o existente, con color del estudiante y objetivo explícitos;
- navegación directa desde un capítulo abierto hacia su estudio de origen.

Contrato y validación técnica: `docs/position-actions-phase-8-1.es.md`.

### Ajustes transversales previos a 8.2

**Estado: Implementados y validados automáticamente; validación manual nativa pendiente.**

- el tablero muestra las continuaciones PGN cuando una posición tiene alternativas, diferenciando la
  línea principal con una flecha azul más intensa y las variantes con flechas más claras y finas;
- las flechas de variantes conservan un interruptor global, nacen activadas para perfiles nuevos y
  tienen prioridad visual sobre una flecha de motor coincidente;
- la práctica táctica permite solicitar **Ver la solución** mediante confirmación explícita;
- revelar una solución registra un intento fallido —incluidos los contadores Woodpecker—, reproduce
  la línea principal y obliga a resolver después el ejercicio;
- los ejercicios sin solución PGN consultan un motor local objetivo y no registran el fallo si el
  motor no está disponible o no devuelve una línea.

### 8.2. Motor y análisis

**Estado: Implementada y validada automáticamente (2026-10-15); validación manual nativa de la
segunda entrega pendiente.** Ideas: I-53, I-14, I-15, I-24, I-46, I-54 (primera versión). Contrato, método y
mediciones: `docs/engine-analysis-phase-8-2.es.md`.

- **presupuesto de motores (I-53, primera versión):** procesos por lotes = núcleos físicos − 1, con
  sus hilos y hash repartidos (3 motores de 2 hilos y 256 MB en el i5 de referencia); los análisis
  por lotes esperan turno en un semáforo global y usan esos `Threads`/`Hash`; el reporte de la
  partida abierta conserva la configuración del usuario. Cada motor de análisis en vivo activo ocupa
  un turno, y también cada bot que esté pensando en una partida (los lotes nunca bajan de uno);
- **caché persistente de evaluaciones (I-14):** SQLite propia en los datos privados (nunca en una
  base de partidas), clave por posición sin contadores + motor (ejecutable, argumentos y opciones
  salvo `Threads`/`Hash`) + límite + líneas, 200.000 posiciones con poda por uso, versión de esquema,
  tamaño y botón para vaciarla en Ajustes → Directorios. El motor solo se arranca para las posiciones
  que la caché no conoce;
- **límite «profundidad con tope de tiempo»** (`go depth D movetime T`), disponible en el reporte;
  el predeterminado sigue siendo 500 ms por jugada;
- **Player Analysis en paralelo:** varias partidas a la vez según el presupuesto;
- **benchmark reproducible (I-14, I-54):** prueba ignorada con motor y PGN reales que mide tiempo y
  acuerdo de clasificación frente a la referencia y frente a su propio ruido. Con 8 partidas propias
  (548 jugadas, Stockfish, i5-1135G7): la referencia de 500 ms repetida acuerda en el 94,8 % de los
  errores (ruido); profundidad 16 con tope de 500 ms es un 14 % más rápida y queda dentro del ruido;
  la caché en caliente reduce 276 s a 0,2 s; 3 motores de 2 hilos en paralelo son 2,8 veces más rápidos (99 s frente a 276 s) y, en una segunda medición, quedan dentro del ruido (97,8 % de los errores de la referencia; en la primera, 90,6 %). Ninguna configuración perdió un error
  grave (61/61). No se cambió ningún predeterminado;
- **probabilidad de victoria y momentos clave (I-15):** Player Analysis clasifica como el reporte
  (más de 5, 10 y 20 puntos de probabilidad perdidos; ACPL como dato), con la versión de la
  clasificación en el límite guardado para recalcular perfiles anteriores; el reporte muestra hasta 3
  **momentos clave** con la probabilidad antes y después y una etiqueta (vuelco, victoria escapada o
  error costoso). No se añadieron reglas nuevas de «brillante»;
- **explicación factual (I-24) y flechas (I-46)** en «Aprende de tus errores»: tras acertar o ver la
  solución, el motor busca cómo se castigaba la jugada y Onyx dice solo hechos («permite mate en 1:
  Qxf7#», «permite Bxf7+, que captura el peón en f7», cambio de evaluación, mejor jugada); el tablero
  marca la jugada en rojo, la mejor en verde y la pieza perdida con un círculo;
- **novedades en caché:** la búsqueda de la primera jugada nueva recorre toda la base de referencia
  (20–30 s en la Gigabase) y era lo único lento al repetir un reporte; su resultado se guarda en la
  misma caché, ligado al estado de la base;
- **primer presupuesto de rendimiento (I-54):** bundle web de 5,67 MB (1,71 MB comprimido) y 340 kB
  de CSS como línea base del 2026-10-15, además de las mediciones de análisis;
- **segunda pasada dirigida (I-14):** tras la primera pasada, las posiciones a ambos lados de cada
  jugada que pierde más de 4 puntos de probabilidad se analizan otra vez con profundidad 22 y tope de
  1,5 s (como mucho 12 por partida, las mayores pérdidas primero). Medida contra una referencia de
  2 s por jugada: 500 ms pasan de 94,6 % a 97,8 % de los errores encontrados (+49 % de tiempo) y
  250 ms con segunda pasada (95,7 % de recall y de precisión) superan a 500 ms sin ella en el mismo
  tiempo. Por eso el reporte usa ahora **250 ms + segunda pasada** por defecto (solo para quien no
  tenga ajustes del reporte guardados);
- **apertura desde la nube de Lichess (I-14, opcional):** casilla del reporte, desactivada por
  defecto porque envía las posiciones a Lichess. Toma las evaluaciones de las primeras 36 medias
  jugadas mientras la nube las tenga con profundidad ≥ 20 (una petición a la vez, pausa de 80 ms,
  presupuesto de 12 s, se detiene en la primera ausencia o en un `429`); la última posición de la
  nube la analiza también el motor para no comparar fuentes distintas en la jugada que sale de ella;
- **presupuesto de rendimiento (I-54):** el arranque de cada sesión se mide (Ajustes → Directorios
  → «Caché de análisis» y el registro) y abrir la ficha de un jugador registra partidas y
  milisegundos. Falta tomar esas cifras en la máquina de referencia y la memoria máxima durante un
  lote, que hoy se acota por diseño (3 × 256 MB de hash).

### 8.3. Bases de referencia

**Estado: Implementada y validada automáticamente (2026-10-15); validación manual nativa
pendiente.** Ideas: I-26 (completa), I-28 y la primera parte de I-25. Las bases alojadas por el
autor (resto de I-25) pasan a la Fase 10 (decisión del autor, 2026-10-15).

- **catálogo propio que conserva el de En Croissant (I-25, primera parte):** los JSON de
  `src/data/catalog` viajan con la aplicación y reflejan el catálogo de En Croissant (5 bases, 1
  base de puzzles y 23 motores). El catálogo en vivo de `encroissant.org` se sigue consultando y se
  combina encima (sus entradas primero, sin duplicados por enlace y ruta), así que sus novedades
  siguen apareciendo; si su servidor falla o desaparece, la copia incluida sigue ofreciendo todas
  las descargas. Las entradas propias de Onyx se añadirán en esos mismos archivos;
- **informe de calidad completo (I-26):** «Revisión completa» en los ajustes avanzados de una base,
  en segundo plano, con progreso y botón para detenerla, sin cambiar nada: duplicados exactos
  (mismos jugadores, jugadas, torneo, ronda y fecha) y probables (mismos jugadores y jugadas con
  otros datos), nombres sospechosos (vacíos, de relleno, menos de tres letras o con dígitos) y
  jugadores con ratings que difieren en más de 1000 puntos dentro del rango plausible, con ejemplos.
  Un único recorrido de las jugadas con huellas ordenadas en vez de `GROUP BY` sobre el movetexto:
  **53 s en la Gigabase de 10,3 M de partidas (debug)**, frente a ~6 min de las consultas SQL
  equivalentes. Resultado en esa base: 0 duplicados, 2.007 nombres sospechosos y 1.706 jugadores con
  ratings incoherentes;
- **rendimiento frente a lo esperado y tendencia por jugada (I-28)** en el informe de posición: la
  columna «vs. esperado» resta a la puntuación de cada jugada la que predice la diferencia de Elo
  (fórmula de Elo, partidas con ambos ratings y resultado; al menos 10), con detalle en el tooltip, y
  una flecha marca las jugadas que ganan o pierden 5 puntos o más de cuota en los últimos 3 años
  frente a los anteriores (al menos 30 partidas en cada periodo). Los informes pasan a la versión 5;
  los guardados antes muestran «—» en esa columna;
- **restablecer enlaces a partidas rotos:** cuando un enlace `onyx://game` de un comentario ya no
  apunta a la partida correcta (la base se actualizó, se reemplazó o cambió de archivo), un botón
  «Restablecer enlace» busca primero por los datos de la partida (jugadores y año, guardados en el
  enlace o tomados de su texto), que es inmediato, y comprueba que las candidatas pasan por la
  posición del comentario; la búsqueda por posición queda como respaldo, con progreso. El usuario
  elige la partida (también en otra base) y el enlace se reescribe. **Implementado (2026-10-15);
  validación manual pendiente.** Se ofrece al abrir un enlace cuya partida ya no existe o cuyos
  jugadores no coinciden; los enlaces nuevos guardan jugadores y año (`w`, `b`, `y`) y los antiguos
  los toman de su texto «Blancas - Negras (año)».

### 8.4. Jugadores: ficha y estadísticas

**Estado: Implementada y validada automáticamente (2026-10-15); validación manual nativa
pendiente.** Modifica la antigua 8.2. Ideas: I-02, I-03 (consulta puntual), I-13, I-22, I-30, I-42,
I-44, I-45. Contrato, definiciones y mediciones: `docs/players-phase-8-4.es.md`.

- **sección «Jugadores»** separada de «Cuentas» (que queda para conectar cuentas): búsqueda en todas
  las bases locales y fichas guardadas de cuentas propias, «Yo» con otras fuentes, rivales, alumnos
  y otros; la ficha propia es un caso más. `PlayerAnalysisPanel.tsx` se dividió antes de moverlo;
- **ficha para cualquier jugador (I-02)**, también desde Bases de datos, con alias manuales por
  ficha, notas y **FIDE por consulta puntual (I-03)**: candidatos vía Lichess y confirmación manual;
  sin descargar listas ni historial (decisión del autor, 2026-10-15);
- **datos en una llamada por base** (`get_player_games`): apertura desde las jugadas, final en el
  tablero (mate, ahogado…) y últimos relojes, decodificados en Rust y en paralelo. Carlsen en la
  Gigabase (3.934 partidas): 0,95 s;
- **Partidas (I-13):** lista filtrable y paginada con actualizar (sincronización de 7.3.3), abrir,
  analizar con motor las elegidas, añadir a un estudio y exportar PGN;
- **rating par (I-30)** en toda tabla de resultados de la ficha y de Player Analysis; **aperturas por
  familia → variante → subvariante con rating par (I-42)**;
- **momentos destacados (I-22)**: error más costoso (la antigua «jugada más cara»: la que más
  probabilidad de ganar perdió) y mayor remontada con motor; mayor sorpresa, rival más fuerte
  vencido, rachas, mate más rápido y partida más larga sin motor;
- **psicología, reloj y tramos de error (I-44)**: siguiente partida del mismo día tras cada
  resultado, cómo terminan derrotas y victorias (mate, probable tiempo, otra causa) y, con motor,
  errores por tramo de jugadas, por reloj, jugadas rápidas y derrotas en posiciones no perdidas;
- **rivales (I-45)**: más enfrentado, némesis y rival favorable por rating par, lista con partidas y
  «Contra ti» en la ficha de un rival.

### 8.5. Generador de repertorios

**Estado: Pendiente.** Ideas: I-40 e I-33 (como criterio «líneas difíciles para el rival»).

- repertorio nuevo y editable desde la posición del tablero, con estadísticas de la base local o de
  Lichess, enfoques medibles, respuestas del rival por frecuencia o por Maia, verificación con motor,
  anotaciones automáticas, partidas modelo enlazadas y procedencia.

### 8.6. Preparación contra rivales

**Estado: Pendiente.** Modifica la antigua 8.2. Ideas: I-19, I-31 (ocho estructuras), I-32, I-33,
I-41, I-43 (gemelo, versión 1), I-04 (solo retransmisiones para rivales, opcional).

- **fuentes de partidas del rival:** su cuenta de Lichess o Chess.com (como ya permite «Usuario»), un
  PGN cargado por el usuario o una base local, con filtros de ritmo, periodo y últimas N partidas; la
  preparación no depende de una base de referencia;
- repertorio contra realidad (I-19), veredicto «cómo jugarle» (I-32), dificultad práctica de las
  posiciones clave del rival (I-33) y líneas de preparación generadas (I-41);
- ocho estructuras de peones validadas con ejemplos etiquetados (I-31);
- bot gemelo: libro del jugador + Maia a su Elo, con medición de fidelidad (I-43);
- opcional: retransmisiones de Lichess para rivales OTB sin cuenta online (I-04);
- paquetes locales exportables antes de cuentas, nube o colaboración en tiempo real.

### 8.7. Entrenamiento desde errores

**Estado: Pendiente.** Ideas: I-17, I-18, I-21, I-29.

- cola automática **Mis errores** con repaso espaciado (I-17; es el antiguo set táctico automático);
- diagnóstico con prioridades sin LLM (I-18), práctica de conversión y defensa desde posiciones
  propias (I-21) y catálogo de fugas con coste y evolución (I-29).

### 8.8. Táctica: modos y sets

**Estado: Pendiente; amplía la Fase 6 y puede adelantarse.** Ideas: I-05, I-06, I-20, I-38.

- modos de sesión (tormenta, racha, contrarreloj, profundidad, candidatas), FSRS y Elo táctico local,
  constructor de sets desde los puzzles de Lichess y visualización a ciegas y sin piezas.

### 8.9. Finales: evaluación por jugada

**Estado: Pendiente; amplía la Fase 6 y puede adelantarse.** Ideas: I-07, I-08, I-09; opcional:
mates básicos cronometrados (parte de I-52).

- tras cada jugada se comprueba si el objetivo sigue siendo alcanzable contra la mejor defensa, con
  aviso, reintento y botón Veredicto; la mejor defensa es el rival predeterminado y Maia una opción;
- al importar, familia y objetivo calculados desde la posición; filtro solo por tema.

### 8.10. Aperturas: repaso continuo y huecos

**Estado: Pendiente; amplía 6.A y puede adelantarse.** Ideas: I-36, I-34.

- modo «Repaso continuo» por dominio de cada jugada, aparte del FSRS (I-36), y huecos del repertorio
  por frecuencia real (I-34).

---

## 7.A. Consolidación del entrenamiento de Aperturas

**Estado: En curso.** Ampliación de la Fase 6 que no estaba planificada: Aperturas era la única
experiencia de entrenamiento que el autor no utilizaba, por su diseño anterior.

### Publicado en 0.17.0

- biblioteca visual de repertorios y navegación jerárquica repertorio → sección → línea;
- tramo nuevo de cada línea resaltado respecto de las anteriores y restauración de scroll y origen;
- importación con agrupación inteligente, por registro o combinada, con vista previa;
- consolidación de secciones fragmentadas conservando progreso;
- exportación flexible y edición explícita (solo PGN, PGN y estructura, o descartar);
- flechas de continuaciones PGN, reintento y jugada esperada sin contar dos veces el error.

Detalle: `docs/release-notes-0.17.0.es.md`.

### Importación editable

**Estado: Implementada y validada automáticamente; validación manual nativa pendiente con un curso
real exportado de Chessable.**

- la vista previa de agrupación es editable antes de importar: mover registros entre secciones
  mediante arrastrar y soltar, reordenar registros y secciones, crear secciones nuevas, renombrar
  secciones y líneas, fusionar secciones y excluir registros con restauración;
- cada sección puede marcarse como teoría entrenable o partidas modelo, aunque la detección
  automática haya elegido otro tipo;
- solo pueden compartir sección registros con la misma posición inicial; la interfaz impide lo
  contrario durante el arrastre;
- la unidad movible es el registro PGN; separar subvariantes internas de un registro queda fuera de
  alcance;
- cambiar la estrategia automática de agrupación reinicia las ediciones;
- la importación reutiliza los árboles analizados durante la inspección en lugar de leer y analizar
  el PGN dos veces.
- la agrupación inteligente reconoce capítulos en `White` cuando se repiten y nunca aparecen como
  `Black` (en una base de partidas los jugadores aparecen en ambos lados), reúne todos los
  capítulos Quickstarter en una sección y todas las partidas modelo en otra;
- los registros que empiezan desde una posición propia (puzzles, ejercicios) se dejan fuera por
  defecto en modo inteligente, con aviso y restauración, porque una sección es un único árbol con una
  sola posición inicial. Convertirlos en un set táctico enlazado queda pendiente.

### Modo Aprender

**Estado: Pasos 1–6 implementados y validados automáticamente; validación manual nativa pendiente.**

Objetivo: permitir conocer una línea antes de practicarla, sin acumular fallos por jugadas que el
estudiante todavía no vio.

1. **Preparación técnica:** dividir `PracticePanel.tsx` por responsabilidades antes de ampliarlo.
2. **Datos:** estado de aprendizaje por línea (nueva / aprendida y fecha), opcional en el esquema y
   con migración compatible: una línea ya completada alguna vez se considera aprendida.
3. **Sesión Aprender:** el tablero muestra la jugada esperada con flecha y los comentarios PGN; el
   estudiante ejecuta la jugada mostrada y el rival responde automáticamente. Desde 0.18.1 cada
   jugada se demuestra antes de repetirla y la sesión se detiene, hasta que el estudiante continúa,
   en posiciones o jugadas con comentarios o flechas PGN y en la posición final. Desde 0.18.4 hay una
   sola pausa por jugada: la jugada del rival y la del estudiante se muestran juntas, cada una con su
   comentario y con clic para ver su posición, y la pausa entre jugadas es configurable. Al terminar, la línea
   se repite sin ayudas; queda aprendida tras N repeticiones seguidas sin errores (2 por defecto,
   configurable de 1 a 5 desde 2026-10-15; antes, 1). Los errores en este modo no alteran
   las estadísticas por jugada.
4. **Aprovechar lo ya aprendido:** el tramo compartido con líneas aprendidas se reproduce
   automáticamente y la enseñanza empieza en la divergencia.
5. **Interfaz:** acción “Aprender” por repertorio, sección o línea con lotes de N líneas nuevas
   (configurable, 5 por defecto), progreso aprendidas/total y estado Nueva/Aprendida por línea. La
   práctica de repertorio o sección usa solo líneas aprendidas; una línea individual siempre puede
   entrenarse y la vista de administración conserva la práctica de todas las líneas entrenables.
6. **Repaso espaciado:** cada línea guarda su propia tarjeta FSRS dentro de los datos de
   entrenamiento, por lo que sobrevive a reorganizaciones de secciones, copias de seguridad y
   exportaciones. Aprender una línea programa el primer repaso; cada práctica completada lo
   reprograma con la calificación manual o automática. La acción “Repasar” por repertorio o sección
   entrena solo las líneas vencidas, empezando por las más atrasadas, y cada línea muestra si su
   repaso está pendiente o cuándo toca. Las líneas aprendidas antes de existir el repaso quedan
   pendientes de inmediato. El deck heredado de práctica por posición se conserva sin cambios.

No se busca copiar Chessable: se toma el flujo aprender → practicar → repasar y se aprovechan
capacidades propias, como el tramo nuevo y las transposiciones.

---

## 8. Fase 9 — Expansión avanzada de fases anteriores

**Estado: Pendiente; posterior a Fase 8.**

### 9.1. Bots humanos y calibración

Ideas: I-47, I-48 (puede adelantarse), I-49, I-50, I-52 (partida guiada).

- retomar la expansión de la Fase 4;
- personalidades de juego reales y medidas: reordenar las candidatas de Maia según el estilo dentro
  de un margen de Stockfish y medir el resultado antes de anunciarlo (I-47);
- bots fuertes con candidatas de Maia verificadas con Stockfish (I-48);
- catálogo de 80–100 bots curados, jugadores generados con semilla fija y explorador de bots (I-49);
- rating local del usuario contra bots y escala calibrada con la liga (I-50);
- partida guiada que avisa en los momentos críticos (I-52);
- ampliar el catálogo solo cuando los perfiles sean distinguibles.

### 9.2. Torneos interactivos

Ideas: I-51. **El usuario es el protagonista**; los torneos solo de bots son experimentos del
Generador.

- formatos round-robin, suizo, eliminación directa y doble, con plantillas (soy favorito, todos de
  mi nivel, todos mejores que yo…) y autorrelleno con filtros;
- calendario local rotativo opcional, generado sin servidor;
- tableros sin el usuario resueltos por modelo o en segundo plano con baja prioridad;
- visualización en vivo, reloj, recuperación, pausa, cancelación, desempates y exportación PGN.

### 9.3. Interpretación estratégica avanzada

Ideas: I-31 (ampliación y entrenamiento por estructura), I-43 (gemelo con estilo medido).

- temas estratégicos y planes en Opening Reports;
- estructuras y rupturas mediante reglas demostrables;
- finales típicos de una apertura con procedencia y cobertura;
- patrones estratégicos con confianza visible;
- revisión humana de ejemplos representativos.

---

## 9. Fase 10 — Consolidación pública, multiplataforma y MLOps

**Estado: Pendiente; mantenimiento urgente relacionado puede adelantarse.**

### Producto público

- migraciones, backup, recuperación y detección de archivos corruptos;
- accesibilidad y documentación de usuario;
- estrategia de sincronización con upstream;
- soporte y smoke tests definidos por plataforma;
- instaladores y actualizador firmado para macOS Intel, macOS Apple Silicon y Linux;
- telemetría únicamente opcional y respetuosa de la privacidad;
- releases reproducibles con hashes, manifiestos y ruta de recuperación.

### Datos, automatización y MLOps

Ideas: I-04 (pipeline completo), I-11, I-16, I-23, I-25, I-27, I-43 (versión 2, Maia
personalizada), I-54 (en CI).

- versionado de modelos, perfiles, binarios, pesos y datasets;
- pipelines de evaluación reproducibles;
- pruebas de calidad de datos y pequeñas corridas en CI;
- comparación de experimentos y artefactos exportables;
- model cards, dataset cards, ADRs, benchmarks y caso de estudio reproducible;
- catálogo propio de descargas (I-25): un JSON en el repositorio que **conserva todas las entradas
  de En Croissant** (bases y motores) y añade entradas propias, como LumbrasGigaBase OTB y Online
  por separado; opcionalmente alojadas por el autor. Es independiente del resto de fases y puede
  ir de las últimas;
- pipeline de bases con procedencia, deduplicación y versiones (I-04), clasificación automática de
  ejercicios (I-11), rendimiento estimado calibrado (I-16), objetivos medidos en partidas reales
  (I-23), índice de árbol de aperturas precalculado si las mediciones lo justifican (I-27), gemelo
  con Maia ajustada al jugador (I-43 v2) y presupuesto de rendimiento integrado en CI (I-54).

### Aplazadas, sin fase

I-10 (fichas de técnica verificadas), I-12 (servicio web de coste cero), I-35 (búsqueda en lenguaje
natural) e I-39 (fuentes libres de finales).

No se añadirá un modelo decorativo. Un entrenamiento nuevo solo se justifica por una pregunta que los
modelos existentes no puedan responder y por datos con procedencia y licencia utilizables.

---

## 10. Decisiones vigentes

### Producto y arquitectura

- Onyx es local-first; los servicios remotos complementan, no sustituyen, los datos locales.
- Las funcionalidades nuevas deben mantener privacidad, procedencia, exportación y borrado.
- Se evitarán nuevos componentes o módulos gigantes. Como guía flexible y reciente, un archivo que
  supere unas 1.000 líneas se divide por responsabilidades cuando vaya a recibir cambios
  sustanciales, sin fragmentarlo artificialmente ni dividir archivos estables solo por su tamaño.
- Las ediciones distribuibles comparten código y commit; no se mantienen ramas de producto largas.
- Los bugs de usuarios se priorizan por impacto y no alteran automáticamente el orden de fases.

### Evidencia y lenguaje

- ELO, estilos, planes, motivos y causalidad no se afirman sin evidencia proporcional.
- Maia representa comportamiento/fuerza solicitada; Stockfish u otro motor objetivo se mantiene
  separado.
- Muestra, filtros, fuente, cobertura y limitaciones acompañan toda conclusión analítica.
- Las desviaciones se definen respecto a una fuente concreta, no como novedades históricas absolutas.

### Bases e informes

- Las consultas locales conservan `latest request wins`, caché acotada, progreso y cancelación.
- Los informes locales pueden agregar todas las coincidencias, pero teoría y respuestas visibles
  permanecen acotadas y documentadas.
- Los informes remotos tienen contrato y diseño propios; no imitan secciones sin datos.
- Lichess remoto requiere inicio de sesión y respeta una sola solicitud simultánea.
- No se construye una copia local masiva del corpus de Lichess.

### Persistencia

- Informes y versiones de perfiles comienzan como JSON versionado en datos privados de Onyx.
- El historial durable de perfiles se crea solo mediante **Guardar versión**.
- SQLite se adopta únicamente si volumen, búsqueda o transacciones demuestran su necesidad.
- PGN fuente permanece inmutable; las copias editables conservan backup y procedencia.

### Entrenamiento y jugadores

- Táctica, Aperturas y Finales conservan experiencias y progreso independientes.
- Los alias se seleccionan manualmente; no se infieren identidades reales.
- Las métricas de reloj declaran cobertura y no ocultan partidas sin `[%clk]`.
- El set táctico automático pasa a 8.7 como cola **Mis errores** con repaso espaciado (I-17).
- Finales: la mejor defensa es el rival predeterminado; Maia queda como opción práctica (I-07).
- No se incluyen libros de finales en Onyx; se prioriza la importación del usuario (I-08).
- Los torneos se diseñan con el usuario como participante (I-51).

### Distribución y licencias

- El código continúa bajo GPLv3 y conserva atribución a En Croissant.
- Recursos, modelos y contenido requieren procedencia y licencia revisadas antes de redistribuirse.
- El canal Windows x64 utiliza artefactos y firma propios de Onyx.
- macOS y Linux no se presentan como soportados hasta completar la Fase 10.
- Las bases convertidas que Onyx ofrezca alojadas respetan la licencia de su fuente (atribución,
  uso no comercial e indicación de cambios para LumbrasGigaBase, CC BY-NC 4.0).

---

## 11. Preguntas abiertas reales

- ¿Funcionan las vistas previas de Linux y macOS en equipos reales? Las pruebas de amigos con Mac y
  la prueba propia en Linux decidirán si pasan a plataformas validadas y si conviene pagar la cuenta
  de desarrollador de Apple para firmar y notarizar.
- ¿Qué tamaño de lote por defecto y qué criterio de “aprendida” resultan cómodos en el modo
  Aprender? Se ajustarán con el uso real.
- ¿Qué ventanas y tamaños de muestra se usarán para comparaciones temporales?
- ¿Qué estrategia de migración conservará los datos existentes al sustituir el bundle identifier
  heredado y los metadatos de publisher?
- ¿Qué pregunta medible se convertirá en el caso de estudio reproducible de MLOps?
- ¿Qué plantillas y formatos de torneo aportan más valor en 9.2 antes de investigar funciones online?
- En Fase 10: ¿se alojan las bases convertidas (Hugging Face Datasets recomendado) o el catálogo
  propio solo enlaza la página oficial de LumbrasGigaBase? Antes, escribir al autor de Lumbras.
- ¿Se adopta SQLite para la caché de evaluaciones y la cola de errores, con archivos y conexiones
  propios que nunca compartan las bases de partidas?
- ¿Qué reglas o fuentes permitirán hablar honestamente de planes estratégicos y finales típicos?

Cada pregunta debe resolverse dentro de su fase y convertirse en una decisión documentada. Las
preguntas contestadas se eliminan de esta lista; su respuesta permanece en la sección de decisiones o
en la documentación de la fase.

---

## 12. Registro operativo breve

### 2026-10-15 — 8.4 Jugadores: ficha y estadísticas

- Nueva sección «Jugadores» con la ficha de cualquier jugador (cuentas, rivales, alumnos y
  resultados de búsqueda en todas las bases locales); «Cuentas» solo conecta cuentas y enlaza a la
  ficha propia. Bases de datos → Jugadores muestra la misma ficha.
- Ficha con Resumen (cifras, evolución del rating, actividad, momentos destacados y hábitos),
  Partidas, Aperturas por familias, Rivales y Análisis (Player Analysis, dividido en componentes).
- Rating par en todas las tablas de resultados. Vinculación FIDE manual por consulta puntual.
- «Jugada más cara» pasa a llamarse **error más costoso**: la jugada que más puntos de probabilidad
  de ganar perdió en las partidas analizadas.
- La base no guarda cómo terminó una partida: las derrotas por tiempo se leen como «probables»
  desde el tablero y el último reloj, y así se dice en la interfaz.
- Detalle: `docs/players-phase-8-4.es.md`.

### 2026-10-15 — Release 0.20.0

- Publica el mantenimiento del estudio de mercado (búsqueda de jugadores, informe de calidad,
  repeticiones de memoria, jerarquía de aperturas), 8.2 (caché, presupuesto de motores, segunda
  pasada, nube de Lichess opcional, momentos clave, explicaciones y flechas) y 8.3 (catálogo propio
  que conserva el de En Croissant, revisión completa de calidad, rendimiento frente a lo esperado y
  restablecer enlaces).
- El reporte pasa a 250 ms por jugada con segunda pasada por defecto: encontró tantos errores como
  500 ms sin ella en la mitad de tiempo frente a una referencia de 2 s.
- Validado manualmente por el autor antes de publicar.
- Detalle: `docs/release-notes-0.20.0.es.md`.

### 2026-10-15 — Correcciones tras la validación manual de 8.2 y 8.3

- Guardar una partida en una base borraba su índice de posiciones aunque solo cambiaran los
  comentarios, y en la Gigabase eso obligaba a reconstruir 1,8 GB en la siguiente búsqueda (la
  «carga infinita» observada). Ahora el índice se conserva si no cambian jugadores, fecha,
  resultado, ratings, posición inicial ni línea principal, y el sello de la base se reescribe en el
  propio índice (también al editar título o descripción, que antes tampoco lo conservaba). Cuando sí
  hay que reconstruirlo, el panel lo dice con el número de partidas procesadas.
- La búsqueda de jugadores al filtrar partidas por color aplicaba además el filtro de texto del
  propio campo, que ocultaba «Cabezas Solano, David» al escribir «David Cabezas».
- Las aperturas del análisis de jugador salían como «Unknown opening»: los metadatos no leían las
  jugadas. Ahora se nombran desde las jugadas codificadas (sin convertirlas a PGN) y el nombre de
  apertura se busca en un índice en vez de recorrer ~3.500 aperturas por jugada.
- El informe de posición sobresalía por la derecha y tapaba el botón de cerrar.

### 2026-10-15 — 8.3 y primera versión de 8.2

- 8.3: catálogo propio incluido en la aplicación que conserva todas las descargas de En Croissant y
  sigue combinando su catálogo en vivo; informe de calidad completo en segundo plano (53 s en 10,3 M
  de partidas); rendimiento frente a lo esperado por Elo y tendencia por jugada en el informe de
  posición (versión 5 del informe).
- 8.2: presupuesto de motores para lotes, caché persistente de evaluaciones, límite de profundidad
  con tope, Player Analysis en paralelo y clasificado por probabilidad de victoria, momentos clave
  en el reporte y explicaciones y flechas en «Aprende de tus errores».
- 8.2, segunda entrega: segunda pasada dirigida (activada por defecto en el reporte tras medirla
  contra una referencia de 2 s), apertura opcional desde la nube de Lichess, bots dentro del
  presupuesto de motores y medición del arranque y de la ficha de jugador.
- Análisis del jugador → Aperturas agrupa por familia, variante y subvariante, con partidas,
  puntuación, V-T-D y Elo del rival exactos en cada nivel.
- Benchmark reproducible con 8 partidas propias: ningún predeterminado cambia sin superar el ruido
  medido entre dos ejecuciones iguales. Detalle: `docs/engine-analysis-phase-8-2.es.md`.

### 2026-10-15 — Fases replanificadas desde el estudio de mercado

- El autor pasa al roadmap las fases del estudio de mercado (`docs/market-study.es.md`): Fase 9 =
  expansión avanzada y Fase 10 = consolidación pública y MLOps, la última; la tabla de estado se
  corrige.
- La antigua 8.2 se reparte en 8.4 (ficha y estadísticas) y 8.6 (preparación contra rivales); se
  añaden 8.2 Motor y análisis, 8.3 Bases de referencia (en paralelo), 8.5 Generador de repertorios,
  8.7 Entrenamiento desde errores y 8.8–8.10 (Táctica, Finales y Aperturas, independientes).
- 8.3 incluye restablecer enlaces `onyx://game` rotos eligiendo entre las partidas de la posición.
- El catálogo propio y las bases alojadas (I-25) pasan a la Fase 10: la prioridad actual es la
  utilidad para entrenar y el portafolio se trabajará en 2027. El catálogo de En Croissant se
  conserva; 8.6 toma las partidas del rival de su cuenta de Lichess o Chess.com, de un PGN o de una
  base local, sin depender de una base de referencia.
- Mantenimiento del estudio implementado: búsqueda de jugadores por tokens normalizados, informe de
  calidad mínimo, dos repeticiones de memoria por defecto en Aprender y jerarquía de aperturas en la
  ficha de jugador.

### 2026-09-15 — Reestructuración del roadmap

- Se registra que Onyx Chess Lab ya es un repositorio público con releases accesibles y pruebas de
  usuarios cercanos desde 0.15.3.
- Las Fases 6, 7.0, 7.1 y 7.2 se declaran cerradas y validadas manualmente.
- La Fase 4 permanece cerrada y sus ampliaciones pasan a la Fase 10.
- Se adopta el orden `7.3 → 8 → 9 → 10`, interrumpible solo por mantenimiento urgente.
- 7.3 se divide en cuatro entregas y adopta informes remotos compactos para Lichess todo y Masters.
- Temas estratégicos, planes, finales típicos y set táctico automático pasan a Fase 10.
- Informes y versiones usarán JSON privado versionado; el historial se crea mediante acción explícita.
- La lista histórica acumulativa se archiva en `docs/roadmap-history.es.md`.

### 2026-09-16 — Implementación de la Fase 7.3

- Se completa la implementación de 7.3.1–7.3.4 y queda pendiente la validación manual nativa antes
  de cerrar formalmente la fase.
- La desviación local se define sobre el cohorte filtrado y acotado del informe, usando como corte la
  fecha de cada partida modelo y sin afirmar novedad histórica.
- El catálogo táctico inicial se limita a pieza movida inmediatamente perdida, captura directa
  omitida y promoción omitida; los demás casos permanecen sin clasificar.
- Los finales y posiciones dispersas de diez piezas o menos se agrupan por material; la consulta de
  tablebase estándar se habilita bajo demanda solo con siete piezas o menos.
- La comparación con entrenamiento enlaza posiciones exactas añadidas manualmente y se presenta
  únicamente como observación descriptiva.

### 2026-09-19 — Endurecimiento de seguridad y calidad

- La Fase 8.2 se reserva para la próxima versión; esta entrega no amplía su alcance funcional.
- Los comentarios PGN dejan de interpretar HTML crudo y la aplicación adopta una CSP explícita.
- Los tokens persistentes de Lichess se migran en Windows a almacenamiento cifrado con DPAPI sin
  eliminar la compatibilidad si el almacén seguro no está disponible.
- OAuth utiliza CSRF y PKCE nuevos por intento, un listener ya reservado, expiración y cierre tras
  un único callback válido.
- Las descargas exigen transporte seguro, aíslan el token de Lichess y limitan redirecciones, tamaño
  y extracción de archivos.
- CI incorpora formato, Clippy y pruebas Rust en Windows; las acciones externas quedan fijadas por
  hash de commit.
- Detalle y validación manual: `docs/security-hardening.es.md`.

### 2026-09-21 — Correcciones de autenticación y turno táctico

- La sesión OAuth de Lichess conserva el token necesario para el explorador aunque la copia cifrada
  con DPAPI no esté disponible o falle; el almacenamiento seguro pasa a ser complementario y nunca
  bloquea el uso de la base remota.
- Los sets tácticos configurados para que empiece el rival solicitan exactamente una jugada inicial.
  Se impiden ejecuciones automáticas simultáneas para que el segundo movimiento corresponda siempre
  al estudiante.

### 2026-09-25 — Release 0.17.0

- Se publica el rediseño del módulo de aperturas, no previsto en el roadmap, como ampliación 6.A de
  la Fase 6.
- Se incorporan los ajustes transversales previos a 8.2: flechas de variantes y **Ver la solución**
  en táctica.

### 2026-09-26 — Prioridades orientadas a usuarios y consolidación de Aperturas

- El roadmap se declara lista detallada de tareas con orden orientativo; las necesidades de usuarios
  reales, incluidas sus plataformas, pueden adelantar tareas de fases posteriores.
- Se implementa la importación editable de repertorios con arrastrar y soltar y se elimina la doble
  lectura y análisis del PGN al importar.
- Se implementa el modo Aprender: división de `PracticePanel` en componentes, estado de aprendizaje
  por línea compatible con el progreso existente, sesión guiada con flecha y comentarios seguida de
  repetición de memoria, reutilización del tramo ya aprendido e interfaz en el explorador.
- Se implementa el repaso espaciado por línea completa con FSRS y la acción “Repasar”.
- Los errores y nombres generados de aperturas, estudios, táctica, finales e importación pasan a
  i18n.
- La regla de 1.000 líneas se aclara como guía flexible aplicada al modificar archivos grandes.

### 2026-09-27 — Preparación de 0.18.0 y vistas previas multiplataforma

- La release 0.18.0 agrupa el modo Aprender, el repaso espaciado, la importación editable y las
  correcciones de práctica (las flechas del PGN ya no se borran al hacer clic durante la práctica).
- El workflow de release añade Linux x64 y macOS (Apple Silicon e Intel) como vista previa sin
  probar; Windows x64 sigue siendo el canal validado y la auditoría de actualización exige que siga
  presente.
- El README documenta las advertencias y cómo abrir la aplicación sin firma en macOS.

### 2026-09-28 — Release 0.18.1

- La sesión guiada del modo Aprender demuestra cada jugada del estudiante antes de que la repita y se
  detiene en jugadas o posiciones con comentarios o flechas PGN, que antes pasaban sin verse.
- La posición final de la parte guiada y la de una línea aprendida permanecen en el tablero hasta que
  el estudiante continúa; ya no hay avance automático.
- Detalle: `docs/release-notes-0.18.1.es.md`.

### 2026-09-29 — Persistencia del entrenamiento en archivo

- Importar un curso grande de Chessable excedía la cuota de `localStorage` (~5 MB), donde vivía todo
  el entrenamiento; el error aparecía detrás del modal y el progreso posterior de la sesión dejaba de
  guardarse.
- `training-areas-v1` pasa a un JSON en los datos privados de Onyx: se carga antes de mostrar la
  aplicación, se escribe de forma atómica y agrupada, se guarda antes de cerrar la ventana o instalar
  una actualización, y se migra una sola vez desde `localStorage` conservando una copia de respaldo.
  Si el archivo existe pero no se puede leer, no se sobrescribe.
- La importación muestra sus errores dentro del modal y elimina la copia editable si falla.
- Con el curso de prueba (1.129 registros) la vista previa pasa de 208 a 45 secciones; 171 puzzles
  quedan fuera y restaurables. Validado manualmente por el autor con el curso real.

### 2026-10-14 — Release 0.19.1

- Correcciones del tablero tras aparecer las barras de jugador: el ajuste de tamaño observa ahora
  las filas de la columna (el tablero ya no queda cortado) y la posición en pantalla de
  Chessground se recalcula en cada clic (los clics ya no caen una fila más abajo).
- “Aprende de tus errores” tras el reporte: ejercicios desde la posición previa a cada ? y ?? del
  bando elegido; un intento se acepta si pierde como mucho 3 puntos de probabilidad de victoria
  frente a la mejor jugada (Stockfish, profundidad 16–18). El motor en vivo se apaga y la notación
  se oculta durante el repaso; la partida no se modifica.
- Partidas de referencia: paginación compacta en la cabecera, selección múltiple (Ctrl, Mayús) y
  menú contextual (abrir, estudio, enlace, PGN).
- Enlaces a partidas en comentarios como links Markdown con esquema propio
  `onyx://game?db=<archivo>&id=<id>&ply=<n>`; se resuelven contra la carpeta de bases de datos.
- Bots humanos con tiempos de reflexión de 2,8 a 6 s de media (antes 1,2 a 2,5 s); catálogo 4.5.0.
  Reloj rojo y aviso sonoro con poco tiempo; sonido, aviso breve y rey mateado marcado al terminar.
- Sonidos de acierto en entrenamiento generados con Web Audio, sin archivos nuevos.
- Último estudio usado como destino predeterminado; los comandos de limpieza de bases devuelven el
  número de partidas eliminadas.
- Detalle: `docs/release-notes-0.19.1.es.md`.

### 2026-10-11 — Release 0.19.0

- Reestructuración de la interfaz por fases, cada una probada por el autor antes de seguir:
  columna derecha con dos zonas (notación y herramientas) plegables, maximizables,
  intercambiables y con distribución propia por tipo de pantalla.
- Motor en una franja bajo el tablero (o en la subpestaña Motores, que la oculta); el tablero se
  dimensiona midiendo el espacio real y las barras de jugador vacías ya no ocupan alto. Se retiran
  la lista de motores del panel, el motor fijado sobre la notación y la pestaña Anotar.
- Barra de anotación bajo la notación y cabecera de notación única; base de datos en secciones
  apiladas (Referencia y Partidas) con filtros plegables y vista previa de partidas.
- Informe de aperturas versión 4: el backend guarda el desglose jugada × año × rango de ELO (hasta
  40 jugadas, celdas dispersas) y los años activos de cada jugador; la vista filtra por ELO y
  período sin nueva consulta y solo dibuja tendencias con muestra suficiente (100 partidas con
  fecha, 6 años, 30 partidas por ventana). Los informes anteriores siguen abriéndose sin filtros.
- Táctica en modo enfoque con insignia animada de acierto o error; pestaña Capítulos/Partidas;
  importación de PGN en Archivos con acciones directas y avisos de uso existente.
- Ideas aplazadas: paleta Ctrl+K, columna de tendencia, portada de bases, barra lateral por
  grupos y sección Preparación.
- Detalle: `docs/release-notes-0.19.0.es.md`.

### 2026-10-07 — Release 0.18.5

- Uso intensivo del autor: los sets tácticos reciben el timer por ejercicio y la pista del modo de
  puzzles de Lichess; los timers de Woodpecker se muestran como recuadros con pausa que se reanuda
  al jugar o cambiar de ejercicio.
- Búsqueda por estructura de peones exacta (`pawns`) en la base local, con poda por peones en su
  casilla inicial y caché compartida entre posiciones con la misma estructura.
- Generador: abre en la posición elegida, recuerda el experimento y la selección por pestaña, y
  guarda partidas seleccionadas en estudios, repertorios (partidas modelo) o PGN.
- Reportes que no terminaban o salían vacíos: el resultado se aplicaba al estado de una pestaña ya
  desmontada; las novedades hacían una búsqueda completa por posición (minutos en Gigabase y con
  los permisos de búsqueda ocupados); cancelar no detenía esa fase. Ahora una sola pasada, contra
  partidas anteriores a la fecha (o sin los mismos jugadores), cedida ante búsquedas interactivas,
  con vigía de motor colgado en modo tiempo.
- `busy_timeout` antes del pragma de diario en cada conexión; estado de pestaña creado una sola vez;
  comandos de puzzles asíncronos y sin `expect`.
- Pendiente de decidir si vuelve “database is locked”: modo WAL.
- Detalle: `docs/release-notes-0.18.5.es.md`.

### 2026-10-04 — Release 0.18.4

- Feedback de un usuario externo: el modo Aprender pausaba dos veces por jugada anotada (posición y
  jugada demostrada). Ahora pausa una sola vez y muestra juntas la jugada del rival y la del
  estudiante, como Chessable; la pausa entre jugadas es configurable y Enter o Espacio continúan.
- Al terminar de aprender o de entrenar la última línea de una sesión se ofrece la siguiente línea
  del repertorio, para aprender o entrenar según su estado.
- Guardar una posición en un set táctico permite elegir la jugada de inicio y la última jugada de la
  solución; las variantes se recortan a la misma profundidad.
- Atajos Shift+1…0 para valoraciones de posición (por tecla física) y T para la amenaza del rival.
  PageUp/PageDown siguen cambiando de partida; X/C cambian de variante.
- Las cancelaciones del explorador de Lichess (`Request cancelled` del plugin HTTP de Tauri) ya no se
  muestran como fallos. Los catálogos de descargas de encroissant.org se piden con User-Agent, sin
  redirecciones, con reintentos y con la última copia recibida como respaldo.
- Detalle: `docs/release-notes-0.18.4.es.md`.

### 2026-09-30 — Release 0.18.3

- La fusión de registros de una misma sección deja de copiar el árbol acumulado en cada paso: con
  175 partidas sintéticas de 80 medias jugadas pasa de 61,6 s a menos de 6,6 s.
- La administración de repertorios monta el contenido solo al desplegar un repertorio y, por encima
  de 150 líneas, pliega las líneas de cada sección.
- El modo Aprender espera un segundo tras la respuesta del rival antes de demostrar la jugada del
  estudiante; los botones de las tarjetas de sección se distribuyen en dos columnas.
- Las instalaciones nuevas usan `Documentos\Onyx Chess Lab`; las existentes conservan
  `Documentos\EnCroissant`. El traslado de carpetas existentes queda para la migración de identidad
  de la Fase 9.
- Detalle: `docs/release-notes-0.18.3.es.md`.

### 2026-09-29 — Release 0.18.2

- Una instalación nueva detecta el idioma del sistema (español o, en cualquier otro caso, inglés) y
  pregunta el idioma en la primera apertura hasta que el usuario lo confirma. Las instalaciones
  existentes conservan su idioma sin ver la pregunta.
- Los idiomas distintos de español e inglés permanecen como traducciones parciales disponibles solo
  desde Configuración, que ahora muestra cada idioma con su propio nombre.
- Detalle: `docs/release-notes-0.18.2.es.md`.
