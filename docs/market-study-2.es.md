# Estudio de mercado 2 — reconocimiento de tableros, coaches con IA y otros

> Documento de trabajo, **ajeno al roadmap**, continuación de `docs/market-study.es.md`. Todo lo que
> aparece aquí es propuesta hasta que el autor lo pase al roadmap. Las ideas siguen la numeración del
> primer estudio (I-55 en adelante) para que el roadmap pueda citarlas igual.
>
> Inicio: 2026-11-01. Última actualización: 2026-11-01 (segunda ronda).

## 0. Cómo leer este documento

- **Sección 1**: el contexto que condiciona todo (rendimiento e instalaciones externas).
- **Sección 2**: reconocimiento de tableros y libros (ChessGaze, ChessQ/Lichess, PdfCraft-xadrez).
- **Sección 3**: coaches con IA (Chessiro, Chess Explainer).
- **Sección 4**: otros (DanceChess y la firma en macOS; ChessDB y los scripts de Python).
- **Sección 5**: catálogo de ideas con estado, esfuerzo y fase sugerida.
- **Sección 6**: preguntas para el autor y la opinión del estudio.

Estados y esfuerzo como en el primer estudio: Propuesta, Aceptada, En duda, Aplazada, Descartada;
**S** (días), **M** (1–2 semanas), **L** (fase propia). «Verificado» quiere decir comprobado en el
código, la documentación o la API el 2026-11-01; «inferido» es deducción nuestra y se marca así.

---

## 1. Restricciones que aplican a todo

1. **Rendimiento (sección 7 del primer estudio e I-54).** Nada nuevo corre al arrancar. Una
   funcionalidad pesada es una ruta propia con carga diferida (el bundle web base es de 5,67 MB), su
   trabajo pesado va en Rust o en un worker, en segundo plano, con progreso y cancelación, y sus
   resultados se guardan en caché en los datos privados.
2. **Instalaciones externas.** Hoy Onyx ya pide a parte, según el uso: Maia 3 (instalación
   administrada con Python privado, todavía sin validar en una PC limpia), bases de datos, base de
   puzzles y motores del catálogo. Regla propuesta para lo nuevo:
   - un modelo **pequeño** (unos pocos MB) viaja con la aplicación, como el modelo «Fast» de
     ChessGaze;
   - un modelo **grande** es una descarga opcional bajo demanda, con el mismo patrón que Maia
     (manifiesto, SHA-256, licencia visible, desinstalación);
   - **ninguna funcionalidad depende por completo de una descarga**: sin el modelo funciona de forma
     reducida y lo dice (como PdfCraft: «sin modelos, solo detecta»).
3. **Licencias.** Onyx es GPLv3. Un código o unos pesos ajenos se usan solo con licencia
   compatible, o como **descarga aparte** con su propia licencia mostrada al usuario.

---

## 2. Reconocimiento de tableros y libros

El problema tiene tres variantes, de mucho a poco fiable:

| Entrada                                          | Dificultad | Qué funciona hoy                                                                                         |
| ------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------- |
| PDF digital (diagramas dibujados con una fuente) | Baja       | Lectura **exacta sin modelo**: cada carácter de la fuente de diagramas es una pieza en una casilla.      |
| Diagrama rasterizado o escaneado, captura        | Media      | Clasificador pequeño por casilla (64 × 64 px → 13 clases) más reglas de legalidad. ~97–99 % por tablero. |
| Foto de un tablero real                          | Alta       | Modelos grandes de visión (ChessQ). 87–99 % por tablero según el conjunto de datos.                      |

Y la notación de los libros es otro problema por separado: en un PDF digital se lee de la capa de
texto (con fuentes de figurines); en un libro escaneado hace falta OCR de ajedrez, que es lo más
difícil de todo.

### 2.1. ChessGaze — https://chessgaze.com

**Qué es (verificado en el sitio):** aplicación gratuita para iOS y Android que convierte un tablero
físico en uno digital con la cámara: detecta piezas en tiempo real, registra las jugadas, tiene reloj
y exporta PGN. Sin cuentas, sin anuncios y con inferencia en el teléfono. El único dato técnico que
publica es que el detector está «basado en YOLO». No publica precisión ni licencia, y no es código
abierto.

**Los modelos que menciona el autor:** «Generic Fast» (nano, ~5 MB, incluido) y «Generic Stable»
(small, ~19 MB, descarga opcional) encajan con los tamaños nano y small de YOLO (_inferido_). Son
detectores de objetos para fotos de tableros reales, entrenados en sus propios juegos de piezas.

**Qué aprende Onyx:**

- el **patrón de dos niveles**: un modelo pequeño incluido que basta casi siempre y uno mejor como
  descarga opcional. Es justo la regla de la sección 1;
- un catálogo de modelos por tipo de material (genéricos, de madera, de torneo) es razonable si algún
  día hay un modelo de fotos.

**Descartado:** el seguimiento en tiempo real de un tablero físico. Onyx es de escritorio y no tiene
cámara apuntando a un tablero. Además, el YOLO de Ultralytics tiene licencia AGPL-3.0: no se puede
cerrar, aunque sí combinarse con GPLv3.

### 2.2. ChessQ en el editor de Lichess — https://huggingface.co/joelseytre/chessq-lite

**El modelo (verificado en Hugging Face, GitHub y arXiv 2608.30762, 31 de agosto de 2026):**

- ChessQueries, de Joël Seytre: un codificador ViT con un decodificador estilo DETR que usa **64
  consultas aprendidas, una por casilla**. Así sale directamente la matriz 64 × 13 (vacía + 12
  piezas). La entrada es una imagen de 644 × 644;
- el modelo del artículo es un ViT-L de 304 M de parámetros. **ChessQ Lite V4** es un ViT-S
  «entrenado además con datos propietarios», de 63 MB en FP16 (safetensors y Core ML);
- precisión por tablero exacto: ChessReD 99,5 %, ChessCog 98,5 %, SLCC (fotogramas de
  retransmisiones) 87,1 %, CVChess sin entrenar en él 87,6 %. Todo son **fotos de tableros
  reales**: no se mide con diagramas de libros ni con capturas.

