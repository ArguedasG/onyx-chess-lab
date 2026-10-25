import { useTranslation as useTrainingTranslation } from "react-i18next";
import TacticsAdvanceControl from "./TacticsAdvanceControl";
import TacticsSolutionModal from "./TacticsSolutionModal";
import TacticsTimerBar from "./TacticsTimerBar";
import classes from "./TacticsSession.module.css";
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Menu,
  NumberInput,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import {
  IconArrowLeft,
  IconAlertTriangle,
  IconBulb,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconEye,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { commands } from "@/bindings";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { useTacticsReview } from "@/state/tacticsReview";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { formatTime } from "@/utils/format";
import { addTacticsReviewItem } from "@/utils/tacticsReview";
import { blindFromGame, blindFromOpponentMove, type BlindView } from "@/utils/tacticsVisualization";
import { Stopwatch } from "@/utils/stopwatch";
import { launchTrainingPosition } from "@/utils/trainingLaunch";
import {
  completeTacticsCycle,
  getTacticsCompletedIndexes,
  getTacticsFirstIncompleteIndex,
  getTacticsSetSize,
  recordTacticsAttempt,
  saveTacticsActiveCycle,
  setTacticsResumeIndex,
  updateTacticsAutoAdvance,
  updateTacticsSetConfig,
  type TacticsActiveCycle,
  type TacticsCycleSummary,
  type TacticsSet,
} from "@/utils/trainingAreas";
import { loadTacticsExercise, type TacticsLoadedExercise } from "@/utils/tacticsTraining";
import {
  EngineTacticsBoard,
  GuidedTacticsBoard,
  type TacticsVisualization,
} from "./tactics/TacticsBoards";

type VisualizationMode = "normal" | "noPieces" | "blind";

/** The visualization of tactics sessions (I-38) is remembered between sessions. */
const tacticsVisualizationAtom = atomWithStorage<VisualizationMode>(
  "tactics-visualization",
  "normal",
);
const tacticsBlindDepthAtom = atomWithStorage<number>("tactics-blind-depth", 2);

function fullQueue(total: number) {
  return Array.from({ length: total }, (_, index) => index);
}

function validCycle(cycle: TacticsActiveCycle | null, total: number) {
  if (!cycle || cycle.queue.length === 0) return null;
  const previousCurrent = cycle.queue[Math.min(cycle.position, cycle.queue.length - 1)];
  const queue = fullQueue(total);
  if (queue.length === 0) return null;
  return {
    ...cycle,
    queue,
    position:
      previousCurrent !== undefined && previousCurrent < total
        ? previousCurrent
        : Math.min(cycle.position, queue.length - 1),
    failedIndexes: cycle.failedIndexes.filter((index) => queue.includes(index)),
  };
}

export default function TacticsSessionV2Page() {
  const { t: trainingT } = useTrainingTranslation();

  const { setId } = useParams({ from: "/training/tactics/practice/$setId" });
  const { problem } = useSearch({ from: "/training/tactics/practice/$setId" });
  const navigate = useNavigate();
  const [areas, setAreas] = useAtom(trainingAreasAtom);
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);
  const set = areas.tactics.sets[setId];
  const total = set ? getTacticsSetSize(set) : 0;
  const initialCycle = validCycle(set?.progress.activeCycle ?? null, total);
  const initialCycleNumber = initialCycle?.number ?? (set?.progress.cycles.length ?? 0) + 1;
  const initialCycleResumeIndex = set
    ? getTacticsFirstIncompleteIndex(areas.tactics, setId, initialCycleNumber)
    : 0;

  const [index, setIndex] = useState(() =>
    Math.min(set?.progress.nextExerciseIndex ?? 0, Math.max(0, total - 1)),
  );
  const [browsingIndex, setBrowsingIndex] = useState<number | null>(() =>
    problem === undefined ? null : Math.min(Math.max(0, problem - 1), Math.max(0, total - 1)),
  );
  const [cycleQueue, setCycleQueue] = useState<number[]>(
    () => initialCycle?.queue ?? fullQueue(total),
  );
  const [cyclePosition, setCyclePosition] = useState(() =>
    initialCycle ? Math.max(0, initialCycle.queue.indexOf(initialCycleResumeIndex)) : 0,
  );
  const [cycleNumber, setCycleNumber] = useState(initialCycleNumber);
  const [failedIndexes, setFailedIndexes] = useState<number[]>(
    () => initialCycle?.failedIndexes ?? [],
  );
  const [failures, setFailures] = useState(() => initialCycle?.failures ?? 0);
  const [exercise, setExercise] = useState<TacticsLoadedExercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [result, setResult] = useState<"correct" | "unsupported" | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState("");
  const [navigationValue, setNavigationValue] = useState<string | number>(
    () => Math.min(set?.progress.nextExerciseIndex ?? 0, Math.max(0, total - 1)) + 1,
  );
  const [boardAttempt, setBoardAttempt] = useState(0);
  const [finishedSummary, setFinishedSummary] = useState<Omit<
    TacticsCycleSummary,
    "id" | "completedAt"
  > | null>(null);
  const [earlyFinishOpen, setEarlyFinishOpen] = useState(false);
  const [solutionOpen, setSolutionOpen] = useState(false);
  // Attempt time restarts on each retry; exercise time spans every try of the current puzzle.
  const attemptClock = useRef(new Stopwatch());
  const exerciseClock = useRef(new Stopwatch());
  const cycleClock = useRef(new Stopwatch(initialCycle?.timeMs ?? 0));
  const [timersPaused, setTimersPaused] = useState(false);
  const pausedRef = useRef(false);
  const exerciseDone = useRef(false);
  const [hintRequest, setHintRequest] = useState(0);
  const hintCounted = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setTick] = useState(0);
  const [visualMode, setVisualMode] = useAtom(tacticsVisualizationAtom);
  const [blindDepth, setBlindDepth] = useAtom(tacticsBlindDepthAtom);
  const [blindView, setBlindView] = useState<BlindView | null>(null);
  const { update: updateReview } = useTacticsReview();

  const isWoodpecker = set?.config.mode === "woodpecker";
  const exerciseTimerEnabled = set?.config.exerciseTimer !== false;
  const resumeIndex = isWoodpecker ? (cycleQueue[cyclePosition] ?? 0) : index;
  const activeIndex = browsingIndex ?? resumeIndex;
  const cycleElapsed = cycleClock.current.elapsed();
  const currentCycleCompletedIndexes = useMemo(
    () =>
      isWoodpecker
        ? getTacticsCompletedIndexes(areas.tactics, setId, cycleNumber)
        : getTacticsCompletedIndexes(areas.tactics, setId),
    [areas.tactics, cycleNumber, isWoodpecker, setId],
  );
  const cycleCompleted = isWoodpecker ? currentCycleCompletedIndexes.length : activeIndex + 1;

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 250);
    return () => clearInterval(interval);
  }, []);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!set || !isWoodpecker || set.progress.activeCycle || cycleQueue.length === 0) return;
    const activeCycle: TacticsActiveCycle = {
      number: cycleNumber,
      queue: cycleQueue,
      position: cyclePosition,
      failedIndexes,
      failures,
      timeMs: cycleClock.current.elapsed(),
    };
    setAreas((previous) => ({
      ...previous,
      tactics: saveTacticsActiveCycle(previous.tactics, setId, activeCycle),
    }));
  }, [
    cycleNumber,
    cyclePosition,
    cycleQueue,
    failedIndexes,
    failures,
    isWoodpecker,
    set,
    setAreas,
    setId,
  ]);

  const setSource = set?.source;
  const setExerciseIds = set?.exerciseIds;
  // Display-only settings such as the timer must not reload the current puzzle.
  const setConfigKey = set ? JSON.stringify({ ...set.config, exerciseTimer: undefined }) : null;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setExercise(null);
    setResult(null);
    setRetrying(false);
    setMessage("");
    attemptClock.current.reset(0, !pausedRef.current);
    exerciseClock.current.reset(0, !pausedRef.current);
    exerciseDone.current = false;
    hintCounted.current = false;
    const setConfig = setConfigKey ? (JSON.parse(setConfigKey) as TacticsSet["config"]) : null;

    async function load() {
      if (!setConfig || !setExerciseIds)
        throw new Error(
          trainingT("Training.Copy.Thesetnolongerexists.39d26ccd", "The set no longer exists."),
        );
      const stableSet = { source: setSource, exerciseIds: setExerciseIds, config: setConfig };
      return loadTacticsExercise(stableSet, areas.tactics.exercises, activeIndex);
    }

    void load()
      .then((loaded) => !cancelled && setExercise(loaded))
      .catch((error) => {
        if (!cancelled)
          setLoadError(
            error instanceof Error
              ? error.message
              : trainingT(
                  "Training.Copy.Couldnotloadtheexercise.06c7cf47",
                  "Could not load the exercise.",
                ),
          );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [
    activeIndex,
    areas.tactics.exercises,
    setConfigKey,
    setExerciseIds,
    setId,
    setSource,
    trainingT,
  ]);

  // Blind needs what led to the position: the opponent's first move or the source game.
  const playerAnalysisSource = exercise
    ? areas.tactics.exercises[exercise.id]?.source.playerAnalysis
    : undefined;
  useEffect(() => {
    setBlindView(null);
    if (!exercise || !set) return;
    if (set.config.startingActor === "opponent") {
      setBlindView(blindFromOpponentMove(exercise.fen, exercise.solutionLines[0]?.[0]));
      return;
    }
    if (!playerAnalysisSource) return;
    let cancelled = false;
    void commands
      .getGames(playerAnalysisSource.databasePath, {
        game_id: playerAnalysisSource.gameId,
        options: { page: 1, pageSize: 1, skipCount: true, sort: "id", direction: "asc" },
      })
      .then((response) => {
        if (cancelled || response.status !== "ok") return;
        const game = response.data.data[0];
        if (!game) return;
        setBlindView(
          blindFromGame(game.moves, game.fen, exercise.fen, playerAnalysisSource.ply, blindDepth),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [blindDepth, exercise, playerAnalysisSource, set]);

  const completedIndexes = isWoodpecker
    ? currentCycleCompletedIndexes
    : getTacticsCompletedIndexes(areas.tactics, setId);

  useEffect(() => {
    setNavigationValue(activeIndex + 1);
  }, [activeIndex]);

  function elapsedNow() {
    return cycleClock.current.elapsed();
  }

  function setPaused(paused: boolean) {
    pausedRef.current = paused;
    setTimersPaused(paused);
  }

  function pauseTimers() {
    attemptClock.current.pause();
    exerciseClock.current.pause();
    cycleClock.current.pause();
    setPaused(true);
  }

  /** Playing a move, changing puzzle or pressing the button resumes the paused clocks. */
  function resumeTimers() {
    if (!pausedRef.current) return;
    attemptClock.current.resume();
    if (!exerciseDone.current) exerciseClock.current.resume();
    if (!finishedSummary) cycleClock.current.resume();
    setPaused(false);
  }

  function activeCycleSnapshot(overrides: Partial<TacticsActiveCycle> = {}): TacticsActiveCycle {
    return {
      number: cycleNumber,
      queue: cycleQueue,
      position: cyclePosition,
      failedIndexes,
      failures,
      timeMs: elapsedNow(),
      ...overrides,
    };
  }

  function persistAttempt(
    outcome: "correct" | "incorrect" | "unsupported",
    playedMove: string | null,
    timeMs: number,
    cycle?: TacticsActiveCycle,
  ) {
    if (!exercise) return;
    setAreas((previous) => {
      let tactics = recordTacticsAttempt(previous.tactics, {
        setId,
        exerciseId: exercise.id,
        playedMove,
        outcome,
        timeMs,
        cycleNumber: isWoodpecker ? cycleNumber : null,
        variant: activeVisualization.kind === "normal" ? undefined : activeVisualization.kind,
      });
      let cycleSnapshot = cycle;
      if (outcome === "correct") {
        const nextResumeIndex = isWoodpecker
          ? getTacticsFirstIncompleteIndex(tactics, setId, cycleNumber)
          : getTacticsFirstIncompleteIndex(tactics, setId);
        tactics = setTacticsResumeIndex(tactics, setId, nextResumeIndex);
        if (cycleSnapshot && isWoodpecker) {
          const nextPosition = Math.max(0, cycleQueue.indexOf(nextResumeIndex));
          cycleSnapshot = { ...cycleSnapshot, position: nextPosition };
        }
      }
      if (cycleSnapshot) tactics = saveTacticsActiveCycle(tactics, setId, cycleSnapshot);
      return { ...previous, tactics };
    });
    if (outcome === "incorrect") addToReview();
  }

  /** A missed exercise with a prepared solution joins the tactics review (I-06). */
  function addToReview() {
    if (!exercise || !set || exercise.solutionLines.length === 0) return;
    const solution = exercise.solutionLines[0];
    const setName = set.name;
    const title = exercise.title;
    updateReview((state) =>
      state.autoAdd
        ? addTacticsReviewItem(state, {
            id: `set:${setId}:${exercise.id}`,
            fen: exercise.fen,
            solution,
            opponentFirst: set.config.startingActor === "opponent",
            label: `${setName} · ${title}`,
            rating: null,
            themes: areas.tactics.exercises[exercise.id]?.tags ?? [],
            source: "set",
          })
        : state,
    );
  }

  function finishAttempt(
    outcome: "correct" | "incorrect" | "unsupported",
    playedMove: string | null,
    feedback: string,
  ) {
    if (!exercise || !set || result || retrying) return;
    const timeMs = attemptClock.current.elapsed();
    if (outcome === "incorrect") {
      const nextFailures = failures + 1;
      const nextFailed = failedIndexes.includes(activeIndex)
        ? failedIndexes
        : [...failedIndexes, activeIndex];
      setFailures(nextFailures);
      setFailedIndexes(nextFailed);
      setRetrying(true);
      setMessage(
        trainingT("Training.Copy.IncorrectmoveTryagain.b114a07a", "Incorrect move. Try again."),
      );
      persistAttempt(
        outcome,
        playedMove,
        timeMs,
        isWoodpecker
          ? activeCycleSnapshot({ failedIndexes: nextFailed, failures: nextFailures })
          : undefined,
      );
      retryTimer.current = setTimeout(() => {
        setBoardAttempt((value) => value + 1);
        setRetrying(false);
        attemptClock.current.reset(0, !pausedRef.current);
      }, 700);
      return;
    }

    exerciseClock.current.pause();
    exerciseDone.current = true;
    setResult(outcome);
    setMessage(feedback);
    persistAttempt(outcome, playedMove, timeMs, isWoodpecker ? activeCycleSnapshot() : undefined);
  }

  function recordSolutionReveal() {
    recordAssistedMistake(
      trainingT(
        "Training.Tactics.Solution.RetryMessage",
        "Solution shown and counted as a mistake. Reproduce the line to complete the puzzle.",
      ),
    );
  }

  /** Like the puzzle trainer, the first hint on a puzzle counts it as failed. */
  function requestHint() {
    if (!exercise || !set || result || retrying) return;
    resumeTimers();
    if (!hintCounted.current) {
      hintCounted.current = true;
      recordAssistedMistake(
        trainingT(
          "Training.Tactics.Hint.Message",
          "Hint used: counted as a mistake. Press again to see the full move.",
        ),
      );
    }
    setHintRequest((value) => value + 1);
  }

  function recordAssistedMistake(feedback: string) {
    if (!exercise || !set || result || retrying) return;
    const timeMs = attemptClock.current.elapsed();
    const nextFailures = failures + 1;
    const nextFailed = failedIndexes.includes(activeIndex)
      ? failedIndexes
      : [...failedIndexes, activeIndex];
    setFailures(nextFailures);
    setFailedIndexes(nextFailed);
    setMessage(feedback);
    persistAttempt(
      "incorrect",
      null,
      timeMs,
      isWoodpecker
        ? activeCycleSnapshot({ failedIndexes: nextFailed, failures: nextFailures })
        : undefined,
    );
  }

  function closeSolution() {
    setSolutionOpen(false);
    setBoardAttempt((value) => value + 1);
    attemptClock.current.reset(0, !pausedRef.current);
  }

  function resetExerciseState() {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setResult(null);
    setRetrying(false);
    setMessage("");
    setBoardAttempt((value) => value + 1);
    attemptClock.current.reset(0, true);
    exerciseDone.current = false;
    exerciseClock.current.resume();
    resumeTimers();
  }

  function jumpTo(target: number) {
    if (!set || total === 0) return;
    const safeTarget = Math.min(total - 1, Math.max(0, Math.floor(target)));
    resetExerciseState();
    setBrowsingIndex(safeTarget === resumeIndex ? null : safeTarget);
  }

  function returnToResume() {
    resetExerciseState();
    setBrowsingIndex(null);
  }

  function finishCycle(
    completedCount = new Set([
      ...currentCycleCompletedIndexes,
      ...(result === "correct" ? [activeIndex] : []),
    ]).size,
  ) {
    if (!set || !isWoodpecker || finishedSummary) return;
    const summary = {
      number: cycleNumber,
      exerciseCount: total,
      completedCount: Math.min(completedCount, total),
      failures,
      timeMs: elapsedNow(),
    };
    cycleClock.current.pause();
    setFinishedSummary(summary);
    setAreas((previous) => ({
      ...previous,
      tactics: completeTacticsCycle(previous.tactics, setId, summary),
    }));
  }

  const finishCycleRef = useRef(finishCycle);
  finishCycleRef.current = finishCycle;
  useEffect(() => {
    if (
      !isWoodpecker ||
      finishedSummary ||
      total === 0 ||
      currentCycleCompletedIndexes.length < total
    ) {
      return;
    }
    finishCycleRef.current(total);
  }, [currentCycleCompletedIndexes.length, finishedSummary, isWoodpecker, total]);

  function nextExercise() {
    if (!set || total === 0 || result !== "correct") return;
    if (isWoodpecker) {
      const completed = new Set([...currentCycleCompletedIndexes, activeIndex]);
      if (completed.size >= total) {
        finishCycle(total);
        return;
      }
      if (browsingIndex !== null && browsingIndex !== resumeIndex) {
        returnToResume();
        return;
      }
      let nextPosition = cyclePosition + 1;
      while (nextPosition < cycleQueue.length && completed.has(cycleQueue[nextPosition])) {
        nextPosition += 1;
      }
      if (nextPosition >= cycleQueue.length) {
        nextPosition = cycleQueue.findIndex((exerciseIndex) => !completed.has(exerciseIndex));
      }
      if (nextPosition < 0) {
        finishCycle(total);
        return;
      }
      setCyclePosition(nextPosition);
      setBrowsingIndex(null);
      resetExerciseState();
      setAreas((previous) => ({
        ...previous,
        tactics: saveTacticsActiveCycle(
          setTacticsResumeIndex(previous.tactics, setId, cycleQueue[nextPosition]),
          setId,
          activeCycleSnapshot({ position: nextPosition }),
        ),
      }));
      return;
    }
    const nextIndex = getTacticsFirstIncompleteIndex(areas.tactics, setId);
    setIndex(nextIndex);
    setBrowsingIndex(null);
    resetExerciseState();
  }

  function startNextCycle() {
    if (!set || !finishedSummary) return;
    const nextNumber = cycleNumber + 1;
    const queue = fullQueue(total);
    setCycleNumber(nextNumber);
    setCycleQueue(queue);
    setCyclePosition(0);
    setFailedIndexes([]);
    setFailures(0);
    setFinishedSummary(null);
    cycleClock.current.reset(0, true);
    resetExerciseState();
    setAreas((previous) => ({
      ...previous,
      tactics: saveTacticsActiveCycle(
        setTacticsResumeIndex(previous.tactics, setId, queue[0] ?? 0),
        setId,
        { number: nextNumber, queue, position: 0, failedIndexes: [], failures: 0, timeMs: 0 },
      ),
    }));
  }

  async function analyzePosition() {
    if (!exercise) return;
    await navigate({ to: "/" });
    await launchTrainingPosition({
      fen: exercise.fen,
      name: trainingT("Training.Copy.Analysisv0.b7ffacfd", "Analysis · {{v0}}", {
        v0: exercise.title,
      }),
      type: "analysis",
      setTabs,
      setActiveTab,
      trainingArea: "tactics",
    });
  }

  if (!set || total === 0) return <MissingSet />;

  if (finishedSummary) {
    const previousCycle = set.progress.cycles.at(-2);
    return (
      <Container size="md" py="xl">
        <Card withBorder>
          <Stack align="center" py="xl">
            <IconCheck size={44} color="var(--mantine-color-teal-6)" />
            <Title order={2}>
              {trainingT("Training.Copy.Cycle.4b8c1a8a", "Cycle")} {finishedSummary.number}{" "}
              {trainingT("Training.Copy.saved.0344b48c", "saved")}
            </Title>
            <Text c="dimmed" ta="center">
              {finishedSummary.completedCount} {trainingT("Training.Copy.of.959a45d4", "of")}{" "}
              {finishedSummary.exerciseCount}{" "}
              {trainingT("Training.Copy.puzzles.6cfdb9ec", "puzzles ·")} {finishedSummary.failures}{" "}
              {trainingT("Training.Copy.mistakes.5c65c76e", "mistakes ·")}{" "}
              {formatTime(finishedSummary.timeMs)}
            </Text>
            {previousCycle && (
              <Alert color="blue" w="100%">
                {" "}
                {trainingT("Training.Copy.Previouscycle.35411be3", "Previous cycle:")}{" "}
                {previousCycle.failures}{" "}
                {trainingT("Training.Copy.mistakesin.64106f51", "mistakes in")}{" "}
                {formatTime(previousCycle.timeMs)}.
              </Alert>
            )}
            <Alert color="orange" w="100%">
              {" "}
              {trainingT("Training.Copy.Cycle.be150316", "Cycle")} {cycleNumber + 1}{" "}
              {trainingT("Training.Copy.willgothroughall.7c725a8e", "will go through all")} {total}{" "}
              {trainingT(
                "Training.Copy.puzzlesinthecompleteset.6f63ef8d",
                "puzzles in the complete set.",
              )}{" "}
            </Alert>
            <Group>
              <Button component={Link} to="/training/tactics" variant="default">
                {" "}
                {trainingT("Training.Copy.Backtotactics.8239d676", "Back to tactics")}{" "}
              </Button>
              <Button
                color="orange"
                leftSection={<IconRefresh size={16} />}
                onClick={startNextCycle}
              >
                {" "}
                {trainingT("Training.Copy.Startcycle.c6434792", "Start cycle")} {cycleNumber + 1}
              </Button>
            </Group>
          </Stack>
        </Card>
      </Container>
    );
  }

  const blindAvailable = blindView !== null;
  const activeVisualization: TacticsVisualization =
    visualMode === "blind" && blindView
      ? { kind: "blind", fen: blindView.fen, hiddenSans: blindView.hiddenSans }
      : visualMode === "noPieces"
        ? { kind: "noPieces" }
        : { kind: "normal" };

  const cyclePercent = isWoodpecker
    ? Math.round((Math.min(cycleCompleted, total) / Math.max(1, total)) * 100)
    : Math.round(((activeIndex + 1) / total) * 100);
  const hintAvailable =
    !!exercise && set.config.validationMode !== "engine" && exercise.solutionLines.length > 0;
  const completedOptions = completedIndexes.map((value) => ({
    value: String(value),
    label: trainingT("Training.Copy.Puzzlev0.76f70f4a", "Puzzle {{v0}} ✓", { v0: value + 1 }),
  }));

  const sideToMove = exercise?.fen.split(" ")[1] === "b" ? "black" : "white";
  // With "opponent first" the record starts with the other side's move.
  const studentSide =
    set.config.startingActor === "student"
      ? sideToMove
      : sideToMove === "white"
        ? "black"
        : "white";

  return (
    <div className={classes.page}>
      <div className={classes.topBar}>
        <Button
          component={Link}
          to="/training/tactics"
          variant="subtle"
          size="compact-sm"
          px={4}
          aria-label={trainingT("Training.Copy.Back.ab26ae7b", "Back")}
        >
          <IconArrowLeft size={18} />
        </Button>
        <Text fw={700} truncate>
          {set.name}
        </Text>
        <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
          {browsingIndex !== null
            ? trainingT(
                "Training.Copy.Exploringpuzzlev0resumeat.ec21e9ea",
                "Exploring puzzle {{v0}} · resume at {{v1}}",
                { v0: activeIndex + 1, v1: resumeIndex + 1 },
              )
            : isWoodpecker
              ? trainingT(
                  "Training.Copy.Cyclev0puzzlev1of.a2d5bda7",
                  "Cycle {{v0}} · puzzle {{v1}} of {{v2}}",
                  { v0: cycleNumber, v1: activeIndex + 1, v2: total },
                )
              : trainingT("Training.Copy.Puzzlev0ofv1.2278f01a", "Puzzle {{v0}} of {{v1}}", {
                  v0: activeIndex + 1,
                  v1: total,
                })}
        </Text>
        <div style={{ flex: 1 }} />
        <Badge variant="light">
          {isWoodpecker ? "Woodpecker" : trainingT("Training.Copy.Guided.57bd258f", "Guided")}
        </Badge>
        {isWoodpecker && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={trainingT("Training.Copy.Cyclesettings.56a17ec9", "Cycle settings")}
              >
                <IconSettings size={17} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>
                {trainingT("Training.Copy.Advancedoptions.abd17408", "Advanced options")}
              </Menu.Label>
              <Menu.Item
                color="red"
                leftSection={<IconAlertTriangle size={15} />}
                onClick={() => setEarlyFinishOpen(true)}
              >
                {trainingT("Training.Copy.Endcycleearly.d3cc4e59", "End cycle early")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </div>
      <Progress value={cyclePercent} color="orange" size={3} radius={0} />

      <div className={classes.main}>
        <div className={classes.boardArea}>
          {loading ? (
            <Stack align="center" py="xl">
              <Loader />
              <Text c="dimmed">
                {trainingT("Training.Copy.Loadingpuzzle.f51a73af", "Loading puzzle…")}
              </Text>
            </Stack>
          ) : loadError || !exercise ? (
            <Alert
              color="red"
              title={trainingT(
                "Training.Copy.Couldnotloadthepuzzle.1fbadbba",
                "Could not load the puzzle",
              )}
            >
              {loadError}
            </Alert>
          ) : set.config.validationMode !== "engine" && exercise.solutionLines.length > 0 ? (
            <GuidedTacticsBoard
              key={`${exercise.id}-${activeIndex}-${boardAttempt}-${activeVisualization.kind}`}
              exercise={exercise}
              startingActor={set.config.startingActor}
              visualization={activeVisualization}
              disabled={result !== null || retrying}
              variationSeed={
                areas.tactics.attempts.filter((attempt) => attempt.exerciseId === exercise.id)
                  .length
              }
              hintRequest={hintRequest}
              onUserMove={resumeTimers}
              onCorrect={(move) =>
                finishAttempt(
                  "correct",
                  move,
                  trainingT(
                    "Training.Copy.Puzzlesolvedcorrectly.aa4b0cbe",
                    "Puzzle solved correctly.",
                  ),
                )
              }
              onIncorrect={(move) => finishAttempt("incorrect", move, "")}
            />
          ) : set.config.validationMode === "prepared" ? (
            <Alert color="yellow">
              {trainingT(
                "Training.Copy.Thisrecordhasnoprepared.9e18dd59",
                "This record has no prepared solution. Switch validation to automatic or engine.",
              )}
            </Alert>
          ) : (
            <EngineTacticsBoard
              key={`${exercise.id}-${activeIndex}-${boardAttempt}`}
              exercise={exercise}
              set={set}
              disabled={result !== null || retrying}
              onUserMove={resumeTimers}
              onResult={finishAttempt}
            />
          )}
        </div>

        <aside className={classes.side}>
          <div>
            <Group gap={10} wrap="nowrap">
              <span
                className={classes.turnDot}
                style={{ background: studentSide === "white" ? "#f4f4f2" : "#1b1b1a" }}
              />
              <Text fw={700} size="xl">
                {studentSide === "white"
                  ? trainingT("Training.Tactics.WhiteToMove", "White to move")
                  : trainingT("Training.Tactics.BlackToMove", "Black to move")}
              </Text>
            </Group>
            <Text size="sm" mt={4}>
              {exercise?.solutionLines.length
                ? trainingT("Training.Tactics.FindBest", "Find the best move")
                : trainingT(
                    "Training.Copy.Themovewillbevalidated.da46d52c",
                    "The move will be validated by a local engine.",
                  )}
            </Text>
            <Text size="xs" c="dimmed" mt={2} lineClamp={2}>
              {exercise?.title ??
                trainingT("Training.Copy.Puzzlev0.c9ca2375", "Puzzle {{v0}}", {
                  v0: activeIndex + 1,
                })}
            </Text>
          </div>

          {set.config.validationMode !== "engine" && (
            <Stack gap={6}>
              <SegmentedControl
                size="xs"
                fullWidth
                value={visualMode === "blind" && !blindAvailable ? "normal" : visualMode}
                onChange={(value) => setVisualMode(value as VisualizationMode)}
                data={[
                  { value: "normal", label: trainingT("Tactics.Visual.Normal", "Normal") },
                  { value: "noPieces", label: trainingT("Tactics.Visual.NoPieces", "No pieces") },
                  {
                    value: "blind",
                    disabled: !blindAvailable,
                    label: (
                      <Tooltip
                        disabled={blindAvailable}
                        label={trainingT(
                          "Tactics.Visual.BlindUnavailable",
                          "Blind needs to know what led to the position: puzzles that start with the opponent's move or exercises from your games.",
                        )}
                        multiline
                        w={260}
                      >
                        <span>{trainingT("Tactics.Visual.Blind", "Blind")}</span>
                      </Tooltip>
                    ),
                  },
                ]}
              />
              {visualMode === "blind" && blindAvailable && playerAnalysisSource && (
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" c="dimmed">
                    {trainingT("Tactics.Visual.Depth", "Hidden half-moves")}
                  </Text>
                  <Select
                    size="xs"
                    w={80}
                    allowDeselect={false}
                    value={String(blindDepth)}
                    onChange={(value) => value && setBlindDepth(Number(value))}
                    data={["1", "2", "3", "4", "5", "6"]}
                    aria-label={trainingT("Tactics.Visual.Depth", "Hidden half-moves")}
                  />
                </Group>
              )}
            </Stack>
          )}

          {(exerciseTimerEnabled || isWoodpecker) && (
            <TacticsTimerBar
              exerciseMs={exerciseTimerEnabled ? exerciseClock.current.elapsed() : null}
              cycleMs={isWoodpecker ? cycleElapsed : null}
              mistakes={isWoodpecker ? failures : null}
              paused={timersPaused}
              onTogglePause={() => (timersPaused ? resumeTimers() : pauseTimers())}
            />
          )}

          {message && (
            <Alert
              color={result === "correct" ? "teal" : result === "unsupported" ? "yellow" : "red"}
              icon={result === "correct" ? <IconCheck size={16} /> : <IconX size={16} />}
            >
              {message}
            </Alert>
          )}
          {result === "unsupported" && (
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={resetExerciseState}
            >
              {trainingT("Training.Copy.Retry.a9254c5f", "Retry")}
            </Button>
          )}
          <TacticsAdvanceControl
            autoAdvance={set.progress.autoAdvance}
            solved={result === "correct"}
            completesCycle={
              isWoodpecker && new Set([...currentCycleCompletedIndexes, activeIndex]).size >= total
            }
            browsing={browsingIndex !== null && browsingIndex !== resumeIndex}
            exerciseKey={`${setId}:${activeIndex}:${boardAttempt}`}
            onNext={nextExercise}
          />

          <div style={{ flex: 1 }} />

          <Stack gap={4}>
            <Button
              variant="subtle"
              color="gray"
              justify="flex-start"
              leftSection={<IconBulb size={16} />}
              disabled={result !== null || retrying || !hintAvailable}
              title={
                hintAvailable
                  ? undefined
                  : trainingT(
                      "Training.Tactics.Hint.Unavailable",
                      "Hints need a prepared solution line.",
                    )
              }
              onClick={requestHint}
            >
              {trainingT("Training.Tactics.Hint.Button", "Hint")}
            </Button>
            <Button
              variant="subtle"
              color="gray"
              justify="flex-start"
              leftSection={<IconEye size={16} />}
              disabled={result !== null || retrying}
              onClick={() => setSolutionOpen(true)}
            >
              {trainingT("Training.Tactics.Solution.Title", "View solution")}
            </Button>
            <Button
              variant="subtle"
              color="gray"
              justify="flex-start"
              leftSection={<IconSearch size={16} />}
              onClick={analyzePosition}
            >
              {trainingT("Training.Copy.Analyzeposition.7cd475fb", "Analyze position")}
            </Button>
          </Stack>

          <Accordion variant="default" chevronPosition="right" className={classes.more}>
            <Accordion.Item value="navigation">
              <Accordion.Control>
                <Text size="sm" fw={600}>
                  {trainingT("Training.Tactics.NavigationSettings", "Navigation and settings")}
                </Text>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  {browsingIndex !== null && browsingIndex !== resumeIndex && (
                    <Alert color="blue" variant="light">
                      {trainingT(
                        "Training.Copy.Youareexploringanotherpuzzle.350787db",
                        "You are exploring another puzzle. Your resume point is still saved at puzzle",
                      )}{" "}
                      {resumeIndex + 1}.
                    </Alert>
                  )}
                  <Button
                    variant="light"
                    size="xs"
                    onClick={returnToResume}
                    disabled={browsingIndex === null}
                  >
                    {trainingT(
                      "Training.Copy.Returntothefirstincomplete.30ef6874",
                      "Return to the first incomplete exercise ·",
                    )}{" "}
                    {resumeIndex + 1}
                  </Button>
                  <Group grow>
                    <Button
                      variant="default"
                      size="xs"
                      leftSection={<IconChevronLeft size={16} />}
                      disabled={activeIndex === 0}
                      onClick={() => jumpTo(activeIndex - 1)}
                    >
                      {trainingT("Training.Copy.Previous.e4ce7c09", "Previous")}
                    </Button>
                    <Button
                      variant="default"
                      size="xs"
                      rightSection={<IconChevronRight size={16} />}
                      disabled={activeIndex + 1 >= total}
                      onClick={() => jumpTo(activeIndex + 1)}
                    >
                      {trainingT("Training.Copy.Next.49683b71", "Next")}
                    </Button>
                  </Group>
                  <Group align="flex-end" wrap="nowrap">
                    <NumberInput
                      size="xs"
                      label={trainingT("Training.Copy.Gotopuzzle.a6b5d4e1", "Go to puzzle")}
                      min={1}
                      max={total}
                      value={navigationValue}
                      onChange={setNavigationValue}
                      style={{ flex: 1 }}
                    />
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => jumpTo(Number(navigationValue || 1) - 1)}
                    >
                      {trainingT("Training.Copy.Go.460edadf", "Go")}
                    </Button>
                  </Group>
                  <Select
                    size="xs"
                    label={trainingT(
                      "Training.Copy.Completedpuzzles.da5ea6b6",
                      "Completed puzzles",
                    )}
                    placeholder={
                      completedOptions.length
                        ? trainingT("Training.Copy.Choosepuzzle.5bdb94e5", "Choose puzzle")
                        : trainingT("Training.Copy.Noneyet.91ed3180", "None yet")
                    }
                    data={completedOptions}
                    disabled={completedOptions.length === 0}
                    searchable
                    clearable
                    onChange={(value) => value !== null && jumpTo(Number(value))}
                  />
                  <Switch
                    size="xs"
                    label={trainingT(
                      "Training.Tactics.Timer.Exercise.Toggle",
                      "Per-exercise timer",
                    )}
                    checked={exerciseTimerEnabled}
                    onChange={(event) => {
                      const exerciseTimer = event.currentTarget.checked;
                      setAreas((previous) => {
                        const current = previous.tactics.sets[setId];
                        if (!current) return previous;
                        return {
                          ...previous,
                          tactics: updateTacticsSetConfig(previous.tactics, setId, {
                            ...current.config,
                            exerciseTimer,
                          }),
                        };
                      });
                    }}
                  />
                  <Switch
                    size="xs"
                    label={trainingT(
                      "Training.Copy.Advanceautomaticallyaftersolving.db958dbf",
                      "Advance automatically after solving",
                    )}
                    checked={set.progress.autoAdvance}
                    onChange={(event) =>
                      setAreas((previous) => ({
                        ...previous,
                        tactics: updateTacticsAutoAdvance(
                          previous.tactics,
                          setId,
                          event.currentTarget.checked,
                        ),
                      }))
                    }
                  />
                  {isWoodpecker && (
                    <Stack gap={4}>
                      <Group justify="space-between">
                        <Text size="sm" fw={600}>
                          {trainingT("Training.Copy.Cycle.4b8c1a8a", "Cycle")} {cycleNumber}
                        </Text>
                        <Badge size="sm">
                          {failures} {trainingT("Training.Copy.mistakes.5fb1604c", "mistakes")}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {trainingT(
                          "Training.Copy.Timeandmistakesarerecorded.8687b811",
                          "Time and mistakes are recorded but do not stop training.",
                        )}
                      </Text>
                      {set.progress.cycles
                        .slice(-3)
                        .reverse()
                        .map((cycle) => (
                          <Group key={cycle.id} justify="space-between">
                            <Text size="xs">
                              {trainingT("Training.Copy.Cycle.4b8c1a8a", "Cycle")} {cycle.number}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {cycle.failures}{" "}
                              {trainingT("Training.Copy.mistakes.5c65c76e", "mistakes ·")}{" "}
                              {formatTime(cycle.timeMs)}
                            </Text>
                          </Group>
                        ))}
                    </Stack>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </aside>
      </div>
      <Modal
        opened={earlyFinishOpen}
        onClose={() => setEarlyFinishOpen(false)}
        title={trainingT(
          "Training.Copy.Endthecyclebeforecompleting.c2e29d9c",
          "End the cycle before completing the set",
        )}
        size="sm"
      >
        <Stack>
          <Alert color="red" icon={<IconAlertTriangle size={18} />}>
            {" "}
            {trainingT(
              "Training.Copy.Thecyclewillbesaved.47fad844",
              "The cycle will be saved as incomplete with its current progress and mistakes. The next cycle will include the entire set again.",
            )}{" "}
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEarlyFinishOpen(false)}>
              {" "}
              {trainingT("Training.Copy.Keeptraining.533691ba", "Keep training")}{" "}
            </Button>
            <Button
              color="red"
              onClick={() => {
                setEarlyFinishOpen(false);
                finishCycle();
              }}
            >
              {" "}
              {trainingT("Training.Copy.Endanyway.3b347291", "End anyway")}{" "}
            </Button>
          </Group>
        </Stack>
      </Modal>
      {exercise && (
        <TacticsSolutionModal
          opened={solutionOpen}
          exercise={exercise}
          set={set}
          onClose={closeSolution}
          onReveal={recordSolutionReveal}
        />
      )}
    </div>
  );
}

function MissingSet() {
  const { t: trainingT } = useTrainingTranslation();

  return (
    <Container size="md" py="xl">
      <Alert color="red" title={trainingT("Training.Copy.Setnotfound.63b73336", "Set not found")}>
        {" "}
        {trainingT(
          "Training.Copy.Thetacticssetnolonger.55f1a175",
          "The tactics set no longer exists or contains no puzzles.",
        )}{" "}
      </Alert>
      <Button
        component={Link}
        to="/training/tactics"
        mt="md"
        leftSection={<IconArrowLeft size={16} />}
      >
        {" "}
        {trainingT("Training.Copy.Backtotactics.8239d676", "Back to tactics")}{" "}
      </Button>
    </Container>
  );
}
