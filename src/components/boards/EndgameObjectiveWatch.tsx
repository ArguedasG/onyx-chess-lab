import { Alert, Badge, Button, Group, Loader, Paper, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconRefresh, IconScale } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, events, type GameMove, type ScoreValue } from "@/bindings";
import { positionFromFen } from "@/utils/chessops";
import { type Engine, getBestMovesOnce, type LocalEngine } from "@/utils/engines";
import { isMaiaEngine } from "@/utils/humanBots";
import {
  applyCheck,
  engineVerdict,
  initialWatchState,
  outcomeFromScore,
  outcomeFromTablebase,
  rewindWatch,
  tablebaseVerdict,
  type EndgameOutcome,
  type EndgameVerdict,
  type ObjectiveWatchState,
} from "@/utils/endgameVerdict";
import { getTablebaseInfo } from "@/utils/lichess/api";
import type { EndgameStudentColor, TrainingObjective } from "@/utils/trainingAreas";

const TABLEBASE_MAX_PIECES = 7;
/** Bounded searches: short, one thread, little memory, so the board never waits for them. */
const CHECK_TIME_MS = 700;
const VERDICT_TIME_MS = 1500;
const LIGHT_ENGINE_OPTIONS = [
  { name: "Threads", value: "1" },
  { name: "Hash", value: "32" },
  { name: "MultiPV", value: "1" },
];

/** Stockfish (or another objective local engine) for the checks; never Maia. */
export function findObjectiveEngine(engines: Engine[] | null | undefined): LocalEngine | null {
  const local = (engines ?? []).filter(
    (engine): engine is LocalEngine =>
      engine.type === "local" &&
      Boolean(engine.path) &&
      Boolean(engine.loaded) &&
      !isMaiaEngine(engine),
  );
  return local.find((engine) => /stockfish/i.test(engine.name)) ?? local[0] ?? null;
}

function pieceCount(fen: string) {
  return positionFromFen(fen)[0]?.board.occupied.size() ?? 99;
}

