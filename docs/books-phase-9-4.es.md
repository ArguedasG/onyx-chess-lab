# Fase 9.4 — Libros y posiciones desde imagen

Inicio: 2026-11-02. Ideas: I-55 (Libros), I-56 (reconocedor propio de diagramas), I-57 (posición
desde imagen) y, opcional, I-59 entrega 1 (vídeo local), del segundo estudio de mercado
(`docs/market-study-2.es.md`). Material del autor: 19 libros de prueba en una carpeta local que
**nunca** sale de su PC ni entra en el repositorio.

## Estado por paso

| Paso | Qué                                                         | Estado                      |
| ---- | ----------------------------------------------------------- | --------------------------- |
| 0    | Diagnóstico de la biblioteca                                | Hecho (2026-11-02)          |
| 1    | Pruebas de `pdf.js` y del runtime ONNX en Rust              | Hecho (2026-11-02)          |
| 2    | Datos sintéticos, entrenamiento de I-56, manifiesto y cards | Hecho (2026-11-02)          |
| 3    | I-57: posición desde imagen en el editor                    | Hecho (2026-11-02)          |
| 4    | I-55: biblioteca, lector y doble clic en diagramas          | Siguiente                   |
| 5    | I-55: «Abrir esta partida» desde la notación                | Pendiente                   |
| 6    | Opcional: I-59 entrega 1                                    | Pendiente (decide el autor) |

## Paso 0 — Diagnóstico de la biblioteca

Herramienta: `scripts/books/diagnose-pdfs.mjs <carpeta>`. Lee con `pdf.js` una muestra de 24
páginas por libro y guarda solo metadatos (productor, fuentes, texto visible o invisible, imágenes
y su resolución) en `lab-results/books-diagnosis/report.json`, que git ignora. Tarda unos 35 s con
los 19 libros (382 MB).

### Resultado

| Tipo de libro                                     | Libros | Diagramas                     |
| ------------------------------------------------- | -----: | ----------------------------- |
| Digital (Word, calibre, iText…)                   |      4 | Imágenes incrustadas          |
| Escaneo vectorizado con ClearScan (fuentes `Fd…`) |      9 | Imágenes incrustadas          |
| Escaneo con capa de OCR invisible                 |      2 | Dentro de la imagen de página |
| Escaneo sin texto                                 |      4 | Dentro de la imagen de página |
| **Con fuente de diagramas**                       |  **0** | —                             |

| Libro (abreviado)                     | Tipo              | Píxeles por casilla |
| ------------------------------------- | ----------------- | ------------------: |
| De la Villa, _100 Endgames_           | Digital (calibre) |                  38 |
| Hansen, _Endgames For Dummies_        | Digital           |                  48 |
| Illescas, _Curso completo_            | Digital           |                  35 |
| Silman, _Curso de finales_            | Digital (Word)    |                  47 |
| Bronstein, _Zúrich 1953_              | ClearScan         |                  70 |
| _Chess Endgames for Kids_             | ClearScan         |                 155 |
| Hellsten, _Apertura I_                | ClearScan         |                 141 |
| Hellsten, _Medio juego II_            | ClearScan         |                  80 |
| Kornev, _Black Repertoire_            | ClearScan         |                  27 |
| McDonald, _Against 1.e4_              | ClearScan         |                  31 |
| De la Villa, _Workbook_               | ClearScan         |                  64 |
| Lakdawala, _The Slav_                 | ClearScan         |                  52 |
| Yusupov, _Chess Evolution 2_          | ClearScan         |                  73 |
| Silman, _Reassess_                    | Escaneo + OCR     |    página a 300 dpi |
| Yusupov, _Boost Your Chess 1_         | Escaneo + OCR     |    página a 300 dpi |
| Hellsten, _Final II_                  | Escaneo sin texto |    página a 150 dpi |
| Kasparov, _Mis geniales predecesores_ | Escaneo sin texto |    página a 274 dpi |
| Prio y Vilela, _Intermedio 1_         | Escaneo sin texto |    página a 300 dpi |
| _Steps Method 3_                      | Escaneo sin texto |    página a 300 dpi |

Píxeles por casilla: mediana del ancho de la imagen del diagrama × 0,92 / 8 (el borde aproximado).

### Qué cambia respecto al plan

1. **La lectura por fuente sale de 9.4 (decisión del autor, 2026-11-02).** Ninguno de los 19
   libros compone los diagramas con una fuente de ajedrez: en los 15 que tienen capa de texto el
   diagrama es una imagen incrustada, y en los otros 4 es parte del escaneo. El estudio suponía lo
   contrario («el 80 % del valor está en la lectura por fuente»). El modelo I-56 es el camino
   crítico de Libros. La lectura por fuente se retoma solo si aparecen PDF que la necesiten (libros
   exportados de ChessBase, por ejemplo).
2. **Dos formas de encontrar el diagrama.** Si es una imagen incrustada, `pdf.js` da su rectángulo
   exacto: basta recortar. Si es parte de un escaneo (6 libros y el fondo de los ClearScan), hace
   falta detectar el tablero con visión clásica cerca del doble clic.
