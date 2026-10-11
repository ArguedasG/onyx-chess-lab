import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Grid,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { parseFen } from "chessops/fen";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OpeningReport } from "@/bindings";
import {
  reportCommonPrefix,
  reportFilterText,
  reportGames,
  reportMoveLabel,
  reportNotation,
  reportScore,
} from "@/utils/openingReport";
import {
  ALL_GAMES,
  canFilterReport,
  filteredBands,
  filteredMoves,
  filteredTotal,
  isFiltered,
  moverScore,
  reportYearRange,
  trendSeries,
  type ReportCellFilter,
} from "@/utils/openingReportFilters";
import ReportFiltersBar, { bandLabel } from "./report/ReportFiltersBar";
import { EloBandsTable, MovesTable, PlayersList } from "./report/ReportTables";
import ResultBar from "./report/ResultBar";
import TrendCharts from "./report/TrendCharts";
import classes from "./report/report.module.css";

type Props = {
  report: OpeningReport;
  onVariant: (moves: string[], fen?: string) => void;
  onGame: (offset: number, extraPly?: number) => void;
  onPlayer: (id: number, name: string) => void;
  busy?: boolean;
  readOnly?: boolean;
};

const scoreText = (results: OpeningReport["statistics"]["results"]) => {
  const score = reportScore(results);
  return score == null ? "—" : `${score.toFixed(1)}%`;
};

