import { Alert, Button, Group, Loader, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconEye, IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { PracticeState } from "@/state/atoms";

/** Feedback shown while practicing a single opening line, one message per practice phase. */
export default function OpeningLineFeedback({
  practiceState,
  askLineDifficulty,
  onShowMove,
  onRetry,
  onContinueDeviation,
}: {
  practiceState: PracticeState;
  askLineDifficulty: boolean;
  onShowMove: () => void;
  onRetry: () => void;
  onContinueDeviation: () => void;
}) {
  const { t } = useTranslation();

  switch (practiceState.phase) {
    case "waiting":
      return practiceState.feedback === "correct" ? (
        <Alert
          color="teal"
          icon={<IconCheck size={16} />}
          title={t("Training.Copy.Correctmove.88cf006d", "Correct move")}
        >
          {practiceState.playedMove}{" "}
          {t(
            "Training.Copy.belongstothelineContinue.5e381b89",
            "belongs to the line. Continue with the next move.",
          )}{" "}
        </Alert>
      ) : null;
    case "classifying":
      return (
        <Alert
          color="blue"
          icon={<Loader size="sm" />}
          title={t("Training.Copy.Checkingthedeviation.ed8124df", "Checking the deviation")}
        >
          {" "}
          {t("Training.Copy.Weareevaluating.55aea3a1", "We are evaluating")}{" "}
          {practiceState.playedMove}
          {t(
            "Training.Copy.Thischeckhasashort.7f4b34cf",
            ". This check has a short time limit and the board will automatically become active again.",
          )}{" "}
        </Alert>
      );
    case "revealing":
      return (
        <Alert
          color="blue"
          icon={<IconEye size={16} />}
          title={t("Training.Copy.Moverevealed.bca7b705", "Move revealed")}
        >
          {" "}
          {t("Training.Copy.Observe.69a284b3", "Observe")} {practiceState.answer}
          {t(
            "Training.Copy.Wewillreturntothe.754012fd",
            ". We will return to the position for you to play it; this help counts as one mistake in the line.",
          )}{" "}
        </Alert>
      );
    case "correct":
      return (
        <Alert color={(practiceState.mistakes ?? 0) > 0 ? "yellow" : "teal"}>
          {" "}
          {t("Training.Copy.Linecompletedwith.26e3ff6a", "Line completed with")}{" "}
          {practiceState.mistakes ?? 0} {t("Training.Copy.mistakes.147085ef", "mistakes.")}{" "}
          {askLineDifficulty
            ? t(
                "Training.Copy.Rateitoncetoschedule.5fd50ac4",
                "Rate it once to schedule the entire line.",
              )
            : t(
                "Training.Copy.Difficultywillbecalculatedautomatically.8f496a28",
                "Difficulty will be calculated automatically from mistakes and time.",
              )}
        </Alert>
      );
    case "deviation":
      return (
        <Alert
          color="blue"
          title={t(
            "Training.Copy.Goodmoveoutsidetherepertoire.9858d08a",
            "Good move outside the repertoire",
          )}
        >
          <Stack gap="xs">
            <Text fz="sm">
              {practiceState.playedMove}{" "}
              {t(
                "Training.Copy.keepsanequivalentevaluationbut.dc9f5aca",
                "keeps an equivalent evaluation, but the prepared line continues with",
              )}{" "}
              {practiceState.answer}.
            </Text>
            <Button size="xs" variant="light" onClick={onContinueDeviation}>
              {" "}
              {t(
                "Training.Copy.Continuewiththepreparedline.d39ce71e",
                "Continue with the prepared line",
              )}{" "}
            </Button>
          </Stack>
        </Alert>
      );
    case "incorrect":
      return (
        <Alert
          color={practiceState.feedback === "engine-unavailable" ? "yellow" : "red"}
          icon={
            practiceState.feedback === "engine-unavailable" ? (
              <IconInfoCircle size={16} />
            ) : (
              <IconAlertTriangle size={16} />
            )
          }
          withCloseButton
          onClose={onRetry}
          title={
            practiceState.feedback === "engine-unavailable"
              ? t(
                  "Training.Copy.Couldnotevaluatethedeviation.33721b53",
                  "Could not evaluate the deviation",
                )
              : t("Training.Copy.Incorrectmove.54828596", "Incorrect move")
          }
        >
          <Stack gap="xs">
            <Text size="sm">
              {practiceState.feedback === "engine-unavailable"
                ? t(
                    "Training.Copy.Couldnotcheckwhetherv0.9faa3ff4",
                    "Could not check whether {{v0}} is a good alternative. Practice is still active; try a repertoire move.",
                    { v0: practiceState.playedMove },
                  )
                : practiceState.feedback === "strict"
                  ? t(
                      "Training.Copy.v0isoutsidethisline.94a44046",
                      "{{v0}} is outside this line. Alternative evaluation is disabled; try a repertoire move.",
                      { v0: practiceState.playedMove },
                    )
                  : t(
                      "Training.Copy.v0isoutsidethisline.6936860e",
                      "{{v0}} is outside this line and does not maintain an equivalent evaluation. Try again.",
                      { v0: practiceState.playedMove },
                    )}
            </Text>
            <Group gap="xs">
              <Button
                variant="light"
                size="compact-xs"
                leftSection={<IconEye size={14} />}
                onClick={onShowMove}
              >
                {t("Training.Copy.Showmove.940e6364", "Show move")}
              </Button>
              <Button variant="subtle" size="compact-xs" onClick={onRetry}>
                {t("Training.Copy.Retry.a9254c5f", "Retry")}
              </Button>
            </Group>
          </Stack>
        </Alert>
      );
    default:
      return null;
  }
}
