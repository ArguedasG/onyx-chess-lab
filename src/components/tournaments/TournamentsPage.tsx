import {
  Box,
  Button,
  Center,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import MaiaRequiredAlert, { useInstalledMaia } from "@/components/common/MaiaRequiredAlert";
import { notifications } from "@mantine/notifications";
import { IconHome, IconPlus, IconTrophy } from "@tabler/icons-react";
import cx from "clsx";
import { useAtom, useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { findObjectiveEngine } from "@/components/boards/EndgameObjectiveWatch";
import { botRatingsAtom, enginesAtom } from "@/state/atoms";
import { selectedTournamentIdAtom, useTournaments } from "@/state/tournaments";
import { EMPTY_BOT_RATINGS, ratedGameBlocker } from "@/utils/botRating";
import { type CalendarEvent, calendarEvents } from "@/utils/tournaments/calendar";
import { isKnockout, nextUserGame, withdrawUser } from "@/utils/tournaments/engine";
import { computeStandings } from "@/utils/tournaments/standings";
import {
  type Tournament,
  type TournamentTemplate,
  USER_PARTICIPANT_ID,
} from "@/utils/tournaments/types";
import { calendarTournament } from "./creation";
import { formatPoints, tournamentRhythm, useTournamentLabels } from "./labels";
import NewTournamentModal from "./NewTournamentModal";
import classes from "./Tournaments.module.css";
import TournamentsHome, { useCalendarNames } from "./TournamentsHome";
import TournamentView from "./TournamentView";
import { useTournamentUserName } from "./useTournamentGameLauncher";

/**
 * Tournaments section (Phase 9.2, I-51): the user's tournaments on the left, the selected one (or
 * the calendar and templates) on the right.
 */
export default function TournamentsPage() {
  const { t } = useTranslation();
  const labels = useTournamentLabels();
  const calendarName = useCalendarNames();
  const { state, update } = useTournaments();
  const [selectedId, setSelectedId] = useAtom(selectedTournamentIdAtom);
  const [creating, setCreating] = useState<{ template: TournamentTemplate | null } | null>(null);
  const ratings = useAtomValue(botRatingsAtom) ?? EMPTY_BOT_RATINGS;
  const engines = useAtomValue(enginesAtom);
  const userName = useTournamentUserName();
  const maia = useInstalledMaia();
  const events = useMemo(() => calendarEvents(new Date()), []);

  const tournaments = useMemo(
    () =>
      [...(state?.tournaments ?? [])].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    [state],
  );
  const selected = tournaments.find((tournament) => tournament.id === selectedId) ?? null;
  const active = tournaments.filter((tournament) => tournament.status === "active");
  const finished = tournaments.filter((tournament) => tournament.status === "finished");

  const save = (tournament: Tournament) => {
    void update((current) => ({
      ...current,
      tournaments: [tournament, ...current.tournaments.filter((t) => t.id !== tournament.id)],
    }));
    setSelectedId(tournament.id);
  };

  const join = (event: CalendarEvent) => {
    const rhythm = tournamentRhythm(event.clock);
    const blocker = ratedGameBlocker({
      againstCatalogBot: true,
      fromStartPosition: true,
      playerClock: event.clock,
      botClock: event.clock,
      openingBook: false,
      verifier: findObjectiveEngine(engines) !== null,
    });
    save(
      calendarTournament(event, {
        name: calendarName(event),
        userName,
        userRating: ratings.ratings[rhythm].rating,
        rhythm,
        rated: blocker === null,
        now: new Date().toISOString(),
      }),
    );
  };

  const item = (tournament: Tournament) => {
    const standings = computeStandings(tournament);
    const userRow = standings.find((row) => row.participant.id === USER_PARTICIPANT_ID);
    const waiting = nextUserGame(tournament) !== null;
    const knockout = isKnockout(tournament.format);
    const progress =
      tournament.status === "finished"
        ? userRow
          ? t("Tournaments.Item.Finished", "{{rank}} of {{count}}", {
              rank: labels.ordinal(userRow.rank),
              count: standings.length,
            })
          : ""
        : knockout
          ? labels.roundName(tournament, tournament.currentRound)
          : t("Tournaments.RoundOf", "Round {{round}} of {{total}}", {
              round: tournament.currentRound,
              total: tournament.plannedRounds,
            });
    const score = !knockout && userRow ? ` · ${formatPoints(userRow.points)}/${userRow.games}` : "";
    return (
      <UnstyledButton
        key={tournament.id}
        className={cx(classes.item, { [classes.active]: tournament.id === selectedId })}
        onClick={() => setSelectedId(tournament.id)}
      >
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon
            variant="light"
            radius="xl"
            size={32}
            color={tournament.status === "finished" && userRow?.rank === 1 ? "yellow" : "gray"}
          >
            <IconTrophy size={16} />
          </ThemeIcon>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text size="sm" fw={500} truncate>
              {tournament.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {labels.formats[tournament.format].name} · {progress}
              {score}
            </Text>
          </div>
          {waiting && (
            <Tooltip label={t("Tournaments.YourTurn", "Your turn")}>
              <Box
                w={8}
                h={8}
                style={{
                  borderRadius: "50%",
                  flex: "0 0 auto",
                  background: "var(--mantine-primary-color-filled)",
                }}
              />
            </Tooltip>
          )}
        </Group>
      </UnstyledButton>
    );
  };

  return (
    <Group h="100%" gap={0} wrap="nowrap" align="stretch" style={{ overflow: "hidden" }}>
      <Box className={classes.sidebar}>
        <Stack gap="sm" p="md" pb="xs">
          <Group gap="xs">
            <ThemeIcon variant="light" radius="md" size="lg" color="yellow">
              <IconTrophy size={20} />
            </ThemeIcon>
            <div>
              <Title order={4} lh={1.1}>
                {t("Tournaments.Title", "Tournaments")}
              </Title>
              <Text size="xs" c="dimmed">
                {t("Tournaments.Subtitle", "You against the bots, round by round")}
              </Text>
            </div>
          </Group>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreating({ template: null })}
          >
            {t("Tournaments.New", "New tournament")}
          </Button>
        </Stack>
        <ScrollArea style={{ flex: 1 }} offsetScrollbars px="md">
          <Stack gap="md" pb="md">
            <UnstyledButton
              className={cx(classes.item, { [classes.active]: selected === null })}
              onClick={() => setSelectedId(null)}
            >
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon variant="light" radius="xl" size={32}>
                  <IconHome size={16} />
                </ThemeIcon>
                <Text size="sm" fw={500}>
                  {t("Tournaments.Home", "Calendar and templates")}
                </Text>
              </Group>
            </UnstyledButton>
            {active.length > 0 && (
              <Stack gap={4}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  {t("Tournaments.Group.Active", "In progress")}
                </Text>
                {active.map(item)}
              </Stack>
            )}
            {finished.length > 0 && (
              <Stack gap={4}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  {t("Tournaments.Group.Finished", "Finished")}
                </Text>
                {finished.map(item)}
              </Stack>
            )}
          </Stack>
        </ScrollArea>
      </Box>

      <Box style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }} p="md">
        {!maia && (
          <Box mb="md">
            <MaiaRequiredAlert>
              {t(
                "Tournaments.NoMaia.Desc",
                "Your tournament games are played against bots that use Maia 3, which is not installed yet. You can create tournaments, but not play them.",
              )}
            </MaiaRequiredAlert>
          </Box>
        )}
        {!state ? (
          <Center h="100%">
            <Loader />
          </Center>
        ) : selected ? (
          <TournamentView
            key={selected.id}
            tournament={selected}
            onWithdraw={() =>
              void update((current) => ({
                ...current,
                tournaments: current.tournaments.map((tournament) =>
                  tournament.id === selected.id
                    ? withdrawUser(tournament, new Date().toISOString())
                    : tournament,
                ),
              }))
            }
            onDelete={() => {
              void update((current) => ({
                ...current,
                tournaments: current.tournaments.filter(
                  (tournament) => tournament.id !== selected.id,
                ),
              }));
              setSelectedId(null);
              notifications.show({
                title: t("Tournaments.Deleted", "Tournament deleted"),
                message: selected.name,
              });
            }}
          />
        ) : (
          <ScrollArea style={{ flex: 1 }} offsetScrollbars>
            <TournamentsHome
              events={events}
              tournaments={tournaments}
              onJoin={join}
              onOpen={setSelectedId}
              onNew={(template) => setCreating({ template })}
            />
          </ScrollArea>
        )}
      </Box>

      <NewTournamentModal
        opened={creating !== null}
        initialTemplate={creating?.template ?? null}
        onClose={() => setCreating(null)}
        onCreate={(tournament) => {
          save(tournament);
          setCreating(null);
        }}
      />
    </Group>
  );
}
