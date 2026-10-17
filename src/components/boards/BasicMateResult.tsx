import { Button, Paper, Stack, Text } from "@mantine/core";
import { IconArrowLeft, IconPlus, IconTrophy, IconX, IconZoomCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { formatMateTime } from "@/components/training/endgames/BasicMatesPanel";
import type { BasicMateRecord } from "@/utils/trainingAreas";

/** End of a timed basic mate: the time, the best time and another random position. */
export function BasicMateResult({
  success,
  timeMs,
  record,
  onNext,
  onAnalyze,
  onBack,
}: {
  success: boolean;
  timeMs: number | null;
  record: BasicMateRecord | undefined;
  onNext: () => void;
  onAnalyze: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const isBest = success && timeMs !== null && record?.bestTimeMs === Math.round(timeMs);
  return (
    <Stack h="100%" justify="space-between">
      <Stack align="center" justify="center" style={{ flex: 1 }} ta="center" gap="xs">
        {success ? (
          <IconTrophy size={52} color="var(--mantine-color-teal-6)" />
        ) : (
          <IconX size={52} color="var(--mantine-color-orange-6)" />
        )}
        <Text fz="xl" fw={700}>
          {success
            ? t("Endgame.Mate.Done", "Mate in {{time}}", { time: formatMateTime(timeMs ?? 0) })
            : t("Endgame.Mate.Failed", "No mate this time")}
        </Text>
        <Text c="dimmed" maw={430}>
          {success
            ? isBest
              ? t("Endgame.Mate.NewBest", "New best time.")
              : record?.bestTimeMs !== null && record?.bestTimeMs !== undefined
                ? t("Endgame.Mate.BestWas", "Your best time is {{time}}.", {
                    time: formatMateTime(record.bestTimeMs),
                  })
                : ""
            : t(
                "Endgame.Mate.FailedDesc",
                "The clock ran out, or the defense reached a draw. A new position is one click away.",
              )}
        </Text>
        {record && (
          <Paper withBorder p="xs" mt="sm">
            <Text size="sm">
              {t("Endgames.Mates.Record", "{{successes}}/{{attempts}} mates", {
                successes: record.successes,
                attempts: record.attempts,
              })}
            </Text>
          </Paper>
        )}
      </Stack>
      <Stack>
        <Button color="teal" leftSection={<IconPlus />} onClick={onNext}>
          {t("Endgame.Mate.Next", "Another position")}
        </Button>
        <Button variant="default" leftSection={<IconZoomCheck />} onClick={onAnalyze}>
          {t("Endgame.AnalyzeGame", "Analyze the game")}
        </Button>
        <Button variant="subtle" leftSection={<IconArrowLeft />} onClick={onBack}>
          {t("Training.BackToEndgames", "Back to endgames")}
        </Button>
      </Stack>
    </Stack>
  );
}
