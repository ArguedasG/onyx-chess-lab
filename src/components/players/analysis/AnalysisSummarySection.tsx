import { Button, Paper, SimpleGrid, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type {
  PlayerAnalysisBucket,
  PlayerAnalysisReference,
  PlayerMetadataAnalysis,
} from "@/utils/playerAnalysis";
import { formatParDelta, MIN_RATING_PAR_GAMES } from "@/utils/ratingPar";
import { formatScore } from "../labels";
import PlayerPeriodComparison from "./PlayerPeriodComparison";

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} fz="lg">
        {value}
      </Text>
    </Paper>
  );
}

/** "vs. expected" cell (I-30): the rating par with its sample, dimmed below the minimum. */
export function RatingParCell({
  bucket,
}: {
  bucket: Pick<
    PlayerAnalysisBucket,
    "parDelta" | "ratedGames" | "ratedScorePercent" | "expectedPercent"
  >;
}) {
  const { t } = useTranslation();
  if (bucket.parDelta == null || bucket.ratedGames == null) return <>—</>;
  const reliable = bucket.ratedGames >= MIN_RATING_PAR_GAMES;
  return (
    <Tooltip
      multiline
      w={260}
      label={t(
        "RatingPar.Tooltip",
        "{{score}} scored against {{expected}} expected from the rating difference, in {{games}} rated games.",
        {
          score: formatScore(bucket.ratedScorePercent),
          expected: formatScore(bucket.expectedPercent),
          games: bucket.ratedGames,
        },
      )}
    >
      <Text
        span
        size="sm"
        c={!reliable ? "dimmed" : bucket.parDelta >= 0 ? "teal" : "red"}
        fw={reliable ? 600 : undefined}
      >
        {formatParDelta(bucket.parDelta)}
      </Text>
    </Tooltip>
  );
}

export function BucketTable({
  rows,
  label,
  onOpen,
}: {
  rows: PlayerAnalysisBucket[];
  label: string;
  onOpen: (reference: PlayerAnalysisReference) => void;
}) {
  const { t } = useTranslation();
  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{label}</Table.Th>
          <Table.Th ta="right">{t("PlayerAnalysis.Games", "Games")}</Table.Th>
          <Table.Th ta="right">{t("PlayerAnalysis.Score", "Score")}</Table.Th>
          <Table.Th ta="right">{t("RatingPar.Column", "vs. expected")}</Table.Th>
          <Table.Th>{t("PlayerAnalysis.Record", "W-D-L")}</Table.Th>
          <Table.Th ta="right">{t("PlayerAnalysis.OpponentElo", "Opponent Elo")}</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row.key}>
            <Table.Td>{row.key}</Table.Td>
            <Table.Td ta="right">{row.games}</Table.Td>
            <Table.Td ta="right">{formatScore(row.scorePercent)}</Table.Td>
            <Table.Td ta="right">
              <RatingParCell bucket={row} />
            </Table.Td>
            <Table.Td>{`${row.wins}-${row.draws}-${row.losses}`}</Table.Td>
            <Table.Td ta="right">{row.averageOpponentElo?.toFixed(0) ?? "—"}</Table.Td>
            <Table.Td ta="right">
              <Button
                size="compact-xs"
                variant="subtle"
                disabled={!row.references[0]}
                onClick={() => row.references[0] && onOpen(row.references[0])}
              >
                {t("PlayerAnalysis.Evidence", "Evidence")}
              </Button>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export default function AnalysisSummarySection({
  metadata,
  onOpen,
}: {
  metadata: PlayerMetadataAnalysis;
  onOpen: (reference: PlayerAnalysisReference) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Metric label={t("PlayerAnalysis.Games", "Games")} value={`${metadata.sampleSize}`} />
        <Metric
          label={t("PlayerAnalysis.Score", "Score")}
          value={formatScore(metadata.summary.scorePercent)}
        />
        <Metric
          label={t("PlayerAnalysis.Record", "W-D-L")}
          value={`${metadata.summary.wins}-${metadata.summary.draws}-${metadata.summary.losses}`}
        />
        <Metric
          label={t("PlayerAnalysis.OpponentElo", "Opponent Elo")}
          value={metadata.summary.averageOpponentElo?.toFixed(0) ?? "—"}
        />
      </SimpleGrid>
      <Title order={5}>{t("PlayerAnalysis.ByColor", "By color")}</Title>
      <BucketTable
        rows={metadata.byColor}
        label={t("PlayerAnalysis.Color", "Color")}
        onOpen={onOpen}
      />
      <Title order={5}>{t("PlayerAnalysis.ByRating", "By opponent strength")}</Title>
      <BucketTable
        rows={metadata.byRatingDifference}
        label={t("PlayerAnalysis.Group", "Group")}
        onOpen={onOpen}
      />
      <Title order={5}>{t("PlayerAnalysis.ByTimeControl", "By time control")}</Title>
      <BucketTable
        rows={metadata.byTimeControl}
        label={t("PlayerAnalysis.TimeControl", "Time control")}
        onOpen={onOpen}
      />
      <PlayerPeriodComparison rows={metadata.byYear} />
    </Stack>
  );
}
