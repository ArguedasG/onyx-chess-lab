import { Group, Paper, Progress, SimpleGrid, Stack, Text, ThemeIcon, Tooltip } from "@mantine/core";
import { IconCheck, IconFlame, IconTarget, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { getStats } from "@/components/files/opening";
import type { PracticeSessionStats } from "@/state/atoms";

/** Deck scheduling progress plus the running results of the current session. */
export default function PracticeProgressSummary({
  stats,
  sessionStats,
  showSession,
}: {
  stats: ReturnType<typeof getStats>;
  sessionStats: PracticeSessionStats;
  showSession: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Stack gap={4}>
        <Group justify="space-between">
          <Text fz="xs" fw={500}>
            {" "}
            {t(
              "Training.Copy.Chapterschedulingprogress.18c1fd16",
              "Chapter scheduling progress",
            )}{" "}
          </Text>
          <Text fz="xs" c="dimmed">
            {Math.round((stats.practiced / stats.total) * 100)}%
          </Text>
        </Group>
        <Progress.Root size="sm">
          <Tooltip label={`${t("Board.Practice.Practiced")}: ${stats.practiced}`}>
            <Progress.Section value={(stats.practiced / stats.total) * 100} color="blue" />
          </Tooltip>
          <Tooltip label={`${t("Board.Practice.Due")}: ${stats.due}`}>
            <Progress.Section value={(stats.due / stats.total) * 100} color="yellow" />
          </Tooltip>
          <Tooltip label={`${t("Board.Practice.Unseen")}: ${stats.unseen}`}>
            <Progress.Section value={(stats.unseen / stats.total) * 100} color="gray" />
          </Tooltip>
        </Progress.Root>
        <Text fz={10} c="dimmed">
          {" "}
          {t(
            "Training.Copy.PracticedscheduledforlaterDue.36e80822",
            "Practiced: scheduled for later · Due: ready now · Unseen: not attempted yet.",
          )}{" "}
        </Text>
      </Stack>

      <SimpleGrid cols={3} spacing="xs">
        <Paper p="xs" withBorder radius="sm">
          <Text fz={10} tt="uppercase" c="dimmed" fw={600}>
            {t("Board.Practice.Practiced")}
          </Text>
          <Text fz="lg" fw={700} c="blue">
            {stats.practiced}
          </Text>
        </Paper>
        <Paper p="xs" withBorder radius="sm">
          <Text fz={10} tt="uppercase" c="dimmed" fw={600}>
            {t("Board.Practice.Due")}
          </Text>
          <Text fz="lg" fw={700} c="yellow">
            {stats.due}
          </Text>
        </Paper>
        <Paper p="xs" withBorder radius="sm">
          <Text fz={10} tt="uppercase" c="dimmed" fw={600}>
            {t("Board.Practice.Unseen")}
          </Text>
          <Text fz="lg" fw={700} c="dimmed">
            {stats.unseen}
          </Text>
        </Paper>
      </SimpleGrid>

      {showSession && (
        <Stack gap={4}>
          <Text fz="xs" fw={500}>
            {" "}
            {t("Training.Copy.Sessionresults.0ab10548", "Session results")}{" "}
          </Text>
          <Text fz={10} c="dimmed">
            {" "}
            {t(
              "Training.Copy.Inlinepracticecorrectmeans.7f7dc36c",
              "In line practice, correct means completed without mistakes; incorrect means completed with one or more mistakes.",
            )}{" "}
          </Text>
          <SimpleGrid cols={3} spacing="xs">
            <Paper p="xs" withBorder radius="sm">
              <Group gap={4} wrap="nowrap">
                <ThemeIcon size="xs" color="green" variant="transparent">
                  <IconCheck size={12} />
                </ThemeIcon>
                <Text fz={10} tt="uppercase" c="dimmed" fw={600}>
                  {t("Board.Practice.SessionCorrect")}
                </Text>
              </Group>
              <Text fz="lg" fw={700} c="green">
                {sessionStats.correct}
              </Text>
            </Paper>
            <Paper p="xs" withBorder radius="sm">
              <Group gap={4} wrap="nowrap">
                <ThemeIcon size="xs" color="red" variant="transparent">
                  <IconX size={12} />
                </ThemeIcon>
                <Text fz={10} tt="uppercase" c="dimmed" fw={600}>
                  {t("Board.Practice.SessionIncorrect")}
                </Text>
              </Group>
              <Text fz="lg" fw={700} c="red">
                {sessionStats.incorrect}
              </Text>
            </Paper>
            <Paper p="xs" withBorder radius="sm">
              <Group gap={4} wrap="nowrap">
                {sessionStats.correct + sessionStats.incorrect > 0 ? (
                  <ThemeIcon size="xs" color="teal" variant="transparent">
                    <IconTarget size={12} />
                  </ThemeIcon>
                ) : (
                  <ThemeIcon size="xs" color="orange" variant="transparent">
                    <IconFlame size={12} />
                  </ThemeIcon>
                )}
                <Text fz={10} tt="uppercase" c="dimmed" fw={600}>
                  {sessionStats.correct + sessionStats.incorrect > 0
                    ? t("Board.Practice.Accuracy")
                    : t("Board.Practice.Streak")}
                </Text>
              </Group>
              <Text
                fz="lg"
                fw={700}
                c={sessionStats.correct + sessionStats.incorrect > 0 ? "teal" : "orange"}
              >
                {sessionStats.correct + sessionStats.incorrect > 0
                  ? `${Math.round(
                      (sessionStats.correct / (sessionStats.correct + sessionStats.incorrect)) *
                        100,
                    )}%`
                  : sessionStats.streak}
              </Text>
            </Paper>
          </SimpleGrid>
        </Stack>
      )}
    </>
  );
}
