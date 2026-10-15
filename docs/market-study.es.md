# Estudio de mercado — herramientas de ajedrez

> Documento de trabajo, **ajeno al roadmap**. Sirve como insumo para redefinir 8.2 y las fases
> siguientes. Todo lo que aparece aquí es propuesta hasta que el autor lo pase al roadmap.
>
> Inicio: 2026-10-14. Última actualización: 2026-10-14.

## 0. Cómo leer este documento

- **Sección 1**: lo que Onyx ya tiene y es relevante para comparar (para no proponer lo que existe).
- **Sección 2**: una ficha por página analizada: notas del autor, investigación técnica, qué
  aprende Onyx y qué se descarta.
- **Sección 3**: catálogo consolidado de ideas con identificador (`I-xx`), estado y fase sugerida.
  Es la sección que se usará para editar el roadmap.
- **Secciones 4–6**: temas transversales que aparecen en varias páginas: material de
  entrenamiento, IA como entrenador y reestructuración de jugadores (8.2).
- **Sección 7**: rendimiento y fluidez: riesgos y reglas para no volver Onyx lento.
- **Sección 8**: fases nuevas y modificadas recomendadas, con su orden.
- **Sección 9**: pendientes para la evaluación del autor (decisiones, correcciones al roadmap,
  afirmaciones no verificadas y qué PGN propios revisar).
- **Sección 10**: registro de la sesión.

Estados de una idea:

- **Propuesta**: anotada, sin discutir.
- **Aceptada**: el autor la quiere; falta ubicarla en una fase.
- **En duda**: requiere discusión o información.
- **Aplazada**: válida, pero no ahora (por ejemplo, IA).
- **Descartada**: no aplica a Onyx; se conserva el motivo.

Esfuerzo orientativo: **S** (días), **M** (1–2 semanas), **L** (fase propia).

Terminología: el **informe de posición** es el informe que Onyx ya tiene, accesible desde el tablero
como en ChessBase (en el roadmap se llama «Opening Report»). Cuando este documento habla de
análisis, informes de jugador o preparación, se refiere a Player Analysis y a la futura sección
Jugadores, no a ese informe.

---

## 1. Punto de partida de Onyx (relevante para la comparación)

| Área | Lo que existe hoy | Dónde |
| --- | --- | --- |
| Búsqueda de jugadores en bases | Subcadena literal `name LIKE '%texto%'`: depende del orden y de los acentos. | `src-tauri/src/db/mod.rs:1671` |
| Ficha de jugador en base | Reutiliza la tarjeta personal (Resumen, Ratings, Aperturas, Análisis). | `src/components/databases/PlayerCard.tsx` |
| Player Analysis | Perfil local, motor, errores, motivos verificables, relojes, versiones. Panel de 1.704 líneas. | `src/components/home/PersonalCardPanels/PlayerAnalysisPanel.tsx` |
| FIDE | Consulta puntual por nombre a través de la API de Lichess. | `src/components/databases/FideInfo.tsx` |
| Puzzles Lichess | Base de puzzles heredada de En Croissant con filtro por rating y tema. | `src-tauri/src/puzzle.rs` |
| Táctica propia | Sets PGN, guiado/Woodpecker, timer, pista, ver solución, estadísticas, FSRS no aplicado a táctica. | `docs/training-phase-6-*.es.md` |
| Finales | 180 posiciones incluidas por familia de material; se juzga el resultado **al final** de la partida; tablebase remota; rival inicial Maia máximo. | `src/components/training/EndgameTraining*.tsx` |
| Familias de finales y tablebase | Clasificación por material y tablebase bajo demanda (≤7 piezas) en Player Analysis. | Fase 7.3.4 |
| Repaso espaciado | FSRS por línea en Aperturas. | Fase 6.A |

Numeración vigente de las fases (confirmada por el autor el 2026-10-14): **Fase 9 = expansión
avanzada** (9.1 bots, 9.2 torneos, 9.3 interpretación estratégica) y **Fase 10 = consolidación
pública y MLOps, la última**. Las secciones del roadmap ya siguen este orden; la **tabla de estado**
de su sección 4 y algunas referencias sueltas (por ejemplo, «10.4» para el set táctico automático)
todavía usan la numeración anterior y deben corregirse.

---

## 2. Fichas por página

### 2.1. ChessCorpus — https://chesscorpus.org

**Veredicto:** muy útil. No por su interfaz, sino por **cómo resolvió datos, contenido y costes**
con un solo desarrollador. Varias de sus soluciones encajan casi directamente en Onyx y otras
confirman que vamos por buen camino.

#### Notas del autor (resumen)

- Gratis, requiere cuenta solo para guardar progreso. Base de ~11 M partidas.
- Búsqueda de jugadores que sí encuentra a David Cabezas (167 partidas) donde Gigabase en Onyx
  devolvía muchos «Cabezas» con 0 partidas y no el correcto. Búsqueda por perfil FIDE.
- Fuentes declaradas: Ajedrez Data AJ-OTB, Chess Database (Figshare), ICCF/AJ-CORR, Lichess
  Broadcast, Lichess Titled Arena, Chess-Results.
- Seis modos de táctica: jugadas candidatas, profundidad, repetición espaciada, tormenta,
  contrarreloj, racha.
- Entrenador de finales con más de 2.500 posiciones de cinco libros, filtros por obra, nivel 1–5,
  categoría, aleatorio. Marca **error en cuanto la jugada estropea el objetivo** y deja reintentar.
  Botón de veredicto (Syzygy o Stockfish).
- «Ver técnica»: explicación sorprendentemente específica por posición, con alguna incorrecta (el
  caso de caballo y peón de torre donde en realidad las blancas ganan).

#### Investigación técnica (verificado en el sitio el 2026-10-14)

**Stack y alojamiento**

- SPA en React empaquetada con Vite/Rolldown, servida desde **Cloudflare** (Workers + CDN, Web
  Analytics, protección anti-bots). Respuestas JSON comprimidas con zstd y cabeceras de seguridad
  estrictas.
- El endpoint público `/api/database-stats` expone el manifiesto del corpus: almacenamiento en
  **Cloudflare R2**, 5,78 GB usados, con `absoluteBytes: 10 000 000 000` y un límite preventivo de
  9 GB. **Ese límite coincide con la capa gratuita de R2 (10 GB, sin coste de salida)**: el corpus
  está diseñado para no salir nunca de lo gratuito.
- Publicación incremental por lotes con manifiestos (`games`, `indexes`, `profiles`) y particiones
  (`data/game-partitions-v3/all.json.gz`). Historial de publicaciones con fecha, partidas añadidas y
  tamaño. Deduplicación por «huella / identidad de contenido».
- El manifiesto dice «local database unchanged by web export»: **el autor mantiene una base local y
  exporta índices precalculados a R2**. La web no consulta una base de datos SQL viva para el
  corpus; sirve fragmentos ya calculados (búsqueda de jugadores por *shard*, perfil por clave).
- Cuentas (progreso, rankings) en un almacenamiento aparte, con cookie de sesión `HttpOnly`.
- **Stockfish 18 lite en WASM corre en el navegador del visitante**; el servidor nunca ejecuta
  motor. Las jugadas candidatas a veces usan `chess-api.com` (servicio externo gratuito).
- **Syzygy** a través del servicio público `tablebase.lichess.ovh`, solo cuando alguien pide el
  veredicto.
- Financiación: **Google AdSense** («proyecto personal financiado parcialmente mediante
  publicidad»). Proyecto de una persona en España.

**Respuesta a «¿cómo es gratis?»:** almacenamiento en la capa gratuita de R2, cómputo de motor en el
cliente, tablebase y FIDE consultadas a terceros gratuitos, índices precalculados que hacen que cada
petición sea barata, y anuncios para el resto. El coste marginal por usuario es casi cero.

**Datos de partidas**

| Fuente | Partidas | Licencia | Interés para Onyx |
| --- | --- | --- | --- |
| Ajedrez Data AJ-OTB | 3,75 M | Dominio público según el proveedor | Alto: OTB histórico y reciente. |
| Chess Database · Figshare | 3,54 M | CC BY 4.0 | Medio: histórico, solapa con otras bases. |
| AJ-CORR (ICCF, IECG, LSS) | 1,64 M | Uso gratuito con atribución | Bajo para el público de Onyx. |
| Lichess Broadcast | 1,12 M | CC BY-SA 4.0 | **Muy alto**: torneos OTB recientes, actualización mensual, incluye torneos latinoamericanos. |
| Lichess Titled Arena | 0,81 M | CC0 | Medio. |
| Chess-Results | 110 k | **Sin licencia** (raspado de PGN público) | No replicar: riesgo legal. |

- Normalización de nombres (minúsculas, sin diacríticos) para unificar grafías.
- La búsqueda devuelve `key: "cabezas solano david alejandro"`: **búsqueda por tokens normalizados
  en cualquier orden**. Por eso «Cabezas David» encuentra «Cabezas Solano, David Alejandro», cosa
  que el `LIKE '%David Cabezas%'` de Onyx no puede.
- Enriquecimiento FIDE **solo cuando la correspondencia es inequívoca**; en el caso de Cabezas
  Solano no se vinculó perfil FIDE. Coincide con el principio de Onyx de no inferir identidades.
- Ficha del jugador: partidas (filtro presencial/en línea/correspondencia), rivales, torneos,
  historial Elo FIDE mensual (vía el espejo `fideratings.com`), **árbol de repertorio por color**,
  descarga PGN y visor integrado.
- Privacidad: las fichas no tienen URL propia indexable (protección de menores). Atienden retiradas.

**Táctica**

- **Todos los puzzles salen de la Lichess Puzzle Database (CC0)**. La API devuelve exactamente su
  formato: `id`, `fen`, `moves` (UCI), `rating` y `themes` (`crushing`, `rookEndgame`, `mateIn3`,
  `long`...). Le añaden su propio FSRS y un Elo táctico por usuario.
- Esto responde a «¿de dónde sacan las tácticas?»: **Onyx ya usa la misma base** (heredada de En
  Croissant, con filtro por rating y tema). Lo que ChessCorpus añade son **modos de sesión** encima
  de esos datos, no contenido.
- Modos inferidos:
  - *Profundidad*: filtra por longitud de la solución (`moves`), equivalente a los temas
    `mateInN`/`short`/`long`.
  - *Jugadas candidatas*: Stockfish (local o `chess-api.com`) calcula varias jugadas plausibles y el
    usuario elige entre ellas.
  - *Tormenta / Contrarreloj / Racha*: variaciones de tiempo global, tiempo por problema y vidas.
  - *Repetición espaciada*: FSRS sobre los puzzles fallados.

**Finales**

- 2.536 posiciones: de la Villa (220), su workbook (353), Silman (408), Dvoretsky (890) y Müller &
  Lamprecht (718).
- Cada posición es un FEN + referencia bibliográfica (obra, parte, capítulo). Su postura legal: la
  posición es un hecho y el texto del libro no se reproduce. El nivel 1–5 probablemente viene de la
  estructura de los libros: Silman está organizado por rangos de rating
  («Part 1: Endgames for Beginners (Unrated–999)»); el resto parece asignado por obra/capítulo.
- Rival con Stockfish/Syzygy (mejor defensa). La detección inmediata de error se explica con la
  tablebase: después de cada jugada se compara el resultado teórico (WDL) con el objetivo; si pasa
  de ganado a tablas, es error. Con más de 7 piezas usan Stockfish.

**«Ver técnica»: cómo está hecho (verificado en el código servido)**

No hay ninguna llamada de red al pulsarlo: **todo el texto viene precalculado dentro del JavaScript**
(un bundle de ~2,7 MB). Son dos capas:

1. **Resumen por posición**: unas 3.150 entradas `"silman-course:10": { es, en }`, una por posición,
   en dos idiomas. Es el párrafo específico que sorprendía por lo personalizado.
2. **Fichas de técnica** por categoría o motivo: `{ title, concept, goal, steps[], keyAdvice }`, con
   claves como `queens`, `mixed` o un número de motivo (`14: "Ahogado de caballo y peón de
   torre"`). Son el «Objetivo / pasos / Consejo clave».

Conclusiones:

- La redacción es casi con certeza **generada con un LLM de forma offline**, una sola vez, y
  publicada como datos estáticos. Indicios: volumen (miles de párrafos bilingües para un solo
  autor), estilo uniforme, traducciones paralelas y la nota «redacción propia basada en la posición
  y, cuando procede, una paráfrasis breve de la idea técnica». No hay coste por uso.
- **Los errores no son alucinaciones en vivo sino de asignación**: la ficha de técnica se elige por
  categoría o capítulo, no por la posición concreta. En el final de dos damas contra rey (Silman,
  posición 10) la ficha mostrada es la genérica de «Finales de damas» y habla de coronar un peón y de
  ahogado con peones de torre, que no existen en la posición. El caso de caballo y peón de torre es
  el mismo fallo: ficha del motivo «ahogado» aplicada a la excepción en la que se gana.
- El resumen por posición sí parece específico, pero nada verifica que lo afirmado coincida con la
  tablebase.

#### Qué aprende Onyx

Detalle en el catálogo (sección 3): I-01 a I-12.

- La búsqueda por tokens normalizados es un arreglo pequeño con mucho impacto (I-01).
- La ficha de jugador «buscar → todo de ese jugador» es exactamente lo que falta para 8.2 (I-02,
  I-03).
- Lichess Broadcast es la fuente gratuita y legal que mejor sirve para preparar rivales OTB de la
  región (I-04).
- Los modos de táctica son capas de sesión sobre datos que Onyx ya tiene (I-05, I-06).
- En Finales, la evaluación por jugada es la mejora más clara respecto de Onyx (I-07).
- «Ver técnica» enseña tanto qué hacer (fichas por familia, datos estáticos) como qué evitar (fichas
  no verificadas contra la posición) (I-10 y sección 5).

#### Descartado o no aplicable

- **Anuncios, cuentas, rankings y perfiles públicos**: Onyx es local-first y sin servidor propio.
- **Puzzle del día**: valor bajo para una app de escritorio.
- **Raspado de Chess-Results**: sin licencia; no se replica.
- **Copiar su catálogo de finales o sus textos**: es su trabajo y su riesgo legal. Onyx puede seguir
  el mismo método con el material que importa el usuario (ver I-08).
- **Su interfaz**: nada especial que adoptar, como anticipó el autor.

### 2.2. ChessRamp — https://www.chessramp.com

**Veredicto:** útil sobre todo por **su motor de análisis** (cómo consigue rapidez sin perder los
veredictos) y por cerrar el ciclo partida → errores → entrenamiento. Su «Woodpecker estratégico» y
su «AI Coach» prometen más de lo que hay detrás.

#### Notas del autor (resumen)

- Carga perfiles de Lichess o Chess.com y lista **todas las partidas** con un botón de cargar o
  actualizar; abrir una para analizarla es inmediato. En Onyx hay estadísticas de la cuenta, pero
  no una lista cómoda de partidas.
- Análisis de partidas con Stockfish en el navegador, que se siente más rápido que el de Onyx.
- Bots de pago basados en Stockfish; lo único destacable es la animación al ganar o perder.
- AI Coach (premium) que busca patrones entre todas las partidas analizadas.
- Mistake Trainer (premium) que convierte los errores propios en posiciones de repaso.
- Woodpecker de «puzzles estratégicos» con muchos temas y una interfaz excelente para activar o
  desactivar sets.
- Player Report: tasas de victoria, aperturas, tendencias de precisión y errores recurrentes por
  ritmo, también para preparar a un rival.

#### Investigación técnica (verificado en el código servido el 2026-10-14)

**Stack:** SPA en React con Vite, desplegada en Vercel, login con Google o enlace mágico, pagos
propios y Google Analytics. Proxy propio para las APIs públicas de Lichess y Chess.com (la lista de
partidas es simplemente la API pública de cada plataforma).

**Motor de análisis: por qué es rápido**

1. **Stockfish 18 en WASM multihilo** (también 19 lite y una versión de un hilo como respaldo).
   Por defecto 2 hilos y 256 MB de hash, configurables por el usuario.
2. **Profundidad objetivo, no tiempo fijo:** `go depth 16` por defecto (12–15 en móvil), con un
   `movetime` opcional como tope. En posiciones sencillas profundidad 16 se alcanza en muy poco
   tiempo; el tiempo solo se gasta donde la posición lo exige.
3. **Profundidad adaptativa en partidas largas:** con 80 o más medias jugadas baja la profundidad
   en las primeras 12 y en una de cada tres del resto.
4. **Evaluaciones en la nube de Lichess para la apertura:** consulta `lichess.org/api/cloud-eval`
   en las primeras 36 medias jugadas (MultiPV 2–3, solo si la profundidad guardada es ≥ 18), con
   80 ms entre peticiones, un presupuesto de 12 s, corte tras 3 posiciones sin datos y respeto del
   `429`. Las posiciones de apertura casi nunca se calculan localmente.
5. **Segunda pasada dirigida:** después de la pasada rápida vuelve a analizar solo las jugadas
   candidatas a error o a jugada brillante, a profundidad 22 con 1,5 s por posición y un límite de
   15 s. La precisión se concentra donde cambia el veredicto.

