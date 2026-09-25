import { Alert, Button, Group, Loader, Modal, Paper, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconEye } from "@tabler/icons-react";
import { parseUci } from "chessops";
import { useAtomValue } from "jotai";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation as useTrainingTranslation } from "react-i18next";
import { useStore } from "zustand";
import Board from "@/components/boards/Board";
import { TreeStateContext, TreeStateProvider } from "@/components/common/TreeStateContext";
import { enginesAtom } from "@/state/atoms";
import { getBestMovesOnce, type LocalEngine } from "@/utils/engines";
import { isMaiaEngine } from "@/utils/humanBots";
import {
  describeTacticsSolution,
  getPreparedSolutionLine,
  type TacticsSolutionLine,
} from "@/utils/tacticsSolution";
import type { TacticsLoadedExercise } from "@/utils/tacticsTraining";
import type { TacticsSet } from "@/utils/trainingAreas";
import { defaultTree } from "@/utils/treeReducer";

type Props = {
  opened: boolean;
  exercise: TacticsLoadedExercise;
  set: TacticsSet;
  onClose: () => void;
  onReveal: () => void;
};

export default function TacticsSolutionModal({ opened, exercise, set, onClose, onReveal }: Props) {
  const { t } = useTrainingTranslation();
  const storedEngines = useAtomValue(enginesAtom);
  const engines = useMemo(() => storedEngines ?? [], [storedEngines]);
  const [solution, setSolution] = useState<TacticsSolutionLine | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const revealRecorded = useRef(false);

  useEffect(() => {
    if (!opened) return;
    setSolution(null);
    setLoading(false);
    setError("");
    revealRecorded.current = false;
  }, [exercise.id, opened]);

  async function revealSolution() {
    if (loading || solution) return;
    setLoading(true);
    setError("");
    try {
      const prepared = getPreparedSolutionLine(exercise.solutionLines);
      let resolved: TacticsSolutionLine;
      if (prepared) {
        resolved = describeTacticsSolution(exercise.fen, prepared);
      } else {
        const localEngines = engines.filter(
          (engine): engine is LocalEngine =>
            engine.type === "local" && Boolean(engine.path) && !isMaiaEngine(engine),
        );
        const engine =
          localEngines.find((candidate) => /stockfish/i.test(candidate.name)) ?? localEngines[0];
        if (!engine) {
          throw new Error(
            t(
              "Training.Tactics.Solution.EngineMissing",
              "Set up Stockfish or another objective local engine to calculate this solution.",
            ),
          );
        }
        const bestMoves = await getBestMovesOnce(
          engine,
          { t: "Depth", c: 18 },
          { fen: exercise.fen, moves: [], extraOptions: [{ name: "MultiPV", value: "1" }] },
        );
        const best = bestMoves[0];
        if (!best?.uciMoves.length) {
          throw new Error(
            t(
              "Training.Tactics.Solution.EngineEmpty",
              "The engine did not return a solution for this position.",
            ),
          );
        }
        resolved = describeTacticsSolution(exercise.fen, best.uciMoves, best.sanMoves);
      }

      if (!revealRecorded.current) {
        revealRecorded.current = true;
        onReveal();
      }
      setSolution(resolved);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Training.Tactics.Solution.Error", "The solution could not be displayed."),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={() => !loading && onClose()}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
      title={t("Training.Tactics.Solution.Title", "View solution")}
      size={solution ? "lg" : "sm"}
    >
      {solution ? (
        <Stack>
          <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
            {t(
              "Training.Tactics.Solution.Recorded",
              "This help was recorded as a failed attempt. Observe the line, then close this window and reproduce it on the board.",
            )}
          </Alert>
          <SolutionReplayBoard
            fen={exercise.fen}
            line={solution.uciMoves}
            startingActor={set.config.startingActor}
          />
          <Paper withBorder p="sm">
            <Text fw={600} size="sm">
              {t("Training.Tactics.Solution.PrincipalLine", "Principal solution")}
            </Text>
            <Text mt={4}>{solution.sanMoves.join(" ")}</Text>
          </Paper>
          <Group justify="flex-end">
            <Button onClick={onClose}>
              {t("Training.Tactics.Solution.Practice", "Practice solution")}
            </Button>
          </Group>
        </Stack>
      ) : loading ? (
        <Stack align="center" py="lg">
          <Loader />
          <Text c="dimmed" ta="center">
            {getPreparedSolutionLine(exercise.solutionLines)
              ? t("Training.Tactics.Solution.Preparing", "Preparing the solution…")
              : t("Training.Tactics.Solution.Calculating", "Calculating the solution locally…")}
          </Text>
        </Stack>
      ) : (
        <Stack>
          <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
            {t(
              "Training.Tactics.Solution.Confirm",
              "Are you sure? Viewing the solution will count as a failed attempt, and you will still need to reproduce the line correctly.",
            )}
          </Alert>
          {error && <Alert color="red">{error}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t("Common.Cancel", "Cancel")}
            </Button>
            <Button color="orange" leftSection={<IconEye size={16} />} onClick={revealSolution}>
              {error
                ? t("Training.Tactics.Solution.TryAgain", "Try again")
                : t("Training.Tactics.Solution.ConfirmAction", "View anyway")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function SolutionReplayBoard({
  fen,
  line,
  startingActor,
}: {
  fen: string;
  line: string[];
  startingActor: TacticsSet["config"]["startingActor"];
}) {
  const initial = useMemo(() => {
    const tree = defaultTree(fen);
    const sideToMove = fen.split(" ")[1] === "b" ? "black" : "white";
    tree.headers.orientation =
      startingActor === "student" ? sideToMove : sideToMove === "white" ? "black" : "white";
    return tree;
  }, [fen, startingActor]);

  return (
    <TreeStateProvider initial={initial}>
      <SolutionReplayBoardInner line={line} />
    </TreeStateProvider>
  );
}

function SolutionReplayBoardInner({ line }: { line: string[] }) {
  const store = useContext(TreeStateContext)!;
  const makeMove = useStore(store, (state) => state.makeMove);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    line.forEach((uci, index) => {
      const timer = setTimeout(
        () => {
          if (cancelled) return;
          const move = parseUci(uci);
          if (move) makeMove({ payload: move, mainline: true, changeHeaders: false });
        },
        450 * (index + 1),
      );
      timers.push(timer);
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [line, makeMove]);

  return <Board editingMode={false} movable="none" viewOnly boardRef={boardRef} />;
}
