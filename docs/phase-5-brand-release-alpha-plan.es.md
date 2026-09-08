# Fase 5 — Marca, auditoría release y preparación de la alpha

Fecha: 2026-08-31; actualizado el 2026-09-07. Estado: identidad, licencia del logo y repositorio
canónico configurados; canal Windows x64 implementado técnicamente y prueba N → N+1 pendiente.

## Nombre decidido

El nombre final es **Onyx Chess Lab** y el slug recomendado es `onyx-chess-lab`. Describe una
plataforma que combina análisis, motores, experimentos, bases, informes y entrenamiento. La copia
local canónica se ubicará en `G:\dev\onyx-chess-lab` para no consumir más espacio del disco
principal.

La búsqueda web preliminar no encontró un uso indexado claro de los nombres compuestos, pero sí
existe un motor histórico llamado Onyx. Esto no sustituye una búsqueda formal de marcas, nombres de
repositorio, dominios, redes ni tiendas. No se fijará el bundle identifier hasta decidir el namespace
de su responsable.

## Logo recibido

El máster disponible es `C:\dev\chess lab workspace\OnyxLogov2.png`: PNG RGBA transparente de
1254 × 1254 px. El usuario creó el concepto original y posteriormente lo transformó de forma
sustancial con la herramienta de generación de imágenes de ChatGPT. La piedra facetada, el caballo y
la red de nodos comunican bien ajedrez, análisis y experimentación. Antes de integrarlo se requiere:

- documentar la procedencia y formalizar una licencia separada para el recurso gráfico;
- preparar variantes de 16, 20, 24, 32, 44, 64, 128, 256, 512 y 1024 px, además de ICO;
- crear una versión simplificada para tamaños pequeños, reduciendo nodos, líneas y biseles;
- comprobar contraste sobre fondos claros y oscuros; el borde negro necesita separación visible en
  superficies oscuras;
- conservar un máster sin texto para que el mismo símbolo funcione con ambos nombres.

El archivo está actualmente en la raíz del workspace, no dentro del repositorio Git
`en-croissant`. Se incorporará al nuevo repositorio con una nota de procedencia y licencia explícita.

## Secuencia de trabajo

### Paso 1 — Identidad y repositorio propio

Objetivo: crear el hogar canónico del producto sin perder historia, atribución ni datos locales.

1. Elegir nombre, slug del repositorio, `productName`, nombre de ejecutable y bundle identifier.
2. Etiquetar el estado previo a marca y crear el nuevo remoto conservando todo el historial Git; no
   copiar archivos a una carpeta con `git init`.
3. Configurar el repositorio nuevo como `origin` y En Croissant como `upstream`, documentando cómo
   incorporar cambios futuros.
4. Mantener GPLv3, avisos de copyright, atribución y enlace al proyecto original.
5. Integrar iconos generados desde el máster en Tauri, instalador, favicon, README y metadatos.
6. Cambiar textos y metadatos de producto sin borrar referencias legales a En Croissant.
7. Definir y probar la migración de directorios de datos antes de cambiar el bundle identifier.
8. Añadir README, estado alpha, plataformas, instalación, licencias, privacidad local y reporte de
   errores.

**Salida:** repositorio canónico clonable, build de release firmemente identificada por commit,
inicio limpio y migración de datos de prueba sin pérdida.

### Paso 2 — Auditoría completa sobre build de release

Objetivo: obtener una línea base reproducible antes de modificar más comportamiento o estética.

Durante una ventana corta se congelan funcionalidades nuevas. Los defectos se registran primero y
solo se corrigen de inmediato si bloquean el resto de la auditoría o amenazan datos.

Cada reporte debe incluir ID, versión/commit, edición, Windows y hardware, instalación limpia o
actualizada, datos utilizados, pasos, resultado esperado/real, severidad, frecuencia, capturas y
logs. Clasificación:

- **P0:** pérdida/corrupción de datos, vulnerabilidad, instalador inutilizable o bloqueo irreversible;
- **P1:** flujo principal roto, crash reproducible o resultado ajedrecístico incorrecto;
- **P2:** degradación con alternativa disponible, rendimiento o navegación problemática;
- **P3:** texto, alineación, iconografía o mejora visual.