Esto respalda su propia afirmación: para los errores que deciden partidas por debajo de nivel
maestro, una búsqueda más profunda coincide con la superficial sobre qué jugada perdió.

**Clasificación y métricas**

- Probabilidad de victoria con **la fórmula de Lichess**
  (`50 + 50·(2/(1 + e^(−0.00368208·cp)) − 1)`, con cp acotado a ±1000) y clasificación por pérdida
  de probabilidad, no por centipeones.
- Categorías: brillante, genial, mejor, excelente, buena, libro, imprecisión, error, oportunidad
  perdida («miss»), error grave y forzada. Identificación de apertura por libro.
- **La jugada brillante tiene reglas explícitas y un motivo de rechazo** guardado por jugada:
  «otra jugada era igual de buena», «había otras jugadas adecuadas», «la partida ya estaba
  decidida», «recaptura rutinaria», «jugada fuera del MultiPV analizado». Detecta sacrificios
  (casilla, pieza y valor).
- **Momentos clave:** la jugada con mayor pérdida de probabilidad por encima de un umbral; además
  cruza errores con poco reloj cuando la partida tiene relojes.
- **Precisión** calibrada, según dicen, contra el Game Review de Chess.com con 200 partidas rápidas.
- **Elo estimado:** fórmula heurística sobre ACPL: sin rating de referencia,
  `3100·e^(−0.01·ACPL)` contraído hacia 1500 según el número de jugadas; con el rating del rival,
  ajusta respecto del ACPL «esperado» a ese rating. No es un modelo calibrado.

**AI Coach:** en el código público no aparece ninguna llamada a un modelo de lenguaje. Lo que se ve
es un «coach» con mascota animada y burbujas de texto por plantillas según la categoría de la
jugada. El informe de patrones es premium y su lógica vive en el servidor; por lo que describen
(precisión por fase, ritmo y estructura; tipo de error dominante: material colgado, amenazas no
vistas, falta de plan, conversión) puede ser reglas sobre las métricas del motor, con o sin un LLM
para la redacción. **No verificable.**

**Woodpecker «estratégico»: de dónde salen los ejercicios.** Los 16 temas que anuncian son
literalmente **temas de la base de puzzles de Lichess**: `advancedPawn`, `promotion`, `quietMove`,
`zugzwang`, `defensiveMove`, `exposedKing`, `kingsideAttack`, `queensideAttack`, `attackingF2F7`,
`castling`, `crushing` y los cinco de finales (`rookEndgame`, `pawnEndgame`...). Los sets son 40
puzzles de un tema dentro de una de diez bandas de rating (600–2799), más sets mixtos de 240–300 por
nivel. Es decir: **puzzles de Lichess filtrados por tema y rating**, con una solución concreta que
encontrar, no ejercicios de plan en sentido estricto. Lo valioso es la presentación (estantería de
sets activos con resueltos, precisión de 7 días y tiempo medio), no el contenido.

**Bots:** Stockfish debilitado. Su propio texto admite que un motor debilitado con aleatoriedad no
juega como un humano. Los bots humanos de Onyx (Maia) son superiores en este punto.

#### Comparación con Onyx

- **Análisis:** Onyx analiza cada posición con **tiempo fijo** (por ejemplo 500 ms) y MultiPV 2 en un
  solo proceso, secuencialmente (`analyze_game` en `src-tauri/src/chess.rs:651`). Una partida de 80
  medias jugadas tarda unos 40 s pase lo que pase, y en Player Analysis se repiten las mismas
  posiciones de apertura en decenas de partidas. Stockfish nativo es más rápido que WASM, así que
  **la diferencia está en la estrategia, no en el motor**.
- **Clasificación:** Player Analysis usa umbrales de centipeones (40/100/200) y «Aprende de tus
  errores» usa probabilidad de victoria (3 puntos). Conviene unificar.
- **Errores → entrenamiento:** Onyx ya tiene «Añadir al set» y «Aprende de tus errores», pero son
  manuales y por partida; falta una cola automática y espaciada.

#### Descartado o no aplicable

- **Bots con Stockfish debilitado**: inferiores a los de Onyx.
- **Animación de victoria/derrota**: pulido opcional; Onyx ya tiene sonido y aviso.
- **Elo estimado con su fórmula**: contradice el principio de no afirmar ELO sin calibración. Sí
  tiene sentido como estudio calibrado (I-16).
- **«Estrategia» como etiqueta de puzzles tácticos filtrados**: no la copiamos con ese nombre.

### 2.3. King Takes King — https://kingtakesking.com

**Veredicto:** poco útil; no merece más tiempo. Es un «resumen del año» al estilo Spotify Wrapped:
introduces tu usuario y genera unas veinte pantallas y un póster («la leyenda a la que te pareces»,
tu mejor remontada, tu némesis, tu jugada más cara, una puntuación propia). El entrenamiento que
anuncian todavía no está abierto; lo de pago es eso.

Dos ideas sí son aprovechables:

- **Momentos destacados del jugador** (I-22): jugada más cara, mayor remontada, victoria contra
  alguien mucho más fuerte, rival con peor marcador. Se calculan con datos que Onyx ya tiene y dan
  vida a la ficha del jugador.
- **Un objetivo se cumple cuando cambian tus partidas reales** (I-23): «piezas colgadas por partida
  1,4 → 0,8 en 38 partidas». Encaja con la relación observacional entre entrenamiento y resultados de
  7.3.3, siempre presentada como observación, no como causa.
- **Explicación factual por plantilla:** su ejemplo «3…Nf6 es un error grave: permite mate en una,
  4.Qxf7#» se genera con hechos del motor, sin IA (I-24).

Descartado: la «leyenda a la que te pareces» (estilo sin evidencia, contrario a los principios de
Onyx) y la puntuación propia sin definición.

### 2.4. Chess.ceo — https://chess.ceo (y la cuestión de la Gigabase)

**Veredicto:** útil como referencia de **cómo se sirve una base grande con respuesta instantánea**
y de qué estadísticas mostrar por jugada. No declara de dónde salen sus partidas.

#### Notas del autor (resumen)

- Lo importante es su base: 14 millones de partidas. Otra página (¿«Aidachess»?) también ofrece 14
  millones.
- Duda sobre la limpieza de la Gigabase en Onyx y sobre ofrecer una Gigabase más completa: hoy Onyx
  descarga una versión antigua de 9 millones, mientras la oficial tiene más de 12 millones OTB y
  más de 6 millones online.

#### Investigación técnica (verificado el 2026-10-14)

- Servidor propio (nginx) con API `/api/chess/database/main?fen=…`. Cada posición se identifica por
  un **hash de 64 bits** y la respuesta llega al instante incluso para posiciones raras (probado con
  una de 4 partidas en la jugada 7): tienen **un índice de todas las posiciones** precalculado en el
  servidor, no un escaneo.
- Estadísticas por jugada: partidas, victorias/tablas/derrotas, número de transposiciones, Elo
  medio, **`perfDelta`** (rendimiento respecto a lo esperado por Elo), jugadores destacados y
  **`hotness`** (popularidad reciente).
- Límite de 500 consultas al día por usuario, login con Google o Lichess, app móvil y una función de
  sincronización con escritorio. Stockfish y Leela en WASM.
- **Sus créditos no mencionan ninguna fuente de partidas.** Que Nakamura y Carlsen encabecen casi
  todas las jugadas indica que incluye partidas online de titulados; es probable que sea una base
  tipo Gigabase OTB + online, pero no se puede confirmar.
