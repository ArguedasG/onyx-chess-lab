# Chess Lab — Contexto, estado y roadmap

> Documento vivo y fuente de verdad del proyecto.
>
> Última actualización: 2026-09-07.

## Cómo utilizar este documento

Este archivo existe para que una nueva conversación pueda entender el proyecto sin reconstruir todo su contexto. Antes de planificar o implementar una funcionalidad relevante se debe leer:

1. `AGENTS.md`;
2. este documento completo;
3. la documentación específica enlazada desde la fase correspondiente;
4. el código actual relacionado con la tarea.

El roadmap expresa intención y orden recomendado, pero **no autoriza automáticamente** a implementar todas las fases. Se trabaja únicamente en la funcionalidad que el usuario haya solicitado.

Al terminar un hito se debe actualizar, como mínimo:

- **Estado actual**;
- la casilla y estado de la fase correspondiente;
- **Próximo paso recomendado**;
- decisiones o limitaciones nuevas que afecten trabajo futuro.

No se debe marcar una fase como validada únicamente porque compila. Conviene distinguir:

- **Pendiente**: todavía no implementada;
- **En progreso**: existe trabajo activo;
- **Implementada**: el código está terminado y tiene validación automatizada proporcional;
- **Validada**: además fue probada manualmente en el flujo real;
- **Diferida**: sigue siendo deseada, pero no es prioritaria actualmente.

---

## 1. Identidad del proyecto