Matriz mínima:

| Área               | Casos obligatorios en release                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Instalación        | limpia, actualización, rutas con espacios, desinstalación y conservación/borrado explícito de datos                    |
| Persistencia       | migraciones, reinicio, backup, restauración, archivos movidos y recuperación tras cierre abrupto                       |
| Tablero y archivos | análisis, importación/exportación PGN, guardado, cambios pendientes, pestañas y navegación de regreso                  |
| Motores            | Stockfish, Maia y Lc0 disponibles; inicio, cancelación, cierre, presets, manifestación de errores y procesos huérfanos |
| Bases              | importación pequeña/grande, búsqueda, Games, filtros, orden, Opening Reports, exportación y cancelación                |
| Player Analysis    | generación, nombres de apertura, evidencia, motor parcial/completo, reanudación y añadir a set táctico                 |
| Táctica            | sets incluidos/propios/PGN, ciclos, reintento, mostrar jugada, revisión y progreso                                     |
| Aperturas          | crear/importar/editar/exportar, práctica, transposiciones, desviación con/sin motor y partidas modelo                  |
| Finales            | objetivo visible, color, resultado teórico configurado, completar/fallar/salir/repetir/siguiente y progreso            |
| Bots y generador   | partida contra cada familia de motor, historial, generador individual/lote, experimento y liga beta                    |
| Producto           | español/inglés, escalado, tema claro/oscuro, iconos, versión, licencias y enlaces                                      |
| Rendimiento        | arranque, memoria, consultas grandes, cancelación, análisis largo y cierre de aplicación                               |

Para Finales se preparará una tabla canónica por posición con color del estudiante, objetivo
pedagógico, resultado aceptado y fuente del criterio. La interfaz de usuario mostrará el objetivo;
los campos editoriales y de validación permanecerán internos.

**Salida:** informe de auditoría cerrado, inventario priorizado P0–P3 y una decisión explícita sobre
qué P2/P3 se acepta para la primera alpha.

### Puerta P0 — Actualizaciones automáticas propias

El incidente del 2026-09-06 demostró que la configuración heredada podía ofrecer e instalar En
Croissant sobre Onyx Chess Lab. El hotfix deja el actualizador desactivado. Antes de volver a
habilitarlo se exige:

1. endpoint y metadatos administrados por Onyx, sin dominios ni nombres heredados;
2. par de claves exclusivo, clave pública en la aplicación y privada protegida como secreto de
   release con respaldo documentado;
3. artefactos y firmas generados desde el mismo commit, versión y plataforma;
4. auditoría automática que rechace configuración upstream o incompleta;
5. pruebas Onyx N → Onyx N+1, sin actualización, red caída, firma inválida, paquete alterado o
   ajeno, cancelación y conservación de datos;
6. descarga manual de recuperación y política de custodia, rotación y pérdida de clave.

**Salida P0:** una instalación de Onyx solo reconoce una release posterior de Onyx y rechaza un
instalador de En Croissant o cualquier artefacto sin firma válida. Esta puerta precede al siguiente
instalador distribuido a usuarios; la cobertura multiplataforma avanzada queda en Fase 9.

Alcance aprobado el 2026-09-07: Windows x64, instalador NSIS, un único canal estable en GitHub
Releases y confirmación visible antes de descargar. La release permanece como borrador hasta la
aprobación manual. macOS Intel, macOS Apple Silicon y Linux quedan pendientes explícitos de Fase 9 y
no forman parte del criterio de salida de esta primera implementación.

Estado técnico al 2026-09-07: repositorio público, endpoint propio, par de claves cifrado, secretos
de Actions, integración Tauri, auditoría de aislamiento y workflow Windows configurados. La build
local `0.15.2` produjo instalador NSIS y firma. Faltan revisar/publicar la transición y validar
`0.15.2 → 0.15.3`; por ello la puerta P0 continúa abierta.

### Paso 3 — Estabilización y capa visual de marca