- **AidaChess** (https://www.aidachess.com): navegador de una base de 14 M de partidas con torneos,
  red social, apps y «comentarios con IA». No declara la fuente de las partidas. Nada que aprender.

#### La Gigabase: qué es y qué haría falta

La Gigabase es **LumbrasGigaBase** (lumbrasgigabase.com). Datos de su página oficial:

- OTB: más de 12 M de partidas; Online: más de 6 M. Publicación mensual (primera semana de cada mes).
- Formatos: PGN y Scid (`.si4`/`.si5`), con parches mensuales incrementales para Scid.
- **Limpieza propia en 10 pasos**: deduplicación con elección del registro más completo,
  normalización de nombres (coincidencia difusa, historial de Elo e IDs FIDE), cuarentena de
  conflictos (colores invertidos, IDs FIDE discrepantes), sin evaluaciones de motor, conserva
  `%clk`/`%emt`. Solo ajedrez estándar desde la posición inicial.
- Exclusiones: TWIC retirada; retransmisiones de Lichess aparte (descarga separada, CC BY-SA).
- **Licencia de la base principal: CC BY-NC 4.0.** Uso libre para análisis personal; para integrarla
  comercialmente en apps pide contactar al autor. Onyx no es comercial, pero conviene escribirle
  igualmente antes de ofrecerla desde la app.
- Aviso de un usuario (mayo de 2026): muchas partidas de 2025 aparecen **cortadas** tras 8–10
  jugadas. No consta si se corrigió. Es justo el tipo de problema que un control de calidad debería
  detectar (I-26).

**Conclusión sobre la calidad:** la Gigabase oficial ya pasa por un proceso de limpieza serio; la
sensación de suciedad en Onyx probablemente viene de la **copia antigua de 9 M del catálogo heredado
de En Croissant**, no de la base actual. Lo que sí falta en Onyx es comprobarlo con datos (I-26).

**¿Fusionar OTB + Online?** No lo recomiendo:

- son poblaciones distintas: las online son mayoritariamente rápidas y blitz, y mezclarlas sesga los
  informes de posición, los filtros por Elo y la preparación de rivales OTB;
- el tamaño sube a ~18 M. Hoy la búsqueda por posición de Onyx es un escaneo completo: unos 26 s por
  FEN nuevo con 10,3 M de partidas (medido en 7.0, compilación debug); con 18 M serían ~45 s;
- dos bases separadas permiten elegir la adecuada para cada tarea.

**Cómo funciona hoy el catálogo de Onyx (verificado en el código):** las bases, los puzzles y los
motores descargables vienen de un catálogo **de En Croissant**, no de Onyx: `src/utils/http.ts`
apunta a `https://encroissant.org`, que publica `databases.json` y `puzzle_databases.json`. Cada
entrada enlaza un `.db3` **ya convertido y alojado por el autor de En Croissant** en
`db.encroissant.org`. Contenido actual del catálogo:

| Base | Partidas | Tamaño |
| --- | --- | --- |
| Lumbra's Gigabase (2025-06) | 9,57 M | 2,8 GB |
| Caissabase 2024 | 5,40 M | 1,3 GB |
| Ajedrez Data OTB | 4,28 M | 1,0 GB |
| MillionBase | 3,45 M | 0,8 GB |
| Ajedrez Data Correspondencia | 1,52 M | 0,3 GB |
| Lichess Puzzles 2026 (puzzles) | 5,75 M | 1,2 GB |

Es decir, la «opción 2» de abajo ya existe, pero la mantiene otra persona: Onyx no controla cuándo se
actualiza ni qué contiene, y si ese servidor cambia o desaparece, el catálogo de Onyx se queda vacío.
La licencia la gestiona hoy En Croissant al redistribuir; si Onyx aloja sus propias copias, pasa a
ser responsabilidad de Onyx.

**Lo que haría falta para ofrecer las dos desde Onyx** (I-25), de menos a más trabajo para el autor:

1. **Descarga oficial + conversión local:** el catálogo de Onyx apunta a los archivos oficiales;
   Onyx descarga, descomprime, convierte a su formato y construye el índice, con progreso y
   cancelación. El autor no aloja nada. Coste: la conversión de 12 M de partidas tarda (hay que
   medirlo) y necesita varios GB libres (la base de 10,3 M ocupa ~3 GB de SQLite + ~1,8 GB de índice).
2. **Base ya convertida alojada por el autor:** el autor convierte en su equipo cada mes y sube el
   resultado, por ejemplo a Cloudflare R2 (10 GB gratis y sin coste de salida, el mismo truco que
   ChessCorpus). GitHub Releases limita cada archivo a 2 GB. Para el usuario es más rápido, pero
   exige al autor un proceso mensual y cumplir la licencia (atribución, no comercial, indicar
   cambios).

Recomendación final: **un catálogo propio de Onyx** (aceptado: un JSON en el repositorio) que combine
entradas de En Croissant con entradas propias. Al revisar las descargas de Lumbras se vio que no hay
enlaces directos estables (gestor de WordPress con tokens que caducan), así que la opción realista
es la 2: el autor convierte y aloja las bases. Proceso y alojamiento en I-25. **Aceptado por el
autor como tarea previa a la preparación (8.3).**

### 2.5. FlexiChess — https://flexichess.com

**Veredicto:** **la página más útil hasta ahora para 8.2.** Su «Analyze player» y su «Leakfinder»
están hechos con reglas explícitas que se pueden leer en el código servido, y muestran tanto buenas
ideas como errores de método que Onyx debe evitar.

#### Notas del autor (resumen)

- **Analyze player** (base de datos, Lichess, Chess.com o PGN). Con David Cabezas dio un veredicto
  («cómo jugarle»), revisión de aperturas, estructuras de peones comparadas con maestros 2400+,
  tendencias de estilo frente a lo esperado, «estilo general: agudo» y finales por familia con
  «rating par».
- **Leakfinder**: 170 partidas en 4 min 30 s, «6 motores, nada se sube», 1,3 GB de RAM en la
  pestaña. Muchas categorías («Unforced errors», «Endgame slips», «Hanging pieces», tiempo,
  estructura…), cada una con «×N master rate» y una gráfica de evolución por categoría.

#### Investigación técnica (verificado en el código servido el 2026-10-14)

**Stack:** Next.js, autenticación con Clerk, pagos con Polar, Cloudflare. Biblioteca del usuario en
el navegador (IndexedDB) con copia en la nube; base de 10,4 M de partidas con búsqueda de posición
en el servidor. Stockfish 18 en WASM.

**Leakfinder: por qué es tan rápido.** Perfiles de análisis en el código:

| Perfil | Pasada gruesa | Pasada fina (solo si la evaluación cambia) | Umbral de cambio | Límite por partida |
| --- | --- | --- | --- | --- |
| Estándar (por defecto) | profundidad 8 (tope 400 ms) | profundidad 12 (tope 1,5 s) | 30 cp | 25 s |
| Profundo | profundidad 14 (tope 2,5 s) | profundidad 18 (tope 6 s) | 20 cp | 7 min |

Con 6 motores en paralelo (uno por núcleo, de ahí la RAM). **Respuesta a tu pregunta: sí, el
análisis estándar es de menor calidad que el de Onyx a 500 ms**: Stockfish nativo en 500 ms llega
habitualmente bastante más hondo que profundidad 12. Para errores graves de club (≥ 1 peón) basta;
para imprecisiones y posiciones tranquilas, no. La velocidad sale de tres cosas: profundidad baja,
dos pasadas y paralelismo. Onyx puede tomar las dos últimas sin bajar la calidad (I-14).

**Catálogo de fugas (literal del código, con umbrales).** Cada error se asigna a la categoría más
específica; «Unforced errors» es el cajón de sastre:

| Clave | Nombre | Regla |
| --- | --- | --- |
| `hung_piece` | Piezas colgadas | Tras tu jugada el rival puede capturar una pieza sin defensa suficiente que antes no estaba colgada. |
| `missed_tactic_fork` | Horquillas no vistas | La mejor jugada era una horquilla y la jugada hecha perdió ≥ 0,8. |
| `missed_tactic_pin_skewer` | Clavadas y enfiladas no vistas | La mejor creaba clavada/enfilada y la hecha perdió ≥ 0,5. |
| `allowed_tactic` | Caer en tácticas | Tu jugada permitió una horquilla, clavada o enfilada nueva, costando ≥ 1,2. |
| `back_rank` | Última fila | Quitaste la casilla de escape o la cobertura de la última fila, costando ≥ 0,8. |
| `king_safety` | Rey expuesto | Empeoraste el escudo del rey (peón perdido o columna abierta junto a él), costando ≥ 0,5. |
| `pawn_structure` | Concesiones estructurales | Nuevo peón aislado, doblado o retrasado, costando ≥ 0,5. |
| `bad_exchange` | Malos cambios | Captura sin pérdida material que deja la posición ≥ 0,7 peor. |
| `opening_eval_loss` | Fugas de apertura | En las primeras 20 medias jugadas, pérdida ≥ 0,5 sin categoría más específica. |
| `endgame_technique` | Desliz en el final | En el final, pérdida ≥ 0,6 sin categoría más específica. |
| `time_trouble_collapse` | Errores de apuro de tiempo | Pérdida ≥ 0,5 con poco reloj según los relojes de la partida. |
| `lost_won_position` | Conversiones fallidas | Con +4,7 o más, una jugada te deja por debajo del 35 % de tu mejor evaluación de la partida. |
| `missed_win` | Victorias tiradas | Con ≥ 90 % de puntuación esperada, una jugada te baja de 75 % o pierde 6+ peones. |
| `conversion_drift` | Ventaja que se escapa | Con +2 o más, la ventaja se diluye a igualdad en 4+ jugadas sin ningún error aislado. |
| `low_resourcefulness` | Derrumbe al estar peor | Peor pero defendible (−1,2 a −7) y pierdes otros 1,2+. |
| `costly_mistake` | Errores no forzados | Pérdida ≥ 0,5 (o error/error grave) que no encaja en ninguna anterior. |

Las categorías se ordenan por **coste total en peones** («8,9 peones devueltos por partida») y por
cuántas partidas convirtieron una posición ganada o igualada en derrota. Cada una trae un remedio en
una frase.

**El «×N master rate»:** compara la frecuencia de cada fuga con la de jugadores de 2400+. Tu crítica
es correcta: si tus partidas son blitz y las de referencia son clásicas, la comparación mezcla ritmo y
nivel. Además el análisis estándar es poco profundo, y la profundidad cambia cuántos errores se
encuentran. Una comparación honesta exige referencia del **mismo ritmo y banda de Elo, analizada con
el mismo perfil de motor**.

**Analyze player: cómo calcula cada cosa**

- **Estilo «Sharp/Balanced/Solid»** (literal del código): *agudo* si los enroques opuestos son
  ≥ 25 % o las partidas decisivas ≥ 60 %; *sólido* si las decisivas son ≤ 42 %; si no, *equilibrado*.
  Es tosco: el porcentaje de partidas decisivas depende mucho del Elo y del ritmo, y la etiqueta no
  usa el «esperado» que sí muestra la tabla.
- **«Expected» / «Rating par»:** puntuación esperada por la diferencia de Elo con cada rival (fórmula
  de Elo) comparada con la real. Es el método correcto para aperturas y finales, porque descuenta la
  fuerza de los rivales. Los finales con material desigual se excluyen («no tienen par»).
- **Estructuras de peones:** clasificador por reglas con nombres (IQP blanco/negro, peones colgantes,
  Carlsbad, erizo, siciliana abierta, Maróczy, cadena francesa, Eslava, india de rey, Benoni,
  Londres…) y comparación con maestros 2400+. Aquí la comparación con maestros sí tiene más sentido
  (mide la estructura, no el ritmo), aunque sigue sin descontar el Elo.
- **Veredicto «cómo jugarle»:** recomendaciones a partir de las líneas donde el rival puntúa por
  debajo de su par, con tamaño de muestra («38 % frente a un par de 50, 8 partidas»).
- **Posiciones clave robustas o agudas:** verifica cada posición clave con el motor y cuenta cuántas
  jugadas mantienen la evaluación: 2 o más → «robusta»; solo una → «aguda». Sirve para buscar
  posiciones donde el rival tiene que encontrar una única jugada.
- **Huecos del repertorio:** respuestas no cubiertas ordenadas por frecuencia real en la base.

**Pallas (coach con IA):** un LLM responde preguntas sobre la posición en lenguaje natural y **cada
jugada o táctica que menciona se reproduce y se comprueba con Stockfish antes de mostrarse**. Cuotas
semanales (1 al día sin cuenta, 5/semana gratis, 35/semana Pro) para controlar el coste. También
permite buscar partidas escribiendo una frase («Najdorf con sacrificio de calidad») que se traduce a
filtros, diciendo qué entendió y qué no.

#### Qué aprende Onyx

- El catálogo de fugas es la extensión natural del catálogo verificable de 7.3.4 (I-29).
- El «rating par» es el método que Onyx debería usar en toda comparación de resultados (I-30).
- Estructuras con nombre, veredicto y posiciones robustas/agudas encajan en la pestaña Preparación
  (I-31 a I-33).
- Pallas es la referencia más seria hasta ahora para la futura IA (sección 5).

#### Descartado o no aplicable

- **Etiqueta de estilo con umbrales fijos**: se sustituye por la versión con «esperado» (sección 5,
  principios de estilo).
- **«×N master rate» sin igualar ritmo, nivel y motor**: no se copia tal cual.
- **Nube y cuotas**: Onyx es local.

### 2.6. Listudy — https://listudy.org

**Veredicto:** sencilla pero con tres ideas valiosas: el **flujo continuo** de memorización, las
**tácticas a ciegas y sin piezas** para visualizar, y un **catálogo de finales de dominio público**.
Código abierto (Elixir/Phoenix + PostgreSQL, licencia **AGPL-3.0**); revisado en el repositorio.

#### Notas del autor (resumen)

- Repertorios desde estudios de Lichess con repaso: muy fluido, pasa de línea en línea sin pausas,
  vuelve a las falladas y repite las importantes. «Memorización absoluta», con sus desventajas.
  Propuesta del autor: en el modo Aprender de Onyx, exigir al menos **2 repeticiones de memoria**
  para dar una línea por aprendida, como Chessable.
- Táctica normal (sin novedad) y **Visualización**: tácticas a ciegas (se ve la posición de N medias
  jugadas antes y hay que jugar sobre la posición real) y tácticas sin piezas (tablero vacío y lista
  de dónde está cada pieza).
- Finales con categorías y subcategorías, tomados de «Chess Studies, Or, Endings of Games».

#### Investigación técnica (código del repositorio)

- **Cómo consigue la fluidez:** no hay calendario ni calificación por línea. Cada **jugada** del
  árbol tiene un valor de dominio de 0 a 5: un acierto suma 1 (máximo 5) y un error lo pone a 0. Al
  responder, el «rival» elige la rama cuyo **valor mínimo** es más bajo (la parte más débil del
  repertorio), con azar ponderado por el tamaño de la rama. Las pistas aparecen solo si el valor es
  menor que 2. Por eso nunca hay que decidir nada: el árbol mismo dirige la sesión hacia lo que
  peor se sabe. Es un sistema tipo Leitner por jugada, no repetición espaciada con fechas.
- **Tácticas:** tabla propia con jugadores, torneo, apertura y motivo de cada ejercicio, lo que
  indica que salen de partidas de maestros; los datos no están en el repositorio.
- **Tácticas a ciegas:** se guardan como **la partida completa en PGN + la media jugada donde empieza
  el ejercicio**. El usuario elige cuántas medias jugadas ocultar: el tablero muestra la posición de
  antes y las jugadas ocultas se dan por texto.
- **Tácticas sin piezas:** FEN + solución + número de piezas (para filtrar por dificultad).
- **Finales:** 159 posiciones escritas directamente en el código, organizadas en capítulos
  (mates básicos, peones, alfiles, caballos, torre contra peones, dama contra peones…) y
  subcapítulos. Fuentes: **Kling y Horwitz, «Chess Studies, Or, Endings of Games» (1851)** y
  **Capablanca, «Chess Fundamentals» (1921)**. El rival es Stockfish a 1 s por jugada, sin tablebase.

#### Qué aprende Onyx

- **Modo «Repaso continuo»** en Aperturas (I-36), como complemento del FSRS, no como sustituto.
- **Repeticiones para aprender** configurables (I-37).
- **Visualización** en Táctica: a ciegas y sin piezas (I-38). Onyx tiene una ventaja: los ejercicios
  creados desde Player Analysis y los sets PGN con partida ya conservan la partida y el ply exactos.
- **Finales de dominio público** (I-39, ahora aplazada): libres de derechos, aunque tienen el mismo problema de formato que los demás libros. Libros del
  siglo XIX y de autores fallecidos hace más de 70 años se pueden incluir sin el riesgo de los libros
  modernos.

#### Descartado o no aplicable

- **Copiar su código o su catálogo:** es AGPL. Las posiciones de libros de dominio público se toman
  de las fuentes originales, no de su repositorio.
- **Su rival de finales** (Stockfish 1 s sin tablebase): Onyx ya va más allá (I-07).

### 2.7. qchess — https://qchess.net (solo «Winrate Repertoires»)

**Veredicto:** muy útil para una funcionalidad concreta: **generar repertorios automáticamente**
desde estadísticas de una base. qchess tiene muchas más herramientas que podrían revisarse en otra
ronda (lista al final de la ficha).

#### Notas del autor (resumen)

- ChessBase tiene algo parecido; qchess ofrece tres enfoques prácticos: **Best Winrate**, **Best
  Score** y **Low Theory**. Duda: cómo se calcula que algo sea «posicional» o «agresivo».
- El resultado lleva símbolos de valoración al final de cada variante (=, ⩲…), glifos en algunas
  jugadas (!?, !, ?) y la evaluación del motor. ChessBase enlaza partidas de referencia en líneas
  concretas; Onyx ya tiene enlaces a partidas.

#### Investigación (textos de ayuda del generador, verificados el 2026-10-14)

Parámetros, con su definición literal resumida:

| Parámetro | Qué hace |
| --- | --- |
| Foco: Best Winrate | En tu turno elige la jugada con mayor porcentaje de victorias. |
| Foco: Best Score | Igual, pero contando tablas como medio punto. |
| Foco: Low Theory | Elige **las jugadas más raras** para reducir el número de líneas que aprender. |
| Color y profundidad | Bando y profundidad máxima (por defecto 8). |
| User Move Range | Solo considera tus N jugadas más jugadas (por defecto 3) y elige la mejor de ellas. |
| Opponent Move Range | Añade las N respuestas más jugadas del rival (por defecto 3). |
| User / Opponent Game Amount | Mínimo de partidas para considerar una jugada (por defecto 30). |
| Avoidance Moves + Avoidance Time | Jugadas prohibidas (p. ej. `d6,e6,f6`) durante las primeras N jugadas. |
| Engine-proof + umbral | Descarta jugadas con buenas estadísticas pero mala evaluación según la nube de **chessdb.cn**. |
| Top Move Deviation Threshold | Pérdida máxima frente a la mejor jugada del motor (0,3 por defecto; 0 = siempre la del motor). |
| Usar Lichess para rival / usuario | Toma estadísticas de Lichess en vez de su base (mucho más lento). |
| Auto Annotate PGN | Glifos (?!, ?, ??) y símbolos de evaluación (=, ±, +−) a partir de evaluaciones guardadas en su base. |
| Transposition comments | Comenta las transposiciones dentro del árbol. |

- Base: «elite database» propia, ~4 M de partidas OTB 2010–2025, **sin partidas por correspondencia
  ni rápidas** (por eso los porcentajes difieren de Lichess Masters).
- También tiene «Drawrate Repertoires» (elige las jugadas con más tablas).
- El generador se usa desde el tablero de análisis: clic derecho sobre la última jugada de una
  variante → «Generate», y se pueden editar o borrar líneas antes de volver a generar.

**Sobre «posicional» o «agresivo»:** qchess no lo intenta; sus tres focos son medibles. No he podido
comprobar cómo lo calcula ChessBase. Si Onyx ofrece un estilo, debe definirse con medidas (sección 5,
principios de estilo), por ejemplo: **agudo** = jugadas que llevan a posiciones con más partidas
decisivas y evaluaciones más inestables que lo esperado para ese Elo; **sólido** = menor porcentaje de
derrotas y evaluación estable.

**Problemas de método que Onyx debería evitar:**

1. **El porcentaje bruto engaña:** una jugada elegida sobre todo por jugadores más fuertes que su
   rival puntúa bien por quién la juega, no por la jugada. Usar el **rendimiento frente a lo
   esperado por Elo** (I-28/I-30).
2. **Las muestras pequeñas engañan:** 30 partidas con 65 % pueden ser suerte. Ordenar por un valor
   prudente (por ejemplo, el límite inferior de un intervalo de confianza) en vez del porcentaje.
3. **«Low Theory» como «jugada más rara» es tosco:** una jugada rara puede dejar al rival muchas
   respuestas razonables. Mejor medir directamente cuántas respuestas del rival hay que cubrir
   (cuánto se ramifica el árbol resultante).

**Herramientas de qchess para una posible revisión posterior:** Opening Weakness Finder, Lichess
Clasher (simula las posiciones probables entre dos jugadores), Repertoire Shortener (reduce un
repertorio a sus líneas clave), Repertoire Flow, Novelty Finder, Time Management, Blunder Fix, Eval
Drill, Guess The Move, Intuition Storm, Opening Models y Model Games.

#### Qué aprende Onyx

Un **generador de repertorios** propio (I-40) y su variante contra un rival concreto (I-41), con
ventajas que qchess no tiene: base local filtrable por ritmo y Elo, rendimiento frente a lo esperado,
Maia para predecir qué responderá un rival de cierto nivel, motor local para verificar, enlaces a
partidas modelo y entrada directa al modo Aprender.

### 2.8. FireChess — https://www.firechess.com

**Veredicto:** buena **presentación** de un informe de jugador (radar, secciones por tema, ejercicios
con flechas y texto), pero **método débil**: análisis superficial y temas posicionales asignados por
reglas geométricas muy toscas. Útil sobre todo como ejemplo de qué no prometer.

#### Notas del autor (resumen)

- Analizó 50 partidas en ~1,5 minutos. Informe extenso: radar (finales, tiempo, apertura, ojo
  táctico, compostura…), estadísticas por fase y «mentales» (derrotas tras derrota, pérdidas por
  tiempo, abandonos prematuros…).
- Ejercicios de táctica, finales, reloj y errores posicionales («King Exposure», «Released Tension»,
  «Center Neglect», «Premature Pawn Break»…) con descripción, flechas y casillas marcadas. Algunas
  frases se repiten exactas en varios finales.
- Recomendaciones y una sección para entrenar cada cosa desde los propios errores.

#### Investigación técnica (código servido, verificado el 2026-10-14)

- Next.js; Stockfish 18 en el navegador. **Profundidad 6–12** elegible por el usuario (anunciado en
  su portada), con `go depth N movetime …` y un tope de 4–17,5 s. Explica la velocidad y la calidad
  baja, igual que FlexiChess estándar.
- **Temas posicionales: reglas literales del código.** Se aplican a la jugada jugada frente a la
  mejor del motor, con una pérdida mínima en centipeones:
  - *Released Tension*: la jugada es un peón que captura un peón, la mejor no capturaba, pérdida
    ≥ 0,15.
  - *Premature Pawn Break*: cualquier avance de peón (columnas b–g) que no captura, cuando la mejor
    no era de peón, pérdida ≥ 0,20–0,25.
  - *King Exposure*: mover un peón a dos columnas o menos del rey con pérdida ≥ 0,40, o mover el rey
    con pérdida ≥ 0,50.
  - *Center Neglect*: la mejor jugada iba cerca del centro y la jugada hecha lejos, pérdida ≥ 0,15.
  - *Passive Retreat*: una pieza retrocede con pérdida ≥ 0,20. También *Unnecessary Capture*,
    *Premature Trade*, *Greedy Pawn Grab*, *Aimless Move*, *Overextended Pawn*, *Missed Outpost*…

  Es decir: **etiquetan la forma de la jugada, no la razón del error.** Si un peón junto al rey
  pierde 0,4 porque permite una táctica, se llama «King Exposure». No hay verificación de que el
  tema explique la pérdida.
- **Textos:** plantillas. Una frase factual sobre la mejor jugada («g5+ era mejor, no Bb1: da jaque y
  toma la iniciativa»; «e5 cae en Nf5+, horquilla al rey y la torre»), un consejo fijo por tema (de
  ahí las frases repetidas) y una cita célebre asociada a cada tema. No hay indicios de IA en vivo.
- **Radar y puntuaciones** («Composure», «Consistency 97/100», «73 overall»): compuestos sin
  definición publicada. El texto «The Big Picture» también es plantilla.
- **Estadísticas mentales:** agregados simples sobre la secuencia de partidas (resultado tras una
  derrota, pérdidas por tiempo, abandono con evaluación no perdida, jugadas rápidas con poco
  tiempo invertido que cuestan mucho).

#### Qué aprende Onyx

- Presentación de ejercicios con **flechas y casillas marcadas** que explican la amenaza o la mejor
  jugada (I-46).
- Estadísticas psicológicas y de reloj bien definidas, con muestra (I-44).
- El ejemplo negativo de los temas posicionales se recoge como principio (sección 5).

#### Descartado o no aplicable

- **Temas posicionales por geometría de la jugada** y **radar con puntuaciones opacas**.
- **Profundidad 6–12** como base de conclusiones.

### 2.9. ChessStalker — https://chessstalker.com

**Veredicto:** **la referencia más directa para la pestaña Preparación.** Rápido porque la mayoría de
sus estadísticas no necesitan motor; aporta la vista jerárquica de aperturas, la psicología del rival
y un bot gemelo cuyo funcionamiento se puede reproducir en Onyx con lo que ya existe.

#### Notas del autor (resumen)

- 500 partidas cargadas muy rápido; análisis más superficial (sin motor salvo en partes), como el
  perfil actual de Onyx antes de lanzar el análisis de motor.
- Líneas donde más sufre y donde mejor le va, con blancas y con negras.
- **Repertorio por familias plegables:** «English Opening» con su total, y al desplegar sus
  subvariantes. En Onyx el autor ve su Francesa partida en muchos nombres con 1–2 partidas cada uno.
  Propuesta del autor: Francesa → Avance / Cambio / … → subvariantes concretas.
- Psicología y reloj; rivales frecuentes (némesis y presa); cara a cara.
- Tablero con el árbol de aperturas del jugador y flechas con porcentaje.
- **Bot «Gemelo»** basado en 542 partidas; la fuerza parecía la del jugador real.

#### Investigación técnica (código servido, verificado el 2026-10-14)

- **Bot gemelo, cómo funciona:** mientras la posición está en el **libro construido con las partidas
  del jugador**, juega una de sus jugadas con la probabilidad con que él la juega (con una pausa
  aleatoria de 0,5–1 s). Al salir del libro llama a **Maia 3 en su servidor** con la posición y el
  **Elo estimado del jugador**. Nada más: copia el repertorio real y luego juega «como un humano de
  ese Elo», no como esa persona en concreto. Con 542 partidas el libro es profundo, por eso se nota
  tan fiel.
- **Debilidades:** aperturas con porcentaje de derrotas > 40 % con blancas o > 50 % con negras y al
  menos 8 partidas, ordenadas por `derrotas + partidas/10`. No descuenta el Elo de los rivales (I-30
  lo resolvería).
- **Familias de aperturas:** toma el nombre antes de «:» y quita sufijos como «Game», «Defense»,
  «Opening», «Attack», «Gambit» o «System». Los nombres estándar (los mismos de los TSV que Onyx
  incluye en `src-tauri/data`) siguen la forma **«Familia: Variante, Subvariante»**, así que la
  jerarquía de tres niveles que propone el autor sale directamente del nombre.
- **Cuándo falla:** distribución de errores graves por tramos de jugadas (1–15, 16–25, 26–35,
  36–45, 46+), con una conclusión de una línea («busca finales largos»).
- **Stalker Score** (lo predecible que es, 0–100) y **26 arquetipos** («El Berserker»…):
  definiciones propias no publicadas.
- Datos: APIs públicas de Lichess y Chess.com; base FIDE/OTB de 13 M+ (registros públicos, ICCF,
  retransmisiones de Lichess y **TWIC con licencia comercial**). «Studio» de pago: varios tableros
  con libro de maestros, Maia y Stockfish para preparar.

#### Comparación con Onyx

- El panel de aperturas del perfil (`OpeningsPanel.tsx`) agrupa por **nombre completo** sin
  jerarquía: de ahí la Francesa fragmentada.
- Onyx ya tiene todo lo necesario para el gemelo: partidas del jugador, árbol de aperturas, Maia 3
  administrado y bots humanos con repertorio.

#### Qué aprende Onyx

- Jerarquía de aperturas Familia → Variante → Subvariante (I-42), **aceptada por el autor**.
- Bot gemelo (I-43).
- Psicología, reloj y distribución de errores por tramo (I-44); rivales frecuentes y cara a cara
  (I-45).

#### Descartado o no aplicable

- **Arquetipos y Stalker Score** sin definición pública.
- **Tablero con el árbol del jugador:** útil pero secundario; se cubre con el explorador filtrado
  por jugador (verificar qué permite ya el panel de base de datos).

### 2.10. Chessiverse — https://chessiverse.com

**Veredicto:** la referencia original de los bots de Onyx sigue siendo la mejor para **bots,
rating contra bots y torneos con el usuario**. Lo verificable de su técnica confirma el camino de
Onyx; lo que más interesa copiar es la experiencia de torneos.

#### Notas del autor (resumen)

- Más de 1.000 bots con personalidad, estilo, repertorio y puntos fuertes; algunos adaptativos (con
  uno basta). Mil parece excesivo: el autor quiere más bots, pero que se sientan distintos.
- Bots de 2.800 o más: ¿cómo, si se basan en Maia? Atlas (el más fuerte de Onyx) todavía falla algo
  en partidas lentas, y Maia 3 llega a unos 2.600.
- Perfil con rating y partidas puntuables o amistosas contra bots.
- **Torneos:** predefinidos que rotan (diarios, semanales, mensuales) con nombres verosímiles y bots
  de un país; opens suizos a 9 rondas con cientos de jugadores; torneos propios con formatos
  round-robin, suizo, eliminación directa y doble, filtros para autorrellenar participantes y
  **plantillas** (eres favorito, todos de tu nivel, todos mejores que tú y otras experimentales).
- **Corrección al roadmap:** los torneos de Onyx deben centrarse en que **el usuario participe**;
  los torneos solo de bots son un experimento secundario. El texto actual da a entender lo
  contrario.

#### Investigación (artículos técnicos de su blog y páginas propias, verificado el 2026-10-14)

- **Bots 4.0 = reconstrucción sobre Maia-2.** Maia-2 genera un «conjunto validado de jugadas
  candidatas» que incluye jugadas muy débiles pero humanamente probables; de ahí eligen. Conservan
  los repertorios y estilos de la versión anterior.
- **Versión 3 (anterior): «Move Curator».** La red proponía varias candidatas, un filtro marcaba las
  sospechosas (por ejemplo, paseos tempranos del rey) y **un motor fuerte calificaba las marcadas**.
  Lo retiraron porque Stockfish en el servidor hacía variable el tiempo por jugada y poco fiable el
  bullet.
- **Estilo:** no hay un parámetro «juega sólido». El estilo sale de los datos del modelo, del
  repertorio y del filtro, y **se mide después** con miles de partidas de cada bot. Cinco familias
  (Guardian → Savage) y más de 30 «comportamientos» (gestión del tiempo, propensión a errores, no
  abandonar nunca, aperturas débiles…). Los errores deben ser «creíbles» (pieza que captura lejos,
  horquillas, descubiertas).
- **Repertorios:** uno por bot a partir de partidas humanas de su nivel; algunos bots «estadísticos»
  copian las frecuencias humanas (si el 15 % juega la Francesa, ellos también).
- **Calibración:** más de un millón de partidas simuladas entre bots y ajuste con resultados de
  usuarios reales. Chats de personalidad redactados con ChatGPT a partir de eventos de la partida.
- **Bots de más de 3.000:** su artículo dice que la escala «pasa de 3.000», pero **no explica cómo**.
  Maia-2 por sí solo no llega ahí; tiene que haber algo encima (búsqueda, un motor que filtra para
  los niveles altos o una escala inflada). No verificable. Referencia pública relacionada: *Allie*,
  un bot de investigación disponible en Lichess que combina un modelo humano con búsqueda adaptativa
  y alcanza nivel de maestro sin dejar de parecer humano.
- **Otros:** «Guided Play» (avisa del momento crítico mientras juegas, con ayuda ajustable), «Mate
  Hunt» (seis mates básicos cronometrados contra un rey que resiste), test de «personalidad» por
  arquetipos de jugadores históricos (descartable por los principios de estilo).

#### Comparación con Onyx

- Onyx ya separa ELO objetivo, muestreo (temperatura y top-p), repertorio y tiempo de reflexión. Los
  ejes de **agresión y complejidad son editoriales**: describen al bot pero **no cambian sus
  jugadas** (`src/utils/humanBots.ts`). Las diferencias reales entre bots salen del Elo de Maia, del
  muestreo y del repertorio.
- Onyx juega con motores locales: el problema de latencia que hizo a Chessiverse quitar Stockfish
  del filtro no existe igual en escritorio, y los bots ya «piensan» de 2,8 a 6 s.

#### Respuesta a la pregunta del autor: ¿un gemelo con el estilo del rival?

Sí, pero en dos pasos y solo con estilos que de verdad cambien las jugadas:

1. Hoy el gemelo puede heredar lo que sí es real: **repertorio, Elo y ritmo** (I-43).
2. Para heredar «sólido» o «agresivo» primero hay que convertir los ejes editoriales en **palancas
   reales y medidas** (I-47). Cuando un bot «agresivo» demuestre en sus partidas más decisivas, más
   enroques opuestos o más sacrificios que uno «sólido» del mismo Elo, el gemelo podrá recibir el
   estilo medido del rival con esos mismos componentes (sección 5).

#### Descartado o no aplicable

- **Mil bots hechos a mano.** Mejor pocos bots curados y un campo de jugadores generados (I-49).
- **Chats con ChatGPT** y **test de personalidad por leyendas**.
- **Varios bots adaptativos:** con uno basta.

---

## 3. Catálogo de ideas

| ID | Idea | Origen | Estado | Esfuerzo | Fase recomendada |
| --- | --- | --- | --- | --- | --- |
| I-01 | Búsqueda de jugadores por tokens normalizados | ChessCorpus | Propuesta | S | Mantenimiento |
| I-02 | Ficha de jugador completa para cualquier jugador | ChessCorpus | **Aceptada** (dirección) | M | 8.4 |
| I-03 | Vinculación FIDE manual con historial Elo | ChessCorpus | En duda | M | 8.4 |
| I-04 | Nuevas bases descargables con procedencia y deduplicación | ChessCorpus | Propuesta | M | 8.6 y 10 |
| I-05 | Modos de sesión táctica (tormenta, racha, contrarreloj, profundidad, candidatas) | ChessCorpus | Propuesta | M | 8.8 |
| I-06 | FSRS para errores tácticos y Elo táctico local | ChessCorpus | Propuesta | M | 8.8 |
| I-07 | Finales: comprobar tras cada jugada si el objetivo sigue siendo alcanzable | ChessCorpus / autor | **Aceptada** (cambio principal de Finales) | M | 8.9 |
| I-08 | Importación de finales: familia y objetivo calculados | ChessCorpus / autor | **Simplificada** (sin libros, sin dificultad) | S | 8.9 |
| I-09 | Filtro de finales por tema | ChessCorpus / autor | **Simplificada** | S | 8.9 |
| I-10 | Fichas de técnica verificadas y campo de explicación con procedencia | ChessCorpus | **Aplazada** | M | Futuro |
| I-11 | Clasificación automática de ejercicios propios (temas y dificultad) | Investigación propia | Propuesta | L | 10 |
| I-12 | Arquitectura de coste cero para un futuro servicio web | ChessCorpus | Aplazada | — | Futuro |
| I-13 | Lista de partidas de cada cuenta con actualizar y abrir | ChessRamp | Propuesta | S | 8.4 |
| I-14 | Análisis más rápido sin perder veredictos | ChessRamp / FlexiChess | **Aceptada** (fase) | M | 8.2 |
| I-15 | Clasificación por probabilidad de victoria, momentos clave y reglas explicables | ChessRamp | Propuesta | M | 8.2 |
| I-16 | Rendimiento estimado calibrado | ChessRamp | Aplazada | L | 10 |
| I-17 | Cola automática de errores con repaso espaciado | ChessRamp | **Aceptada** (se adelanta desde la fase de expansión) | M | 8.7 |
| I-18 | Diagnóstico y prioridades de entrenamiento sin LLM | ChessRamp | Propuesta | M–L | 8.7 |
| I-19 | Repertorio contra realidad | ChessRamp | Propuesta | M | 8.6 |
| I-20 | Constructor de sets desde la base de puzzles por tema y banda | ChessRamp | Propuesta | S–M | 8.8 |
| I-21 | Practicar conversión y defensa desde posiciones propias | ChessRamp + Onyx | Propuesta | M | 8.7 |
| I-22 | Momentos destacados del jugador | King Takes King | Propuesta | S | 8.4 |
| I-23 | Objetivos medidos en partidas reales | King Takes King | Propuesta | M | 10 |
| I-24 | Explicación factual de cada error por plantilla | King Takes King / ChessRamp | Propuesta | S–M | 8.2 |
| I-25 | LumbrasGigaBase OTB y Online por separado en el catálogo | Chess.ceo / autor | **Aceptada** (antes de 8.2) | M | 8.3 |
| I-26 | Informe de calidad al importar o descargar una base | Chess.ceo / autor | Propuesta | S–M | Mantenimiento y 8.3 |
| I-27 | Índice de árbol de aperturas precalculado | Chess.ceo / FlexiChess | En duda (medir) | L | 10 |
| I-28 | Rendimiento frente a lo esperado y tendencia por jugada en el informe de posición | Chess.ceo | Propuesta | S | 8.3 |
| I-29 | Catálogo de fugas con reglas, coste y evolución | FlexiChess | Propuesta | M | 8.7 |
| I-30 | «Rating par»: resultados frente a lo esperado por Elo | FlexiChess | Propuesta | S–M | 8.4 |
| I-31 | Estructuras de peones con nombre | FlexiChess / autor | Propuesta (8 iniciales, validadas con Flores Rios) | M–L | 8.6 y 9.3 |
| I-32 | Veredicto «cómo jugarle» | FlexiChess | Propuesta | M | 8.6 |
| I-33 | Dificultad práctica de una posición para el rival (Maia + Stockfish) | FlexiChess / Onyx | Propuesta (redefinida) | M | 8.5 y 8.6 |
| I-34 | Huecos del repertorio por frecuencia real | FlexiChess | Propuesta | S–M | 8.10 |
| I-35 | Búsqueda de partidas en lenguaje natural | FlexiChess | Aplazada (IA) | M | Futuro (IA) |
| I-36 | Modo «Repaso continuo» por dominio de cada jugada | Listudy | Propuesta | M | 8.10 |
| I-37 | Repeticiones de memoria configurables para dar una línea por aprendida | Autor / Chessable | Propuesta | S | Mantenimiento |
| I-38 | Visualización: tácticas a ciegas y sin piezas | Listudy | Propuesta | M | 8.8 |
| I-39 | Fuentes libres de finales (puzzles de Lichess, tablebase) | Listudy / autor | Aplazada | M | Futuro |
| I-40 | Generador de repertorios desde estadísticas | qchess / ChessBase | **Aceptada** (entre ficha y preparación) | L | 8.5 |
| I-41 | Generador de líneas de preparación contra un rival | qchess + Onyx | Propuesta | M (sobre I-40) | 8.6 |
| I-42 | Jerarquía de aperturas Familia → Variante → Subvariante | ChessStalker / autor | **Aceptada** | S | 8.4 o mantenimiento |
| I-43 | Bot gemelo: libro del jugador + Maia a su Elo | ChessStalker | Propuesta | M (L con modelo propio) | 8.6 y 10 |
| I-44 | Psicología, reloj y tramos de error del jugador | FireChess / ChessStalker | Propuesta | S–M | 8.4 |
| I-45 | Rivales frecuentes y cara a cara | ChessStalker | Propuesta | S | 8.4 |
| I-46 | Ejercicios con flechas y casillas que explican el error | FireChess | Propuesta | S | 8.2 |
| I-47 | Personalidades de bot reales y medidas (mapa de dos ejes) | Chessiverse / autor | Propuesta | M–L | 9.1 |
| I-48 | Bots fuertes: candidatas de Maia verificadas con Stockfish | Chessiverse v3 | Propuesta | M | 9.1 |
| I-49 | Catálogo de 80–100 bots curados, jugadores generados y explorador de bots | Chessiverse / autor | **Aceptada** (cifra y escalones) | M | 9.1 |
| I-50 | Rating local del usuario contra bots y escala de bots calibrada | Chessiverse | Propuesta | M | 9.1 |
| I-51 | Torneos con el usuario: formatos, plantillas y calendario | Chessiverse / autor | Propuesta | L | 9.2 |
| I-52 | Partida guiada y mates básicos cronometrados | Chessiverse | Propuesta | S–M | 8.9 y 9.1 |
| I-53 | Planificador global de motores | Rendimiento | Propuesta | M | 8.2 |
| I-54 | Presupuesto de rendimiento con benchmarks | Rendimiento | Propuesta | S–M | 8.2 y 10 |

### I-01. Búsqueda de jugadores por tokens normalizados

- **Problema:** `players::name.like("%{name}%")` exige el orden exacto y los acentos exactos. Los PGN
  guardan «Apellido Apellido, Nombre», así que «David Cabezas» nunca coincide. Además se listan
  jugadores con 0 partidas.
- **Solución:** dividir la búsqueda en tokens y exigir que todos aparezcan (`AND` de `LIKE` por
  token), comparando contra una clave normalizada sin diacríticos ni puntuación. Ordenar por
  número de partidas y ocultar los de 0 partidas por defecto.
- **Implementación en Onyx:** la versión mínima (tokens con `AND`) no cambia el esquema. Para los
  acentos hace falta una columna `NameKey` normalizada, creada al indexar y rellenada una vez en
  bases existentes (migración perezosa e idempotente). Benchmark en Gigabase antes y después.
- **Bonus:** la misma normalización sirve para los alias manuales de Player Analysis y para sugerir
  candidatos al vincular FIDE (I-03).

### I-02. Ficha de jugador completa para cualquier jugador

- **Problema:** el autor no encuentra una forma fácil de llegar a las partidas de un jugador buscado
  en una base. Player Analysis está pensado alrededor de «Usuario».
- **Referencia:** la ficha de ChessCorpus: búsqueda → partidas filtrables, rivales, torneos,
  historial Elo, árbol de repertorio por color, descarga PGN y visor.
- **Implementación en Onyx:** una ficha única que sirva igual para el propio usuario, un rival o un
  alumno, reutilizando los paneles existentes. Ver la propuesta de estructura en la sección 6.

### I-03. Vinculación FIDE manual con historial Elo

- **Referencia:** ChessCorpus solo enlaza la ficha FIDE si la correspondencia es inequívoca.
- **Implementación en Onyx:** sugerir candidatos (nombre normalizado, federación, Elo cercano) y que
  el usuario confirme. Guardar el FIDE ID en la ficha local.
- **En duda:** el historial Elo mensual requiere las listas FIDE descargables (oficiales y gratuitas
  desde ratings.fide.com) o un espejo de terceros. Hay que decidir si vale la pena descargar e
  indexar listas o si basta con la consulta puntual que ya existe.

### I-04. Nuevas bases descargables con procedencia y deduplicación

- **Fuentes candidatas:** Lichess Broadcast (mensual, CC BY-SA), Ajedrez Data AJ-OTB (dominio
  público según el proveedor), Lichess Titled Arena (CC0). Verificar las condiciones de cada una
  antes de añadirlas al catálogo de descargas.
- **Valor:** las retransmisiones de Lichess cubren torneos OTB recientes de la región, que es lo que
  necesita la preparación de rivales del equipo del TEC.
- **Implementación en Onyx:** descarga y actualización incremental mensual; etiqueta de procedencia
  por partida; deduplicación por huella de contenido (jugadas + jugadores + fecha) al fusionar
  fuentes.
- **Valor de portafolio:** es un pipeline de datos real (ingesta, normalización, deduplicación,
  procedencia, versiones de publicación), muy alineado con la Fase 10 (MLOps).

### I-05. Modos de sesión táctica

Capas de sesión sobre la base de puzzles Lichess que Onyx ya tiene y, cuando tenga sentido, sobre
los sets PGN propios:

- **Tormenta:** tiempo global (configurable) y máximo de problemas; dificultad creciente.
- **Racha:** problemas encadenados con vidas configurables; dificultad creciente.
- **Contrarreloj:** mismo límite por problema (Onyx ya tiene timer por ejercicio).
- **Profundidad:** filtrar por longitud de la solución, deducida de `moves` o de los temas
  `mateInN`, `short`, `long`, `veryLong`.
- **Jugadas candidatas:** Stockfish local con MultiPV propone 3–4 jugadas (la buena y señuelos
  plausibles) y el usuario elige. Útil para principiantes y para entrenar la elección antes que el
  cálculo. Los señuelos deberían ser jugadas que un humano jugaría: aquí Maia es mejor generador
  que Stockfish y es una ventaja propia de Onyx.

### I-06. FSRS para errores tácticos y Elo táctico local

- Reutilizar el FSRS de Aperturas para que los puzzles fallados vuelvan en repaso.
- Elo táctico local (Glicko-2) contra el rating de cada puzzle, guardado en los datos privados.
- Comprobar antes qué conserva ya el entrenador de puzzles heredado de En Croissant.

### I-07. Finales: veredicto y error por jugada

**El cambio principal de Finales (decidido 2026-10-14).**

- **Problema:** Onyx juzga el final al terminar la partida.
- **Principio:** un final **no es un ejercicio táctico**. El estudiante no tiene que encontrar la
  mejor jugada, sino **cumplir el objetivo**. Tras cada jugada solo se comprueba si el objetivo
  **sigue siendo alcanzable contra la defensa perfecta del rival**. Si era mate en 10 y tras una
  jugada imprecisa es mate en 25 o +7, sigue ganado: no hay error.
- **Cómo se comprueba:**
  - ≤ 7 piezas: resultado de la tablebase (ganado/tablas/perdido); es exacto. Onyx ya la consulta.
  - Más de 7 piezas: Stockfish, con un umbral declarado para decidir si el objetivo sigue siendo
    alcanzable (por ejemplo, para ganar, que la evaluación siga por encima de cierto valor) y
    lenguaje prudente («probablemente ya no se puede ganar»).
  - La regla de los 50 movimientos cuenta: un final «ganado» que ya no se puede ganar a tiempo deja
    de estarlo (la tablebase lo tiene en cuenta).
- **Al detectar que el objetivo ya no es alcanzable:** avisar en el momento y ofrecer **reintentar
  desde antes de la jugada** o seguir jugando. Botón **Veredicto** para consultar el resultado
  teórico de la posición actual.
- **Rival (decidido):** la mejor defensa (tablebase/Stockfish) por defecto; Maia como opción
  «práctica».

### I-08. Importación de finales propios: familia y objetivo

**Simplificada (decisión del autor, 2026-10-14).** Onyx no incluirá libros de finales: los PGN de
cada libro organizan sus posiciones de forma distinta y no permiten normalizar filtros desde el
nombre. Los libros llegan por importación del usuario, y el usuario puede exportar el final que
quiera.

Al importar, Onyx calcula desde la posición, no desde el nombre:

- la **familia de material** (Onyx ya lo hace en 7.3.4);
- el **objetivo** verificado (tablebase con ≤ 7 piezas, motor por encima), con aviso si contradice el
  del PGN.

**No se estima dificultad**: la longitud de la línea óptima no mide bien lo difícil que es un final
para una persona. Los comentarios del PGN se conservan tal cual.

### I-09. Filtro de finales por tema

Simplificado: el único filtro es el **tema** (familia de material), aplicable al contenido incluido
y a lo importado. Sin filtros de dificultad ni de obra.

### I-10. Fichas de técnica verificadas y campo de explicación con procedencia

**Aplazada (decisión del autor, 2026-10-14).** La idea se conserva para el futuro:

- fichas por familia de final (objetivo, pasos, consejo), escritas o revisadas por el autor;
- una ficha solo se muestra si es coherente con el veredicto real (el error de ChessCorpus);
- `explanation` como dato con procedencia (`source`, `model`, `reviewed`, `checkedAgainst`), para que
  más adelante un LLM pueda llenarlo sin cambiar la interfaz.

### I-11. Clasificación automática de ejercicios propios

Ver sección 4.

### I-12. Arquitectura de coste cero para un servicio web

Si algún día existe un complemento web (compartir paquetes de preparación con el equipo, por
ejemplo), el patrón de ChessCorpus es el de referencia: índices precalculados en R2 dentro de la
capa gratuita, Worker delgado y motor en el cliente. No hay nada que hacer ahora.

### I-13. Lista de partidas de cada cuenta

- Pestaña **Partidas** de la ficha (sección 6): todas las partidas de la cuenta conectada en una
  lista paginada (fecha, rival, ritmo, resultado, apertura, si ya está analizada), con
  **Actualizar** que reutiliza la sincronización incremental de 7.3.3 y doble clic para abrir y
  analizar.
- Filtros mínimos: ritmo, color, resultado, «sin analizar». Selección múltiple para analizar en
  lote o enviar a un estudio.

### I-14. Análisis más rápido sin perder veredictos

Ordenado por relación beneficio/riesgo:

1. **Caché persistente de evaluaciones por posición** (FEN normalizado + motor + presupuesto). En
   Player Analysis las aperturas se repiten en decenas de partidas; cada posición repetida pasa a
   costar cero. Con versión, tamaño acotado, borrado y procedencia.
2. **Profundidad objetivo con tope de tiempo** (`go depth N movetime M`) en lugar de solo tiempo
   fijo: las posiciones fáciles terminan antes y las difíciles no superan el tope.
3. **Segunda pasada dirigida:** pasada rápida en toda la partida y reanálisis profundo solo de las
   jugadas cuya pérdida supera un umbral, de la mejor alternativa y de los candidatos a jugada
   brillante. El veredicto final de esas jugadas sale de la pasada profunda.
4. **Varios procesos en lotes:** en Player Analysis, N partidas en paralelo con pocos hilos cada
   una, según los núcleos disponibles (FlexiChess usa 6 motores a la vez). Limitar la memoria total
   de hash para no repetir sus 1,3 GB.
4b. **Perfiles de análisis con calidad declarada** (rápido / estándar / profundo), como FlexiChess,
   pero sin bajar el predeterminado por debajo de la calidad actual: el perfil rápido sirve para
   detectar errores graves en muchas partidas y se etiqueta como tal en el resultado.
5. **Evaluaciones de la nube de Lichess** para posiciones de apertura, opcional y con el
   coordinador remoto existente (una petición simultánea, `429`, caché). Menos prioritario que la
   caché local, que no depende de la red.

Validación obligatoria antes de cambiar valores por defecto: medir con un conjunto fijo de partidas
el tiempo y el **acuerdo de clasificación** (error grave/error/imprecisión) frente al método actual.
Si el acuerdo en errores y errores graves no se mantiene, no se cambia el predeterminado. Es un
benchmark reproducible, en la línea de las fases 1–3.

### I-15. Clasificación por probabilidad de victoria, momentos clave y reglas explicables

- Unificar Player Analysis y el reporte de partidas sobre la **pérdida de probabilidad de victoria**
  (fórmula de Lichess), que no castiga igual un error en +8 que en 0,00. Mantener ACPL como dato.
- Añadir «oportunidad perdida» (había una jugada ganadora y no se jugó) y **momentos clave** (las
  2–3 jugadas que decidieron la partida) para saltar directamente a ellas.
- Si se añade «brillante», que sea con reglas explícitas y el motivo de rechazo visible, como hace
  ChessRamp. Requiere migración de perfiles guardados (versión de esquema).

### I-16. Rendimiento estimado calibrado

En vez de una fórmula heurística, un estudio reproducible: partidas de Lichess con rating conocido,
métricas de precisión y de Maia (probabilidad de las jugadas según el nivel) como variables, y error
de predicción publicado. Si no supera un umbral útil, no se muestra. Candidato al caso de estudio de
la Fase 10 junto con I-11.

### I-17. Cola automática de errores con repaso espaciado

- Opción (activada por el usuario) para que cada error grave o error de las partidas analizadas
  entre en una cola **Mis errores**, con deduplicación por posición, FSRS y sesiones cortas.
- Reutiliza la procedencia de 7.2 (base, partida, ply, modo «mejorar mi decisión» / «castigar mi
  error») y la aceptación por probabilidad de «Aprende de tus errores».
- La interfaz muestra pendientes de hoy, por fase y por motivo verificable, y desde cada ejercicio
  se vuelve a la partida original.
- Es el «set táctico automático» que el roadmap dejaba para la fase de expansión; se adelanta (aceptado).

### I-18. Diagnóstico y prioridades de entrenamiento sin LLM

- Una tarjeta en Análisis que ordena los problemas del jugador con evidencia: fase con peor
  precisión, ritmo, errores con poco reloj, motivo verificable más frecuente, conversión y defensa,
  aperturas con peor resultado.
- Cada problema enlaza a una acción concreta: cola de errores filtrada, set del tema, línea del
  repertorio, práctica de conversión.
- Todo con muestra y cobertura visibles. La redacción es por plantillas; un LLM podría reescribirla
  más adelante sin cambiar los datos (sección 5).

### I-19. Repertorio contra realidad

Cruce entre las partidas de un jugador y su repertorio de Onyx (aprovecha la búsqueda de 8.1):

- primera salida del repertorio en cada partida, separando **desviación propia** (olvido) de
  **desviación del rival** (hueco de preparación);
- líneas estudiadas que casi nunca aparecen y líneas no preparadas que aparecen a menudo y con mal
  resultado;
- acción directa: añadir la línea al repertorio o entrenarla.

Para un rival funciona igual contra su repertorio inferido (8.2). Ninguna web revisada puede hacer
esto porque no tiene el repertorio del usuario.

### I-20. Constructor de sets desde la base de puzzles

- Elegir temas, banda de rating y tamaño, y generar un set embebido de Táctica con todos los modos
  existentes (guiado, Woodpecker, timer, estadísticas).
- Estantería de sets activos con resueltos, precisión reciente y tiempo medio, como la de ChessRamp.
- Plantillas listas: los 16 temas «posicionales» de ChessRamp × bandas de rating.

### I-21. Practicar conversión y defensa desde posiciones propias

Player Analysis ya detecta partidas con +1,5 no ganadas y partidas inferiores. Ofrecer jugar esas
posiciones contra un bot humano al nivel del rival (Maia) hasta convertirlas o salvarlas. Es el tipo
de práctica que ChessRamp recomienda y que solo Onyx puede hacer con bots que juegan como humanos.

### I-22. Momentos destacados del jugador

En el Resumen de la ficha: jugada más cara, mayor remontada, victoria contra el rival más fuerte,
rival con peor marcador, racha. Cálculo barato con datos existentes y siempre enlazado a la partida.

### I-23. Objetivos medidos en partidas reales

Un objetivo (por ejemplo, «menos piezas colgadas») se mide en las partidas jugadas antes y después,
con muestra y cobertura. Se presenta como observación, nunca como efecto causal del entrenamiento.

### I-24. Explicación factual de cada error por plantilla

Frases generadas a partir de hechos del motor y del catálogo verificable, sin IA: «permite mate en
1: 4.Qxf7#», «deja el caballo de f3 sin defensa», «no responde a la amenaza …» (con la detección de
amenazas que ya existe), «la mejor era … y mantenía +1,2». Es la base sobre la que un LLM podría
redactar mejor en el futuro.

