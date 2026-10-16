import { Alert, Card, Group, Select, SimpleGrid, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AnalysisArtifactDocument } from "@/bindings";
import type { StoredPlayerAnalysis } from "@/state/playerAnalysis";
import { PLAYER_ANALYSIS_SCHEMA_VERSION } from "@/utils/playerAnalysis";

type SavedProfile = {
  version: number;
  savedAt: string;
  profile: StoredPlayerAnalysis;
};

function delta(value: number | null, baseline: number | null, suffix = "") {
  if (value == null || baseline == null) return "—";
  const difference = value - baseline;
  return `${difference >= 0 ? "+" : ""}${difference.toFixed(1)}${suffix}`;
}

function readVersions(document: AnalysisArtifactDocument, profileId: string): SavedProfile[] {
  return document.versions.flatMap((version) => {
    try {
      const profile = JSON.parse(version.payloadJson) as StoredPlayerAnalysis;
      return profile.schemaVersion === PLAYER_ANALYSIS_SCHEMA_VERSION &&
        profile.profileId === profileId
        ? [{ version: version.version, savedAt: version.savedAt, profile }]
        : [];
    } catch {
      return [];
    }
  });
}

export default function PlayerVersionComparison({
  document,
  profileId,
}: {
  document: AnalysisArtifactDocument;
  profileId: string;
}) {
  const { t } = useTranslation();
  const versions = useMemo(() => readVersions(document, profileId), [document, profileId]);
  const [baselineVersion, setBaselineVersion] = useState(versions.at(-2)?.version ?? 0);
  const [currentVersion, setCurrentVersion] = useState(versions.at(-1)?.version ?? 0);
  useEffect(() => {
    if (!versions.some((item) => item.version === baselineVersion)) {
      setBaselineVersion(versions.at(-2)?.version ?? 0);
    }
    if (!versions.some((item) => item.version === currentVersion)) {
      setCurrentVersion(versions.at(-1)?.version ?? 0);
    }
  }, [baselineVersion, currentVersion, versions]);

  if (versions.length < 2) {
    return (
      <Alert color="yellow">
        {t(
          "PlayerAnalysis.VersionComparisonNeedsTwo",
          "At least two compatible saved versions are required.",
        )}
      </Alert>
    );
  }
  const baseline = versions.find((item) => item.version === baselineVersion) ?? versions.at(-2)!;
  const current = versions.find((item) => item.version === currentVersion) ?? versions.at(-1)!;
  const options = versions.map((item) => ({
    value: String(item.version),
    label: `v${item.version} · ${new Date(item.savedAt).toLocaleString()}`,
  }));
  const filtersMatch =
    JSON.stringify(baseline.profile.metadata.filters) ===
    JSON.stringify(current.profile.metadata.filters);
  const metrics = [
    {
      label: t("PlayerAnalysis.Games", "Games"),
      baseline: baseline.profile.metadata.summary.games,
      current: current.profile.metadata.summary.games,
      suffix: "",
    },
    {
      label: t("PlayerAnalysis.Score", "Score"),
      baseline: baseline.profile.metadata.summary.scorePercent,
      current: current.profile.metadata.summary.scorePercent,
      suffix: " pp",
    },
    {
      label: t("PlayerAnalysis.OpponentElo", "Opponent Elo"),
      baseline: baseline.profile.metadata.summary.averageOpponentElo,
      current: current.profile.metadata.summary.averageOpponentElo,
      suffix: "",
    },
    {
      label: "ACPL",
      baseline: baseline.profile.engine?.acpl ?? null,
      current: current.profile.engine?.acpl ?? null,
      suffix: " cp",
    },
    {
      label: t("PlayerAnalysis.Mistakes", "Mistakes"),
      baseline: baseline.profile.engine?.mistakes ?? null,
      current: current.profile.engine?.mistakes ?? null,
      suffix: "",
    },
    {
      label: t("PlayerAnalysis.Blunders", "Blunders"),
      baseline: baseline.profile.engine?.blunders ?? null,
      current: current.profile.engine?.blunders ?? null,
      suffix: "",
    },
  ];

  return (
    <Stack>
      <Group grow align="end">
        <Select
          label={t("PlayerAnalysis.BaselineVersion", "Baseline version")}
          data={options}
          value={String(baseline.version)}
          allowDeselect={false}
          onChange={(value) => value && setBaselineVersion(Number(value))}
        />
        <Select
          label={t("PlayerAnalysis.ComparedVersion", "Compared version")}
          data={options}
          value={String(current.version)}
          allowDeselect={false}
          onChange={(value) => value && setCurrentVersion(Number(value))}
        />
      </Group>
      {!filtersMatch && (
        <Alert color="yellow">
          {t(
            "PlayerAnalysis.VersionFiltersDiffer",
            "These versions use different filters. Deltas are shown, but they are not directly comparable.",
          )}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {metrics.map((metric) => (
          <Card key={metric.label} withBorder>
            <Text size="xs" c="dimmed">
              {metric.label}
            </Text>
            <Text fw={700}>
              {metric.current == null ? "—" : metric.current.toFixed(metric.suffix ? 1 : 0)}
            </Text>
            <Text size="xs" c="dimmed">
              {t("PlayerAnalysis.Delta", "Delta")}:{" "}
              {delta(metric.current, metric.baseline, metric.suffix)}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
      <Alert color="gray">
        {t(
          "PlayerAnalysis.VersionComparisonScope",
          "Each value comes from an explicitly saved snapshot. Differences are descriptive; sample size, filters and engine coverage must be considered before drawing conclusions.",
        )}
      </Alert>
    </Stack>
  );
}
