import { useTranslation as useTrainingTranslation } from "react-i18next";
import { Box, Group, Paper, Stack, Text } from "@mantine/core";
import { IconEyeOff } from "@tabler/icons-react";
import { makeSquare, parseSquare, parseUci } from "chessops";
import { chessgroundDests } from "chessops/compat";
import { useAtomValue } from "jotai";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { BestMoves, ScoreValue } from "@/bindings";
import { Chessground } from "@/chessground/Chessground";
import Board from "@/components/boards/Board";
import MoveFeedback, {
  feedbackSquare,
  type MoveFeedbackState,
} from "@/components/boards/MoveFeedback";
import { TreeStateContext, TreeStateProvider } from "@/components/common/TreeStateContext";
import { useInitialOpponentMove } from "@/hooks/useInitialOpponentMove";
import { enginesAtom } from "@/state/atoms";
import { positionFromFen } from "@/utils/chessops";
import { getBestMovesOnce, type LocalEngine } from "@/utils/engines";
import { isMaiaEngine } from "@/utils/humanBots";
import { canonicalUci, playUci } from "@/utils/repertoireGenerator/positions";
import { formatMoveList } from "@/utils/repertoireGaps";
import { solutionLinesWith, type TacticsLoadedExercise } from "@/utils/tacticsTraining";
import type { TacticsSet } from "@/utils/trainingAreas";
import { defaultTree } from "@/utils/treeReducer";
import classes from "../TacticsSession.module.css";

/**
 * Visualization (I-38). "No pieces" hides the pieces and lists them by square; "blind" shows an
 * earlier position, lists the moves played since, and asks for the move in the real position.
 */
export type TacticsVisualization =
  | { kind: "normal" }
  | { kind: "noPieces" }
  | { kind: "blind"; fen: string; hiddenSans: string[] };

function scoreForSide(value: ScoreValue, side: "white" | "black"): number {
  const sign = side === "white" ? 1 : -1;
  if (value.type === "cp") return value.value * sign;
  if (value.type === "mate") return value.value * sign * 100000;
  return -value.value * sign;
}

function acceptsMove(
  best: BestMoves,
  candidate: BestMoves,
  side: "white" | "black",
  thresholdCp: number,
) {
  const bestValue = best.score.value;
  const candidateValue = candidate.score.value;
  if (bestValue.type === "mate") {
    return candidateValue.type === "mate" && candidateValue.value === bestValue.value;
  }
  if (candidateValue.type === "mate") {
    return scoreForSide(candidateValue, side) > scoreForSide(bestValue, side);
  }
  return scoreForSide(bestValue, side) - scoreForSide(candidateValue, side) <= thresholdCp;
}

const FIGURINES: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
};
const ROLE_ORDER = ["K", "Q", "R", "B", "N", "P"];

/** Pieces of each side by square, from a FEN: what the student sees in "no pieces". */
export function pieceList(fen: string): { white: string[]; black: string[] } {
  const rows = fen.split(" ")[0].split("/");
  const pieces: Array<{ color: "white" | "black"; role: string; square: string }> = [];
  rows.forEach((row, rowIndex) => {
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char);
        continue;
      }
      pieces.push({
        color: char === char.toUpperCase() ? "white" : "black",
        role: char.toUpperCase(),
        square: `${"abcdefgh"[file]}${8 - rowIndex}`,
      });
      file += 1;
    }
  });
  const side = (color: "white" | "black") =>
    pieces
      .filter((piece) => piece.color === color)
      .sort(
        (a, b) =>
          ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
          a.square.localeCompare(b.square),
      )
      .map((piece) => `${FIGURINES[piece.role]}${piece.square}`);
  return { white: side("white"), black: side("black") };
}

function PieceListPanel({ fen }: { fen: string }) {
  const { t: trainingT } = useTrainingTranslation();
  const list = pieceList(fen);
  return (
    <Paper withBorder p="xs" w="100%">
      <Stack gap={2}>
        <Text size="sm">
          <Text span fw={600}>
            {trainingT("Tactics.Visual.White", "White")}:
          </Text>{" "}
          {list.white.join(" ")}
        </Text>
        <Text size="sm">
          <Text span fw={600}>
            {trainingT("Tactics.Visual.Black", "Black")}:
          </Text>{" "}
          {list.black.join(" ")}
        </Text>
      </Stack>
    </Paper>
  );
}

