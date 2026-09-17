# Onyx Chess Lab — Estado y roadmap

> Documento operativo y fuente vigente de verdad del proyecto.
>
> Última actualización: 2026-09-16.

## 1. Cómo utilizar este documento

Este archivo debe permitir que una conversación nueva comprenda rápidamente qué es Onyx Chess Lab,
qué está cerrado, cuál es la fase activa y qué decisiones siguen vigentes.

Antes de planificar o implementar una funcionalidad relevante se debe leer:

1. este documento completo;
2. la documentación específica enlazada desde la fase activa;
3. el código actual relacionado con la tarea.

El roadmap expresa intención y orden, pero no autoriza automáticamente a implementar fases futuras.
Solo se trabaja en la funcionalidad solicitada por el usuario.

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
- Versión actual del repositorio: **0.15.5**.
- Canal disponible y validado: **Windows x64 mediante GitHub Releases**.
- Actualizador: canal propio y firmado de Onyx operativo.
- Estado de producto: **alpha/beta pública temprana con mantenimiento continuo basado en uso real**.
- Fase activa: **7.3 — Mejoras de inteligencia de aperturas y jugadores**, con implementación
  terminada y validación manual nativa pendiente.

La existencia de usuarios reales aumenta la prioridad de compatibilidad de datos, recuperación,
actualizaciones seguras y corrección rápida de defectos. Un bug no reabre automáticamente la fase que
originó una función: se registra como mantenimiento P0–P3 y puede interrumpir el orden del roadmap si
su gravedad lo justifica.

### Mantenimiento conocido no bloqueante para 7.3

- repetir de forma explícita las pruebas del actualizador con red caída y artefacto alterado, porque
  no existe certeza suficiente sobre la profundidad de las pruebas anteriores;
- confirmar mediante uso independiente una instalación administrada limpia de Maia 3 en Windows sin
  Python ni Git preinstalados; el flujo se considera disponible, pero todavía no se presenta como
  validado externamente;
- decidir en Fase 9 cómo migrar de forma segura el identificador heredado `org.encroissant.app` y el
  campo de publisher sin ocultar ni perder datos de instalaciones existentes; no deben cambiarse de
  manera aislada;
- terminar la limpieza pública de `CONTRIBUTING.md`, plantillas de issues y otros textos heredados de
  En Croissant;
- atender con prioridad cualquier regresión de instalación, actualización, migración o pérdida de
  datos comunicada por usuarios;
- conservar documentación de release, licencias y recuperación junto con cada versión pública.

---

## 4. Estado de las fases

| Fase | Estado vigente | Resultado o continuación |
| --- | --- | --- |
| 0 — Base de bots humanos | Cerrada y validada | Bots humanos, mediciones e historial operativo. |
| 1 — Motores e infraestructura experimental | Cerrada y validada | Auditoría UCI, presets y manifiestos reproducibles. |
| 2 — Model Game Generator | Cerrada y validada | Generación individual, lotes y experimentos persistentes. |
| 3 — Experiment Analysis | Cerrada para su alcance | Análisis dual, análisis de partidas y benchmark W/D/L exploratorio. |
| 4 — Beta de bots y torneos | Cerrada | Sus ampliaciones avanzadas se concentran en Fase 10. |
| 5 — Identidad y distribución inicial | Cerrada como lanzamiento público inicial | Marca, repositorio, release Windows y actualizador propios; endurecimiento residual pasa a mantenimiento/Fase 9. |
| 6 — Táctica, Aperturas y Finales | Cerrada y validada manualmente | Tres experiencias especializadas con persistencia, práctica y estadísticas. |
| 7.0 — Base escalable de consultas | Cerrada y validada manualmente | Snapshots, paginación, PGN bajo demanda, cancelación, caché y benchmark real. |
| 7.1 — Opening Reports | Cerrada y validada manualmente | Informe local por posición, teoría, transposiciones, jugadores y exportación. |
| 7.2 — Player Analysis | Cerrada y validada manualmente | Perfil local, motor, evidencia y posiciones entrenables. |
| 7.3 — Inteligencia de aperturas y jugadores | Implementada | 7.3.1–7.3.4 terminadas y validadas automáticamente; falta validación manual nativa para cerrarla. |
| 8 — Serious Preparation Tools | Pendiente | Biblioteca de estudios y preparación individual/equipo. |
| 9 — Consolidación pública y MLOps | Pendiente | Producto, multiplataforma, datos, automatización y evidencia reproducible. |
| 10 — Expansión avanzada | Pendiente | Amplía fases cerradas, especialmente bots, torneos e interpretación estratégica. |

### Documentación de fases cerradas

- Motores y bots: `docs/engine-audit-phase-1-1.es.md`,
  `docs/engine-presets-and-manifests.es.md` y `docs/human-bots-phase-*.es.md`.
- Generación y experimentación: `docs/model-game-generator-phase-*.es.md` y
  `docs/experiment-analysis-phase-*.es.md`.
- Entrenamiento: `docs/training-phase-6-*.es.md`.
- Bases e informes: `docs/database-queries-phase-7-0.es.md` y
  `docs/opening-reports-phase-7-1.es.md`.
- Player Analysis: `docs/player-analysis-phase-7-2.es.md`.
- Release y actualizador: `docs/phase-5-brand-release-alpha-plan.es.md`,
  `docs/updater-phase-5-2.es.md` y `docs/managed-maia3.es.md`.

---

## 5. Orden vigente de desarrollo

```text
Producto público + mantenimiento continuo
        ↓
7.3 — Inteligencia de aperturas y jugadores
        ↓
8 — Serious Preparation Tools
        ↓
9 — Consolidación pública, multiplataforma y MLOps
        ↓
10 — Expansión avanzada de fases anteriores
```

