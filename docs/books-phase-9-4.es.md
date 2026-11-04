# Fase 9.4 — Libros y posiciones desde imagen

Inicio: 2026-11-02. Cierre: 2026-11-04, publicada en **0.24.0**. Ideas: I-55 (Libros), I-56
(reconocedor propio de diagramas), I-57 (posición desde imagen) y, opcional, I-59 entrega 1 (vídeo
local), del segundo estudio de mercado (`docs/market-study-2.es.md`). Material del autor: 19 libros de prueba en una carpeta local que
**nunca** sale de su PC ni entra en el repositorio.

## Estado por paso

| Paso | Qué                                                         | Estado                        |
| ---- | ----------------------------------------------------------- | ----------------------------- |
| 0    | Diagnóstico de la biblioteca                                | Hecho (2026-11-02)            |
| 1    | Pruebas de `pdf.js` y del runtime ONNX en Rust              | Hecho (2026-11-02)            |
| 2    | Datos sintéticos, entrenamiento de I-56, manifiesto y cards | Hecho (2026-11-02)            |
| 3    | I-57: posición desde imagen en el editor                    | Hecho (2026-11-02)            |
| 4    | I-55: biblioteca, lector y doble clic en diagramas          | Hecho (2026-11-02)            |
| —    | Rediseño de Libros y modelo 1.1.0                           | Hecho (2026-11-03)            |
| —    | Etiquetas del autor y modelo 1.2.0                          | Hecho (2026-11-03)            |
| —    | Adaptación por libro                                        | Hecho (2026-11-03)            |
| 5    | I-55: «Abrir esta partida» desde la notación                | Hecho (2026-11-04)            |
| 6    | Opcional: I-59 entrega 1                                    | Aplazado a la próxima versión |

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
`DATASET_CARD.md` y `MODEL_CARD.md`. El primer modelo publicado fue **diagram-squares 1.0.0**
(`models/1.0.0/`): 293 k parámetros, 1,17 MB en ONNX, 36 ms por tablero con `rten`. Desde el
2026-11-03 la app usa **1.2.0** (abajo, «Modelo 1.2.0»).

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
- El modelo y su manifiesto viajan como recursos desde `ml/diagram-recognizer/models/<versión>/`
  (1.1.0 desde el 2026-11-03).
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

## Paso 4 — Libros: biblioteca, lector y doble clic (I-55)

**Libros** en el menú lateral: biblioteca de PDF que guarda solo la ruta y la huella (SHA-256 del
archivo, en Rust), con el último punto de lectura; avisa si un archivo ya no está y quitar un libro
nunca toca el archivo. Al abrir un libro, la pestaña de análisis pasa a tener tres paneles: **lector
| tablero | columna derecha**, con el tablero de análisis de siempre (motor, notación, guardar).

### Lector

- `pdf.js` 6.5 (build _legacy_, por el WebKit de macOS y Linux) en un **chunk diferido** que solo se
  descarga al abrir un libro; el archivo se lee por rangos desde el protocolo `asset:`, así que un
  libro de 700 páginas no se carga entero. Las páginas están virtualizadas: solo se dibujan las
  visibles (y una más).
- Los decodificadores WASM (JBIG2, JPEG 2000), CMaps y fuentes estándar se sirven en `/pdfjs/` con
  un plugin de Vite. La CSP añade `asset:` a `connect-src` y `'wasm-unsafe-eval'` a `script-src`
  (conserva los orígenes que antes heredaba de `default-src`).
- Zoom, salto de página, cerrar el libro (vuelve al diseño normal) y vuelta al último punto.

### Doble clic en un diagrama

1. **Imagen incrustada bajo el clic** (13 de los 19 libros de prueba): se toman sus píxeles ya
   decodificados por `pdf.js`, sin volver a dibujar la página.
2. **Si no hay** (escaneos, diagramas vectoriales): el detector de página (abajo) encuentra todos
   los tableros de la página y se toma el que está bajo el clic.
3. El reconocedor del paso 3 lee la posición; si hay casillas dudosas o rompe una regla, se abre el
   editor con las dudas en rojo.