### I-25. LumbrasGigaBase OTB y Online por separado en el catálogo

- Dos entradas en el catálogo propio de Onyx (aceptado: un JSON en el repositorio de Onyx), no una
  fusionada (motivos en 2.4). Retirar o marcar como antigua la Gigabase de 9 M heredada.
- **Hallazgo que cambia la recomendación:** las descargas de Lumbras pasan por un gestor de
  WordPress (`wpdmdl=<id>` más un token `refresh` que caduca). No hay un enlace directo estable, y
  que cada usuario de Onyx descargue 2,3 GB de su servidor personal le cargaría el ancho de banda.
  Por eso la opción realista es la 2: **el autor convierte y aloja la base**, con permiso del autor
  de Lumbras.

**Proceso de actualización para el autor de Onyx** (cuando salga una versión nueva; mensual o cada
pocos meses, no es obligatorio seguir cada publicación):

1. Descargar «OTB Complete» (2,3 GB en 7z) y «Online Complete» (1,3 GB en 7z) desde la web de Lumbras.
2. Convertirlas con el importador de Onyx (conviene un comando o script que lo haga sin interfaz).
   **Duración desconocida: hay que medirla** con 12 M de partidas; previsiblemente de decenas de
   minutos a pocas horas en el i5 de referencia, en segundo plano.
