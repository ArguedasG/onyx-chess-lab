# Reconocedor de diagramas (I-56, fase 9.4)

Clasificador por casilla para leer diagramas de libros y capturas de pantalla. Todo lo que hace
falta para reproducir el modelo vive aquí: generador de datos sintéticos, entrenamiento,
exportación a ONNX, manifiesto, prueba de paridad, model card y dataset card. La app solo incluye
el `.onnx` final y lo ejecuta con `rten` (Rust puro, sin DLL).

Detalle y decisiones: `docs/books-phase-9-4.es.md`.

## Entorno

Solo CPU. El entorno ocupa unos 760 MB y vive dentro de esta carpeta (`.venv/`, ignorada por git).
La caché de pip y los temporales se mandan a G: para no llenar C:.

```bash
export TMP="G:/dev/.tmp" TEMP="G:/dev/.tmp" PIP_CACHE_DIR="G:/dev/.cache/pip"
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

## Estructura

| Ruta                               | Qué es                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `onyx_diagrams/model.py`           | La red (`SquareNet`) y el orden de las 13 clases, que es parte del contrato |
| `onyx_diagrams/squares.py`         | Preprocesado de casillas: el contrato con el runtime en Rust                |
| `onyx_diagrams/locate.py`          | Localizador de la cuadrícula, sin modelo                                    |
| `onyx_diagrams/render.py`          | Generador de tableros sintéticos (impreso y pantalla)                       |
| `onyx_diagrams/positions.py`       | Posiciones desde la base de puzzles de Lichess                              |
| `tools/render_pieces.mjs`          | Rasteriza los juegos de piezas libres (Node, desde la raíz del repo)        |
| `tools/render_glyph_pieces.py`     | Juegos de piezas desde los glifos de ajedrez de fuentes libres              |
| `tools/generate.py`                | Genera un dataset versionado                                                |
| `tools/train.py`                   | Entrena en tandas reanudables (`--minutes`)                                 |
| `tools/evaluate.py`                | Evaluación sintética y calibración                                          |
| `tools/export.py`                  | ONNX, manifiesto y referencia de paridad                                    |
| `tools/extract_diagrams.mjs`       | Extrae los diagramas de los libros del autor (evaluación privada)           |
| `tools/eval_books.py`              | Evaluación privada en los libros, con galerías                              |
| `tools/eval_turns.mjs`             | Evaluación privada del turno leído del texto (Libros, paso 4)               |
| `tools/label_books.py`             | Etiquetado local de los diagramas privados (página en 127.0.0.1)            |
| `tools/eval_labels.py`             | Mide los informes de `eval_books.py` contra esas etiquetas                  |
| `tools/sim_adapt.py`               | Simula la adaptación por libro sobre las etiquetas (y fija su regla)        |
| `tools/sample_notation.mjs`        | Vuelca muestras de la capa de texto de los libros (cómo sale la notación)   |
| `tools/eval_lines.mjs`             | Evaluación privada de «Abrir esta partida» desde los diagramas etiquetados  |
| `tools/make_parity_fixtures.py`    | Fixtures de paridad para las pruebas de Rust (`src-tauri/fixtures/diagram`) |
| `tools/export_probe.py`            | Paso 1: red sin entrenar para medir runtimes                                |
| `runtime-bench/`                   | Paso 1: banco en Rust de `rten` y `tract` (no entra en la app)              |
| `models/<versión>/`                | Modelos publicados: ONNX, manifiesto, paridad y métricas                    |
| `DATASET_CARD.md`, `MODEL_CARD.md` | Fichas del dataset y del modelo                                             |
| `runs/`, `data/`                   | Salidas locales (ignoradas por git)                                         |
| `private-eval/`                    | Recortes de los libros del autor: **nunca** se suben ni entrenan nada       |

## Reproducir el modelo 1.2.0

Las fuentes (FreeSerif, DejaVu Sans y Noto Sans Symbols 2) se descargan de sus sitios oficiales a
`data/fonts-download/`. La generación tarda ~9 min y el entrenamiento ~43 min en CPU, en tandas.

```bash
node ml/diagram-recognizer/tools/render_pieces.mjs
.venv/Scripts/python tools/render_glyph_pieces.py
.venv/Scripts/python tools/generate.py --db "<Lichess Puzzles.db3>" --out data/v8
.venv/Scripts/python tools/train.py --name v8 --data data/v8 --epochs 3 --minutes 12
.venv/Scripts/python tools/evaluate.py --run runs/v8 --data data/v8
.venv/Scripts/python tools/export.py --run runs/v8 --data data/v8 --version 1.2.0 --threshold 0.95
```

`export.py` escribe en `runs/v8/export/`; `models/1.2.0/` reúne esos archivos con
`runs/v8/config.json` (`training-config.json`), `metrics.jsonl` (`training-metrics.jsonl`),
`eval.json` (`eval-synthetic.json`) y el `dataset.json` del dataset. Después,
`tools/make_parity_fixtures.py --db <…>` actualiza los fixtures de Rust. El modelo 1.0.0 (dataset
v5, 9 000 tableros de entrenamiento con `--train 9000` y los juegos de entonces) y el 1.1.0
(dataset v7, el generador de `0100f889`) quedan en `models/1.0.0/` y `models/1.1.0/`.

`render_pieces.mjs` se lanza desde la raíz del repositorio; lo demás, desde esta carpeta.
`train.py` se repite hasta que diga «training finished».

## Reglas

- Se entrena **solo con datos sintéticos** de licencia limpia.
- Los libros del autor sirven únicamente como evaluación privada y no salen de su PC.
- Ningún peso ajeno (ChessQ, PdfCraft-xadrez) se copia aquí.
