import { Badge, Group, Paper, Progress, Stack, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { formatParDelta, MIN_RATING_PAR_GAMES, type RatingPar } from "@/utils/ratingPar";
import { formatScore } from "./labels";

/** Wins, draws and losses as one bar, with the counts on hover. */
export function ResultBar({
  wins,
  draws,
  losses,
  size = "sm",
}: {
  wins: number;
  draws: number;
  losses: number;
  size?: string | number;
}) {
  const { t } = useTranslation();
  const total = wins + draws + losses;
  if (total === 0) return <Progress value={0} size={size} />;
  const section = (value: number, color: string, label: string) => (
    <Tooltip label={label} withArrow>
      <Progress.Section value={(value / total) * 100} color={color} />
    </Tooltip>
  );
  return (
    <Progress.Root size={size} radius="xl">
      {section(wins, "teal.6", t("Players.Wins", "{{count}} wins", { count: wins }))}
      {section(draws, "gray.5", t("Players.Draws", "{{count}} draws", { count: draws }))}
      {section(losses, "red.6", t("Players.Losses", "{{count}} losses", { count: losses }))}
    </Progress.Root>
  );
}

/**
 * The rating par of a row (I-30): "+4.2" when the player scored above what the Elo differences
 * predict. Dimmed below `MIN_RATING_PAR_GAMES` rated games, where it is not interpreted.
 */
export function RatingParValue({ par, size = "sm" }: { par: RatingPar; size?: string }) {
  const { t } = useTranslation();
  if (par.parDelta == null) {
    return (
      <Tooltip label={t("RatingPar.NoRatings", "No games with both ratings.")} withArrow>
        <Text span size={size} c="dimmed">
          —
        </Text>
      </Tooltip>
    );
  }
  const reliable = par.ratedGames >= MIN_RATING_PAR_GAMES;
  return (
    <Tooltip
      multiline
      w={270}
      withArrow
      label={
        <>
          {t(
            "RatingPar.Tooltip",
            "{{score}} scored against {{expected}} expected from the rating difference, in {{games}} rated games.",
            {
              score: formatScore(par.ratedScorePercent),
              expected: formatScore(par.expectedPercent),
              games: par.ratedGames,
            },
          )}
          {!reliable &&
            ` ${t("RatingPar.SmallSample", "Too few rated games to read it as a trend.")}`}
        </>
      }
    >
      <Text
        span
        size={size}
        fw={reliable ? 600 : 400}
        c={
          !reliable
            ? "dimmed"
            : par.parDelta >= 0.05
              ? "teal"
              : par.parDelta <= -0.05
                ? "red"
                : undefined
        }
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatParDelta(par.parDelta)}
      </Text>
    </Tooltip>
  );
}

/** Small figure with its label, for the top of the summary. */
export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: string;
}) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap={2}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
          {label}
        </Text>
        <Text fz={22} fw={700} c={accent} style={{ fontVariantNumeric: "tabular-nums" }}>
          {value}
        </Text>
        {hint && (
          <Text size="xs" c="dimmed">
            {hint}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

/** Marks figures that need an engine analysis, so both levels are never mixed up. */
export function EngineBadge({ games }: { games: number }) {
  const { t } = useTranslation();
  return (
    <Badge size="xs" variant="light" color="violet">
      {t("Players.EngineBadge", "Engine · {{count}} games", { count: games })}
    </Badge>
  );
}

export function SectionTitle({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-end" wrap="nowrap">
      <div>
        <Text fw={700}>{title}</Text>
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
      </div>
      {right}
    </Group>
  );
}

/** Initials of a name for the avatar ("Cabezas Solano, David" → "DC"). */
export function initials(name: string): string {
  if (name.includes(",")) {
    const [last, first] = name.split(",").map((part) => part.trim());
    if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  }
  const words = name.replace(",", " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words.at(-1)![0]}`.toUpperCase();
}

export function formatDay(day: string | null | undefined): string {
  if (!day) return "—";
  if (day.length === 4) return day;
  const date = new Date(`${day.length === 7 ? `${day}-01` : day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    ...(day.length === 10 ? { day: "numeric" } : {}),
  });
}