4. **Turno y número de jugada** salen del texto (`src/utils/bookText.ts`): una frase («Juegan las
   negras», «White to move»), la primera jugada debajo del diagrama («15...», «8.0-0»), la última
   encima («7.Nge2 c6» → juegan blancas, 8), o la jugada que sigue a una referencia «Diagram 11-7»
   cuando el diagrama está en otra columna. La tarjeta muestra de qué texto salió; si no lo
   encuentra, lo dice.
5. **Correcciones por libro**: «Guardar corrección» guarda la posición del tablero para ese diagrama
   (`books/<id>.json`, versionado, con lo que leyó el modelo); la próxima vez se abre esa. Son, a la
   vez, etiquetas reales para medir el modelo en privado.

### Detector de página (tras la primera prueba del autor)

La primera prueba con _How to Reassess Your Chess_ y _Steps Method 3_ falló en todos los tableros:
el doble clic recortaba el 60 % o el 90 % del ancho de la página y el localizador exige que el
tablero ocupe al menos el 45 % del recorte, pero esos diagramas ocupan ~27 % de la página (y
_Steps_ tiene 12 por página). PdfCraft-xadrez sí los leía porque busca en la página entera.

**Detector de página** (`onyx_diagrams/detect.py` y `src-tauri/src/diagram/detect.rs`, con paridad
exacta entre ambos):

- prueba todas las posiciones y tamaños de 8 % a 70 % del ancho (paso del 3 %) sobre la página
  reducida a 400 px, con la señal (oscuridad + textura) medida a resolución completa antes de
  reducir, para que una trama tenue no se vuelva gris liso;
- puntúa cada candidato por **acuerdo entre vecinas**: de los 112 pares de casillas adyacentes, la
  proporción en que la oscura es más oscura que la clara, midiendo cada casilla en sus **cuatro
  esquinas** (las piezas son redondas y van centradas). Un tablero da 0,85–1 aunque esté lleno de
  piezas; el texto y el papel, ~0,5, sea cual sea su contraste. El contraste medio, que se probó
  antes, confundía párrafos con tableros;
- toma máximos locales de mayor a menor sin solaparse y afina cada uno a resolución completa con la
  pasada fina del localizador, en su vecindad (una búsqueda más amplia saltaba al tablero vecino);
- en Rust, cada tamaño en paralelo y un corte temprano cuando un candidato ya no puede llegar al
  umbral (mismo resultado que el cálculo completo): de 5,8 s a ~1 s por página.

| Páginas renderizadas (tableros 8 × 8)            | Encontrados | Falsos positivos |
| ------------------------------------------------ | ----------: | ---------------: |
| _Steps_ (2 páginas de 12)                        |       24/24 |                0 |
| Prio y Vilela, de colores (3 páginas)            |       16/16 |                0 |
| Hellsten, Kornev, Silman, _Reassess_ (5 páginas) |       18/19 |                0 |
| Páginas solo de texto (_Reassess_)               |           — |                0 |

Los mini-tableros de 4 × 4 («posiciones finales» de Prio) quedan fuera, como diagramas parciales.

**Marca de turno junto al diagrama**: una marca compacta (punto, triángulo, cuadrado) a la derecha
del tablero, a la altura de la última fila (negras) o de la primera (blancas). En _Steps_ coincide
con los puntos impresos; un cuadro de texto pegado al diagrama ya no cuenta como marca.

**Turno legal**: si el bando que no juega está en jaque, el turno se cambia (para el editor y para
Libros).

**Interfaz**: botón **«Encontrar los diagramas de esta página»** que marca cada tablero en verde
(seguro) o naranja (por revisar); un clic lo monta. En escaneos, el doble clic usa el mismo
detector. La tarjeta dice de dónde salió el turno (marca, texto o jaque) y tiene **«Usar esta
posición»**, que cierra el editor para jugar desde ella.

### Mediciones

- **Turno encontrado en el texto**: 215 de 394 diagramas de los libros del autor (55 %); 60 % sin
  McDonald, cuya capa de texto es ilegible. Yusupov pasó de 0 a 26/30 con la regla de las
  referencias «Diagram N». Herramienta: `ml/diagram-recognizer/tools/eval_turns.mjs`.
- **Coste para quien no usa Libros**: el bundle principal queda en ~5,66 MB (la referencia del
  estudio era 5,67 MB); `pdf.js` y el lector van en un chunk propio de 577 KB, más el worker
  (1,3 MB) y los recursos de `/pdfjs/` (3,5 MB), que solo se piden al abrir un libro.
