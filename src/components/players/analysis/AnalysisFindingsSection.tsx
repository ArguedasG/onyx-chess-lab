import { Alert, Badge, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { PlayerAnalysisFinding, PlayerAnalysisReference } from "@/utils/playerAnalysis";
import { findingTitle, formatScore, priorityLabel } from "../labels";

export default function AnalysisFindingsSection({
  findings,
  onOpen,
}: {
  findings: PlayerAnalysisFinding[];
  onOpen: (reference: PlayerAnalysisReference) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack>
      {findings.length === 0 && (
        <Alert color="green">
          {t(
            "PlayerAnalysis.NoFindings",
            "No weakness crossed the current minimum sample and score thresholds.",
          )}
        </Alert>
      )}
      {findings.map((finding) => (
        <Paper key={finding.id} withBorder p="sm">
          <Group justify="space-between" align="flex-start">
            <div>
              <Group gap="xs">
                <Badge color={finding.priority === "high" ? "red" : "orange"}>
                  {priorityLabel(finding.priority, t)}
                </Badge>
                <Text fw={600}>{findingTitle(finding.category, finding.subject, t)}</Text>
              </Group>
              <Text size="sm" c="dimmed">
                {finding.sampleSize} {t("PlayerAnalysis.Games", "Games")} ·{" "}
                {formatScore(finding.scorePercent)}
              </Text>
            </div>
            <Button
              size="xs"
              variant="light"
              disabled={!finding.references[0]}
              onClick={() => finding.references[0] && onOpen(finding.references[0])}
            >
              {t("PlayerAnalysis.OpenEvidence", "Open evidence")}
            </Button>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}