3. **Resolución baja.** Hay diagramas con 27–31 píxeles por casilla (Kornev, McDonald). El modelo
   trabaja a 48 × 48 y se entrena con reducciones a 20–40 px antes de reescalar, para que vea ese
   caso.
4. **Notación.** Los digitales usan letras (inglés o español: `Rg8`, `Qh3`) y se leen limpios. Los
   ClearScan y los OCR destrozan los figurines (`ltJxh7` por `Cxh7`, `'l!Mc8` por `Dc8`). La
   lectura se hará guiada por la legalidad: entre las jugadas legales, la que coincide en casilla
   de destino, captura, jaque y coronación; si quedan dos, se marca como dudosa en vez de elegir.
5. **`pdf.js` necesita sus decodificadores WASM** (JBIG2 y JPEG 2000). Sin ellos, los escaneos y
   muchos diagramas salen en blanco sin dar error. En el webview hay que servir `wasm/` junto al
   worker; en Node, darlos como rutas de archivo.

## Paso 1 — Runtime y `pdf.js`

`pdfjs-dist` 6.5.438 (Apache-2.0) añadido como dependencia. Se cargará como chunk diferido en
la ruta de Libros. Renderizar una página en Node tarda 25–280 ms según el libro, a escala 1–1,3.

### Runtime ONNX

Modelo de prueba: `SquareNet` sin entrenar (293 k parámetros, 1,17 MB en FP32, opset 17), que es
la arquitectura candidata. Banco en `ml/diagram-recognizer/runtime-bench/`, con la misma entrada
determinista y la salida de ONNX Runtime como referencia. Medido en el i5-1135G7 de referencia,
mediana de 30 ejecuciones.

| Runtime                   | Binario |  Carga | 64 casillas a 48 px | 128 (con giro 180°) | 64 casillas a 64 px | Paridad |
| ------------------------- | ------: | -----: | ------------------: | ------------------: | ------------------: | ------- |
| **`rten` 0.24.0**         |  4,3 MB | 1,6 ms |           **34 ms** |               99 ms |               77 ms | 7,5e-9  |
| `tract-onnx` 0.23.9       | 24,0 MB |  10 ms |              140 ms |              242 ms |              223 ms | 7,5e-9  |
| ONNX Runtime (referencia) |     DLL |      — |               14 ms |               24 ms |               23 ms | —       |

El binario de base (sin runtime) pesa 0,15 MB, así que la columna «Binario» es casi todo lo que
añade cada runtime.

### Decisiones

- **`rten` 0.24.0.** Seis veces más pequeño y cuatro veces más rápido que `tract`, Rust puro y sin
  DLL. Es la última versión que compila con el Rust 1.92 del proyecto; de la 0.25 en adelante pide
  1.94. Actualizar el toolchain queda para cuando haga falta.
- **Entrada de 48 × 48.** A 64 px la latencia se duplica y los diagramas reales rara vez tienen
  más detalle útil. Con 34 ms por tablero, el doble clic cabe holgado en los 300 ms del criterio
  de salida.
- **El giro de 180° no siempre.** Duplica el coste; se usa solo cuando la orientación no sale de
  las coordenadas, del texto o de la posición de los reyes y peones.
- ONNX Runtime es el más rápido, pero exige una DLL por plataforma, que es lo que 9.4 quiere evitar.

## Paso 2 — Reconocedor propio (I-56)

Todo está en `ml/diagram-recognizer/`: generador, entrenamiento, evaluación, exportación,
`DATASET_CARD.md` y `MODEL_CARD.md`. El modelo publicado es **diagram-squares 1.0.0**
(`models/1.0.0/`): 293 k parámetros, 1,17 MB en ONNX, 36 ms por tablero con `rten`.

### Cómo se hizo

- **Datos solo sintéticos.** Posiciones de la base de puzzles de Lichess (CC0) dibujadas en estilo
  impreso (60 %) y pantalla (40 %), de 18 a 110 px por casilla, con 12 juegos de piezas libres: 9
  de Lichess con licencia compatible con GPLv3 y 3 sacados de los glifos de ajedrez de fuentes
  libres (FreeSerif, DejaVu Sans y Noto Sans Symbols 2). Pirouetti queda fuera, como estilo nunca
  visto. Los juegos no libres (NC, «freeware» o sin licencia verificable) no se usan.
- **Localizador sin modelo** (`onyx_diagrams/locate.py`): busca el cuadrado de 8 × 8 con más
  contraste de ajedrezado, contando como oscuro tanto el gris como la trama. En 80 tableros
  sintéticos, 79 con error de cuadrícula p90 del 0,5 %.
- **Entrenamiento en CPU en tandas de 12 minutos reanudables**, con métricas en `metrics.jsonl`.
- **Calibración por temperatura** (0,639) y regla de revisión: un tablero es «por revisar» si una
  casilla tiene confianza < 0,95 o si rompe una regla de ajedrez (un rey por bando, sin peones en
  la primera ni en la octava fila, máximo 8 peones y 16 piezas por bando).
- **Paridad:** PyTorch ↔ ONNX Runtime 1,9e-6; PyTorch ↔ `rten` 2,4e-6 (tolerancia 1e-4).

