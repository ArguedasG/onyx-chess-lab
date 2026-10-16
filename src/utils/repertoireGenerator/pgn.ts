/** PGN of a generated repertoire and of the surprises of a line, with their annotations. */
import { buildGameLinkUrl } from "@/utils/gameLinks";
import { playUci, sideToMove } from "./positions";
import { difficultyLevel, evaluationSymbol, lossGlyph, ratingPar, scorePercent } from "./scoring";
import type { Surprise } from "./surprises";
import type { Difficulty, GeneratedNode, GeneratedRepertoire, ModelGame } from "./types";

export type Translate = (
    key: string,
    fallback: string,
    options?: Record<string, unknown>,
) => string;

/** Model games of the local database, with the label and ply to link them (filled by the UI). */
export type ModelGameLabels = Map<number, { label: string; ply: number }>;

const NAG: Record<string, string> = {
    "?!": "$6",
    "?": "$2",
    "=": "$10",
    "⩲": "$14",
    "⩱": "$15",
    "±": "$16",
    "∓": "$17",
    "+−": "$18",
    "−+": "$19",
};

function clean(text: string) {
    return text.replace(/[{}]/g, "").trim();
}

function pawns(cp: number) {
    const value = cp / 100;
    return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function percent(value: number) {
    return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

export function difficultyText(value: Difficulty, elo: number, t: Translate): string {
    const level = {
        easy: t("Generator.Difficulty.Easy", "easy"),
        demanding: t("Generator.Difficulty.Demanding", "demanding"),
        trap: t("Generator.Difficulty.Trap", "a trap"),
    }[difficultyLevel(value)];
    return t(
        "Generator.Difficulty.Comment",
        "For a {{elo}} opponent: {{chance}} keep the evaluation ({{level}}; {{basis}}).",
        {
            elo,
            chance: percent(value.keepProbability * 100),
            level,
            basis:
                value.basis === "games"
                    ? t("Generator.Difficulty.FromGames", "from {{count}} games", {
                          count: value.sample,
                      })
                    : t("Generator.Difficulty.FromMaia", "Maia, {{count}} samples", {
                          count: value.sample,
                      }),
        },
    );
}

function modelGameText(
    game: ModelGame | undefined,
    labels: ModelGameLabels | undefined,
    t: Translate,
): string | null {
    if (!game) return null;
    if (game.kind === "lichess") {
        return `${t("Generator.ModelGame", "Model game")}: ${clean(game.label)}${game.year ? ` (${game.year})` : ""} https://lichess.org/${game.id}`;
    }
    const known = labels?.get(game.gameId);
    if (!known) return null;
    const url = buildGameLinkUrl({
        database: game.databasePath,
        gameId: game.gameId,
        ply: known.ply,
    });
    return `${t("Generator.ModelGame", "Model game")}: [${known.label.replace(/[[\]{}]/g, "")}](${url})`;
}

function userComment(
    node: GeneratedNode,
    result: GeneratedRepertoire,
    labels: ModelGameLabels | undefined,
    t: Translate,
): string {
    const parts: string[] = [];
    const color = result.config.color;
    if (node.stats && node.stats.games > 0) {
        const score = scorePercent(node.stats, color);
        const par = ratingPar(node.stats);
        parts.push(
            [
                t("Generator.Comment.Games", "{{count}} games", {
                    count: node.stats.games.toLocaleString(),
                }),
                score != null ? percent(score) : null,
                par != null
                    ? `${t("RatingPar.Column", "vs. expected")} ${par >= 0 ? "+" : ""}${par.toFixed(1)}`
                    : null,
            ]
                .filter(Boolean)
                .join(" · "),
        );
    }
    if (node.evalCp !== undefined)
        parts.push(`${t("Generator.Comment.Engine", "engine")} ${pawns(node.evalCp)}`);
    if (node.reason === "engineFallback")
        parts.push(t("Generator.Comment.Fallback", "Few games here: the engine's move."));
    if (node.surprise)
        parts.push(
            node.stats?.games
                ? t("Generator.Comment.Surprise", "Surprise: {{share}} of the games.", {
                      share: percent(node.share ?? 0),
                  })
                : t("Generator.Comment.Novelty", "Surprise: no games in the source."),
        );
    if (node.difficulty) parts.push(difficultyText(node.difficulty, result.config.opponent.elo, t));
    const model = modelGameText(node.modelGame, labels, t);
    if (model) parts.push(model);
    return parts.map(clean).join(". ");
}

function opponentComment(node: GeneratedNode, result: GeneratedRepertoire, t: Translate): string {
    if (node.share === undefined) return "";
    const maia = !node.stats || result.config.opponent.mode === "maia";
    return maia
        ? t("Generator.Comment.MaiaShare", "Maia {{elo}}: {{share}}", {
              elo: result.config.opponent.elo,
              share: percent(node.share),
          })
        : t("Generator.Comment.Share", "{{share}} of the games", { share: percent(node.share) });
}

function moveToken(fen: string, san: string, forceNumber: boolean) {
    const number = Number(fen.split(" ")[5] ?? 1) || 1;
    if (sideToMove(fen) === "white") return `${number}. ${san}`;
    return forceNumber ? `${number}... ${san}` : san;
}

/** Movetext of the subtree below `node` (whose FEN is the position before its children). */
function movetext(
    node: GeneratedNode,
    result: GeneratedRepertoire,
    labels: ModelGameLabels | undefined,
    t: Translate,
    forceNumber: boolean,
): string {
    if (node.children.length === 0) return "";
    const write = (child: GeneratedNode, force: boolean) => {
        const tokens = [moveToken(node.fen, child.san, force)];
        if (child.by === "user" && child.loss !== undefined) {
            const glyph = lossGlyph(child.loss);
            if (glyph) tokens.push(NAG[glyph]);
        }
        if (child.children.length === 0 && child.evalCp !== undefined) {
            const whiteCp = result.config.color === "white" ? child.evalCp : -child.evalCp;
            tokens.push(NAG[evaluationSymbol(whiteCp)]);
        }
        const comment =
            child.by === "user"
                ? userComment(child, result, labels, t)
                : opponentComment(child, result, t);
        const extra = child.transposition
            ? t("Generator.Comment.Transposition", "Transposes to a line above.")
            : "";
        const text = [comment, extra].filter(Boolean).join(". ");
        if (text) tokens.push(`{ ${clean(text)} }`);
        return tokens.join(" ");
    };
    const [main, ...alternatives] = node.children;
    let text = write(main, forceNumber);
    for (const alternative of alternatives) {
        const rest = movetext(alternative, result, labels, t, true);
        text += ` ( ${write(alternative, true)}${rest ? ` ${rest}` : ""} )`;
    }
    const rest = movetext(main, result, labels, t, alternatives.length > 0);
    return rest ? `${text} ${rest}` : text;
}

function header(name: string, value: string) {
    return `[${name} "${value.replace(/["\\]/g, "")}"]`;
}

/** Moves from the start of the board to the root, written before the generated tree. */
function prefix(startFen: string, moves: string[]) {
    let fen = startFen;
    const tokens: string[] = [];
    for (const [index, uci] of moves.entries()) {
        const played = playUci(fen, uci);
        if (!played) break;
        tokens.push(moveToken(fen, played.san, index === 0));
        fen = played.fen;
    }
    return { tokens, fen };
}

export function repertoirePgn(
    result: GeneratedRepertoire,
    options: {
        name: string;
        startFen: string;
        provenance: string;
        labels?: ModelGameLabels;
        t: Translate;
    },
): string {
    const standard = options.startFen.startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w");
    const lead = prefix(options.startFen, result.config.rootMoves);
    const headers = [
        header("Event", options.name),
        header("Site", "Onyx Chess Lab"),
        header("Date", result.generatedAt.slice(0, 10).replaceAll("-", ".")),
        header("White", result.config.color === "white" ? options.name : "?"),
        header("Black", result.config.color === "black" ? options.name : "?"),
        header("Result", "*"),
        header("Annotator", "Onyx repertoire generator"),
        ...(standard ? [] : [header("SetUp", "1"), header("FEN", options.startFen)]),
    ];
    const body = movetext(result.root, result, options.labels, options.t, lead.tokens.length > 0);
    const leadText = lead.tokens.length ? `${lead.tokens.join(" ")} ` : "";
    return `${headers.join("\n")}\n\n{ ${clean(options.provenance)} } ${leadText}${body} *\n`;
}

/**
 * The line with every surprise as a variation where it is played, Sadler-style arrows (red for a
 * move absent from the source, green for a rare one) and a comment with its numbers.
 */
export function surprisesPgn(
    line: Array<{ fen: string; played?: { uci: string; san: string } }>,
    surprises: Surprise[],
    options: { name: string; startFen: string; elo: number; provenance: string; t: Translate },
): string {
    const { t } = options;
    const byIndex = new Map<number, Surprise[]>();
    for (const surprise of surprises)
        byIndex.set(surprise.index, [...(byIndex.get(surprise.index) ?? []), surprise]);
    const tokens: string[] = [];
    let forceNumber = true;
    const describe = (surprise: Surprise) =>
        [
            surprise.kind === "novelty"
                ? t("Generator.Comment.Novelty", "Surprise: no games in the source.")
                : t("Generator.Comment.Surprise", "Surprise: {{share}} of the games.", {
                      share: percent(surprise.share),
                  }),
            `${t("Generator.Comment.Engine", "engine")} ${pawns(surprise.evalCp)}`,
            surprise.difficulty ? difficultyText(surprise.difficulty, options.elo, t) : null,
        ]
            .filter(Boolean)
            .join(". ");
    for (const [index, step] of line.entries()) {
        const here = byIndex.get(index) ?? [];
        if (here.length > 0) {
            // A comment before the move belongs to the position where the surprises are played.
            const arrows = here
                .map(
                    (surprise) =>
                        `${surprise.kind === "novelty" ? "R" : "G"}${surprise.uci.slice(0, 4)}`,
                )
                .join(",");
            tokens.push(`{ [%cal ${arrows}] }`);
            forceNumber = true;
        }
        const [first, ...others] = here;
        const main = step.played ?? (first ? { san: first.san, uci: first.uci } : null);
        if (!main) continue;
        tokens.push(moveToken(step.fen, main.san, forceNumber));
        forceNumber = false;
        if (!step.played && first) tokens.push(`{ ${clean(describe(first))} }`);
        for (const surprise of step.played ? here : others) {
            tokens.push(
                `( ${moveToken(step.fen, surprise.san, true)} { ${clean(describe(surprise))} } )`,
            );
            forceNumber = true;
        }
        if (!step.played) break;
    }
    const standard = options.startFen.startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w");
    const headers = [
        header("Event", options.name),
        header("Site", "Onyx Chess Lab"),
        header("Result", "*"),
        header("Annotator", "Onyx surprise finder"),
        ...(standard ? [] : [header("SetUp", "1"), header("FEN", options.startFen)]),
    ];
    return `${headers.join("\n")}\n\n{ ${clean(options.provenance)} } ${tokens.join(" ")} *\n`;
}