- **Latencia del doble clic**: la tarjeta muestra los milisegundos de cada lectura; pendiente de
  medir en la app con los libros del autor (criterio: < 300 ms en un diagrama incrustado).

## Rediseño de Libros (2026-11-03)

Tras usarlo con _How to Reassess Your Chess_, el problema principal era el espacio: el libro ocupaba
media pantalla y tablero y columna derecha se repartían la otra mitad, «la mitad de la mitad» para
cada uno. Inspiración: PdfCraft-xadrez (libro a un lado, tablero y el resto debajo), adaptada a los
paneles de Onyx.

### Dos columnas: libro | estudio

- **Columna de estudio** (`src/components/tabs/BookStudyColumn.tsx`), que se desplaza como una
  página. La primera versión (tablero sobre las dos zonas de siempre, con un divisor) dejaba el
  tablero pequeño, porque tomaba su tamaño de la altura y desperdiciaba el ancho, y dejaba
  inutilizables la notación y las pestañas. Se rehízo el mismo día:
  - Arriba, la franja del último diagrama leído.
  - Debajo, el tablero más grande que cabe en el alto visible (medido: barras, eval bar, motor). Al
    lado lleva un riel con sus herramientas (`BoardControls`) y, al editar la posición, la paleta de
    piezas en vertical. Debajo, botones de jugada delgados y la franja del motor, que aquí no se
    oculta con la pestaña Análisis porque está más abajo.
  - La notación se coloca al lado del tablero si quedan ≥ 300 px de ancho, y debajo si no. Debajo
    tiene alto ajustable con un tirador (doble clic: 340 px). Se puede ocultar, pero se muestra por
    defecto (`bookStudyColumn-v1`).
  - Más abajo, las pestañas Análisis, Base de datos, Partidas e Info, con el alto de la columna.
  - Si el tablero sale de la vista, una barra fija arriba muestra ‹ ›, la jugada actual y
    «Tablero ↑».
  - El análisis normal no cambia: `BoardAnalysis` solo cambia la colocación cuando la pestaña
    tiene un libro (`Board` con `fitWidth`, `MoveControls` con `compact`, `EditingCard` sin paleta).
- El reparto libro | estudio empieza al 50 % y se guarda (`bookWindowsState-v2`).

### Lector

- Barra única: **volver a la biblioteca**, título, **Diagramas**, diagrama anterior/siguiente,
  herramienta (seleccionar texto o mano), página y zoom; «Cerrar el libro» pasa al menú «⋯».
- **Zoom continuo** con Ctrl + rueda, anclado bajo el cursor; menú con ajustar al ancho, página
  completa y 100 %. Mientras se hace zoom la página se estira y se vuelve a dibujar al parar
  (180 ms), sin parpadeo: se dibuja fuera de pantalla y se copia.
- **Seleccionar texto**: capa de texto de pdf.js (solo sus reglas de selección, sin el CSS del
  visor). Un doble clic en una palabra la selecciona; en un diagrama, lo lee.
- **Mano**: arrastrar para moverse; el puntero solo se captura al moverse, así que el doble clic
  sigue llegando a la página.
- Virtualización propia: todas las páginas se colocan con el tamaño de la primera, así que las
  visibles y el salto a una página son aritmética.

### Diagramas

- **Modo Diagramas**: marca los diagramas de las páginas visibles en segundo plano (verde seguro,
  naranja por revisar, azul con corrección guardada); un clic monta la posición. Las imágenes
  incrustadas se leen una a una; las páginas escaneadas pasan por el detector; las de solo texto no
  cuestan nada. Cada página se lee una vez.
- **Diagrama anterior/siguiente**: en orden de lectura (por filas, después de izquierda a derecha),
  desde el último leído o desde la página actual, hasta 40 páginas. Para libros de ejercicios.
- **Franja del diagrama** encima del tablero (sustituye a la tarjeta que tapaba la página): estado,
  «Pág. N» (vuelve al diagrama en el libro), turno y número de jugada editables con un clic, de
  dónde salió el turno, girar, guardar corrección y «Usar esta posición» cuando el editor está
  abierto. Los milisegundos pasan al título del botón de página.

### Biblioteca