3. Comprimir y subir el resultado al alojamiento (unos 5 GB entre las dos). El tiempo depende de la
   velocidad de subida (por ejemplo, ~30–40 min a 20 Mbit/s).
4. Actualizar el JSON del catálogo: versión, fecha, número de partidas, tamaño y hash. Commit.

Todo se puede encadenar en un único script; el trabajo manual real es lanzarlo y revisar el
resultado. No hace falta tener nada más instalado que Onyx (o el script), 7-Zip y la herramienta
de subida del alojamiento.

**Qué se sube:** la base ya convertida (`.db3`), comprimida en `.zip` porque el descargador de
Onyx ya sabe extraer zip (`src-tauri/src/fs.rs`). Subir el PGN obligaría a cada usuario a convertir
12 M de partidas en su equipo. Tamaños estimados a partir de medidas reales (10,3 M de partidas =
3,0 GB de SQLite + 1,8 GB de índice; la Gigabase de 9,6 M de En Croissant = 2,8 GB): **OTB ≈ 3,5 GB
y Online ≈ 1,8 GB sin comprimir**, más el índice si se incluye. El tamaño comprimido hay que medirlo.
El índice puede construirlo Onyx en local si tarda poco; si no, se sube también.

**Dónde alojar** (comparación del 2026-10-14):

| | Cloudflare R2 | Hugging Face Datasets |
| --- | --- | --- |
| Gratis | 10 GB de almacenamiento, 1 M de escrituras y 10 M de lecturas al mes. | Almacenamiento público «best-effort» (sin cifra garantizada; se pide uso responsable más allá de unos GB). |
| Descargas | Sin coste de salida. | Gratis, servidas por CDN. |
| Alta | Cuenta de Cloudflare; activar R2 suele pedir un método de pago (verificar). | Cuenta gratuita, sin tarjeta. |
| URL pública | `r2.dev` (limitada, pensada para desarrollo) o dominio propio en Cloudflare. | Fija: `huggingface.co/datasets/<usuario>/<repo>/resolve/main/<archivo>`. |
| Subida | `rclone`, `wrangler` o API S3 (multiparte). | `hf upload` (biblioteca `huggingface_hub`), reanudable. |
| Versiones | Manuales (nombres de archivo). | Historial de commits; las versiones viejas ocupan espacio hasta que se borran o se compacta el historial. |
| Requisitos | Ninguno sobre el contenido. | Ficha del conjunto de datos (licencia, atribución, procedencia) y que sea útil para otros; prefieren formatos como Parquet. |
| Riesgo | Pasar de 10 GB (dos versiones a la vez no caben sin comprimir). | «Best-effort»: sin garantía formal; un `.db3` solo útil para Onyx encaja peor con su política. |
| Portafolio | Neutro. | Suma: conjunto de datos público con ficha, encaja con la Fase 10. |