Chess Lab es un fork experimental de [En Croissant](https://github.com/franciscoBSalgueiro/en-croissant), distribuido bajo GPLv3. Su objetivo es evolucionar desde una aplicación de ajedrez general hacia una plataforma seria de:

- entrenamiento;
- experimentación reproducible;
- simulación de comportamiento humano;
- análisis estadístico;
- análisis de jugadores y bases de datos;
- preparación individual y de equipos.

El nombre **Chess Lab** es provisional hasta confirmar la identidad final, disponibilidad del nombre, iconografía y estrategia de distribución.

### Visión resumida

> Construir una plataforma experimental de entrenamiento de ajedrez que utilice simulación de comportamiento humano, análisis estadístico y modelos de jugador para medir la dificultad práctica de posiciones y generar entrenamiento personalizado.

### Propósitos

#### Social

- Ofrecer una herramienta útil y gratuita al equipo de ajedrez del TEC.
- Ayudar en entrenamiento, preparación de rivales y trabajo en equipo.
- Si existe adopción suficiente, compartirla con comunidades y jugadores de Costa Rica.

#### Personal

- Reunir en una sola aplicación las herramientas que el autor necesita para mejorar en ajedrez.
- Facilitar experimentos, preparación, análisis y entrenamiento personalizado.

#### Profesional y portafolio

Presentar un proyecto real de:

- AI/ML aplicado;
- ingeniería y análisis de datos;
- MLOps y experimentación reproducible;
- producto de escritorio;
- desarrollo open source sobre un fork existente.

El valor profesional no depende únicamente de entrenar un modelo nuevo. También debe demostrarse mediante versionado de configuraciones, pipelines reproducibles, métricas, trazabilidad, datasets, pruebas de regresión y decisiones de producto documentadas.

---

## 2. Principios del proyecto

1. **Medir antes de optimizar o afirmar.**
2. **No presentar estilos o ELO como calibrados sin evidencia.**
3. **Separar comportamiento humano, fuerza limitada y fuerza de referencia.**
4. **Mantener privacidad local por defecto.**
5. **Versionar configuraciones y resultados experimentales.**
6. **Construir infraestructura compartida antes de duplicar lógica entre entrenadores.**
7. **Preservar compatibilidad con upstream cuando sea razonable.**
8. **No rediseñar arquitectura sin un problema demostrado.**
9. **Mantener las funcionalidades futuras desacopladas de los experimentos internos.**
10. **Diseñar borrado, exportación y migración desde el inicio cuando se persistan datos del usuario.**

---

## 3. Estado actual

### Resumen

| Área                                    | Estado                                                | Observaciones                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integración Maia 3                      | Recuperación validada; instalación limpia pendiente   | Maia funciona como motor UCI local y Fase 5.3.1 añade instalación administrada Windows x64. El usuario validó reparación, verificación y registro desde el ejecutable release; falta una instalación limpia empaquetada sin Python ni Git previos.                                             |
| Perfiles de bots humanos                | Implementada; validación del catálogo pendiente       | Catálogo 4.4.0 con 15 perfiles, repertorios versionados y clasificación editorial; la calibración estadística sigue pendiente.                                                                                                                                                                 |
| Nivel, muestreo y repertorio            | Validada                                              | Componentes separados y repertorios ponderados por perfil.                                                                                                                                                                                                                                     |
| Tiempo de reflexión humano              | Validada                                              | Pausas variables, configurables y conscientes del reloj.                                                                                                                                                                                                                                       |
| Trazabilidad y mediciones               | Validada                                              | Origen de jugadas, resumen local, JSON/CSV y cabeceras PGN.                                                                                                                                                                                                                                    |
| Historial contra bots                   | Validada                                              | PGN completos, análisis, marcadores, reinicios y eliminación.                                                                                                                                                                                                                                  |
| Calibración estadística profunda        | Diferida                                              | Se recopilarán pruebas gradualmente; no bloquea otras fases.                                                                                                                                                                                                                                   |
| Fiabilidad de motores fuertes           | Validada                                              | Stockfish funcionó correctamente en profundidad 24 y 3+2; Lc0 funcionó con el paquete `windows-onnx-dml`.                                                                                                                                                                                      |
| Presets de jugador/motor                | Validada                                              | Categorías explícitas y configuración comprobada manualmente con Stockfish.                                                                                                                                                                                                                    |
| Manifiesto reproducible                 | Validada                                              | Exportación JSON versionada comprobada manualmente con una partida real.                                                                                                                                                                                                                       |
| Model Game Generator                    | Validada                                              | Fases 2.1, 2.2 y 2.3 validadas manualmente; incluye generación individual y por lotes, registro local, navegación, análisis, exportación, recuperación y eliminación.                                                                                                                          |
| Experiment Analysis                     | Validada                                              | Fases 3.1, 3.2 y benchmark básico 3.3 implementados y validados con lotes reales; la calibración estadística profunda queda diferida.                                                                                                                                                          |
| Fase 4 — Beta de bots humanos y torneos | Cerrada como beta                                     | Model Game Generator con bots a velocidad estándar, catálogo editorial 4.4.0 de 15 perfiles y liga round robin reducida integrada dentro del generador. La expansión, calibración profunda y torneos jugables pasan a la Fase 10.                                                              |
| Fase 6 — Táctica, Aperturas y Finales   | En progreso; 6.9 implementada                         | Finales añade reconocimiento W/D/L previo, respuesta, análisis y demostración jugando, con métricas separadas. Incorporación a repertorios, guardado PGN explícito y catálogos ES/EN están implementados. Pendiente la validación manual consolidada, nativa y empaquetada.                    |
| Estabilidad de bases grandes            | Implementada; cierre manual pendiente                 | 7.0 añade prioridad frente a cobertura, consultas compartidas, índice por bloques y paginación completa. Regresión automática y benchmark real aprobados; pendientes interfaz nativa/build empaquetada y mediciones release.                                                                   |
| Consultas compartidas de Fase 7.0       | Implementada; validación automática aprobada          | Games usa todas las coincidencias y abre en el nodo encontrado. La medición de 7.0 registró unos 26 s de escaneo en debug, además de la primera validación del índice.                                                                                                                         |
| Opening Reports de Fase 7.1             | Núcleo local ampliado; cierre manual pendiente        | Añade jugadores frecuentes y más fuertes, resultados por jugador, franjas ELO y acceso a sus partidas. Games filtra por ELO y ordena globalmente por fecha/ELO. Conserva teoría, transposiciones y exportación HTML/PGN; interpretación estratégica y Lichess siguen diferidos.                |
| Player Analysis de Fase 7.2             | Núcleo implementado; cierre funcional ampliado        | Se añaden al cierre de 7.2 la selección múltiple Blitz/Rapid/Bullet/etc. para la muestra de motor y la elección entre entrenar la alternativa propia o el castigo del rival. Validación manual nativa/empaquetada pendiente.                                                                   |
| Actualizaciones de Onyx                 | Operativo en Windows x64; endurecimiento P0 pendiente | `0.15.2 → 0.15.3` validó detección, confirmación, descarga, firma, instalación, reapertura y conservación de datos. Quedan pruebas negativas antes de cerrar toda la auditoría; macOS y Linux siguen pendientes de Fase 9.                                                                     |
| Instalación directa de Maia 3           | Reparación validada; instalación limpia pendiente     | Fase 5.3.1 ofrece instalación, progreso, cancelación, verificación UCI, registro automático, reparación y desinstalación segura. La recuperación real pasó tras corregir limpieza y semilla; falta probar desde cero en Windows x64 limpio.                                                    |
| Shell centrado en el tablero            | Probado por el usuario; ajustes finales implementados | Entrenamiento comparte la barra de pestañas y convierte el hub en el área elegida. Jugar tiene icono propio; «Jugar desde aquí» copia solo la rama seleccionada a una partida independiente y el cierre protege correctamente los cambios. Falta el smoke test de estos ajustes en escritorio. |

### Bots humanos disponibles

| Perfil | ELO objetivo | Descripción de muestreo técnica |
| ------ | -----------: | ------------------------------- |
| Luna   |          900 | variedad amplia                 |
| Nico   |         1200 | variedad alta                   |
| Vera   |         1500 | equilibrio                      |
| Marcos |         1700 | equilibrio selectivo            |
| Irene  |         1900 | selección concentrada           |
| Leo    |         2200 | selección estrecha              |

Estas etiquetas describen principalmente amplitud de muestreo, no personalidades tácticas o estratégicas demostradas. Las descripciones visibles del producto usan ahora la clasificación editorial de agresión, complejidad, agudeza de apertura y teoría documentada en `docs/human-bots-phase-4-1.es.md`. El ELO es un objetivo solicitado a Maia, no una fuerza calibrada dentro de Chess Lab.

### Persistencia relacionada con bots

- Mediciones técnicas: `human-bot-measurements-v1`, limitadas a las 1000 más recientes.
- Historial personal: `human-bot-history.json` en los datos de la aplicación.
- El historial guarda partidas completas jugador humano contra bot humano.
- Las partidas bot contra bot pueden producir mediciones, pero no afectan el marcador personal.
- Reiniciar un marcador conserva las partidas.
- Borrar el historial elimina las partidas y marcadores guardados.

### Documentación existente

- `docs/maia3-development-setup.es.md`
- `docs/maia3-development-setup.md`
- `docs/human-bots-phase-1.es.md`
- `docs/human-bots-phase-2.es.md`
- `docs/human-bots-phase-3.es.md`
- `docs/human-bot-history.es.md`
- `docs/engine-audit-phase-1-1.es.md`
- `docs/engine-presets-and-manifests.es.md`
- `docs/model-game-generator-phase-2-1.es.md`
- `docs/model-game-generator-phase-2-2.es.md`
- `docs/model-game-generator-phase-2-3.es.md`
- `docs/experiment-analysis-phase-3-1.es.md`
- `docs/experiment-analysis-phase-3-2.es.md`
- `docs/experiment-analysis-phase-3-3.es.md`
- `docs/human-bots-phase-4-1.es.md`
- `docs/human-bots-phase-4-3.es.md`
- `docs/human-bots-phase-4-4.es.md`
- `docs/training-phase-6-1.es.md`
- `docs/database-queries-phase-7-0.es.md`
- `docs/opening-reports-phase-7-1.es.md`
- `docs/player-analysis-phase-7-2.es.md`
- `docs/phase-5-brand-release-alpha-plan.es.md`
- `docs/updater-phase-5-2.es.md`
- `docs/training-phase-6-9.es.md`

### Próximo paso recomendado

**Primero se valida manualmente el reconocimiento y demostración de Finales de 6.9. Luego se ejecuta
la matriz consolidada de Entrenamiento, el cierre funcional de 7.2 —selección múltiple de ritmos y
perspectiva de ejercicios de error— y la instalación limpia de Maia. Por último se completan las
pruebas negativas del actualizador y el corte de release antes de avanzar a Fase 8.**
El canal automático Windows x64 ya está activo con endpoint, clave pública y artefactos firmados
propios de Onyx; sus pruebas negativas continúan dentro de la auditoría P0. La preparación de los objetivos
incluidos de Finales y la validación manual consolidada/nativa/empaquetada se resolverán en la
auditoría 5.2; no se consideran ya verificadas.
La prioridad y cancelación de cobertura de 6.6 ya se integraron en las consultas de 7.0.
La matriz manual de entrenamiento sigue en `docs/training-phase-6-8.es.md`.

Revisión de preparación del 2026-08-28 en `docs/phase-7-readiness-review.es.md`: la base permite
abordar 7.0, pero el cierre de la Fase 6 y la suite Rust completa siguen pendientes. La implementación
posterior está documentada en `docs/database-queries-phase-7-0.es.md` y
`docs/opening-reports-phase-7-1.es.md`. Los informes reutilizan **Games**, sin otra lista bajo las
estadísticas. La revisión visual de 7.1 no se pudo ejecutar por un fallo al iniciar la herramienta
de navegador; las pruebas de componentes no sustituyen ese cierre manual.

---

## 4. Orden general de implementación

```text
Base actual de bots, motores y experimentación [completada]
        ↓
Entrenamiento especializado: Táctica + Aperturas + Finales [cierre actual]
        ↓
Estabilidad interactiva con bases grandes [6.6, núcleo implementado; cierre pendiente]
        ↓
Shell centrado en el tablero y navegación simplificada [6.7, probado por el usuario; ajustes finales implementados]
        ↓
Pulido de Táctica, repertorios, PGN, partidas modelo e idiomas [6.8]
        ↓
Explorador de posiciones y partidas paginadas + Opening Reports [7.0–7.1]
        ↓
Player Analysis y entrenamiento personalizado [7.2]
        ↓
Canal de actualización propio, firmado y aislado [Fase 5.2, P0]
        ↓
Instalación directa y administrada de Maia 3 [Fase 5.3, recuperación validada; instalación limpia pendiente]
        ↓
Reconocimiento de Finales 6.9 + cierre funcional y manual de 7.2 [cierre actual]
        ↓
Ingeniería de release restante, identidad final y alpha privada [Fase 5]
        ↓
Serious Preparation Tools [Fase 8]
        ↓
Evolución avanzada de bots y torneos interactivos [Fase 10]
        ↓
Consolidación multiplataforma, MLOps y lanzamiento público [Fase 9]
```

Los números de fase se conservan como identificadores históricos y no representan ya un orden
cronológico estricto. La alpha privada no debe esperar a Player Analysis completo: se habilita cuando
la base técnica, el shell, los flujos principales, el explorador de posiciones y el empaquetado hayan
superado sus criterios de salida. La calibración y expansión de bots continúan diferidas.

---

## 5. Fases generales

## Fase 0 — Base de bots humanos

**Estado: Validada.**

### Alcance completado

- [x] Integración técnica con Maia 3.
- [x] Perfiles seleccionables desde Jugar.
- [x] Separación de nivel, muestreo y repertorio.
- [x] Repertorios ponderados.
- [x] Tiempo de reflexión humano.
- [x] Trazabilidad y mediciones de calibración.
- [x] Historial y marcador por bot.
- [x] Apertura de partidas guardadas para análisis.
- [x] Reinicio de marcadores y borrado de historial.

### Trabajo deliberadamente diferido

- calibración real de ELO;
- estilos tácticos o posicionales demostrados;
- ampliación a doce o más bots;
- instalación o distribución automática de Maia.

---

## Fase 1 — Fiabilidad de motores e infraestructura experimental

**Estado: Validada.**

### 1.1. Auditoría de fuerza y protocolo UCI

**Estado: Validada.**

Investigar por qué Stockfish 18 contra Stockfish 18 produjo al menos una jugada extremadamente débil.

La anomalía original no se reprodujo. El 15 de agosto de 2026 se probaron partidas Stockfish 18
contra sí mismo a profundidad 24 y a ritmo 3+2, con un hilo y 16 MB de Hash, sin observar juego
anómalo. El incidente se cierra como no reproducido y deberá reabrirse con PGN y logs de ambos
colores si vuelve a ocurrir.

Comprobar:

- comando `go` enviado;
- profundidad, nodos o tiempo concedidos;
- unidades de reloj;
- `UCI_LimitStrength`, `UCI_Elo` y `Skill Level`;
- `MultiPV=1` durante juego;
- Threads y Hash;
- NNUE o pesos cargados;
- procesos independientes para cada color;
- `position`, FEN e historial enviados;
- reinicio entre partidas;
- lectura y aplicación de `bestmove`;
- comportamiento ante timeout, cancelación y cierre.

Crear una suite pequeña de posiciones tácticas conocidas y partidas de regresión. Un motor fuerte sin limitar no debe fallar consistentemente tácticas elementales.

Implementado:

- procesos independientes para cada color;
- `MultiPV=1` forzado también en el backend durante juego;
- `ucinewgame` y `readyok` después de aplicar opciones;
- FEN inicial e historial completo enviados antes de cada búsqueda;
- conversión de relojes sin desbordamiento silencioso;
- regresión automatizada del orden UCI mediante un motor simulado;
- suite táctica opcional para un motor externo configurado mediante `CHESS_LAB_REFERENCE_ENGINE`;
- procedimiento y resultados documentados en `docs/engine-audit-phase-1-1.es.md`.

### 1.2. Presets de jugador/motor

**Estado: Validada.**

Definir categorías distintas:

- bot humano Maia;
- motor limitado;
- motor fuerte aproximado a Gran Maestro;
- motor de referencia superhumano;
- configuración personalizada.

No llamar “humano de 3000 ELO” a un Stockfish o Leela sin una calibración específica. Para experimentos puede utilizarse la etiqueta **motor de referencia**.

Implementado:

- selector explícito de configuración personalizada, motor limitado, motor fuerte y motor de referencia;
- presets reproducibles de profundidad, Threads, Hash, límite de fuerza y `MultiPV`;
- ELO limitado presentado como objetivo UCI no calibrado;
- conservación de opciones específicas del motor que el preset no modifica;
- bots Maia registrados separadamente como categoría humana.

### 1.3. Especificación reproducible

**Estado: Validada.**

Diseñar un manifiesto versionado con:

- posición inicial;
- historial previo cuando exista;
- configuración completa de ambos jugadores;
- binario/modelo y versión;
- opciones UCI;
- semilla;
- límite de cálculo;
- recursos asignados;
- hardware relevante;
- resultado y causa de finalización.

Una FEN no contiene historial de repetición. El sistema debe aceptar FEN aislado y posiciones seleccionadas desde un PGN con su historial.

Implementado:

- manifiesto JSON `schemaVersion: 1` exportable desde una partida con motor;
- FEN e historial inicial, jugadas y posición final;
- configuraciones completas y categorías de ambos jugadores;
- ruta, versión, opciones UCI, argumentos resueltos y semilla de lanzamiento;
- límites de cálculo, recursos, controles de tiempo, libro y hardware relevante;
- estado, resultado y causa de finalización;
- prueba de normalización de opciones efectivas y serialización segura de enteros de 64 bits.

El hash criptográfico de binarios o modelos y la persistencia de partidas abortadas se difieren al registro de experimentos de la Fase 2.

### Criterio de salida

- ejecutar partidas fuertes sin blunders causados por integración;
- poder reproducir una ejecución bajo condiciones controladas;
- disponer de presets confiables para el generador.

---

## Fase 2 — Model Game Generator

**Estado: Validada. Las Fases 2.1, 2.2 y 2.3 fueron implementadas y validadas manualmente.**

### Objetivo

Generar partidas reproducibles desde cualquier posición utilizando configuraciones explícitas de jugador, modelo o motor.

### 2.1. Generación individual

**Estado: Validada.**

- [x] posición desde FEN o nodo PGN;
- [x] configuración de blancas y negras;
- [x] bot humano, motor limitado o motor fuerte;
- [x] tiempo, profundidad o nodos;
- [x] semilla;
- [x] PGN y manifiesto resultante;
- [x] repetición de la misma configuración.

Implementado:

- pestaña dedicada accesible desde Inicio y desde el nodo seleccionado de un análisis;
- conservación del historial PGN que conduce a la posición inicial;
- configuraciones persistidas por separado para blancas y negras;
- repetición inmediata mediante una copia exacta de la configuración y del origen;
- exportación emparejada `<nombre>.pgn` y `<nombre>.manifest.json`;
- filtrado de opciones UCI según las capacidades anunciadas por cada motor;
- registro de opciones aplicadas y omitidas en el manifiesto;
- presupuestos ilimitados diferenciados: profundidad para motores alfa-beta y nodos para Lc0/Leela;
- aborto y cierre mediante terminación independiente del bloqueo de búsqueda UCI;
- tarjeta visible para inspeccionar y editar la posición inicial;
- documentación y prueba manual en `docs/model-game-generator-phase-2-1.es.md`.

### 2.2. Ejecución por lotes

**Estado: Validada.**

- [x] número de partidas;
- [x] alternancia automática de colores;
- [x] múltiples semillas mediante incremento reproducible;
- [x] progreso y resultados resumidos en memoria;
- [x] pausa cooperativa, reanudación y cancelación inmediata;
- [x] reintentos de inicio y abandono del motor;
- [x] presupuestos agregados de Threads, Hash y concurrencia;
- [x] ejecución backend en segundo plano al cambiar de pestaña.

Implementado:

- coordinador backend independiente del ciclo de vida del componente React;
- recuperación del estado al regresar a la pestaña del generador;
- cancelación de motores y cola al cerrar la pestaña propietaria;
- intercambio completo de jugadores y relojes al alternar colores;
- incremento determinista de las semillas base por índice de partida;
- concurrencia efectiva limitada por Threads y Hash solicitados;
- pausa que drena partidas activas sin programar nuevas;
- reintentos únicamente ante fallos de inicio o `abandonment`;
- documentación y prueba manual en `docs/model-game-generator-phase-2-2.es.md`.

Evitar oversubscription: varias partidas con motores multihilo pueden competir por más hilos de los disponibles y degradar fuerza y reproducibilidad.

### 2.3. Registro de experimentos

**Estado: Validada.**

Cada ejecución debe producir:

```text
Experimento
├── manifiesto versionado
├── partidas PGN
├── logs relevantes
├── resultados
└── métricas posteriores
```

Implementado:

- registro automático de ejecuciones individuales y por lotes en el directorio privado de datos;
- manifiesto de experimento `schemaVersion: 1` con configuración completa y estado;
- PGN y manifiesto reproducible por partida terminada o individual abortada;
- logs por color y conservación separada de intentos abandonados antes de un reintento;
- resultados detallados y métricas descriptivas básicas sin evaluación adicional;
- historial visible, apertura de cada partida en análisis, exportación de carpeta y eliminación confirmada;
- protección contra exportar o eliminar experimentos activos;
- recuperación conservadora de ejecuciones interrumpidas como canceladas;
- captura no bloqueante de logs durante aborto para preservar la terminación independiente del bloqueo UCI;
- validación manual del flujo completo, incluida persistencia, navegación individual, exportación, eliminación y una partida Lc0 contra Leo;
- documentación y prueba manual en `docs/model-game-generator-phase-2-3.es.md`.

Las métricas que necesitan un motor evaluador, la comparación estadística y las posiciones críticas pertenecen a la Fase 3. Los hashes criptográficos de binarios y redes siguen pendientes de la línea MLOps.

### Relación con otras fases

El generador debe ser reutilizado por:

- calibración automatizada de bots;
- Experiment Analysis;
- evaluación de dificultad práctica;
- generación futura de posiciones de entrenamiento;
- comparación de modelos y niveles.

El generador ejecuta partidas; la calibración decide qué enfrentamientos realizar y cómo interpretarlos. No mezclar ambas responsabilidades.

---

## Fase 3 — Experiment Analysis

**Estado: Cerrada para su alcance básico el 18 de agosto de 2026. Las entregas 3.1, 3.2 y la primera versión de 3.3 están implementadas y validadas con experimentos reales; la calibración con muestras mayores queda fuera de este cierre y pasa a la Fase 4.**

### Métricas iniciales

- win rate;
- draw rate;
- resultados por color;
- ACPL;
- errores y blunders;
- distribuciones de jugadas;
- entropía;
- posiciones críticas;
- resultados por ELO, perfil y modelo;
- resultados por apertura y fase de partida.

### 3.1. Análisis dual de una posición

**Estado: Implementada y validada manualmente; queda documentada como análisis no calibrado de ELO.**

- [x] reutilizar el flujo UCI existente para analizar la posición seleccionada;
- [x] mostrar Maia W/D/L como predicción humana separada de la evaluación objetiva;
- [x] mostrar la evaluación objetiva de Stockfish y otros motores de referencia sin combinarla con Maia;
- [x] permitir ajustar el ELO solicitado a Maia desde los ajustes del motor;
- [x] mantener Maia y Stockfish como procesos independientes y detenerlos de forma independiente;
- [x] documentar la validación manual y los límites de interpretación;
- [x] validar manualmente con una instalación Maia 3 y una instalación Stockfish reales.

La entrega no ejecuta partidas simuladas para una única posición. Por tanto, sus porcentajes Maia
son valores del modelo y no incluyen intervalos de confianza. Las simulaciones emparejadas y el
análisis estadístico se mantienen fuera de esta entrega para no acoplar la segunda entrega al
panel interactivo.

### 3.2. Análisis de partidas y experimentos

**Estado: Implementada y validada manualmente con un experimento real.**

- [x] seleccionar un motor UCI local objetivo con un límite acotado;
- [x] reutilizar los manifiestos y partidas persistidas del Model Game Generator;
- [x] calcular ACPL desde la perspectiva del jugador que mueve;
- [x] contar imprecisiones desde más de 40 cp, errores desde más de 100 cp y blunders desde más de 200 cp;
- [x] agregar resultados por color, jugador y fase heurística;
- [x] persistir configuración del evaluador, resumen y detalle por partida en `analysis-v2.json`;
- [x] mostrar progreso, permitir cancelación y recuperar el último resultado desde el historial;
- [x] excluir Maia de la evaluación objetiva de partidas;
- [x] documentar límites y validación manual;
- [x] validar el flujo con un experimento real y revisar algunas jugadas contra el análisis normal.

Esta entrega no calcula intervalos de confianza, entropía, distribuciones de respuestas ni
posiciones críticas. Tampoco presenta los resultados como una estimación calibrada de ELO. Esas
funciones quedan para una entrega estadística posterior.

### 3.3. Benchmark empírico inicial de W/D/L

**Estado: Implementada y validada en versión exploratoria. La calibración estadística con muestras mayores queda fuera del cierre básico.**

- [x] reutilizar un experimento guardado con partidas completadas;
- [x] consultar la predicción W/D/L de Maia en la posición inicial;
- [x] comparar la predicción con los resultados observados desde la perspectiva de blancas;
- [x] calcular intervalos de Wilson del 95% para los resultados observados;
- [x] calcular error absoluto medio en puntos porcentuales y Brier score;
- [x] persistir el resultado en `empirical-wdl-v1.json`;
- [x] ofrecer una interfaz para seleccionar Maia, su ELO y el límite de la consulta;
- [x] validar con lotes reales Maia–Maia, colores alternados y varias semillas;
- [x] conservar un lote Maia–Stockfish como control de fuerza objetiva;
- [ ] repetir con una muestra suficientemente grande para estudiar calibración.

La primera versión no genera partidas nuevas desde el panel del benchmark: esas partidas se
generan previamente con el Model Game Generator. Para validar comportamiento humanoide, Maia–Maia
es el protocolo principal; Maia–Stockfish se conserva como control de resistencia frente a juego
objetivo. Tampoco es todavía una calibración contra jugadores humanos: los datos de Lichess sirven
como referencia externa, no como prueba definitiva de calibración.

### Reglas estadísticas

- alternar colores;
- utilizar partidas emparejadas;
- repetir posiciones con distintas semillas;
- mostrar tamaño de muestra;
- calcular intervalos de confianza;
- registrar la configuración del motor evaluador;
- separar apertura, medio juego y final.

La entropía y distribución de jugadas necesitan múltiples muestras desde una misma posición. ACPL debe manejar correctamente perspectiva y puntuaciones de mate.

### Dificultad práctica

Investigar posiciones objetivamente aceptables pero difíciles para jugadores de determinados niveles.

Una posición crítica puede definirse mediante:

- cambio grande de evaluación;
- alta diversidad de respuestas;
- sensibilidad del resultado a una decisión;
- diferencia entre evaluación objetiva y resultados humanos;
- aumento de errores en rangos ELO específicos.

---

## Fase 4 — Beta de bots humanos y torneos

**Estado: Cerrada como beta el 19 de agosto de 2026.**

La beta consolida el alcance práctico inicial: perfiles humanos editoriales sobre Maia 3, partidas
reproducibles en el Model Game Generator y una liga automática reducida para comparar bots. No
pretende ser todavía un sistema de calibración estadística completa ni una plataforma de torneos
jugables por el usuario.

### Alcance cerrado

- [x] separar fuerza objetivo, muestreo, estilo de decisión, estilo de apertura, repertorio y timing;
- [x] versionar perfiles, repertorios, catálogo, modelo Maia, configuración UCI, semillas y resultados;
- [x] cubrir el catálogo editorial inicial de 15 bots con repertorios por color, línea fija y perfil sin repertorio;
- [x] reutilizar el Model Game Generator para enfrentamientos reproducibles y conservar sus experimentos;
- [x] ejecutar bots a velocidad estándar, sin pausas de pensamiento humano, en Model Game Generator;
- [x] crear una liga round robin reducida bot contra bot con colores, semillas, aperturas, reloj, reintentos y presupuestos;
- [x] conservar las ligas como eventos separados en `bot-leagues-v1`, con tabla relativa y exportación;
- [x] abrir la liga mediante un botón dentro del Model Game Generator, sin icono ni sección propia en la pantalla principal;
- [x] documentar que el ELO y los estilos son objetivos o hipótesis editoriales, no calibraciones externas.

### Limitaciones aceptadas de la beta

- La liga puede tardar mucho cuando se juega con controles de tiempo largos; la velocidad estándar evita
  las pausas artificiales, pero no elimina el tiempo real del reloj.
- La beta no muestra las partidas en vivo mientras se ejecutan.
- Solo ofrece un formato reducido de liga y una selección funcional de bots; todavía no hay torneos
  donde el usuario juegue rondas contra ellos.
- La estimación de fuerza es relativa e interna y no equivale a un ELO de Lichess, FIDE u otra plataforma.

Los pendientes anteriores no bloquean el uso del generador ni el avance hacia las fases de producto.
Se consolidan en la Fase 10, que se ejecutará después de las prioridades actuales de producto y de la
Fase 7.

---

## Fase 5 — Identidad de producto y alpha privada

**Estado: Auditoría iniciada. Nombre final Onyx Chess Lab, ubicación local
`G:\dev\onyx-chess-lab`, repositorio `ArguedasG/onyx-chess-lab`, remoto upstream y licencia CC BY
4.0 del logo configurados. Primer lote de navegación y nombres resuelto el 2026-08-31; auditoría
release completa y migración de datos pendientes.**

Esta fase se divide en cuatro hitos. La identidad visual no debe bloquear el trabajo funcional, pero el
nombre, el identificador de la aplicación, la migración y las licencias sí deben quedar resueltos antes
de entregar instaladores a terceros. La secuencia operativa y la matriz de auditoría están en
`docs/phase-5-brand-release-alpha-plan.es.md`.

### 5.1. Identidad y repositorio propio

- nombre definitivo;
- icono e identidad visual;
- repositorio propio del fork, con historial o atribución verificable de En Croissant;
- README, capturas, propuesta de valor y avisos legales propios;
- `productName`, ejecutable y bundle identifier;
- migración de datos desde En Croissant;
- estrategia explícita para incorporar cambios de upstream sin mezclar la marca original.

Crear un repositorio propio es razonable y recomendable cuando se consolide el nombre. No se debe
perder el historial, la licencia GPLv3, los avisos de copyright ni la atribución al proyecto original.

### 5.2. Build y auditoría completa de release

- congelar temporalmente funcionalidades nuevas y construir una línea base release identificada;
- auditar instalación, migraciones, persistencia, navegación, motores, bases, informes,
  entrenamiento, bots, Generador de partidas modelo, traducciones y rendimiento;
- registrar antes de corregir, salvo bloqueos o riesgos de datos, y clasificar P0–P3;
- completar la definición de objetivo, color y resultado aceptado de todas las posiciones incluidas
  de Finales;
- comparar con desarrollo solo para aislar diferencias; la aceptación se decide sobre el ejecutable
  release.

#### 5.2.1. Canal propio de actualizaciones automáticas — P0

El incidente observado el 2026-09-06 confirmó que una build del fork todavía podía consultar el
canal heredado e instalar En Croissant sobre Onyx. El hotfix mantiene el actualizador desactivado;
reactivarlo requiere completar todo este contrato, no solo cambiar una URL:

- generar un par de claves exclusivo de Onyx, incluir únicamente la clave pública en la aplicación
  y guardar la privada como secreto de release con respaldo y acceso restringido;
- publicar un endpoint propio y metadatos de actualización que apunten exclusivamente a artefactos
  de Onyx Chess Lab;
- producir y firmar instalador, artefacto de actualización y metadatos desde el mismo commit,
  versión y plataforma dentro del workflow de release;
- adaptar la auditoría automática de aislamiento para rechazar dominios, claves o nombres heredados
  y comprobar la configuración propia habilitada;
- probar instalación limpia, Onyx N → Onyx N+1, ausencia de actualización, red caída, firma
  inválida, artefacto ajeno y cancelación, manteniendo una descarga manual de recuperación;
- documentar custodia, copia de seguridad, rotación y pérdida de la clave. Una clave privada perdida
  no debe improvisarse en una release ya distribuida.

**Criterio de salida:** una versión de prueba instalada solo ofrece la siguiente versión de Onyx,
rechaza un artefacto alterado o de En Croissant y conserva datos y configuración tras actualizar.
La ampliación multiplataforma y una política avanzada de rotación continúan en Fase 9.

**Alcance inicial decidido el 2026-09-07:** únicamente Windows x64 con NSIS, un canal estable y
confirmación visible antes de descargar. Las releases se preparan como borrador y solo se vuelven
detectables al publicarlas. La implementación y validación del actualizador para macOS —Intel y
Apple Silicon— y Linux quedan pendientes explícitos de Fase 9; generar un artefacto no equivaldrá a
declararlo soportado.

**Estado técnico al 2026-09-07:** el cliente, endpoint exclusivo de Onyx, permiso e integración
Tauri, auditoría de aislamiento, workflow Windows, par de claves cifrado y secretos de GitHub Actions
están configurados. `v0.15.2` se construyó, firmó y publicó desde GitHub Actions; su instalación manual
y la respuesta «Onyx Chess Lab está actualizado» contra el feed público fueron validadas por el usuario.
`v0.15.3` completó después el recorrido real desde `v0.15.2`: detección, confirmación, descarga,
firma, instalación, reapertura y conservación de datos. El canal Windows x64 queda operativo; las
pruebas negativas de red, firma y artefacto alterado permanecen en la auditoría P0.

### 5.3. Estabilización, ediciones y capa visual de marca

- español como idioma predeterminado en instalaciones nuevas, conservando la preferencia de usuarios
  existentes;
- Maia 3 visible en el catálogo de Motores mediante instalación/descarga guiada, con modelo y licencia
  documentados; no asumir que puede tratarse exactamente igual que un binario autocontenido;
- una sola base de código y una rama principal para todas las ediciones;
- manifiestos declarativos de edición que seleccionen contenido, nombre del artefacto y canal;
- matriz de build que produzca cada instalador desde el mismo commit y registre commit, versión,
  edición, hashes y manifiesto de contenido;
- validación previa al build que rechace recursos sin procedencia, licencia o permiso registrado;
- contenido privado fuera del repositorio, de su historial, de cachés públicas y de artefactos
  generales;
- instaladores diferenciables en nombre de archivo y metadatos, pero compatibles en esquema de datos;
- empaquetado para Windows;
- smoke tests en Linux y macOS;
- mecanismo sencillo para reportar errores;
- documentación de instalación, contenido, licencias, backup y recuperación.

#### 5.3.1. Instalación directa y administrada de Maia 3 — P1

**Estado: implementada para Windows x64; recuperación real validada el 2026-09-08; instalación
limpia empaquetada pendiente.**

La integración UCI ya funciona, pero el procedimiento actual exige instalar Python y Git, crear un
entorno virtual, descargar el modelo, localizar el ejecutable y escribir argumentos manualmente. No
es una experiencia aceptable para usuarios finales. El objetivo es que **Motores → Maia 3 →
Instalar** resuelva el proceso completo:

- ofrecer un paquete preparado y versionado por plataforma cuando la revisión técnica y legal lo
  permita; el primer objetivo operativo es Windows x64 con CPU;
- mostrar licencia, procedencia, versión, tamaño estimado y componentes que se descargarán antes de
  confirmar;
- instalar en un directorio administrado de datos de Onyx, con progreso, cancelación, reintento,
  verificación de hash/firma y limpieza segura de descargas incompletas;
- registrar automáticamente el ejecutable, argumentos UCI, semilla aleatoria, modelo y opciones
  predeterminadas, sin pedir al usuario rutas ni líneas de comandos;
- ejecutar una comprobación `uci`/`isready` al terminar y comunicar errores accionables;
- permitir reparar, actualizar y desinstalar únicamente la instalación administrada, sin tocar
  motores Maia añadidos manualmente;
- conservar como alternativa una instalación guiada dentro de la aplicación si no es viable
  redistribuir un paquete autocontenido o los pesos. Aun en ese caso, el usuario no debe tener que
  configurar argumentos UCI manualmente;
- documentar licencia y obligaciones de Maia, Python, dependencias y modelo por separado antes de
  publicar el paquete.

**Criterio de salida:** en una instalación limpia de Windows, una persona sin Python ni Git puede
instalar Maia desde Motores, superar la comprobación automática y usarlo inmediatamente en Jugar,
bots humanos, Finales y Generador de partidas modelo. La descarga interrumpida se puede reanudar o
limpiar, y la desinstalación no afecta otros motores.

La implementación y su matriz de validación están documentadas en
`docs/managed-maia3.es.md`. Usa Maia 3 `0.1.0`, Maia3-5M, CPython y uv con versiones o revisiones
fijadas; verifica el bootstrap por SHA-256, comprueba `uci`/`isready` y ejecuta posteriormente con el
modelo local sin red. macOS y Linux siguen en Fase 9.

La primera prueba empaquetada descubrió una espera engañosa al 97 %: el modelo y el motor ya estaban
correctos, pero la eliminación síncrona de más de 38.000 archivos temporales bloqueaba la finalización
y la cancelación. La corrección recupera los activos completos de una instalación interrumpida,
verifica antes de volver a descargar y mueve la limpieza masiva a segundo plano. Queda pendiente
repetir el smoke test con el ejecutable corregido.

La repetición identificó además que el validador UCI enviaba literalmente `{{randomSeed}}`, aunque el
lanzador normal sí lo sustituye por una semilla numérica. Maia rechazaba ese argumento antes de
emitir `uciok`. La comprobación final usa ahora el mismo resolvedor de argumentos que el motor normal
y conserva `stdout` y `stderr` en cualquier error posterior.

Ediciones previstas desde el mismo código:

1. **Pública limpia**: Finales incluidos y ningún set táctico preinstalado.
2. **Evaluación con contenido redistribuible**: solo sets con licencia o permiso confirmado y
   registrado en el manifiesto.
3. **Evaluación privada**: preferentemente sin copiar material comercial al instalador; cada probador
   importa localmente los PGN que posee. Solo se empaquetará contenido protegido si existe una base
   legal o permiso expreso revisado para esa distribución concreta.

Las tres ediciones conservan siempre el importador completo de PGN para Táctica, Aperturas, partidas
y demás flujos compatibles. La diferencia entre ediciones afecta únicamente al contenido que viene
preinstalado; nunca limita el contenido local que el usuario puede importar.

No usar ramas largas ni carpetas copiadas para estas ediciones: divergen, reciben correcciones de
forma desigual y vuelven imposible demostrar que solo cambia el contenido. Los archivos privados no
deben entrar nunca a Git, ni siquiera en una rama privada que luego pueda filtrarse.

La estabilización corrige todos los P0/P1, decide cada P2, completa Finales y aplica un ajuste visual
ligero mediante tokens/componentes compartidos. No se rediseñan flujos estables sin evidencia de la
auditoría. Un segundo ejecutable release repite la matriz antes de declarar el candidato alpha.

### 5.4. Alpha privada

- congelar el alcance funcional y abrir una ventana corta dedicada a defectos;
- ejecutar smoke tests sobre desarrollo y ejecutable empaquetado;
- probar instalación limpia, actualización, migración, backup, desinstalación y recuperación;
- registrar edición, versión, plataforma y manifiesto de contenido en cada reporte;
- distribuir inicialmente a un grupo aproximado de 3–5 personas antes de ampliar al equipo del TEC;
- priorizar Windows para el primer grupo sin declarar todavía que sea la única plataforma admitida;
- ofrecer el código fuente correspondiente y los avisos exigidos a quienes reciban binarios GPL.

### Momento recomendado

El momento acordado ha llegado tras completar 6.6–6.8 y el núcleo 7.0–7.2. Primero se ejecutan
identidad/repositorio, auditoría release y estabilización visual/funcional; después se distribuye la
alpha privada. Las mejoras 7.3 continúan sin bloquearla.

### Riesgos

- Cambiar el bundle identifier puede cambiar el directorio de datos y ocultar configuraciones, motores e historial previos.
- El proyecto es GPLv3 y debe preservar atribución y obligaciones de distribución de código fuente.
- Maia 3 se publica actualmente bajo AGPLv3; revisar por separado código, pesos, dependencias y el
  método de descarga antes de redistribuirlo o integrarlo al instalador. Se prefiere un paquete
  preparado y fácil de instalar cuando sea técnica y legalmente viable; la alternativa es una
  instalación guiada tan integrada como permita el paquete oficial.
- Revisar licencias de Stockfish, Leela, redes, bases y sets incluidos.
- Poseer un libro o una copia de un curso no equivale a poseer los derechos de reproducción o
  distribución de su contenido.
- Confirmar disponibilidad del nombre antes de consolidar la marca.

---

## Fase 6 — Entrenamiento de Táctica, Aperturas y Finales

**Estado: En progreso; primer corte especializado implementado y validado automáticamente.**

La Fase 6 no es un único entrenador genérico. Son tres áreas claramente separadas, con sus propias
pantallas, configuraciones, contenido, sesiones y progreso:

```text
Entrenamiento
├── Táctica       → ampliar el entrenador de puzzles existente
├── Aperturas     → ampliar el entrenamiento de repertorios existente
└── Finales       → crear desde cero
```

La infraestructura compartida debe limitarse a capacidades técnicas reutilizables —parsing PGN/FEN,
representación de posiciones y variantes, tablero, motores, almacenamiento versionado, exportación,
backup y componentes de estadísticas—. No se debe imponer una colección, sesión, ciclo o sistema de
progreso común a las tres áreas.

### Primer corte implementado

- [x] esquema local versionado para posiciones, procedencia, soluciones, etiquetas e intentos;
- [x] importación inicial de FEN y PGN con conservación de la línea principal;
- [x] backup JSON validado y restaurable;
- [x] apertura de una posición importada en el tablero de análisis;
- [x] pruebas unitarias del modelo y sus operaciones principales;
- [x] hub y rutas independientes para Táctica, Aperturas y Finales;
- [x] dashboard de Táctica conectado al acceso existente de Puzzles, sin abrir el tablero antes de iniciar una sesión;
- [x] sets tácticos respaldados por archivo PGN, con conteo, muestra previa, interpretación configurable y carga diferida por ejercicio;
- [x] práctica táctica guiada con soluciones PGN o evaluación local bajo demanda para registros que solo contienen FEN;
- [x] dashboard de Aperturas con repertorios, variantes, líneas, análisis y práctica por capítulo;
- [x] creación prioritaria de repertorios desde cero, con capítulos vacíos editables desde el tablero;
- [x] importación de Aperturas con vista previa y política de línea principal o todas las subvariantes;
- [x] conservación del PGN importado como fuente inmutable y copia editable completa independiente;
- [x] detección inicial de partidas modelo, visibles para análisis pero excluidas de la memorización;
- [x] práctica continua de la variante y calificación de dificultad una sola vez al terminar la línea;
- [x] edición y orden manual de variantes, clasificación de partidas modelo y selección individual de líneas entrenables;
- [x] práctica de repertorio completo que encadena los capítulos entrenables;
- [x] clasificación Stockfish de desviaciones buenas con pausa explícita antes de regresar a la línea;
- [x] consulta UCI puntual para desviaciones, terminada al recibir `bestmove` y limitada a ocho segundos;
- [x] recuperación automática ante timeout, desconexión o fallo de inicio sin dejar bloqueado el tablero;
- [x] feedback lateral diferenciado para jugada correcta, incorrecta y buena fuera del repertorio;
- [x] reintento de jugadas incorrectas sin revelar ni reproducir automáticamente la respuesta;
- [x] progreso y dificultad de Aperturas registrados por jugada y agregados a línea, variante y repertorio;
- [x] calificación automática opcional al terminar una línea según errores y tiempo;
- [x] gestor jerárquico con variantes-carpetas, creación visual, renombrado, exclusión, borrado y arrastre de líneas;
- [x] reconstrucción no destructiva de ramas reorganizadas sobre la copia editable;
- [x] sincronización del árbol guardado en tablero con líneas y subvariantes del gestor;
- [x] exportación de la copia PGN editable sin escribir en la fuente;
- [x] sets de Finales importados desde PGN con FEN, consulta de objetivos por tablebase y corrección manual;
- [x] contenido inicial de 180 posiciones de Finales y selección de Maia máximo o Stockfish;
- [x] biblioteca de Finales organizada por temas, sin exponer la partición de los PGN fuente;
- [x] inicio automático de una partida al elegir un final y cierre especializado según su objetivo;
- [x] progreso permanente por posición, repetición, siguiente final y análisis posterior;
- [x] regreso a la biblioteca de Finales durante preparación, partida activa y pantalla de resultado;
- [x] salida de una partida de Finales sin registrar un intento artificial y mensaje neutral al no alcanzar el objetivo;
- [x] reconocimiento previo del resultado de Finales —ganan blancas, tablas o ganan negras— con lado al turno visible;
- [x] respuesta revelada, «No sé» como fallo, análisis y continuación opcional para demostrar jugando;
- [x] progreso de reconocimiento separado de los intentos de juego contra motor;
- [x] separación entre contenido incluido bloqueado y sets propios editables/eliminables;
- [x] ciclos Woodpecker sucesivos que recorren el set completo y terminan automáticamente al resolverlo;
- [x] dashboard táctico centrado en sets, con progreso, ELO recomendado, revisión y borrado no destructivo;
- [x] reanudación y navegación táctica por problema, con avance automático opcional;
- [x] reintento táctico tras fallo sin revelar la respuesta ni avanzar el ejercicio;
- [x] salida anticipada del ciclo relegada a configuración avanzada y protegida por confirmación;
- [x] revisión táctica alternativa tipo lista PGN, virtualizada y marcada por ciclo;
- [x] navegación exploratoria separada del primer problema pendiente y acceso explícito para regresar;
- [x] aviso de jugada incorrecta persistente durante el reintento;
- [x] práctica individual de líneas de Aperturas y repetición libre desde el gestor;
- [x] evaluación de desviaciones y pregunta de dificultad configurables, ambas desactivadas por defecto;
- [x] ayuda «Mostrar jugada» que registra fallo, enseña, restaura y exige repetir la respuesta;
- [x] lateral de práctica desplazable y contadores de progreso/sesión explicados;
- [x] adquisición tardía de conexiones SQLite y desmontaje de cálculos de cobertura ocultos;
- [ ] completar la migración/adaptación no destructiva de todos los flujos existentes;
- [ ] completar la validación manual de Finales y de los formatos reales.

El primer corte genérico no define la UX final. Sus conceptos de persistencia, importación y backup se
conservan si resultan útiles, pero las colecciones mixtas y las sesiones compartidas no son el modelo
de producto deseado.

### 6.1. Entrenamiento de Táctica

El entrenador actual de puzzles de Lichess se conserva y se amplía. El usuario debe poder elegir
cómo quiere entrenar, sin obligarlo a una única modalidad.

#### Alcance

- mantener el flujo actual de puzzles Lichess;
- incluir sets predeterminados basados en PGN, con licencias verificadas;
- permitir sets personalizados mediante PGN;
- ofrecer un importador configurable, con vista previa y reporte de entradas inválidas;
- mantener el archivo PGN como fuente para sets grandes y leer solo el ejercicio activo, sin duplicar miles de registros en `localStorage`;
- interpretar normalmente cada registro PGN como un ejercicio/posición independiente, permitiendo cientos de registros por archivo;
- aceptar registros que contengan únicamente un FEN, además de registros con una línea de solución;
- dejar fuera del primer importador los PGN de partidas completas cuya posición táctica deba descubrirse automáticamente;
- configurar si la primera jugada pertenece al rival, al estudiante o es una posición de montaje;
- aceptar PGN sin solución, con solo solución o con jugadas previas de preparación;
- decidir cómo tratar variantes y subvariantes: soluciones, alternativas o contenido ignorado;
- aceptar alternativas tácticas equivalentes cuando produzcan prácticamente el mismo resultado, pero rechazar continuaciones objetivamente inferiores aunque también ganen;
- cuando un ejercicio solo tenga FEN, validar la jugada bajo demanda con Stockfish al responder el estudiante, sin analizar todo el set durante la importación;
- respetar la distancia de mate al aceptar alternativas: por ejemplo, aceptar mates equivalentes en 1, pero no un mate en 2 si existe mate en 1;
- filtrar sets por ELO, tema, origen y etiquetas;
- guardar configuración independiente por set;
- ofrecer modo tradicional de resolución guiada;
- ofrecer ciclos Woodpecker sobre el set completo, con tiempo, fallos, progreso, cierre automático al resolverlo y salida anticipada excepcional;
- guiar al estudiante por los ejercicios pendientes del ciclo, permitiendo regresar a un problema;
- mantener Woodpecker separado conceptualmente de la repetición espaciada;
- reservar la creación automática de sets a partir del autoanálisis para la fase Player Analysis.

### 6.2. Entrenamiento de Aperturas

- organizar el contenido como `Repertorio → Variante → Línea`;
- permitir múltiples repertorios con nombre, color y descripción;
- deducir inicialmente variantes y líneas desde el PGN, mostrar una vista previa y permitir que el usuario reorganice después la jerarquía manualmente;
- importar PGN con políticas explícitas para líneas principales y sublíneas;
- marcar sublíneas como entrenables, ilustrativas o no obligatorias;
- conservar comentarios y el árbol completo para lectura/análisis aunque una rama se excluya del entrenamiento;
- permitir elegir líneas concretas o entrenar el repertorio completo;
- comenzar las líneas desde el principio y pedir al estudiante que adivine las jugadas;
- evaluar cada jugada contra el repertorio correspondiente: una jugada buena fuera del repertorio se informa como desviación, mientras que una jugada imprecisa o equivocada se marca como incorrecta;
- usar un umbral general de 0.30 peones (30 centipeones) para distinguir una desviación buena de una jugada imprecisa;
- detener el entrenamiento después de una desviación buena para mostrar el aviso antes de continuar;
- conservar y marcar las transposiciones sin colapsar el orden de jugadas entrenado;
- entrenar contra bots desde posiciones del repertorio;
- cargar y analizar el repertorio jugada a jugada con motores y bases de datos;
- ofrecer repetición espaciada con una experiencia tipo Chessable sobre líneas completas;
- permitir repetir una línea concreta sin límite cuando el estudiante lo solicite;
- recomendar líneas según cobertura, errores y progreso;
- priorizar opcionalmente por frecuencia de Lichess, rating y control de tiempo;
- versionar, exportar y respaldar cada repertorio;
- añadir posteriormente un apartado de partidas modelo asociado a cada repertorio; estas partidas se analizan, pero no se entrenan como líneas de memoria;
- mantener este flujo separado de los ciclos Woodpecker de Táctica.

### 6.3. Entrenamiento de Finales

La parte de Finales se crea desde cero. La primera versión debe concentrarse en posiciones didácticas
comunes y objetivos verificables, antes de añadir posiciones estratégicas o complejas importadas por
el usuario.

- incluir finales de rey y peones, torres y piezas menores;
- incluir damas solo cuando la posición tenga un valor pedagógico claro;
- esperar el primer conjunto de contenido del usuario, compuesto por muchas posiciones FEN agrupadas;
- importar el conjunto desde un PGN exportado de un estudio de Lichess, interpretando las posiciones FEN incluidas en el PGN y no como partidas completas que deban descubrirse;
- permitir elegir el tipo de final que se desea estudiar;
- permitir jugar contra bot humano, Stockfish o una referencia configurada;
- usar inicialmente Maia en su ELO máximo como rival predeterminado y permitir cambiar a Stockfish;
- calcular automáticamente el objetivo teórico de cada posición y permitir corregirlo manualmente;
- comprobar la consecución del objetivo al terminar, no limitarse a evaluar una única mejor jugada;
- considerar inicialmente una victoria completada únicamente al dar jaque mate; la validación por resultado teórico se añadirá después;
- enseñar el objetivo y el resultado de forma comprensible para el estudiante;
- consultar preferentemente la tablebase remota cuando la posición sea elegible;
- aceptar tablebases locales configuradas por el usuario, reutilizando `SyzygyPath`, sin descargar automáticamente colecciones grandes;
- declarar el criterio utilizado cuando la posición esté fuera de tablebase o no haya conectividad;
- incluir una acción independiente para abrir cualquier posición en el tablero de análisis;
- reservar para una iteración posterior las posiciones más estratégicas, de libro o complejas basadas en PGN.

#### Criterio técnico para finales

Una tablebase es una base de datos precalculada de finales. Para las posiciones y cantidades de piezas
que cubre, puede indicar si el resultado teórico es victoria, tablas o derrota (WDL) y, según la base,
la distancia a una conversión o a cero movimientos (DTZ/DTM). Syzygy es una familia habitual. Para no
imponer una descarga local muy grande, se priorizará la consulta remota y se mantendrá `SyzygyPath`
como opción avanzada del usuario. La interfaz debe explicar que la consulta remota requiere conexión.
Si una posición queda fuera de tablebase, la app debe usar un criterio de Stockfish claramente
configurado y no presentar esa evaluación como una verdad teórica absoluta.

### 6.4. Infraestructura reutilizable, sin mezclar experiencias

- parser PGN/FEN configurable;
- vista previa, diagnóstico de errores y reglas de importación;
- representación de posiciones, variantes y transposiciones;
- almacenamiento versionado con namespaces separados por área;
- exportación y backup por área, sin obligar a compartir sesiones;
- reutilización de tablero, motores, bots y bases de datos ya existentes;
- componentes de estadísticas reutilizables sin crear una sesión global;
- migraciones explícitas y no destructivas para repertorios y puzzles actuales;
- accesos directos desde el tablero de análisis para añadir una línea a un repertorio, crear un ejercicio de final o iniciar una partida contra un bot desde la posición actual.

### 6.5. Primer corte especializado implementado

- `/training` funciona como centro de las tres áreas y no como una sesión global;
- el hub queda preparado para incorporar posteriormente resúmenes de sesiones, progreso transversal y recomendaciones, sin mezclar la configuración de los tres entrenadores;
- el acceso existente de Puzzles abre `/training/tactics`; Finales tiene además acceso directo desde el inicio;
- `/training/tactics` conserva el acceso al entrenador Lichess y permite revisar, configurar e importar sets PGN propios;
- los PGN tácticos grandes quedan referenciados por ruta y se leen registro por registro al practicar;
- `/training/tactics/practice/:setId` usa las líneas preparadas del PGN y valida bajo demanda con un motor local cuando el registro solo contiene FEN o así se configura;
- el modo Woodpecker muestra tiempo, problemas restantes y fallos, y cada ciclo sucesivo vuelve a incluir el set completo;
- `/training/openings` revisa el PGN, deduce capítulos/variantes y genera una copia editable completa sin alterar la fuente;
- el dashboard prioriza crear repertorios propios desde cero y permite añadir nuevos capítulos para construirlos en el tablero;
- cada variante se edita con comentarios y árbol completo; la práctica selecciona explícitamente las líneas habilitadas;
- la repetición espaciada no solicita dificultad después de cada movimiento: mantiene el flujo y programa la línea al terminarla;
- los capítulos identificados como partidas modelo se muestran dentro del repertorio, pero no se incluyen en la práctica;
- cada variante se puede renombrar, reordenar, reclasificar y filtrar por líneas sin modificar el PGN fuente;
- la sesión de repertorio completo avanza automáticamente al siguiente capítulo entrenable al terminar sus líneas;
- una desviación dentro de 30 centipeones se informa como buena y pausa la práctica antes de regresar a la continuación preparada;
- `/training/endgames` importa los FEN del PGN de un estudio, consulta objetivos remotos y permite iniciar una partida desde cualquier posición;
- los tres estudios incluidos instalan 180 posiciones una sola vez; cada PGN fija por posición el
  objetivo y el color del estudiante, independiente del lado al turno, para jugar contra Maia máximo
  o Stockfish;
- la biblioteca genérica anterior permanece solo como ruta técnica oculta y deja de presentarse como experiencia principal;
- los formatos reales revisados, sus límites y las políticas previstas se documentan en `docs/training-import-formats-phase-6.es.md`;
- la suite automática queda en 89 pruebas pasando y el build web se valida correctamente.

### 6.6. Estabilidad interactiva con bases de datos grandes

**Estado: Núcleo implementado y validación automática aprobada. La prioridad/cancelación de cobertura
se completó en 7.0; prueba manual de interfaz y build empaquetada pendientes.**

El problema inicial era un escaneo mmap completo por cada FEN, dos consultas simultáneas y solicitudes
obsoletas trabajando o esperando turno, con una caché sin límite explícito. 6.6 corrigió cancelación y
límites; 7.0 amplió la infraestructura compartida. El objetivo no es
prometer latencia instantánea para cualquier consulta en debug, sino mantener siempre la aplicación
responsiva y dedicar recursos a la posición que el usuario está viendo.

#### Resultado implementado el 2026-08-26

- cada búsqueda posee un identificador monotónico y la solicitud más reciente reemplaza y cancela la
  anterior de la misma pestaña, incluso si cambia de base;
- cerrar el panel o abandonar una base local cancela explícitamente el trabajo de esa pestaña;
- las esperas del bloqueo por posición y del semáforo despiertan al cancelar, y el escaneo paralelo
  comprueba la señal cooperativamente sin esperar a recorrer el índice completo;
- el frontend ignora eventos de progreso anteriores y una solicitud cancelada no hidrata SQLite, no
  escribe en caché ni publica resultados obsoletos;
- la caché de posiciones es una LRU de 64 entradas, se invalida por base y solo conserva resultados
  terminados;
- se instrumentaron espera por colisión, espera de semáforo, preparación mmap, escaneo, hidratación
  SQLite, tiempo total y aciertos de caché;
- sobre `Gigabase.db3` con 10.355.465 partidas, el benchmark debug de una posición con 933.494
  coincidencias tardó 28,641 s; una cancelación solicitada a los 100 ms detuvo el escaneo en 102,134 ms,
  con 0,174 ms de latencia desde la señal;
- los tiempos confirman que 6.6 evita trabajo acumulado, pero no vuelve rápida una búsqueda completa:
  7.0 debe estudiar un índice por posición u otra estrategia persistente.

#### Etapa A — Observabilidad y regresión

- identificar cada solicitud con pestaña, base, FEN normalizada y generación de consulta;
- medir espera de semáforo, apertura/reuso del mmap, escaneo, consulta SQLite final y serialización;
- registrar canceladas, aciertos de caché y respuestas descartadas sin tratarlas como errores;
- crear una regresión de navegación rápida y un benchmark repetible sobre una base pequeña, además
  de una prueba manual con la base real;
- comparar desarrollo y release sin usar la diferencia de optimización como sustituto de cancelación.

#### Etapa B — Latest request wins

- mantener como máximo una búsqueda interactiva vigente por pestaña y base;
- al cambiar FEN, filtros, base o cerrar el panel, marcar como cancelada la solicitud anterior;
- comprobar la cancelación dentro del escaneo paralelo a intervalos acotados y antes de la consulta
  SQLite, la escritura en caché y la emisión del resultado;
- impedir que una respuesta antigua reemplace estadísticas o partidas de la FEN actual;
- dar prioridad a consultas visibles sobre cobertura, precálculos o pestañas ocultas;
- cancelar también solicitudes que esperan semáforo, no solo las que ya comenzaron a escanear.

#### Etapa C — Caché y rendimiento medido

- conservar únicamente resultados completos y asociarlos a la huella/versionado del índice;
- reemplazar la caché ilimitada por una LRU con límite de entradas o memoria;
- evaluar una caché persistente opcional solo después de medir tamaño, invalidación y beneficio;
- no lanzar prefetch mientras el usuario navega rápido; considerar prefetch de adyacentes solo al
  quedar inactivo;
- perfilar el escaneo antes de decidir si hace falta un índice persistente por posición o un cambio de
  formato. La cancelación corrige la interactividad, pero no sustituye una mejora algorítmica si una
  sola consulta sigue siendo demasiado lenta.

#### Criterios de salida

- [x] una ráfaga de navegación termina mostrando exclusivamente la última posición en la regresión
      automática;
- [x] las consultas obsoletas dejan de consumir trabajo significativo en un plazo medido y acotado;
- [x] no crecen indefinidamente la cola de consultas ni la caché;
- [x] cambiar o cerrar pestaña libera su trabajo pendiente;
- cobertura oculta no compite con una consulta visible;
- el flujo se valida con la base de 10,35 millones tanto en desarrollo como en ejecutable empaquetado,
  registrando tiempos y memoria en lugar de exigir que ambos modos tengan idéntica latencia.

### 6.7. Shell de producto centrado en el tablero

**Estado: Prototipo probado por el usuario; correcciones finales implementadas el 2026-08-27. Falta comprobar estas correcciones en escritorio y completar los criterios de usabilidad/release.**

La idea se entiende así: al abrir la aplicación o crear una pestaña, el contenido principal es un
tablero de análisis listo para usar. La barra superior conserva escenarios/pestañas. La barra lateral
contiene destinos y acciones globales. El panel grande de la derecha cambia según el contexto del
tablero o del modo activo. Entrenamiento conserva dashboards propios cuando el usuario necesita elegir
Táctica, Aperturas o Finales.

#### Ajustes tras la prueba del usuario — 2026-08-27

- Jugar usa un icono de reproducción y Entrenamiento mantiene la diana; los accesos de juego del
  tablero usan el mismo icono de reproducción.
- El hub y las rutas de Entrenamiento comparten la barra de pestañas. Elegir Táctica, Aperturas o
  Finales cambia el nombre y contenido de la misma pestaña; cambiar a otra pestaña restaura su ruta.
  Se mantienen duplicación, reordenación, cierre y atajos; cerrar la última crea un análisis vacío.
- «Jugar desde aquí» deja intacto el análisis/repertorio y crea una pestaña de juego con identidad
  propia, sin origen de archivo. Solo copia el historial hasta el nodo seleccionado, incluidas
  subvariantes y FEN inicial; no utiliza el final de la línea principal ni una sesión anterior.
- La confirmación de cierre se muestra también en Juego y Generador de partidas modelo y se vincula a la pestaña
  solicitada, incluso si se cierra desde Entrenamiento. «Guardar y cerrar» espera la escritura;
  cancelar o fallar conserva la pestaña y el estado sucio. El origen cambia solo tras guardar bien.
- 19 regresiones específicas pasan, incluidas pruebas de componentes/rutas montados, conservación
  del repertorio, posición de subvariante, cancelación/error de guardado y cierre de una partida
  antigua con cambios pendientes. La suite frontend completa pasa sus 118 pruebas. Typecheck y
  build web de producción correctos; lint sin errores, con dos avisos previos en
  las dependencias del menú de `__root.tsx`.
- La conexión Browser no pudo abrir la vista local; no se afirma validación visual ni de bots reales
  para estos últimos ajustes. Smoke test recomendado: hub → cada área → otra pestaña → regreso,
  repertorio/subvariante → Jugar → bot humano y cierre de partida con/sin guardado.

#### Resultado implementado el 2026-08-26

- la primera pestaña, el botón `+`, el menú y el atajo de nueva pestaña crean directamente un tablero
  de análisis; `NewTabHome` se conserva únicamente para restaurar sesiones antiguas durante la
  transición;
- la barra lateral separa Tablero, Jugar, Importar y Entrenamiento de Archivos, Bases, Motores y
  Cuentas; el Generador de partidas modelo queda agrupado como herramienta avanzada;
- la barra puede expandirse a etiquetas visibles o contraerse a iconos con tooltips, y recuerda la
  preferencia local;
- una tarjeta discreta en el panel Información del tablero vacío ofrece Jugar, Importar y elegir una
  actividad de entrenamiento, y desaparece al cargar contenido o modificar la posición;
- Jugar e Importar reutilizan por defecto únicamente la pestaña activa si es un análisis sin origen ni
  estado persistido o pendiente de escritura; una preferencia de Tablero permite crear siempre otra;
- el menú/atajo para abrir PGN y el arrastrar/soltar aplican la misma comprobación de vacío. Varios
  archivos arrastrados solo pueden reutilizar la pestaña para el primero;
- el modal de importación carga PGN, enlace o FEN en la pestaña preparada y se cierra después de una
  importación correcta; nunca reemplaza una pestaña que tenga estado almacenado;
- cuatro regresiones cubren detección de vacío, estado aún pendiente del debounce, reutilización
  activada y preservación de pestañas con contenido; typecheck, formato y build web pasan.

#### Navegación prevista

- **Tablero**: vuelve a la pestaña/tablero activo; una pestaña nueva nace como análisis, no como una
  pantalla de tarjetas;
- **Jugar**: abre una pestaña de juego o convierte una pestaña nueva sin contenido, mostrando su
  configuración en el panel derecho;
- **Importar**: abre el modal sobre el tablero y carga el resultado en la pestaña actual o en una nueva
  según una regla visible y consistente;
- **Entrenamiento**: abre el hub en una pestaña; elegir Táctica, Aperturas o Finales transforma esa
  pestaña en el área correspondiente. Las actividades conservan sus flujos de tablero y regreso;
- **Archivos, Bases, Motores y Ajustes**: continúan como espacios de administración, sin competir con
  las acciones primarias;
- **Herramientas experimentales**: Model Game Generator y análisis de experimentos deben quedar en
  un grupo avanzado, no al mismo nivel visual que Jugar o Entrenar.

#### Riesgos que debe resolver el prototipo

- una barra lateral solo con iconos puede ser tan intimidante como la pantalla actual; ofrecer
  etiquetas, tooltips y, si cabe, modo expandido;
- distinguir destinos de navegación de acciones inmediatas como Importar o Nueva partida;
- no convertir cada clic lateral en una pestaña nueva ni destruir trabajo no guardado;
- reutilizar por defecto la pestaña de análisis si está realmente vacía y ofrecer una preferencia para
  crear siempre una pestaña nueva;
- definir qué sucede al cerrar la última pestaña y qué panel derecho aparece por defecto;
- conservar atajos, arrastrar/soltar PGN, restauración de sesión y origen de archivos;
- evitar que el tablero vacío oculte descubrimiento: mostrar acciones iniciales discretas en el panel
  derecho y una primera experiencia guiada, no una portada permanente.

#### Criterios de salida

- prototipo navegable probado con al menos una persona que no haya usado la aplicación;
- [x] Jugar, Analizar, Importar y Entrenar son alcanzables sin volver a la antigua cuadrícula;
- [x] la reutilización automática rechaza pestañas con estado persistido u origen y posee regresiones;
- [x] menú, atajo, arrastrar PGN y barra lateral comparten la regla de reutilización segura;
- se valida teclado, ventana estrecha y escalado de interfaz antes de eliminar definitivamente
  `NewTabHome`.

### 6.8. Pulido de entrenamiento, repertorios, PGN e idiomas

**Estado: Implementada el 2026-08-27; regresión de incorporación corregida el 2026-09-07;
pendiente de validación manual nativa y empaquetada.**

Accesos, reglas de conflicto, recuperación y matriz manual en `docs/training-phase-6-8.es.md`.
La incorporación exige vista previa y confirmación, conserva respaldos del PGN editable, rechaza
cambios pendientes/conflictos y refresca pestañas e índices PGN. La biblioteca modelo queda separada
de la memorización. Los catálogos de referencia contienen 1.470 claves por idioma, sin valores vacíos
ni claves literales ausentes; `npm run i18n:check` verifica también interpolaciones y texto JSX de
Entrenamiento/Práctica. La cobertura de claves no equivale a validar todos los textos dinámicos o
flujos nativos.

#### Táctica

- ocultar la acción de finalización «Siguiente problema» cuando el avance automático está activo;
- conservar separada la navegación manual Anterior/Siguiente usada para revisar ejercicios;
- probar que el breve estado correcto no muestre una acción redundante antes del temporizador.

#### Aperturas y repertorios

- cambiar a **todas las subvariantes** el valor predeterminado para nuevas importaciones, sin alterar
  repertorios ya importados;
- importar un PGN completo o registros seleccionados dentro de una variante/carpeta existente;
- desde el tablero de análisis, añadir la línea actual o un árbol seleccionado a un repertorio y
  variante concretos;
- permitir guardar una partida como partida modelo de un repertorio;
- [x] recuperar la partida canónica cuando una pestaña abierta desde una base, Games u Opening
      Report todavía no tiene hidratado su árbol; una partida modelo copia la partida completa y una
      línea solicitada desde la posición inicial usa la línea principal completa, nunca un registro de
      cero jugadas;
- mostrar partidas modelo en una sección o biblioteca visual propia dentro del repertorio, conservando
  su relación con él pero sin presentarlas como líneas entrenables;
- definir conflictos por FEN inicial, duplicados, color, comentarios, transposiciones y nombres antes
  de escribir sobre la copia canónica;
- mantener el PGN fuente inmutable y registrar toda incorporación en la copia editable.

#### PGN general

- hacer explícita la acción **Guardar como PGN nuevo** para partidas importadas o modificadas;
- diferenciar Guardar, Guardar como y Exportar copia, con avisos de sobrescritura y origen visibles;
- probar archivos de una y varias partidas y no depender de que el archivo original sea temporal.

#### Idiomas

- auditoría inicial del 26 de agosto de 2026: `en-US` contiene 840 claves sin valores vacíos;
  `es-ES` contiene 845 claves, 289 valores vacíos, 14 claves inglesas ausentes y 19 claves que aún no
  existen en inglés. Además hay aproximadamente 143 cadenas españolas candidatas escritas directamente
  en archivos TypeScript/TSX;
- migrar primero todo texto nuevo escrito directamente en componentes a claves de traducción;
- completar `es-ES` y `en-US` como idiomas de referencia antes de ampliar otros idiomas;
- aplicar fallback a inglés y no mostrar cadenas vacías;
- medir cobertura por claves y añadir una verificación automática de claves ausentes;
- mantener durante un periodo amplio el esfuerzo activo exclusivamente en español e inglés;
- priorizar otros idiomas mucho más adelante según usuarios reales o colaboradores, en vez de
  declarar todos los idiomas existentes como completos.

### 6.9. Reconocimiento y demostración de finales

**Estado: Implementada el 2026-09-08; validación manual nativa y empaquetada pendiente.**

- [x] presentar la posición inicial en un tablero no interactivo y señalar explícitamente qué color mueve;
- [x] pedir la clasificación **ganan blancas**, **tablas** o **ganan negras** antes de jugar;
- [x] ocultar en las tarjetas incluidas el objetivo que revelaba anticipadamente la respuesta;
- [x] reutilizar tanto las posiciones incluidas como los sets importados por el usuario;
- [x] revelar la respuesta tras cada intento y registrar «No sé» como fallo;
- [x] separar intentos, aciertos, fallos y tiempo de reconocimiento del progreso de juego contra motor;
- [x] permitir abrir el análisis después de responder para investigar el porqué;
- [x] permitir continuar con el modo actual contra Maia o Stockfish para demostrar el resultado jugando;
- [x] presentar el cuestionario a pantalla completa con un tablero de hasta el 84 % de la altura
      visible, cercano al tamaño del análisis normal, y mantenerlo en una sola columna en ventanas
      estrechas;
- [x] permitir jugar directamente desde la tarjeta o el cuestionario sin responder primero;
- [x] contar una posición como completada solo después de jugar y alcanzar el objetivo;
- [x] permitir abrir una posición aleatoria dentro del tema activo, evitando repeticiones consecutivas;
- [x] migrar sin pérdida el almacenamiento local del esquema 10 al 11;
- [ ] validar manualmente tablero, respuesta, persistencia, análisis y demostración en Windows empaquetado;
- [ ] añadir en una iteración posterior sesiones continuas completas por tema o set; la selección
      aleatoria actual abre un ejercicio cada vez.

La respuesta se deriva del objetivo ya fijado para la posición y del color del estudiante. En el
contenido incluido esos objetivos proceden de la preparación verificada del set; los sets propios
deben calcular o establecer su objetivo antes de iniciar el reconocimiento. La tabla de progreso de
juego no se incrementa al contestar: reconocer y convertir el final son habilidades relacionadas,
pero distintas.

La implementación, persistencia y matriz manual se documentan en
`docs/training-phase-6-9.es.md`.

---

## Fase 7 — Inteligencia sobre bases de datos y jugadores

**Estado: Núcleo 7.0–7.2 implementado; validación manual pendiente.**

### 7.0. Base escalable de consultas

**Estado: Implementada, con pruebas automáticas y benchmark real; validación nativa/empaquetada pendiente.**

Resultado en `docs/database-queries-phase-7-0.es.md`: resumen + coincidencias temporales acotadas +
paginación de metadatos + apertura de un PGN bajo demanda. Comparación exacta con enroques/captura
al paso, desconocidos separados, revisión base/WAL/índice, prioridad y cancelación, lectura segura
de v4 y construcción incremental de v5. Games ya utiliza esta infraestructura sin duplicar la lista.

Gigabase: 933.494 coincidencias, 26,005 s de escaneo debug, páginas P50/P95 15,799/22,323 ms y caché
0,601/0,871 ms; primera validación v4 25,351 s. No se promete rapidez instantánea del primer FEN.
El índice global por firmas se evaluó y no se construyó: una estimación simple arroja ~12,26 GiB;
el coste CPU de reproducción/hashing se estimó con una muestra, no con una construcción completa.
7.1 agrega teoría desde las coincidencias por lotes, sin un escaneo global por cada variante.

Esta etapa parte de 6.6. La cancelación evita trabajo obsoleto y protege la experiencia, pero esta fase
debe medir si el escaneo completo por FEN sigue siendo aceptable para reportes, filtros y paginación.

- separar el resumen agregado, la obtención de identificadores coincidentes y la hidratación de
  partidas;
- definir una huella estable de base/índice para invalidar cachés;
- evaluar un índice por firma de posición solo con benchmarks y estimación de tamaño/tiempo de build;
- soportar progreso, cancelación, prioridad, límites de recursos y recuperación ante índice corrupto;
- evitar cargar bases completas o listas masivas de partidas en memoria;
- compartir resultados entre estadísticas, lista de partidas y reportes sin repetir el mismo escaneo.

### 7.1. Opening Reports y ampliación del explorador existente

**Estado: Núcleo inicial implementado; pruebas automáticas y benchmark real ejecutados. Cierre visual/nativo/empaquetado pendiente.**

Resultado en `docs/opening-reports-phase-7-1.es.md`: informe explícito desde la pestaña **Informe**,
estadísticas de todas las coincidencias, evolución anual, franjas ELO, jugadores frecuentes y más
fuertes, tabla de teoría, órdenes de llegada, transposiciones y apertura de líneas o referencias en
otro tablero. Cada jugador abre sus coincidencias en otra pestaña Games. Exporta HTML autónomo,
árbol de teoría PGN y hasta 20 partidas de referencia PGN; no modifica la base original.

La teoría usa una selección determinista por ELO medio, año e ID: 5.000 partidas por defecto,
máximo 10.000 y profundidad de 1–16 medias jugadas. No se presenta como muestra representativa.
La tabla muestra hasta 64 líneas con su cobertura explícita; órdenes y transposiciones comparten
esa selección. Las estadísticas generales no se recortan a ese límite. El informe se conserva en
la caché de sesión del snapshot; guardar a largo plazo significa exportar, no una biblioteca nueva.

**Ajuste de alcance solicitado el 2026-08-28:** el objetivo principal son los Opening Reports,
tomando como referencia funcional los informes de ChessBase y Scid vs. PC. No es necesario mostrar
partidas debajo de las estadísticas ni duplicar la pestaña **Games**, que ya cumple esa función.
Se ampliará esa pestaña cuando falten capacidades necesarias para consultar la evidencia del reporte.
La muestra anterior de hasta 500 partidas fue sustituida en 7.0 por paginación de todas las
coincidencias y apertura en el nodo encontrado. Los filtros de jugador/cualquier color, fecha,
resultado y rango ELO se heredan en el informe. Games permite ordenar el conjunto completo por
fecha, ELO medio, ELO de blancas, ELO de negras o identificador. Quedan como ampliación posterior
los filtros de evento/control de tiempo y una definición útil de relevancia. La paginación de 20
filas evita montar listas masivas; no se añadió otra capa de virtualización a esa tabla.

#### Partidas coincidentes — reutilizar Games (objetivo ampliado; pendientes indicados arriba)

- completar la tabla existente con blancas, negras, ELO, fecha, evento, resultado y jugada
  posterior a la posición;
- abrir una partida en otra pestaña exactamente en la posición coincidente;
- filtros por jugador, color, ELO, fecha, resultado, evento y control de tiempo cuando exista;
- orden por ELO, fecha, relevancia o identificador;
- paginación o cursor estable, carga incremental y total/muestra claramente diferenciados;
- cancelar al cambiar de posición y reutilizar la consulta agregada cuando los filtros lo permitan;
- virtualizar la tabla y no enviar cientos de PGN completos si solo se necesitan metadatos;
- mostrar estados parciales sin mezclar datos de dos FEN.

Esta lista no debería ralentizar el primer resultado agregado: conviene entregar primero el resumen y
la primera página, y cargar detalles bajo demanda. Los filtros que cambien el universo estadístico
deben volver a consultar; los filtros puramente visuales sobre la página actual no.

#### Opening Reports

Crear reportes por posición, no únicamente por nombre ECO, para manejar transposiciones.
El reporte debe sintetizar la apertura y enlazar con sus partidas y variantes, no limitarse a otra
tabla de resultados. La comparación con ChessBase y Scid vs. PC orienta el diseño; no implica
prometer paridad completa.

Alcance acordado el 2026-08-28:

- primera versión sobre bases locales, con estadísticas, tabla de teoría y transposiciones;
- temas estratégicos, planes y finales típicos quedan pendientes para una ampliación posterior;
- fuentes Lichess para informes quedan pendientes para otra ampliación; el explorador Lichess
  existente se conserva, pero no se integra todavía como fuente de estos informes;
- incluir preferentemente exportación HTML del informe y PGN de partidas/variantes en 7.1;
  ambas quedaron implementadas en el núcleo inicial;
- no se implementa Player Analysis como parte de 7.0–7.1.

Contenido del informe local ampliado:

- estadísticas generales;
- resultados y frecuencia por franja de rating;
- tendencias por fecha;
- jugadores que más juegan la posición, con colores, resultados, puntuación, porcentaje de
  victorias y ELO medio/máximo;
- jugadores más fuertes por su mayor ELO registrado en una coincidencia, incluso con una partida;
- continuaciones principales;
- acceso directo a todas las partidas coincidentes de cada jugador en una pestaña Games nueva.

La base local no guarda títulos FIDE, por lo que «maestros» no puede clasificarse por título sin
inventar datos: ambas tablas muestran nombres y ELO reales. El detalle por jugador conserva FEN,
base, fecha, resultado y rango ELO; aplica el jugador con cualquier color.
Partidas modelo, novedades y desviaciones frecuentes permanecen como ampliaciones posteriores.

Requisitos de escala:

- acceso por posición medido; reutilizar snapshots de 7.0 y evaluar un índice persistente adicional
  solo si el benchmark del reporte lo justifica;
- consultas en segundo plano;
- progreso y cancelación;
- caché;
- paginación;
- no cargar bases completas en memoria.

#### Criterios de salida de 7.0–7.1

- navegar posiciones no acumula consultas ni presenta resultados obsoletos;
- estadísticas y primera página comparten trabajo medido;
- los resultados son reproducibles para la misma huella de base, FEN y filtros;
- una base de 10,35 millones mantiene memoria acotada y permite cancelar;
- abrir una partida conserva su base, identificador y nodo coincidente;
- los tiempos P50/P95, tamaño de índice/caché y hardware de prueba quedan documentados.

### 7.2. Player Analysis

**Estado: Núcleo implementado el 2026-08-29; cierre funcional ampliado el 2026-09-07 y validación
manual nativa/empaquetada pendiente.**

Resultado y límites en `docs/player-analysis-phase-7-2.es.md`. El perfil personal y el perfil de un
jugador de base incorporan una pestaña Análisis con fuentes Lichess/PGN ya importadas, filtros,
estadísticas por color/ritmo/fuerza/apertura/rival/año, hallazgos con evidencia y perfil local
versionado recalculable o eliminable. Una muestra explícita de hasta 100 partidas reutiliza el motor
local para ACPL, errores, fases, conversión, defensa y candidatos entrenables. Las posiciones pueden
abrirse en su ply o añadirse a un set táctico propio conservando procedencia y deduplicación.

Analizar principalmente partidas históricas obtenidas de una cuenta de Lichess o importadas por el
usuario mediante PGN. La procedencia, filtros, periodo y tamaño de muestra deben quedar visibles y
versionados. Detectar:

- errores recurrentes;
- rendimiento por fase;
- aperturas problemáticas;
- conversión de ventajas;
- defensa de posiciones inferiores;
- administración del tiempo;
- patrones tácticos o estratégicos;
- resultados por color y rival;
- posiciones candidatas para entrenamiento.

Cada conclusión debe mostrar evidencia, partidas y tamaño de muestra. Las recomendaciones deben enlazar con posiciones entrenables, no limitarse a consejos genéricos.

#### Requisitos añadidos al cierre de 7.2 — 2026-09-07

- permitir una selección múltiple explícita de ritmos —Bullet, Blitz, Rapid, Classical y los que
  existan en la fuente— antes de ejecutar el motor; solo esas partidas forman la muestra y la
  interfaz muestra los ritmos elegidos y su tamaño. El selector único descriptivo actual no basta;
- permitir elegir la perspectiva de cada ejercicio creado desde un error personal:
  - **mejorar mi decisión**: posición anterior al error, mueve el jugador y debe encontrar su mejor
    alternativa;
  - **castigar mi error**: posición inmediatamente posterior al error, mueve el rival y debe
    encontrar el mejor castigo;
- guardar en la procedencia el modo, ply, bando al turno y solución; validar que FEN y turno
  corresponden a la perspectiva elegida y deduplicar sin confundir ambas versiones;
- explicar junto a «errores recurrentes» que la cantidad actual es el número de posiciones críticas
  con la misma fase, severidad y apertura/ECO. No significa la misma jugada, la misma posición ni un
  motivo táctico repetido.

#### Integración con Entrenamiento

- mostrar en el hub de Entrenamiento estadísticas avanzadas derivadas del historial analizado;
- recomendar Táctica, Aperturas o Finales a partir de debilidades respaldadas por evidencia;
- crear colas o colecciones entrenables desde posiciones concretas, conservando el enlace con las
  partidas de origen;
- medir si el entrenamiento recomendado mejora errores posteriores sin presentar correlación como
  causalidad;
- separar estadísticas de juego, estadísticas de entrenamiento y recomendaciones para que el usuario
  comprenda de dónde proviene cada conclusión;
- permitir desactivar, recalcular y borrar el perfil analítico local.

### 7.3. Mejoras de inteligencia de aperturas y jugadores

**Estado: Diferida.**

Concentra todas las ampliaciones posteriores de 7.1 y 7.2:

- temas estratégicos, planes y finales típicos en Opening Reports;
- informes desde Lichess remoto, biblioteca persistente, títulos/perfiles, partidas modelo,
  novedades, desviaciones y filtros de evento/control de tiempo/relevancia;
- consulta de metadatos de jugador sin hidratar PGN, alias múltiples y sincronización incremental;
- administración del tiempo con cobertura `[%clk]` explícita;
- motivos tácticos verificables y patrones estratégicos con confianza visible;
- agrupación futura por posición normalizada, jugada o motivo verificable, separada del contador
  amplio actual por fase, severidad y ECO;
- tablebases y clases de finales dentro del perfil;
- comparación temporal del perfil y relación observacional con el entrenamiento;
- creación y actualización automática, siempre configurable, de un set de errores tácticos;
- exportación e historial persistente de versiones del perfil.

---

## Fase 8 — Serious Preparation Tools

**Estado: Pendiente.**

Orientada especialmente al equipo de ajedrez del TEC.

### Funcionalidad potencial

- opening reports;
- preparación de rival;
- repertorio probable por color;
- desviaciones recientes;
- posiciones críticas;
- partidas modelo;
- líneas específicas de preparación;
- asignación de tareas;
- paquetes compartibles;
- flujos avanzados de entrenamiento de equipo.

Comenzar con paquetes locales exportables antes de añadir cuentas, nube o colaboración en tiempo real. Esto permite validar el uso real sin introducir prematuramente servidores, autenticación y sincronización.

---

## Fase 9 — Producción, open source y MLOps

**Estado: Transversal y de largo plazo.**

### Producto

- migraciones de datos;
- backups y recuperación;
- detección de archivos corruptos;
- privacidad local;
- telemetría solamente opcional;
- instaladores multiplataforma;
- [ ] habilitar y validar el actualizador firmado en macOS Intel, macOS Apple Silicon y Linux,
      incluyendo instalación, relanzamiento, permisos, firma, fallo de red y recuperación;
- actualizaciones;
- accesibilidad;
- documentación de usuario;
- estrategia de sincronización con upstream.

### Experimentación y MLOps

- manifiestos reproducibles;
- versionado de perfiles y modelos;
- hashes de binarios y pesos;
- registro y procedencia de datasets;
- pipelines de evaluación;
- comparación de experimentos;
- pruebas de regresión;
- artefactos exportables;
- model cards y dataset cards;
- CI con experimentos pequeños reproducibles.

### Evidencia para portafolio

- diagramas de arquitectura;
- ADRs;
- benchmarks;
- informes de experimentos;
- decisiones de producto;
- issues y roadmap públicos;
- documentación de licencias;
- releases reproducibles.

### Capa final recomendada para datos, automatización y MLOps

El proyecto ya puede demostrar más que full-stack si su evidencia se convierte en un caso de estudio
reproducible. No hace falta añadir un modelo decorativo. El cierre profesional recomendado es un
pipeline pequeño pero completo:

1. seleccionar una pregunta medible, por ejemplo diferencias observables entre perfiles Maia o
   dificultad práctica de posiciones;
2. versionar dataset, filtros, configuración, motores/modelos, semillas y hardware;
3. ejecutar generación/ingesta, validación de datos, cálculo de métricas y comparación de corridas de
   forma automatizada;
4. producir artefactos consultables: tablas, gráficos, PGN representativos, manifiesto y reporte;
5. añadir pruebas de calidad de datos y una corrida pequeña en CI;
6. documentar arquitectura, ADRs, costos, limitaciones, sesgos, licencias y cómo reproducir el
   resultado desde cero;
7. publicar una página de caso de estudio enlazada al repositorio y a un release reproducible.

Esto aporta evidencia directa de ingeniería de datos, automatización de experimentos y MLOps. Un
entrenamiento nuevo de ML solo se justifica si existe una pregunta que los modelos actuales no puedan
responder y un conjunto de datos legalmente utilizable.

---

## Fase 10 — Evolución avanzada de bots y torneos interactivos

**Estado: Diferida.** Esta fase retoma los pendientes de la beta de la Fase 4 después de las
prioridades de producto y, como mínimo, después de la Fase 7.

### Calibración y personalidad

- [ ] diseñar una batería de posiciones iniciales para contrastar las personalidades en apertura,
      medio juego, final, posiciones tácticas, estratégicas y de desequilibrio material;
- [ ] ejecutar muestras reproducibles por posición, color, rival, apertura y control de tiempo;
- [ ] medir automáticamente distribución de jugadas, tiempos, salida de repertorio, fases,
      complejidad, agresión observable y diferencias por color;
- [ ] combinar análisis automático con revisión humana de partidas representativas, sin exigir
      revisar manualmente cientos de partidas;
- [ ] estimar fuerza relativa con tamaños de muestra, intervalos de confianza y dependencia por
      rival, color, apertura y control de tiempo;
- [ ] ajustar repertorios, muestreo, timing y etiquetas editoriales únicamente a partir de evidencia.

### Catálogo y selección

- [ ] ampliar progresivamente el catálogo desde 15 hasta aproximadamente 30 bots realmente
      diferenciados;
- [ ] comprobar que los perfiles nuevos sean estadísticamente distinguibles antes de publicarlos;
- [ ] evolucionar las líneas ponderadas hacia árboles con contexto, profundidad, salida de teoría,
      probabilidad de desviación y estado reproducible por partida;
- [ ] rediseñar la selección de perfiles para que escale a decenas de bots;
- [ ] añadir búsqueda y filtros avanzados por ELO objetivo, repertorio, color, estilo, agresión,
      complejidad, teoría, catálogo y versión.

### Torneos jugables e interacción en vivo

- [ ] convertir la liga beta en un sistema de torneos con formatos configurables, selección amplia
      de bots y reglas de rondas;
- [ ] permitir que el usuario juegue las rondas contra los bots y conserve la clasificación del evento;
- [ ] mostrar partidas en vivo, tablero, reloj, jugador activo, progreso de la ronda y logs relevantes
      mientras un torneo bot contra bot está en ejecución;
- [ ] añadir recuperación de rondas, pausa/cancelación robustas, clasificación y navegación por
      partidas terminadas;
- [ ] separar la experiencia de torneos del Model Game Generator cuando la funcionalidad principal
      esté lista;
- [ ] estudiar Swiss, eliminación directa, torneos locales y funcionalidades online solo después de
      validar los formatos básicos.

---

## 6. Dependencias clave entre funcionalidades

| Funcionalidad                   | Depende principalmente de                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Calibración automática          | Model Game Generator + Experiment Analysis                                                           |
| Catálogo inicial de bots        | Experiment Analysis + perfiles paramétricos + versionado                                             |
| Bots cada 50 ELO                | Catálogo inicial + calibración + prueba de diferenciación estadística                                |
| Liga automática de bots         | Model Game Generator + Experiment Analysis + perfiles versionados                                    |
| Torneo con participación humana | Liga de bots + persistencia de eventos + reglas de torneo                                            |
| Motor GM/superhumano            | Presets y auditoría UCI                                                                              |
| Dificultad práctica             | Generación repetida + análisis estadístico                                                           |
| Táctica, Aperturas y Finales    | Infraestructura PGN/FEN, tablero, motores y persistencia versionada; experiencias separadas por área |
| Consultas interactivas grandes  | Cancelación por generación + prioridad + caché acotada + benchmarks                                  |
| Partidas por posición           | Consulta escalable + metadatos paginados + hidratación bajo demanda                                  |
| Shell centrado en el tablero    | Modelo estable de pestañas + protección de cambios + paneles contextuales                            |
| Player Analysis accionable      | Pipeline de evaluación + contenido entrenable                                                        |
| Serious Preparation             | Opening Reports + Player Analysis + exportación                                                      |
| Alpha distribuible              | 6.6–6.8 + 7.0–7.1 + branding + migraciones + manifiestos de edición + empaquetado + licencias        |

---

## 7. Decisiones vigentes

1. Maia 3 continúa siendo una instalación externa durante la etapa actual.
2. Los estilos de bots describen muestreo mientras no exista evidencia estratégica.
3. El ELO de los bots no se anuncia como calibrado.
4. Las mediciones internas están separadas del historial de usuario.
5. El historial guarda únicamente jugador humano contra bot humano.
6. El marcador se deriva de partidas posteriores al último reinicio y puede reiniciarse sin borrar PGN.
7. La calibración profunda y la expansión del catálogo quedan planificadas para la Fase 10; no bloquean el avance de las fases de producto que no dependan de ellas.
8. La auditoría UCI de juego está implementada; antes del Model Game Generator se completarán los presets confiables, el manifiesto reproducible y el smoke test manual final.
9. Los presets superhumanos no deben confundirse con bots humanos.
10. La aplicación será local-first mientras no exista una razón validada para servicios en la nube.
11. Los presets expresan una configuración solicitada; durante el juego solo se envían las opciones anunciadas por cada motor UCI y el manifiesto registra las aplicadas y omitidas.
12. La semilla del generador queda registrada siempre, pero solo controla el lanzamiento cuando los argumentos del motor contienen `{{randomSeed}}`.
13. Los presupuestos de presets deben respetar el paradigma de búsqueda: profundidad para alfa-beta y nodos para Lc0/Leela.
14. La cancelación de una partida no puede depender de adquirir el mismo bloqueo que mantiene una búsqueda UCI activa.
15. Repetir una configuración conserva sus semillas; para variedad reproducible, los lotes incrementan las semillas base por índice de partida.
16. Pausar un lote deja terminar las partidas activas y detiene únicamente la programación de nuevas; cancelar sí termina las activas.
17. Los presupuestos de CPU y memoria de la Fase 2.2 limitan la planificación según Threads y Hash, pero no son límites duros del sistema operativo ni de VRAM.
18. Cambiar de pestaña no detiene un lote; cerrar la pestaña propietaria lo cancela para evitar procesos huérfanos.
19. Cada ejecución del generador crea un experimento local durable; analizar una partida abre una copia de trabajo y no modifica el artefacto original.
20. La persistencia de la Fase 2.3 utiliza carpetas y JSON versionado; una base indexada se difiere hasta que volumen, búsqueda o migraciones la justifiquen.
21. Un experimento activo no puede exportarse ni eliminarse, y uno interrumpido por cierre inesperado se recupera como cancelado.
22. `metrics.json` contiene solo agregados descriptivos; cualquier métrica que requiera evaluación ajedrecística pertenece a Experiment Analysis.
23. La Fase 4 separará fuerza objetivo, estilo de decisión, estilo de apertura, repertorio y timing para que los perfiles puedan crecer sin duplicar lógica.
24. Los estilos se mostrarán como descriptores comprensibles, pero no se presentarán como comportamiento estratégico validado hasta disponer de evidencia estadística.
25. La beta de la Fase 4 queda en 15 bots editoriales; la expansión hacia aproximadamente 30 perfiles diferenciados queda condicionada a la Fase 10.
26. La liga automática de la beta se mantiene dentro del Model Game Generator; no tendrá icono ni sección propia hasta que existan torneos jugables por el usuario.
27. Los torneos futuros conservarán sus propios eventos, resultados y clasificaciones; no modificarán directamente el historial personal jugador contra bot.
28. Los bots juegan a velocidad estándar, sin timing humano artificial, en Model Game Generator y en ligas beta; el timing humano se reserva para partidas de entrenamiento contra el usuario.
29. La visualización en vivo, la navegación durante la ejecución y los torneos con participación humana pertenecen a la Fase 10.
30. La Fase 5 —identidad de producto y alpha privada— se ejecutará después de 6.6–6.8 y del núcleo 7.0–7.2; las mejoras 7.3 no bloquean la primera alpha.
31. El primer corte de la Fase 6 conserva `training-library-v1` como infraestructura técnica y utiliza `training-areas-v1`, migrado sin pérdida a su esquema 8, para los estados independientes de Táctica, Aperturas y Finales; no modifica los datos existentes de repertorios o puzzles.
32. La importación táctica permite configurar quién realiza la primera jugada, cómo tratar las variantes y si se valida con la solución preparada, con motor o automáticamente según el registro.
33. Táctica, Aperturas y Finales son áreas independientes: no comparten sesiones, colecciones, ciclos ni progreso como una única experiencia de usuario.
34. Táctica amplía el entrenador de puzzles existente; Aperturas amplía el entrenamiento de repertorios existente; Finales se crea desde cero.
35. Las tablebases se usarán como criterio teórico cuando una posición sea elegible; fuera de ellas se declarará explícitamente el criterio práctico utilizado.
36. En Táctica, cada registro de un archivo representa normalmente un ejercicio/posición; se aceptan FEN sin línea y archivos con cientos de registros, mientras que descubrir automáticamente tácticas dentro de partidas completas queda fuera del primer importador.
37. Táctica aceptará alternativas prácticamente equivalentes, pero no una continuación inferior solo porque también termine ganando.
38. Aperturas se verificará jugada a jugada contra el repertorio: una desviación buena se informa como fuera del repertorio, una jugada imprecisa se marca como incorrecta y una transposición conserva la información del orden entrenado.
39. La repetición espaciada de Aperturas se aplicará a líneas completas.
40. El contenido inicial de Finales esperará el conjunto de posiciones FEN proporcionado por el usuario; no se crearán sets pedagógicos predeterminados antes de recibirlo.
41. El Endgame Trainer preferirá la tablebase remota y admitirá una ruta local de Syzygy; no descargará automáticamente el conjunto completo de 6 o 7 piezas por su tamaño.
42. Desde el análisis se podrá añadir una línea a Aperturas, crear un ejercicio de Finales o iniciar una partida contra un bot desde la posición actual.
43. Las tácticas con solo FEN se validarán bajo demanda cuando el estudiante juegue; la importación no ejecutará un análisis completo del set.
44. Las alternativas tácticas se aceptarán si son prácticamente equivalentes y respetan la distancia de mate; no se aceptará una línea inferior solo porque también gana.
45. Aperturas usará un umbral general de 0.30 peones (30 centipeones) para clasificar desviaciones buenas frente a jugadas imprecisas.
46. Una desviación buena en Aperturas detiene temporalmente el entrenamiento y muestra el aviso antes de permitir continuar.
47. Finales calculará automáticamente el objetivo de cada FEN y permitirá corregirlo manualmente; inicialmente una posición de victoria se completa con jaque mate.
48. El contenido inicial de Finales se importará desde un PGN exportado de un estudio de Lichess que contiene posiciones FEN agrupadas.
49. El hub de Entrenamiento será posteriormente un centro de resúmenes de sesiones, progreso y recomendaciones; no será una cuarta modalidad ni un contenedor que mezcle la configuración de las tres áreas.
50. El acceso existente de Puzzles conduce al dashboard de Táctica y Finales dispone de un acceso directo desde el inicio; el tablero aparece al comenzar una práctica, no al entrar al dashboard.
51. Los sets tácticos grandes conservan el PGN original como fuente local y cargan únicamente una muestra o el registro activo; mover o eliminar ese archivo invalida la fuente hasta que el usuario la vuelva a vincular.
52. La política táctica predeterminada interpreta la primera jugada como del estudiante y conserva alternativas del rival; ambas decisiones son configurables por set.
53. Woodpecker registra tiempo, fallos y problemas restantes sin usarlos como límites anticipados. El ciclo termina automáticamente al resolver una vez todo el set; la salida prematura es una opción avanzada confirmada y el ciclo siguiente vuelve a incluir el set completo.
54. El importador de Aperturas conserva el PGN original como fuente inmutable y genera una copia editable completa. La jerarquía inicial se deduce por capítulo; la política elegida marca líneas entrenables sin eliminar las demás ramas de la copia.
55. Stockfish clasifica una jugada fuera del repertorio con el umbral general de 30 centipeones. Si la desviación es buena, la práctica se detiene y exige confirmación antes de reproducir la continuación preparada.
56. El primer corte detecta capítulos de partidas modelo y los mantiene como contenido analizable no entrenable; una biblioteca editable dedicada dentro de cada repertorio permanece pendiente.
57. Los PGN de cursos comerciales usados para validar formatos son fixtures locales del propietario y no se distribuirán con la aplicación ni se copiarán a sus recursos.
58. En Finales se prioriza la tablebase remota por el tamaño de las colecciones locales; `SyzygyPath` continúa como opción avanzada. Maia al ELO máximo será el rival predeterminado y Stockfish será seleccionable.
59. Las 180 posiciones FEN válidas de los tres PGN de Finales se incluyen como contenido inicial; sus
    cuatro registros introductorios o vacíos se omiten. Cada registro válido fija objetivo y color del
    estudiante mediante metadatos PGN, sin confundirlo con el lado al turno, y ofrece una acción
    separada de análisis.
60. Crear un repertorio propio desde cero es el flujo principal de Aperturas; importar PGN es una alternativa. Un repertorio nuevo puede añadir capítulos y construir sus árboles directamente en el tablero.
61. En Aperturas, la unidad de recuerdo y calificación es la línea completa. Los movimientos correctos continúan sin mostrar la escala de dificultad; esta aparece una sola vez al finalizar la línea.
62. Marcar una línea como entrenable modifica la cola de práctica, no elimina contenido de la copia editable. El archivo importado permanece intacto y la copia conserva ramas, comentarios y anotaciones.
63. El esquema 4 introdujo la instalación versionada del contenido incluido de Finales; el esquema 5 añade progreso y organización avanzada de Aperturas sin eliminar datos anteriores.
64. Al abrir una posición de Finales, el estudiante ocupa el lado al turno de la FEN y la configuración de partida se prepara con Maia a 2600 o con Stockfish, según la opción visible en el dashboard.
65. “Practicar repertorio” crea una cola por pestaña con los capítulos de teoría habilitados; conserva las estadísticas de la sesión y avanza al capítulo siguiente después de calificar la última línea del actual.
66. La clasificación interactiva de desviaciones de Aperturas usa un proceso UCI privado y puntual; retorna al recibir `bestmove`, dispone de un límite total de ocho segundos y termina el proceso al completar o agotar el plazo.
67. Un fallo, timeout o desconexión del evaluador no avanza la línea ni bloquea el tablero: la interfaz informa que no pudo clasificar la alternativa y permite intentar una jugada del repertorio.
68. En Aperturas, los aciertos continúan de forma fluida con confirmación lateral; los fallos permiten reintentar sin mostrar la respuesta y las desviaciones buenas pausan la línea hasta que el usuario decide regresar a la continuación preparada.
69. Aperturas registra acierto, fallo y tiempo por movimiento del estudiante y deriva métricas agregadas de progreso y dificultad para línea, variante y repertorio.
70. La pregunta de dificultad al terminar una línea es configurable; al desactivarla, la calificación FSRS se calcula con errores y tiempo sin interrumpir el flujo.
71. Variante funciona también como carpeta organizativa: las variantes se reordenan y las líneas se pueden reordenar o mover entre variantes del mismo repertorio mediante arrastre.
72. Renombrar, excluir, mover, crear o eliminar una línea del gestor reconstruye solo la copia editable. Las ramas se localizan por jugadas en la copia actual para conservar comentarios y anotaciones; el PGN importado original nunca se escribe.
73. Táctica prioriza los sets disponibles sobre la importación; cada set conserva ELO recomendado, punto de reanudación, avance automático, ciclo activo e historial comparable. El borrado de un set propio nunca elimina su PGN fuente.
74. Finales presenta el contenido incluido por temas y oculta la partición de sus PGN fuente. Sus posiciones y objetivos son contenido bloqueado con progreso propio; los sets del usuario conservan cálculo, edición y borrado.
75. Una partida de Finales comienza automáticamente al pulsar “Jugar”. Su cierre compara el resultado desde el color del estudiante con el objetivo teórico y sustituye “New Game” por repetir, analizar, continuar o volver a la biblioteca.
76. En Aperturas, evaluar buenas jugadas fuera del repertorio y preguntar la dificultad al final son preferencias independientes; ambas nacen desactivadas y la primera evita iniciar el motor cuando se practica estrictamente.
77. Una línea entrenable puede abrirse individualmente desde el gestor y repetirse libremente sin alterar la práctica completa de variante o repertorio.
78. «Mostrar jugada» cuenta como error, muestra temporalmente la continuación preparada, restaura la posición y exige que el estudiante la reproduzca.
79. Las búsquedas mmap no reservan una conexión SQLite hasta su consulta final y el cálculo de cobertura del constructor no se ejecuta mientras su pestaña está oculta.
80. La edición avanzada sincronizada y la exportación trabajan sobre la copia local canónica; el PGN fuente sigue siendo inmutable. La serie de correcciones cerrará con validación manual consolidada y regresiones de las tres áreas.
81. En Táctica, recorrer o abrir directamente problemas para revisarlos no modifica el punto de reanudación; este se deriva del primer ejercicio sin completar del ciclo actual.
82. La revisión táctica ofrece una lista PGN virtualizada que marca los problemas completados en el ciclo y abre cualquiera directamente en el tablero.
83. El aviso de fallo táctico permanece visible mientras se restaura la posición y solo se reemplaza al acertar; nunca revela la solución.
84. Finales permite volver a su biblioteca durante preparación, partida y resultado. Salir durante una partida aborta el backend sin registrar un intento artificial; un objetivo no alcanzado se comunica de forma neutral y ofrece reintentar.
85. Guardar un capítulo editable desde análisis o construcción reconcilia automáticamente sus hojas con el gestor. Las líneas sin cambios conservan identidad y telemetría; las ramas nuevas y eliminadas se reflejan en la jerarquía.
86. Arrastrar líneas entre variantes compatibles y reordenar variantes reconstruye el orden físico de la copia PGN. Una diferencia de FEN inicial rechaza el movimiento antes de escribir.
87. La práctica de Aperturas crea una entrada explícita por cada línea entrenable, por lo que una copia completa puede contener ramas no entrenables y partidas modelo sin incorporarlas accidentalmente a la sesión.
88. Crear líneas desde el gestor pasa a ser un flujo visual sobre el tablero. La entrada manual UCI deja de ser necesaria; la copia editable completa se puede exportar desde el repertorio.
89. Las consultas locales de posición seguirán la regla «latest request wins» por pestaña y base; solo los resultados completos y vigentes pueden entrar en caché o actualizar la interfaz.
90. La caché de posiciones debe tener un límite explícito. Guardar indefinidamente todas las posiciones recorridas no es aceptable con bases grandes.
91. El tablero de análisis será el estado inicial de una pestaña nueva. La antigua cuadrícula se retirará solo después de validar el nuevo shell y sus accesos equivalentes.
92. Entrenamiento agrupa Táctica, Aperturas y Finales y comparte la barra de pestañas del tablero. El hub se transforma en el área seleccionada dentro de la misma pestaña; los dashboards siguen siendo experiencias especializadas independientes.
93. Las nuevas importaciones de Aperturas usarán por defecto todas las subvariantes; el cambio no migrará ni modificará repertorios existentes.
94. Partidas modelo pertenecerán al repertorio, pero se mostrarán en una sección visual diferenciada y nunca entrarán en colas de memorización.
95. Las ediciones distribuibles se construirán desde el mismo commit mediante manifiestos; no se mantendrán ramas de producto divergentes.
96. Los recursos privados permanecerán fuera de Git y de artefactos generales. Poseer una copia de un libro no se considerará permiso de redistribución.
97. La primera instalación usará español por defecto; una actualización respetará el idioma ya elegido.
98. `es-ES` y `en-US` son los idiomas de referencia. La ampliación a otros idiomas se priorizará por uso o contribución y tendrá verificación automática de cobertura.
99. Maia debe ofrecer instalación guiada desde Motores antes de la alpha, condicionada a una revisión documentada de licencia, pesos, dependencias y experiencia de primera descarga.
100. Todas las ediciones conservarán la importación local de PGN; los manifiestos de edición solo controlan recursos preinstalados.
101. El primer grupo alpha se estima en 3–5 personas y priorizará Windows, sin cerrar todavía soporte posterior para Linux o macOS.
102. Jugar e Importar reutilizarán por defecto una pestaña de análisis vacía; una preferencia permitirá crear siempre otra pestaña.
103. Cada set preinstalado tendrá una decisión individual de distribución y evidencia de licencia o permiso; disponer de permiso para algunos sets no autoriza los demás.
104. Para Maia se intentará primero un paquete preparado y sencillo; si la revisión técnica o legal no lo permite, se ofrecerá una instalación guiada integrada.
105. Player Analysis usará como fuentes principales Lichess y PGN importados y alimentará recomendaciones y estadísticas avanzadas visibles desde Entrenamiento.
106. Las incorporaciones de 6.8 fusionan movimientos UCI con FEN inicial exactamente coincidente, conservan comentarios y progreso, y mantienen separadas las transposiciones por distinto orden de jugadas. No se normalizan silenciosamente contadores FEN incompatibles.
107. Las partidas modelo se deduplican por FEN inicial y conjunto de líneas; los nombres distintos no crean por sí solos otra partida. Las colisiones de nombres de partidas distintas usan sufijos. La clasificación explícita prevalece sobre la inferencia por nombre al reimportar.
108. Guardar como escribe solo la partida actual y cambia el origen de su pestaña; Exportar escribe una copia sin cambiar origen ni estado pendiente. Ambos protegen la fuente conocida y piden confirmación antes de sustituir otro archivo existente.
109. Cada incorporación conserva un PGN previo de recuperación junto al editable y un registro de procedencia en el estado local. No se promete una transacción única entre PGN y almacenamiento del navegador ante un cierre abrupto.
110. En 7.1 los Opening Reports son el objetivo principal, con ChessBase y Scid vs. PC como referencias funcionales. Games conserva la exploración de partidas y se amplía si hace falta; no se exige duplicarla bajo las estadísticas.
111. El usuario autoriza 7.0 el 2026-08-28 y sitúa la validación manual consolidada y los objetivos incluidos de Finales en el corte de marca/release posterior a 7.0–7.1, antes de distribuir a terceros.
112. Opening Reports empieza con bases locales, estadísticas, tabla de teoría y transposiciones. Temas estratégicos, planes, finales típicos y fuentes Lichess quedan explícitamente diferidos; HTML/PGN es la exportación preferida para 7.1, deseable pero no bloqueante.
113. 7.0 usa coincidencias temporales completas y acotadas, metadatos paginados y PGN bajo demanda; conserva lectura v4 y reconstruye v5 por bloques. No adopta por defecto un índice global de todas las posiciones: la estimación de ~12,26 GiB y del trabajo CPU queda documentada. Esto no elimina el coste del primer escaneo ni sustituye la validación release.
114. 7.1 separa estadísticas completas de teoría acotada y seleccionada por ELO medio, año e ID. Sus órdenes y transposiciones no se anuncian como exhaustivos para toda la base; las convergencias posteriores se agrupan a igual profundidad. Los límites y la cobertura se muestran y se exportan.
115. El informe local se genera por petición explícita, es cancelable y reutiliza el snapshot de 7.0. Conserva una versión por opciones en la caché de sesión y permite exportación HTML/PGN; no se incorpora todavía una biblioteca persistente de informes.
116. Games incorpora un rango ELO compartido para ambos jugadores y ordenación global por fecha, ELO medio, ELO de cada color o identificador. Los filtros de evento/control de tiempo y una ordenación por relevancia quedan posteriores.
117. El informe agrega exactamente todos los jugadores de las coincidencias, conserva los 20 más frecuentes y los 20 de mayor ELO sin ordenar el universo completo, y abre sus partidas con cualquier color en otra pestaña Games. No se infieren títulos FIDE ausentes de la base. Temas estratégicos, planes, finales típicos, novedades y fuentes Lichess siguen diferidos.
118. Player Analysis utiliza como fuentes iniciales las bases locales producidas por cuentas Lichess o PGN importados. El perfil guarda versión, fuentes, filtros, fecha, muestra y evidencia y puede desactivarse, recalcularse o borrarse.
119. El análisis objetivo excluye Maia, requiere un motor local y una muestra explícita. Permite pasos de cinco o todas las partidas filtradas, empezando por las más recientes; registra motor, argumentos, opciones y límite, reutiliza partidas terminadas y conserva resultados parciales al cancelar.
120. Las candidatas de Player Analysis pueden añadirse a sets tácticos propios embebidos con base, partida, ply, pérdida y clasificación. Los sets PGN e incluidos no se modifican; la creación automática de un set queda en 7.3.
121. Todos los pendientes de ampliación de 7.1 y 7.2 se consolidan en 7.3 para evitar reabrir sus núcleos con alcance indefinido.
122. La Fase 5 se ejecutará como identidad/repositorio, auditoría completa sobre release,
     estabilización más capa visual ligera y alpha privada, en ese orden. La auditoría registra y prioriza
     antes de abrir otra ventana amplia de correcciones.
123. El nombre definitivo es Onyx Chess Lab y el repositorio canónico es
     `ArguedasG/onyx-chess-lab`, con `origin` propio y En Croissant como `upstream`. El símbolo fue
     ideado inicialmente por el usuario y transformado con la generación de imágenes de ChatGPT; su
     máster, procedencia y licencia CC BY 4.0 están documentados en `assets/brand/README.md`.
124. El canal automático propio pertenece a Fase 5.2 y es P0 antes de otro instalador distribuido.
     El aislamiento temporal no se sustituye por un cambio de URL: endpoint, claves, firmas,
     workflow, recuperación y pruebas forman un solo criterio de salida.
125. La selección múltiple de ritmos para la muestra del motor se cierra en 7.2 porque define qué
     partidas sustentan las métricas personales; no se difiere a la inteligencia avanzada 7.3.
126. Los ejercicios derivados de un error podrán entrenar la alternativa del jugador antes del
     fallo o el castigo del rival después del fallo. Ambas perspectivas conservarán ply, turno y
     procedencia distintos y pertenecen al cierre de 7.2.
127. «Error recurrente» conserva por ahora su definición amplia —misma fase, severidad y ECO—. Una
     coincidencia de jugada, posición o motivo táctico requerirá otra agrupación verificable en 7.3.
128. La instalación directa de Maia 3 es un P1 de Fase 5.3 inmediatamente posterior al canal de
     actualización propio. Debe eliminar Python, Git, rutas y argumentos manuales de la experiencia
     normal, sin confundir un paquete administrado por Onyx con motores Maia agregados por el usuario.
129. El reconocimiento de Finales en 6.9 clasifica el resultado absoluto del tablero y conserva sus
     métricas separadas de la demostración contra motor. Mostrar la respuesta cuenta como fallo; el
     análisis y la partida posterior no cambian retroactivamente ese intento.

---

## 8. Preguntas abiertas

Estas preguntas no bloquean el trabajo actual, pero deberán resolverse en sus fases:

- ¿Qué namespace se usará para el bundle identifier de Onyx Chess Lab?
- ¿Qué objetivos P50/P95 en release se usarán para aceptar consultas e informes sobre 10,35 millones?
  7.0 ya registra una primera medición debug en i5-1135G7 y 16 GB; falta la batería por selectividad.
- ¿Qué plataformas, además de Windows, se incluirán en el smoke test de la primera alpha?
- ¿Qué sets tácticos concretos tienen permiso verificable y cuáles quedarán solo como importación
  local?
- ¿Qué plataformas se soportarán oficialmente en cada release?
- ¿Qué controles de recursos ofrecerá el generador?
- ¿Qué definición operativa se utilizará para “dificultad práctica”?
- ¿Qué modelos pueden representar honestamente niveles GM o estilos humanos fuertes?
- ¿Qué datasets y sets pueden redistribuirse legalmente?
- ¿Cuándo migrar historial y experimentos desde JSON a una base indexada?
- ¿Qué información de experimentos debe incluirse en exportaciones compartibles?
- ¿Qué flujos necesita realmente el equipo del TEC antes de añadir colaboración compleja?
- ¿Qué métricas definirán que dos perfiles tienen estilos suficientemente diferentes?
- ¿Qué datasets de partidas humanas y licencias podrán utilizarse para enriquecer los repertorios?
- ¿Cuándo tendría sentido calibrar los ELO contra una plataforma externa y bajo qué control de tiempo?
- ¿Qué formatos de torneo local aportan más valor antes de investigar funciones online?

---

## 9. Registro breve de evolución

### 2026-09-08

- Se implementó 6.9 como reconocimiento práctico, no como diagnóstico textual: tablero inicial,
  lado al turno, respuesta W/D/L, «No sé», explicación del resultado y pasos posteriores de análisis
  o demostración jugando contra el motor seleccionado.
- El esquema local de Entrenamiento sube de 10 a 11 para guardar intentos, aciertos, fallos y tiempo
  de reconocimiento sin mezclar esas cifras con las partidas de Finales.
- Guardar cambios en un repertorio muestra ahora confirmación de éxito y errores; Guardar como y
  Exportar copia reciben la misma confirmación explícita sin generar avisos durante el autoguardado.

### 2026-09-07

- Se corrigió en 6.8 la incorporación al repertorio desde partidas abiertas en bases, Games y
  Opening Reports: si el árbol visible aún está vacío se recupera la partida canónica; una partida
  modelo conserva la partida completa y una línea elegida desde el inicio conserva la principal.
- Se incorporan al cierre de 7.2 la selección múltiple de ritmos para el análisis de motor y la
  elección entre entrenar la alternativa previa al error o el castigo posterior del rival.
- El actualizador automático propio pasa a Fase 5.2 como P0 de distribución, con endpoint, claves,
  artefactos firmados, pruebas negativas y ruta manual de recuperación.
- La instalación directa de Maia 3 se formaliza como P1 de Fase 5.3 y se coloca inmediatamente
  después del actualizador. El flujo objetivo instala, verifica y registra Maia desde Motores sin
  requerir Python, Git, PowerShell, rutas ni argumentos UCI manuales.
- Se completó la implementación técnica inicial del canal Windows x64: repositorio público, endpoint
  propio, par de claves cifrado con custodia fuera del repositorio, secretos de GitHub Actions,
  workflow NSIS firmado, cliente con confirmación y auditoría automática. `v0.15.2` se publicó desde
  el commit de transición y el usuario validó tanto su instalación manual como el caso «sin
  actualización» contra el feed público. Se prepara `0.15.3` para la validación N → N+1; por ello el
  P0 todavía no se declara cerrado.

### 2026-08-31

- Se verificó el repositorio canónico con `origin` en `ArguedasG/onyx-chess-lab`, `upstream` en En
  Croissant y la procedencia/licencia CC BY 4.0 del logo dentro de `assets/brand/`.
- Primer lote de auditoría: Games abierto desde un jugador de Opening Reports ahora vuelve a la
  pestaña y modal exactos del informe; Player Analysis conserva subpestaña y scroll por perfil al
  consultar evidencias.
- «Laboratorio» pasa a **Generador de partidas modelo**. Táctica aclara la función de las bases
  locales de puzzles de Lichess frente a sets propios/PGN. La marca visible usa Onyx Chess Lab y la
  opción de anarquía se llama al paso/en passant.
- Los identificadores internos, rutas de datos y bundle identifier heredados no cambian hasta
  definir y probar la migración. Se registran como bloqueos pre-alpha el actualizador y la telemetría
  heredados; deben desactivarse o migrarse explícitamente antes del instalador. El detalle queda en
  `docs/phase-5-brand-release-alpha-plan.es.md`.
- Finales separa el color del alumno del turno del FEN. Se fijaron objetivo/color en los 180 finales
  incluidos y se retiraron los controles temporales de autoría; la migración conserva victorias/tablas
  y reinterpreta las pérdidas del contenido incluido como victorias del alumno con el bando contrario,
  ya que aún no existen ejercicios de resistencia. Se difiere a 6.9 un modo de clasificación teórica
  (ganan blancas/negras o tablas) reutilizable con contenido incluido y sets propios.
- El contenido incluido de Finales sube a versión 2: instalaciones con la versión 1 refrescan
  objetivo/color desde los PGN sobre los mismos IDs, conservan progreso y no duplican ni eliminan sets
  propios. Esto corrige el «por definir» observado al abrir un release con el perfil local anterior.

### 2026-08-30

- Se inicia la preparación de Fase 5 con cuatro puertas consecutivas: repositorio e identidad,
  auditoría sobre build release, correcciones más ajuste visual ligero y alpha privada para 3–5
  personas. La matriz y criterios de salida quedan documentados en
  `docs/phase-5-brand-release-alpha-plan.es.md`.
- Se elige **Onyx Chess Lab**, con slug `onyx-chess-lab` y futura copia local canónica en
  `G:\dev\onyx-chess-lab`. El logo PNG transparente de 1254 × 1254 fue ideado por el usuario y
  transformado mediante ChatGPT; antes de integrarlo se documentará esa procedencia, se asignará una
  licencia gráfica y se prepararán variantes de contraste y tamaños pequeños.

- Player Analysis deriva el nombre de apertura desde la línea principal cuando falta la cabecera
  ECO; los perfiles de esquema 1 se recalculan bajo el esquema 2 para no conservar agrupaciones
  «Unknown opening» obsoletas.
- La muestra del motor permite pasos de cinco o analizar explícitamente todas las partidas
  filtradas, mantiene claro que selecciona primero las más recientes y continúa siendo cancelable.
- Las partidas de evidencia se abren en otra pestaña y conservan el perfil de origen. El cierre de
  la corrección aprueba 178 pruebas frontend, 53 pruebas Rust de base, typecheck, lint, auditoría de
  1.648 claves ES/EN y build web.

### 2026-08-29

- Se implementó el núcleo de 7.2: perfil local versionado sobre partidas Lichess/PGN importadas,
  filtros y estadísticas avanzadas, hallazgos con muestra/evidencia, muestra de motor
  cancelable/reanudable, ACPL, fases, conversión, defensa y errores recurrentes.
- Las posiciones críticas se abren en la partida y pueden añadirse a un set táctico propio; el
  esquema de Entrenamiento migra a v9 y conserva procedencia suficiente para un set automático
  futuro. Los pendientes de 7.1/7.2 se unifican en la fase diferida 7.3.
- El cierre automático de 7.2, ampliado con las correcciones del 2026-08-30, aprueba 178 pruebas
  frontend, 53 pruebas de base de datos Rust, typecheck, lint focalizado, build web y paridad de
  1.648 claves ES/EN. Continúan pendientes el
  recorrido manual en Tauri y la build empaquetada con cuenta y motor reales.
- Se corrigió la restauración de Games después de abrir y cerrar una partida desde el filtro de un
  jugador del informe: una cancelación de ciclo de vida ya no sustituye temporalmente la tabla por
  un fallo de base y se reintenta una vez conservando datos previos. Pasan la regresión focalizada y
  el typecheck; la reproducción manual en Tauri y build empaquetada continúa en el corte de release.

### 2026-08-28

- Se amplió 7.1 con jugadores frecuentes y más fuertes, estadísticas desde la perspectiva del
  jugador, franjas ELO, acceso a sus partidas, filtros ELO y ordenación global de Games por
  fecha/ELO. En la Gigabase, el informe ampliado tuvo P50/P95 debug de 4.205/5.862 ms; ordenar
  933.494 coincidencias tomó 2.282 ms por fecha y 1.720 ms por ELO medio.
- Se implementó el núcleo local de 7.1: estadísticas completas, teoría por selección explícita,
  órdenes de llegada, transposiciones, navegación a referencias y exportaciones HTML/PGN.
  Se mantiene Games sin duplicar su listado. Las mediciones, pruebas y límites de validación
  están en `docs/opening-reports-phase-7-1.es.md`; no se declara aún cierre manual de la alpha.
- Se implementó 7.0: consultas compartidas y cancelables, prioridad frente a cobertura, resultados
  desconocidos separados, índices v4 validados/v5 por bloques, Games paginado y apertura en posición.
  Pasan 151 pruebas frontend y 46 de base de datos; la suite Rust completa mantiene siete fallos
  heurísticos previos (83 aprobadas, 8 omitidas). Mediciones y límites en el documento de 7.0.
- Tras la revisión, el usuario autorizó comenzar 7.0 y confirmó el alcance inicial de informes
  locales. Los temas/planes/finales típicos y Lichess se difieren; se prefiere HTML/PGN para exportar.
- El cierre de Finales y la validación completa pasan al corte de marca/release posterior al núcleo
  de la Fase 7, sin declararlos completados ni bloquear esta implementación.

- Se revisaron roadmap, código y pruebas antes de la Fase 7, sin iniciar su implementación.
- Se ajustó 7.1 por solicitud del usuario: priorizar Opening Reports y aprovechar Games, sin otra
  lista obligatoria bajo las estadísticas.
- Pasan las 144 pruebas frontend, TypeScript, la auditoría de 1.470 claves por idioma y la build web.
  El lint global informa 44 avisos y cero errores. La suite Rust completa reproduce 72 pruebas
  aprobadas, ocho fallidas y seis omitidas; no se declara validación nativa ni empaquetada.
- La revisión documenta correcciones necesarias para informes fiables: identidad de posición,
  resultados desconocidos separados de tablas, prioridad/cancelación de cobertura, construcción
  acotada y validación del índice, paginación real y selección del nodo coincidente.
- El detalle, los pendientes previos y las preguntas de alcance están en
  `docs/phase-7-readiness-review.es.md`. La Fase 7 continúa pendiente de autorización de implementación.

### 2026-08-27

- Se implementó 6.8 tras autorización: importación PGN completa/seleccionada a variantes, captura de
  líneas/subárboles desde análisis, biblioteca separada de partidas modelo, todas las subvariantes
  por defecto para nuevas importaciones y avance táctico sin acción redundante.
- Se añadieron Guardar como y Exportar copia al menú del tablero, protección de fuentes y avisos de
  sobrescritura. Una regresión con 225 partidas verificó e impulsó la invalidación de offsets PGN
  antiguos al guardar; las incorporaciones reconstruyen el índice después de sustituir el editable.
- Se completaron ES/EN, se migraron los textos de entrenamiento/práctica y se comprobó el cambio de
  idioma sin remontar el hub, corrigiendo la retención de traducciones por el compilador de React.
- Pasan 144 pruebas frontend y las dos regresiones Rust de PGN, la auditoría de 1.470 claves por
  idioma, el typecheck y la build web de producción. El lint focalizado de las funciones nuevas
  no tiene advertencias; la revisión ampliada conserva dos avisos preexistentes de dependencias
  React en `RepertoireInfo.tsx`. La build conserva los avisos de tamaño de bundle y tiempo de plugins.
  No se ejecutó la suite Rust completa ni el smoke test empaquetado;
  permanecen vigentes sus limitaciones previas. 7.0 no se ha iniciado.

- El usuario aprobó sus pruebas del estado previo y pidió corregir iconos de Jugar/Entrenamiento,
  integrar el hub en las pestañas y reparar posición/cierre de «Jugar desde aquí».
- Se aplicaron las tres correcciones: shell de pestañas compartido con rutas de Entrenamiento,
  partida independiente desde la rama seleccionada y confirmación de cierre disponible en todos
  los modos de tablero. Guardar antes de cerrar ya espera la escritura y respeta cancelación/error.
- Pasan 19 regresiones focalizadas, la suite frontend completa (118 pruebas), el typecheck y la
  build web de producción. La revisión visual automatizada no estuvo
  disponible. 6.8 queda preparada como siguiente implementación, sin iniciarla en esta corrección.

### 2026-08-26

- Se identificó que la navegación rápida sobre una base de 10.355.465 partidas acumula consultas de
  posición: cada FEN recorre el mmap completo, hay dos permisos concurrentes y no existe cancelación
  cooperativa de solicitudes obsoletas.
- La estabilización 6.6 pasa a ser la prioridad inmediata con «latest request wins», caché LRU,
  prioridad interactiva, observabilidad y prueba real en desarrollo y release.
- Se acordó un shell 6.7 centrado en el tablero: pestañas arriba, acciones/destinos globales en la
  barra lateral y panel derecho contextual. Entrenamiento conserva dashboards independientes.
- Se agrupó en 6.8 el pulido de Táctica, importación y captura de repertorios, partidas modelo, Guardar
  como PGN e idiomas de referencia.
- La Fase 7 incorpora una base escalable y una tabla paginada de partidas coincidentes antes de los
  reportes completos; Player Analysis pasa a 7.2 y no bloquea la alpha inicial.
- Identidad y alpha se mantienen como Fase 5 por continuidad histórica, pero se ejecutarán después de
  6.6–6.8 y 7.0–7.1.
- Las tres ediciones se construirán desde el mismo commit con manifiestos; no se usarán ramas largas.
  El contenido privado permanecerá fuera de Git y poseer un libro no se tratará como permiso de
  redistribución.
- Se definió como cierre profesional un caso de estudio reproducible de datos/MLOps sobre la
  infraestructura real del proyecto, evitando añadir ML decorativo sin una pregunta medible.
- Se aclaró que todas las ediciones conservarán siempre la importación local de PGN; solo cambia el
  contenido preinstalado. La primera alpha se estima en 3–5 personas y priorizará Windows.
- Jugar e Importar reutilizarán por defecto una pestaña de análisis vacía, con preferencia para crear
  siempre otra. Maia intentará distribuirse mediante un paquete sencillo y usará instalación guiada
  integrada si la revisión lo exige.
- Player Analysis usará partidas de Lichess y PGN importados y alimentará estadísticas avanzadas y
  recomendaciones accionables dentro de Entrenamiento.
- Se implementó el núcleo de 6.6: solicitudes monotónicas con «latest request wins» por pestaña,
  cancelación de esperas y escaneos, descarte de progreso obsoleto, caché LRU de 64 entradas,
  invalidación por base e instrumentación de tiempos.
- En `Gigabase.db3` (10.355.465 partidas), una consulta debug con 933.494 coincidencias tardó 28,641 s.
  La cancelación solicitada a los 100 ms detuvo el escaneo en 102,134 ms y añadió 0,174 ms desde la
  señal. Esto valida la interactividad de 6.6 y conserva como necesaria la mejora algorítmica de 7.0.
- Las pruebas nuevas, `cargo check`, el typecheck de TypeScript, el lint y el formato pasan. La suite
  histórica completa conserva el fallo conocido de `get_move_after_exact_match_test`; falta la prueba
  manual de navegación y la validación en una build empaquetada antes de cerrar 6.6 por completo.
- Se implementó el prototipo 6.7 centrado en el tablero: nuevas pestañas de análisis por defecto,
  acciones Jugar/Importar/Entrenamiento, administración separada, Generador agrupado, barra lateral
  expandible y descubrimiento inicial dentro del panel contextual derecho.
- La reutilización de pestaña vacía queda activada por defecto y configurable. Solo acepta análisis sin
  origen ni estado persistido o pendiente del debounce; abrir PGN por menú/atajo o arrastrar archivos
  sigue la misma regla. Cuatro regresiones y la build web pasan.
- La conexión de revisión visual automatizada no estuvo disponible en el entorno. `NewTabHome` se
  conserva para sesiones antiguas y no se retirará hasta validar manualmente teclado, ventana estrecha,
  escalado y usabilidad con al menos una persona nueva.

### 2026-08-18

- Se cerró documentalmente la Fase 3 para su alcance básico y se trasladó la calibración estadística profunda a la Fase 4.
- Se inició y completó el alcance técnico/editorial inicial de la Fase 4.1 con versionado de catálogo, perfiles, repertorios, modelo Maia y trazabilidad de ejecución.
- Se añadieron ejes para agresión, complejidad, agudeza de apertura y dependencia de teoría; los seis perfiles recibieron una clasificación `editorial` aprobada por el usuario.
- Se mantuvieron privados los tests locales y los documentos de planificación excluidos del repositorio.

### 2026-08-19

- Se decidió posponer la Fase 5 —identidad de producto y alpha privada— hasta después de la Fase 6; la plataforma común de entrenamiento pasa a ser el siguiente paso recomendado.
- Se inició la Fase 6 con una biblioteca común local: colecciones, posiciones FEN/PGN, sesiones, intentos, apertura en el tablero y backup JSON versionado. El primer corte queda en progreso y conserva intactos los almacenamientos anteriores de repertorios y puzzles.
- Se aclaró el modelo de producto de la Fase 6: Táctica, Aperturas y Finales deben ser tres secciones y experiencias independientes. La biblioteca genérica se conserva únicamente como infraestructura provisional reutilizable y queda pendiente de reorganización.
- Se revisaron cinco series adyacentes de 10 partidas entre Luna, Nico, Vera, Marcos, Irene y Leo.
- Los resultados reportados fueron Nico–Luna 8–2, Vera–Nico 7–3, Marcos–Vera 7–3, Irene–Marcos 9–1 y Leo–Irene 8–2. El manifiesto local de Nico–Vera conserva el desglose exacto de Vera: 6 victorias, 2 derrotas y 2 tablas, equivalentes a 7 puntos de 10.
- La revisión manual encontró diferencias de estilo útiles para el producto, errores puntuales compatibles con el comportamiento estocástico de Maia y ningún indicio de que Stockfish sea necesario como criterio de aprobación de esta etapa.
- Se actualizaron las descripciones visibles para mostrar agresión, complejidad, agudeza de apertura y dependencia de teoría; el historial de experimentos ahora muestra el marcador sin requerir análisis.
- La validación inicial de 4.3 se considera suficiente para comenzar 4.4. La expansión de repertorios —incluidos perfiles más específicos, una línea inicial fija con desviación temprana y un perfil sin repertorio propio— queda para esa fase y requiere validar las identidades concretas antes de asignarlas.
- Se implementó la Fase 4.4 con un catálogo inicial de 15 perfiles: Daniela, Gabriel, Carlos, Nelson, Mariann, Sofía, Valeria, Tomás y Atlas se añadieron a los seis perfiles existentes.
- Se añadió selección de repertorio por color y se cubrieron Londres, Inglesa, Francesa, Caro-Kann, Eslava, defensas Nimzoindia, India de dama, India de rey, Grünfeld, Escandinava, Pirc, Moderna y Ataque Indio de Rey.
- Se añadieron los modos de línea fija de tres movimientos y sin repertorio propio; Atlas queda como referencia editorial de 2400 ELO, por encima de Leo.
- Se ajustaron las identidades solicitadas: Gabriel ocupa 1700 ELO y Marcos 1450; Sofía ocupa 1050 con la línea fija y Daniela 1300 con la Francesa. Se redujeron duplicaciones del repertorio para dejar una sola combinación Francesa/Caro-Kann, una Francesa especializada, una Caro-Kann especializada y una variante concreta de la Siciliana.
- La validación manual del catálogo, la distinción estadística entre nuevos perfiles y cualquier ajuste de estilo quedan como siguiente actividad.
- Se cerró la Fase 4 como beta: liga automática round robin reducida sobre el ciclo de partidas existente.
- La liga conserva emparejamientos, rondas, alternancia de colores, semillas, reloj, reintentos, versiones de catálogo/perfil, PGN, logs, manifiestos, resultados y tabla de posiciones en `bot-leagues-v1`.
- La liga quedó integrada como botón dentro del Model Game Generator; se eliminó su icono y acceso independiente desde la pantalla principal.
- Los bots juegan a velocidad estándar, sin pausas de pensamiento humano, tanto en Model Game Generator como en la liga beta.
- La fuerza mostrada por la liga es una estimación relativa interna; no se afirma equivalencia con un ELO externo ni se usa Stockfish como criterio automático de aprobación.
- La visualización en vivo, los torneos donde participa el usuario, los filtros avanzados y la expansión hacia aproximadamente 30 bots pasan a la Fase 10.

### 2026-08-20

- Se revisaron los tres PGN tácticos, los tres formatos de repertorio y los tres estudios de Finales proporcionados por el usuario; el inventario y las políticas resultantes quedaron en `docs/training-import-formats-phase-6.es.md`.
- Se corrigió la composición de rutas anidadas de Entrenamiento para que el hub y el dashboard táctico se rendericen; el acceso de Puzzles conduce ahora a Táctica y se añadió acceso directo a Finales.
- Táctica dejó de ser una pantalla de tablero inmediato: ahora presenta bases instaladas, importación PGN con vista previa/configuración y sets propios antes de iniciar una sesión.
- Los sets tácticos de miles de ejercicios se enlazan al PGN original y cargan cada registro bajo demanda. El esquema `training-areas-v1` migra de forma compatible a su versión 4.
- La práctica táctica acepta soluciones preparadas con respuestas alternativas del rival, posiciones FEN validadas por motor y ciclos Woodpecker que conservan fallos y ejercicios no alcanzados.
- Aperturas incorporó un dashboard `Repertorio → Variante → Línea`, vista previa, políticas de subvariantes, análisis sobre la fuente completa y práctica sobre una copia filtrada. Las partidas modelo se detectan y quedan fuera de la memorización.
- Crear desde cero pasó a ser la acción principal de Aperturas; los repertorios propios pueden añadir capítulos editables y la repetición espaciada califica únicamente al completar una línea.
- Aperturas permite editar y ordenar variantes, reclasificar partidas modelo y seleccionar líneas entrenables. Stockfish distingue una desviación buena antes de regresar a la línea estricta.
- La práctica de repertorio completo encadena los capítulos entrenables dentro de una cola propia de la pestaña.
- Los tres estudios de Finales se empaquetan como 180 posiciones iniciales y el dashboard prepara
  partidas contra Maia máximo o Stockfish desde el color del estudiante fijado en cada PGN, que puede
  ser distinto del lado al turno.
- La navegación, migración, filtrado no destructivo, extracción de variantes y contenido incluido quedaron cubiertos por 89 pruebas automáticas; el typecheck y el build web se validaron sin errores.

### 2026-08-21

- Se implementó la Etapa 2 de estabilidad y flujo de Aperturas con una consulta UCI aislada que retorna en `bestmove`, tiene un límite total de ocho segundos y destruye su proceso al terminar o expirar.
- El tablero deja de depender de la promesa abierta del análisis continuo, que era la causa del bloqueo y del timeout observado al clasificar desviaciones.
- La práctica muestra feedback lateral para jugadas correctas, incorrectas, desviaciones buenas y fallos técnicos del evaluador. Los errores permiten reintentar sin revelar la respuesta.
- Se añadieron regresiones con un motor UCI simulado para respuesta sin cierre de proceso y para timeout; también se cubrió la clasificación pura de los distintos resultados de una jugada.
- La nueva consulta puntual se comprobó con el Stockfish local real a profundidad 12 y `MultiPV`, con retorno y cierre normales.
- Pasan 90 pruebas frontend, el typecheck y el build web. Las dos regresiones UCI nuevas pasan; la suite Rust completa conserva ocho fallos ajenos a este cambio en pruebas históricas de evaluación ingenua y búsqueda de base de datos.
- Se implementó la Etapa 3 de Aperturas: intentos por jugada, cierres de línea, progreso y dificultad agregados, y calificación automática opcional al final.
- El dashboard permite crear variantes-carpetas, añadir líneas UCI, renombrar, incluir/excluir, eliminar y arrastrar variantes o líneas dentro del repertorio.
- La regeneración de entrenamiento conserva la procedencia de cada línea y fusiona ramas reorganizadas desde el capítulo original sin modificar el PGN fuente.
- `training-areas-v1` migra de forma compatible al esquema 5. Pasan 92 pruebas frontend, typecheck, lint y build web.

### 2026-08-22

- Se implementó la Etapa 4 de Táctica: el dashboard prioriza sets y muestra cantidad, progreso, tipo, ELO recomendado, siguiente problema e historial de ciclos.
- Los sets propios se pueden revisar con tablero, FEN, soluciones y PGN antes de borrarlos; el archivo PGN fuente nunca se modifica ni elimina.
- La práctica reanuda el problema guardado, permite navegar y activar avance automático. Un fallo reinicia la posición para reintentar sin revelar la solución.
- Woodpecker deja de terminar por tiempo o fallos: el usuario cierra el ciclo, se guardan sus estadísticas y el siguiente ciclo conserva problemas fallados o pendientes.
- `training-areas-v1` migra sin pérdida al esquema 6. Pasan 95 pruebas frontend, typecheck, formato y lint de los archivos de la etapa.
- Se implementó la Etapa 5 de Finales con una biblioteca temática que reúne el contenido incluido sin mostrar los nombres de sus tres archivos fuente.
- “Jugar” abre y comienza directamente la partida. El cierre específico marca éxito según objetivo/color y ofrece repetir, analizar, siguiente final o regreso a la lista.
- Cada posición conserva intentos, éxitos, duración y estado completado permanente. Los sets incluidos están bloqueados; los sets propios admiten tablebase, edición y borrado.
- Las builds de desarrollo permiten preparar los objetivos fijos incluidos por tema; estos controles no aparecen en producción.
- `training-areas-v1` migra sin pérdida al esquema 7. Pasan 99 pruebas frontend, typecheck, formato y lint de los archivos de la etapa.

### 2026-08-23

- Se implementó la primera etapa de correcciones de Aperturas: altura del gestor sensible a sus
  líneas, práctica individual, scroll lateral, explicación de contadores y ayuda «Mostrar jugada».
- La evaluación de desviaciones y la pregunta de dificultad quedan desactivadas por defecto. Sin
  evaluación externa, la práctica es estricta y no inicia el motor de referencia.
- Se corrigió el agotamiento del pool SQLite adquiriendo la conexión después del escaneo mmap y se
  eliminó el cálculo de cobertura de la pestaña de construcción mientras está oculta.
- `training-areas-v1` migra sin pérdida al esquema 8. Pasan 26 pruebas unitarias focalizadas,
  typecheck, lint de los archivos afectados y `cargo check`.
- La edición/exportación avanzada del repertorio queda diferida a una etapa propia. Tras la serie de
  correcciones se realizará validación manual consolidada y regresiones de Táctica, Aperturas y
  Finales.
- Se implementó la segunda etapa de correcciones sobre Táctica. Woodpecker termina automáticamente
  al resolver el set completo y el ciclo siguiente vuelve a incluir todos sus problemas.
- «Finalizar ciclo» pasó al menú avanzado con confirmación. La revisión añade una lista PGN
  virtualizada con marcas del ciclo y apertura directa en el tablero.
- Recorrer problemas deja intacto el primer ejercicio pendiente; un acceso explícito regresa a ese
  punto. El aviso rojo de fallo permanece mientras se restaura la posición y hasta acertar.
- Pasan 27 pruebas unitarias focalizadas, typecheck, formato y lint sin advertencias en los archivos
  afectados por las dos primeras correcciones.
- Se implementó la tercera etapa de correcciones sobre Finales. La biblioteca queda accesible durante
  preparación, partida activa y cierre; abandonar una partida la aborta sin registrar un intento
  artificial.
- El cierre de un objetivo no alcanzado usa lenguaje neutral y ofrece volver a intentarlo. Las tres
  correcciones pasan typecheck, formato y lint sin advertencias en sus archivos afectados.

### 2026-08-24

- Se completó la etapa avanzada de Aperturas con una copia PGN editable canónica separada del archivo
  importado original.
- La importación conserva todas las ramas en la copia y usa la política elegida únicamente para
  decidir cuáles empiezan entrenables.
- El guardado del tablero sincroniza líneas y subvariantes con el gestor; crear contenido deja de
  requerir secuencias UCI.
- El arrastre y el reordenamiento reconstruyen la copia desde sus árboles actuales, conservando
  comentarios y anotaciones, y rechazan capítulos con posiciones iniciales incompatibles.
- La práctica encadena líneas entrenables explícitas y la copia editable completa se puede exportar.
- Pasan 28 pruebas unitarias focalizadas, typecheck, formato y lint de los archivos afectados.

### 2026-08-17

- Se cerró la Fase 2 del Model Game Generator después de validar manualmente la Fase 2.3, incluida una partida Lc0 contra Leo.
- Se sustituyó la antigua línea transversal de calibración y expansión por la beta de la Fase 4 — bots humanos y torneos.
- Se definió una expansión gradual: aproximadamente 12–15 bots diferenciados, seguida de una posible densificación a intervalos de 50 ELO cuando el proceso esté calibrado y automatizado.
- Se añadió como prioridad futura una liga automática bot contra bot y, posteriormente, torneos locales con participación humana.

### 2026-08-16

- Se validaron manualmente las Fases 1.1, 1.2 y 1.3 con Stockfish.
- Se confirmó Lc0 en Windows usando el paquete `windows-onnx-dml`; la variante CUDA instalada inicialmente no era compatible con el entorno disponible.
- Se implementó la Fase 2.1 del Model Game Generator desde FEN o nodo PGN.
- Se añadieron configuraciones independientes para ambos jugadores, semillas, repetición y exportación PGN/manifiesto.
- El backend ahora evita enviar opciones UCI no anunciadas y registra las opciones aplicadas u omitidas.
- El primer smoke test reveló que Lc0 seguía calculando al recibir profundidad 18; los presets Lc0/Leela ahora usan presupuestos de 500, 2000 y 8000 nodos.
- Se hizo visible la edición de la posición inicial y se añadió estado de espera para identificar al jugador que está calculando.
- Se desacopló la terminación del motor del bloqueo UCI, de modo que abortar o cerrar la aplicación no tenga que esperar un `bestmove`.
- Se validó manualmente la Fase 2.1 con Lc0, incluido aborto, reinicio y cierre limpio.
- Se confirmó que repetir Maia desde la misma posición y con las mismas semillas puede reproducir exactamente la partida; los lotes permiten variar semillas de forma controlada.
- Se implementó la Fase 2.2 con alternancia de colores, semillas múltiples, progreso, pausa, cancelación, reintentos, presupuestos y ejecución en segundo plano.
- Se validó manualmente la Fase 2.2; se confirmó que sus partidas necesitaban navegación individual y análisis posterior.
- Se implementó la Fase 2.3 con registro local de experimentos, PGN, manifiestos, logs, resultados, métricas básicas, análisis, exportación y eliminación.
- La Fase 2.3 quedó implementada y preparada para validación manual.

### 2026-08-15

- Se validó la integración de Maia 3.
- Se añadieron seis perfiles humanos jugables.
- Se separaron nivel, muestreo, repertorio y tiempo.
- Se añadieron repertorios ponderados y trazabilidad.
- Se añadieron mediciones de calibración y exportación.
- Se implementó tiempo de reflexión humano adaptado al reloj.
- Se implementó historial completo contra bots, análisis y marcadores reiniciables.
- Se decidió diferir la calibración estadística profunda.
- Se seleccionó la auditoría de motores como siguiente paso recomendado.
- La anomalía de Stockfish 18 no se reprodujo en profundidad 24 ni en 3+2.
- Se endureció el ciclo UCI de partidas con `MultiPV=1`, `ucinewgame`, sincronización posterior a opciones y relojes sin desbordamiento.
- Se añadieron regresiones de protocolo y una suite táctica opcional para motores externos.
- Se añadieron categorías explícitas y presets reproducibles para motores limitados, fuertes y de referencia.
- Se añadió un manifiesto versionado exportable con configuración, lanzamiento, hardware, historial y resultado.

---

## 10. Checklist para iniciar una nueva fase

Antes de implementar:

- [ ] Confirmar qué subfase solicitó el usuario.
- [ ] Inspeccionar la implementación existente relacionada.
- [ ] Identificar datos persistentes y migraciones necesarias.
- [ ] Definir qué significa “terminado”.
- [ ] Identificar riesgos de licencias, privacidad o recursos.
- [ ] Decidir pruebas automatizadas y prueba manual mínima.
- [ ] Evitar incluir trabajo de fases futuras no solicitado.

Al terminar:

- [ ] Ejecutar pruebas proporcionales al riesgo.
- [ ] Documentar instalación o prueba manual.
- [ ] Actualizar este roadmap.
- [ ] Registrar decisiones que condicionen fases futuras.
- [ ] Informar archivos generados o locales que no deban entrar al commit.