**Cómo lo usa Lichess (verificado en `lichess-org/lila`):** en el **navegador**, sin servidor. Usa
`onnxruntime-web` en un Web Worker (WebGPU, o WASM si no hay), con un ONNX **cuantizado a int8**
(`chessq-lite-v4-int8.onnx`). Redimensiona la imagen a 644 × 644, la normaliza con las constantes de
ImageNet y toma la clase más probable de cada casilla. No aplica reglas de legalidad ni de
orientación. La app móvil usa el mismo ONNX.

**Licencia: ¿se puede usar en Onyx?** Sí, pero con dos matices que conviene tener claros:

1. **PolyForm Noncommercial 1.0.0** (el código y los pesos) permite usar, modificar y redistribuir
   con fines no comerciales: uso personal, de aficiones o de investigación, y uso por organizaciones
   educativas o sin fines de lucro. Que Onyx sea gratuito y de código abierto **no basta para meter
   los pesos dentro de Onyx**. La GPLv3 permite que cualquiera venda o use Onyx comercialmente, y
   no deja añadir restricciones a la obra. Los pesos tienen que ir **aparte**: una descarga opcional
   con su propia licencia, como Maia (que es AGPL).
2. El permiso es para el uso, no para quien distribuye. Un estudiante o el equipo del TEC lo pueden
   usar; un profesor que da clases pagadas con esa función, en sentido estricto, no estaría cubierto.
   Hay que mostrarlo en la descarga. Para tener margen se le puede escribir al autor, que contesta
   preguntas de licencia.

**Qué aprende Onyx:**

- la inferencia en el cliente con ONNX, cuantización int8 y un worker es un camino probado y sin
  servidor. Encaja con el modelo local-first;
- ChessQ resuelve el **caso difícil** (fotos). Para los libros es demasiado grande: un ViT-S de
  ~22 M de parámetros por imagen, cuando un diagrama impreso se lee con un clasificador por casilla
  de pocos MB (el de PdfCraft pesa 8,8 MB en FP32 y cabría en ~2–3 MB cuantizado; sección 2.3);
- lo que le falta a Lichess y sí conviene hacer: **decodificar con reglas** (dos reyes, peones fuera
  de la primera y la octava fila, orientación, bando que mueve). Así se marcan las casillas dudosas
  en vez de entregar un FEN imposible.

### 2.3. PdfCraft (la versión para ajedrez) — https://github.com/DarcioAlberico/pdfcraft-xadrez

**Qué es lo que te pasaron (verificado en el repositorio):** no es el PdfCraft original
(`storytold/pdfcraft`, un editor de PDF en Rust con licencia MIT o Apache-2.0). Es **«pdfcraft-xadrez»**,
de Darcio Alberico (brasileño, de ahí el `abrir-xadrez.cmd`): un repositorio público, independiente,
creado el 2026-10-15, con licencia **MIT o Apache-2.0** (compatible con GPLv3) y unos 2.000 commits
en 17 días (el ritmo y los `AGENTS.md`/`CLAUDE.md` sugieren desarrollo con agentes de IA, _inferido_).
Lleva al Rust el trabajo de años del mismo autor en Python (`ChessVisionOFF_Puro`, «Caïssa»).

**Por qué se abre tan rápido** (verificado en `docs/chess.md` y los README de `crates/chess` y
`crates/chessvision`):

1. **Lo más común no usa ningún modelo.** En un PDF digital los diagramas suelen estar compuestos
   con una fuente de diagramas (Merida, Chess Alpha, DiagramTTF de ChessBase…). Un catálogo
   (`chess::catalog`) traduce cada carácter de esa fuente a una pieza: la lectura es **exacta e
   instantánea**. Lo mismo con los figurines de la notación: el código del carácter dice qué pieza
   es (y hasta lee los símbolos de ISChess de Informator y Quality Chess).
2. **Solo se trabaja la página del doble clic.** Si no se había escaneado, la escanea en silencio
   (un render de una página) y busca el diagrama bajo el puntero.
3. **Los diagramas rasterizados usan un modelo pequeño.** `chess-pieces.onnx`, de 8,8 MB: una
   casilla de 64 × 64 en gris da 13 clases, con hasta 8 tableros (1.024 casillas) por llamada. Corre
   en `rten`, un motor ONNX en Rust puro. Cada tablero se clasifica también girado 180°. Después se
   decodifica con reglas (legalidad, orientación, bando) y se exige que la casilla más débil tenga
   confianza ≥ 0,80; si no, el diagrama queda «por revisar».
4. **La detección es visión clásica, sin OpenCV:** contornos con tres binarizaciones, un cuadrilátero
   puntuado por el contraste del tablero de ajedrez, más las imágenes embebidas y las cuadrículas
   vectoriales. El autor la midió en 68 páginas: recall de 0,98–0,99 y precisión de 1,0.
5. **Es una aplicación nativa** (Rust + egui), sin webview.

**Mediciones que publica:** el modelo de casillas lee exacto el **97,5 %** de 569 tableros de
prueba, por debajo de su propio objetivo del 99 %. El OCR de notación de libros escaneados
(`chess-glyphs.onnx`, 2,8 MB, 314 clases) lee el 98 % de las jugadas, pero **con datos usados en su
entrenamiento**. Con fuentes que no vio baja al 73,5 % en figurines con contorno.

**Lo que trae el ZIP:** el repositorio **no distribuye pesos** (su decisión D2: «pesos sin licencia o
entrenados con recortes de libros con copyright no se distribuyen»). Tampoco fuentes con derechos:
Merida y cburnett se cargan desde la máquina del usuario. Así que tu ZIP es casi seguro una
instalación privada de alguien:

