import { Badge, Button, Group, Loader, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import {
  IconArrowRight,
  IconChess,
  IconListNumbers,
  IconPlayerPlay,
  IconTrophy,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { selectedTournamentIdAtom, useTournaments } from "@/state/tournaments";
import { nextUserGame } from "@/utils/tournaments/engine";
import { computeStandings } from "@/utils/tournaments/standings";
import { resultPoints, USER_PARTICIPANT_ID } from "@/utils/tournaments/types";
import { formatPoints, useTournamentLabels } from "./labels";
import { useTournamentGameLauncher } from "./useTournamentGameLauncher";

/**
 * The tournament around a game on the board: what is at stake while it is played and, when it
 * ends, where the user stands and their next game, one click away.
 */
export default function TournamentGamePanel({
  tournamentId,
  gameId,
  phase,
  starting,
  canStart,
  onStart,
}: {
  tournamentId: string;
  gameId: string;
  phase: "setup" | "playing" | "gameOver";
  starting: boolean;
  canStart: boolean;
  /** Starts this game on the board (setup) or replays it if it did not count (game over). */
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const labels = useTournamentLabels();
  const navigate = useNavigate();
  const setSelected = useSetAtom(selectedTournamentIdAtom);
  const launch = useTournamentGameLauncher();
  const { state } = useTournaments();
  const tournament = state?.tournaments.find((candidate) => candidate.id === tournamentId);
  const game = tournament?.games.find((candidate) => candidate.id === gameId);

  const openTournament = () => {
    setSelected(tournamentId);
    void navigate({ to: "/tournaments" });
  };

  if (!state) {
    return (
      <Group justify="center" p="md">
        <Loader size="sm" />
      </Group>
    );
  }
  if (!tournament || !game) {
    return (
      <Paper withBorder radius="md" p="sm">
        <Text size="sm" c="dimmed">
          {t("Tournaments.Game.Missing", "This tournament no longer exists.")}
        </Text>
      </Paper>
    );
  }

  const participants = new Map(tournament.participants.map((p) => [p.id, p]));
  const userWhite = game.white === USER_PARTICIPANT_ID;
  const opponent = participants.get((userWhite ? game.black : game.white) ?? "");
  const header = (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon variant="light" color="yellow" radius="md" size="lg">
        <IconTrophy size={20} />
      </ThemeIcon>
      <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
        <Text fw={700} lineClamp={1}>
          {tournament.name}
        </Text>
        <Text size="xs" c="dimmed">
          {labels.roundName(tournament, game.round)}
          {game.armageddon ? ` · ${t("Tournaments.Armageddon", "Armageddon")}` : ""}
          {" · "}
          {tournament.rated
            ? t("Tournaments.Rated", "Rated")
            : t("Tournaments.Friendly", "Friendly")}
        </Text>
      </Stack>
    </Group>
  );
  const versus = opponent && (
    <Text size="sm">
      {t("Tournaments.Game.Versus", "Against {{name}} ({{rating}}), you play {{color}}", {
        name: opponent.name,
        rating: opponent.rating,
        color: userWhite ? t("Common.WHITE", "White") : t("Common.BLACK", "Black"),
      })}
    </Text>
  );
  const armageddonNote = game.armageddon && (
    <Text size="xs" c="dimmed">
      {t("Tournaments.Armageddon.Desc", "Tiebreak: White must win; a draw sends Black through.")}
    </Text>
  );

  if (phase === "setup") {
    return (
      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          {header}
          {versus}
          {armageddonNote}
          {game.mode === "pending" ? (
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              loading={starting}
              disabled={!canStart}
              onClick={onStart}
            >
              {t("Tournaments.Game.Start", "Start the game")}
            </Button>
          ) : (
            <Text size="sm" c="dimmed">
              {t("Tournaments.Game.AlreadyPlayed", "This game has already been played.")}
            </Text>
          )}
          <Button variant="subtle" size="xs" onClick={openTournament}>
            {t("Tournaments.Game.Open", "View the tournament")}
          </Button>
        </Stack>
      </Paper>
    );
  }

  if (phase === "playing") {
    return (
      <Paper withBorder radius="md" p="sm">
        <Stack gap={6}>
          {header}
          {versus}
          {armageddonNote}
        </Stack>
      </Paper>
    );
  }

  // Game over.
  const standings = computeStandings(tournament);
  const userRow = standings.find((row) => row.participant.id === USER_PARTICIPANT_ID);
  const next = nextUserGame(tournament);
  const nextOpponent = next
    ? participants.get((next.white === USER_PARTICIPANT_ID ? next.black : next.white) ?? "")
    : undefined;
  const userPoints = game.result ? resultPoints(game.result)[userWhite ? 0 : 1] : null;
  const verdict =
    game.mode === "pending"
      ? t("Tournaments.Game.NotCounted", "The game did not count; it is still pending.")
      : userPoints === 1
        ? t("Tournaments.Game.Won", "You won this game.")
        : userPoints === 0
          ? t("Tournaments.Game.Lost", "You lost this game.")
          : t("Tournaments.Game.Drew", "A draw.");
  const knockout = tournament.format === "knockout" || tournament.format === "doubleElimination";

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        {header}
        <Text fw={600}>{verdict}</Text>
        {userRow && (
          <Group gap="xs">
            <Badge variant="light" size="lg" leftSection={<IconListNumbers size={14} />}>
              {knockout && tournament.status === "active"
                ? userRow.eliminatedInRound === null
                  ? t("Tournaments.Game.StillIn", "Still in")
                  : t("Tournaments.Game.Out", "Eliminated")
                : t("Tournaments.Game.Place", "{{rank}} of {{count}}", {
                    rank: labels.ordinal(userRow.rank),
                    count: standings.length,
                  })}
            </Badge>
            {!knockout && (
              <Badge variant="light" color="gray" size="lg">
                {t("Tournaments.Game.Points", "{{points}} / {{games}}", {
                  points: formatPoints(userRow.points),
                  games: userRow.games,
                })}
              </Badge>
            )}
          </Group>
        )}
        {tournament.status === "finished" && (
          <Text size="sm" c="dimmed">
            {t("Tournaments.Game.Finished", "The tournament is over.")}
          </Text>
        )}
        {game.mode === "pending" ? (
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            loading={starting}
            disabled={!canStart}
            onClick={onStart}
          >
            {t("Tournaments.Game.PlayAgain", "Play it again")}
          </Button>
        ) : (
          next &&
          nextOpponent && (
            <Button
              rightSection={<IconArrowRight size={16} />}
              leftSection={<IconChess size={16} />}
              onClick={() => void launch(tournament, next)}
            >
              {t("Tournaments.Game.Next", "{{round}} against {{name}}", {
                round: labels.roundName(tournament, next.round),
                name: nextOpponent.name,
              })}
            </Button>
          )
        )}
        <Button variant="default" leftSection={<IconTrophy size={16} />} onClick={openTournament}>
          {tournament.status === "finished"
            ? t("Tournaments.Game.FinalStandings", "Final standings")
            : t("Tournaments.Game.Open", "View the tournament")}
        </Button>
      </Stack>
    </Paper>
  );
}
