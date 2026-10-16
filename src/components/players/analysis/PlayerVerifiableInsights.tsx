import { Alert, Badge, Button, Group, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerAnalysisReference, PlayerEngineAnalysis } from "@/utils/playerAnalysis";
import {
  playerEndgameInsights,
  playerTacticalInsights,
  playerTrainingObservation,
  type PlayerEndgameFamily,
  type PlayerTacticalMotif,
} from "@/utils/playerAnalysisInsights";
import type { TrainingAreasState } from "@/utils/trainingAreas";
import { getTablebaseInfo, type TablebaseCategory } from "@/utils/lichess/api";

const TACTICAL_MOTIFS: PlayerTacticalMotif[] = [
  "movedPiecePunished",
  "missedCapture",
  "missedPromotion",
];
const ENDGAME_FAMILIES: PlayerEndgameFamily[] = ["pawn", "rook", "minorPiece", "queen", "mixed"];

function tacticalLabel(value: PlayerTacticalMotif, t: (key: string, fallback: string) => string) {
  return {
    movedPiecePunished: t("PlayerAnalysis.MotifMovedPiecePunished", "Moved piece immediately lost"),
    missedCapture: t("PlayerAnalysis.MotifMissedCapture", "Missed direct capture"),
    missedPromotion: t("PlayerAnalysis.MotifMissedPromotion", "Missed promotion"),
  }[value];
}

function endgameLabel(value: PlayerEndgameFamily, t: (key: string, fallback: string) => string) {
  return {
    pawn: t("PlayerAnalysis.EndgamePawn", "Pawn ending"),
    rook: t("PlayerAnalysis.EndgameRook", "Rook ending"),
    minorPiece: t("PlayerAnalysis.EndgameMinor", "Minor-piece ending"),
    queen: t("PlayerAnalysis.EndgameQueen", "Queen ending"),
    mixed: t("PlayerAnalysis.EndgameMixed", "Mixed-material ending"),
  }[value];
}