- `models/` (**verificado** con los `.json`, los scripts y los tamaños que pasó el autor):
  - `chess-pieces.onnx` (8,8 MB, FP32): CNN en gris de 64 × 64 por casilla (`cnn-gray-64-linear`),
    13 clases, preprocesado `cv2 RGB2GRAY` + `INTER_AREA` + `/255`;
  - `chess-glyphs.onnx` (2,8 MB): CNN de 32 × 32 para el OCR de notación, 314 clases. Entre ellas
    hay letras sueltas, figurines y símbolos, pero también **pares y trozos pegados** («xf3», «ffi»,
    «Th», «ça», «çã») y una clase con un tabulador. Eso delata que se entrenó con **recortes de
    libros reales** segmentados de forma imperfecta, y confirma su decisión D2;
  - salen de un proyecto Python/PyTorch del autor en su propio PC (`C:\Python-Chess2\
ChessVisionOFF_Puro`, paquete `chess_diagram_ocr`). `export_chess_models.py` exporta a ONNX
    (opset 17) y escribe un **manifiesto** por modelo con la arquitectura, la entrada exacta
    (forma, color, rango, método de redimensionado), las clases, la temperatura de calibración
    (1,43 y 1,52, guardada pero no aplicada), los SHA-256 del checkpoint, de las clases y del ONNX,
    y una **prueba de paridad** PyTorch ↔ ONNX Runtime (diferencia máxima ≤ 1e-4 y ninguna clase
    cambiada en 8 lotes aleatorios). `parity_reference.py` guarda las probabilidades de una entrada
    determinista (`*.parity.json`) para que la versión en Rust compruebe que da lo mismo;
- `fonts/`: fuentes de diagramas y figurines, probablemente comerciales;
- `engine/`: Stockfish;
- `abrir-xadrez.cmd`: **verificado.** Solo define `PDFCRAFT_MODELS=C:\Python-Chess2\pdfcraft-models`
  y lanza `pdfcraft.exe`. Esa carpeta es la del PC del autor original y **no existe** en el del autor
  de Onyx. El programa busca primero en `PDFCRAFT_MODELS` y después junto al ejecutable (cadena
  verificada en el `.exe`), así que lo más probable es que use la carpeta `models/` del ZIP igual.

**Lo que Onyx copia de aquí es el método, no los pesos:** el manifiesto con hashes y preprocesado
exacto, la prueba de paridad entre el entrenamiento y el runtime, y la calibración por temperatura.
Son justo las piezas de MLOps (procedencia, reproducibilidad, sin desfase entre entrenamiento y
producción) que la Fase 10 pide, a escala de un solo modelo.

Conclusión: **sirve para estudiar y probar, no para redistribuir ni para copiarlo dentro de Onyx.**

**¿Puede Onyx reutilizar su código?** La licencia lo permite. Las piezas valiosas e independientes
del PDF son el catálogo de fuentes, la decodificación con reglas (`recognize`), la notación en 18
idiomas, los figurines, los NAG y los símbolos de Informator. Pero hay **un problema de
procedencia**: el propio repositorio dice que `detect::font`, `detect::vector` y `chess_text` (el
catálogo de fuentes y la lectura de la capa de texto) vienen en parte de **PDFimport**, un plugin de
Sigil de otro autor. El permiso está «declarado» y todavía **no** está documentado por escrito
(`docs/chess/permissions/README.md`: «pendiente»). Mientras siga así, esas partes no se copian:
se re-derivan de las especificaciones de cada fuente. El resto (decodificación, SAN, NAG) sí está
limpio. Además, su código depende de las capas internas de PdfCraft (hayro, `TextGlyph`), así que
reutilizarlo es **portar ideas y datos, no enlazar un crate**.

**Antecedentes:** Chessvision.ai eBook Reader (comercial, por suscripción) ya ofrece «doble clic en
un diagrama → tablero de análisis». La idea está validada en el mercado; no es nueva.

### 2.4. Cómo sería en Onyx: «Libros»

**Viabilidad, siendo honestos:**

| Pieza                                           | Viabilidad     | Comentario                                                                                                           |
| ----------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Ver el PDF junto al tablero de análisis         | **Alta**       | `pdf.js` (Apache-2.0, el de Firefox) en el webview, cargado de forma diferida, solo con las páginas visibles.        |
| Diagramas compuestos con fuente (PDF digital)   | **Alta**       | Exacto y sin modelo. `pdf.js` da el nombre de la fuente y la posición de cada carácter.                              |
| Diagramas rasterizados o escaneados             | **Media-alta** | Clasificador por casilla propio (I-56) más reglas. Un ~97–99 % significa que **hay que revisar**: marcar dudas.      |
| Notación de un PDF digital → árbol de variantes | **Media**      | Es lo más trabajoso: idiomas, figurines, variantes entre paréntesis, prosa intercalada, partidas que cruzan páginas. |
| Notación de un libro escaneado (OCR)            | **Baja**       | Ni PdfCraft lo consigue fuera de sus datos de entrenamiento. Se aplaza.                                              |
| Flechas o casillas marcadas en el libro         | **Baja**       | Casi ningún libro las tiene como datos; se aplaza.                                                                   |

**Ojo con «puedo seleccionar el texto»:** muchos libros escaneados pasan por un OCR (Adobe, ABBYY…)
que les pone una **capa de texto invisible** encima de la imagen. Ese texto también se selecciona,
pero el libro sigue siendo una foto: los diagramas son imágenes y los figurines del OCR suelen salir
mal («Ãf3»). Prueba rápida: ampliar mucho una página; si los bordes de las letras siguen nítidos es
digital, si se pixelan es un escaneo con OCR. Y si un diagrama se selecciona como letras, es el mejor
caso (fuente de diagramas).

**MVP propuesto (I-55):**

1. Una sección **Libros**: biblioteca local de PDF (rutas, no copias) con el último punto de lectura
   por libro.
2. El lector a la izquierda y el **tablero de análisis existente** a la derecha (motor, notación,
   guardar en estudio o repertorio, exportar PGN: todo eso ya existe).
3. **Doble clic en un diagrama:** lectura por fuente, o con el modelo si es una imagen. El tablero
   se abre en esa posición con el bando y el número de jugada tomados del texto («23...»), y las
   casillas dudosas se marcan para corregir.
4. Segunda entrega: **«Abrir esta partida»** desde la notación de un PDF digital, con un clic en una
   jugada que lleva a su posición y un clic en el tablero que vuelve al lugar de la página.
