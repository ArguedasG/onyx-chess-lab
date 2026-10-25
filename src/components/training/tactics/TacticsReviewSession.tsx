import { useTranslation as useTrainingTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import {
  IconArrowRight,
  IconBulb,
  IconCheck,
  IconEye,
  IconRefresh,
  IconTrophy,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { formatThemeLabel } from "@/utils/format";
import { formatMoveList } from "@/utils/repertoireGaps";
import { playUci } from "@/utils/repertoireGenerator/positions";
import type { TacticsReviewItem, TacticsReviewResult } from "@/utils/tacticsReview";
import { GuidedTacticsBoard } from "./TacticsBoards";

/** SAN of a UCI line from a position, for the solution text. */
function solutionText(fen: string, moves: string[]) {
  const sans: string[] = [];
  let current = fen;
  for (const uci of moves) {
    const played = playUci(current, uci);
    if (!played) break;
    sans.push(played.san);
    current = played.fen;
  }
  return formatMoveList(fen, sans);
}

/**
 * Review of missed tactics (I-06): the due items in order, solved on the board. Solving at the
 * first try schedules the item further away; a hint makes it "hard" and a miss brings it back
 * soon.
 */
export default function TacticsReviewSession({
  items,
  onResult,
  onClose,
}: {
  items: TacticsReviewItem[];
  onResult: (item: TacticsReviewItem, result: TacticsReviewResult) => void;
  onClose: () => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [hintRequest, setHintRequest] = useState(0);
  const [assisted, setAssisted] = useState(false);
  const [recorded, setRecorded] = useState<TacticsReviewResult | null>(null);
  const [solved, setSolved] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [results, setResults] = useState<TacticsReviewResult[]>([]);
  const item = items[index];
  const finished = index >= items.length;

  function record(result: TacticsReviewResult) {
    if (!item || recorded) return;
    setRecorded(result);
    setResults((current) => [...current, result]);
    onResult(item, result);
  }

  function next() {
    setIndex((value) => value + 1);
    setAttempt(0);
    setHintRequest(0);
    setAssisted(false);
    setRecorded(null);
    setSolved(false);
    setShowSolution(false);
  }

  const studentTurn = item
    ? (item.fen.split(" ")[1] === "b") !== item.opponentFirst
      ? "black"
      : "white"
    : "white";

  return (
    <Modal
      opened
      onClose={onClose}
      fullScreen
      title={trainingT("Tactics.Review.Title", "Tactics review")}
    >
      {finished ? (
        <Stack align="center" py="xl" maw={480} mx="auto">
          <ThemeIcon size={64} radius="xl" variant="light" color="teal">
            <IconTrophy size={36} />
          </ThemeIcon>
          <Title order={3}>{trainingT("Tactics.Review.Done", "Review completed")}</Title>
          <Text c="dimmed" ta="center">
            {trainingT(
              "Tactics.Review.Summary",
              "{{solved}} solved at the first try, {{hard}} with help and {{failed}} missed. Missed ones come back soon.",
              {
                solved: results.filter((result) => result === "solved").length,
                hard: results.filter((result) => result === "hard").length,
                failed: results.filter((result) => result === "failed").length,
              },
            )}
          </Text>
          <Button onClick={onClose}>{trainingT("Tactics.Review.Close", "Close")}</Button>
        </Stack>
      ) : (
        item && (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" h="calc(100vh - 110px)">
            <Box h="100%" style={{ display: "flex", justifyContent: "center", minHeight: 0 }}>
              <GuidedTacticsBoard
                key={`${item.id}-${attempt}`}
                exercise={{ fen: item.fen, solutionLines: [item.solution] }}
                startingActor={item.opponentFirst ? "opponent" : "student"}
                disabled={solved}
                variationSeed={0}
                hintRequest={hintRequest}
                onUserMove={() => {}}
                onCorrect={() => {
                  setSolved(true);
                  record(assisted || attempt > 0 ? "hard" : "solved");
                }}
                onIncorrect={() => {
                  record("failed");
                  setTimeout(() => setAttempt((value) => value + 1), 700);
                }}
              />
            </Box>
            <Stack justify="center" maw={460}>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {trainingT("Tactics.Review.Progress", "{{current}} of {{total}}", {
                    current: index + 1,
                    total: items.length,
                  })}
                </Text>
                <Badge variant="light" color={item.source === "puzzles" ? "orange" : "blue"}>
                  {item.source === "puzzles"
                    ? trainingT("Tactics.Review.FromPuzzles", "Puzzle trainer")
                    : trainingT("Tactics.Review.FromSet", "Set")}
                </Badge>
              </Group>
              <Progress value={(index / items.length) * 100} size="sm" />
              <div>
                <Title order={3}>
                  {studentTurn === "white"
                    ? trainingT("Training.Tactics.WhiteToMove", "White to move")
                    : trainingT("Training.Tactics.BlackToMove", "Black to move")}
                </Title>
                <Text size="sm" c="dimmed" mt={4}>
                  {item.label}
                </Text>
                {item.themes.length > 0 && (
                  <Group gap={4} mt="xs">
                    {item.themes.slice(0, 6).map((theme) => (
                      <Badge key={theme} size="xs" variant="outline">
                        {formatThemeLabel(theme)}
                      </Badge>
                    ))}
                  </Group>
                )}
              </div>

              {recorded === "failed" && !solved && (
                <Alert color="red" icon={<IconX size={16} />} p="xs">
                  {trainingT(
                    "Tactics.Review.Missed",
                    "Not that one. It will come back soon; try again to finish it.",
                  )}
                </Alert>
              )}
              {solved && (
                <Alert color="teal" icon={<IconCheck size={16} />} p="xs">
                  {recorded === "solved"
                    ? trainingT("Tactics.Review.Solved", "Solved. It will come back later.")
                    : trainingT("Tactics.Review.SolvedHard", "Solved with help.")}
                </Alert>
              )}
              {showSolution && (
                <Alert color="gray" p="xs">
                  {solutionText(item.fen, item.solution)}
                </Alert>
              )}

              <Group>
                {!solved && (
                  <>
                    <Button
                      variant="default"
                      leftSection={<IconBulb size={16} />}
                      onClick={() => {
                        setAssisted(true);
                        setHintRequest((value) => value + 1);
                      }}
                    >
                      {trainingT("Training.Tactics.Hint.Button", "Hint")}
                    </Button>
                    <Button
                      variant="default"
                      leftSection={<IconEye size={16} />}
                      onClick={() => {
                        setShowSolution(true);
                        record("failed");
                      }}
                    >
                      {trainingT("Training.Tactics.Solution.Title", "View solution")}
                    </Button>
                    {recorded === "failed" && (
                      <Button
                        variant="subtle"
                        leftSection={<IconRefresh size={16} />}
                        onClick={() => setAttempt((value) => value + 1)}
                      >
                        {trainingT("Training.Copy.Retry.a9254c5f", "Retry")}
                      </Button>
                    )}
                  </>
                )}
                {(solved || recorded === "failed") && (
                  <Button rightSection={<IconArrowRight size={16} />} onClick={next}>
                    {index + 1 < items.length
                      ? trainingT("Tactics.Review.Next", "Next")
                      : trainingT("Tactics.Review.Finish", "Finish")}
                  </Button>
                )}
              </Group>
            </Stack>
          </SimpleGrid>
        )
      )}
    </Modal>
  );
}
