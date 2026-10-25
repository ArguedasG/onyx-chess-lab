import { useTranslation as useTrainingTranslation } from "react-i18next";
import { Alert, Badge, Box, Button, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { IconHelpCircle, IconPlayerPlay, IconSearch } from "@tabler/icons-react";
import { Chessground } from "@/chessground/Chessground";
import type { EndgameOutcomeGuess, EndgamePosition } from "@/utils/trainingAreas";

export type OutcomeQuizState = {
  position: EndgamePosition;
  setId: string;
  startedAt: number;
  result: null | {
    guess: EndgameOutcomeGuess | null;
    expected: EndgameOutcomeGuess;
    correct: boolean;
  };
};

/** «What is the result with best play?» before moving any piece. */
export function EndgameOutcomeQuiz({
  quiz,
  onClose,
  onAnswer,
  onAnalyze,
  onPlay,
}: {
  quiz: OutcomeQuizState | null;
  onClose: () => void;
  onAnswer: (guess: EndgameOutcomeGuess | null) => void;
  onAnalyze: (position: EndgamePosition) => void;
  onPlay: (position: EndgamePosition, setId: string) => void;
}) {
  const { t: trainingT } = useTrainingTranslation();

  function outcomeGuessLabel(guess: EndgameOutcomeGuess) {
    if (guess === "white") return trainingT("Endgames.Quiz.WhiteWins", "White wins");
    if (guess === "black") return trainingT("Endgames.Quiz.BlackWins", "Black wins");
    return trainingT("Endgames.Quiz.Draw", "Draw");
  }

  return (
    <Modal opened={quiz !== null} onClose={onClose} title={quiz?.position.title} fullScreen>
      {quiz && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
          <Box w="min(84vh, 100%)" mx="auto">
            <Chessground
              fen={quiz.position.fen}
              orientation={quiz.position.studentColor}
              coordinates
              viewOnly
            />
          </Box>
          <Stack justify="center">
            <div>
              <Badge color="orange" variant="light">
                {quiz.position.fen.trim().split(/\s+/)[1] === "b"
                  ? trainingT("Endgames.Quiz.BlackToMove", "Black to move")
                  : trainingT("Endgames.Quiz.WhiteToMove", "White to move")}
              </Badge>
              <Title order={4} mt="sm">
                {trainingT("Endgames.Quiz.Question", "What is the result with best play?")}
              </Title>
              <Text size="sm" c="dimmed" mt={4}>
                {trainingT(
                  "Endgames.Quiz.Instruction",
                  "Evaluate the initial position before moving any piece.",
                )}
              </Text>
            </div>

            {!quiz.result ? (
              <Stack gap="xs">
                <Button variant="light" onClick={() => onAnswer("white")}>
                  {trainingT("Endgames.Quiz.WhiteWins", "White wins")}
                </Button>
                <Button variant="light" onClick={() => onAnswer("draw")}>
                  {trainingT("Endgames.Quiz.Draw", "Draw")}
                </Button>
                <Button variant="light" onClick={() => onAnswer("black")}>
                  {trainingT("Endgames.Quiz.BlackWins", "Black wins")}
                </Button>
                <Button
                  variant="default"
                  leftSection={<IconHelpCircle size={16} />}
                  onClick={() => onAnswer(null)}
                >
                  {trainingT("Endgames.Quiz.ShowAnswer", "I don't know · Show answer")}
                </Button>
                <Button
                  color="teal"
                  variant="light"
                  leftSection={<IconPlayerPlay size={16} />}
                  onClick={() => onPlay(quiz.position, quiz.setId)}
                >
                  {trainingT("Endgames.Quiz.PlayDirectly", "Play directly")}
                </Button>
              </Stack>
            ) : (
              <Stack>
                <Alert
                  color={
                    quiz.result.correct ? "teal" : quiz.result.guess === null ? "yellow" : "red"
                  }
                >
                  <Text fw={600}>
                    {quiz.result.correct
                      ? trainingT("Endgames.Quiz.Correct", "Correct")
                      : quiz.result.guess === null
                        ? trainingT(
                            "Endgames.Quiz.Revealed",
                            "Answer shown · counted as a failed attempt",
                          )
                        : trainingT("Endgames.Quiz.Incorrect", "Not quite")}
                  </Text>
                  <Text size="sm">
                    {trainingT("Endgames.Quiz.Answer", "The theoretical result is: {{result}}.", {
                      result: outcomeGuessLabel(quiz.result.expected),
                    })}
                  </Text>
                </Alert>
                <Text size="sm" c="dimmed">
                  {trainingT(
                    "Endgames.Quiz.NextStep",
                    "Analyze the position to understand it, or demonstrate the result by playing the current endgame exercise.",
                  )}
                </Text>
                <Button
                  variant="default"
                  leftSection={<IconSearch size={16} />}
                  onClick={() => onAnalyze(quiz.position)}
                >
                  {trainingT("Endgames.Quiz.Analyze", "Analyze position")}
                </Button>
                <Button
                  color="teal"
                  leftSection={<IconPlayerPlay size={16} />}
                  onClick={() => onPlay(quiz.position, quiz.setId)}
                >
                  {trainingT("Endgames.Quiz.Demonstrate", "Demonstrate by playing")}
                </Button>
              </Stack>
            )}
          </Stack>
        </SimpleGrid>
      )}
    </Modal>
  );
}