5. Las correcciones y lecturas se guardan por libro (huella del archivo) en JSON versionado en los
   datos privados. El libro nunca se modifica ni se sube.

**Rendimiento:** `pdf.js` como chunk diferido (no entra en el bundle base); se lee solo la página
del doble clic; el escaneo del libro completo es opcional, en segundo plano, con progreso y
cancelación. El modelo pequeño se carga la primera vez que hace falta. Así el coste es cero para
quien no usa Libros.

**Licencia y contenido:** Onyx no distribuye libros ni su contenido. El usuario abre sus propios
archivos y el PGN que exporte es para su uso personal (como con los cursos de Chessable que ya se
importan).

**Vídeos (lo de tu conocido):** el formato que describe el autor (pantalla partida: la cámara de quien
explica en una mitad y un tablero **digital** en la otra, al estilo de GothamChess) es el caso
**bueno**: el tablero es un render 2D limpio, plano y siempre en el mismo sitio. Detalle en I-59.

---

## 3. Coaches con IA

### 3.1. Chessiro — https://chessiro.com

**Lo que se puede comprobar (2026-11-01):**

- la API pública (`/openapi.json`) solo tiene estado, aperturas, contacto y geolocalización para
  precios. **Nada del coach**, que vive detrás de la sesión;
- su blog: Stockfish 19 analiza primero y después el coach recorre las posiciones críticas;
  respuestas con flechas, casillas y variantes; 24 idiomas con voz; bots basados en Maia. **No
  nombra el modelo de lenguaje.** El mismo blog dice que acierta «el 75–80 % de las veces», menos
  que el 93 % de los tuits: las cifras se mueven y **no publican cómo las miden** (qué es una
  alucinación, cuántas posiciones, quién califica);
- precios, según una reseña de un competidor (septiembre de 2026): gratis con vista previa del
  coach, Plus por 10 USD al mes con uso limitado y Pro por 15 USD al mes con 5 veces más uso. **Que
  limiten el uso indica coste real por pregunta**, es decir, un LLM comercial en vivo.

**Cómo está hecho, casi con seguridad (inferido de sus tuits y su blog):** generación anclada en
hechos.

1. Antes de escribir se calculan **hechos verificados** de la posición: líneas de Stockfish, lo que
   haría un humano de ese nivel (Maia) y su «modelo propio de hechos de ajedrez». Lo más probable es
   que este último sea un clasificador entrenado para etiquetar rasgos (amenazas, piezas colgadas,
   debilidades, planes típicos), no un LLM.
2. Un LLM general redacta la respuesta **solo a partir de esos hechos**.
3. Lo que menciona (jugadas, líneas) sale como datos estructurados: los botones «See line» son
   líneas validadas que el tablero reproduce, no texto libre.
4. Hay un bucle de revisión con más de 20 jugadores titulados que marcan errores. Eso es lo que más
   credibilidad le da: es **evaluación humana continua**, lo que les falta a los demás.

La bajada de alucinaciones (47 % → 3 %) cuadra con pasar de «el LLM mira el FEN» a «el LLM solo
redacta hechos verificados». Es el mismo principio 5 del primer estudio («verificador antes que
modelo»), que FlexiChess ya aplicaba a las jugadas citadas.

### 3.2. Chess Explainer — https://chessexplainer.slnk.icu

**Verificado en el JavaScript que sirve (2026-11-01):** una SPA en Vue. El registro exige un
**código de invitación**, es una beta privada con **créditos** por usuario (1.000 iniciales) y todo
corre en su servidor:

- `/api/chat/init` («Initializing Agent…»): un agente por posición, partida o nota de apertura, con
  respuesta en streaming;
- `/api/engine/analyse` y `/api/engine/wdl`: motor en el servidor;
- `/api/position/from-image`: también reconoce posiciones desde una imagen, en el servidor;
- revisión de perfil del coach («coach-review»), errores e importación de Lichess y Chess.com.

No se puede ver qué modelo usa ni si verifica algo. **Conclusión:** un proyecto pequeño en beta
cerrada (el dominio `slnk.icu` y la falta de páginas legales apuntan a un hobby), con la misma
arquitectura de siempre (LLM + motor en el servidor, con créditos para limitar el coste). No aporta
nada nuevo: se deja registrado y no se recomienda darle datos personales.

### 3.3. Qué significa para Onyx

**¿Ya llegó el día?** **A medias.** Los LLM actuales redactan bien si se les dan hechos, y siguen
inventando si se les pide que «vean» la posición. Lo que ha cambiado no es tanto el modelo como que
**ya se sabe hacerlo**: hechos primero, el LLM solo redacta, toda jugada citada se verifica y hay
revisión humana.

**La ventaja de Onyx:** la capa de hechos que Chessiro tuvo que construir, **Onyx ya la tiene
calculada en local**: líneas y caché de evaluaciones (8.2), probabilidad de victoria y momentos
clave (I-15), explicación factual de errores (I-24), dificultad práctica con Maia (I-33), 28
estructuras de peones (9.3), catálogo de fugas (I-29), motivos tácticos verificables (7.3.4),
tablebase, repertorio contra realidad (I-19), estadísticas de aperturas y el perfil del jugador.
Pocos coaches tienen eso, y menos aún en local.

**El coste:** hay tres caminos.

| Opción                                              | Coste para el autor | Calidad hoy      | Encaje con Onyx                                                                                  |
| --------------------------------------------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| A. **BYOK**: el usuario pone su propia clave de API | Cero                | Buena con hechos | **Bueno**: opcional y apagado por defecto, avisa de qué se envía (como la nube de Lichess, 8.2). |
| B. LLM local (llama.cpp / Ollama)                   | Cero                | Floja en ajedrez | Malo hoy: varios GB, lento sin GPU en el i5 de referencia. Contradice la sección 1.              |
| C. Servidor propio que paga el autor                | Alto y recurrente   | Buena            | Descartado: Onyx no tiene servidor ni modelo de negocio.                                         |

**Recomendación:** no implementar el coach todavía, pero **sí construir ya lo que no depende del
LLM** (I-60):

