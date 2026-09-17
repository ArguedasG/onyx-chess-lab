import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Divider,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { OpeningReport, ReportPlayer, ReportResults } from "@/bindings";
import {
  reportCommonPrefix,
  reportFilterText,
  reportGames,
  reportMoveLabel,
  reportNotation,
  reportScore,
} from "@/utils/openingReport";

type Props = {
  report: OpeningReport;
  onVariant: (moves: string[], fen?: string) => void;
  onGame: (offset: number, extraPly?: number) => void;
  onPlayer: (id: number, name: string) => void;
  busy?: boolean;
  readOnly?: boolean;
};

const scoreText = (results: ReportResults) => {
  const score = reportScore(results);
  return score == null ? "—" : `${score.toFixed(1)}%`;
};

const resultRates = (results: ReportResults) => {
  const known = results.white + results.draw + results.black;
  if (!known) return "—";
  return [results.white, results.draw, results.black]
    .map((value) => `${((value / known) * 100).toFixed(1)}%`)
    .join(" / ");
};

export default function OpeningReportView({
  report,
  onVariant,
  onGame,
  onPlayer,
  busy = false,
  readOnly = false,
}: Props) {
  const { t } = useTranslation();
  const count = (value: number) => value.toLocaleString();
  const cohort = reportGames(report.cohort.results);
  const continuations = [...report.position.openings].sort(
    (a, b) => reportGames(b) - reportGames(a) || a.move.localeCompare(b.move),
  );
  const all = report.statistics.results;
  const years = report.years.slice(-20).reverse();
  // Additive report fields stay optional at runtime so snapshots saved by an
  // earlier Onyx version remain readable after the schema grows.
  const modelGames = report.modelGames ?? [];
  const modelGameCount = report.modelGameCount ?? modelGames.length;
  const hasReportOnlyFilters = Boolean(report.filters.event || report.filters.timeControl);
  const playerRate = (player: ReportPlayer, score: boolean) => {
    const known = player.wins + player.draws + player.losses;
    if (!known) return "—";
    return `${(((score ? player.wins + player.draws / 2 : player.wins) / known) * 100).toFixed(1)}%`;
  };
  const playerTable = (players: ReportPlayer[]) => (
    <Table.ScrollContainer minWidth={680}>
      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("OpeningReport.Player")}</Table.Th>
            <Table.Th>{t("OpeningReport.Games")}</Table.Th>
            <Table.Th>{t("OpeningReport.Colors")}</Table.Th>
            <Table.Th>{t("OpeningReport.PlayerResults")}</Table.Th>
            <Table.Th>{t("OpeningReport.Score")}</Table.Th>
            <Table.Th>{t("OpeningReport.WinRate")}</Table.Th>
            <Table.Th>{t("OpeningReport.PlayerElo")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {players.map((player) => (
            <Table.Tr key={player.id}>
              <Table.Td>
                <Button
                  disabled={busy || readOnly || hasReportOnlyFilters}
                  title={
                    hasReportOnlyFilters
                      ? t(
                          "OpeningReport.ReportOnlyFilters",
                          "Event and time-control filters apply only inside this report, so broader player drilldowns are disabled.",
                        )
                      : undefined
                  }
                  variant="subtle"
                  size="compact-sm"
                  onClick={() => onPlayer(player.id, player.name)}
                >
                  {player.name}
                </Button>
              </Table.Td>
              <Table.Td>{count(player.games)}</Table.Td>
              <Table.Td>
                {player.whiteGames} / {player.blackGames}
              </Table.Td>
              <Table.Td>
                {player.wins} / {player.draws} / {player.losses} / {player.unknown}
              </Table.Td>
              <Table.Td>{playerRate(player, true)}</Table.Td>
              <Table.Td>{playerRate(player, false)}</Table.Td>
              <Table.Td>
                {player.averageElo?.toFixed(0) ?? "—"} / {player.peakElo ?? "—"}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
  return (
    <Stack gap="lg" data-testid="opening-report">
      <Group justify="space-between" align="start">
        <div>
          <Title order={2}>{t("OpeningReport.Title")}</Title>
          <Text c="dimmed">
            {report.databaseName} · {new Date(report.generatedAt).toLocaleString()}
          </Text>
        </div>
        <Badge variant="light">{t("OpeningReport.Local")}</Badge>
      </Group>
      <Code block style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>
        {report.options.displayFen}
      </Code>
      <Text size="sm">
        {t("OpeningReport.Filters")}: {reportFilterText(report, t)}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {t("OpeningReport.Matching")}
          </Text>
          <Text fz="xl" fw={700}>
            {count(report.position.total)}
          </Text>
          <Text size="xs" c="dimmed">
            {t("OpeningReport.DatabaseTotal", { count: report.databaseGames })}
          </Text>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {t("OpeningReport.WhiteScore")}
          </Text>
          <Text fz="xl" fw={700}>
            {scoreText(all)}
          </Text>
          <Text size="xs" c="dimmed">
            {t("OpeningReport.KnownResults", { count: all.white + all.draw + all.black })}
          </Text>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {t("OpeningReport.AverageElo")}
          </Text>
          <Text fz="xl" fw={700}>
            {report.statistics.averageWhiteElo?.toFixed(0) ?? "—"} /{" "}
            {report.statistics.averageBlackElo?.toFixed(0) ?? "—"}
          </Text>
          <Text size="xs" c="dimmed">
            {t("OpeningReport.RatedGames", {
              white: report.statistics.ratedWhite,
              black: report.statistics.ratedBlack,
            })}
          </Text>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {t("OpeningReport.Period")}
          </Text>
          <Text fz="xl" fw={700}>
            {report.years.length ? `${report.years[0].year} – ${report.years.at(-1)!.year}` : "—"}
          </Text>
          <Text size="xs" c="dimmed">
            {t("OpeningReport.UnknownYear")}: {count(report.unknownYearGames)}
          </Text>
        </Card>
      </SimpleGrid>
      <Text size="sm">
        {t("OpeningReport.Outcomes")}: {count(all.white)} / {count(all.draw)} / {count(all.black)} /{" "}
        {count(all.unknown)}
      </Text>
      <Text size="sm" c="dimmed">
        {t("OpeningReport.Denominators")}
      </Text>
      {!!report.position.skippedGames && (
        <Alert color="yellow">
          {t("Board.Database.SkippedGames", { count: report.position.skippedGames })}
        </Alert>
      )}

      <Title order={3}>{t("OpeningReport.Continuations")}</Title>
      <Table.ScrollContainer minWidth={500}>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("OpeningReport.Move")}</Table.Th>
              <Table.Th>{t("OpeningReport.Games")}</Table.Th>
              <Table.Th>{t("OpeningReport.Frequency")}</Table.Th>
              <Table.Th>{t("OpeningReport.WhiteScore")}</Table.Th>
              <Table.Th>{t("OpeningReport.ResultRates")}</Table.Th>
              <Table.Th>{t("OpeningReport.Outcomes")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {continuations.map((move) => (
              <Table.Tr key={move.move}>
                <Table.Td>
                  {move.move === "*" ? (
                    t("OpeningReport.End")
                  ) : (
                    <Button
                      disabled={readOnly}
                      size="compact-xs"
                      variant="subtle"
                      onClick={() => onVariant([move.move])}
                    >
                      {move.move}
                    </Button>
                  )}
                </Table.Td>
                <Table.Td>{count(reportGames(move))}</Table.Td>
                <Table.Td>
                  {report.position.total
                    ? ((reportGames(move) / report.position.total) * 100).toFixed(1)
                    : "0"}
                  %
                </Table.Td>
                <Table.Td>{scoreText(move)}</Table.Td>
                <Table.Td>
                  {move.white} / {move.draw} / {move.black} / {move.unknown}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Title order={3}>{t("OpeningReport.History")}</Title>
      <Text size="sm" c="dimmed">
        {t("OpeningReport.HistoryScope", { shown: years.length, total: report.years.length })}
      </Text>
      <ScrollArea.Autosize mah={220}>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("OpeningReport.Year")}</Table.Th>
              <Table.Th>{t("OpeningReport.Games")}</Table.Th>
              <Table.Th>{t("OpeningReport.WhiteScore")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {years.map((year) => (
              <Table.Tr key={year.year}>
                <Table.Td>{year.year}</Table.Td>
                <Table.Td>{count(reportGames(year.results))}</Table.Td>
                <Table.Td>{scoreText(year.results)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>

      <Title order={3}>{t("OpeningReport.EloBands")}</Title>
      <Text size="sm" c="dimmed">
        {t("OpeningReport.EloBandsScope", { unknown: count(report.unknownEloGames) })}
      </Text>
      <Table.ScrollContainer minWidth={520}>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("OpeningReport.EloBand")}</Table.Th>
              <Table.Th>{t("OpeningReport.Games")}</Table.Th>
              <Table.Th>{t("OpeningReport.Frequency")}</Table.Th>
              <Table.Th>{t("OpeningReport.WhiteScore")}</Table.Th>
              <Table.Th>{t("OpeningReport.Outcomes")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {report.eloBands.map((band) => (
              <Table.Tr key={band.minElo}>
                <Table.Td>
                  {band.maxElo >= 32767 ? `${band.minElo}+` : `${band.minElo}–${band.maxElo}`}
                </Table.Td>
                <Table.Td>{count(reportGames(band.results))}</Table.Td>
                <Table.Td>
                  {report.position.total
                    ? ((reportGames(band.results) / report.position.total) * 100).toFixed(1)
                    : "0"}
                  %
                </Table.Td>
                <Table.Td>{scoreText(band.results)}</Table.Td>
                <Table.Td>{resultRates(band.results)}</Table.Td>
                <Table.Td>
                  {band.results.white} / {band.results.draw} / {band.results.black} /{" "}
                  {band.results.unknown}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed">
        {t("OpeningReport.UnknownEloGames")}: {count(report.unknownEloGames)}
      </Text>

      <Title order={3}>{t("OpeningReport.FrequentPlayers")}</Title>
      {hasReportOnlyFilters && (
        <Alert color="gray">
          {t(
            "OpeningReport.ReportOnlyFilters",
            "Event and time-control filters apply only inside this report, so broader player drilldowns are disabled.",
          )}
        </Alert>
      )}
      <Text size="sm" c="dimmed">
        {t("OpeningReport.PlayersScope", { count: report.playerCount })}
      </Text>
      {playerTable(report.mostPlayedPlayers)}
      <Title order={3}>{t("OpeningReport.StrongestPlayers")}</Title>
      <Text size="sm" c="dimmed">
        {t("OpeningReport.StrongestPlayersScope")}
      </Text>
      {playerTable(report.strongestPlayers)}

      <Divider />
      <Title order={3}>{t("OpeningReport.Theory")}</Title>
      <Alert
        color="teal"
        title={t("OpeningReport.Cohort", { selected: cohort, total: report.position.total })}
      >
        {t("OpeningReport.Selection")}
        <br />
        {t("OpeningReport.LinesShown", {
          shown: report.theory.length,
          total: report.theoryLineCount,
          games: report.displayedTheoryGames,
        })}
      </Alert>
      {!!report.excludedTheoryGames && (
        <Alert color="yellow">
          {t("OpeningReport.ExcludedTheory")}: {report.excludedTheoryGames}
        </Alert>
      )}
      <Text size="sm" c="dimmed">
        {t("OpeningReport.CommonPrefix")}
      </Text>
      <Table.ScrollContainer minWidth={Math.max(650, report.options.depth * 52 + 320)}>
        <Table withTableBorder striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              {Array.from({ length: report.options.depth }, (_, i) => (
                <Table.Th key={i}>{reportMoveLabel(report.options.displayFen, i)}</Table.Th>
              ))}
              <Table.Th>{t("OpeningReport.Games")}</Table.Th>
              <Table.Th>{t("OpeningReport.WhiteScore")}</Table.Th>
              <Table.Th>{t("OpeningReport.Reference")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {report.theory.map((line, i) => {
              const common = reportCommonPrefix(report.theory[i - 1]?.moves ?? [], line.moves);
              return (
                <Table.Tr key={line.moves.join(" ")}>
                  <Table.Td>{i + 1}</Table.Td>
                  {Array.from({ length: report.options.depth }, (_, ply) => (
                    <Table.Td key={ply}>
                      {line.moves[ply] ? (
                        <Button
                          disabled={readOnly}
                          variant="subtle"
                          size="compact-xs"
                          title={reportNotation(
                            line.moves.slice(0, ply + 1),
                            report.options.displayFen,
                          )}
                          aria-label={`${reportMoveLabel(report.options.displayFen, ply)} ${line.moves[ply]}`}
                          onClick={() => onVariant(line.moves.slice(0, ply + 1))}
                        >
                          {ply < common ? "…" : line.moves[ply]}
                        </Button>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                  ))}
                  <Table.Td>{count(reportGames(line.statistics.results))}</Table.Td>
                  <Table.Td>{scoreText(line.statistics.results)}</Table.Td>
                  <Table.Td>
                    <Button
                      disabled={busy || readOnly}
                      size="compact-xs"
                      variant="light"
                      onClick={() => onGame(line.exampleOffset, line.moves.length)}
                    >
                      {line.example.white} – {line.example.black}
                    </Button>
                    <Text size="xs" c="dimmed">
                      {line.example.date ?? "—"} · #{line.example.id}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {!report.theory.length && <Text c="dimmed">{t("OpeningReport.NoTheory")}</Text>}

      <Title order={3}>{t("OpeningReport.ModelGames", "Model games")}</Title>
      <Alert color="blue">
        {t(
          "OpeningReport.ModelGameMethod",
          "Relevance is a transparent 0–100 heuristic: up to 70 points for mean Elo (capped at 3000), 20 for year (1900–2100), and 10 for continuation coverage. It ranks references; it is not an engine quality score.",
        )}
      </Alert>
      <Text size="sm" c="dimmed">
        {t("OpeningReport.ModelGamesShown", "Showing {{shown}} of {{total}} candidates", {
          shown: modelGames.length,
          total: modelGameCount,
        })}
      </Text>
      <Table.ScrollContainer minWidth={960}>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("OpeningReport.Game")}</Table.Th>
              <Table.Th>{t("OpeningReport.Period")}</Table.Th>
              <Table.Th>{t("OpeningReport.AverageElo")}</Table.Th>
              <Table.Th>{t("OpeningReport.Relevance", "Relevance")}</Table.Th>
              <Table.Th>{t("OpeningReport.Components", "Elo / recency / coverage")}</Table.Th>
              <Table.Th>{t("OpeningReport.FirstDeviation", "First deviation")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {modelGames.map((model) => (
              <Table.Tr key={`${model.example.id}:${model.exampleOffset}`}>
                <Table.Td>
                  <Button
                    disabled={busy || readOnly}
                    size="compact-xs"
                    variant="light"
                    onClick={() => onGame(model.exampleOffset)}
                  >
                    {model.example.white} – {model.example.black}
                  </Button>
                </Table.Td>
                <Table.Td>{model.year ?? "—"}</Table.Td>
                <Table.Td>{model.meanElo?.toFixed(0) ?? "—"}</Table.Td>
                <Table.Td>{model.relevanceScore.toFixed(1)}</Table.Td>
                <Table.Td>
                  {model.ratingComponent.toFixed(1)} / {model.recencyComponent.toFixed(1)} /{" "}
                  {model.continuationComponent.toFixed(1)}
                </Table.Td>
                <Table.Td>
                  {model.deviationMove ? (
                    <Text size="sm" title={model.deviationPositionFen ?? undefined}>
                      {model.deviationMove} · {t("OpeningReport.Ply", "ply")}{" "}
                      {(model.deviationPly ?? 0) + 1}
                      <br />
                      <Text component="span" size="xs" c="dimmed">
                        {t(
                          "OpeningReport.DeviationBaseline",
                          "{{games}} strictly earlier cohort games · cutoff {{cutoff}}",
                          {
                            games: model.deviationBaselineGames,
                            cutoff: model.deviationCutoff ?? "—",
                          },
                        )}
                      </Text>
                    </Text>
                  ) : (
                    "—"
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {!modelGames.length && (
        <Text c="dimmed">{t("OpeningReport.NoModelGames", "No eligible model games.")}</Text>
      )}
      {!!modelGames.length && (
        <Text size="xs" c="dimmed">
          {t(
            "OpeningReport.DeviationScope",
            "A deviation is the first move not seen from the same position in a strictly earlier dated game of the filtered report cohort. It is cohort-relative, limited by the selected theory-game cap, and is not a claim of historical novelty.",
          )}
        </Text>
      )}

      <Title order={3}>{t("OpeningReport.MoveOrders")}</Title>
      <Text size="sm" c="dimmed">
        {t("OpeningReport.CohortOnly")}{" "}
        {t("OpeningReport.OrdersShown", {
          shown: report.moveOrders.length,
          total: report.moveOrderCount,
        })}
      </Text>
      {report.moveOrders.map((order, i) => (
        <Card key={i} withBorder padding="sm">
          <Group justify="space-between" wrap="nowrap">
            <Button
              disabled={readOnly}
              variant="subtle"
              h="auto"
              styles={{ label: { whiteSpace: "normal", textAlign: "left" } }}
              onClick={() => onVariant(order.moves, order.startFen)}
            >
              {reportNotation(order.moves, order.startFen) || t("OpeningReport.StartsHere")}
            </Button>
            <Badge>{count(reportGames(order.statistics.results))}</Badge>
            <Button
              disabled={busy || readOnly}
              size="compact-xs"
              variant="light"
              onClick={() => onGame(order.exampleOffset)}
            >
              {t("OpeningReport.Game")}
            </Button>
          </Group>
        </Card>
      ))}

      <Title order={3}>{t("OpeningReport.Transpositions")}</Title>
      <Text size="sm" c="dimmed">
        {t("OpeningReport.TranspositionScope")}{" "}
        {t("OpeningReport.TranspositionsShown", {
          shown: report.transpositions.length,
          total: report.transpositionCount,
        })}
      </Text>
      {report.transpositions.map((group, i) => (
        <Card withBorder key={`${group.ply}:${group.fen}`}>
          <Group justify="space-between">
            <Text fw={600}>{t("OpeningReport.Convergence", { ply: group.ply })}</Text>
            <Badge>
              {count(group.games)} {t("OpeningReport.Games")}
            </Badge>
          </Group>
          <Code block mt="xs" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>
            {group.fen}
          </Code>
          <Stack gap="xs" mt="sm">
            {group.routes.map((route, j) => (
              <Group key={`${i}-${j}`} wrap="nowrap">
                <Button
                  disabled={readOnly}
                  variant="subtle"
                  h="auto"
                  styles={{ label: { whiteSpace: "normal", textAlign: "left" } }}
                  onClick={() => onVariant(route.moves)}
                >
                  {reportNotation(route.moves, report.options.displayFen)}
                </Button>
                <Text size="sm">{count(reportGames(route.results))}</Text>
                <Button
                  disabled={busy || readOnly}
                  variant="light"
                  size="compact-xs"
                  onClick={() => onGame(route.exampleOffset, route.moves.length)}
                >
                  {t("OpeningReport.Game")}
                </Button>
              </Group>
            ))}
          </Stack>
          <Text size="xs" c="dimmed" mt="sm">
            {t("OpeningReport.RoutesShown", {
              shown: group.routes.length,
              total: group.routeCount,
            })}
          </Text>
        </Card>
      ))}
      {!report.transpositions.length && (
        <Text c="dimmed">{t("OpeningReport.NoTranspositions")}</Text>
      )}
      <Divider />
      <Title order={4}>{t("OpeningReport.Provenance")}</Title>
      <Text size="sm" c="dimmed">
        {t("OpeningReport.Method")}
      </Text>
      <Text size="xs" c="dimmed">
        {t("OpeningReport.Version")}: {report.version} · {(report.elapsedMs / 1000).toFixed(2)} s
      </Text>
      <Code block style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>
        {report.position.fingerprint}
      </Code>
    </Stack>
  );
}