Objetivo: corregir la línea base sin convertir el corte en otro rediseño funcional.

1. Corregir todos los P0 y P1; resolver o aceptar por escrito cada P2.
2. Completar resultados/objetivos del contenido incluido de Finales.
3. Aplicar la marca mediante tokens y componentes compartidos: icono, nombre, pantalla inicial,
   cabeceras, acento, superficies, estados y tipografía.
4. Mantener los flujos ya aprendidos; el cambio visual será ligero y no moverá funciones salvo que
   la auditoría haya demostrado un problema de uso.
5. Repetir la matriz afectada y después el smoke test completo sobre otro ejecutable release.
6. Generar release notes, lista de limitaciones conocidas y paquete de diagnóstico/reportes.

**Salida:** candidato `alpha.1` reproducible, sin P0/P1 conocidos, objetivos de Finales completos y
regresión release aprobada.

### Hito P1 — Instalación directa de Maia 3

Después de asegurar el canal de actualización y antes de la alpha, Motores debe permitir instalar
Maia 3 sin requerir Python, Git, PowerShell, selección manual del ejecutable ni configuración de
argumentos. El primer objetivo es Windows x64 con CPU.

El flujo mostrará licencia, procedencia, versión y tamaño; descargará a un directorio administrado
con progreso, cancelación, reintento y verificación; registrará automáticamente el ejecutable y sus
opciones UCI; y comprobará `uci`/`isready`. También ofrecerá reparar, actualizar y desinstalar la
instalación administrada sin modificar motores añadidos manualmente.

Se prefiere un paquete autocontenido y versionado si la revisión de código, dependencias, Python y
pesos permite redistribuirlo. Si no es viable, la aplicación realizará una instalación guiada tan
automática como sea posible y seguirá ocultando la configuración UCI al usuario. La alpha no se
considerará preparada mientras una instalación limpia no pueda usar Maia inmediatamente desde
Jugar, bots humanos, Finales y el Generador de partidas modelo.

### Paso 4 — Alpha privada

Objetivo: observar uso real antes de retomar ampliaciones del roadmap.

- comenzar con 3–5 amistades en Windows y una ventana de prueba definida;
- entregar una guía breve por escenarios sin dirigir cada clic;
- solicitar severidad percibida, pasos, captura y archivo/log relevante;
- pedir backup antes de actualizar y ofrecer una ruta simple de recuperación;
- distribuir avisos GPL y el código fuente correspondiente a los binarios entregados;
- no incorporar nuevas fases durante la primera ronda, salvo correcciones necesarias;
- cerrar la ronda con un resumen de defectos, fricción, funciones usadas y prioridades reales.

## Puertas de decisión antes de comenzar

1. Disponibilidad razonable de **Onyx Chess Lab** en los canales que se utilizarán.
2. Namespace del repositorio y bundle identifier.
3. Licencia final del logo y, si existe, conservación del máster editable.
4. Política de migración de datos desde la build actual.
5. Contenido exacto de la edición alpha y licencia/permiso de cada recurso incluido.
6. Versión mínima de Windows y motores que formarán parte del smoke test obligatorio.

## Primer lote de auditoría — navegación y nombres

El 2026-08-31 se resolvieron cinco hallazgos P2/P3 del recorrido previo a la alpha:

- las pestañas Games abiertas desde un jugador de Opening Reports conservan la pestaña de origen y
  ofrecen **Volver al informe de apertura**; la acción reactiva el panel Informe y reabre el reporte;
- Player Analysis conserva por perfil la subpestaña seleccionada y el desplazamiento de Resumen,
  Aperturas, Hallazgos o Motor mientras se consulta una evidencia en otra pestaña;
- la navegación visible deja de llamar «Laboratorio» al módulo y usa **Generador de partidas
  modelo**;
- Táctica presenta las bases locales principalmente como una copia instalable de los puzzles de
  Lichess y aclara que los sets siguen siendo apropiados para colecciones propias y cursos PGN;
- la marca visible pasa a **Onyx Chess Lab** en ventana, título web, Acerca de, Ajustes, PGN y textos
  traducidos; la opción lúdica se denomina captura **al paso / en passant**, no con el nombre del
  producto anterior.

