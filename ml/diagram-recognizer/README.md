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
| `tools/export_probe.py`            | Paso 1: red sin entrenar para medir runtimes                                |
| `runtime-bench/`                   | Paso 1: banco en Rust de `rten` y `tract` (no entra en la app)              |
| `models/<versión>/`                | Modelos publicados: ONNX, manifiesto, paridad y métricas                    |
| `DATASET_CARD.md`, `MODEL_CARD.md` | Fichas del dataset y del modelo                                             |
| `runs/`, `data/`                   | Salidas locales (ignoradas por git)                                         |
| `private-eval/`                    | Recortes de los libros del autor: **nunca** se suben ni entrenan nada       |

## Reproducir el modelo 1.0.0

Las fuentes (FreeSerif, DejaVu Sans y Noto Sans Symbols 2) se descargan de sus sitios oficiales a
`data/fonts-download/`. La generación tarda ~4 min y el entrenamiento ~27 min en CPU, en tandas.

```bash
node ml/diagram-recognizer/tools/render_pieces.mjs
.venv/Scripts/python tools/render_glyph_pieces.py
.venv/Scripts/python tools/generate.py --db "<Lichess Puzzles.db3>" --out data/v5
.venv/Scripts/python tools/train.py --name v5 --data data/v5 --epochs 3
.venv/Scripts/python tools/evaluate.py --run runs/v5 --data data/v5
.venv/Scripts/python tools/export.py --run runs/v5 --data data/v5 --version 1.0.0 --threshold 0.95
```

`render_pieces.mjs` se lanza desde la raíz del repositorio; lo demás, desde esta carpeta.
`train.py` se repite hasta que diga «training finished».

## Reglas

- Se entrena **solo con datos sintéticos** de licencia limpia.
- Los libros del autor sirven únicamente como evaluación privada y no salen de su PC.
- Ningún peso ajeno (ChessQ, PdfCraft-xadrez) se copia aquí.