export default function PlayerVerifiableInsights({
  engine,
  training,
  onOpen,
}: {
  engine: PlayerEngineAnalysis;
  training: TrainingAreasState;
  onOpen: (reference: PlayerAnalysisReference) => void;
}) {
  const { t } = useTranslation();
  const tactical = useMemo(
    () => playerTacticalInsights(engine.criticalPositions),
    [engine.criticalPositions],
  );
  const endgames = useMemo(
    () => playerEndgameInsights(engine.criticalPositions),
    [engine.criticalPositions],
  );
  const observation = useMemo(
    () => playerTrainingObservation(engine, training),
    [engine, training],
  );
  const [tablebase, setTablebase] = useState<
    Record<string, { category?: TablebaseCategory; loading?: boolean; error?: boolean }>
  >({});

  const queryTablebase = async (fen: string) => {
    setTablebase((previous) => ({
      ...previous,
      [fen]: { ...previous[fen], loading: true, error: false },
    }));
    try {
      const result = await getTablebaseInfo(fen);
      setTablebase((previous) => ({ ...previous, [fen]: { category: result.category } }));
    } catch (error) {
      setTablebase((previous) => ({ ...previous, [fen]: { error: true } }));
      notifications.show({
        color: "red",
        title: t("PlayerAnalysis.TablebaseError", "Tablebase query failed"),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Stack gap="md">
      <Title order={5}>{t("PlayerAnalysis.VerifiableTactics", "Verifiable tactical motifs")}</Title>
      <Alert color={tactical.classified ? "blue" : "gray"}>
        {t(
          "PlayerAnalysis.TacticalCoverage",
          "{{classified}} of {{total}} critical positions classified ({{coverage}}% coverage). Confidence is high only when the board and first engine move prove the rule; every other case remains unclassified.",
          {
            classified: tactical.classified,
            total: tactical.total,
            coverage: tactical.coveragePercent.toFixed(1),
          },
        )}
      </Alert>
      {tactical.classified > 0 && (
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("PlayerAnalysis.Motif", "Motif")}</Table.Th>
              <Table.Th ta="right">{t("PlayerAnalysis.Count", "Count")}</Table.Th>
              <Table.Th>{t("PlayerAnalysis.Confidence", "Confidence")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {TACTICAL_MOTIFS.filter((motif) => tactical.counts.has(motif)).map((motif) => {
              const example = tactical.insights.find((insight) => insight.motif === motif)!;
              return (
                <Table.Tr key={motif}>
                  <Table.Td>{tacticalLabel(motif, t)}</Table.Td>
                  <Table.Td ta="right">{tactical.counts.get(motif)}</Table.Td>
                  <Table.Td>
                    <Badge color="green">{t("PlayerAnalysis.ConfidenceHigh", "High")}</Badge>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      onClick={() => onOpen(example.critical)}
                    >
                      {t("PlayerAnalysis.Evidence", "Evidence")}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      <Title order={5}>{t("PlayerAnalysis.EndgameFamilies", "Endgame families")}</Title>
      <Text size="xs" c="dimmed">
        {t(
          "PlayerAnalysis.EndgameCoverage",
          "{{classified}} of {{total}} critical endgame or sparse (at most ten pieces) positions classified by material. {{eligible}} contain at most seven pieces and can be checked on demand against the Lichess standard tablebase; positions with eight or more pieces are outside that coverage.",
          {
            classified: endgames.classified,
            total: endgames.total,
            eligible: endgames.tablebaseEligible,
          },
        )}
      </Text>
      {endgames.classified > 0 && (
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("PlayerAnalysis.Family", "Family")}</Table.Th>
              <Table.Th ta="right">{t("PlayerAnalysis.Count", "Count")}</Table.Th>
              <Table.Th>{t("PlayerAnalysis.Reference", "Reference")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {ENDGAME_FAMILIES.filter((family) => endgames.counts.has(family)).map((family) => {
              const example = endgames.insights.find((insight) => insight.family === family)!;
              const result = tablebase[example.critical.fen];
              return (
                <Table.Tr key={family}>
                  <Table.Td>{endgameLabel(family, t)}</Table.Td>
                  <Table.Td ta="right">{endgames.counts.get(family)}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Text size="sm">
                        {example.pieceCount} {t("PlayerAnalysis.Pieces", "pieces")}
                      </Text>
                      {result?.category && <Badge>{result.category}</Badge>}
                      {result?.error && <Badge color="red">{t("Common.Error", "Error")}</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Group gap="xs" justify="flex-end">
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        onClick={() => onOpen(example.critical)}
                      >
                        {t("PlayerAnalysis.Evidence", "Evidence")}
                      </Button>
                      {example.tablebaseEligible && (
                        <Button
                          size="compact-xs"
                          variant="light"
                          loading={result?.loading}
                          onClick={() => void queryTablebase(example.critical.fen)}
                        >
                          {t("PlayerAnalysis.CheckTablebase", "Check tablebase")}
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      {observation.attempts > 0 && (
        <>
          <Title order={5}>{t("PlayerAnalysis.TrainingObservation", "Training observation")}</Title>
          <Alert color="violet">
            {t(
              "PlayerAnalysis.TrainingObservationScope",
              "This is descriptive, not causal. It links exact analyzed positions to manually added tactical exercises and compares only dated errors present in this engine sample.",
            )}
          </Alert>
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Text size="sm">
              {t("PlayerAnalysis.LinkedPositions", "Linked positions")}:{" "}
              {observation.linkedPositions}
            </Text>
            <Text size="sm">
              {t("PlayerAnalysis.Attempts", "Attempts")}: {observation.attempts}
            </Text>
            <Text size="sm">
              {t("PlayerAnalysis.EvaluableAccuracy", "Evaluable accuracy")}:{" "}
              {observation.evaluatedAttempts
                ? `${((observation.correctAttempts / observation.evaluatedAttempts) * 100).toFixed(1)}%`
                : "—"}
            </Text>
            <Text size="sm">
              {t("PlayerAnalysis.ErrorsBeforeAfter", "Errors before / after")}:{" "}
              {observation.beforeErrors} / {observation.afterErrors}
            </Text>
          </SimpleGrid>
          <Text size="xs" c="dimmed">
            {observation.comparisonAvailable
              ? t(
                  "PlayerAnalysis.LossBeforeAfter",
                  "Average loss in matching positions before / after first practice: {{before}} / {{after}} cp.",
                  {
                    before: observation.beforeAverageLoss?.toFixed(0),
                    after: observation.afterAverageLoss?.toFixed(0),
                  },
                )
              : t(
                  "PlayerAnalysis.NoTrainingComparison",
                  "There are not dated matching errors on both sides of the first practice yet, so no before/after comparison is shown.",
                )}
          </Text>
        </>
      )}
    </Stack>
  );
}