Se mantienen deliberadamente por ahora `org.encroissant.app` y las rutas de datos `EnCroissant`.
Cambiarlos antes de fijar y probar la migración puede ocultar datos existentes. El nombre de producto
y el ejecutable sí pasan a **Onyx Chess Lab** / `onyx-chess-lab`, pues no trasladan el perfil de datos.
El README general y los metadatos completos de distribución se resolverán junto con esa migración,
preservando la atribución a En Croissant.

### Bloqueos de identidad detectados para el instalador

La revisión de código encontró dos integraciones heredadas que deben resolverse antes de distribuir
la alpha, aunque no bloquean este lote de interfaz:

- el riesgo heredado del actualizador se corrigió con un endpoint y una clave exclusivos de Onyx; la
  auditoría impide reintroducir `https://www.encroissant.org/updates`. Aún debe completarse la prueba
  distribuida `0.15.2 → 0.15.3` antes de cerrar la puerta P0;
- la telemetría conserva un proyecto PostHog heredado y aparece activada por defecto. Debe decidirse
  si se elimina para la alpha o se migra a infraestructura propia con consentimiento inequívoco y
  documentación de privacidad.

Los catálogos de motores, bases y puzzles también consumen `encroissant.org`. Pueden mantenerse como
servicio upstream solo si esa dependencia es deliberada, atribuida y compatible con sus condiciones;
no deben confundirse con endpoints operados por Onyx Chess Lab.

### Validación de este lote

- 148 pruebas frontend aprobadas en 27 archivos, incluidas regresiones del retorno al informe y del
  estado de vista de Player Analysis;
- TypeScript, lint focalizado sin avisos, formato y auditoría de 1.653 claves ES/EN aprobados;
- build web de producción aprobada; el chunk principal sigue registrando el aviso previo de tamaño;
- el navegador confirmó el título Onyx, pero el frontend web aislado no puede montar el shell porque
  `TopBar` requiere el runtime Tauri. La revisión visual de los cinco flujos sigue pendiente en la
  aplicación nativa y en el ejecutable empaquetado.

## Segundo lote de auditoría — perspectiva del alumno en Finales

El 2026-08-31 se corrigió el supuesto que identificaba al alumno con el bando que mueve primero:

- cada posición guarda ahora `studentColor` con independencia del turno indicado por el FEN;
- los objetivos de tablebase se traducen a la perspectiva del alumno, de modo que ganar o perder
  cambia de sentido cuando el alumno lleva el color contrario al que mueve;
- iniciar o reiniciar el ejercicio conserva el color configurado y permite que el motor haga el
  primer movimiento cuando corresponda;
- en desarrollo se muestra un selector temporal **Color del alumno**, junto con el turno inicial, y
  una exportación JSON estable de objetivo/color para incorporar las decisiones al contenido antes
  de retirar la herramienta de autoría;
- la migración a esquema 10 conserva los objetivos ya preparados; en contenido incluido convierte
  «pérdida del bando al turno» en «victoria del alumno con el bando contrario», pues todavía no hay
  ejercicios de resistencia. Para victorias y tablas mantiene inicialmente el color que mueve hasta
  que cada posición de tablas sea revisada.

Validación automática: 155 pruebas frontend en 28 archivos, TypeScript y lint focalizado aprobados;
la build web de producción también finaliza correctamente con el aviso de tamaño de chunk ya conocido.

El contenido quedó fijado después de la revisión manual: 180 posiciones incluidas guardan objetivo y
color del alumno en sus PGN (63 en Parte 1, 63 en Parte 2 y 54 en Parte 3). El cargador utiliza esos
metadatos en instalaciones limpias y se retiraron el selector y la exportación temporales.
La versión 2 del contenido también refresca instalaciones existentes sobre los mismos IDs, preserva
su progreso y elimina cualquier set incluido obsoleto sin tocar los sets propios. Esto evita que una
release que reutiliza el perfil local de la versión dev conserve objetivos antiguos «por definir».