### Iteraciones guiadas por los libros reales

Cada versión del dataset se probó a mitad de entrenamiento en una muestra de diagramas reales; si
aparecía un fallo sistemático se corregía el generador y se reentrenaba desde cero.

| Dataset | Fallo visto en los libros                                            | Cambio en el generador                                    |
| ------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| v1      | Piezas negras sobre trama leídas como reyes blancos                  | Halo de papel alrededor de las piezas en casillas oscuras |
| v2      | Tipo de pieza confundido con la fuente Alpha (Everyman)              | Piezas de imprenta de fuentes libres, grosor de tinta     |
| v3      | Rey negro de Alpha leído como blanco (detalles blancos interiores)   | Piezas negras «invertidas»                                |
| v4      | Peón de Alpha (alto, con collar y pedestal) leído como alfil o torre | Peones procedurales de proporciones aleatorias            |
| v5      | Peones negros de Alpha todavía dudosos                               | — (modelo publicado; queda como límite conocido)          |

### Resultados

| Conjunto                                 | Casillas | Tableros exactos | Por revisar (0,95) | Exactos entre aceptados |
| ---------------------------------------- | -------: | ---------------: | -----------------: | ----------------------: |
| Sintético, juegos de entrenamiento       |  99,81 % |           93,9 % |             18,5 % |                 99,51 % |
| Sintético, juego nunca visto (pirouetti) |  91,31 % |            0,0 % |             99,5 % |                       — |

Libros del autor (394 diagramas de 14 libros, sin etiquetas todavía): 387 tableros encontrados,
323 plausibles por reglas, **242 aceptados** y 145 por revisar (cifras con el localizador final del
paso 3). **Los 18 aceptados revisados a
mano, de 6 libros distintos, son todos correctos.** Por libro, de 30/30 aceptados (dos libros
digitales) a 0/30 en los dos compuestos con la fuente Alpha, donde todo queda por revisar.

### Límites

- Un diseño de pieza muy distinto de los vistos se lee mal (lo muestran pirouetti y la fuente
  Alpha). La confianza calibrada y las reglas lo marcan casi siempre, pero no siempre.
- La exactitud real en los libros se medirá con las etiquetas que produzca la pantalla de
  corrección del paso 3.
- El localizador tarda ~0,4 s por imagen en Python; en Rust, ~75 ms el pipeline completo (paso 3).

## Paso 3 — Posición desde imagen (I-57)

En el editor de posición, **«Desde imagen»**: abrir un archivo, pegar (Ctrl+V) o arrastrar una
imagen. El resultado se carga en el editor y las casillas dudosas se marcan en rojo sobre el
tablero hasta que el usuario las cambia. Un aviso dice si la lectura es segura, si hay que revisarla
(con las reglas que rompe) o si no hay tablero; muestra la imagen con la cuadrícula encontrada, un
botón para girar la lectura y el tiempo. El turno no se lee; los enroques se deducen de reyes y
torres en sus casillas iniciales.

### Runtime en Rust (`src-tauri/src/diagram/`)

- `preprocess.rs`: gris y remuestreo BOX **idénticos bit a bit a Pillow** (su aritmética de punto
  fijo de 22 bits), porque así se generaron los datos de entrenamiento.
- `locate.rs`: el localizador, operación por operación igual al de Python. Para que eso sea posible,
  el de Python pasó a normalizar por el área nominal de la celda y a usar la imagen integral en
  float64, donde toda suma es un entero exacto; además, una imagen casi uniforme no tiene tablero.
- `recognizer.rs`: el modelo con `rten`, cargado la primera vez que se usa (nada al arrancar), con
  temperatura y umbral leídos del manifiesto; reglas de ajedrez y orientación (peones; si no hay,
  reyes).
- Comandos `recognize_board_image` (base64, para pegar) y `recognize_board_image_file` (ruta,
  para abrir o arrastrar). Imágenes de más de 1600 px se reducen antes.
- El modelo y su manifiesto viajan como recursos desde `ml/diagram-recognizer/models/1.0.0/`.
  El binario crece por `rten` e `image`; el modelo pesa 1,17 MB.

### Paridad y rendimiento

| Prueba (`cargo test --release diagram::`)                 | Resultado                                  |
| --------------------------------------------------------- | ------------------------------------------ |
| Gris y remuestreo BOX contra Pillow                       | Idénticos bit a bit                        |
| Cuadrícula y 64 recortes contra Python (6 tableros)       | Idénticos bit a bit                        |
| Logits contra ONNX Runtime y la referencia del manifiesto | Diferencia ≤ 1e-4                          |
| Libros del autor (394 imágenes, prueba ignorada)          | **394/394 con el mismo estado** que Python |

Tiempo del pipeline completo en Rust (release, i5-1135G7) sobre los 394 diagramas: **mediana
76 ms, p90 107 ms, máximo 214 ms**, dentro de los 300 ms del criterio de salida.

Fixtures: `src-tauri/fixtures/diagram/`, escritos por
`ml/diagram-recognizer/tools/make_parity_fixtures.py`.
