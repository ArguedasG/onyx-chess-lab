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
import { IconArrowRight, IconFolder, IconPlayerPlay, IconTrophy } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/common/Modal";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { formatMoveList } from "@/utils/repertoireGaps";
import { describeTacticsSolution, getPreparedSolutionLine } from "@/utils/tacticsSolution";
import { loadTacticsExercise, type TacticsLoadedExercise } from "@/utils/tacticsTraining";
import {
  buildTacticsCourseQueue,
  getTacticsFirstIncompleteIndex,
  recordTacticsAttempt,
  setTacticsResumeIndex,
  type TacticsCourse,
  type TacticsCourseQueueItem,
} from "@/utils/trainingAreas";
import { GuidedTacticsBoard } from "./TacticsBoards";

type Source = "all" | "pending" | "mistakes";
type Order = "shuffle" | "course";
type Phase = "setup" | "running" | "over";

/**
 * Trains a whole course at once: its themes' exercises mixed (or in course order), filtered to the
 * pending ones or the ones failed before. Every answer counts in its own set's progress, as in a
 * guided session; Woodpecker cycles are left alone.
 */
export default function CourseMixSession({
  course,
  onClose,
}: {
  course: TacticsCourse | null;
  onClose: () => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const [areas, setAreas] = useAtom(trainingAreasAtom);
  const [phase, setPhase] = useState<Phase>("setup");
  const [source, setSource] = useState<Source>("pending");
  const [order, setOrder] = useState<Order>("shuffle");
  const [size, setSize] = useState("20");
  const [queue, setQueue] = useState<TacticsCourseQueueItem[]>([]);
  const [position, setPosition] = useState(0);
  const [exercise, setExercise] = useState<TacticsLoadedExercise | null>(null);
  const [loadError, setLoadError] = useState("");
  const [outcome, setOutcome] = useState<"correct" | "incorrect" | null>(null);
  const [counts, setCounts] = useState({ solved: 0, failed: 0 });
  const startedAt = useRef(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (course) return;
    setPhase("setup");
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, [course]);

  // How many exercises each filter would give, to show it before starting.
  const preview = useMemo(
    () =>
      course
        ? buildTacticsCourseQueue(areas.tactics, course, { source, order: "course", size: 0 })
        : { queue: [], skippedSetIds: [] },
    [areas.tactics, course, source],
  );

  const item = queue[position];
  const set = item ? areas.tactics.sets[item.setId] : undefined;

  useEffect(() => {
    if (phase !== "running" || !item) return;
    const current = areas.tactics.sets[item.setId];
    if (!current) return;
    let cancelled = false;
    setExercise(null);
    setLoadError("");
    setOutcome(null);
    void loadTacticsExercise(current, areas.tactics.exercises, item.index)
      .then((loaded) => {
        if (cancelled) return;
        // Records without a prepared solution cannot be judged here: skip them.
        if (loaded.solutionLines.length === 0) {
          advance();
          return;
        }
        setExercise(loaded);
        startedAt.current = Date.now();
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
    // The queue is fixed while a session runs; recording answers must not reload the exercise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, position, queue]);

  if (!course) return null;

  function start() {
    if (!course) return;
    const built = buildTacticsCourseQueue(areas.tactics, course, {
      source,
      order,
      size: Number(size),
    });
    setQueue(built.queue);
    setPosition(0);
    setCounts({ solved: 0, failed: 0 });
    setPhase(built.queue.length > 0 ? "running" : "over");
  }

  function advance() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setPosition((value) => {
      if (value + 1 >= queue.length) {
        setPhase("over");
        return value;
      }
      return value + 1;
    });
  }

  function answer(correct: boolean, playedMove: string | null) {
    if (outcome || !exercise || !item || !set) return;
    setOutcome(correct ? "correct" : "incorrect");
    setCounts((previous) => ({
      solved: previous.solved + (correct ? 1 : 0),
      failed: previous.failed + (correct ? 0 : 1),
    }));
    const { setId } = item;
    const woodpecker = set.config.mode === "woodpecker";
    setAreas((previous) => {
      let tactics = recordTacticsAttempt(previous.tactics, {
        setId,
        exerciseId: exercise.id,
        playedMove,
        outcome: correct ? "correct" : "incorrect",
        timeMs: Date.now() - startedAt.current,
        cycleNumber: null,
      });
      if (correct && !woodpecker) {
        tactics = setTacticsResumeIndex(
          tactics,
          setId,
          getTacticsFirstIncompleteIndex(tactics, setId),
        );
      }
      return { ...previous, tactics };
    });
    // A solved exercise moves on by itself; a missed one waits to show its solution.
    if (correct) advanceTimer.current = setTimeout(advance, 700);
  }

  const solution = exercise ? getPreparedSolutionLine(exercise.solutionLines) : null;
  const solutionText =
    exercise && solution
      ? formatMoveList(exercise.fen, describeTacticsSolution(exercise.fen, solution).sanMoves)
      : "";
  const answered = counts.solved + counts.failed;
  const skippedThemes = preview.skippedSetIds.length;

  return (
    <Modal
      opened
      onClose={onClose}
      fullScreen
      title={
        <Group gap="xs">
          <IconFolder size={18} />
          <Text fw={700}>
            {trainingT("Tactics.CourseMix.Title", "Train the folder · {{name}}", {
              name: course.name,
            })}
          </Text>
        </Group>
      }
    >
      {phase === "setup" && (
        <Stack maw={640} mx="auto" gap="lg" py="md">
          <Text c="dimmed" size="sm">
            {trainingT(
              "Tactics.CourseMix.Intro",
              "Exercises from all the folder's sets in one session. Each answer counts in its own set's progress.",
            )}
          </Text>
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              {trainingT("Tactics.CourseMix.Source", "Exercises")}
            </Text>
            <SegmentedControl
              value={source}
              onChange={(value) => setSource(value as Source)}
              data={[
                {
                  value: "pending",
                  label: trainingT("Tactics.CourseMix.Pending", "Not solved yet"),
                },
                {
                  value: "mistakes",
                  label: trainingT("Tactics.CourseMix.Mistakes", "Failed before"),
                },
                { value: "all", label: trainingT("Tactics.CourseMix.All", "All") },
              ]}
            />
            <Text size="xs" c="dimmed">
              {trainingT("Tactics.CourseMix.Available", "{{n}} exercises available", {
                n: preview.queue.length.toLocaleString(),
              })}
            </Text>
          </Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select
              label={trainingT("Tactics.CourseMix.Size", "Session size")}
              value={size}
              onChange={(value) => value && setSize(value)}
              allowDeselect={false}
              data={[
                ...["10", "20", "50", "100"].map((value) => ({
                  value,
                  label: trainingT("Tactics.CourseMix.SizeN", "{{n}} exercises", { n: value }),
                })),
                { value: "0", label: trainingT("Tactics.CourseMix.SizeAll", "All available") },
              ]}
            />
            <Select
              label={trainingT("Tactics.Rush.Order", "Order")}
              value={order}
              onChange={(value) => value && setOrder(value as Order)}
              allowDeselect={false}
              data={[
                { value: "shuffle", label: trainingT("Tactics.CourseMix.Shuffle", "Sets mixed") },
                { value: "course", label: trainingT("Tactics.CourseMix.InOrder", "Folder order") },
              ]}
            />
          </SimpleGrid>
          {skippedThemes > 0 && (
            <Alert color="yellow">
              {trainingT(
                "Tactics.CourseMix.EngineSkipped",
                "{{n}} sets are checked by the engine and are left out of mixed sessions; train them on their own.",
                { n: skippedThemes },
              )}
            </Alert>
          )}
          <Button
            size="md"
            color="orange"
            leftSection={<IconPlayerPlay size={18} />}
            disabled={preview.queue.length === 0}
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
              <Stack>
                <Alert color="red">{loadError}</Alert>
                <Button variant="default" onClick={advance} w="fit-content">
                  {trainingT("Tactics.CourseMix.Skip", "Skip")}
                </Button>
              </Stack>
            ) : !exercise || !set ? (
              <Loader />
            ) : (
              <GuidedTacticsBoard
                key={`${item?.setId}-${exercise.id}-${position}`}
                exercise={exercise}
                startingActor={set.config.startingActor}
                visualization={{ kind: "normal" }}
                disabled={outcome !== null}
                variationSeed={position}
                hintRequest={0}
                onUserMove={() => {}}
                onCorrect={(move) => answer(true, move)}
                onIncorrect={(move) => answer(false, move)}
              />
            )}
          </div>
          <Paper withBorder radius="md" p="md" w={280} style={{ flexShrink: 0 }}>
            <Stack gap="sm">
              {set && (
                <div>
                  <Text size="xs" c="dimmed">
                    {trainingT("Tactics.CourseMix.Theme", "Set")}
                  </Text>
                  <Text fw={700}>{set.name}</Text>
                  {exercise?.title && (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {exercise.title}
                    </Text>
                  )}
                </div>
              )}
              <Progress value={(answered / queue.length) * 100} color="orange" />
              <Text size="xs" c="dimmed">
                {trainingT("Tactics.Rush.Progress", "Exercise {{current}} of {{total}}", {
                  current: position + 1,
                  total: queue.length,
                })}
              </Text>
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
              </Group>
              {outcome === "correct" && (
                <Badge color="teal" variant="light" size="lg">
                  {trainingT("Tactics.CourseMix.Correct", "Correct")}
                </Badge>
              )}
              {outcome === "incorrect" && (
                <Stack gap="xs">
                  <Alert color="red" p="xs">
                    <Text size="sm" fw={600}>
                      {trainingT("Tactics.CourseMix.Solution", "Solution")}
                    </Text>
                    <Text size="sm">{solutionText}</Text>
                  </Alert>
                  <Button
                    color="orange"
                    rightSection={<IconArrowRight size={16} />}
                    onClick={advance}
                  >
                    {trainingT("Tactics.CourseMix.Next", "Next exercise")}
                  </Button>
                </Stack>
              )}
              <Button
                variant="default"
                size="xs"
                onClick={() => {
                  if (advanceTimer.current) clearTimeout(advanceTimer.current);
                  setPhase("over");
                }}
              >
                {trainingT("Tactics.Rush.Stop", "Finish now")}
              </Button>
            </Stack>
          </Paper>
        </Group>
      )}

      {phase === "over" && (
        <Stack align="center" gap="md" py="xl" maw={480} mx="auto">
          <ThemeIcon size={64} radius="xl" variant="light" color="orange">
            <IconTrophy size={34} />
          </ThemeIcon>
          <Title order={3}>
            {queue.length === 0
              ? trainingT("Tactics.CourseMix.Empty", "No exercises match this filter.")
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
          </Group>
          <Group>
            <Button variant="default" onClick={() => setPhase("setup")}>
              {trainingT("Tactics.CourseMix.NewSession", "New session")}
            </Button>
            <Button color="orange" onClick={onClose}>
              {trainingT("Tactics.CourseMix.Close", "Back to the folder")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