- un **«paquete de hechos»** por posición: un JSON versionado con los hechos de arriba, cada uno con
  su id, fuente y confianza. Sirve hoy para mejorar las explicaciones por plantilla y mañana es el
  contexto del LLM;
- un **verificador**: toda jugada o línea de un texto se analiza, se comprueba que es legal y que el
  motor la respalda (y la tablebase cuando aplica). Un texto que cita algo no verificado no se
  muestra. Es el mismo que validan I-10 e I-24;
- el formato de salida con **líneas como datos** (un botón «Ver línea» que el tablero reproduce)
  sirve igual para las plantillas.

Cuando se haga el coach (I-61), será la opción A como complemento. Y antes de anunciarlo, Onyx
debería **medir su propia tasa de alucinación** con un conjunto de posiciones fijo (I-62); el código
de ChessQA de CSSLab, el laboratorio de Maia, tiene licencia MIT y sirve de base. Eso, además, es un
caso de estudio de MLOps muy defendible: «coach con y sin verificador, mismo conjunto, métrica
publicada».

---

## 4. Otros

### 4.1. DanceChess / DC Studio — https://dancechess.com

**Verificado (sitio y versiones en `github.com/dancechess/studio`):** base de datos de PGN gratuita
y GPLv3 para Mac (solo Apple Silicon y macOS 14+), con Stockfish incluido; no lee `.cbh` y todavía no
busca por posición. Sobre la firma:

- hasta la 0.3.0 iba con firma ad hoc y **sin notarizar**: los usuarios tenían que saltarse
  Gatekeeper con una orden de terminal o desde Ajustes ▸ Privacidad y seguridad, igual que Onyx hoy
  (ver el README);
- desde la **0.3.1** está **firmada con un Developer ID y notarizada por Apple**, con _hardened
  runtime_ y su propio ticket para la app y para el Stockfish incluido. Se abre como cualquier
  descarga, incluso sin conexión.

O sea: **sí pagaron**. El Developer ID y la notarización exigen el Apple Developer Program (99 USD
al año para una persona; la exención de la cuota es para organizaciones sin fines de lucro,
instituciones educativas y gobiernos, no para personas). Tauri ya sabe firmar y notarizar desde
GitHub Actions con los secretos del certificado, así que el trabajo técnico es poco. **La decisión
es solo el coste**, y ya está en las preguntas abiertas del roadmap.

**La otra lección de DC Studio:** su 0.3.3 corrigió que «la app no abría en ningún Mac salvo el que
la compiló», porque enlazaba una ruta del directorio de compilación. Hay que **probar en una máquina
limpia** antes de declarar una plataforma soportada; aplica tanto a macOS como a Maia en Windows.

**Recomendación:** no pagar hasta que haya **un usuario real con Mac** (el profesor o alguien del
grupo). Ese día se paga, se notariza en CI y se valida en su equipo. Mientras tanto, el README ya da
los pasos.

### 4.2. ChessDB — https://www.chessdb.cn/queryc_en/

**Qué es (verificado en su documentación y en la API):** una base «viva» de posiciones evaluadas por
motor, de noobpwnftw. No son estadísticas de partidas humanas: es un árbol de evaluaciones que se
amplía y propaga solo (`learn=1`) y que se puede pedir que analice (`queue`). La API es pública y
sin clave (`cdb.php?action=queryall|querybest|queryscore|querypv`, con `json=1`) y devuelve todas
las jugadas con puntuación, rango, porcentaje de victoria y una nota (`!`, `*`, `?`). También resuelve
finales con tablebase (DTZ o DTM). Funciona por HTTPS; una consulta desde aquí tardó ~1,25 s. **No
publica límites de uso ni condiciones.**

**Lo que el comentario no sabía: Onyx ya lo tiene en parte.** Heredado de En Croissant,
`src/utils/chessdb/api.ts` lo ofrece como «motor en la nube» en el panel de análisis (_Motores →
Añadir → ChessDB_). Lo que falta es usarlo como **fuente de datos**, no como motor:

- **en el panel de base de datos del tablero:** una fuente «ChessDB» junto a Lichess, Masters, la
  base local y Rival, con las jugadas con su evaluación y rango. Ver juntas la estadística humana y
  la evaluación objetiva es justo lo que se pide para construir repertorios;
- **en el generador de repertorios (8.5):** como comprobación «a pocos centipeones de la mejor»
  para las posiciones de apertura sin arrancar Stockfish. Es lo que hace qchess («engine-proof» con
  chessdb.cn, primer estudio §2.7), y acortaría mucho la generación;
- **en el reporte:** como alternativa o complemento a la apertura desde la nube de Lichess (8.2).

**Beneficios reales, sin inflarlos** (pregunta del autor):

| Dónde                  | Qué gana Onyx                                                                                                                                                                                                                                                                                                                                                   | Peso      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Generador (8.5) y 8.6  | Hoy Stockfish mira 5 líneas por posición, y la dificultad práctica (I-33) cuenta como «fallo» toda jugada fuera de esas 5. ChessDB puntúa **todas** las jugadas de una vez y con mucha más profundidad que un portátil. Mejora la calidad de I-33 y del filtro «a N cp de la mejor», y deja libre la CPU. **No es más rápido:** ~1,25 s por consulta, en serie. | **Medio** |
| Panel de base de datos | Ver la estadística humana y la evaluación objetiva de cada jugada en la misma tabla, sin arrancar un motor. Comodidad: lo mismo ya se ve hoy con ChessDB como motor en la nube.                                                                                                                                                                                 | Bajo      |
| Reporte (8.2)          | Más cobertura que la nube de Lichess en aperturas poco jugadas.                                                                                                                                                                                                                                                                                                 | Bajo      |

**Riesgos:** servidor externo sin condiciones ni límites publicados (puede caerse o cortar el acceso),
envía posiciones fuera (opcional y apagado) y su cobertura fuera de la apertura es irregular.

**Cómo decidirlo con datos (unos 10 minutos):** tomar ~50 posiciones de un repertorio generado y
comparar ChessDB con el Stockfish local que usa hoy el generador: coincidencia de la mejor jugada,
diferencia en la lista «a 30 cp», cobertura (cuántas posiciones no conoce) y tiempo. Si apenas cambia
la selección, I-63 se queda en comodidad y baja de prioridad.