**Recomendación:** **Hugging Face Datasets**, por no pedir tarjeta ni dominio, URLs fijas, subida
sencilla y valor de portafolio. Mitigación del riesgo: el catálogo de Onyx solo guarda URLs, así que
cambiar de alojamiento es editar el JSON. A futuro, publicar también una versión en Parquet haría el
conjunto útil fuera de Onyx y alinearía mejor con su política. **Decisión pendiente del autor.**

Opcional: las retransmisiones de Lichess (CC BY-SA) que Lumbras ofrece aparte (16 MB), útiles para
rivales OTB recientes (enlaza con I-04).

### I-26. Informe de calidad de una base

Al descargar o importar, un informe que **marca sin borrar**: partidas cortadas (pocas jugadas con
resultado decisivo y sin abandono plausible), duplicados exactos y probables, fechas ausentes o
imposibles, nombres sospechosos, Elo incoherente, variantes no estándar. Cuantifica el problema y
deja decidir. Convierte la sensación de «base sucia» en un dato.

### I-27. Índice de árbol de aperturas precalculado

- La respuesta instantánea de Chess.ceo y FlexiChess sale de índices de posiciones precalculados
  en servidor. Onyx escanea la base (≈26 s por FEN nuevo en 10 M de partidas).
- En 7.0 se estimó un índice completo de ~12 GB y se aplazó. La alternativa a medir: **solo las
  primeras N medias jugadas** (por ejemplo 30) y posiciones con al menos 2 partidas, con
  estadísticas agregadas por jugada (partidas, W/D/L, Elo medio, rendimiento, años). Debería ser
  mucho más pequeño; hay que medirlo antes de decidir.
- Se construiría una vez por base (o se descargaría hecho con la base, si algún día se aloja).

### I-28. Rendimiento frente a lo esperado y tendencia por jugada

En el informe de posición, como Chess.ceo y ChessBase: **rendimiento respecto a lo esperado por Elo**
para cada jugada (descuenta que una jugada la jueguen sobre todo jugadores más fuertes) y una marca
de **tendencia reciente** cuando la muestra lo permite (el informe v4 ya guarda jugada × año).

### I-29. Catálogo de fugas con reglas, coste y evolución

- Ampliar el catálogo verificable de 7.3.4 con las categorías de FlexiChess (sección 2.5), con
  umbrales escritos en la documentación, prioridad de la más específica a la genérica y «sin
  clasificar» como cajón honesto.
- Ordenar por **coste total** y por partidas que pasaron de ganadas o igualadas a perdidas.
- **Gráfica de evolución por categoría** a lo largo del tiempo (enlaza con I-23).
- Comparación de referencia solo con partidas del **mismo ritmo y banda de Elo, analizadas con el
  mismo perfil de motor**; si no hay referencia comparable, no se muestra.
- Medidas que usan probabilidad de victoria en lugar de peones cuando corresponda (I-15).

### I-30. «Rating par»

Toda tabla de resultados (aperturas, estructuras, finales, tendencias) muestra la **puntuación real
frente a la esperada por la diferencia de Elo**, con muestra. Es lo que convierte «38 % con esta
línea» en algo interpretable.

### I-31. Estructuras de peones con nombre

**Para qué se usan** (y por qué importa decidirlo antes de definirlas):

1. **Perfil y preparación:** en qué estructuras juega un jugador y cómo puntúa frente a lo esperado
   (I-30). Es el uso que pide 8.2.
2. **Búsqueda:** filtro «partidas con IQP blanco», ampliando la búsqueda exacta por estructura que
   Onyx ya tiene.
3. **Informe de posición y generador (I-40):** a qué estructuras lleva una línea.
4. **Entrenamiento futuro:** partidas modelo y ejercicios por estructura (Fase 9.3).

**Conjunto inicial propuesto** (los más frecuentes, cada uno con su versión para blancas y negras
cuando aplique), tal como los describe el autor:

| Estructura | Regla aproximada (a precisar con ejemplos) |
| --- | --- |
| IQP (peón aislado de dama) | Peón d aislado sin peones c ni e propios; columna c o e semiabierta. |
| Carlsbad | Blancas d4/e3 sin c; negras c6/d5 sin e (o la simétrica); típica del Gambito de Dama y de la Caro-Kann. |
| Peones colgantes | Peones c y d propios en la cuarta fila, sin peones b ni e de apoyo. |
| Caro-Kann / Eslava | Negras con peones en la séptima salvo c6 y e6, sin peón d; la Caro-Kann cuando a las blancas les falta el peón e, la Eslava cuando les falta el c. |
| Francesa | Cadena e6/d5 contra d4/e5 (y variantes con el centro cambiado). |
| Maróczy | Peones blancos c4/e4 sin peón d, contra la estructura siciliana. |
| Erizo | Peones negros a6/b6/d6/e6 frente a c4/e4. |
| India de rey | Cadena d5/e4 contra d6/e5 (y centro cerrado). |

**Dónde poner el límite:** empezar con estas ocho y no añadir más hasta que pasen la validación.

**Validación con el libro de Mauricio Flores Rios** (material privado del autor, no se distribuye):
usar sus capítulos como lista de estructuras candidatas y **sus partidas como ejemplos etiquetados**.
Cada regla se prueba contra esos ejemplos (¿reconoce las partidas del capítulo correcto?, ¿marca
partidas de otros capítulos por error?) y contra una muestra de la base. Una estructura entra solo
si acierta con claridad; el resultado se documenta como en las fases 1–3.

**Detalles técnicos:** se evalúa después de la apertura (por ejemplo, entre las jugadas 12 y 25) y la
estructura debe mantenerse varias jugadas para contar; se calcula en Rust al indexar o al construir
el perfil, nunca por cada celda de una tabla.

**Ubicación recomendada:** las ocho validadas en **8.6 Preparación** (donde se usan); ampliaciones y
entrenamiento por estructura en **9.3**.

### I-32. Veredicto «cómo jugarle»

En la pestaña Preparación: con blancas y con negras, las líneas donde el rival puntúa por debajo de
su par (I-30) y las fases donde rinde mejor o peor, con muestra mínima. Si nada está por debajo del
par, decirlo («juega tu repertorio»). Redacción por plantilla.

### I-33. Dificultad práctica de una posición para el rival

**Aclaración:** la versión de FlexiChess (robusta/aguda según cuántas jugadas mantienen la
evaluación) es demasiado binaria. Propuesta para Onyx, como **escala continua**:

- **Probabilidad de que un jugador del Elo del rival mantenga la evaluación**: Stockfish marca qué
  jugadas mantienen la evaluación (dentro de un margen) y Maia, al Elo del rival, da la probabilidad
  de jugar cada una. Su suma es la probabilidad de no equivocarse. Ejemplo: 95 % = posición fácil
  para él; 30 % = posición donde probablemente falle.
- Se muestra como número y como escala (fácil / exigente / trampa), junto al número de jugadas que
  mantienen la evaluación.

**Dónde se usa:**

1. **8.6 Preparación:** en las posiciones clave del repertorio probable del rival (las posiciones a
   las que llegan sus líneas más jugadas), ordenar por dificultad para él; ahí es donde conviene
   llevar la partida.
2. **8.5 Generador de repertorios (I-40/I-41):** un enfoque más, «líneas difíciles para el rival»,
   elige jugadas propias que dejan al rival en posiciones de baja probabilidad de acierto sin perder
   evaluación propia.
3. **Repertorio propio:** detectar posiciones de mi repertorio donde **yo** tengo baja probabilidad de
   acierto (al Elo del usuario) para priorizar su entrenamiento.

Usa Maia y Stockfish ya integrados; el coste es de pocas posiciones y pasa por el planificador de
motores (I-53).

### I-34. Huecos del repertorio por frecuencia real

En Aperturas, en cada posición del repertorio: las respuestas del rival que no están cubiertas,
ordenadas por frecuencia en la base de referencia (o en Lichess), con acción para añadirlas.

### I-35. Búsqueda en lenguaje natural

Escribir «finales de torres con IQP que ganan las blancas, 2400+» y obtener filtros, mostrando qué se
entendió. Requiere un LLM o un analizador propio; se aplaza con el resto de la IA, pero conviene que
los filtros de búsqueda sean combinables y nombrados para que encaje después.

### I-36. Modo «Repaso continuo»

- Un modo adicional de práctica en Aperturas: sesión sin pausas ni calificación, sin final fijo,
  donde el rival elige la rama **más débil** según el dominio de cada jugada (Onyx ya registra
  aciertos y fallos por jugada desde la Etapa 3 de Fase 6).
- Las líneas falladas vuelven pronto; las dominadas casi no aparecen. Pistas solo con dominio bajo.
- **No sustituye al FSRS:** el repaso espaciado por línea sigue siendo el método principal y decide
  qué toca hoy. El repaso continuo sirve para «machacar» un repertorio antes de un torneo. **Decidido (2026-10-14): queda aparte;** sus
  resultados no alteran las tarjetas FSRS.

### I-37. Repeticiones de memoria para aprender

En el modo Aprender, número configurable de repeticiones sin ayuda necesarias para dar una línea por
aprendida, con **2 por defecto** como propone el autor. Hoy es 1. Un fallo en la repetición reinicia
la cuenta de esa línea.

### I-38. Visualización: tácticas a ciegas y sin piezas

- **A ciegas:** para ejercicios que conocen su partida (los de Player Analysis, sets PGN que parten
  de una partida y, si se recupera la partida, puzzles de Lichess), mostrar la posición N medias
  jugadas antes, listar las jugadas ocultas y validar sobre la posición real. N configurable.
- **Sin piezas:** tablero vacío y lista de piezas por casilla; filtrar por número de piezas para
  graduar la dificultad.
- Ambos como opciones de sesión de cualquier set táctico, con sus propias estadísticas.

### I-39. Fuentes libres de finales para incluir en el futuro

**Aplazada** hasta encontrar material utilizable (decisión del autor). Fuentes revisadas y su
estado:

- **Libros de dominio público** (Kling y Horwitz 1851, Capablanca 1921, estudios clásicos): libres,
  pero exigen transcribir y clasificar a mano; mismo problema de normalización. No se adopta ahora.
- **Puzzles de Lichess con temas de final** (`rookEndgame`, `pawnEndgame`…, CC0): ya disponibles.
  Los que tienen ≤ 7 piezas al terminar la solución se pueden **jugar hasta el final contra la
  tablebase** con objetivo verificado. Son finales prácticos de partidas reales, no posiciones
  teóricas, pero son la fuente libre más inmediata. Encaja en I-20.
- **Posiciones generadas desde la tablebase**: para una familia (por ejemplo, rey y torre contra
  rey, o torre y peón contra torre) se pueden generar posiciones legales con resultado conocido y
  elegir la dificultad por la longitud de la línea óptima. No tienen derechos de nadie y se
  clasifican solas. Sirven para **practicar técnica** (mates básicos, I-52; Lucena/Philidor con
  restricciones de colocación), no para enseñar ideas como un libro. Generación offline por el
  autor o en local con tablas de 3–5 piezas.

### I-40. Generador de repertorios desde estadísticas

Acción del tablero («Generar repertorio desde aquí») que crea un repertorio nuevo y editable:

- **Fuente de estadísticas:** base local (con filtros de ritmo, Elo y periodo) o Lichess (Masters o
  por banda de Elo).
- **Mis jugadas, enfoques medibles:**
  - *Mejor resultado práctico:* mayor rendimiento frente a lo esperado por Elo, ordenado de forma
    prudente según la muestra (no porcentaje bruto);
  - *Mejor puntuación* y *menos derrotas* (equivalente a «drawrate» para torneos donde no se puede
    perder);
  - *Menos teoría:* minimiza las respuestas del rival que hay que cubrir;
  - *Más fiel al motor:* la mejor del motor entre las jugadas jugadas al menos N veces.
- **Respuestas del rival:** las N más jugadas con mínimo de partidas, o **las que Maia predice para
  un Elo dado** (qué jugará realmente un rival de 1600), o una mezcla.
- **Filtros:** profundidad, mínimo de partidas propio y del rival, jugadas a evitar durante N
  jugadas, pérdida máxima frente a la mejor jugada del motor (motor local o nube de Lichess en vez
  de chessdb.cn).
- **Anotaciones automáticas:** glifos por pérdida de evaluación, símbolo de valoración al final de
  cada línea, comentario de transposición, estadística de la jugada en un comentario y **enlace a
  la mejor partida modelo** de cada línea con el esquema `onyx://game` ya existente.
- **Salida:** repertorio con procedencia (fuente, filtros, fecha, parámetros) listo para revisar,
  editar y pasar al modo Aprender. Regenerar una rama sin tocar las ediciones manuales del resto.

### I-41. Líneas de preparación contra un rival

El mismo generador, pero con las **respuestas del rival tomadas de sus propias partidas** (ficha de
jugador, 8.2) y mis jugadas elegidas para llevarlo a las líneas donde puntúa por debajo de su par
(I-32) o a posiciones agudas (I-33). Es la forma concreta de «líneas específicas de preparación» del
roadmap. qchess tiene una idea vecina («Lichess Clasher»: simula las posiciones probables entre dos
jugadores).

### I-42. Jerarquía de aperturas

- Partir el nombre estándar «Familia: Variante, Subvariante» en tres niveles plegables, con
  partidas, resultados y rating par (I-30) agregados en cada nivel.
- Vista general por defecto (familias) y despliegue hasta el detalle; las subvariantes con pocas
  partidas se muestran pero no se interpretan.
- Aplicable al perfil, a la preparación, a I-19 y a cualquier tabla de aperturas. Normalizar
  «Defense/Defence» y nombres equivalentes.

### I-43. Bot gemelo

- **Versión 1 (como ChessStalker):** un bot humano cuyo libro es el árbol de aperturas del jugador
  (jugadas elegidas con su frecuencia real, filtrable por ritmo y periodo) y que, fuera del libro,
  juega con Maia 3 al Elo del jugador para ese ritmo. Disponible desde la ficha del rival.
- **Medición de fidelidad** (lo que ninguna página muestra): con partidas del jugador que no se
  usaron para el libro, porcentaje de jugadas que el gemelo predice dentro y fuera del libro,
  comparado con Maia genérica al mismo Elo. Si no mejora, se dice.
- **Versión 2 (Fase 10, MLOps):** ajustar Maia a un jugador concreto con sus partidas. Existe
  investigación académica sobre modelos personalizados de comportamiento humano en ajedrez a partir
  de Maia, que necesita muchas partidas del jugador. Sería un caso de estudio fuerte: pregunta
  medible, conjunto de entrenamiento y prueba separado y comparación con la versión 1.
- Lenguaje honesto: «juega el repertorio de X y, fuera de él, como un jugador de su Elo».

### I-44. Psicología, reloj y tramos de error

Con definiciones, muestra y cobertura visibles:

- resultado tras una derrota frente a su resultado medio; rachas;
- derrotas por tiempo y por abandono; abandonos con evaluación no perdida (requiere motor);
- errores con poco reloj frente a mucho reloj y jugadas muy rápidas que cuestan mucho (requiere
  `%clk`, ya con niveles de cobertura de 7.3.3);
- distribución de errores graves por tramos de jugadas, con una conclusión breve por plantilla.

Todo se presenta como descripción, no como diagnóstico psicológico.

### I-45. Rivales frecuentes y cara a cara

Rivales más repetidos con marcador, «némesis» (peor marcador con muestra mínima) y «presa»; desde la
ficha de un rival, el historial directo contra el usuario. Enlazado a las partidas.

### I-46. Ejercicios con flechas y casillas

Todo ejercicio generado desde un error (I-17, I-24, Player Analysis) se muestra con anotaciones
visuales automáticas: la amenaza no vista, la pieza que queda colgada, la mejor jugada tras
resolverlo. Onyx ya dibuja flechas y casillas del PGN; basta generarlas.

### I-47. Personalidades de bot: estilos reales y medidos

**Cómo lo hace Chessiverse (sección 2.10 y su captura de los dos mapas):**

- **Estilo de juego**: dos ejes, *agresivo ↔ defensivo* y *simplificar ↔ complicar*, que forman cinco
  personalidades: **Hunter** (agresivo y simplificador), **Savage** (agresivo y complicador),
  **Guardian** (defensivo y simplificador), **Observer** (defensivo y complicador) y **Mediator**
  (centro).
- **Estilo de apertura**: dos ejes, *aguda ↔ sólida* y *poco preparado ↔ teórico*: **Gambler**,
  **Duelist**, **Pragmatist** y **Classic**.
- **De dónde sale el estilo:** no hay un parámetro «juega agresivo». Sale de (1) la red neuronal o
  los datos con que se entrenó cada bot, (2) su repertorio y (3) el filtro de candidatas. Después se
  **mide** con miles de partidas de cada bot y se coloca en el mapa. Es decir: construyen y luego
  clasifican por lo que el bot hace de verdad.

**Dónde está Onyx:** los cuatro ejes ya existen con el mismo significado (agresión, complejidad,
agudeza de apertura y apoyo en teoría), pero solo los de **apertura** tienen efecto real, porque el
repertorio de cada bot los produce. Los de **juego** son etiquetas: no cambian ninguna jugada.

