/** Text of the landing page, in Spanish and English. */
import type { IconName } from "../components/icons";
import type { Lang } from "./ui";

type Item = { title: string; text: string };
type IconItem = Item & { icon: IconName };

export type ShotName = "analysis" | "database" | "training" | "preparation" | "books";

export type Landing = {
    hero: {
        notes: string;
        title: string;
        lead: string;
        download: string;
        downloadFor: Record<"windows" | "mac" | "linux", string>;
        github: string;
        platforms: string;
    };
    facts: { value: string; label: string }[];
    essentials: { kicker: string; title: string; text: string; link: string; items: IconItem[] };
    training: {
        kicker: string;
        title: string;
        text: string;
        link: string;
        steps: Item[];
        items: IconItem[];
    };
    advanced: {
        kicker: string;
        title: string;
        text: string;
        featured: (Item & { tag: string; points: string[]; shot: ShotName; link: { label: string; path: string } })[];
        items: (IconItem & { tag: string; link?: { label: string; path: string } })[];
    };
    principles: { kicker: string; title: string; items: IconItem[] };
    cta: { title: string; text: string; download: string; guide: string };
    screenshots: Record<ShotName, string>;
};

export const landing: Record<Lang, Landing> = {
    es: {
        hero: {
            notes: "Notas de la versión",
            title: "Tu laboratorio de ajedrez.",
            lead: "Bases de datos, motores y análisis, con el entrenamiento y la preparación integrados. Todo en tu computadora.",
            download: "Descargar Onyx",
            downloadFor: {
                windows: "Descargar para Windows",
                mac: "Descargar para macOS",
                linux: "Descargar para Linux",
            },
            github: "Ver en GitHub",
            platforms: "Windows · macOS · Linux",
        },
        facts: [
            { value: "10 M+", label: "partidas por base, con búsqueda por posición" },
            { value: "UCI", label: "Stockfish, Lc0 o cualquier motor compatible" },
            { value: "Local", label: "sin cuenta obligatoria, sin anuncios ni telemetría" },
            { value: "ES · EN", label: "interfaz y documentación completas" },
        ],
        essentials: {
            kicker: "Bases, motores y análisis",
            title: "Todo lo que esperas de un programa de ajedrez serio.",
            text: "Importa tus PGN, descarga bases de millones de partidas y encuentra cualquier posición en segundos. Analiza con Stockfish o con el motor que prefieras y guarda tu trabajo en estudios.",
            link: "Guía de bases de datos",
            items: [
                {
                    icon: "database",
                    title: "Bases de datos locales",
                    text: "Busca por jugador, evento o posición exacta y parcial, en colecciones de más de diez millones de partidas.",
                },
                {
                    icon: "cpu",
                    title: "Motores UCI",
                    text: "Stockfish se instala desde la propia app. Lc0 o cualquier otro motor UCI se añade en segundos.",
                },
                {
                    icon: "chart-line",
                    title: "Análisis",
                    text: "Revisa partidas con el motor, el explorador de aperturas, tus bases y tus anotaciones a la vez.",
                },
                {
                    icon: "file-analytics",
                    title: "Informes de aperturas",
                    text: "Estadísticas, teoría, órdenes de jugadas y transposiciones, exportables a HTML y PGN.",
                },
                {
                    icon: "notebook",
                    title: "Estudios",
                    text: "Organiza análisis, lecciones y notas en capítulos PGN editables, con historial de recuperación.",
                },
                {
                    icon: "cloud-download",
                    title: "Tus partidas en línea",
                    text: "Importa tus partidas de Lichess y Chess.com para analizarlas junto al resto.",
                },
            ],
        },
        training: {
            kicker: "Del análisis al entrenamiento",
            title: "Lo que analizas, lo entrenas.",
            text: "En Onyx las herramientas no viven separadas. Una posición de tu partida, de un libro o de la base de un rival pasa a tu entrenamiento en un par de clics, y vuelve cuando toca repasarla.",
            link: "Guía de entrenamiento",
            steps: [
                { title: "Analiza", text: "Revisa tus partidas con el motor y tus bases." },
                { title: "Detecta", text: "Encuentra dónde fallas y lo que debes conocer." },
                { title: "Entrena", text: "Conviértelo en ejercicios, repertorio o finales." },
                { title: "Repasa", text: "La repetición espaciada te lo devuelve a tiempo." },
            ],
            items: [
                {
                    icon: "target",
                    title: "Táctica",
                    text: "Colecciones por tema, Storm, Streak y Countdown, tablero a ciegas y ejercicios con tus propios errores.",
                },
                {
                    icon: "repeat",
                    title: "Aperturas",
                    text: "Tu repertorio con repetición espaciada. Onyx distingue la ruta exacta de una transposición.",
                },
                {
                    icon: "chess-knight",
                    title: "Finales",
                    text: "Posiciones teóricas para jugar contra un motor o un bot hasta que la técnica sea tuya.",
                },
            ],
        },
        advanced: {
            kicker: "Herramientas avanzadas",
            title: "Y cuando quieras ir más lejos.",
            text: "Funciones que normalmente están repartidas entre varios programas y servicios, conectadas con tus bases y tu entrenamiento.",
            featured: [
                {
                    tag: "Jugadores",
                    title: "Prepárate contra tu próximo rival.",
                    text: "Reúne sus partidas de Lichess, Chess.com o tus bases y Onyx te muestra cómo juega.",
                    points: [
                        "Su repertorio probable con blancas y con negras",
                        "Estructuras, puntos fuertes y puntos débiles",
                        "Un bot gemelo que imita su estilo, para ensayar",
                    ],
                    shot: "preparation",
                    link: { label: "Guía de jugadores", path: "guides/players/" },
                },
                {
                    tag: "Libros",
                    title: "Tus libros PDF, junto al tablero.",
                    text: "Lee tus libros de ajedrez sin salir de Onyx. Los diagramas dejan de ser imágenes.",
                    points: [
                        "Convierte cualquier diagrama en una posición",
                        "Reproduce las partidas impresas en el texto",
                        "Reconocedor propio que funciona sin conexión",
                    ],
                    shot: "books",
                    link: { label: "Guía de libros", path: "guides/books/" },
                },
            ],
            items: [
                {
                    tag: "Jugar",
                    icon: "robot",
                    title: "Bots que juegan como personas",
                    text: "Con Maia 3, los bots cometen los errores de un jugador real de su nivel. Juega partidas o torneos completos contra ellos.",
                    link: { label: "Cómo se calibraron", path: "technical/human-bots/" },
                },
                {
                    tag: "Tablero",
                    icon: "route",
                    title: "Explorador de planes",
                    text: "Desde cualquier posición, mira qué planes siguen los jugadores de tu base y con qué resultado.",
                },
                {
                    tag: "Laboratorio",
                    icon: "flask",
                    title: "Partidas modelo",
                    text: "Genera partidas de motor desde cualquier posición para ver cómo se juega, en lotes reproducibles.",
                },
            ],
        },
        principles: {
            kicker: "Principios",
            title: "Libre, local y en tu idioma.",
            items: [
                {
                    icon: "lock",
                    title: "Local primero",
                    text: "Tus partidas, perfiles y entrenamientos se guardan en tu equipo. No hace falta una cuenta.",
                },
                {
                    icon: "code",
                    title: "Libre y abierto",
                    text: "Código abierto bajo GPLv3. Gratis, sin versión de pago ni anuncios.",
                },
                {
                    icon: "devices",
                    title: "Multiplataforma",
                    text: "Windows, macOS (Apple Silicon e Intel) y Linux, con avisos de actualización en todos.",
                },
                {
                    icon: "language",
                    title: "En tu idioma",
                    text: "Interfaz y documentación completas en español e inglés.",
                },
            ],
        },
        cta: {
            title: "Empieza en unos minutos.",
            text: "Descarga Onyx y la guía de primeros pasos instala Stockfish y Maia 3 por ti. Después añade tu primera base y empieza a analizar.",
            download: "Descargar Onyx",
            guide: "Primeros pasos",
        },
        screenshots: {
            analysis: "Captura: tablero con análisis del motor y explorador",
            database: "Captura: base de datos con búsqueda por posición",
            training: "Captura: sesión de entrenamiento (táctica o aperturas)",
            preparation: "Captura: perfil de un rival en Jugadores",
            books: "Captura: un libro PDF junto al tablero",
        },
    },
    en: {
        hero: {
            notes: "Release notes",
            title: "Your chess lab.",
            lead: "Databases, engines and analysis, with training and preparation built in. All on your computer.",
            download: "Download Onyx",
            downloadFor: {
                windows: "Download for Windows",
                mac: "Download for macOS",
                linux: "Download for Linux",
            },
            github: "View on GitHub",
            platforms: "Windows · macOS · Linux",
        },
        facts: [
            { value: "10 M+", label: "games per database, with position search" },
            { value: "UCI", label: "Stockfish, Lc0 or any compatible engine" },
            { value: "Local", label: "no account required, no ads or telemetry" },
            { value: "EN · ES", label: "full interface and documentation" },
        ],
        essentials: {
            kicker: "Databases, engines and analysis",
            title: "Everything you expect from serious chess software.",
            text: "Import your PGN files, download databases of millions of games and find any position in seconds. Analyze with Stockfish or the engine you prefer, and keep your work in studies.",
            link: "Databases guide",
            items: [
                {
                    icon: "database",
                    title: "Local databases",
                    text: "Search by player, event, or exact and partial position, in collections of more than ten million games.",
                },
                {
                    icon: "cpu",
                    title: "UCI engines",
                    text: "Stockfish installs from inside the app. Lc0 or any other UCI engine is added in seconds.",
                },
                {
                    icon: "chart-line",
                    title: "Analysis",
                    text: "Review games with the engine, the opening explorer, your databases and your notes side by side.",
                },
                {
                    icon: "file-analytics",
                    title: "Opening reports",
                    text: "Statistics, theory, move orders and transpositions, exportable to HTML and PGN.",
                },
                {
                    icon: "notebook",
                    title: "Studies",
                    text: "Organise analysis, lessons and notes in editable PGN chapters, with recovery history.",
                },
                {
                    icon: "cloud-download",
                    title: "Your online games",
                    text: "Import your games from Lichess and Chess.com and analyze them with everything else.",
                },
            ],
        },
        training: {
            kicker: "From analysis to training",
            title: "What you analyze, you train.",
            text: "In Onyx the tools do not live apart. A position from your game, a book or a rival's database goes into your training in a couple of clicks, and comes back when it is time to review it.",
            link: "Training guide",
            steps: [
                { title: "Analyze", text: "Go through your games with the engine and your databases." },
                { title: "Spot", text: "Find what you get wrong and what you need to know." },
                { title: "Train", text: "Turn it into exercises, repertoire or endgames." },
                { title: "Review", text: "Spaced repetition brings it back in time." },
            ],
            items: [
                {
                    icon: "target",
                    title: "Tactics",
                    text: "Themed sets, Storm, Streak and Countdown, a blindfold board and exercises from your own mistakes.",
                },
                {
                    icon: "repeat",
                    title: "Openings",
                    text: "Your repertoire with spaced repetition. Onyx tells the exact route apart from a transposition.",
                },
                {
                    icon: "chess-knight",
                    title: "Endgames",
                    text: "Theoretical positions to play out against an engine or a bot until the technique is yours.",
                },
            ],
        },
        advanced: {
            kicker: "Advanced tools",
            title: "And when you want to go further.",
            text: "Features that usually live across several programs and services, connected to your databases and your training.",
            featured: [
                {
                    tag: "Players",
                    title: "Prepare for your next opponent.",
                    text: "Gather their games from Lichess, Chess.com or your databases and Onyx shows you how they play.",
                    points: [
                        "Their likely repertoire with White and with Black",
                        "Structures, strengths and weak spots",
                        "A twin bot that copies their style, to rehearse",
                    ],
                    shot: "preparation",
                    link: { label: "Players guide", path: "guides/players/" },
                },
                {
                    tag: "Books",
                    title: "Your PDF books, beside the board.",
                    text: "Read your chess books without leaving Onyx. Diagrams stop being pictures.",
                    points: [
                        "Turn any diagram into a position",
                        "Play through the games printed in the text",
                        "Onyx's own recognizer, running offline",
                    ],
                    shot: "books",
                    link: { label: "Books guide", path: "guides/books/" },
                },
            ],
            items: [
                {
                    tag: "Play",
                    icon: "robot",
                    title: "Bots that play like people",
                    text: "With Maia 3, bots make the mistakes a real player of their level would. Play games or whole tournaments against them.",
                    link: { label: "How they were calibrated", path: "technical/human-bots/" },
                },
                {
                    tag: "Board",
                    icon: "route",
                    title: "Plans explorer",
                    text: "From any position, see which plans the players in your database follow and how they score.",
                },
                {
                    tag: "Laboratory",
                    icon: "flask",
                    title: "Model games",
                    text: "Generate engine games from any position to see how it is played, in reproducible batches.",
                },
            ],
        },
        principles: {
            kicker: "Principles",
            title: "Free, local and in your language.",
            items: [
                {
                    icon: "lock",
                    title: "Local first",
                    text: "Your games, profiles and training are stored on your machine. No account needed.",
                },
                {
                    icon: "code",
                    title: "Free and open",
                    text: "Open source under GPLv3. Free, with no paid tier and no ads.",
                },
                {
                    icon: "devices",
                    title: "Cross-platform",
                    text: "Windows, macOS (Apple Silicon and Intel) and Linux, with update notices on all of them.",
                },
                {
                    icon: "language",
                    title: "In your language",
                    text: "Full interface and documentation in English and Spanish.",
                },
            ],
        },
        cta: {
            title: "Get started in a few minutes.",
            text: "Download Onyx and the first-steps guide installs Stockfish and Maia 3 for you. Then add your first database and start analyzing.",
            download: "Download Onyx",
            guide: "First steps",
        },
        screenshots: {
            analysis: "Screenshot: board with engine analysis and explorer",
            database: "Screenshot: database with position search",
            training: "Screenshot: training session (tactics or openings)",
            preparation: "Screenshot: a rival's profile in Players",
            books: "Screenshot: a PDF book beside the board",
        },
    },
};