**Dónde ponerlo:** **no** en la fase de Libros. No comparte código ni tema con ella, y mezclarlos
difumina la fase. Encaja cuando se vuelva a tocar el generador o en un lote de mantenimiento, después
de la medición de arriba.

**Condiciones:** igual que la nube de Lichess, **opcional y apagado por defecto** (envía posiciones
a un servidor externo, en China); una petición a la vez; resultados en la caché de evaluaciones de
8.2 con la fuente en la clave; y parar ante errores. Como no publica límites, hay que ser más
prudente que con Lichess: lotes acotados y nada de recorridos masivos.

**Scripts de Python: no.** Meter un intérprete de Python en Onyx choca con todo lo de la sección 1
(otra instalación, otra plataforma que mantener) y con la seguridad: un script arbitrario con acceso
a los datos y a la red. Lo que de verdad se busca ya tiene caminos mejores:

- **Python como motor UCI:** cualquier script que hable UCI ya se puede añadir como motor; así
  funciona Maia 3;
- **exportar datos** (PGN, JSON de informes, perfiles y repertorios) para procesarlos fuera;
- más adelante, en la Fase 10, una **CLI** de Onyx (analizar un PGN, generar un repertorio) que
  sirva también para la evidencia reproducible de MLOps.

---

## 5. Catálogo de ideas

| Id   | Idea                                                                                                | Origen                    | Estado        | Esfuerzo | Fase sugerida                         |
| ---- | --------------------------------------------------------------------------------------------------- | ------------------------- | ------------- | -------- | ------------------------------------- |
| I-55 | Libros: lector de PDF con tablero, doble clic en diagrama, partidas desde la notación               | PdfCraft-xadrez / autor   | **Aceptada**  | L        | 9.4 (en el roadmap)                   |
| I-56 | Reconocedor propio de diagramas (clasificador por casilla + reglas), entrenado con datos sintéticos | PdfCraft-xadrez / ChessQ  | **Aceptada**  | M–L      | 9.4, completo (datos, modelo, eval.)  |
| I-57 | Posición desde imagen o captura (pegar, arrastrar), con casillas dudosas marcadas                   | Lichess                   | **Aceptada**  | S–M      | 9.4                                   |
| I-58 | Fotos de tableros reales con ChessQ como descarga opcional no comercial                             | Lichess / ChessQ          | En duda       | S        | Después de I-57                       |
| I-59 | Vídeo junto al tablero: captura manual primero, seguimiento automático de jugadas después           | Conocido del autor        | Propuesta     | S / L    | Captura: final de 9.4; resto: futuro  |
| I-60 | Paquete de hechos por posición + verificador de jugadas citadas                                     | Chessiro / primer estudio | **Propuesta** | M        | Mantenimiento o 10                    |
| I-61 | Coach con LLM opcional, BYOK, sobre I-60                                                            | Chessiro                  | Aplazada      | L        | Futuro (IA)                           |
| I-62 | Evaluación propia del coach: conjunto fijo y tasa de alucinación publicada                          | Chessiro / ChessQA        | Aplazada      | M        | 10 (MLOps)                            |
| I-63 | ChessDB como fuente del explorador, del generador y del reporte (opcional)                          | Comentario / qchess       | Propuesta     | S–M      | Tras medir; fuera de 9.4              |
| I-64 | Ejecutar scripts de Python dentro de Onyx                                                           | Comentario                | Descartada    | —        | — (UCI, exportación y CLI)            |
| I-65 | Firma y notarización en macOS                                                                       | DanceChess                | En duda       | S        | 10, o antes si hay un usuario con Mac |

### I-55. Libros

Detalle en §2.4. Criterios de salida del MVP: doble clic → tablero en < 300 ms en un PDF digital
(medido); una lectura dudosa nunca se presenta como segura; cero coste para quien no usa Libros
(medido con I-54); un libro de 700 páginas no carga nada que no se esté viendo.

### I-56. Reconocedor propio de diagramas

Entrenar un clasificador pequeño por casilla (pocos MB; el autor acepta que pase de 3 MB, porque lo
que importa es la latencia; el de PdfCraft pesa 8,8 MB en FP32) con
**datos sintéticos de licencia limpia**: posiciones de la base de puzzles de Lichess (CC0) dibujadas
con juegos de piezas libres y con tramas, ruido de escaneo, desenfoque, coordenadas y marcos. Los
libros del autor sirven **solo como conjunto de evaluación privado**, nunca para entrenar ni para
distribuir.

**¿Hacen falta libros para entrenar? No.** El modelo se entrena con imágenes **generadas**: cada
posición sintética ya trae su etiqueta, y se pueden generar cientos de miles sin anotar nada a mano.
Los libros solo sirven para **medir** si eso generaliza a diagramas reales, y para eso importa más
la **variedad** que la cantidad: unos 10–20 libros de editoriales, épocas y estilos distintos
(Informator, Quality Chess, Everyman, libros antiguos, escaneados) y 20–30 diagramas de cada uno,
unos 300–500 tableros. Con 400 tableros y una exactitud cercana al 97 %, el intervalo de confianza
del 95 % es de ±1,7 puntos, suficiente para decidir. En los PDF digitales la etiqueta sale **gratis**:
la lectura exacta por fuente da la posición correcta y el render de esa zona da la imagen. Solo los
escaneados se etiquetan a mano, y la propia pantalla de corrección de I-57 sirve para hacerlo.

Se infiere en Rust (`ort` o `rten`) o en un worker del webview. Así Onyx tiene un modelo
**propio, incluido y con model card**, terminado dentro de 9.4 (dataset generado, versión del modelo,
métrica en CI). La Fase 10 es aparte y no lo reabre. La decodificación con reglas
(legalidad, orientación, bando, casillas dudosas) se escribe desde cero.

Los datos sintéticos cubren dos estilos: **impreso** (diagramas de libro con tramas y ruido) y
**pantalla** (tableros 2D con los juegos de piezas libres que Onyx ya trae, resaltados de última
jugada, flechas y compresión de vídeo). Las piezas de Chess.com no son libres: sus capturas sirven
**solo para evaluar**, en privado, si el modelo generaliza.