/** Whether `uci` mates, whether or not the board already shows it played. */
function givesMate(node: { fen: string; move?: unknown }, uci: string) {
  const [current] = positionFromFen(node.fen);
  if (current?.isCheckmate()) return true;
  const after = playUci(node.fen, uci);
  return Boolean(after && positionFromFen(after.fen)[0]?.isCheckmate());
}

/**
 * Blind view (I-38): the board stays frozen on an earlier position while the student plays the
 * whole line on the real one, which lies on top with its pieces invisible. A piece is picked up
 * where it really is (its legal squares show), only the dragged piece is visible, and every move
 * since the picture is written below; the opponent's last move is also drawn as an arrow.
 */
function BlindBoard({
  frozenFen,
  hiddenSans,
  orientation,
  movable,
  boardRef,
  onMove,
  feedback,
}: {
  frozenFen: string;
  hiddenSans: string[];
  orientation: "white" | "black";
  movable: boolean;
  boardRef: React.RefObject<HTMLDivElement | null>;
  onMove: (uci: string) => void;
  feedback: MoveFeedbackState | null;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const store = useContext(TreeStateContext)!;
  const rootFen = useStore(store, (state) => state.root.fen);
  const currentFen = useStore(store, (state) => state.currentNode().fen);
  const shapes = useStore(store, (state) => state.currentNode().shapes);
  const lastMove = useStore(store, (state) => state.currentNode().move);
  const playedSans = useStore(
    store,
    useShallow((state) => {
      const sans: string[] = [];
      let node = state.root;
      for (const index of state.position) {
        node = node.children[index];
        if (!node?.san) break;
        sans.push(node.san);
      }
      return sans;
    }),
  );
  const [position] = positionFromFen(currentFen);
  const turn = position?.turn ?? "white";
  const dests = position ? chessgroundDests(position) : new Map();
  // The picture is the exercise's own starting position for puzzles (the hidden move is then the
  // first one played); for exercises from games it is some moves earlier.
  const moveList =
    frozenFen === rootFen
      ? formatMoveList(rootFen, playedSans)
      : [formatMoveList(frozenFen, hiddenSans), formatMoveList(rootFen, playedSans)]
          .filter(Boolean)
          .join("  ");
  // Whose move was last: when the student is to move, it was the opponent's.
  const opponentArrow =
    lastMove && "from" in lastMove && turn === orientation
      ? [{ orig: makeSquare(lastMove.from), dest: makeSquare(lastMove.to), brush: "red" as const }]
      : [];

  return (
    <Stack gap="sm" w="100%" h="100%" align="center">
      {/* The square fits the space left by the move panel, by width or by height, so it never
          spills over the panel below. */}
      <Box
        style={{
          flex: 1,
          // A size container has no height of its own; this keeps a usable board if the
          // column ever loses its fixed height.
          minHeight: 240,
          width: "100%",
          containerType: "size",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Box
          ref={boardRef}
          pos="relative"
          style={{ aspectRatio: 1, width: "min(100cqw, 100cqh)", flexShrink: 0 }}
        >
          <Box pos="absolute" inset={0}>
            <Chessground
              fen={frozenFen}
              orientation={orientation}
              coordinates
              viewOnly
              drawable={{
                enabled: false,
                visible: true,
                autoShapes: [...shapes, ...opponentArrow],
              }}
            />
          </Box>
          <Box pos="absolute" inset={0} className={classes.blindOverlay}>
            <Chessground
              fen={currentFen}
              orientation={orientation}
              coordinates={false}
              turnColor={turn}
              animation={{ enabled: false }}
              highlight={{ lastMove: false, check: false }}
              drawable={{ enabled: false, visible: false }}
              movable={{
                free: false,
                color: movable ? turn : undefined,
                dests,
                showDests: true,
                events: {
                  after: (orig, dest) => {
                    const piece = position?.board.get(parseSquare(orig)!);
                    const promotes = piece?.role === "pawn" && (dest[1] === "8" || dest[1] === "1");
                    onMove(`${orig}${dest}${promotes ? "q" : ""}`);
                  },
                },
              }}
            />
          </Box>
          <MoveFeedback board={boardRef.current} feedback={feedback} orientation={orientation} />
        </Box>
      </Box>
      {/* Wide and short: the board keeps the height. */}
      <Paper withBorder px="sm" py={6} w="100%" maw={960} style={{ flexShrink: 0 }}>
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <IconEyeOff size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Group gap="sm" wrap="wrap">
              <Text size="sm" fw={600}>
                {trainingT("Tactics.Visual.BlindTitle", "Played since this position")}
              </Text>
              <Text size="sm" ff="monospace">
                {moveList || "—"}
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {trainingT(
                "Tactics.Visual.BlindHelp",
                "The pieces stay where the picture shows them. Pick each piece up from where it really is now: its squares light up. The opponent's last move is the red arrow.",
              )}
            </Text>
          </Stack>
        </Group>
      </Paper>
    </Stack>
  );
}

export function GuidedTacticsBoard({
  exercise,
  startingActor,
  disabled,
  variationSeed,
  hintRequest,
  visualization = { kind: "normal" },
  onUserMove,
  onCorrect,
  onIncorrect,
}: {
  exercise: Pick<TacticsLoadedExercise, "fen" | "solutionLines">;
  startingActor: TacticsSet["config"]["startingActor"];
  disabled: boolean;
  variationSeed: number;
  hintRequest: number;
  visualization?: TacticsVisualization;
  onUserMove: () => void;
  onCorrect: (lastMove: string) => void;
  onIncorrect: (move: string) => void;
}) {
  const initial = useMemo(() => {
    const tree = defaultTree(exercise.fen);
    const sideToMove = exercise.fen.split(" ")[1] === "b" ? "black" : "white";
    tree.headers.orientation =
      startingActor === "student" ? sideToMove : sideToMove === "white" ? "black" : "white";
    return tree;
  }, [exercise.fen, startingActor]);

  return (
    <TreeStateProvider initial={initial}>
      <GuidedTacticsBoardInner
        lines={exercise.solutionLines}
        startingActor={startingActor}
        disabled={disabled}
        variationSeed={variationSeed}
        hintRequest={hintRequest}
        visualization={visualization}
        onUserMove={onUserMove}
        onCorrect={onCorrect}
        onIncorrect={onIncorrect}
      />
    </TreeStateProvider>
  );
}

function GuidedTacticsBoardInner({
  lines,
  startingActor,
  disabled,
  variationSeed,
  hintRequest,
  visualization,
  onUserMove,
  onCorrect,
  onIncorrect,
}: {
  lines: string[][];
  startingActor: TacticsSet["config"]["startingActor"];
  disabled: boolean;
  variationSeed: number;
  hintRequest: number;
  visualization: TacticsVisualization;
  onUserMove: () => void;
  onCorrect: (lastMove: string) => void;
  onIncorrect: (move: string) => void;
}) {
  const store = useContext(TreeStateContext)!;
  const makeMove = useStore(store, (state) => state.makeMove);
  const setShapes = useStore(store, (state) => state.setShapes);
  const currentFen = useStore(store, (state) => state.currentNode().fen);
  // A remounted board starts without hints even if the parent counter is already non-zero.
  const handledHint = useRef(hintRequest);
  const boardRef = useRef<HTMLDivElement>(null);
  const candidates = useRef(lines);
  const ply = useRef(0);
  const [autoMoving, setAutoMoving] = useState(false);
  const completed = useRef(false);
  const opponentMoveInFlight = useRef(false);
  const [feedback, setFeedback] = useState<MoveFeedbackState | null>(null);
  const orientation = useStore(store, (state) => state.headers.orientation) ?? "white";
  const blind = visualization.kind === "blind";
  const blindBoardRef = useRef<HTMLDivElement>(null);
  const showFeedback = (uci: string, correct: boolean, persistent = false) =>
    setFeedback({ square: feedbackSquare(uci), correct, persistent, key: Date.now() });

  const playOpponent = useCallback(async () => {
    if (completed.current || disabled || opponentMoveInFlight.current) return;
    const replies = Array.from(
      new Set(candidates.current.map((line) => line[ply.current]).filter(Boolean)),
    );
    if (replies.length === 0) {
      completed.current = true;
      onCorrect(candidates.current[0]?.[ply.current - 1] ?? "");
      return;
    }
    const reply = replies[variationSeed % replies.length];
    const move = parseUci(reply);
    if (!move) return;
    opponentMoveInFlight.current = true;
    setAutoMoving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      candidates.current = candidates.current.filter((line) => line[ply.current] === reply);
      makeMove({ payload: move, mainline: true, changeHeaders: false });
      ply.current += 1;
      if (candidates.current.some((line) => line.length === ply.current)) {
        completed.current = true;
        onCorrect(reply);
      }
    } finally {
      opponentMoveInFlight.current = false;
      setAutoMoving(false);
    }
  }, [disabled, makeMove, onCorrect, variationSeed]);

  // Blind plays on the real position too, only out of sight: the opponent's first move is made
  // as usual and announced over the frozen picture.
  useInitialOpponentMove(startingActor, playOpponent);

  // Progressive hint as in the puzzle trainer: mark the piece, then show the move, then clear.
  useEffect(() => {
    if (hintRequest === handledHint.current) return;
    handledHint.current = hintRequest;
    if (completed.current || opponentMoveInFlight.current) return;
    const expected = parseUci(candidates.current[0]?.[ply.current] ?? "");
    if (!expected || !("from" in expected)) return;
    const from = makeSquare(expected.from);
    const to = makeSquare(expected.to);
    const shapes = store.getState().currentNode().shapes;
    const isHint = (shape: (typeof shapes)[number]) =>
      shape.orig === from && (!shape.dest || shape.dest === to);
    if (shapes.some((shape) => shape.orig === from && shape.dest === to)) {
      setShapes(shapes.filter((shape) => !isHint(shape)));
    } else if (shapes.some((shape) => shape.orig === from && !shape.dest)) {
      setShapes([
        ...shapes.filter((shape) => !isHint(shape)),
        { orig: from, dest: to, brush: "green" },
      ]);
    } else {
      setShapes([...shapes, { orig: from, dest: undefined, brush: "green" }]);
    }
  }, [hintRequest, setShapes, store]);

  const linesWith = (uci: string) =>
    solutionLinesWith(store.getState().root.fen, candidates.current, ply.current, uci);

  function handleMove(uci: string) {
    if (completed.current || disabled || autoMoving) return;
    onUserMove();
    const matching = linesWith(uci);
    if (matching.length === 0) {
      completed.current = true;
      // Like Lichess, any mate is a correct answer, even if the record has another one.
      if (givesMate(store.getState().currentNode(), uci)) {
        showFeedback(uci, true, true);
        onCorrect(uci);
        return;
      }
      showFeedback(uci, false, true);
      onIncorrect(uci);
      return;
    }
    candidates.current = matching;
    ply.current += 1;
    if (matching.some((line) => line.length === ply.current)) {
      completed.current = true;
      showFeedback(uci, true, true);
      onCorrect(uci);
      return;
    }
    showFeedback(uci, true);
    void playOpponent();
  }

  /** A move dropped on the invisible real board of the blind view. */
  function playBlindMove(uci: string) {
    if (completed.current || disabled || autoMoving) return;
    const move = parseUci(uci);
    const matching = linesWith(uci);
    // Only correct moves enter the tree: a wrong one ends the exercise where it was.
    if (move && matching.length > 0)
      makeMove({ payload: move, mainline: true, changeHeaders: false });
    handleMove(uci);
  }

  if (blind && visualization.kind === "blind") {
    return (
      <BlindBoard
        frozenFen={visualization.fen}
        hiddenSans={visualization.hiddenSans}
        orientation={orientation}
        movable={!disabled && !autoMoving && !completed.current}
        boardRef={blindBoardRef}
        onMove={playBlindMove}
        feedback={feedback}
      />
    );
  }

  const board = (
    <>
      <Board
        editingMode={false}
        movable={disabled || autoMoving ? "none" : "turn"}
        boardRef={boardRef}
        onMove={handleMove}
      />
      <MoveFeedback board={boardRef.current} feedback={feedback} orientation={orientation} />
    </>
  );
  if (visualization.kind !== "noPieces") return board;
  return (
    <Stack h="100%" w="100%" gap="xs">
      <Box
        className={classes.noPieces}
        style={{ flex: 1, minHeight: 0, width: "100%", position: "relative" }}
      >
        {board}
      </Box>
      <PieceListPanel fen={currentFen} />
    </Stack>
  );
}

export function EngineTacticsBoard({
  exercise,
  set,
  disabled,
  onUserMove,
  onResult,
}: {
  exercise: TacticsLoadedExercise;
  set: TacticsSet;
  disabled: boolean;
  onUserMove: () => void;
  onResult: (
    outcome: "correct" | "incorrect" | "unsupported",
    playedMove: string | null,
    feedback: string,
  ) => void;
}) {
  const { t: trainingT } = useTrainingTranslation();

  const storedEngines = useAtomValue(enginesAtom);
  const engines = useMemo(() => storedEngines ?? [], [storedEngines]);
  const [busy, setBusy] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<MoveFeedbackState | null>(null);

  async function evaluateMove(playedMove: string) {
    if (busy || disabled) return;
    onUserMove();
    const localEngines = engines.filter(
      (engine): engine is LocalEngine =>
        engine.type === "local" && Boolean(engine.path) && !isMaiaEngine(engine),
    );
    const localEngine =
      localEngines.find((engine) => /stockfish/i.test(engine.name)) ?? localEngines[0];
    if (!localEngine) {
      onResult(
        "unsupported",
        playedMove,
        trainingT(
          "Training.Copy.SetupStockfishoranother.cb95b179",
          "Set up Stockfish or another local engine to validate this puzzle.",
        ),
      );
      return;
    }

    setBusy(true);
    try {
      const bestMoves = await getBestMovesOnce(
        localEngine,
        { t: "Depth", c: 18 },
        { fen: exercise.fen, moves: [], extraOptions: [{ name: "MultiPV", value: "8" }] },
      );
      // Engines write castling as "e1g1"; the board may send "e1h1" (king dropped on the rook).
      const played = canonicalUci(exercise.fen, playedMove) ?? playedMove;
      const candidate = bestMoves.find((line) => line.uciMoves[0] === played);
      const side = exercise.fen.split(" ")[1] === "b" ? "black" : "white";
      const correct = Boolean(
        candidate &&
        bestMoves[0] &&
        acceptsMove(bestMoves[0], candidate, side, set.config.acceptanceThresholdCp),
      );
      setFeedback({
        square: feedbackSquare(playedMove),
        correct,
        persistent: true,
        key: Date.now(),
      });
      onResult(
        correct ? "correct" : "incorrect",
        playedMove,
        correct
          ? trainingT(
              "Training.Copy.Moveacceptedbytheengine.e7c93b94",
              "Move accepted by the engine.",
            )
          : "",
      );
    } catch (error) {
      onResult(
        "unsupported",
        playedMove,
        error instanceof Error
          ? error.message
          : trainingT(
              "Training.Copy.Couldnotquerytheengine.de1b61cd",
              "Could not query the engine.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  const initial = useMemo(() => defaultTree(exercise.fen), [exercise.fen]);
  return (
    <TreeStateProvider initial={initial}>
      <Board
        editingMode={false}
        movable={busy || disabled ? "none" : "turn"}
        boardRef={boardRef}
        onMove={(move) => void evaluateMove(move)}
      />
      <MoveFeedback
        board={boardRef.current}
        feedback={feedback}
        // The engine-validated board keeps the tree's default (white-side) orientation.
        orientation={initial.headers.orientation ?? "white"}
      />
    </TreeStateProvider>
  );
}
