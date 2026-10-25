import {
  ActionIcon,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconChess, IconDice, IconFlag, IconZoomCheck } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isKnockout } from "@/utils/tournaments/engine";
import {
  resultPoints,
  type Tournament,
  type TournamentGame,
  type TournamentMatch,
  USER_PARTICIPANT_ID,
} from "@/utils/tournaments/types";
import { formatPoints, useTournamentLabels } from "./labels";
import { PlayerName } from "./StandingsTable";

export function resultLabel(result: TournamentGame["result"]): string {
  if (result === "1/2-1/2") return "½–½";
  if (result === "1-0") return "1–0";
  if (result === "0-1") return "0–1";
  return "–";
}

/** How a result was decided, as a small icon with its explanation. */
export function ModeIcon({ game }: { game: TournamentGame }) {
  const { t } = useTranslation();
  if (game.mode === "played") {
    return (
      <Tooltip label={t("Tournaments.Mode.Played", "Played on the board")}>
        <IconChess size={14} color="var(--mantine-color-blue-6)" />
      </Tooltip>
    );
  }
  if (game.mode === "simulated") {
    return (
      <Tooltip
        multiline
        w={260}
        label={t(
          "Tournaments.Mode.Simulated",
          "Simulated: a model of rating and style decides the games between bots. Only your games are played.",
        )}
      >
        <IconDice size={14} color="var(--mantine-color-dimmed)" />
      </Tooltip>
    );
  }
  if (game.mode === "forfeit") {
    return (
      <Tooltip label={t("Tournaments.Mode.Forfeit", "Forfeit: you left the tournament")}>
        <IconFlag size={14} color="var(--mantine-color-orange-6)" />
      </Tooltip>
    );
  }
  return null;
}

