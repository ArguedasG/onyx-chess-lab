import { useTranslation as useTrainingTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconBolt, IconClock, IconFlame, IconPlayerPlay, IconTrophy } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/common/Modal";
import { trainingAreasAtom } from "@/state/trainingAreas";
import {
  applyRushResult,
  finishRushIfTimeUp,
  rushScore,
  rushTimeLeft,
  type RushState,
  startRush,
} from "@/utils/puzzleSession";
import { loadTacticsExercise, type TacticsLoadedExercise } from "@/utils/tacticsTraining";
import { blindFromOpponentMove } from "@/utils/tacticsVisualization";
import type { TacticsSet } from "@/utils/trainingAreas";
import { GuidedTacticsBoard, type TacticsVisualization } from "./TacticsBoards";

/**
 * Fast formats over a set's own exercises (Storm, Streak, Countdown), the ones the Lichess puzzle
 * trainer has. A separate session: it never touches the set's progress or its Woodpecker cycles,
 * so any set can use them; only the best score per set and format is kept.
 */
export type RushFormat = "storm" | "streak" | "countdown";
type Order = "set" | "shuffle" | "rating";
type Visual = "normal" | "noPieces" | "blind";
type Phase = "setup" | "running" | "over";

const bestScoresAtom = atomWithStorage<Record<string, number>>("tactics-rush-best", {}, undefined, {
  getOnInit: true,
});

/** Rating written in the title of exercises made from Lichess puzzles ("Lichess abc · 1834"). */
function ratingOf(title: string | undefined): number | null {
  const match = title?.match(/·\s*(\d{3,4})\s*$/);
  return match ? Number(match[1]) : null;
}