Este es el orden normal. Solo defectos críticos, riesgos de datos, seguridad de actualización o
mantenimiento urgente pueden interrumpirlo. El trabajo correctivo se registra como mantenimiento y
no altera por sí solo el estado de una fase cerrada.

---

## 6. Fase 7.3 — Mejoras de inteligencia de aperturas y jugadores

**Estado: Implementación terminada; pendiente de validación manual nativa.**

Progreso vigente:

- **7.3.1:** implementada y validada automáticamente; queda validación manual en la aplicación
  nativa.
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

**Estado: Implementada; pendiente de validación manual nativa.**

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

**Estado: Implementada; pendiente de validación manual nativa.**

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

**Estado: Implementada; pendiente de validación manual nativa.**

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

**Estado: Implementada; pendiente de validación manual nativa.**

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

**Estado: Pendiente; siguiente después de 7.3.**

### 8.0. Biblioteca personal de estudios

Crear una biblioteca local de estudios o carpetas que agrupe partidas y análisis propios, incluidos
los realizados contra bots. Debe permitir crear, renombrar, ordenar, editar, exportar, respaldar y
recuperar partidas PGN.

### 8.1. Acciones de posición desde el tablero

- buscar la posición actual en repertorios locales;
- explicar coincidencias exactas y transposiciones;
- añadir una posición a un set táctico mediante solución comprobable;
- añadirla a un set de finales con objetivo y color explícitos;
- reutilizar formatos de Entrenamiento en lugar de crear colecciones paralelas.

### 8.2. Preparación individual y de equipo

- preparación de rival y repertorio probable por color;
- desviaciones recientes, posiciones críticas y partidas modelo;
- líneas específicas de preparación;
- paquetes locales exportables antes de cuentas, nube o colaboración en tiempo real.

---

## 8. Fase 9 — Consolidación pública, multiplataforma y MLOps

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

- versionado de modelos, perfiles, binarios, pesos y datasets;
- pipelines de evaluación reproducibles;
- pruebas de calidad de datos y pequeñas corridas en CI;
- comparación de experimentos y artefactos exportables;
- model cards, dataset cards, ADRs, benchmarks y caso de estudio reproducible.

No se añadirá un modelo decorativo. Un entrenamiento nuevo solo se justifica por una pregunta que los
modelos existentes no puedan responder y por datos con procedencia y licencia utilizables.

---

## 9. Fase 10 — Expansión avanzada de fases anteriores

**Estado: Pendiente; posterior a Fase 9.**

### 10.1. Bots humanos y calibración

- retomar la expansión de la Fase 4;
- calibrar fuerza relativa y diferencias de estilo con muestras reproducibles;
- ampliar progresivamente el catálogo solo cuando los perfiles sean distinguibles;
- evolucionar repertorios, muestreo, timing y selección mediante evidencia.

### 10.2. Torneos interactivos

- formatos configurables y participación del usuario;
- visualización en vivo, reloj, progreso y logs;
- recuperación, pausa, cancelación y navegación de rondas;
- separar la experiencia de torneos del Generador cuando el flujo esté validado.

### 10.3. Interpretación estratégica avanzada

- temas estratégicos y planes en Opening Reports;
- estructuras y rupturas mediante reglas demostrables;
- finales típicos de una apertura con procedencia y cobertura;
- patrones estratégicos con confianza visible;
- revisión humana de ejemplos representativos.

### 10.4. Automatización opcional de entrenamiento

- crear o actualizar automáticamente un set de errores tácticos solo mediante una opción explícita;
- permitir revisar candidatas antes de incorporarlas;
- conservar procedencia, deduplicación y posibilidad de desactivar o borrar la automatización;
- no modificar sets enlazados a PGN ni contenido incluido.

---

## 10. Decisiones vigentes

### Producto y arquitectura

- Onyx es local-first; los servicios remotos complementan, no sustituyen, los datos locales.
- Las funcionalidades nuevas deben mantener privacidad, procedencia, exportación y borrado.
- Se evitarán nuevos componentes o módulos gigantes. Como regla práctica, un archivo que se acerque
  a 1.000 líneas debe revisarse y dividirse por responsabilidades antes de seguir creciendo, sin
  fragmentarlo artificialmente.
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
- El set táctico automático queda fuera de 7.3 y pasa como opción futura a 10.4.

### Distribución y licencias

- El código continúa bajo GPLv3 y conserva atribución a En Croissant.
- Recursos, modelos y contenido requieren procedencia y licencia revisadas antes de redistribuirse.
- El canal Windows x64 utiliza artefactos y firma propios de Onyx.
- macOS y Linux no se presentan como soportados hasta completar Fase 9.

---

## 11. Preguntas abiertas reales

Estas preguntas pertenecen a fases futuras y no bloquean el inicio de 7.3:

- ¿Qué ventanas y tamaños de muestra se usarán para comparaciones temporales?
- ¿Qué plataformas se soportarán oficialmente durante Fase 9 y en qué orden?
- ¿Qué estrategia de migración conservará los datos existentes al sustituir el bundle identifier
  heredado y los metadatos de publisher?
- ¿Qué pregunta medible se convertirá en el caso de estudio reproducible de MLOps?
- ¿Qué formatos de torneo aportan más valor en Fase 10 antes de investigar funciones online?
- ¿Qué reglas o fuentes permitirán hablar honestamente de planes estratégicos y finales típicos?

Cada pregunta debe resolverse dentro de su fase y convertirse en una decisión documentada. Las
preguntas contestadas se eliminan de esta lista; su respuesta permanece en la sección de decisiones o
en la documentación de la fase.

---

## 12. Registro operativo breve

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