**Cómo hacerlos reales en Onyx** (Onyx usa un solo modelo, Maia 3, así que no puede repetir lo de
entrenar redes distintas): el bot pide a Maia sus jugadas candidatas y **reordena** sus
probabilidades según el estilo, solo entre candidatas humanas y dentro de un margen de pérdida
según Stockfish:

| Eje | Rasgos de la jugada que se favorecen (y lo contrario en el otro extremo) |
| --- | --- |
| Agresivo ↔ defensivo | Jaques, capturas, avances hacia el rey rival, ataques a piezas cerca del rey, sacrificios verificados ↔ jugadas que defienden, refuerzan el propio rey o retiran piezas amenazadas. |
| Simplificar ↔ complicar | Cambios de piezas, liberar la tensión, posiciones con menos jugadas razonables ↔ mantener la tensión, evitar cambios, posiciones donde el rival tiene pocas jugadas buenas (I-33). |

**Cómo se mide** (lo que convierte la etiqueta `editorial` en `measured`): partidas del bot contra un
bot neutro del mismo Elo y comparación de partidas decisivas, enroques opuestos, cambios por partida,
material medio sobre el tablero, jaques y capturas por partida, duración de la partida y dificultad
media que deja al rival. Si dos estilos no se distinguen en esas medidas, no se anuncian como
distintos.

**Orden de trabajo:** primero los rasgos de la jugada y su medición (pocos bots de prueba), luego el
ajuste de pesos hasta que las cinco personalidades se separen, después la recalibración del Elo
(el estilo cambia la fuerza) y por último el catálogo completo (I-49).

### I-48. Bots fuertes: candidatas de Maia verificadas con Stockfish

- Para los niveles altos: muestrear entre las candidatas humanas de Maia, pero **descartar las que
  pierdan más de un margen** según Stockfish local. El margen se reduce con el nivel del bot y con el
  ritmo (en partidas lentas el bot «piensa más»: más profundidad de verificación).
- Mantiene jugadas humanas (siempre son candidatas de Maia) y quita los fallos que hacen débil a
  Atlas en partidas lentas. Es el «Move Curator» de Chessiverse, viable en local porque Stockfish
  nativo responde en milisegundos y cabe dentro del tiempo de reflexión simulado.
- Calibrar el resultado con la liga (I-50) antes de anunciar un Elo. Alternativa de investigación
  para la Fase 9 (bots) o la 10 (investigación): modelo humano + búsqueda adaptativa (como *Allie*).

### I-49. Catálogo de bots: cuántos y cómo elegirlos

**Cuántos bots curados** (con nombre, historia, repertorio y personalidad medida), según el
esquema acordado con el autor el 2026-10-14:

- **Niveles bajos con pocos bots:** uno en 600 y uno en 700 (en niveles tan bajos más resolución no
  aporta nada).
- **De 50 en 50 desde 800–900 hasta ~2.800** (la parte alta depende de I-48).
- **Repeticiones entre ~1.000–1.100 y ~2.200–2.300**: 2–3 bots por puesto con personalidades y
  repertorios distintos.
- Resultado: unos 42–45 puestos y, con las repeticiones, **80–100 bots**, el objetivo aceptado.
- Se construyen por **combinación**: 5 personalidades de juego × 4 estilos de apertura × repertorio
  × Elo, más comportamientos (tiempo, abandono). Cada bot nuevo se valida con la medición de I-47.

**Jugadores generados** (sin historia, para llenar torneos grandes): Elo, personalidad, repertorio
estadístico por banda de Elo y comportamientos sorteados con **semilla fija**, para que el mismo
jugador sea el mismo en cada torneo.

**La interfaz cambia** con ese número: el selector actual no sirve para 100 bots. Hace falta un
**explorador de bots** con búsqueda, filtros (rango de Elo, personalidad en el mapa de cuatro
cuadrantes, estilo de apertura, aperturas que juega, país ficticio), favoritos, recientes y una ficha
por bot con su mapa de estilo medido, su repertorio y el historial del usuario contra él.

### I-50. Rating local contra bots y escala calibrada

- Partidas **puntuables o amistosas** contra bots; rating del usuario local (Glicko-2) con historial.
- Escala de bots calibrada con la liga de bots (Fase 4.5) y anclas reproducibles; los resultados del
  usuario solo ajustan su propio rating, no el de los bots, para no inflar la escala.

### I-51. Torneos con el usuario

**Corrige el enfoque del roadmap:** el usuario es el protagonista; los torneos solo de bots son
experimentos del Generador.

- Formatos: round-robin, suizo, eliminación directa y doble; ritmo, rondas y número de jugadores.
- **Plantillas**: soy favorito, todos de mi nivel, todos mejores que yo, mixto, especialistas en una
  apertura, y otras experimentales.
- **Autorrelleno con filtros** (Elo, estilo, país ficticio, apertura) desde bots curados y
  generados (I-49).
- **Calendario local rotativo** opcional (diario, semanal, mensual) generado sin servidor a partir
  de la fecha.
- **Rendimiento:** los tableros bot contra bot se resuelven por modelo estadístico (Elo y estilo)
  o en segundo plano con baja prioridad; solo las partidas del usuario se juegan de verdad. Un open
  de 100 jugadores no puede lanzar 50 partidas de Maia por ronda.
- Pausa, reanudación, clasificación, desempates y exportación PGN de las partidas del usuario.

### I-52. Partida guiada y mates básicos cronometrados

- **Partida guiada:** contra un bot, avisar antes de jugar cuando la posición es crítica (gran
  diferencia entre la mejor jugada y las demás), con ayuda ajustable; partidas así no puntúan.
- **Mates básicos cronometrados** contra un rey que resiste (tablebase), en Finales.

### I-53. Planificador global de motores

Un único coordinador para todo lo que usa motores (análisis en vivo, reportes, Player Analysis, bots,
verificación de bots, generador de repertorios, preparación): límite de procesos y de hash
total según la máquina, prioridades (lo que el usuario mira primero, lotes después), cancelación y
reutilización de procesos calientes. Sin él, las ideas de este documento pueden lanzar varios
Stockfish y Maia a la vez y saturar el equipo.

### I-54. Presupuesto de rendimiento

Ver sección 7.

---

## 4. Material de entrenamiento: origen, formatos y clasificación

### De dónde sale el material de las páginas

- **Táctica:** casi siempre la Lichess Puzzle Database: unos 5 millones de puzzles extraídos de
  partidas reales de Lichess, CC0, con rating Glicko (calculado por los intentos de los usuarios),
  popularidad, número de intentos, temas y apertura. **Onyx ya la puede descargar.**
- **Finales:** posiciones de libros como datos (FEN + referencia), más tablebase y motor.
- **«Estrategia» (ChessRamp):** también son puzzles de Lichess, filtrados por temas como
  `quietMove`, `advancedPawn` o `zugzwang` y agrupados por bandas de rating. Ninguna página revisada
  hasta ahora tiene ejercicios estratégicos propios de verdad; para eso, los libros del autor siguen
  siendo la mejor fuente.
- **Visualización (Listudy):** tácticas extraídas de partidas de maestros, guardadas como partida
  completa + ply de inicio para poder ocultar jugadas.
- **Finales de dominio público (Listudy):** Kling y Horwitz (1851) y Capablanca (1921), escritos a
  mano en su código.
- **Repertorios generados (qchess):** no usan material de libros, sino estadísticas de una base de
  partidas.

### El problema del material propio

Los PGN del autor no tienen rating, tema ni nivel, y su formato varía por libro. Opciones, de menos a
más ambiciosa:

1. **Usar la estructura de la fuente:** capítulos, `Event`, `Round`, comentarios iniciales o nombres
   de archivo suelen indicar el tema («Clavada», «Capítulo 5: Ataque doble»). Barato y fiable cuando
   existe.
2. **Etiquetado automático de temas a partir de la solución:** el etiquetador de Lichess
   (`lichess-puzzler`, código abierto) deduce temas como horquilla, clavada, mate en N o sacrificio
   analizando la línea de solución. Es reimplementable con reglas verificables, en la línea del
   catálogo táctico de 7.3.4. Ojo con la licencia: ese código es AGPL; conviene reimplementar ideas,
   no copiar código.
3. **Estimación de dificultad sin usuarios:** no se puede calcular un rating Glicko sin miles de
   intentos, pero sí estimarlo. La idea más interesante para Onyx: **usar Maia a varios niveles**
   para ver a partir de qué rating encuentra la solución, junto con longitud de la solución, número
   de jugadas «únicas» y diferencia de evaluación. Se valida contra los ratings reales de la base de
   Lichess (existe trabajo académico sobre predicción de dificultad de puzzles con esa base). Esto es
   un **caso de estudio reproducible de MLOps** casi ideal para la Fase 10: pregunta medible, dataset
   público con etiqueta, modelo propio (Maia) y beneficio directo para el usuario.

### Qué debería buscar el autor en sus PGN

Para decidir el importador y los filtros, sería útil reunir 3–5 PGN de libros distintos (táctica,
finales y estrategia) y anotar:

- si la posición viene en `[FEN]`/`[SetUp]` o se llega desde una partida;
- si la primera jugada del registro es del rival (la «jugada previa») o ya del estudiante;
- dónde está la solución: línea principal, variantes o solo comentarios;
- si las variantes son alternativas válidas, refutaciones de errores o análisis del autor;
- qué cabeceras usan para capítulo y tema (`Event`, `Round`, `White`, `Annotator`...);
- si hay marcas de dificultad (estrellas, `!`/`!!`, números);
- si hay texto en otro idioma o codificación rara.

---

## 5. IA como entrenador: registro de enfoques observados

Objetivo: documentar cómo lo hacen otros para preparar una base escalable sin implementar algo que
todavía no funcione.

