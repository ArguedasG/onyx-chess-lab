import { Alert, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { IconBulb, IconCheck, IconMessage, IconRepeat, IconSchool } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { PracticeState } from "@/state/atoms";

/**
 * Guidance for Learn mode. Revealed moves and wrong answers during recall reuse the regular line
 * feedback; this component covers the guided stage, the recall prompt and the line result.
 */
export default function OpeningLearnFeedback({
  practiceState,
  comment,
  onRestartGuided,
  onRestartRecall,
  onSkip,
}: {
  practiceState: PracticeState;
  /** Comment of the current position; shown only while guiding. */
  comment: string;
  onRestartGuided: () => void;
  onRestartRecall: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const guided = practiceState.learnStage === "guided";
  const mistakes = practiceState.mistakes ?? 0;

  if (practiceState.phase === "waiting") {
    return (
      <Stack gap="xs">
        {guided ? (
          <Alert
            color="blue"
            icon={<IconSchool size={16} />}
            title={t("OpeningLearn.GuidedTitle", "Learn the line")}
          >
            {t(
              "OpeningLearn.GuidedBody",
              "Play the move shown by the arrow; the opponent replies automatically. Afterwards you will repeat the line from memory.",
            )}
          </Alert>
        ) : (
          <Alert
            color="grape"
            icon={<IconBulb size={16} />}
            title={t("OpeningLearn.RecallTitle", "Now from memory")}
          >
            {t(
              "OpeningLearn.RecallBody",
              "Repeat the line without help. If you complete it without mistakes it will be marked as learned.",
            )}
          </Alert>
        )}
        {practiceState.feedback === "guided-wrong" && (
          <Alert color="orange">
            {t(
              "OpeningLearn.GuidedWrong",
              "{{move}} is not the move of this line. Follow the arrow.",
              {
                move: practiceState.playedMove,
              },
            )}
          </Alert>
        )}
        {guided && comment.trim() && (
          <Paper withBorder p="sm">
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <IconMessage size={16} style={{ flexShrink: 0, marginTop: 3 }} />
              <Text size="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {comment.trim()}
              </Text>
            </Group>
          </Paper>
        )}
      </Stack>
    );
  }

  if (practiceState.phase === "correct" && practiceState.learnStage === "recall") {
    return mistakes === 0 ? (
      <Alert
        color="teal"
        icon={<IconCheck size={16} />}
        title={t("OpeningLearn.Learned", "Line learned!")}
      >
        {t("OpeningLearn.LearnedBody", "It is now part of your practice. Moving on…")}
      </Alert>
    ) : (
      <Alert
        color="yellow"
        icon={<IconRepeat size={16} />}
        title={t("OpeningLearn.AlmostTitle", "Almost there")}
      >
        <Stack gap="xs">
          <Text size="sm">
            {t(
              "OpeningLearn.AlmostBody",
              "You completed the line with {{count}} mistake(s). Repeat it to mark it as learned.",
              { count: mistakes },
            )}
          </Text>
          <Group gap="xs">
            <Button size="compact-sm" variant="light" onClick={onRestartGuided}>
              {t("OpeningLearn.RepeatGuided", "Repeat with guidance")}
            </Button>
            <Button size="compact-sm" variant="light" color="grape" onClick={onRestartRecall}>
              {t("OpeningLearn.RepeatRecall", "Try from memory again")}
            </Button>
            <Button size="compact-sm" variant="subtle" color="gray" onClick={onSkip}>
              {t("OpeningLearn.Skip", "Skip for now")}
            </Button>
          </Group>
        </Stack>
      </Alert>
    );
  }

  return null;
}
