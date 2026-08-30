# Fase 5 — Marca, auditoría release y preparación de la alpha

Fecha: 2026-08-30. Estado: nombre y ubicación local acordados; creación del repositorio pendiente.

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
| Bots y laboratorio | partida contra cada familia de motor, historial, generador individual/lote, experimento y liga beta                    |
| Producto           | español/inglés, escalado, tema claro/oscuro, iconos, versión, licencias y enlaces                                      |
| Rendimiento        | arranque, memoria, consultas grandes, cancelación, análisis largo y cierre de aplicación                               |

Para Finales se preparará una tabla canónica por posición con color del estudiante, objetivo
pedagógico, resultado aceptado y fuente del criterio. La interfaz de usuario mostrará el objetivo;
los campos editoriales y de validación permanecerán internos.

**Salida:** informe de auditoría cerrado, inventario priorizado P0–P3 y una decisión explícita sobre
qué P2/P3 se acepta para la primera alpha.

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
