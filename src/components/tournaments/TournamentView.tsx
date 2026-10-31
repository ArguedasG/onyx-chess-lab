import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Group,
  Menu,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { notifications } from "@mantine/notifications";
import {
  IconDots,
  IconDownload,
  IconDoorExit,
  IconInfoCircle,
  IconMedal,
  IconPlayerPlay,
  IconTrash,
  IconTrophy,
  IconZoomCheck,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useSetAtom } from "jotai";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { BotBadges, PLAY_COLORS } from "@/components/boards/BotPicker";
import { TWIN_COLOR, TwinBadge } from "./TwinBadge";
import { useRhythmLabel } from "@/components/boards/RatedGameSelector";
import { initials } from "@/components/players/common";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { getHumanBotProfile, humanBotPlayStyle } from "@/utils/humanBots";
import { createTab } from "@/utils/tabs";
import { isKnockout, nextUserGame } from "@/utils/tournaments/engine";
import { computeStandings, userGames, userPerformance } from "@/utils/tournaments/standings";
import {
  resultPoints,
  type Tournament,
  type TournamentGame,
  USER_PARTICIPANT_ID,
} from "@/utils/tournaments/types";
import { clockLabel, formatPoints, tournamentRhythm, useTournamentLabels } from "./labels";
import RoundsView, { BracketView, ModeIcon, resultLabel } from "./RoundsView";
import StandingsTable from "./StandingsTable";
import { useTournamentGameLauncher } from "./useTournamentGameLauncher";

const MEDAL_COLORS = ["yellow", "gray", "orange"];

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Group gap={4} wrap="nowrap">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          {label}
        </Text>
        {hint && (
          <Tooltip label={hint} multiline w={260}>
            <IconInfoCircle size={13} color="var(--mantine-color-dimmed)" />
          </Tooltip>
        )}
      </Group>
      <Text fz={22} fw={700} mt={2}>
        {value}
      </Text>
    </Paper>
  );
}