| Página | Qué hace con IA | Cómo | Coste | Problemas observados |
| --- | --- | --- | --- | --- |
| ChessCorpus | Explicaciones de finales | Generación offline, una vez, guardada como datos estáticos bilingües. Dos capas: resumen por posición y fichas por categoría. | Único, al generar | Fichas asignadas por categoría que contradicen la posición; nada verificado contra la tablebase. |
| ChessRamp | «Coach» por jugada e informe de patrones (premium) | Por jugada: burbujas por plantilla según la categoría, sin LLM en el cliente. Informe: lógica en el servidor, no verificable; lo descrito es reproducible con reglas sobre métricas del motor. | Bajo o desconocido | Promete «AI» donde lo visible son plantillas. |
| King Takes King | «Un coach explica cada error» | Ejemplo mostrado: frase construida con hechos del motor («permite mate en 1: 4.Qxf7#»). | Nulo si es plantilla | Entrenamiento aún no publicado. |
| FireChess | Textos de cada ejercicio e informe | Plantillas: frase factual sobre la mejor jugada + consejo fijo por tema + cita célebre. Sin IA en vivo. | Nulo | Temas asignados por forma de la jugada, no por causa. |
| ChessStalker | Bot gemelo | Libro de aperturas del jugador + Maia 3 en servidor al Elo estimado. No es IA generativa. | Servidor de Maia | No imita el estilo individual fuera del libro. |
| Chessiverse | Bots y chats de personalidad | Maia-2 como generador de candidatas; antes, filtro con motor fuerte. Chats redactados con ChatGPT a partir de eventos de la partida. | Servidor | No explica cómo llegan a más de 3.000. |
| FlexiChess (Pallas) | Preguntas libres sobre la posición; búsqueda en lenguaje natural | **LLM en vivo + verificación:** cada jugada o táctica citada se reproduce y comprueba con Stockfish antes de mostrarse. La búsqueda traduce la frase a filtros y dice qué entendió. | Real; lo controlan con cuotas semanales | No verificable sin cuenta; la verificación no cubre afirmaciones de plan. |

**Patrón que se repite:** lo que las páginas llaman «IA» es, en la parte que se puede comprobar,
**plantillas sobre hechos del motor** o **texto generado una vez offline**. La única que usa un LLM
en vivo (FlexiChess) lo hace con **verificación obligatoria de cada jugada citada** y cuotas para
limitar el coste. Para Onyx eso significa que la capa útil hoy (I-18, I-24, I-10) se
puede construir sin IA y dejar preparado el campo de texto para un modelo futuro.

### Principios provisionales para Onyx

1. **Offline antes que en vivo:** generar, revisar y publicar como datos es barato, reproducible y
   auditable.
2. **Anclar en hechos verificables:** veredicto de tablebase, líneas de motor, familia de material.
   El texto no puede contradecirlos y se comprueba automáticamente.
3. **Procedencia visible:** cada explicación dice si viene del libro, del autor o de un modelo, y si
   fue revisada.
4. **Interfaz independiente del origen:** el mismo campo `explanation` se llena hoy a mano y mañana
   con IA.
5. **Verificador antes que modelo:** si algún día hay un LLM en vivo, toda jugada, línea o táctica
   que cite pasa por el motor local (y la tablebase cuando aplique) antes de mostrarse, como Pallas.
   El verificador se puede construir ya: es el mismo que validan I-10 e I-24.

### Principios para etiquetas de estilo

Varias páginas etiquetan jugadores («agudo», «sólido», «como Tal»). FlexiChess muestra cómo se hace
mal: umbrales fijos sobre el porcentaje de partidas decisivas, que depende sobre todo del Elo y del
ritmo. Para Onyx, si se hace:

- mostrar **componentes medibles** (partidas decisivas, enroques opuestos, cambio temprano de damas,
  sacrificios verificados, frecuencia de finales) antes que una etiqueta;
- comparar cada componente con lo **esperado para la misma banda de Elo y ritmo** en la base de
  referencia, no con un umbral fijo;
- poner etiqueta solo cuando la diferencia sea clara con muestra suficiente, y explicar de qué
  componentes sale;
- nunca comparar con jugadores históricos.

### Principios para temas posicionales de los errores

FireChess muestra el error típico: llamar «King Exposure» o «Premature Pawn Break» a cualquier
jugada de peón que pierde algo, según su forma. Para Onyx:

- distinguir **qué hizo la jugada** (hechos comprobables: «creó un peón aislado», «cambió damas»,
  «retiró el caballo», «movió un peón del enroque») de **por qué fue mala** (la causa);
- mostrar los hechos como rasgos de la jugada; afirmar una causa solo cuando una regla la verifique
  (por ejemplo, la mejor línea del motor explota exactamente esa debilidad);
- si no se puede verificar, el error queda «sin clasificar» con su pérdida, como ya hace 7.3.4;
- ninguna puntuación compuesta (radar, «compostura 73») sin una definición publicada.

---

## 6. Jugadores y preparación (8.4–8.6): estructura propuesta

**Dirección aceptada por el autor el 2026-10-14:** sección propia «Jugadores», separada de
«Usuario», con la ficha propia como un caso más. Los detalles siguen abiertos. La pestaña «Análisis»
dentro de «Usuario» no escala si también hay que analizar rivales y crear material para cada uno.

- **Nueva sección lateral «Jugadores»** (o «Preparación»), separada de las cuentas:
  - **Buscar:** en bases locales (con I-01), en cuentas Lichess/Chess.com y por FIDE.
  - **Fichas guardadas:** yo, rivales, alumnos. La ficha propia es un caso más, no un caso aparte.
- **Ficha de jugador** con pestañas:
  - **Resumen:** identidad (alias manuales, FIDE si se vinculó), Elo, actividad, fuentes,
    cobertura, momentos destacados (I-22), psicología y reloj (I-44), rivales frecuentes y cara a
    cara (I-45).
  - **Partidas:** lista filtrable con actualizar, visor, análisis en lote y descarga PGN (I-13).
  - **Repertorio:** familias → variantes → subvariantes por color (I-42), con frecuencia,
    resultados y rating par; enlace al informe de posición; para la ficha propia, repertorio contra
    realidad (I-19).
  - **Análisis:** lo que hoy es Player Analysis (motor, errores, motivos, relojes, versiones) más el
    diagnóstico con prioridades (I-18).
  - **Entrenamiento** (ficha propia y alumnos): cola de errores (I-17) y práctica de conversión y
    defensa (I-21).
  - **Preparación** (rivales): veredicto «cómo jugarle» (I-32), repertorio probable con «rating
    par» por línea (I-30), estructuras y finales frente a lo esperado (I-31), desviaciones recientes,
    dificultad práctica de sus posiciones clave (I-33), líneas propias contra ese jugador generadas y
    editables (I-41), **jugar contra su gemelo** (I-43) y paquete exportable.

**Dos niveles de análisis, como ChessStalker y el Player Analysis actual:** las estadísticas sin
motor (aperturas, resultados, psicología, rivales) se calculan al instante con miles de partidas; el
análisis de motor (errores, fugas, ejercicios) se lanza aparte sobre una muestra elegida. La interfaz
debe dejar claro qué conclusiones vienen de cada nivel.
  - **Fugas** (ficha propia y alumnos; puede ir dentro de Análisis): catálogo de I-29 con coste y
    evolución.
- **«Usuario»** queda para conectar cuentas y preferencias.
- Ajuste técnico: `PlayerAnalysisPanel.tsx` tiene 1.704 líneas y hay que dividirlo antes de
  moverlo, según la regla vigente.

---

## 7. Rendimiento y fluidez

Requisito del autor: Onyx no puede volverse lento ni pesado. La mayoría de las ideas de este
documento **no tienen por qué hacerlo**, siempre que se respeten las reglas de abajo. Los riesgos
reales están concentrados en pocos sitios.

### Dónde está el riesgo

| Riesgo | Ideas afectadas | Qué pasaría si se hace mal |
| --- | --- | --- |
| **Varios motores a la vez** | I-14, I-17, I-40, I-41, I-43, I-48, I-51 | Stockfish y Maia compitiendo por CPU y RAM; interfaz y tablero lentos, ventilador al máximo. |
| **Escaneos completos de la base** | I-19, I-28, I-30, I-40, preparación | ~26 s por cada posición nueva en 10 M de partidas; si una pantalla dispara muchos, se congela la experiencia. |
| **Archivos JSON que crecen** | I-14 (caché), I-17, perfiles, torneos | `training-areas-v1` se carga **antes de mostrar la aplicación**; si se le añaden datos grandes, el arranque se vuelve lento. |
| **Cálculos pesados en la interfaz** | I-42, I-44, I-45, tablas de preparación | Agregar miles de partidas en JavaScript bloquea la interfaz. |
| **Paquete web grande** | Todas las pantallas nuevas | El bundle principal ya supera 5 MB (anotado en 7.0); más secciones lo agravan. |
| **Simular torneos jugando todas las partidas** | I-51 | Decenas de partidas de Maia por ronda. |
| **Conversiones y descargas largas** | I-25, I-26, I-27 | Horas de CPU y GB de disco si no se avisa y no corre en segundo plano. |

### Reglas para que no ocurra

1. **Un solo planificador de motores** (I-53) con límite de procesos y de hash según la máquina,
   prioridades y cancelación. Ninguna función nueva lanza motores por su cuenta.
2. **El trabajo pesado va en Rust y en segundo plano**, con progreso y cancelación, como ya hacen
   los reportes. La interfaz solo pinta resultados.
3. **Nunca un escaneo por celda**: reutilizar coincidencias (decisión de 7.0), agregados
   precalculados por jugador y caché acotada. Medir I-27 antes de prometer respuestas instantáneas.
4. **Datos grandes fuera del JSON de arranque**: cachés de evaluación, colas de errores, perfiles y
   torneos en archivos propios o en SQLite, cargados bajo demanda. La caché de evaluaciones y la
   cola de errores son probablemente el primer caso que justifica SQLite según la regla vigente.
5. **Cargar solo lo visible**: pestañas y secciones nuevas cargadas de forma diferida (código y
   datos); listas largas virtualizadas, como ya se hace en las listas PGN.
6. **Torneos simulados por modelo** para los tableros sin el usuario (I-51).
7. **Descargas y conversiones** con espacio requerido visible, en segundo plano y reanudables.
8. **Presupuesto de rendimiento medido** (I-54): arranque en frío, abrir una ficha con 5.000
   partidas, primera página de una búsqueda, analizar 50 partidas, memoria máxima durante un
   análisis en lote y tamaño del bundle. Se mide en una máquina de referencia (por ejemplo, el
   i5-1135G7 de 7.0), se registra en cada release y un empeoramiento claro bloquea la release.

Con estas reglas, varias ideas **mejoran** la fluidez actual: I-14 (análisis más rápido), la caché de
evaluaciones, I-27 (explorador instantáneo, si las mediciones lo permiten) y la división del bundle.

---

## 8. Fases recomendadas y orden

Propuesta para pasar al roadmap. La numeración 8.x es orientativa: el autor decide cómo nombrarlas.
Fase 9 = expansión avanzada; Fase 10 = consolidación pública y MLOps, la última. Cada idea aparece en
la fase donde se implementa; si se reparte entre dos, se indica qué parte va en cada una.

### Mantenimiento (sin fase, en cualquier momento)

Búsqueda de jugadores, informe de calidad mínimo, repeticiones para aprender y, si se quiere antes,
jerarquía de aperturas.

**Ideas:** I-01, I-26 (versión mínima), I-37, I-42 (opcional aquí; si no, en 8.4).

### 8.2 Motor y análisis — nueva

Planificador de motores, análisis más rápido sin perder veredictos, probabilidad de victoria y
momentos clave, explicaciones por plantilla, flechas en los ejercicios y primer presupuesto de
rendimiento.

**Ideas:** I-53, I-14, I-15, I-24, I-46, I-54 (primera versión).

### 8.3 Bases de referencia — nueva, corta, en paralelo a 8.2

Catálogo propio de descargas, Gigabase OTB y Online alojadas por el autor, rendimiento frente a lo
esperado y tendencia por jugada, informe de calidad completo.

**Ideas:** I-25, I-26 (completa), I-28.

### 8.4 Jugadores: ficha y estadísticas — modifica la antigua 8.2

Sección Jugadores, ficha para cualquier jugador, lista de partidas, aperturas por familias, rating
par, psicología y reloj, rivales y momentos destacados. Antes: dividir `PlayerAnalysisPanel.tsx`.

**Ideas:** I-02, I-03 (opcional), I-13, I-22, I-30, I-42, I-44, I-45.

### 8.5 Generador de repertorios — nueva

Repertorios generados desde estadísticas, verificados con motor, anotados y con partidas modelo;
incluye el enfoque «líneas difíciles para el rival».

**Ideas:** I-40, I-33 (como criterio del generador).

### 8.6 Preparación contra rivales — modifica la antigua 8.2

Repertorio contra realidad, veredicto «cómo jugarle», dificultad práctica de sus posiciones,
líneas de preparación generadas, bot gemelo, ocho estructuras validadas y base de retransmisiones
para rivales OTB.

**Ideas:** I-19, I-31 (ocho estructuras), I-32, I-33, I-41, I-43 (versión 1), I-04 (solo la parte
de retransmisiones para rivales).

### 8.7 Entrenamiento desde errores — nueva

Cola automática de errores con repaso espaciado, diagnóstico con prioridades, práctica de
conversión y defensa, catálogo de fugas con coste y evolución.

**Ideas:** I-17, I-18, I-21, I-29.

### 8.8 Táctica: modos y sets — nueva, amplía Fase 6

Modos de sesión, repaso espaciado y Elo táctico, constructor de sets desde los puzzles de Lichess,
visualización a ciegas y sin piezas.

**Ideas:** I-05, I-06, I-20, I-38.

### 8.9 Finales: evaluación por jugada — nueva, amplía Fase 6

El cambio principal: comprobar tras cada jugada si el objetivo sigue siendo alcanzable, con la mejor
defensa como rival por defecto. Además, familia y objetivo calculados al importar y filtro por tema.

**Ideas:** I-07, I-08, I-09; opcional: mates básicos cronometrados (parte de I-52).

### 8.10 Aperturas: repaso continuo y huecos — nueva, amplía 6.A

**Ideas:** I-36, I-34.

### 9.1 Bots — modificada

Personalidades reales y medidas, bots fuertes verificados con Stockfish, catálogo de 80–100 bots con
explorador, rating local y escala calibrada, partida guiada.

**Ideas:** I-47, I-48, I-49, I-50, I-52 (partida guiada).

### 9.2 Torneos — reenfocada en el usuario

**Ideas:** I-51.

### 9.3 Interpretación estratégica — modificada

**Ideas:** I-31 (ampliación y entrenamiento por estructura), I-43 (gemelo con estilo medido).

### Fase 10 — Consolidación pública y MLOps — modificada, la última

**Ideas:** I-04 (pipeline completo), I-11, I-16, I-23, I-27, I-43 (versión 2, Maia personalizada),
I-54 (integrado en CI).

### Aplazadas, sin fase

I-10 (fichas de técnica), I-12 (servicio web de coste cero), I-35 (búsqueda en lenguaje natural) e
I-39 (fuentes libres de finales).

8.8–8.10 no dependen de 8.2–8.7 y pueden adelantarse si el uso diario del autor y del grupo lo pide.

---

## 9. Pendientes para la evaluación del autor

### Decisiones ya tomadas (2026-10-14)

- Formato y ubicación de este documento: se mantienen.
- Sección propia «Jugadores», separada de «Usuario», con la ficha propia como un caso más.
- Finales: mejor defensa como rival predeterminado; Maia como opción (I-07).
- Fase intermedia «Motor y análisis» antes de la preparación.
- Adelantar la cola automática de errores (I-17).
- Gigabase actual como tarea previa a la preparación (I-25); AidaChess descartada.
- Repaso continuo aparte del calendario FSRS (I-36).
- Jerarquía de aperturas Familia → Variante → Subvariante (I-42).
- La antigua 8.2 se divide en ficha (8.4) y preparación (8.6).
- Generador de repertorios entre ambas (8.5).
- **No se incluyen libros de finales**; se prioriza la importación del usuario (I-08, I-39).
- Numeración: Fase 9 = expansión avanzada; Fase 10 = MLOps, la última.
- Finales: el cambio principal es comprobar tras cada jugada si el objetivo sigue siendo alcanzable
  (I-07); al importar se calculan familia y objetivo, sin dificultad (I-08); filtro solo por tema
  (I-09); fichas de técnica aplazadas (I-10).
- Bots: objetivo de 80–100 curados; 600, 700 y de 50 en 50 desde 800–900, con repeticiones entre
  ~1.000 y ~2.300 (I-49).
- Catálogo propio de descargas como JSON en el repositorio de Onyx.
- Estructuras: las ocho iniciales de I-31, validadas con el libro de Flores Rios.
- Bots fuertes verificados (I-48) se quedan en 9.1, sin adelantarse.

### Decisiones abiertas

1. **Alojamiento de las bases convertidas** (I-25): comparación y recomendación (Hugging Face) en
   I-25.
   Antes, escribir al autor de LumbrasGigaBase.
2. **SQLite para datos grandes.** Ventajas y desventajas:

   | Ventajas | Desventajas |
   | --- | --- |
   | Onyx ya lo usa en todas sus bases (no es una dependencia nueva). | No se lee ni se edita a mano como un JSON. |
   | Escribe solo lo que cambia; un JSON se reescribe entero. | Exige migraciones de esquema versionadas. |
   | Búsquedas con índice sin cargar todo en memoria. | Exportación y backup deben implementarse aparte. |
   | Transacciones: un cierre a mitad de escritura no corrompe los datos. | En Windows requiere WAL y `busy_timeout`, como las bases actuales. |
   | Escala a millones de filas. | |

   **Relación con el error «No se pudo completar la consulta de esta posición»:** ese mensaje es el
   aviso genérico de cualquier fallo en la consulta de posición del panel de base de datos
   (`DatabasePanel.tsx`, `PositionGamesTable.tsx`). Usar SQLite para cachés y colas **no lo empeora
   ni lo hace más difícil de resolver**, con dos condiciones de diseño:
   - archivos y conexiones **propios**, nunca dentro de las bases de partidas ni compartiendo su
     conjunto de conexiones o sus bloqueos;
   - la consulta de posición **no depende** de esas cachés: si una caché falla, se ignora y la
     consulta sigue igual.

   Con esas condiciones se recomienda aceptarlo. Investigar ese error primero, como planea el autor,
   es buena idea: si resulta ser de bloqueos de SQLite, la lección se aplica también a los archivos
   nuevos.

### Correcciones al roadmap detectadas

- La **tabla de estado** de la sección 4 del roadmap todavía llama Fase 9 a MLOps y Fase 10 a la
  expansión; las secciones ya usan el orden correcto. También hay referencias sueltas a «10.4».
- Los torneos deben describirse con el usuario como protagonista (I-51).
- El set táctico automático pasa a «Entrenamiento desde errores» (I-17).
- El rival predeterminado de Finales pasa a ser la mejor defensa (I-07).
- La antigua 8.2 se reparte en 8.4–8.6, con 8.2 «Motor y análisis» y 8.3 «Bases» antes.

### Afirmaciones no verificadas en este estudio

Conviene no presentarlas como hechos al pasar ideas al roadmap:

- que ChessCorpus genera sus textos con un LLM (inferencia fuerte, no confirmada);
- cómo funciona el AI Coach de ChessRamp (lógica en su servidor);
- cómo llega Chessiverse a bots de más de 3.000;
- la cifra de 14 M de AidaChess y la fuente de Chess.ceo;
- la corrección del problema de partidas cortadas en la Gigabase de 2025.

### Material propio: qué PGN revisar

Con la decisión de no incluir libros, el inventario sirve para **diseñar los importadores**, no para
elegir contenido. Basta con 3–5 archivos representativos de cada tipo:

| Tipo | Para qué ideas | Qué mirar |
| --- | --- | --- |
| **Libros de táctica** con capítulos por tema | I-11, I-20, I-38 | Si el tema está en el nombre del capítulo, `Event`, `Round` o comentarios; si la primera jugada es del rival; dónde está la solución. |
| **Libros de táctica sin orden** (miles de ejercicios, como Woodpecker) | I-11 (temas y dificultad automáticos) | Si traen partida previa o solo FEN; longitud de las soluciones; variantes. |
| **Finales** | I-07, I-08 | Si el objetivo (ganar/tablas) está indicado y cómo; cuántas posiciones tienen ≤ 7 piezas (verificación exacta con tablebase). |
| **Ejercicios estratégicos o de plan** | Importación a Táctica | Si la solución es una jugada concreta o un plan explicado en texto; si se pueden validar con motor. |
| **Cursos de aperturas** | I-36, I-37, I-40 | Ya probados con 6.A; solo anotar formatos nuevos. |
| **Colecciones de partidas comentadas** | Partidas modelo para I-40 y la preparación | Si tienen `WhiteElo`/`BlackElo`, fechas y comentarios. |
| **Libro de estructuras de Flores Rios** | I-31 | Si cada capítulo/estructura se distingue en las cabeceras, para usarlo como ejemplos etiquetados. |

---

## 10. Registro de la sesión

- **2026-10-14:** se crea el documento. Página 1: ChessCorpus, investigada en el sitio (manifiesto
  público, API, bundle JS, créditos y privacidad).
- **2026-10-14:** respuestas del autor (sección «Jugadores», mejor defensa en Finales). Páginas 2 y
  3: ChessRamp (motor de análisis, clasificación, origen del Woodpecker «estratégico») y King Takes
  King (descartada salvo tres ideas). Nuevas ideas I-13 a I-24 y nueva fase intermedia «Motor y
  análisis» en el borrador de orden.
- **2026-10-14:** aceptadas la fase «Motor y análisis» y el adelanto de I-17; aclarada la
  terminología del informe de posición. Páginas 4 y 5: Chess.ceo (índice de posiciones, Gigabase y
  su licencia) y FlexiChess (perfiles de análisis, catálogo de fugas, estilo, rating par, Pallas).
  Nuevas ideas I-25 a I-35 y principios para etiquetas de estilo.
- **2026-10-14:** revisado el catálogo de descargas heredado de En Croissant; AidaChess descartada.
  Páginas 6 y 7: Listudy (código AGPL revisado: dominio por jugada, tácticas a ciegas y sin piezas,
  finales de dominio público) y qchess (generador de repertorios por estadísticas). Nuevas ideas
  I-36 a I-41.
- **2026-10-14:** repaso continuo aparte del FSRS (decidido); I-40 pendiente de decisión. Páginas 8
  y 9: FireChess (temas posicionales por geometría, plantillas) y ChessStalker (bot gemelo, familias
  de aperturas, debilidades). Nuevas ideas I-42 a I-46, principios para temas posicionales y
  propuesta de partir 8.2 en dos entregas.
- **2026-10-14:** aceptada la partición de 8.2. Página 10 y última: Chessiverse (Maia-2, Move
  Curator, estilos medidos, torneos). Nuevas ideas I-47 a I-54, sección de rendimiento, orden
  completo y pendientes para la evaluación del autor.
- **2026-10-14:** correcciones del autor: Fase 9 = expansión, Fase 10 = MLOps (última); no se
  incluyen libros de finales (I-08, I-09, I-10 e I-39 reenfocadas); generador entre ficha y
  preparación. Redefinidas I-31 (ocho estructuras, validación con Flores Rios) e I-33 (dificultad
  práctica con Maia + Stockfish). Documentadas las personalidades de Chessiverse y el catálogo de
  bots (I-47, I-49), SQLite y catálogo de descargas. Sección 8 reescrita como fases recomendadas.
- **2026-10-14:** Finales simplificado (I-07 como cambio principal, I-08 e I-09 simplificadas, I-10
  aplazada); escalones de bots aceptados; catálogo propio aceptado y proceso de actualización
  documentado tras ver que Lumbras no ofrece enlaces directos estables; SQLite condicionado a no
  compartir archivos ni conexiones con las bases. Sección 8 con las ideas de cada fase.
- **2026-10-14:** I-48 se queda en 9.1. Comparación R2 / Hugging Face y tamaños estimados de las
  bases añadidos a I-25.