- Rejilla de portadas (la primera página, 320 px en JPEG, guardada en `books/covers/<id>.jpg`; se
  dibuja una vez y solo entonces se carga pdf.js), progreso de lectura, «Continuar leyendo» con el
  último libro, búsqueda, arrastrar PDF a la ventana y **Localizar el archivo…** para un libro
  movido (se acepta solo si su SHA-256 es el mismo, así conserva punto de lectura y correcciones).
- Un libro que ya está abierto en una pestaña lleva la marca «Abierto» y abrirlo vuelve a esa
  pestaña.

## Modelo 1.1.0 (2026-11-03)

**Permiso.** sadsnake1, autor de maestro, staunty, cardinal, tatiana, fresca, gioco, dubrovny e
icpieces (CC BY-NC-SA 4.0), respondió el 2026-11-02 por Buy Me a Coffee: «Yes, use the sets. I am
happy if more people will use the piece sets.» Queda registrado en la dataset card. Alpha
(Everyman) sigue sin permiso.

| Dataset | Cambio                                                          | Resultado en los libros del autor                                               |
| ------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| v6      | + 8 juegos (impreso y pantalla), 12 000 tableros                | 236 aceptados (antes 242): el rey negro de Alpha vuelve a leerse blanco         |
| v7      | Los 4 juegos sombreados solo en pantalla (en tinta son macizos) | **250 aceptados**, 0 diagramas aceptados por ambos modelos con lectura distinta |

| Medida                             |     1.0.0 |   1.1.0 |
| ---------------------------------- | --------: | ------: |
| Sintético v7, casillas             |   99,42 % | 99,85 % |
| Sintético v7, tableros exactos     |    80,7 % |  94,0 % |
| Sintético v7, por revisar (0,95)   |    39,9 % |  16,1 % |
| Sintético, exactos entre aceptados | 99,51 % ¹ | 99,64 % |
| Libros del autor, aceptados        |       242 |     250 |
| Nuevos aceptados revisados a mano  |         — |   18/18 |

¹ En su propio test (v5). Una captura de tablero del autor que 1.0.0 leía con tres casillas mal
(dos damas como reyes y una torre negra como blanca) sale exacta y sin dudas. La captura de Lichess
girada sigue fallando, pero en el localizador, no en el modelo (caso abierto).

Bajan los «plausibles» (323 → 311) solo en dos libros que quedan por revisar con ambos modelos:
McDonald (fuente Alpha) e Illescas (casillas con textura de mármol, un estilo que ningún juego de
entrenamiento tiene).

## Modelo 1.2.0 (2026-11-03)

### Etiquetas del autor

Hasta 1.1.0 solo se sabía si el modelo **dudaba** en los libros del autor, no si acertaba. Ahora
hay verdad de referencia:

- `tools/label_books.py` abre una página local (solo 127.0.0.1) con el recorte junto al tablero
  leído, para confirmarlo con Enter o corregirlo casilla a casilla. Orden: 10 diagramas de cada
  libro por turnos (muestra equilibrada) y después los libros peor leídos. Se guarda en
  `private-eval/labels.json`, ignorado por git; nada sale del PC.
- `tools/eval_labels.py` mide cualquier informe de `eval_books.py` contra esas etiquetas, sobre
  todo los **aceptados pero mal leídos** (errores silenciosos). Las etiquetas valen para cualquier
  modelo futuro: no hay que repetirlas.
- El autor etiquetó 150: 95 bien leídos, 49 corregidos, 3 que no son diagramas y 3 saltados
  (tableros de números o letras, sin posición que leer). Las etiquetas **no entrenan** el modelo
  distribuido.

### Texturas (dataset v8)

Mirar las casillas que fallaban señaló dos estilos que el generador no tenía: el rayado desvaído y
roto de Hellsten (solo quedan fragmentos de las líneas) y los tableros grises en 3D de Illescas.
El v8 añade al estilo impreso rayado roto, punteado, mármol y madera (los tres últimos a veces
también, más suaves, en las casillas claras) y relieve 3D al 15 % de los tableros de pantalla.
Mismos juegos, misma arquitectura y mismo entrenamiento.