/** One tournament: the user's next game first, then the standings, the rounds and their games. */
export default function TournamentView({
  tournament,
  onWithdraw,
  onDelete,
}: {
  tournament: Tournament;
  onWithdraw: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const labels = useTournamentLabels();
  const rhythmLabel = useRhythmLabel();
  const navigate = useNavigate();
  const launch = useTournamentGameLauncher();
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const [confirm, setConfirm] = useState<"withdraw" | "delete" | null>(null);

  const knockout = isKnockout(tournament.format);
  const standings = computeStandings(tournament);
  const userRow = standings.find((row) => row.participant.id === USER_PARTICIPANT_ID);
  const performance = userPerformance(tournament);
  const next = nextUserGame(tournament);
  const participants = new Map(tournament.participants.map((p) => [p.id, p]));
  const myGames = userGames(tournament);
  const pgnGames = myGames.filter((game) => game.pgn);
  const [tab, setTab] = useState<string | null>(knockout ? "bracket" : "standings");

  const openGame = async (game: TournamentGame) => {
    if (!game.pgn) return;
    const opponent = participants.get(
      (game.white === USER_PARTICIPANT_ID ? game.black : game.white) ?? "",
    );
    await navigate({ to: "/" });
    await createTab({
      tab: { name: `${tournament.name} · ${opponent?.name ?? ""}`, type: "analysis" },
      setTabs,
      setActiveTab,
      pgn: game.pgn,
    });
  };

  const exportPgn = async () => {
    const destination = await save({
      defaultPath: `${tournament.name.replace(/[^\p{L}\p{N}_-]+/gu, "-")}.pgn`,
      filters: [{ name: "PGN", extensions: ["pgn"] }],
    });
    if (!destination) return;
    await writeTextFile(destination, pgnGames.map((game) => game.pgn!.trim()).join("\n\n") + "\n");
    notifications.show({
      color: "teal",
      title: t("Tournaments.Export.Done", "Games exported"),
      message: t("Tournaments.Export.Count", "{{count}} games saved.", { count: pgnGames.length }),
    });
  };

  const opponentOf = (game: TournamentGame) =>
    participants.get((game.white === USER_PARTICIPANT_ID ? game.black : game.white) ?? "");

  const nextCard = (() => {
    if (tournament.status === "finished") {
      const rank = userRow?.rank ?? 0;
      return (
        <Paper withBorder radius="lg" p="lg">
          <Group gap="lg" wrap="nowrap">
            <ThemeIcon
              size={64}
              radius="xl"
              variant={rank <= 3 ? "filled" : "light"}
              color={MEDAL_COLORS[rank - 1] ?? "gray"}
            >
              {rank === 1 ? <IconTrophy size={34} /> : <IconMedal size={34} />}
            </ThemeIcon>
            <Stack gap={2}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                {t("Tournaments.Finished", "Tournament over")}
              </Text>
              <Title order={3}>
                {tournament.userWithdrawn
                  ? t("Tournaments.Withdrawn", "You withdrew")
                  : rank === 1
                    ? t("Tournaments.YouWon", "You won the tournament!")
                    : t("Tournaments.YouFinished", "You finished {{rank}} of {{count}}", {
                        rank: labels.ordinal(rank),
                        count: standings.length,
                      })}
              </Title>
              {!knockout && userRow && (
                <Text size="sm" c="dimmed">
                  {t("Tournaments.FinalScore", "{{points}} out of {{games}}", {
                    points: formatPoints(userRow.points),
                    games: userRow.games,
                  })}
                  {standings[0] && standings[0].participant.id !== USER_PARTICIPANT_ID
                    ? ` · ${t("Tournaments.WinnerWas", "won by {{name}}", {
                        name: standings[0].participant.name,
                      })}`
                    : ""}
                </Text>
              )}
              {knockout && standings[0] && standings[0].participant.id !== USER_PARTICIPANT_ID && (
                <Text size="sm" c="dimmed">
                  {t("Tournaments.ChampionWas", "Champion: {{name}}", {
                    name: standings[0].participant.name,
                  })}
                </Text>
              )}
            </Stack>
          </Group>
        </Paper>
      );
    }
    if (!next) return null;
    const opponent = opponentOf(next);
    if (!opponent) return null;
    const profile = getHumanBotProfile(opponent.id);
    const userWhite = next.white === USER_PARTICIPANT_ID;
    return (
      <Paper
        withBorder
        radius="lg"
        p="lg"
        style={{ background: "var(--mantine-primary-color-light)" }}
      >
        <Group justify="space-between" wrap="nowrap" gap="lg">
          <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
            <Avatar
              size={56}
              radius="xl"
              color={
                opponent.kind === "twin" ? TWIN_COLOR : PLAY_COLORS[humanBotPlayStyle(profile)]
              }
              variant="light"
            >
              {initials(opponent.name)}
            </Avatar>
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                {t("Tournaments.NextGame", "Your next game")} ·{" "}
                {labels.roundName(tournament, next.round)}
                {next.armageddon ? ` · ${t("Tournaments.Armageddon", "Armageddon")}` : ""}
              </Text>
              <Group gap="xs" wrap="nowrap">
                <Title order={3} lineClamp={1}>
                  {opponent.name}
                </Title>
                <Text c="dimmed" fw={600}>
                  {opponent.rating}
                </Text>
              </Group>
              <Group gap="xs">
                {opponent.kind === "twin" ? <TwinBadge /> : <BotBadges profile={profile} />}
                <Badge
                  variant="default"
                  leftSection={
                    <span
                      style={{
                        display: "inline-block",
                        width: 9,
                        height: 9,
                        borderRadius: 2,
                        border: "1px solid var(--mantine-color-gray-5)",
                        background: userWhite ? "#fff" : "#222",
                      }}
                    />
                  }
                >
                  {userWhite
                    ? t("Tournaments.YouPlayWhite", "You play White")
                    : t("Tournaments.YouPlayBlack", "You play Black")}
                </Badge>
              </Group>
              {next.armageddon && (
                <Text size="xs" c="dimmed">
                  {t(
                    "Tournaments.Armageddon.Desc",
                    "Tiebreak: White must win; a draw sends Black through.",
                  )}
                </Text>
              )}
            </Stack>
          </Group>
          <Button
            size="lg"
            radius="md"
            leftSection={<IconPlayerPlay size={20} />}
            onClick={() => void launch(tournament, next)}
          >
            {t("Tournaments.Play", "Play")}
          </Button>
        </Group>
      </Paper>
    );
  })();

  const expectedDelta = performance.points - performance.expected;

  return (
    <Stack h="100%" gap="md" style={{ minHeight: 0 }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={6} style={{ minWidth: 0 }}>
          <Title order={2} lineClamp={1}>
            {tournament.name}
          </Title>
          <Group gap={6}>
            <Badge variant="light">{labels.formats[tournament.format].name}</Badge>
            <Badge variant="light" color="gray">
              {clockLabel(tournament.clock)} · {rhythmLabel(tournamentRhythm(tournament.clock))}
            </Badge>
            <Badge variant="light" color="gray">
              {t("Tournaments.PlayersCount", "{{count}} players", {
                count: tournament.participants.length,
              })}
            </Badge>
            <Badge variant="light" color={tournament.rated ? "teal" : "gray"}>
              {tournament.rated
                ? t("Tournaments.Rated", "Rated")
                : t("Tournaments.Friendly", "Friendly")}
            </Badge>
            {tournament.status === "active" && (
              <Badge variant="dot">
                {knockout
                  ? labels.roundName(tournament, tournament.currentRound)
                  : t("Tournaments.RoundOf", "Round {{round}} of {{total}}", {
                      round: tournament.currentRound,
                      total: tournament.plannedRounds,
                    })}
              </Badge>
            )}
          </Group>
        </Stack>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" size="lg" aria-label={t("Tournaments.Actions", "Actions")}>
              <IconDots size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconDownload size={16} />}
              disabled={pgnGames.length === 0}
              onClick={() => void exportPgn()}
            >
              {t("Tournaments.Export", "Export my games (PGN)")}
            </Menu.Item>
            {tournament.status === "active" && (
              <Menu.Item
                leftSection={<IconDoorExit size={16} />}
                onClick={() => setConfirm("withdraw")}
              >
                {t("Tournaments.Withdraw", "Withdraw from the tournament")}
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => setConfirm("delete")}
            >
              {t("Tournaments.Delete", "Delete the tournament")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {nextCard}

      {userRow && (
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          <Stat
            label={t("Tournaments.Stat.Place", "Place")}
            value={
              knockout && tournament.status === "active"
                ? userRow.eliminatedInRound === null
                  ? t("Tournaments.StillIn", "Still in")
                  : t("Tournaments.Game.Out", "Eliminated")
                : tournament.games.some((game) => game.mode !== "pending")
                  ? `${labels.ordinal(userRow.rank)} / ${standings.length}`
                  : "–"
            }
          />
          <Stat
            label={t("Tournaments.Stat.Points", "Points")}
            value={`${formatPoints(performance.points)} / ${performance.games}`}
          />
          <Stat
            label={t("Tournaments.Stat.Performance", "Performance")}
            hint={t(
              "Tournaments.Stat.Performance.Desc",
              "The rating your results are worth against these opponents (average {{average}}).",
              { average: performance.averageOpponent ?? "–" },
            )}
            value={performance.performance ?? "–"}
          />
          <Stat
            label={t("Tournaments.Stat.Expected", "Vs. expected")}
            hint={t(
              "Tournaments.Stat.Expected.Desc",
              "Your points minus what the ratings predicted ({{expected}}).",
              { expected: performance.expected.toFixed(1) },
            )}
            value={
              performance.games === 0 ? (
                "–"
              ) : (
                <Text
                  span
                  inherit
                  c={expectedDelta > 0.05 ? "teal" : expectedDelta < -0.05 ? "red" : undefined}
                >
                  {expectedDelta >= 0 ? "+" : "−"}
                  {Math.abs(expectedDelta).toFixed(1)}
                </Text>
              )
            }
          />
        </SimpleGrid>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        <Tabs.List>
          {knockout && (
            <Tabs.Tab value="bracket">{t("Tournaments.Tab.Bracket", "Bracket")}</Tabs.Tab>
          )}
          <Tabs.Tab value="standings">{t("Tournaments.Tab.Standings", "Standings")}</Tabs.Tab>
          <Tabs.Tab value="rounds">{t("Tournaments.Tab.Rounds", "Rounds")}</Tabs.Tab>
          <Tabs.Tab value="mine">
            {t("Tournaments.Tab.Mine", "My games")} (
            {myGames.filter((g) => g.black !== null).length})
          </Tabs.Tab>
        </Tabs.List>
        <ScrollArea style={{ flex: 1 }} offsetScrollbars pt="sm">
          {tab === "bracket" && <BracketView tournament={tournament} />}
          {tab === "standings" && <StandingsTable tournament={tournament} standings={standings} />}
          {tab === "rounds" && (
            <RoundsView tournament={tournament} onOpenGame={(g) => void openGame(g)} />
          )}
          {tab === "mine" && (
            <Stack gap={6}>
              {myGames.length === 0 && (
                <Text size="sm" c="dimmed">
                  {t("Tournaments.Mine.Empty", "You have not played yet.")}
                </Text>
              )}
              {myGames.map((game) => {
                const opponent = opponentOf(game);
                const userWhite = game.white === USER_PARTICIPANT_ID;
                const points = game.result ? resultPoints(game.result)[userWhite ? 0 : 1] : null;
                return (
                  <Paper key={game.id} withBorder radius="md" px="sm" py={8}>
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                        <Text size="sm" c="dimmed" w={110}>
                          {labels.roundName(tournament, game.round)}
                        </Text>
                        {game.black === null ? (
                          <Text size="sm">
                            {t("Tournaments.ByeRound", "Bye: one point without playing")}
                          </Text>
                        ) : (
                          <>
                            <span
                              title={
                                userWhite ? t("Common.WHITE", "White") : t("Common.BLACK", "Black")
                              }
                              style={{
                                display: "inline-block",
                                width: 12,
                                height: 12,
                                borderRadius: 3,
                                border: "1px solid var(--mantine-color-gray-5)",
                                background: userWhite ? "#fff" : "#222",
                                flex: "0 0 auto",
                              }}
                            />
                            <Text size="sm" fw={600} truncate>
                              {opponent?.name}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {opponent?.rating}
                            </Text>
                          </>
                        )}
                      </Group>
                      <Group gap="xs" wrap="nowrap">
                        {game.black !== null && game.mode !== "pending" && (
                          <Badge
                            variant="light"
                            color={points === 1 ? "teal" : points === 0 ? "red" : "gray"}
                          >
                            {resultLabel(game.result)}
                          </Badge>
                        )}
                        <ModeIcon game={game} />
                        {game.pgn && (
                          <Tooltip label={t("Tournaments.Analyze", "Analyze the game")}>
                            <ActionIcon variant="subtle" onClick={() => void openGame(game)}>
                              <IconZoomCheck size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {next?.id === game.id && (
                          <Button
                            size="compact-sm"
                            leftSection={<IconPlayerPlay size={14} />}
                            onClick={() => void launch(tournament, game)}
                          >
                            {t("Tournaments.Play", "Play")}
                          </Button>
                        )}
                      </Group>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </ScrollArea>
      </Tabs>

      <Modal
        opened={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm === "withdraw"
            ? t("Tournaments.Withdraw.Title", "Withdraw from the tournament?")
            : t("Tournaments.Delete.Title", "Delete the tournament?")
        }
        centered
      >
        <Stack>
          <Alert
            color={confirm === "delete" ? "red" : "yellow"}
            icon={<IconInfoCircle size={16} />}
          >
            {confirm === "withdraw"
              ? t(
                  "Tournaments.Withdraw.Desc",
                  "Your pending game is lost by forfeit and the rest of the tournament is simulated to the end. Your games stay in the bot databases.",
                )
              : t(
                  "Tournaments.Delete.Desc",
                  "The tournament and its standings are removed. Your games stay in the bot databases.",
                )}
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirm(null)}>
              {t("Common.Cancel", "Cancel")}
            </Button>
            <Button
              color={confirm === "delete" ? "red" : "orange"}
              onClick={() => {
                if (confirm === "withdraw") onWithdraw();
                if (confirm === "delete") onDelete();
                setConfirm(null);
              }}
            >
              {confirm === "withdraw"
                ? t("Tournaments.Withdraw.Confirm", "Withdraw")
                : t("Tournaments.Delete.Confirm", "Delete")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
