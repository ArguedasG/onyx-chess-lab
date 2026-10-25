import {
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { IconCalendarEvent, IconChevronRight, IconDice, IconPlus } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { tournamentCalendarVisibleAtom } from "@/state/tournaments";
import type { CalendarEvent, CalendarKind } from "@/utils/tournaments/calendar";
import { computeStandings } from "@/utils/tournaments/standings";
import {
  type Tournament,
  type TournamentTemplate,
  USER_PARTICIPANT_ID,
} from "@/utils/tournaments/types";
import {
  clockLabel,
  MAIN_TEMPLATES,
  TEMPLATE_COLORS,
  TEMPLATE_ICONS,
  useTournamentLabels,
} from "./labels";
import classes from "./Tournaments.module.css";

export function useCalendarNames() {
  const { t, i18n } = useTranslation();
  const names: Record<Exclude<CalendarKind, "monthly">, string[]> = {
    daily: [
      t("Tournaments.Calendar.Daily.0", "Blitz of the day"),
      t("Tournaments.Calendar.Daily.1", "Lunchtime arena"),
      t("Tournaments.Calendar.Daily.2", "Lightning cup"),
      t("Tournaments.Calendar.Daily.3", "Express tournament"),
    ],
    weekly: [
      t("Tournaments.Calendar.Weekly.0", "Rapid games of the week"),
      t("Tournaments.Calendar.Weekly.1", "Weekly league"),
      t("Tournaments.Calendar.Weekly.2", "Cup of the week"),
    ],
  };
  const locale = i18n.language;
  return (event: CalendarEvent): string => {
    if (event.kind === "monthly") {
      const month = event.startsOn.toLocaleDateString(locale, { month: "long", year: "numeric" });
      return t("Tournaments.Calendar.Monthly", "{{month}} open", {
        month,
      });
    }
    const base = names[event.kind][event.nameIndex % names[event.kind].length];
    const suffix =
      event.kind === "daily"
        ? event.startsOn.toLocaleDateString(locale, { day: "numeric", month: "short" })
        : t("Tournaments.Calendar.WeekOf", "week of {{date}}", {
            date: event.startsOn.toLocaleDateString(locale, { day: "numeric", month: "short" }),
          });
    return `${base} · ${suffix}`;
  };
}

/** Start page of the section: the rotating calendar and quick ways to start a tournament. */
export default function TournamentsHome({
  events,
  tournaments,
  onJoin,
  onOpen,
  onNew,
}: {
  events: CalendarEvent[];
  tournaments: Tournament[];
  onJoin: (event: CalendarEvent) => void;
  onOpen: (id: string) => void;
  onNew: (template: TournamentTemplate | null) => void;
}) {
  const { t } = useTranslation();
  const labels = useTournamentLabels();
  const calendarName = useCalendarNames();
  const [calendarVisible, setCalendarVisible] = useAtom(tournamentCalendarVisibleAtom);
  const kindLabel: Record<CalendarKind, string> = {
    daily: t("Tournaments.Calendar.Today", "Today"),
    weekly: t("Tournaments.Calendar.ThisWeek", "This week"),
    monthly: t("Tournaments.Calendar.ThisMonth", "This month"),
  };
  const kindColor: Record<CalendarKind, string> = {
    daily: "blue",
    weekly: "violet",
    monthly: "orange",
  };

  return (
    <Stack gap="xl" maw={980} mx="auto" w="100%">
      <Stack gap={4}>
        <Title order={2}>{t("Tournaments.Home.Title", "Tournaments")}</Title>
        <Text c="dimmed">
          {t(
            "Tournaments.Home.Subtitle",
            "Play tournaments against Onyx's human-like bots: pick a format and your opponents, then play your games round by round on the board. The boards between bots are simulated in an instant.",
          )}
        </Text>
      </Stack>

      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <IconCalendarEvent size={18} />
            <Text fw={700}>{t("Tournaments.Calendar.Title", "Calendar")}</Text>
          </Group>
          <Switch
            size="sm"
            checked={calendarVisible}
            onChange={(event) => setCalendarVisible(event.currentTarget.checked)}
            label={t("Tournaments.Calendar.Show", "Show")}
          />
        </Group>
        {calendarVisible ? (
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            {events.map((event) => {
              const joined = tournaments.find((candidate) => candidate.calendarSlot === event.slot);
              const userRow = joined
                ? computeStandings(joined).find((row) => row.participant.id === USER_PARTICIPANT_ID)
                : undefined;
              const days = Math.max(
                0,
                Math.ceil((event.endsOn.getTime() - Date.now()) / 86_400_000),
              );
              return (
                <Paper key={event.slot} withBorder radius="md" p="md">
                  <Stack gap="xs" h="100%" justify="space-between">
                    <Stack gap={6}>
                      <Group justify="space-between">
                        <Badge variant="light" color={kindColor[event.kind]}>
                          {kindLabel[event.kind]}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {days <= 1
                            ? t("Tournaments.Calendar.EndsToday", "Ends today")
                            : t("Tournaments.Calendar.EndsIn", "Ends in {{count}} days", {
                                count: days,
                              })}
                        </Text>
                      </Group>
                      <Text fw={700}>{calendarName(event)}</Text>
                      <Text size="sm" c="dimmed">
                        {labels.formats[event.format].name} · {clockLabel(event.clock)} ·{" "}
                        {t("Tournaments.PlayersCount", "{{count}} players", {
                          count: event.players,
                        })}
                        {event.swissRounds
                          ? ` · ${t("Tournaments.RoundsCount", "{{count}} rounds", { count: event.swissRounds })}`
                          : ""}
                      </Text>
                    </Stack>
                    {joined ? (
                      <Button
                        variant="light"
                        rightSection={<IconChevronRight size={16} />}
                        onClick={() => onOpen(joined.id)}
                      >
                        {joined.status === "finished" && userRow
                          ? t("Tournaments.Calendar.Result", "You finished {{rank}}", {
                              rank: labels.ordinal(userRow.rank),
                            })
                          : t("Tournaments.Calendar.Continue", "Continue")}
                      </Button>
                    ) : (
                      <Button onClick={() => onJoin(event)}>
                        {t("Tournaments.Calendar.Join", "Join")}
                      </Button>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed">
            {t(
              "Tournaments.Calendar.Hidden",
              "The calendar is hidden. A daily, a weekly and a monthly tournament, generated on your computer from the date.",
            )}
          </Text>
        )}
      </Stack>

      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <IconDice size={18} />
            <Text fw={700}>{t("Tournaments.Home.Start", "Start a tournament")}</Text>
          </Group>
          <Button variant="subtle" leftSection={<IconPlus size={16} />} onClick={() => onNew(null)}>
            {t("Tournaments.Home.MoreOptions", "All options")}
          </Button>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
          {MAIN_TEMPLATES.map((template) => {
            const Icon = TEMPLATE_ICONS[template];
            return (
              <UnstyledButton key={template} onClick={() => onNew(template)}>
                <Paper withBorder radius="md" p="md" h="100%" className={classes.card}>
                  <Stack gap="xs">
                    <ThemeIcon
                      variant="light"
                      color={TEMPLATE_COLORS[template]}
                      radius="md"
                      size="lg"
                    >
                      <Icon size={20} />
                    </ThemeIcon>
                    <Text fw={700}>{labels.templates[template].name}</Text>
                    <Text size="sm" c="dimmed">
                      {labels.templates[template].description}
                    </Text>
                  </Stack>
                </Paper>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
      </Stack>
    </Stack>
  );
}