function sideToMove(fen: string): EndgameStudentColor {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

async function engineScore(engine: LocalEngine, fen: string, timeMs: number) {
  const lines = await getBestMovesOnce(
    engine,
    { t: "Time", c: timeMs },
    { fen, moves: [], extraOptions: LIGHT_ENGINE_OPTIONS },
    timeMs + 6_000,
  );
  return lines[0]?.score.value ?? null;
}

type WatchOptions = {
  gameId: string | null;
  active: boolean;
  startFen: string;
  studentColor: EndgameStudentColor | undefined;
  objective: TrainingObjective;
  /** The opponent is an objective engine (not Maia): its own score of each reply is usable. */
  trustOpponentEval: boolean;
  /** Engine for the checks the opponent cannot provide. */
  engine: LocalEngine | null;
};

/**
 * Checks after each student move whether the endgame objective is still reachable (I-07).
 *
 * Nothing here blocks the board. With the best defense as opponent each reply already carries
 * the tablebase category or the score of the opponent's own search, so the check is free. Only
 * otherwise (Maia as opponent) does it ask the tablebase or a short single-thread search, one at
 * a time and always for the newest position: a check overtaken by a newer move is dropped.
 */
export function useEndgameObjectiveWatch({
  gameId,
  active,
  startFen,
  studentColor,
  objective,
  trustOpponentEval,
  engine,
}: WatchOptions) {
  const [state, setState] = useState<ObjectiveWatchState>(() => initialWatchState(0));
  const [checking, setChecking] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [moves, setMoves] = useState<GameMove[]>([]);
  const startScoreRef = useRef<ScoreValue | null>(null);
  const busyRef = useRef(false);
  const wantedRef = useRef<{ ply: number; fen: string } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const enabled = active && Boolean(studentColor) && objective !== "unknown";

  // A new game (or a retry after the end) starts a new watch. The game id is reused by every game
  // of a tab, so going back to the setup also counts as a new game.
  useEffect(() => {
    if (enabled) return;
    setState(initialWatchState(0));
    setMoves([]);
    setDismissedAt(null);
    wantedRef.current = null;
    startScoreRef.current = null;
  }, [gameId, enabled]);

  // The engine does not see some wins clearly; its view of the start sets how much drop counts.
  useEffect(() => {
    if (!enabled || !engine || pieceCount(startFen) <= TABLEBASE_MAX_PIECES) return;
    let cancelled = false;
    engineScore(engine, startFen, CHECK_TIME_MS)
      .then((score) => {
        if (!cancelled) startScoreRef.current = score;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, engine, startFen]);

  const record = useCallback(
    (ply: number, verdict: EndgameVerdict) => {
      setState((current) =>
        applyCheck(current, { ply, verdict }, objective, startScoreRef.current),
      );
    },
    [objective],
  );

  const runQueued = useCallback(async () => {
    if (busyRef.current || !studentColor) return;
    busyRef.current = true;
    setChecking(true);
    try {
      while (wantedRef.current) {
        const { ply, fen } = wantedRef.current;
        wantedRef.current = null;
        if (stateRef.current.last && ply <= stateRef.current.last.ply) continue;
        let verdict: EndgameVerdict | null = null;
        if (pieceCount(fen) <= TABLEBASE_MAX_PIECES) {
          try {
            const data = await getTablebaseInfo(fen);
            verdict = tablebaseVerdict(data.category, sideToMove(fen), studentColor, objective);
          } catch {
            verdict = null;
          }
        }
        if ((!verdict || verdict.reachable === null) && engine) {
          try {
            const score = await engineScore(engine, fen, CHECK_TIME_MS);
            if (score)
              verdict = engineVerdict(score, studentColor, objective, startScoreRef.current);
          } catch {
            verdict = null;
          }
        }
        // A newer move arrived meanwhile: this answer is stale, the loop takes the newest.
        if (verdict && !wantedRef.current) record(ply, verdict);
      }
    } finally {
      busyRef.current = false;
      setChecking(false);
    }
  }, [engine, objective, record, studentColor]);

  const handleMoves = useCallback(
    (nextMoves: GameMove[]) => {
      if (!studentColor) return;
      setMoves(nextMoves);
      const startPly = nextMoves.filter((move) => move.source === "initial").length;
      setState((current) => {
        if (current.last === null && current.retryPly < startPly) {
          return initialWatchState(startPly);
        }
        return current.last && current.last.ply > nextMoves.length
          ? rewindWatch(current, nextMoves.length)
          : current;
      });
      const lastChecked = Math.max(stateRef.current.last?.ply ?? 0, startPly);
      let newest: { ply: number; fen: string } | null = null;
      for (let index = lastChecked; index < nextMoves.length; index++) {
        const move = nextMoves[index];
        if (move.color !== studentColor || move.source !== "human") continue;
        const ply = index + 1;
        const reply = nextMoves[index + 1];
        if (reply?.tablebaseCategory) {
          record(
            ply,
            tablebaseVerdict(
              reply.tablebaseCategory,
              sideToMove(move.fenAfter),
              studentColor,
              objective,
            ),
          );
          newest = null;
        } else if (trustOpponentEval && reply?.engineEval) {
          record(
            ply,
            engineVerdict(reply.engineEval, studentColor, objective, startScoreRef.current),
          );
          newest = null;
        } else if (!trustOpponentEval) {
          // The best defense brings its own check with the reply; otherwise ask, but only about
          // the newest position.
          newest = { ply, fen: move.fenAfter };
        }
      }
      if (newest) {
        wantedRef.current = newest;
        void runQueued();
      }
    },
    [objective, record, runQueued, studentColor, trustOpponentEval],
  );

  useEffect(() => {
    if (!enabled || !gameId) return;
    const unlisten = events.gameMoveEvent.listen(({ payload }) => {
      if (payload.gameId === gameId) handleMoves(payload.moves);
    });
    const unlistenOver = events.gameOverEvent.listen(({ payload }) => {
      if (payload.gameId === gameId) setMoves(payload.moves);
    });
    return () => {
      void unlisten.then((stop) => stop());
      void unlistenOver.then((stop) => stop());
    };
  }, [enabled, gameId, handleMoves]);

  const retry = useCallback(async () => {
    if (!gameId) return;
    const ply = stateRef.current.retryPly;
    const result = await commands.rewindGame(gameId, ply);
    if (result.status === "ok") {
      setState((current) => rewindWatch(current, ply));
      setDismissedAt(null);
    }
  }, [gameId]);

  const currentFen = moves.length > 0 ? moves[moves.length - 1].fenAfter : startFen;

  return {
    enabled,
    state,
    checking,
    moves,
    currentFen,
    showWarning: state.lostAtPly !== null && dismissedAt !== state.lostAtPly,
    dismiss: () => setDismissedAt(state.lostAtPly),
    retry,
  };
}

export type EndgameObjectiveWatch = ReturnType<typeof useEndgameObjectiveWatch>;

/** «Move 34» label of the student's move that follows `ply` moves from the start position. */
export function moveNumberAfter(startFen: string, ply: number) {
  const parts = startFen.split(" ");
  const fullmove = Number(parts[5]) || 1;
  const blackFirst = parts[1] === "b";
  return fullmove + Math.floor((ply + (blackFirst ? 1 : 0)) / 2);
}

type CurrentVerdict = {
  fen: string;
  outcome: EndgameOutcome | null;
  winner: "white" | "black" | "draw" | null;
  source: "tablebase" | "engine";
  detail: string | null;
};

export function EndgameObjectivePanel({
  watch,
  startFen,
  studentColor,
  objective,
  engine,
  playing,
}: {
  watch: EndgameObjectiveWatch;
  startFen: string;
  studentColor: EndgameStudentColor;
  objective: TrainingObjective;
  engine: LocalEngine | null;
  playing: boolean;
}) {
  const { t } = useTranslation();
  const [verdict, setVerdict] = useState<CurrentVerdict | null>(null);
  const [verdictBusy, setVerdictBusy] = useState(false);
  const [verdictError, setVerdictError] = useState(false);
  const { state } = watch;
  const lastVerdict = state.last?.verdict;
  const exact = lastVerdict?.source === "tablebase";

  async function askVerdict() {
    const fen = watch.currentFen;
    setVerdictBusy(true);
    setVerdictError(false);
    try {
      const mover = sideToMove(fen);
      if (pieceCount(fen) <= TABLEBASE_MAX_PIECES) {
        try {
          const data = await getTablebaseInfo(fen);
          const forWhite = outcomeFromTablebase(data.category, mover, "white");
          if (forWhite) {
            setVerdict({
              fen,
              outcome: outcomeFromTablebase(data.category, mover, studentColor),
              winner: forWhite === "win" ? "white" : forWhite === "loss" ? "black" : "draw",
              source: "tablebase",
              detail:
                data.dtm !== null && data.dtm !== undefined && data.dtm !== 0
                  ? t("Endgame.Verdict.Dtm", "mate in {{count}}", {
                      count: Math.ceil(Math.abs(data.dtm) / 2),
                    })
                  : null,
            });
            return;
          }
        } catch {
          // Without connection the engine answers instead.
        }
      }
      if (!engine) throw new Error("no engine");
      const score = await engineScore(engine, fen, VERDICT_TIME_MS);
      if (!score) throw new Error("no score");
      const forWhite = outcomeFromScore(score);
      setVerdict({
        fen,
        outcome: outcomeFromScore(studentColor === "white" ? score : negate(score)),
        winner: forWhite === "win" ? "white" : forWhite === "loss" ? "black" : "draw",
        source: "engine",
        detail:
          score.type === "mate"
            ? `#${score.value}`
            : `${score.value > 0 ? "+" : ""}${(score.value / 100).toFixed(1)}`,
      });
    } catch {
      setVerdictError(true);
    } finally {
      setVerdictBusy(false);
    }
  }

  const verdictIsCurrent = verdict?.fen === watch.currentFen;
  const winnerLabel = (winner: CurrentVerdict["winner"]) =>
    winner === "white"
      ? t("Endgame.Verdict.WhiteWins", "White wins")
      : winner === "black"
        ? t("Endgame.Verdict.BlackWins", "Black wins")
        : t("Endgame.Verdict.Draw", "Draw");

  const lostTitle =
    objective === "win"
      ? exact
        ? t("Endgame.Watch.WinLost", "The win is gone")
        : t("Endgame.Watch.WinProbablyLost", "The win is probably gone")
      : exact
        ? t("Endgame.Watch.DrawLost", "The draw is gone")
        : t("Endgame.Watch.DrawProbablyLost", "The draw is probably gone");

  const retryMove = moveNumberAfter(startFen, state.retryPly);

  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            {watch.checking ? (
              <Loader size={14} />
            ) : state.lostAtPly !== null ? (
              <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" />
            ) : state.last ? (
              <IconCheck size={16} color="var(--mantine-color-teal-6)" />
            ) : null}
            <Text size="sm" fw={500}>
              {watch.checking
                ? t("Endgame.Watch.Checking", "Checking your move…")
                : state.lostAtPly !== null
                  ? lostTitle
                  : state.last
                    ? objective === "win"
                      ? t("Endgame.Watch.StillWinning", "Still winning")
                      : objective === "draw"
                        ? t("Endgame.Watch.StillDrawing", "Still a draw")
                        : t("Endgame.Watch.Resisting", "Keep resisting")
                    : t("Endgame.Watch.Waiting", "Each move will be checked")}
            </Text>
            {state.last && !watch.checking && (
              <Badge size="xs" variant="light" color={exact ? "teal" : "gray"}>
                {exact
                  ? t("Endgame.Watch.Tablebase", "Tablebase")
                  : t("Endgame.Watch.Engine", "Engine")}
              </Badge>
            )}
          </Group>
          <Button
            size="compact-sm"
            variant="default"
            leftSection={<IconScale size={14} />}
            loading={verdictBusy}
            onClick={() => void askVerdict()}
          >
            {t("Endgame.Verdict.Button", "Verdict")}
          </Button>
        </Group>

        {verdictIsCurrent && verdict && (
          <Text size="xs" c="dimmed">
            {verdict.source === "engine"
              ? t("Endgame.Verdict.Probably", "Probably: {{result}}", {
                  result: winnerLabel(verdict.winner),
                })
              : winnerLabel(verdict.winner)}
            {verdict.detail ? ` · ${verdict.detail}` : ""}
            {" · "}
            {verdict.source === "tablebase"
              ? t("Endgame.Watch.Tablebase", "Tablebase")
              : t("Endgame.Watch.Engine", "Engine")}
          </Text>
        )}
        {verdictError && (
          <Text size="xs" c="dimmed">
            {t(
              "Endgame.Verdict.Unavailable",
              "The verdict is not available: no tablebase connection and no local engine.",
            )}
          </Text>
        )}

        {watch.showWarning && playing && (
          <Alert color="orange" variant="light" p="xs">
            <Stack gap={6}>
              <Text size="sm">
                {exact
                  ? t(
                      "Endgame.Watch.LostDescExact",
                      "Against the best defense the objective can no longer be reached.",
                    )
                  : t(
                      "Endgame.Watch.LostDescEngine",
                      "The engine no longer sees the objective as reachable against the best defense.",
                    )}
              </Text>
              <Group gap="xs">
                <Button
                  size="compact-sm"
                  color="orange"
                  leftSection={<IconRefresh size={14} />}
                  onClick={() => void watch.retry()}
                >
                  {t("Endgame.Watch.RetryFrom", "Retry from move {{move}}", { move: retryMove })}
                </Button>
                <Button size="compact-sm" variant="subtle" color="gray" onClick={watch.dismiss}>
                  {t("Endgame.Watch.KeepPlaying", "Keep playing")}
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}

function negate(score: ScoreValue): ScoreValue {
  return { type: score.type, value: -score.value } as ScoreValue;
}