| Medida (umbral 0,95)                     |   1.1.0 |   1.2.0 |
| ---------------------------------------- | ------: | ------: |
| Sintético v8, casillas                   | 97,60 % | 99,75 % |
| Sintético v8, tableros exactos           |  78,0 % |  91,0 % |
| Sintético v8, por revisar                |  36,2 % |  23,3 % |
| Libros del autor, aceptados (de 387)     |     250 | **272** |
| Etiquetas: tableros exactos (de 144)     |      95 | **104** |
| Etiquetas: aceptados                     |      84 |      92 |
| Etiquetas: **aceptados pero mal leídos** |   **0** |   **0** |

Hellsten pasa de 4 a 8 tableros exactos de 10 e Illescas de 3 a 7 de 9. Los dos libros con la
fuente Alpha (McDonald y Lakdawala) siguen en 0 de 36, todos marcados para revisar: las piezas
negras de esa fuente, macizas con líneas blancas, se confunden sobre todo en casillas rayadas.
Eso no lo arregla el generador sin una fuente parecida a Alpha; es el caso para el que se pensó
la adaptación por libro (aprender de las correcciones del usuario en ese mismo libro).

## Adaptación por libro (2026-11-03)

Las fuentes muy distintas de los juegos libres (Alpha, sobre todo) no se arreglan con el
generador. En su lugar, el lector **aprende de las correcciones del usuario dentro de cada libro**:

- El ONNX de 1.2.0 tiene una segunda salida, `features` (los 128 valores antes del clasificador).
- Al guardar un diagrama o pulsar «Usar esta posición» en uno que pedía revisión, Rust guarda las
  features de sus casillas con la pieza correcta en `books/<id>.memory.bin` (datos de la app,
  junto a las notas del libro; nunca sale del PC). Todas las piezas y 8 casillas vacías por
  tablero; volver a guardar el mismo diagrama sustituye lo aprendido de él.
- Al leer otro diagrama del libro, cada casilla se compara con las recordadas (similitud del
  coseno, las 5 más cercanas). Si se parece lo bastante, su voto se mezcla con la respuesta del
  modelo. Las constantes van en el manifiesto (`adaptation`); `tools/sim_adapt.py` es la
  referencia y la prueba privada `private_adaptation` de Rust reproduce sus totales.
- **Una casilla que la memoria cambia queda siempre dudosa**: la memoria corrige la lectura, pero
  nunca hace aceptar un tablero que el modelo solo marcaría para revisar. Dejar que las
  coincidencias claras contaran como seguras costaba 2 errores silenciosos en 143 tableros.
- La franja del diagrama dice cuántas casillas cambió lo aprendido. En el menú «⋯» del lector,
  **Olvidar lo aprendido (N)** borra la memoria del libro (las correcciones guardadas se quedan).
- Coste: unos milisegundos por tablero. Si cambia el modelo, la memoria se ignora y se empieza de
  nuevo.

Simulación con las etiquetas del autor (cada libro en orden de páginas, aprendiendo de cada
tablero que queda por revisar):

| 143 tableros etiquetados        |  Solo el modelo | Adaptado al libro |
| ------------------------------- | --------------: | ----------------: |
| Tableros exactos                |             104 |           **138** |
| Aceptados                       |              92 |                92 |
| Aceptados pero mal leídos       |               0 |                 0 |
| Casillas que corregir a mano    |             382 |            **43** |
| — los dos libros con Alpha (36) | 352 (0 exactos) |   15 (32 exactos) |

En un libro con Alpha, el primer diagrama se corrige a mano; desde el segundo, el lector propone
las piezas bien casi siempre y el usuario solo confirma.

## Paso 5 — «Abrir esta partida» (2026-11-04)

**Doble clic en una jugada del texto** → el tablero va a esa posición, con la línea del libro en
la notación (la parte de después también, para seguirla con las flechas). La jugada en la que
está el tablero se marca en amarillo en la página y «Página N» de la franja vuelve a ella. Un clic
simple o una selección de texto no cambian nada, y un doble clic en una palabra que no es una
jugada solo la selecciona, como antes.

### Cómo se lee la línea (`src/utils/bookGame.ts`)

- **Texto:** la capa de texto de la página, la anterior y la siguiente (partidas que cruzan
  páginas), en orden de lectura. Se reparan sin mover caracteres los números partidos por el OCR
  («1 9 . . .») y los puntos impresos como viñetas o con espacios («24. . . . Te5», «20 •• .Ah6»).