function shuffled(values: number[]) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatClock(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function SetRushSession({
  opened,
  onClose,
  setId,
  set,
}: {
  opened: boolean;
  onClose: () => void;
  setId: string;
  set: TacticsSet;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const areas = useAtomValue(trainingAreasAtom);
  const [bestScores, setBestScores] = useAtom(bestScoresAtom);
  const [phase, setPhase] = useState<Phase>("setup");
  const [format, setFormat] = useState<RushFormat>("storm");
  const [stormSeconds, setStormSeconds] = useState("180");
  const [countdownSeconds, setCountdownSeconds] = useState("30");
  const [streakLives, setStreakLives] = useState("1");
  const [order, setOrder] = useState<Order>("shuffle");
  const [visual, setVisual] = useState<Visual>("normal");
  const [queue, setQueue] = useState<number[]>([]);
  const [position, setPosition] = useState(0);
  const [exercise, setExercise] = useState<TacticsLoadedExercise | null>(null);
  const [loadError, setLoadError] = useState("");
  const [rush, setRush] = useState<RushState | null>(null);
  const [counts, setCounts] = useState({ solved: 0, failed: 0 });
  const [answered, setAnswered] = useState(false);
  const [exerciseStartedAt, setExerciseStartedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [newBest, setNewBest] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = set.exerciseIds.length;
  const blindAvailable = set.config.startingActor === "opponent";
  const canRun = set.config.validationMode !== "engine";
  const ratings = useMemo(
    () => set.exerciseIds.map((id) => ratingOf(areas.tactics.exercises[id]?.title)),
    [areas.tactics.exercises, set.exerciseIds],
  );
  const hasRatings = ratings.filter((rating) => rating !== null).length >= total / 2;
  const bestKey = `${setId}:${format}`;

  useEffect(() => {
    if (!opened) {
      setPhase("setup");
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    }
  }, [opened]);

  // Streak climbs in difficulty when the set knows its ratings.
  useEffect(() => {
    if (format === "streak" && hasRatings) setOrder("rating");
  }, [format, hasRatings]);

  // The clock: storm's total time and countdown's time per exercise.
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "running" || !rush || format !== "storm") return;
    const finished = finishRushIfTimeUp(rush, now);
    if (finished.status === "over") end(finished, counts);
  });

  useEffect(() => {
    if (phase !== "running" || format !== "countdown" || answered || !exercise) return;
    if (now - exerciseStartedAt >= Number(countdownSeconds) * 1000) answer(false);
  });

  // Loads the exercise at the current place of the queue.
  const current = queue[position];
  useEffect(() => {
    if (phase !== "running" || current === undefined) return;
    let cancelled = false;
    setExercise(null);
    setLoadError("");
    void loadTacticsExercise(set, areas.tactics.exercises, current)
      .then((loaded) => {
        if (cancelled) return;
        // Records without a prepared solution cannot be judged in a fast format: skip them.
        if (loaded.solutionLines.length === 0) {
          if (position + 1 < queue.length) setPosition((value) => value + 1);
          else end(rush, counts);
          return;
        }
        setExercise(loaded);
        setAnswered(false);
        setExerciseStartedAt(Date.now());
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
    // The set's exercises do not change while a session runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current]);

  function start() {
    const indexes = Array.from({ length: total }, (_, index) => index);
    const ordered =
      order === "shuffle"
        ? shuffled(indexes)
        : order === "rating"
          ? [...indexes].sort((a, b) => (ratings[a] ?? 9999) - (ratings[b] ?? 9999))
          : indexes;
    setQueue(ordered);
    setPosition(0);
    setCounts({ solved: 0, failed: 0 });
    setNewBest(false);
    setRush(
      format === "countdown"
        ? null
        : startRush(
            format,
            {
              stormSeconds: Number(stormSeconds),
              streakLives: Number(streakLives),
              countdownSeconds: Number(countdownSeconds),
            },
            1500,
          ),
    );
    setNow(Date.now());
    setPhase("running");
  }

  function end(finalRush: RushState | null, finalCounts: { solved: number; failed: number }) {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    const score = finalRush ? rushScore(finalRush) : finalCounts.solved;
    if (score > (bestScores[bestKey] ?? 0)) {
      setBestScores((previous) => ({ ...previous, [bestKey]: score }));
      setNewBest(true);
    }
    setRush(finalRush ? { ...finalRush, status: "over" } : null);
    setCounts(finalCounts);
    setPhase("over");
  }

  function answer(solved: boolean) {
    if (answered || phase !== "running") return;
    setAnswered(true);
    const nextCounts = {
      solved: counts.solved + (solved ? 1 : 0),
      failed: counts.failed + (solved ? 0 : 1),
    };
    setCounts(nextCounts);
    const nextRush = rush ? applyRushResult(rush, solved, ratings[current] ?? 0) : null;
    setRush(nextRush);
    advanceTimer.current = setTimeout(
      () => {
        if (nextRush?.status === "over" || position + 1 >= queue.length) {
          end(nextRush, nextCounts);
          return;
        }
        setPosition((value) => value + 1);
      },
      solved ? 350 : 800,
    );
  }

  const visualization: TacticsVisualization = useMemo(() => {
    if (visual === "noPieces") return { kind: "noPieces" };
    if (visual === "blind" && exercise) {
      const view = blindFromOpponentMove(exercise.fen, exercise.solutionLines[0]?.[0]);
      if (view) return { kind: "blind", fen: view.fen, hiddenSans: view.hiddenSans };
    }
    return { kind: "normal" };
  }, [exercise, visual]);

  const formats: Array<{ value: RushFormat; label: string; icon: typeof IconBolt; desc: string }> =
    [
      {
        value: "storm",
        label: trainingT("Puzzle.Mode.Storm", "Storm"),
        icon: IconBolt,
        desc: trainingT(
          "Tactics.Rush.StormDesc",
          "As many as you can before the clock runs out; each mistake costs 10 seconds.",
        ),
      },
      {
        value: "streak",
        label: trainingT("Puzzle.Mode.Streak", "Streak"),
        icon: IconFlame,
        desc: trainingT(
          "Tactics.Rush.StreakDesc",
          "No clock: it ends when you run out of lives. Easiest first when the set has ratings.",
        ),
      },
      {
        value: "countdown",
        label: trainingT("Puzzle.Mode.Countdown", "Countdown"),
        icon: IconClock,
        desc: trainingT(
          "Tactics.Rush.CountdownDesc",
          "The same time for every exercise; running out counts as a mistake.",
        ),
      },
    ];

  const timeLeft =
    phase === "running"
      ? format === "storm" && rush
        ? rushTimeLeft(rush, now)
        : format === "countdown"
          ? Math.max(0, Number(countdownSeconds) * 1000 - (now - exerciseStartedAt))
          : null
      : null;
  const timeTotal =
    format === "storm" ? Number(stormSeconds) * 1000 : Number(countdownSeconds) * 1000;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      title={
        <Group gap="xs">
          <IconBolt size={18} />
          <Text fw={700}>
            {trainingT("Tactics.Rush.Title", "Fast formats · {{name}}", { name: set.name })}
          </Text>
        </Group>
      }
    >
      {phase === "setup" && (
        <Stack maw={720} mx="auto" gap="lg" py="md">
          <Text c="dimmed" size="sm">
            {trainingT(
              "Tactics.Rush.Intro",
              "Play this set's {{count}} exercises in a timed or scored format. It does not change the set's progress or its Woodpecker cycles.",
              { count: total },
            )}
          </Text>
          {!canRun && (
            <Alert color="yellow">
              {trainingT(
                "Tactics.Rush.NeedsSolutions",
                "Fast formats need exercises with a prepared solution; this set is checked by the engine.",
              )}
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            {formats.map((item) => (
              <Paper
                key={item.value}
                withBorder
                radius="md"
                p="md"
                style={{
                  cursor: "pointer",
                  borderColor:
                    format === item.value ? "var(--mantine-primary-color-filled)" : undefined,
                  borderWidth: format === item.value ? 2 : undefined,
                }}
                onClick={() => setFormat(item.value)}
              >
                <Stack gap={6}>
                  <Group gap="xs">
                    <ThemeIcon variant="light" size="md">
                      <item.icon size={16} />
                    </ThemeIcon>
                    <Text fw={600}>{item.label}</Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {item.desc}
                  </Text>
                  {bestScores[`${setId}:${item.value}`] !== undefined && (
                    <Badge variant="light" leftSection={<IconTrophy size={11} />}>
                      {trainingT("Tactics.Rush.Best", "Best: {{score}}", {
                        score: bestScores[`${setId}:${item.value}`],
                      })}
                    </Badge>
                  )}
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {format === "storm" && (
              <Select
                label={trainingT("Tactics.Rush.Duration", "Duration")}
                value={stormSeconds}
                onChange={(value) => value && setStormSeconds(value)}
                allowDeselect={false}
                data={["60", "180", "300"].map((value) => ({
                  value,
                  label: trainingT("Tactics.Rush.Minutes", "{{count}} min", {
                    count: Number(value) / 60,
                  }),
                }))}
              />
            )}
            {format === "countdown" && (
              <Select
                label={trainingT("Tactics.Rush.PerExercise", "Time per exercise")}
                value={countdownSeconds}
                onChange={(value) => value && setCountdownSeconds(value)}
                allowDeselect={false}
                data={["15", "30", "60", "120"].map((value) => ({
                  value,
                  label: `${value} s`,
                }))}
              />
            )}
            {format === "streak" && (
              <Select
                label={trainingT("Tactics.Rush.Lives", "Lives")}
                value={streakLives}
                onChange={(value) => value && setStreakLives(value)}
                allowDeselect={false}
                data={["1", "3"]}
              />
            )}
            <Select
              label={trainingT("Tactics.Rush.Order", "Order")}
              value={order}
              onChange={(value) => value && setOrder(value as Order)}
              allowDeselect={false}
              data={[
                { value: "shuffle", label: trainingT("Tactics.Rush.Order.Shuffle", "Shuffled") },
                { value: "set", label: trainingT("Tactics.Rush.Order.Set", "As in the set") },
                {
                  value: "rating",
                  label: trainingT("Tactics.Rush.Order.Rating", "Easiest first"),
                  disabled: !hasRatings,
                },
              ]}
            />
          </SimpleGrid>

          <Stack gap={6}>
            <Text size="sm" fw={500}>
              {trainingT("Tactics.Rush.View", "View")}
            </Text>
            <SegmentedControl
              value={visual}
              onChange={(value) => setVisual(value as Visual)}
              data={[
                { value: "normal", label: trainingT("Tactics.Visual.Normal", "Normal") },
                { value: "noPieces", label: trainingT("Tactics.Visual.NoPieces", "No pieces") },
                {
                  value: "blind",
                  label: trainingT("Tactics.Visual.Blind", "Blind"),
                  disabled: !blindAvailable,
                },
              ]}
            />
            {!blindAvailable && (
              <Text size="xs" c="dimmed">
                {trainingT(
                  "Tactics.Rush.BlindOnlyPuzzles",
                  "Blind needs exercises that start with the opponent's move, like Lichess puzzles.",
                )}
              </Text>
            )}
          </Stack>

          <Button
            size="md"
            leftSection={<IconPlayerPlay size={18} />}
            disabled={!canRun || total === 0}
            onClick={start}
          >
            {trainingT("Tactics.Rush.Start", "Start")}
          </Button>
        </Stack>
      )}

      {phase === "running" && (
        <Group align="flex-start" gap="lg" wrap="nowrap" h="calc(100vh - 90px)">
          <div style={{ flex: 1, minWidth: 0, height: "100%" }}>
            {loadError ? (
              <Alert color="red">{loadError}</Alert>
            ) : !exercise ? (
              <Loader />
            ) : exercise.solutionLines.length === 0 ? (
              <Alert color="yellow">
                {trainingT("Tactics.Rush.NoSolution", "This exercise has no solution; skipped.")}
              </Alert>
            ) : (
              <GuidedTacticsBoard
                key={`${exercise.id}-${position}-${visual}`}
                exercise={exercise}
                startingActor={set.config.startingActor}
                visualization={visualization}
                disabled={answered}
                variationSeed={position}
                hintRequest={0}
                onUserMove={() => {}}
                onCorrect={() => answer(true)}
                onIncorrect={() => answer(false)}
              />
            )}
          </div>
          <Paper withBorder radius="md" p="md" w={260} style={{ flexShrink: 0 }}>
            <Stack gap="sm">
              <Text fw={700}>{formats.find((item) => item.value === format)?.label}</Text>
              {timeLeft !== null && (
                <Stack gap={4}>
                  <Text fz={32} fw={700} ff="monospace" lh={1}>
                    {formatClock(timeLeft)}
                  </Text>
                  <Progress
                    value={(timeLeft / timeTotal) * 100}
                    color={timeLeft < 10_000 ? "red" : "blue"}
                  />
                </Stack>
              )}
              <Group gap="lg">
                <div>
                  <Text size="xs" c="dimmed">
                    {trainingT("Tactics.Rush.Solved", "Solved")}
                  </Text>
                  <Text fw={700} size="xl" c="teal">
                    {counts.solved}
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    {trainingT("Tactics.Rush.Mistakes", "Mistakes")}
                  </Text>
                  <Text fw={700} size="xl" c="red">
                    {counts.failed}
                  </Text>
                </div>
                {format === "streak" && rush && (
                  <div>
                    <Text size="xs" c="dimmed">
                      {trainingT("Tactics.Rush.Lives", "Lives")}
                    </Text>
                    <Text fw={700} size="xl">
                      {rush.lives}
                    </Text>
                  </div>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                {trainingT("Tactics.Rush.Progress", "Exercise {{current}} of {{total}}", {
                  current: position + 1,
                  total: queue.length,
                })}
              </Text>
              <Button variant="default" size="xs" onClick={() => end(rush, counts)}>
                {trainingT("Tactics.Rush.Stop", "Finish now")}
              </Button>
            </Stack>
          </Paper>
        </Group>
      )}

      {phase === "over" && (
        <Stack align="center" gap="md" py="xl" maw={480} mx="auto">
          <ThemeIcon size={64} radius="xl" variant="light" color={newBest ? "yellow" : undefined}>
            <IconTrophy size={34} />
          </ThemeIcon>
          <Title order={3}>
            {newBest
              ? trainingT("Tactics.Rush.NewBest", "New best!")
              : trainingT("Tactics.Rush.Over", "Session over")}
          </Title>
          <Group gap="xl">
            <Stack gap={0} align="center">
              <Text size="xs" c="dimmed">
                {trainingT("Tactics.Rush.Solved", "Solved")}
              </Text>
              <Text fw={700} fz={28} c="teal">
                {counts.solved}
              </Text>
            </Stack>
            <Stack gap={0} align="center">
              <Text size="xs" c="dimmed">
                {trainingT("Tactics.Rush.Mistakes", "Mistakes")}
              </Text>
              <Text fw={700} fz={28} c="red">
                {counts.failed}
              </Text>
            </Stack>
            {format === "streak" && rush && (
              <Stack gap={0} align="center">
                <Text size="xs" c="dimmed">
                  {trainingT("Tactics.Rush.BestRun", "Best run")}
                </Text>
                <Text fw={700} fz={28}>
                  {rush.bestCombo}
                </Text>
              </Stack>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            {trainingT("Tactics.Rush.Best", "Best: {{score}}", {
              score: bestScores[bestKey] ?? 0,
            })}
          </Text>
          <Group>
            <Button variant="default" onClick={() => setPhase("setup")}>
              {trainingT("Tactics.Rush.Change", "Change format")}
            </Button>
            <Button leftSection={<IconPlayerPlay size={16} />} onClick={start}>
              {trainingT("Tactics.Rush.Again", "Play again")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
