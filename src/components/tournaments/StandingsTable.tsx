import { Avatar, Badge, Group, Table, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PLAY_COLORS } from "@/components/boards/BotPicker";
import { initials } from "@/components/players/common";
import { getHumanBotProfile, humanBotPlayStyle } from "@/utils/humanBots";
import { isKnockout } from "@/utils/tournaments/engine";
import type { StandingRow } from "@/utils/tournaments/standings";
import {
  type Tournament,
  type TournamentParticipant,
  USER_PARTICIPANT_ID,
} from "@/utils/tournaments/types";
import { formatPoints, useTournamentLabels } from "./labels";

export function PlayerName({
  participant,
  size = "sm",
}: {
  participant: TournamentParticipant | undefined;
  size?: "xs" | "sm";
}) {
  const { t } = useTranslation();
  if (!participant) {
    return (
      <Text size={size} c="dimmed" fs="italic">
        {t("Tournaments.Bye", "Bye")}
      </Text>
    );
  }
  const isUser = participant.id === USER_PARTICIPANT_ID;
  const color = isUser
    ? "blue"
    : PLAY_COLORS[humanBotPlayStyle(getHumanBotProfile(participant.id))];
  return (
    <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
      <Avatar
        size={size === "xs" ? 20 : 26}
        radius="xl"
        color={color}
        variant={isUser ? "filled" : "light"}
      >
        {initials(participant.name)}
      </Avatar>
      <Text size={size} fw={isUser ? 700 : 500} truncate>
        {participant.name}
      </Text>
    </Group>
  );
}

/** Standings with the tiebreaks of the format; the user's row stands out. */
export default function StandingsTable({
  tournament,
  standings,
}: {
  tournament: Tournament;
  standings: StandingRow[];
}) {
  const { t } = useTranslation();
  const labels = useTournamentLabels();
  const knockout = isKnockout(tournament.format);
  const swiss = tournament.format === "swiss";

  const knockoutStatus = (row: StandingRow) => {
    if (row.eliminatedInRound === null) {
      return tournament.status === "finished" ? (
        <Badge color="yellow" variant="filled">
          {t("Tournaments.Champion", "Champion")}
        </Badge>
      ) : (
        <Badge color="teal" variant="light">
          {t("Tournaments.StillIn", "Still in")}
        </Badge>
      );
    }
    return (
      <Text size="sm" c="dimmed">
        {t("Tournaments.OutIn", "Out in {{round}}", {
          round: labels.roundName(tournament, row.eliminatedInRound).toLowerCase(),
        })}
      </Text>
    );
  };

  return (
    <Table highlightOnHover verticalSpacing={6} stickyHeader>
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={48}>#</Table.Th>
          <Table.Th>{t("Tournaments.Player", "Player")}</Table.Th>
          <Table.Th w={80} ta="right">
            {t("Tournaments.Rating", "Rating")}
          </Table.Th>
          {knockout ? (
            <Table.Th w={200}>{t("Tournaments.Status", "Status")}</Table.Th>
          ) : (
            <>
              <Table.Th w={64} ta="right">
                {t("Tournaments.Points", "Pts")}
              </Table.Th>
              {swiss && (
                <>
                  <Table.Th w={72} ta="right">
                    <Tooltip
                      label={t(
                        "Tournaments.BuchholzCut1.Desc",
                        "Buchholz without the weakest opponent: the sum of your opponents' points.",
                      )}
                      multiline
                      w={240}
                    >
                      <span>{t("Tournaments.BuchholzCut1", "Bh-1")}</span>
                    </Tooltip>
                  </Table.Th>
                  <Table.Th w={64} ta="right">
                    {t("Tournaments.Buchholz", "Bh")}
                  </Table.Th>
                </>
              )}
              <Table.Th w={64} ta="right">
                <Tooltip
                  label={t(
                    "Tournaments.SonnebornBerger.Desc",
                    "Sonneborn-Berger: the points of the opponents you beat, plus half of those you drew with.",
                  )}
                  multiline
                  w={240}
                >
                  <span>{t("Tournaments.SonnebornBerger", "SB")}</span>
                </Tooltip>
              </Table.Th>
              <Table.Th w={64} ta="right">
                {t("Tournaments.GamesShort", "G")}
              </Table.Th>
            </>
          )}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {standings.map((row) => {
          const isUser = row.participant.id === USER_PARTICIPANT_ID;
          return (
            <Table.Tr
              key={row.participant.id}
              style={isUser ? { background: "var(--mantine-primary-color-light)" } : undefined}
            >
              <Table.Td>
                <Text size="sm" fw={600}>
                  {row.rank}
                </Text>
              </Table.Td>
              <Table.Td>
                <PlayerName participant={row.participant} />
              </Table.Td>
              <Table.Td ta="right">
                <Text size="sm" c="dimmed">
                  {row.participant.rating}
                </Text>
              </Table.Td>
              {knockout ? (
                <Table.Td>{knockoutStatus(row)}</Table.Td>
              ) : (
                <>
                  <Table.Td ta="right">
                    <Text size="sm" fw={700}>
                      {formatPoints(row.points)}
                    </Text>
                  </Table.Td>
                  {swiss && (
                    <>
                      <Table.Td ta="right">
                        <Text size="sm">{formatPoints(row.buchholzCut1)}</Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" c="dimmed">
                          {formatPoints(row.buchholz)}
                        </Text>
                      </Table.Td>
                    </>
                  )}
                  <Table.Td ta="right">
                    <Text size="sm" c="dimmed">
                      {formatPoints(row.sonnebornBerger)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" c="dimmed">
                      {row.games}
                    </Text>
                  </Table.Td>
                </>
              )}
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