/**
 * The opening report, most useful first: what is played and how it scores (filterable by
 * rating class and period), how it fares by rating, its trends and who plays it. Theory lines,
 * model games, move orders and transpositions follow in collapsible sections.
 */
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
  // Additive report fields stay optional at runtime so snapshots saved by an
  // earlier Onyx version remain readable after the schema grows.
  const modelGames = report.modelGames ?? [];
  const modelGameCount = report.modelGameCount ?? modelGames.length;
  const hasReportOnlyFilters = Boolean(report.filters.event || report.filters.timeControl);
  const moverIsWhite = useMemo(() => {
    const setup = parseFen(report.options.displayFen);
    return setup.isOk ? setup.value.turn === "white" : true;
  }, [report.options.displayFen]);

  const [filter, setFilter] = useState<ReportCellFilter>(ALL_GAMES);
  const canFilter = canFilterReport(report);
  const yearRange = useMemo(() => reportYearRange(report), [report]);
  const rows = useMemo(() => filteredMoves(report, filter), [report, filter]);
  const total = useMemo(() => filteredTotal(report, filter), [report, filter]);
  const bands = useMemo(() => filteredBands(report, filter), [report, filter]);
  // The time axis already shows every period, so trends only follow the rating class.
  const trend = useMemo(
    () => trendSeries(report, { ...ALL_GAMES, band: filter.band }, moverIsWhite),
    [report, filter.band, moverIsWhite],
  );
  const games = reportGames(total);
  const scope = [
    filter.band === null
      ? t("OpeningReport.AllRatings", "all rating classes")
      : bandLabel(report.eloBands[filter.band].minElo, report.eloBands[filter.band].maxElo),
    filter.from === null && filter.to === null
      ? t("OpeningReport.AllYears", "all years")
      : `${filter.from ?? yearRange?.[0]}–${filter.to ?? yearRange?.[1]}`,
  ].join(" · ");
  const moverScoreText = (() => {
    const value = moverScore(total, moverIsWhite);
    return value === null ? "—" : `${value.toFixed(1)}%`;
  })();

  return (
    <Stack gap="xl" className={classes.root} data-testid="opening-report">
      <Group justify="space-between" align="start">
        <div>
          <Title order={2}>{t("OpeningReport.Title")}</Title>
          <Text c="dimmed" size="sm">
            {report.databaseName} · {new Date(report.generatedAt).toLocaleString()}
          </Text>
        </div>
        <Badge variant="light">{t("OpeningReport.Local")}</Badge>
      </Group>

      <div>
        <div className={classes.stats}>
          <div>
            <div className={classes.label}>{t("OpeningReport.Matching")}</div>
            <div className={classes.statValue}>{count(games)}</div>
            <div className={classes.caption}>
              {isFiltered(filter)
                ? t("OpeningReport.OfTotal", "of {{count}} in the report", {
                    count: report.position.total,
                  })
                : t("OpeningReport.DatabaseTotal", { count: report.databaseGames })}
            </div>
          </div>
          <div>
            <div className={classes.label}>
              {moverIsWhite
                ? t("OpeningReport.WhiteScores", "White scores")
                : t("OpeningReport.BlackScores", "Black scores")}
            </div>
            <div className={classes.statValue}>{moverScoreText}</div>
            <div className={classes.caption}>
              {t("OpeningReport.KnownResults", { count: total.white + total.draw + total.black })}
            </div>
          </div>
          <div>
            <div className={classes.label}>{t("OpeningReport.AverageElo")}</div>
            <div className={classes.statValue}>
              {report.statistics.averageWhiteElo?.toFixed(0) ?? "—"} /{" "}
              {report.statistics.averageBlackElo?.toFixed(0) ?? "—"}
            </div>
            <div className={classes.caption}>
              {t("OpeningReport.RatedGames", {
                white: report.statistics.ratedWhite,
                black: report.statistics.ratedBlack,
              })}
            </div>
          </div>
          <div>
            <div className={classes.label}>{t("OpeningReport.Period")}</div>
            <div className={classes.statValue}>
              {report.years.length ? `${report.years[0].year}–${report.years.at(-1)!.year}` : "—"}
            </div>
            <div className={classes.caption}>
              {t("OpeningReport.UnknownYear")}: {count(report.unknownYearGames)}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <ResultBar results={total} />
        </div>
      </div>

      {!!report.position.skippedGames && (
        <Alert color="yellow">
          {t("Board.Database.SkippedGames", { count: report.position.skippedGames })}
        </Alert>
      )}

      <Grid gutter={40} overflow="hidden">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Stack gap="xl">
            {canFilter ? (
              <ReportFiltersBar
                report={report}
                filter={filter}
                onChange={setFilter}
                yearRange={yearRange}
              />
            ) : (
              <Text className={classes.caption}>
                {t(
                  "OpeningReport.FiltersNeedNewReport",
                  "Generate the report again to filter it by rating class and period.",
                )}
              </Text>
            )}
            <div>
              <div className={classes.sectionTitle}>{t("OpeningReport.Continuations")}</div>
              <MovesTable
                rows={rows}
                moverIsWhite={moverIsWhite}
                readOnly={readOnly}
                onMove={(move) => onVariant([move])}
              />
              <div className={classes.caption} style={{ marginTop: 6 }}>
                {t("OpeningReport.FilterScope", "{{games}} games · {{scope}}", {
                  games: count(games),
                  scope,
                })}
              </div>
            </div>
            <div>
              <div className={classes.sectionTitle}>
                {t("OpeningReport.ByRating", "How this position holds up across rating classes")}
              </div>
              <EloBandsTable
                bands={report.eloBands}
                results={bands}
                selected={filter.band}
                moverIsWhite={moverIsWhite}
              />
              <div className={classes.caption} style={{ marginTop: 6 }}>
                {t("OpeningReport.EloBandsScope", { unknown: count(report.unknownEloGames) })}
              </div>
            </div>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack gap="xl">
            {trend && <TrendCharts trend={trend} moverIsWhite={moverIsWhite} />}
            <div>
              <div className={classes.sectionTitle}>
                {t("OpeningReport.WhoPlaysIt", "Who plays it")}
              </div>
              <div className={classes.caption} style={{ marginBottom: 6 }}>
                {t("OpeningReport.PlayersScope", { count: report.playerCount })}
                {isFiltered(filter) &&
                  ` ${t("OpeningReport.PlayersUnfiltered", "Not affected by the filters above.")}`}
              </div>
              <PlayersList
                mostPlayed={report.mostPlayedPlayers}
                strongest={report.strongestPlayers}
                onPlayer={onPlayer}
                disabled={busy || readOnly || hasReportOnlyFilters}
                disabledReason={
                  hasReportOnlyFilters
                    ? t(
                        "OpeningReport.ReportOnlyFilters",
                        "Event and time-control filters apply only inside this report, so broader player drilldowns are disabled.",
                      )
                    : undefined
                }
              />
            </div>
          </Stack>
        </Grid.Col>
      </Grid>

      <Accordion multiple defaultValue={["theory"]} variant="separated" radius="md">
        <Accordion.Item value="theory">
          <Accordion.Control>
            <Text fw={700}>{t("OpeningReport.Theory")}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack>
              <Alert
                color="teal"
                title={t("OpeningReport.Cohort", {
                  selected: cohort,
                  total: report.position.total,
                })}
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
                      const common = reportCommonPrefix(
                        report.theory[i - 1]?.moves ?? [],
                        line.moves,
                      );
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
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="model">
          <Accordion.Control>
            <Text fw={700}>{t("OpeningReport.ModelGames", "Model games")}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack>
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
                      <Table.Th>
                        {t("OpeningReport.Components", "Elo / recency / coverage")}
                      </Table.Th>
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
                <Text c="dimmed">
                  {t("OpeningReport.NoModelGames", "No eligible model games.")}
                </Text>
              )}
              {!!modelGames.length && (
                <Text size="xs" c="dimmed">
                  {t(
                    "OpeningReport.DeviationScope",
                    "A deviation is the first move not seen from the same position in a strictly earlier dated game of the filtered report cohort. It is cohort-relative, limited by the selected theory-game cap, and is not a claim of historical novelty.",
                  )}
                </Text>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="orders">
          <Accordion.Control>
            <Text fw={700}>{t("OpeningReport.MoveOrders")}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack>
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
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="transpositions">
          <Accordion.Control>
            <Text fw={700}>{t("OpeningReport.Transpositions")}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack>
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
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="details">
          <Accordion.Control>
            <Text fw={700}>{t("OpeningReport.Provenance")}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack>
              <Text size="sm">
                {t("OpeningReport.Filters")}: {reportFilterText(report, t)}
              </Text>
              <Code block style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>
                {report.options.displayFen}
              </Code>
              <Text size="sm">
                {t("OpeningReport.Outcomes")}: {count(report.statistics.results.white)} /{" "}
                {count(report.statistics.results.draw)} / {count(report.statistics.results.black)} /{" "}
                {count(report.statistics.results.unknown)} · {t("OpeningReport.WhiteScore")}{" "}
                {scoreText(report.statistics.results)}
              </Text>
              <Text size="sm" c="dimmed">
                {t("OpeningReport.Denominators")}
              </Text>
              <Text size="sm" c="dimmed">
                {t("OpeningReport.Method")}
              </Text>
              <Text size="xs" c="dimmed">
                {t("OpeningReport.Version")}: {report.version} ·{" "}
                {(report.elapsedMs / 1000).toFixed(2)} s
              </Text>
              <Code block style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>
                {report.position.fingerprint}
              </Code>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
