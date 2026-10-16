import { Badge, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconChecks,
  IconCpu,
  IconTarget,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { HowToPlay } from "@/utils/preparation/howToPlay";
import type { ResultBucket } from "@/utils/players/results";
import { EngineBadge, RatingParValue } from "../common";
import { formatScore } from "../labels";
import { EmptyState, SectionHeader, SuggestionNote } from "./common";
import { colorName, phaseName, structureName } from "./labels";

function Sample({ bucket }: { bucket: ResultBucket }) {
  const { t } = useTranslation();
  return (
    <Group gap={8} wrap="nowrap">
      <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
        {t("Players.GamesCount", "{{count}} games", { count: bucket.games })} ·{" "}
        {formatScore(bucket.scorePercent)}
      </Text>
      <RatingParValue par={bucket} size="xs" />
    </Group>
  );
}

function FindingRow({
  icon,
  color,
  title,
  bucket,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  bucket: ResultBucket;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm" py={6}>
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
        <ThemeIcon size="sm" variant="light" color={color} radius="xl">
          {icon}
        </ThemeIcon>
        <Text size="sm" lineClamp={1}>
          {title}
        </Text>
      </Group>
      <Sample bucket={bucket} />
    </Group>
  );
}

/**
 * "How to play against them" (I-32): with White and with Black, where the rival scores below
 * what the ratings predict, plus structures, kinds of game and, with an engine analysis, phases.
 */
export default function HowToPlaySection({ data, name }: { data: HowToPlay; name: string }) {
  const { t } = useTranslation();
  const verdictText = {
    targets: t(
      "Preparation.HowTo.Targets",
      "These are the places where {{name}} has scored below what the ratings predicted. Steering the game there is a reasonable plan, not a guarantee.",
      { name },
    ),
    playYourRepertoire: t(
      "Preparation.HowTo.PlayYourRepertoire",
      "Nothing clearly below par in these games: no line, structure or phase stands out. Play your repertoire.",
    ),
    tooFewGames: t(
      "Preparation.HowTo.TooFew",
      "Too few games for a verdict ({{count}}). Add more games of this player or widen the filters.",
      { count: data.games },
    ),
  }[data.verdict];

  return (
    <Stack gap="md">
      <SectionHeader
        icon={<IconTarget size={18} />}
        title={t("Preparation.HowTo.Title", "How to play against {{name}}", { name })}
        description={t(
          "Preparation.HowTo.Description",
          "Lines, structures and kinds of game where the score is at least 5 points below the one the ratings predict, with at least 10 rated games.",
        )}
      />
      <SuggestionNote games={data.games} />

      <Paper withBorder radius="md" p="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon
            variant="light"
            radius="xl"
            color={
              data.verdict === "targets"
                ? "orange"
                : data.verdict === "tooFewGames"
                  ? "gray"
                  : "teal"
            }
          >
            {data.verdict === "targets" ? <IconTarget size={16} /> : <IconChecks size={16} />}
          </ThemeIcon>
          <Text size="sm">{verdictText}</Text>
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {(["white", "black"] as const).map((color) => {
          const weak = data.weakOpenings[color];
          const strong = data.strongOpenings[color];
          return (
            <Paper key={color} withBorder radius="md" p="md">
              <Group justify="space-between" mb="xs">
                <Text fw={700}>
                  {t("Preparation.HowTo.WhenColor", "When {{name}} has {{color}}", {
                    name,
                    color: colorName(color, t).toLowerCase(),
                  })}
                </Text>
                <Sample bucket={data.byColor[color]} />
              </Group>
              {weak.length === 0 && strong.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t(
                    "Preparation.HowTo.NoOpenings",
                    "No opening with enough rated games stands out.",
                  )}
                </Text>
              ) : (
                <Stack gap={0}>
                  {weak.map((item) => (
                    <FindingRow
                      key={item.name}
                      icon={<IconArrowDownRight size={14} />}
                      color="orange"
                      title={item.name}
                      bucket={item.bucket}
                    />
                  ))}
                  {strong.length > 0 && (
                    <Text size="xs" c="dimmed" mt="xs">
                      {t("Preparation.HowTo.Avoid", "Better avoided (above par):")}
                    </Text>
                  )}
                  {strong.map((item) => (
                    <FindingRow
                      key={item.name}
                      icon={<IconArrowUpRight size={14} />}
                      color="teal"
                      title={item.name}
                      bucket={item.bucket}
                    />
                  ))}
                </Stack>
              )}
            </Paper>
          );
        })}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Paper withBorder radius="md" p="md">
          <Text fw={700} mb="xs">
            {t("Preparation.HowTo.StructuresAndTypes", "Structures and kinds of game")}
          </Text>
          {data.weakStructures.length === 0 && data.weakGameTypes.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t("Preparation.HowTo.NoStructures", "Nothing below par with enough rated games.")}
            </Text>
          ) : (
            <Stack gap={0}>
              {data.weakStructures.map((item) => (
                <FindingRow
                  key={`${item.structure}:${item.role}`}
                  icon={<IconArrowDownRight size={14} />}
                  color="orange"
                  title={
                    item.role === "own"
                      ? t("Preparation.HowTo.StructureOwn", "{{structure}} (with it)", {
                          structure: structureName(item.structure, t),
                        })
                      : t("Preparation.HowTo.StructureAgainst", "{{structure}} (against it)", {
                          structure: structureName(item.structure, t),
                        })
                  }
                  bucket={item.bucket}
                />
              ))}
              {data.weakGameTypes.map((item) => (
                <FindingRow
                  key={item.type}
                  icon={<IconArrowDownRight size={14} />}
                  color="orange"
                  title={
                    item.type === "earlyQueens"
                      ? t("Preparation.HowTo.EarlyQueens", "Queens exchanged before move 25")
                      : t("Preparation.HowTo.Endgames", "Games that reach an endgame")
                  }
                  bucket={item.bucket}
                />
              ))}
            </Stack>
          )}
        </Paper>

        <Paper withBorder radius="md" p="md">
          <Group justify="space-between" mb="xs">
            <Text fw={700}>{t("Preparation.HowTo.Phases", "Phases")}</Text>
            {data.engine && <EngineBadge games={data.engine.games} />}
          </Group>
          {!data.engine ? (
            <Group gap="xs" wrap="nowrap">
              <IconCpu size={16} color="var(--mantine-color-dimmed)" />
              <Text size="sm" c="dimmed">
                {t(
                  "Preparation.HowTo.NeedsEngine",
                  "Needs an engine analysis of these games (Analysis tab).",
                )}
              </Text>
            </Group>
          ) : (
            <Stack gap={6}>
              {data.engine.worstPhase ? (
                <Text size="sm">
                  {t(
                    "Preparation.HowTo.WorstPhase",
                    "Most errors in the {{phase}}: {{rate}} mistakes or blunders per 100 moves against {{average}} on average ({{moves}} moves).",
                    {
                      phase: phaseName(data.engine.worstPhase.phase, t),
                      rate: data.engine.worstPhase.rate.toFixed(1),
                      average: data.engine.worstPhase.average.toFixed(1),
                      moves: data.engine.worstPhase.moves,
                    },
                  )}
                </Text>
              ) : (
                <Text size="sm" c="dimmed">
                  {t(
                    "Preparation.HowTo.NoWorstPhase",
                    "No phase has clearly more errors than the others.",
                  )}
                </Text>
              )}
              {data.engine.bestPhase && (
                <Text size="sm">
                  {t(
                    "Preparation.HowTo.BestPhase",
                    "Fewest errors in the {{phase}}: {{rate}} per 100 moves.",
                    {
                      phase: phaseName(data.engine.bestPhase.phase, t),
                      rate: data.engine.bestPhase.rate.toFixed(1),
                    },
                  )}
                </Text>
              )}
              <Group gap="xs">
                {data.engine.conversion && (
                  <Badge variant="light" color="gray">
                    {t(
                      "Preparation.HowTo.Conversion",
                      "Converts {{rate}} of advantages ({{count}})",
                      {
                        rate: `${Math.round(data.engine.conversion.rate)}%`,
                        count: data.engine.conversion.games,
                      },
                    )}
                  </Badge>
                )}
                {data.engine.defense && (
                  <Badge variant="light" color="gray">
                    {t(
                      "Preparation.HowTo.Defense",
                      "Saves {{rate}} of worse positions ({{count}})",
                      {
                        rate: `${Math.round(data.engine.defense.rate)}%`,
                        count: data.engine.defense.games,
                      },
                    )}
                  </Badge>
                )}
              </Group>
            </Stack>
          )}
        </Paper>
      </SimpleGrid>

      {data.games === 0 && (
        <EmptyState>
          {t("Players.NoGamesInFilter", "No games match the current filters.")}
        </EmptyState>
      )}
    </Stack>
  );
}
