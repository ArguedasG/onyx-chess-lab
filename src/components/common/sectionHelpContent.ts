import type { TFunction } from "i18next";
import type { SectionHelpContent } from "./SectionHelp";

/**
 * What each big section is for, in a few practical lines (the "?" at its top right). Written for
 * someone who opens the section for the first time; update it when a section changes.
 */
export type HelpSection =
    | "tactics"
    | "openings"
    | "endgames"
    | "books"
    | "studies"
    | "databases"
    | "players"
    | "tournaments";

export function sectionHelp(section: HelpSection, t: TFunction): SectionHelpContent {
    switch (section) {
        case "tactics":
            return {
                title: t("Help.Tactics.Title", "Tactics: how it works"),
                purpose: t(
                    "Help.Tactics.Purpose",
                    "Train tactics with sets of exercises and keep your progress in each one. A set is a list of positions; a folder groups several sets, like the chapters of a book.",
                ),
                actions: [
                    t(
                        "Help.Tactics.Modes",
                        "Guided mode goes through a set once at your pace. Woodpecker mode repeats the whole set in cycles, faster each time, and records your time and mistakes per cycle.",
                    ),
                    t(
                        "Help.Tactics.Build",
                        "“Build a set” creates one from the Lichess puzzle database: pick a theme (forks, mates, endgames…), a rating band and a size.",
                    ),
                    t(
                        "Help.Tactics.Import",
                        "Import your own PGN as a set, or a whole folder of PGNs as a folder (one set per file).",
                    ),
                    t(
                        "Help.Tactics.Failed",
                        "Missed puzzles come back in the spaced “Review of missed tactics”. To retry the misses of one set, use “Train failed” in its ⋯ menu.",
                    ),
                    t(
                        "Help.Tactics.Trainer",
                        "The puzzle trainer (“Open database trainer”) gives you endless puzzles and a tactical rating; the bookmark there saves a finished puzzle into one of your sets.",
                    ),
                    t(
                        "Help.Tactics.Configure",
                        "“Configure” changes who moves first, which variations count as solutions and the timer of a set.",
                    ),
                ],
                start: t(
                    "Help.Tactics.Start",
                    "Press “Start set” on an included set. With no sets yet, download a puzzle database and use “Build a set”.",
                ),
            };
        case "openings":
            return {
                title: t("Help.Openings.Title", "Openings: how it works"),
                purpose: t(
                    "Help.Openings.Purpose",
                    "Learn and keep your opening repertoire. A repertoire is split into sections (a variation, a system); each section holds the lines you train, plus model games and reference material if you want.",
                ),
                actions: [
                    t(
                        "Help.Openings.Learn",
                        "Learn: new lines, a few at a time, shown and then played from memory.",
                    ),
                    t(
                        "Help.Openings.Review",
                        "Review: the lines whose spaced review is due today. Do it often; it is what keeps them in your memory.",
                    ),
                    t(
                        "Help.Openings.Train",
                        "Train: practice the learned lines whenever you want. “Continuous review” (in its arrow) never ends and steers towards the moves you miss most.",
                    ),
                    t(
                        "Help.Openings.Tools",
                        "“Search a move” finds a move in every section, trained or not. “Check coverage” lists opponent replies your repertoire does not answer.",
                    ),
                    t(
                        "Help.Openings.Manage",
                        "“Manage repertoires” is where you create, import PGNs, add or merge sections and see which positions are hard for you.",
                    ),
                ],
                start: t(
                    "Help.Openings.Start",
                    "Create or import a repertoire with “New repertoire or import”, then press “Learn” on one section.",
                ),
            };
        case "endgames":
            return {
                title: t("Help.Endgames.Title", "Endgames: how it works"),
                purpose: t(
                    "Help.Endgames.Purpose",
                    "Play endgame positions until you reach the goal (win or hold the draw) against the best defense. Every move is checked as you play, with the tablebase where it exists.",
                ),
                actions: [
                    t(
                        "Help.Endgames.Themes",
                        "“By theme” has the included positions grouped by type of endgame; “Random position” picks one for you.",
                    ),
                    t(
                        "Help.Endgames.Quiz",
                        "Before playing, you can guess the result with best play: it trains your judgment, not only your technique.",
                    ),
                    t(
                        "Help.Endgames.Opponent",
                        "“Practice opponent” chooses perfect defense (tablebase and engine) or a more human one (Maia).",
                    ),
                    t(
                        "Help.Endgames.Sets",
                        "“Your endgame sets” imports your own PGNs; Onyx can work out the goal of each position.",
                    ),
                    t(
                        "Help.Endgames.Mates",
                        "“Basic mates” drills mating with queen, rook, two bishops or bishop and knight, with your best time.",
                    ),
                ],
                start: t(
                    "Help.Endgames.Start",
                    "Open a theme under “By theme” and press “Random position”, or start with “Basic mates”.",
                ),
            };
        case "books":
            return {
                title: t("Help.Books.Title", "Books: how it works"),
                purpose: t(
                    "Help.Books.Purpose",
                    "Read your chess PDFs next to the board. Onyx only remembers where they are: the files are never copied or changed.",
                ),
                actions: [
                    t(
                        "Help.Books.Diagram",
                        "Double-click a diagram in the book to set it up on the board, ready to analyze.",
                    ),
                    t(
                        "Help.Books.Moves",
                        "Double-click a move in the text to play the line up to that move.",
                    ),
                    t(
                        "Help.Books.Check",
                        "“Diagrams” marks every diagram read: green is safe, orange is worth checking. If a piece is wrong, fix it and press “Use this position”: Onyx learns that book’s style.",
                    ),
                    t(
                        "Help.Books.Turn",
                        "The diagram bar says who is to move and why; change it if the book says otherwise.",
                    ),
                ],
                start: t(
                    "Help.Books.Start",
                    "Press “Add books” (or drag a PDF into the window), open it and double-click a diagram.",
                ),
            };
        case "studies":
            return {
                title: t("Help.Studies.Title", "Studies: how it works"),
                purpose: t(
                    "Help.Studies.Purpose",
                    "Keep your own analyses and annotated games, organized in studies and chapters (each chapter is an editable game). Unlike a database, a study is for working material, not for searching thousands of games.",
                ),
                actions: [
                    t(
                        "Help.Studies.Chapters",
                        "Create a study and add chapters: blank, or imported from a PGN file or pasted text.",
                    ),
                    t(
                        "Help.Studies.Open",
                        "“Open chapter” takes it to the board; your changes are saved with a history you can go back to.",
                    ),
                    t(
                        "Help.Studies.Training",
                        "“Create a training copy” turns chapters into tactics, an opening repertoire or endgame positions to practice.",
                    ),
                    t(
                        "Help.Studies.Safety",
                        "Deleted studies go to the trash; “Backup” saves the whole library in one file.",
                    ),
                ],
                start: t(
                    "Help.Studies.Start",
                    "Press “New study”, then import a PGN or add a blank chapter and open it.",
                ),
            };
        case "databases":
            return {
                title: t("Help.Databases.Title", "Databases: how it works"),
                purpose: t(
                    "Help.Databases.Purpose",
                    "Collections of games that feed the opening explorer of the board, player cards, preparation against rivals and the pattern search. Large bases (millions of games) work well.",
                ),
                actions: [
                    t(
                        "Help.Databases.Add",
                        "Add a base: download a ready-made one (“Web”) or convert your own PGN files (“Local”).",
                    ),
                    t(
                        "Help.Databases.Reference",
                        "Mark one as “Reference Database”: it is the one the board’s Database panel searches while you analyze.",
                    ),
                    t(
                        "Help.Databases.Explore",
                        "“Explore” opens its games, players and tournaments, with filters and a preview.",
                    ),
                    t(
                        "Help.Databases.Tools",
                        "Advanced tools: merge duplicated players, remove duplicate or empty games, and a quality report.",
                    ),
                ],
                start: t(
                    "Help.Databases.Start",
                    "Press “Add a database”, download one from “Web” and make it the reference; then analyze a position on the board and open its Database tab.",
                ),
            };
        case "players":
            return {
                title: t("Help.Players.Title", "Players: how it works"),
                purpose: t(
                    "Help.Players.Purpose",
                    "A card for each player you care about (you, your rivals, your students) built from their games: what they play, how they score and where they go wrong.",
                ),
                actions: [
                    t(
                        "Help.Players.Find",
                        "Find a player in your databases, or load one from Lichess or Chess.com by username.",
                    ),
                    t(
                        "Help.Players.Tabs",
                        "The tabs show the summary, games, openings and usual opponents of the player.",
                    ),
                    t(
                        "Help.Players.Prepare",
                        "“Preparation” is for a rival: their likely repertoire, key positions and a twin bot that plays like them.",
                    ),
                    t(
                        "Help.Players.Analysis",
                        "“Analysis” checks the games with the engine: recurring errors, time management and positions to train.",
                    ),
                    t(
                        "Help.Players.Filters",
                        "The filters (time control, period, color) change every tab at once.",
                    ),
                ],
                start: t(
                    "Help.Players.Start",
                    "Link your Lichess or Chess.com account in Accounts to get your own card, or search a rival and save the card.",
                ),
            };
        case "tournaments":
            return {
                title: t("Help.Tournaments.Title", "Tournaments: how it works"),
                purpose: t(
                    "Help.Tournaments.Purpose",
                    "Play full tournaments against Onyx’s human-like bots, round by round. Games between bots are simulated in an instant, so you only play yours.",
                ),
                actions: [
                    t(
                        "Help.Tournaments.Calendar",
                        "The calendar has ready events (the blitz of the day, a weekly league): press “Join”.",
                    ),
                    t(
                        "Help.Tournaments.Templates",
                        "Templates set up a field for you: everyone at your level, you as the favorite, a giant among the players…",
                    ),
                    t(
                        "Help.Tournaments.Custom",
                        "“All options” chooses the format (Swiss, round robin, knockout), the time control, the bots and whether your games count for your rating.",
                    ),
                    t(
                        "Help.Tournaments.Follow",
                        "Inside a tournament: your next game, standings, rounds and your games to analyze or export.",
                    ),
                ],
                start: t(
                    "Help.Tournaments.Start",
                    "Press “Join” on a calendar event, or “Start a tournament” from a template.",
                ),
            };
    }
}