- **Jugadas:** letras inglesas, españolas (también italianas y francesas) y alemanas; figurines
  Unicode; capturas con `x`, `:` o sin marca (`ed5`); coronaciones; enroques con `O` o `0`; y
  figurines destrozados por el OCR o ClearScan (`ttJf3`, `ltlxb3`, `%Vxd6`, `ie4t`): de ellos solo
  se fía la casilla, y la pieza sale de la legalidad. Si quedan dos candidatas, se desempata por
  cómo suele quedar cada figurine (`ttJ` caballo, `W` dama…) o por lo ya leído en la línea; si no,
  la jugada se marca como ambigua en vez de elegir.
- **Qué jugadas forman la línea:** los números («4.», «4…», «29 ...») dan el medio movimiento; las
  respuestas sin número lo heredan; la prosa corta la serie. Hacia atrás desde la jugada pulsada,
  cada medio movimiento es el más cercano impreso antes que no esté dentro de un paréntesis ajeno.
  Las variantes entre paréntesis sustituyen a la jugada anterior, y las que el libro introduce en
  la prosa («Other moves are less stubborn: 5.Kd3 Kb1…») se saltan porque su serie empieza antes
  de lo que la línea necesita.
- **Desde dónde:** se prueban, en orden, los diagramas encima de la jugada en su página (el más
  cercano primero; con su corrección guardada o su lectura adaptada al libro, y el turno del
  texto), el tablero tal como está, los diagramas de la página anterior y la posición inicial.
  Gana el primero desde el que toda la línea hasta la jugada pulsada es legal.
- **Si algo falla:** la primera jugada imposible o ambigua se marca en rojo en la página, el
  tablero se queda en la anterior y la franja lo dice («La línea se detiene en «Txe4»»). Nunca se
  salta una jugada ni se inventa una; el usuario sigue moviendo en su tablero como quiera.

### Medición en los libros del autor (`tools/eval_lines.mjs`, privado)

Para cada diagrama etiquetado de un libro con capa de texto, las jugadas impresas debajo se abren
desde la posición del diagrama, como haría un doble clic en cada una:

| Libro (texto)                             | Jugadas que llegan |
| ----------------------------------------- | -----------------: |
| Illescas (digital, español)               |              12/12 |
| Silman (digital, español)                 |                1/1 |
| De la Villa, _100 Endgames_ (digital)     |                4/7 |
| Kornev (ClearScan, figurines destrozados) |              16/28 |
| Hellsten, _Apertura I_ (OCR)              |              13/30 |
| Hellsten, _Medio juego II_ (OCR)          |               5/18 |
| Bronstein (OCR, dos columnas de jugadas)  |              10/19 |
| **Total**                                 |         **62/122** |

En los digitales limpios casi todo llega; los tres fallos de De la Villa son amenazas que el texto
menciona («threatening 2.Kb1») y que no se pueden jugar en ese orden, y quedan marcadas. En los
escaneos el límite es el OCR: casillas ilegibles (`fü8`), jugadas que el texto pone en columnas o
números de página mezclados con la partida. La capa de texto de McDonald es basura (fuente con
codificación propia) y la de Lakdawala apenas tiene números de jugada legibles: ahí la línea no se
encuentra y no pasa nada.

## Cierre (2026-11-04)

La fase se publica en **0.24.0** con los pasos 0 a 5. Frente a los criterios de salida:

- **Exactitud publicada** en el conjunto sintético y en el privado (model card de 1.2.0 y las
  secciones de arriba): cumplido.
- **Ninguna lectura dudosa presentada como segura**: 0 tableros aceptados y mal leídos contra las
  etiquetas del autor, con el modelo solo y con la adaptación por libro: cumplido.
- **Una partida abierta desde la notación reproduce sus jugadas o marca la primera imposible**:
  cumplido; la lectura es todavía inexacta en los escaneos con OCR y se mejorará con el uso.
- **Sin regresión para quien no usa Libros**: el bundle principal no cambia; `pdf.js`, el lector y
  el modelo se cargan solo al abrir un libro o leer una imagen.
- **Doble clic → tablero en < 300 ms**: el reconocedor tarda 76 ms de mediana por imagen en Rust;
  la medida completa en la app queda para la semana de pruebas del autor tras la release (la franja
  muestra los milisegundos de cada lectura).

**Aplazado:** el paso 6 (vídeo local, I-59 entrega 1) pasa a la versión siguiente, por decisión del
autor.