Del ZIP de PdfCraft se copia el **método** (§2.3): manifiesto con preprocesado exacto y hashes,
prueba de paridad entre el entrenamiento y el runtime, y calibración por temperatura para el umbral
de «dudosa». Para el runtime conviene uno en **Rust puro** (`rten` o `tract`) en vez de
`onnxruntime`: sin DLL por plataforma, que es lo que la Fase 10 pide para macOS y Linux. Se decide
midiendo tamaño y latencia en la primera tarea.

### I-57. Posición desde imagen

En el editor de posición y al pegar una imagen en el tablero (captura de Chess.com, de un vídeo o
de un PDF): I-56 recorta y lee la imagen, y las casillas dudosas se marcan para corregir. Es la
entrega más pequeña y útil, y valida I-56 antes de construir Libros.

### I-58. Fotos de tableros reales

ChessQ Lite como descarga opcional con su licencia PolyForm Noncommercial a la vista. Se usaría
`onnxruntime` (como Lichess) solo si los usuarios piden de verdad fotografiar tableros, por ejemplo
para pasar una partida del club. Antes, escribir al autor del modelo.

### I-59. Vídeo junto al tablero

Formato objetivo (dato del autor): pantalla partida, con la cámara del presentador en una mitad y un
tablero digital en la otra. Es el caso fácil para la visión, pero tiene problemas propios:

- **flechas y casillas marcadas** encima de las piezas (los presentadores las usan todo el tiempo);
- **animaciones** al mover y piezas arrastradas a medio camino;
- el presentador **vuelve atrás** y explora variantes, así que el resultado es un árbol, no una línea;
- giros del tablero, jugadas rápidas (dos jugadas entre dos muestras) y vídeo comprimido o de baja
  resolución.

**Entrega 1 (pequeña, al final de 9.4):** un panel de vídeo para **archivos locales** del usuario
junto al tablero. El webview ya decodifica MP4/H.264 con `<video>`, así que no hace falta FFmpeg.
Un botón «Capturar posición» pasa el fotograma pausado por I-57. Casi todo el trabajo ya estaría
hecho. Pendiente de verificar: los códecs en Linux, que dependen de GStreamer.

**Entrega 2 (L, futuro):** seguimiento automático. Una vez se marca el rectángulo del tablero, se
muestrea a 2–4 fps, se espera a que la imagen esté estable, se lee la posición y se deduce la jugada
legal que lleva de una a otra. Si la posición ya está en el árbol es una vuelta atrás; si no encaja
con ninguna jugada, empieza una variante nueva desde ese FEN. Cada jugada guarda su **marca de
tiempo**: un clic en la jugada lleva el vídeo a ese momento, y eso es lo que de verdad aporta.

**YouTube:** descargar vídeos va contra sus condiciones, y el reproductor embebido no deja leer sus
píxeles. Opciones legítimas: hacer capturas de pantalla y pegarlas (I-57), o capturar una ventana
con `getDisplayMedia` (por verificar en WebView2 y Tauri).

### I-60. Paquete de hechos y verificador

Ver §3.3. Se reaprovecha lo que ya calculan 8.2, 8.6, 8.7, 9.3 y 7.3.4. No añade cálculo nuevo al
análisis: solo reúne y versiona.

### I-63. ChessDB como fuente

Ver §4.2. Opcional, apagado por defecto, una petición a la vez, con caché y aviso de privacidad.

---

## 6. Para la discusión

### Opinión del estudio (como socio)

1. **Lo más valioso es Libros, y es viable si se acota bien.** El 80 % del valor está en los PDF
   digitales, y ahí el problema difícil (la visión) casi desaparece: se lee la fuente. Recomiendo
   empezar por **I-57 → I-56 → I-55** y **no prometer libros escaneados** al principio.
2. **No hace falta ChessQ para libros.** Es un buen modelo para fotos, pero para diagramas impresos
   es grande, tiene una licencia incómoda para una app GPL y no se midió con ese material. Un modelo
   propio pequeño es mejor técnicamente, no tiene problemas de licencia y suma al portafolio.
3. **PdfCraft-xadrez es una referencia de diseño, no código para copiar.** Muestra qué funciona
   (fuente → exacto, CNN pequeña + reglas, revisión de dudas, correcciones por libro) y deja medidas
   honestas. Pero los pesos de tu ZIP no se pueden redistribuir, y la parte más jugosa (el catálogo de
   fuentes) tiene la procedencia sin cerrar.
4. **Coach con IA: todavía no, pero ya se puede preparar.** I-60 es útil sin LLM y es la condición
   para hacerlo bien después. Lo de Chessiro confirma el camino que el primer estudio ya había
   escrito; no lo cambia.
5. **ChessDB es una mejora barata** que encaja en lo que ya existe. **Python, no.**
6. **macOS:** pagar solo cuando haya alguien con Mac esperando.

### Respuestas del autor (2026-11-01)

- **PDF:** cree que la mayoría son digitales (el texto se selecciona en Xodo), con algunos escaneados.
  Hay que tener en cuenta la capa de OCR (§2.4) antes de darlo por hecho. Segunda aclaración: al
  ampliar, las letras no pierden calidad, pero algunas tienen imperfecciones impropias de una fuente
  de ordenador. Eso apunta a un **escaneo vectorizado** (por ejemplo ClearScan de Adobe, que
  convierte el texto escaneado en contornos vectoriales que imitan la forma original), aunque
  también puede ser una tipografía antigua. En un escaneo vectorizado el texto es OCR, así que los
  figurines pueden venir mal y la fuente no está en ningún catálogo; además, los diagramas suelen
  seguir siendo imágenes, y entonces los lee I-56. El paso 0 lo aclara. Para los usuarios no hay
  datos: Libros debe funcionar en los tres casos, con la lectura por fuente como vía rápida.