/** The boards of each round; the user's board stands out and their games can be opened. */
export default function RoundsView({
  tournament,
  onOpenGame,
}: {
  tournament: Tournament;
  onOpenGame: (game: TournamentGame) => void;
}) {
  const { t } = useTranslation();
  const labels = useTournamentLabels();
  const rounds = [...new Set(tournament.games.map((game) => game.round))].sort((a, b) => a - b);
  const [selected, setSelected] = useState<number>(tournament.currentRound || 1);
  const round = rounds.includes(selected) ? selected : (rounds[rounds.length - 1] ?? 1);
  const participants = new Map(tournament.participants.map((p) => [p.id, p]));
  const games = tournament.games
    .filter((game) => game.round === round)
    .sort((left, right) => left.board - right.board);

  const roundOptions = rounds.map((value) => ({
    value: String(value),
    label: isKnockout(tournament.format) ? labels.roundName(tournament, value) : String(value),
  }));

  return (
    <Stack gap="sm">
      <Group gap="sm">
        <Text size="sm" fw={600}>
          {t("Tournaments.RoundLabel", "Round")}
        </Text>
        {rounds.length <= 11 && !isKnockout(tournament.format) ? (
          <SegmentedControl
            size="xs"
            value={String(round)}
            onChange={(value) => setSelected(Number(value))}
            data={roundOptions}
          />
        ) : (
          <Select
            size="xs"
            w={200}
            value={String(round)}
            onChange={(value) => value && setSelected(Number(value))}
            data={roundOptions}
            allowDeselect={false}
          />
        )}
      </Group>
      <Table verticalSpacing={6} highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={48}>{t("Tournaments.Board", "Board")}</Table.Th>
            <Table.Th>{t("Common.WHITE", "White")}</Table.Th>
            <Table.Th w={90} ta="center">
              {t("Tournaments.Result", "Result")}
            </Table.Th>
            <Table.Th>{t("Common.BLACK", "Black")}</Table.Th>
            <Table.Th w={40} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {games.map((game) => {
            const isUser = game.white === USER_PARTICIPANT_ID || game.black === USER_PARTICIPANT_ID;
            const white = participants.get(game.white);
            const black = game.black ? participants.get(game.black) : undefined;
            return (
              <Table.Tr
                key={game.id}
                style={isUser ? { background: "var(--mantine-primary-color-light)" } : undefined}
              >
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {game.board}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <PlayerName participant={white} />
                    <Text size="xs" c="dimmed">
                      {white?.rating}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td ta="center">
                  <Group gap={6} justify="center" wrap="nowrap">
                    <Text size="sm" fw={600}>
                      {game.black === null
                        ? t("Tournaments.ByePoint", "+1")
                        : game.mode === "pending"
                          ? t("Tournaments.Pending", "pending")
                          : resultLabel(game.result)}
                    </Text>
                    <ModeIcon game={game} />
                  </Group>
                  {game.armageddon && (
                    <Text size="xs" c="dimmed">
                      {t("Tournaments.Armageddon", "Armageddon")}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {game.black === null ? (
                    <PlayerName participant={undefined} />
                  ) : (
                    <Group gap={6} wrap="nowrap">
                      <PlayerName participant={black} />
                      <Text size="xs" c="dimmed">
                        {black?.rating}
                      </Text>
                    </Group>
                  )}
                </Table.Td>
                <Table.Td>
                  {game.pgn && (
                    <Tooltip label={t("Tournaments.Analyze", "Analyze the game")}>
                      <ActionIcon variant="subtle" onClick={() => onOpenGame(game)}>
                        <IconZoomCheck size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function matchScore(match: TournamentMatch, games: TournamentGame[]) {
  let a = 0;
  let b = 0;
  let armageddon = false;
  for (const game of games) {
    if (!game.result) continue;
    if (game.armageddon) {
      armageddon = true;
      continue;
    }
    const [white, black] = resultPoints(game.result);
    a += game.white === match.a ? white : black;
    b += game.white === match.a ? black : white;
  }
  return { a, b, armageddon };
}

/** Knockout brackets as columns of matches, one per round. */
export function BracketView({ tournament }: { tournament: Tournament }) {
  const { t } = useTranslation();
  const labels = useTournamentLabels();
  const participants = new Map(tournament.participants.map((p) => [p.id, p]));
  const brackets =
    tournament.format === "doubleElimination"
      ? (["winners", "losers", "final", "reset"] as const)
      : (["main"] as const);

  return (
    <Stack gap="lg">
      {brackets.map((bracket) => {
        const matches = tournament.matches.filter((match) => match.bracket === bracket);
        if (matches.length === 0) return null;
        const rounds = [...new Set(matches.map((match) => match.round))].sort((a, b) => a - b);
        return (
          <Stack key={bracket} gap="xs">
            {tournament.format === "doubleElimination" && (
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                {labels.brackets[bracket]}
              </Text>
            )}
            <ScrollArea offsetScrollbars>
              <Group gap="md" wrap="nowrap" align="stretch">
                {rounds.map((round) => (
                  <Stack key={round} gap="xs" w={220} justify="space-around">
                    <Text size="xs" c="dimmed" ta="center">
                      {tournament.format === "knockout"
                        ? labels.roundName(tournament, round)
                        : t("Tournaments.Round", "Round {{round}}", { round })}
                    </Text>
                    {matches
                      .filter((match) => match.round === round)
                      .map((match) => {
                        const games = tournament.games.filter((g) => g.matchId === match.id);
                        const score = matchScore(match, games);
                        const hasUser =
                          match.a === USER_PARTICIPANT_ID || match.b === USER_PARTICIPANT_ID;
                        const line = (id: string | null, points: number) => {
                          const won = match.winner !== null && match.winner === id;
                          const lost = match.winner !== null && match.winner !== id;
                          return (
                            <Group
                              justify="space-between"
                              wrap="nowrap"
                              gap={6}
                              opacity={lost ? 0.55 : 1}
                            >
                              <PlayerName
                                participant={id ? participants.get(id) : undefined}
                                size="xs"
                              />
                              {match.b !== null && (
                                <Text size="xs" fw={won ? 700 : 400}>
                                  {games.some((g) => g.result) ? formatPoints(points) : ""}
                                </Text>
                              )}
                            </Group>
                          );
                        };
                        return (
                          <Paper
                            key={match.id}
                            withBorder
                            radius="md"
                            p={8}
                            style={
                              hasUser
                                ? { borderColor: "var(--mantine-primary-color-filled)" }
                                : undefined
                            }
                          >
                            <Stack gap={4}>
                              {line(match.a, score.a)}
                              {line(match.b, score.b)}
                              {score.armageddon && (
                                <Text size="xs" c="dimmed">
                                  {t("Tournaments.Armageddon.Decided", "Decided by Armageddon")}
                                </Text>
                              )}
                            </Stack>
                          </Paper>
                        );
                      })}
                  </Stack>
                ))}
              </Group>
            </ScrollArea>
          </Stack>
        );
      })}
    </Stack>
  );
}
