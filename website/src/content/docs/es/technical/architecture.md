---
title: Arquitectura
description: Cómo está construido Onyx Chess Lab, de la interfaz al índice de posiciones y el reconocedor de diagramas.
---

Onyx es una aplicación de escritorio con una interfaz web y un núcleo nativo. Esta página resume las piezas principales y las decisiones detrás de ellas.

## Visión general

| Capa | Tecnología |
| --- | --- |
| Aplicación de escritorio | [Tauri 2](https://tauri.app/) (Windows, macOS, Linux) |
| Interfaz | React 19, TypeScript, Mantine, TanStack Router, Jotai |
| Núcleo | Rust: bases de datos, índices, motores, archivos y sistema |
| Bases de partidas | SQLite (`.db3`) con índices propios mapeados en memoria |
| Motores | Procesos UCI gestionados desde Rust |
| Reconocedor de diagramas | Red convolucional exportada a ONNX y ejecutada con [`rten`](https://github.com/robertknight/rten), Rust puro |
| Entrenamiento espaciado | [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) |

La interfaz no habla con el disco ni con los motores directamente: todo pasa por comandos de Rust con tipos generados para TypeScript.

## Bases de datos e índice de posiciones

Cada base es un archivo SQLite con las partidas y sus metadatos. Para buscar posiciones en bases de más de diez millones de partidas, Onyx construye índices aparte:

- **Índice de posiciones:** guarda cada jugada como su número dentro de la lista de jugadas legales, lo que lo hace muy compacto. Se serializa con [`rkyv`](https://rkyv.org/) y se lee con `mmap`, sin copiarlo a memoria: el sistema operativo carga solo las páginas que hacen falta.
- **Índice de patrones:** para búsquedas de piezas, donde casi nunca se puede descartar una partida pronto, guarda la línea principal como jugadas listas para reproducir. Reproducirlas es unas 17 veces más rápido que generar las jugadas legales en cada paso.

Los índices son datos derivados: están ligados a la revisión de la base, se reconstruyen si la base cambia y se pueden borrar sin perder nada. Las búsquedas se pueden cancelar y la lista de resultados se carga por páginas.

## Reconocedor de diagramas

La función **Libros** lee los diagramas de un PDF como posiciones. El reconocedor funciona sin conexión y tiene dos partes:

1. **Localizador**, sin modelo: encuentra la cuadrícula por el contraste del tablero.
2. **Clasificador por casilla** (`diagram-squares` 1.2.0): una red convolucional pequeña (293 053 parámetros, 1,17 MB en ONNX) que recibe cada casilla en 48 × 48 píxeles en gris y devuelve una de 13 clases: vacía o una de las 12 piezas. Un tablero se lee como un lote de 64 casillas en unos 36 ms en una CPU de portátil.

El modelo se entrenó **solo con datos sintéticos**: tableros generados a partir de posiciones de la base de puzzles de Lichess, dibujados con decenas de juegos de piezas y estilos de impresión (tramas, punteado, mármol, madera) y de pantalla. Después, el tablero se comprueba con las reglas del ajedrez, y si alguna casilla tiene una confianza calibrada menor que 0,95, el diagrama se marca para revisión.

| Prueba sintética | Casillas | Tableros exactos |
| --- | --- | --- |
| Total | 99,75 % | 91,0 % |
| Estilo impreso | 99,60 % | 86,4 % |
| Estilo de pantalla | 99,96 % | 97,4 % |

La paridad entre PyTorch, ONNX Runtime y `rten` se comprueba en las pruebas de Rust con una tolerancia de 1e-4. El generador de datos, el entrenamiento, la exportación, la ficha del modelo y la del dataset están en [`ml/diagram-recognizer`](https://github.com/ArguedasG/onyx-chess-lab/tree/main/ml/diagram-recognizer).

## Maia 3 gestionada

Los [bots humanos](../human-bots/) usan [Maia 3](https://github.com/CSSLab/maia3), escrita en Python con PyTorch. Para que nadie tenga que instalar Python, Onyx descarga un Python privado, crea un entorno virtual dentro de su carpeta de datos, instala la versión adecuada de PyTorch para cada sistema (solo CPU en Linux, 2.2.2 con un módulo de compatibilidad en Mac Intel) y registra el motor. Si la carpeta se mueve, detecta que el entorno quedó roto y ofrece repararlo con un clic.

## Distribución y actualizaciones

- Los instaladores se construyen en **GitHub Actions** para Windows x64, macOS (Apple Silicon e Intel) y Linux x64, a partir de cada etiqueta de versión.
- En Windows, el actualizador de Tauri descarga la versión nueva y comprueba su **firma minisign** antes de instalarla.
- En macOS y Linux, la app consulta la última versión publicada en GitHub y avisa con las notas en el idioma del usuario.
- El **catálogo de descargas** (bases, puzzles y motores) es un conjunto de JSON en la carpeta [`catalog/`](https://github.com/ArguedasG/onyx-chess-lab/tree/main/catalog) del repositorio. La app lo lee de GitHub, así que un enlace se corrige sin publicar una versión, y lleva una copia dentro por si no hay conexión.

## Calidad

Cada cambio pasa por comprobación de tipos, formato y lint, cientos de pruebas de TypeScript (Vitest) y de Rust, y auditorías propias: por ejemplo, que las traducciones de inglés y español estén completas o que la configuración del actualizador nunca vuelva a apuntar al proyecto original.

## En desarrollo

Un pipeline mensual en GitHub Actions para descargar, convertir, validar y publicar bases de datos actualizadas, con compresión `zstd` y un manifiesto versionado.