- **Tamaño del modelo:** no es un límite duro si se mantiene la latencia.
- **MLOps:** el autor deja la Fase 10 para el final porque no la necesita para su entrenamiento. Se
  adelanta solo lo que necesite una funcionalidad concreta. Revisado el roadmap, **ninguna otra idea
  pendiente fuera de la Fase 10 necesita MLOps**: las que sí lo usan (I-16, I-43 v2, I-11) ya están
  dentro de la 10. Tercera aclaración del autor: 9.4 se **termina completa**, modelo incluido, sin
  recortes, y la Fase 10 queda aparte como integración general de MLOps, no como mejora de este
  modelo.
- **Archivos de PdfCraft:** pasó el `.cmd`, los `.json` y los scripts; lo verificado está en §2.3.
- **Ubicación:** I-55 a I-57 juntas en una fase **antes de la 10**. Si una parte de MLOps se puede
  hacer antes, se hace antes; el nombre de la Fase 10 es simbólico.
- **Vídeos:** pantalla partida, con la cámara de quien explica y un tablero digital (estilo
  GothamChess). Ver I-59.
- **ChessDB/qchess:** preguntó qué aporta de verdad para decidir dónde ponerlo. Ver §4.2.

### Fase 9.4 — Libros y posiciones desde imagen (pasada al roadmap el 2026-11-01)

**¿Depende de algo de la Fase 10?** No. 9.4 se cierra completa y la Fase 10 no la reabre. Lo que el
modelo necesita para estar terminado se hace dentro de 9.4:

1. versionado del modelo y del dataset con model card y dataset card (el manifiesto de §2.3);
2. una evaluación reproducible con una corrida pequeña en CI (subconjunto sintético) y una evaluación
   local con los libros privados, que nunca sale del PC del autor;
3. un runtime sin DLL por plataforma, para no rehacerlo cuando llegue macOS/Linux;
4. el presupuesto de rendimiento (I-54) medido a mano antes y después, como dice la sección 7 del
   primer estudio (meterlo en CI para toda la app es tarea general de la 10).

Además cumple la regla vigente de la Fase 10 («no se añadirá un modelo decorativo»): ningún modelo
existente se puede usar (ChessQ por licencia y tamaño, PdfCraft por los pesos privados) y los datos
son sintéticos con procedencia limpia.

**Orden propuesto:**

| Paso | Qué                                                                                                         | Sale con                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0    | Diagnóstico de la biblioteca: por PDF, digital, escaneado o escaneado con OCR, y qué fuentes de ajedrez usa | La distribución real, que decide qué fuentes soportar primero           |
| 1    | Pruebas rápidas: `pdf.js` como chunk diferido y runtime ONNX en Rust (tamaño, latencia, arranque)           | Decisión de runtime, medida                                             |
| 2    | Generador de datos sintéticos, entrenamiento de I-56, manifiesto, paridad, model card y dataset card        | Modelo de pocos MB con métrica en el conjunto sintético y en el privado |
| 3    | I-57: pegar o arrastrar una imagen en el editor de posición, con casillas dudosas                           | Primera entrega visible; valida I-56 con capturas reales                |
| 4    | I-55: biblioteca, lector junto al tablero, doble clic en diagrama (por fuente, o por imagen con I-56)       | Criterios de salida de I-55                                             |
| 5    | I-55: «Abrir esta partida» desde la notación (PDF digital, o escaneo con capa de texto)                     | Parte obligatoria de 9.4                                                |
| 6    | Opcional: I-59, entrega 1 (vídeo local con captura manual)                                                  | Casi gratis tras el paso 3                                              |

Fuera de 9.4: la notación de escaneos sin capa de texto (sus diagramas sí entran), I-58 (fotos), I-59 automático, I-63 (ChessDB) y
todo el bloque del coach (I-60 a I-62).

### Preguntas para el autor

1. **¿Qué tipo de PDF tienes en realidad?** _(Respondida en parte: ver arriba y el paso 0.)_ Es la pregunta que decide todo. Abre 3–5 libros e
   intenta seleccionar el texto de una jugada: si se selecciona, el PDF es digital. Mira también si
   un diagrama se selecciona como letras (una fuente) o como imagen.
2. ¿Me pasas el `abrir-xadrez.cmd` y los `.json` de `models/` (no los `.onnx` ni los libros)? Con
   eso confirmo cómo está montado y el tamaño de los modelos.
3. ¿Dónde lo pondrías: una **9.4 Libros** antes de la Fase 10, o como parte de la 10, dado que I-56
   es justo el caso de MLOps que falta?
4. ¿Te convence la opción BYOK como único camino futuro del coach, o prefieres dejarlo abierto?
5. Del conocido de los vídeos: si se puede, saber si trabaja con clases grabadas de un tablero
   digital o con cámara; cambia mucho la viabilidad de I-59.

---

## 7. Registro de la sesión

- **2026-11-01:** creación del documento. Fuentes revisadas: sitio de ChessGaze; Hugging Face, GitHub
  y arXiv de ChessQueries; código de `lichess-org/lila` (`ui/editor/src/editor.vision.worker.ts`,
  `public/lifat/vision/README.md`); repositorio `DarcioAlberico/pdfcraft-xadrez` (`docs/chess.md`,
  `docs/chess/blueprint.md`, `docs/chess/provenance.md`, README de `crates/chess` y
  `crates/chessvision`, PR #84 y #117); blog y OpenAPI de Chessiro; reseña de MyChessPlan; JavaScript
  servido por Chess Explainer; sitio y versiones de DC Studio; documentación de la API de ChessDB y
  una consulta real; repositorio ChessQA de CSSLab; `src/utils/chessdb/api.ts` y el README de Onyx.
- **2026-11-01 (segunda ronda):** respuestas del autor. Verificados `abrir-xadrez.cmd`, los cuatro
  `.json` y los scripts `export_chess_models.py` y `parity_reference.py` del ZIP, sin abrir los
  pesos; corregidos los tamaños de los modelos (8,8 MB y 2,8 MB, que estaban al revés). Añadidos I-59
  con el formato de vídeo real, los beneficios de ChessDB comparados con el generador de 8.5
  (`docs/repertoire-generator-phase-8-5.es.md`) y la propuesta de fase 9.4.
