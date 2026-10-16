import { Alert, Card, Group, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerAnalysisBucket } from "@/utils/playerAnalysis";

function delta(value: number | null, baseline: number | null, suffix = "") {
  if (value == null || baseline == null) return "—";
  const difference = value - baseline;
  return `${difference >= 0 ? "+" : ""}${difference.toFixed(1)}${suffix}`;
}

export default function PlayerPeriodComparison({ rows }: { rows: PlayerAnalysisBucket[] }) {
  const { t } = useTranslation();
  const ordered = useMemo(
    () =>
      rows
        .filter((row) => /^\d{4}$/.test(row.key))
        .sort((left, right) => left.key.localeCompare(right.key)),
    [rows],
  );
  const [baselineKey, setBaselineKey] = useState(ordered.at(-2)?.key ?? ordered[0]?.key ?? "");
  const [currentKey, setCurrentKey] = useState(ordered.at(-1)?.key ?? "");
  useEffect(() => {
    if (!ordered.some((row) => row.key === baselineKey)) {
      setBaselineKey(ordered.at(-2)?.key ?? ordered[0]?.key ?? "");
    }
    if (!ordered.some((row) => row.key === currentKey)) {
      setCurrentKey(ordered.at(-1)?.key ?? "");
    }
  }, [baselineKey, currentKey, ordered]);
  if (ordered.length < 2) return null;
  const baseline = ordered.find((row) => row.key === baselineKey) ?? ordered[0];
  const current = ordered.find((row) => row.key === currentKey) ?? ordered.at(-1)!;
  const options = ordered.map((row) => ({ value: row.key, label: `${row.key} (${row.games})` }));

  return (
    <Stack gap="sm">
      <Title order={5}>{t("PlayerAnalysis.PeriodComparison", "Period comparison")}</Title>
      <Group grow>
        <Select
          label={t("PlayerAnalysis.BaselinePeriod", "Baseline")}
          value={baseline.key}
          data={options}
          allowDeselect={false}
          onChange={(value) => value && setBaselineKey(value)}
        />
        <Select
          label={t("PlayerAnalysis.CurrentPeriod", "Compared period")}
          value={current.key}
          data={options}
          allowDeselect={false}
          onChange={(value) => value && setCurrentKey(value)}
        />
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Card withBorder>
          <Text size="xs" c="dimmed">
            {t("PlayerAnalysis.Games", "Games")}
          </Text>
          <Text fw={700}>
            {current.games} ({delta(current.games, baseline.games)})
          </Text>
        </Card>
        <Card withBorder>
          <Text size="xs" c="dimmed">
            {t("PlayerAnalysis.Score", "Score")}
          </Text>
          <Text fw={700}>
            {current.scorePercent?.toFixed(1) ?? "—"}% (
            {delta(current.scorePercent, baseline.scorePercent, " pp")})
          </Text>
        </Card>
        <Card withBorder>
          <Text size="xs" c="dimmed">
            {t("PlayerAnalysis.OpponentElo", "Opponent Elo")}
          </Text>
          <Text fw={700}>
            {current.averageOpponentElo?.toFixed(0) ?? "—"} (
            {delta(current.averageOpponentElo, baseline.averageOpponentElo)})
          </Text>
        </Card>
      </SimpleGrid>
      <Alert color="gray">
        {t(
          "PlayerAnalysis.ObservationalComparison",
          "Both periods use the same active profile filters. Differences are descriptive and do not establish that training caused the result.",
        )}
      </Alert>
    </Stack>
  );
}
