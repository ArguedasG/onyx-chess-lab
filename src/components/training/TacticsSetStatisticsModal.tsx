import {
  Alert,
  Badge,
  Card,
  Divider,
  Group,
  Modal,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconChartBar, IconClock, IconTargetArrow } from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation as useTrainingTranslation } from "react-i18next";
import {
  getTacticsSetStatistics,
  type TacticsAttemptStatistics,
  type TacticsCycleStatistics,
  type TacticsSet,
  type TacticsState,
} from "@/utils/trainingAreas";

type Props = {
  opened: boolean;
  onClose: () => void;
  set: TacticsSet;
  state: TacticsState;
};

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "—";
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return `${totalMinutes} min ${seconds.toString().padStart(2, "0")} s`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${minutes.toString().padStart(2, "0")} min`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card withBorder padding="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl">
        {value}
      </Text>
      {detail && (
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      )}
    </Card>
  );
}

function accuracyDetail(stats: Pick<TacticsAttemptStatistics, "correct" | "evaluated">) {
  return `${stats.correct.toLocaleString()} / ${stats.evaluated.toLocaleString()}`;
}

function cycleAccuracyDetail(stats: TacticsCycleStatistics) {
  return `${stats.completedCount.toLocaleString()} / ${stats.evaluated.toLocaleString()}`;
}

export default function TacticsSetStatisticsModal({ opened, onClose, set, state }: Props) {
  const { t } = useTrainingTranslation();
  const statistics = useMemo(() => getTacticsSetStatistics(state, set.id), [set.id, state]);

  if (!statistics) return null;
  const recentEvolution = statistics.evolution.slice(-8);
  const completedCycles = [...statistics.completedCycles].reverse();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Training.Tactics.Stats.Title", "Statistics · {{set}}", { set: set.name })}
      size="xl"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="lg">
        {statistics.overall.attempts === 0 && statistics.completedCycles.length === 0 && (
          <Alert color="blue" icon={<IconChartBar size={18} />}>
            {t(
              "Training.Tactics.Stats.Empty",
              "This set has no recorded attempts yet. Its statistics will appear after you start practicing.",
            )}
          </Alert>
        )}

        <section>
          <Group justify="space-between" mb="sm">
            <Title order={4}>{t("Training.Tactics.Stats.Overall", "Overall performance")}</Title>
            <Badge variant="light" leftSection={<IconTargetArrow size={13} />}>
              {t("Training.Tactics.Stats.RecordedAttempts", "{{v0}} recorded attempts", {
                v0: statistics.overall.attempts.toLocaleString(),
              })}
            </Badge>
          </Group>
          <SimpleGrid cols={{ base: 2, sm: 3 }}>
            <Metric
              label={t("Training.Tactics.Stats.Correct", "Correct")}
              value={statistics.overall.correct.toLocaleString()}
            />
            <Metric
              label={t("Training.Tactics.Stats.Errors", "Errors")}
              value={statistics.overall.incorrect.toLocaleString()}
            />
            <Metric
              label={t("Training.Tactics.Stats.Accuracy", "Accuracy")}
              value={formatPercent(statistics.overall.accuracyPercent)}
              detail={t("Training.Tactics.Stats.EvaluableSample", "{{sample}} evaluable", {
                sample: accuracyDetail(statistics.overall),
              })}
            />
            <Metric
              label={t("Training.Tactics.Stats.TotalTime", "Total attempt time")}
              value={formatDuration(statistics.overall.totalTimeMs)}
            />
            <Metric
              label={t("Training.Tactics.Stats.AverageTime", "Average per attempt")}
              value={formatDuration(statistics.overall.averageTimeMs)}
            />
            <Metric
              label={t("Training.Tactics.Stats.Unsupported", "Not evaluable")}
              value={statistics.overall.unsupported.toLocaleString()}
              detail={t("Training.Tactics.Stats.Excluded", "Excluded from accuracy")}
            />
          </SimpleGrid>
          <Card withBorder mt="sm" padding="sm">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                {t("Training.Tactics.Stats.Coverage", "Set coverage")}
              </Text>
              <Text size="sm">
                {t(
                  "Training.Tactics.Stats.SolvedCoverage",
                  "{{solved}} solved · {{attempted}} attempted · {{total}} total",
                  {
                    solved: statistics.solvedExercises.toLocaleString(),
                    attempted: statistics.attemptedExercises.toLocaleString(),
                    total: statistics.totalExercises.toLocaleString(),
                  },
                )}
              </Text>
            </Group>
            <Progress.Root size="lg" mt="xs">
              <Progress.Section value={statistics.solvedPercent} color="teal" />
              <Progress.Section
                value={Math.max(0, statistics.attemptedPercent - statistics.solvedPercent)}
                color="orange"
              />
            </Progress.Root>
            <Group gap="lg" mt={6}>
              <Text size="xs" c="teal">
                {t("Training.Tactics.Stats.Solved", "Solved")}{" "}
                {formatPercent(statistics.solvedPercent)}
              </Text>
              <Text size="xs" c="orange">
                {t("Training.Tactics.Stats.Attempted", "Attempted")}{" "}
                {formatPercent(statistics.attemptedPercent)}
              </Text>
            </Group>
          </Card>
        </section>

        {set.config.mode === "woodpecker" && (
          <section>
            <Divider mb="md" />
            <Title order={4} mb="sm">
              {t("Training.Tactics.Stats.CurrentCycle", "Current cycle")}
            </Title>
            {statistics.activeCycle ? (
              <Card withBorder>
                <Group justify="space-between" mb="sm">
                  <Text fw={700}>
                    {t("Training.Tactics.Stats.CycleNumber", "Cycle {{number}}", {
                      number: statistics.activeCycle.number,
                    })}
                  </Text>
                  <Badge color="orange">
                    {t("Training.Tactics.Stats.InProgress", "In progress")}
                  </Badge>
                </Group>
                <Progress
                  value={
                    statistics.activeCycle.exerciseCount > 0
                      ? (statistics.activeCycle.completedCount /
                          statistics.activeCycle.exerciseCount) *
                        100
                      : 0
                  }
                  color="orange"
                />
                <SimpleGrid cols={{ base: 2, sm: 4 }} mt="md">
                  <Metric
                    label={t("Training.Tactics.Stats.Completed", "Completed")}
                    value={`${statistics.activeCycle.completedCount}/${statistics.activeCycle.exerciseCount}`}
                  />
                  <Metric
                    label={t("Training.Tactics.Stats.Errors", "Errors")}
                    value={statistics.activeCycle.failures.toLocaleString()}
                  />
                  <Metric
                    label={t("Training.Tactics.Stats.Accuracy", "Accuracy")}
                    value={formatPercent(statistics.activeCycle.accuracyPercent)}
                    detail={t("Training.Tactics.Stats.EvaluableSample", "{{sample}} evaluable", {
                      sample: cycleAccuracyDetail(statistics.activeCycle),
                    })}
                  />
                  <Metric
                    label={t("Training.Tactics.Stats.SavedTime", "Saved cycle time")}
                    value={formatDuration(statistics.activeCycle.timeMs)}
                  />
                </SimpleGrid>
              </Card>
            ) : (
              <Text size="sm" c="dimmed">
                {t(
                  "Training.Tactics.Stats.NoCurrentCycle",
                  "There is no active cycle. Starting the set will create the next one.",
                )}
              </Text>
            )}
          </section>
        )}

        <section>
          <Divider mb="md" />
          <Group justify="space-between" mb="sm">
            <Title order={4}>{t("Training.Tactics.Stats.Evolution", "Recent evolution")}</Title>
            <Text size="xs" c="dimmed">
              {t("Training.Tactics.Stats.LastDays", "Last {{count}} active days", {
                count: recentEvolution.length,
              })}
            </Text>
          </Group>
          {recentEvolution.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t(
                "Training.Tactics.Stats.NoEvolution",
                "There is no attempt history to compare yet.",
              )}
            </Text>
          ) : (
            <Stack gap="xs">
              {recentEvolution.map((point) => (
                <Card key={point.date} withBorder padding="xs">
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" w={110}>
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                        new Date(`${point.date}T12:00:00`),
                      )}
                    </Text>
                    <Progress
                      value={point.accuracyPercent ?? 0}
                      color={point.accuracyPercent === null ? "gray" : "teal"}
                      style={{ flex: 1 }}
                    />
                    <Text size="sm" fw={600} ta="right" w={72}>
                      {formatPercent(point.accuracyPercent)}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" ta="right" mt={3}>
                    {t(
                      "Training.Tactics.Stats.DaySample",
                      "{{correct}} correct of {{evaluated}} evaluable · {{attempts}} attempts · avg. {{average}}",
                      {
                        correct: point.correct.toLocaleString(),
                        evaluated: point.evaluated.toLocaleString(),
                        attempts: point.attempts.toLocaleString(),
                        average: formatDuration(point.averageTimeMs),
                      },
                    )}
                  </Text>
                </Card>
              ))}
            </Stack>
          )}
        </section>

        {set.config.mode === "woodpecker" && (
          <section>
            <Divider mb="md" />
            <Title order={4} mb="sm">
              {t("Training.Tactics.Stats.CycleHistory", "Completed cycle history")}
            </Title>
            {completedCycles.length === 0 ? (
              <Text size="sm" c="dimmed">
                {t("Training.Tactics.Stats.NoCycles", "No cycles have been completed yet.")}
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={680}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("Training.Tactics.Stats.Cycle", "Cycle")}</Table.Th>
                      <Table.Th>{t("Training.Tactics.Stats.Date", "Date")}</Table.Th>
                      <Table.Th>{t("Training.Tactics.Stats.Completed", "Completed")}</Table.Th>
                      <Table.Th>{t("Training.Tactics.Stats.Errors", "Errors")}</Table.Th>
                      <Table.Th>{t("Training.Tactics.Stats.Accuracy", "Accuracy")}</Table.Th>
                      <Table.Th>{t("Training.Tactics.Stats.Time", "Time")}</Table.Th>
                      <Table.Th>{t("Training.Tactics.Stats.Average", "Average")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {completedCycles.map((cycle) => (
                      <Table.Tr key={`${set.id}-${cycle.number}`}>
                        <Table.Td>{cycle.number}</Table.Td>
                        <Table.Td>
                          {cycle.completedAt
                            ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                                new Date(cycle.completedAt),
                              )
                            : "—"}
                        </Table.Td>
                        <Table.Td>
                          {cycle.completedCount}/{cycle.exerciseCount}
                        </Table.Td>
                        <Table.Td>{cycle.failures}</Table.Td>
                        <Table.Td>
                          {formatPercent(cycle.accuracyPercent)} ({cycleAccuracyDetail(cycle)})
                        </Table.Td>
                        <Table.Td>{formatDuration(cycle.timeMs)}</Table.Td>
                        <Table.Td>{formatDuration(cycle.averageTimeMs)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </section>
        )}

        <Alert color="gray" icon={<IconClock size={18} />}>
          {t(
            "Training.Tactics.Stats.Method",
            "Accuracy uses only correct and incorrect attempts. Unsupported attempts are listed separately. Total and average time use every recorded attempt; cycle time is shown from the saved cycle state.",
          )}
        </Alert>
      </Stack>
    </Modal>
  );
}
