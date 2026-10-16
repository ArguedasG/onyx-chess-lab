/** Shared types of the repertoire generator and the surprise finder (8.5, I-40, I-33). */

export type GeneratorColor = "white" | "black";

/**
 * How the user's move is chosen at each of their turns. Every focus only considers moves the
 * engine keeps within `maxLoss` of its best move.
 */
export type GeneratorFocus =
    /** Highest score against what the Elo difference predicts (local) or score, prudently. */
    | "practical"
    /** Highest score counting draws as half, prudently (lower bound of the interval). */
    | "score"
    /** Fewest losses, prudently (upper bound of the loss rate). */
    | "solid"
    /** Fewest opponent replies to prepare for (the tree branches less). */
    | "lowTheory"
    /** The engine's best among the moves played at least `minGames` times. */
    | "engine"
    /** Positions where an opponent of the chosen Elo is least likely to keep the evaluation. */
    | "tricky"
    /** Rare moves the engine still likes, ranked by difficulty for the opponent (Novelty Grinder). */
    | "surprise";

export type StatsSourceConfig =
    | {
          kind: "lichess";
          /** Lichess explorer rating groups (1000, 1200, …, 2500). */
          ratings: number[];
          speeds: string[];
      }
    | { kind: "masters" }
    | {
          kind: "local";
          databasePath: string;
          databaseTitle: string;
          minElo?: number;
          sinceYear?: number;
          untilYear?: number;
      };

export type OpponentConfig = {
    /** "popular": the most played replies; "maia": what Maia predicts at `elo`. */
    mode: "popular" | "maia";
    maxReplies: number;
    /** Replies below this share of the games (or of Maia's samples), in percent, are left out. */
    minShare: number;
    /** Elo of the opponents for Maia and for the practical difficulty. */
    elo: number;
};

export type GeneratorConfig = {
    rootFen: string;
    /** Moves from the start of the game to the root, so the PGN starts where the board is. */
    rootMoves: string[];
    color: GeneratorColor;
    focus: GeneratorFocus;
    source: StatsSourceConfig;
    opponent: OpponentConfig;
    /** Plies below the root. */
    depth: number;
    /** Games a move needs to count as known in the source. */
    minGames: number;
    /** Largest loss against the engine's best move, in centipawns. */
    maxLoss: number;
    /** A surprise is played in at most this share of the games, in percent. */
    surpriseShare: number;
    engineMs: number;
    /** Positions the generator may expand (bounds time and Lichess requests). */
    maxPositions: number;
};

export type MoveStats = {
    games: number;
    white: number;
    draws: number;
    black: number;
    /** Rated games and the points scored and expected by the side that plays the move. */
    ratedGames?: number;
    ratedPoints?: number;
    expectedPoints?: number;
};

export type ModelGame =
    | { kind: "local"; databasePath: string; gameId: number; elo?: number }
    | { kind: "lichess"; id: string; label: string; year?: number };

export type SourceMove = MoveStats & {
    uci: string;
    san: string;
    modelGame?: ModelGame;
};

export type SourcePosition = {
    games: number;
    moves: SourceMove[];
};

/** Engine view of a position from the side to move: lines best first. */
export type EngineView = {
    lines: Array<{ uci: string; cp: number }>;
    /** Evaluation of the best line from the side to move, in centipawns (mates at ±1000). */
    bestCp: number;
};

/** Practical difficulty of a position for the side to move (I-33). */
export type Difficulty = {
    /** Chance, 0–1, that a player of the chosen Elo keeps the evaluation. */
    keepProbability: number;
    /** Moves that keep it (within the margin of the best). */
    goodMoves: string[];
    /** Where the human move frequencies came from. */
    basis: "games" | "maia";
    sample: number;
};

export type GeneratedNode = {
    fen: string;
    /** Move that led here (UCI and SAN); empty at the root. */
    uci: string;
    san: string;
    /** Whose move led here: the user's or the opponent's. */
    by: "user" | "opponent" | "root";
    stats?: MoveStats;
    /** Share of the parent's games (or Maia samples) for opponent replies, in percent. */
    share?: number;
    /** Engine evaluation after the move, from the user's side, in centipawns. */
    evalCp?: number;
    /** Loss against the engine's best move, for the user's moves. */
    loss?: number;
    /** Why the user's move was chosen. */
    reason?: "focus" | "engineFallback";
    surprise?: boolean;
    difficulty?: Difficulty;
    modelGame?: ModelGame;
    transposition?: boolean;
    children: GeneratedNode[];
};

export type GeneratorProgress = {
    phase: "source" | "engine" | "maia" | "tree" | "done";
    positions: number;
    message?: string;
};

export type GeneratedRepertoire = {
    root: GeneratedNode;
    config: GeneratorConfig;
    generatedAt: string;
    positions: number;
    lines: number;
    engineName: string;
    maiaName?: string;
    sourceSummary: string;
};
