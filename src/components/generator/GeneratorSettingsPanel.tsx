import {
  Accordion,
  Alert,
  Chip,
  Group,
  NumberInput,
  Paper,
  Radio,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { RepertoireGeneratorSettings } from "@/state/repertoireGenerator";
import type { LocalEngine } from "@/utils/engines";
import type { GeneratorFocus, StatsSourceConfig } from "@/utils/repertoireGenerator/types";
import classes from "./Generator.module.css";

const RATINGS = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
const SPEEDS = ["bullet", "blitz", "rapid", "classical", "correspondence"];

export type DatabaseOption = { path: string; title: string };

export function useFocusLabels() {
  const { t } = useTranslation();
  return {
    practical: {
      title: t("Generator.Focus.Practical", "Best practical result"),
      description: t(
        "Generator.Focus.PracticalDesc",
        "Score against what the rating difference predicts (local databases) or score, judged prudently by the sample.",
      ),
    },
    score: {
      title: t("Generator.Focus.Score", "Best score"),
      description: t("Generator.Focus.ScoreDesc", "Highest score, draws counting half."),
    },
    solid: {
      title: t("Generator.Focus.Solid", "Fewest losses"),
      description: t(
        "Generator.Focus.SolidDesc",
        "Lowest share of losses, for events where losing costs the most.",
      ),
    },
    lowTheory: {
      title: t("Generator.Focus.LowTheory", "Least theory"),
      description: t(
        "Generator.Focus.LowTheoryDesc",
        "Moves that leave the opponent fewer replies to prepare for.",
      ),
    },
    engine: {
      title: t("Generator.Focus.Engine", "Closest to the engine"),
      description: t(
        "Generator.Focus.EngineDesc",
        "The engine's best among the moves with enough games.",
      ),
    },
    tricky: {
      title: t("Generator.Focus.Tricky", "Hard for the opponent"),
      description: t(
        "Generator.Focus.TrickyDesc",
        "Positions where an opponent of the chosen rating is least likely to find a good move.",
      ),
    },
    surprise: {
      title: t("Generator.Focus.Surprise", "Surprises"),
      description: t(
        "Generator.Focus.SurpriseDesc",
        "Rare moves the engine still likes, the hardest for the opponent first.",
      ),
    },
  } satisfies Record<GeneratorFocus, { title: string; description: string }>;
}

/** Source of the statistics: Lichess, Lichess Masters or a local database. */
export function SourceSettings({
  source,
  onChange,
  databases,
  hasToken,
}: {
  source: StatsSourceConfig;
  onChange: (source: StatsSourceConfig) => void;
  databases: DatabaseOption[];
  hasToken: boolean;
}) {
  const { t } = useTranslation();
  const value = source.kind === "local" ? `local:${source.databasePath}` : source.kind;
  return (
    <Stack gap="xs">
      <Select
        label={t("Generator.Source", "Statistics")}
        value={value}
        allowDeselect={false}
        data={[
          {
            group: "Lichess",
            items: [
              { value: "lichess", label: t("Generator.Source.Lichess", "Lichess players") },
              { value: "masters", label: t("Generator.Source.Masters", "Lichess Masters (OTB)") },
            ],
          },
          {
            group: t("Generator.Source.Local", "Local databases"),
            items: databases.map((database) => ({
              value: `local:${database.path}`,
              label: database.title,
            })),
          },
        ]}
        onChange={(next) => {
          if (!next) return;
          if (next === "lichess")
            onChange({
              kind: "lichess",
              ratings: [1600, 1800, 2000],
              speeds: ["blitz", "rapid", "classical"],
            });
          else if (next === "masters") onChange({ kind: "masters" });
          else {
            const database = databases.find((item) => `local:${item.path}` === next);
            if (database)
              onChange({
                kind: "local",
                databasePath: database.path,
                databaseTitle: database.title,
              });
          }
        }}
      />
      {source.kind !== "local" && !hasToken && (
        <Alert color="yellow" py={6}>
          {t(
            "Generator.Source.Login",
            "The Lichess explorer needs a Lichess account connected with browser login (Accounts).",
          )}
        </Alert>
      )}
      {source.kind === "lichess" && (
        <>
          <Text size="xs" c="dimmed">
            {t("Generator.Source.Ratings", "Rating groups")}
          </Text>
          <Chip.Group
            multiple
            value={source.ratings.map(String)}
            onChange={(values) =>
              onChange({ ...source, ratings: values.map(Number).sort((a, b) => a - b) })
            }
          >
            <Group gap={4}>
              {RATINGS.map((rating) => (
                <Chip key={rating} value={String(rating)} size="xs">
                  {rating}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <Chip.Group
            multiple
            value={source.speeds}
            onChange={(speeds) => onChange({ ...source, speeds })}
          >
            <Group gap={4}>
              {SPEEDS.map((speed) => (
                <Chip key={speed} value={speed} size="xs">
                  {t(`TimeControl.${speed[0].toUpperCase()}${speed.slice(1)}`, speed)}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </>
      )}
      {source.kind === "local" && (
        <SimpleGrid cols={3} spacing="xs">
          <NumberInput
            size="xs"
            label={t("Generator.Source.MinElo", "Minimum Elo")}
            value={source.minElo ?? ""}
            min={0}
            step={100}
            onChange={(next) =>
              onChange({ ...source, minElo: typeof next === "number" ? next : undefined })
            }
          />
          <NumberInput
            size="xs"
            label={t("Generator.Source.Since", "From year")}
            value={source.sinceYear ?? ""}
            onChange={(next) =>
              onChange({ ...source, sinceYear: typeof next === "number" ? next : undefined })
            }
          />
          <NumberInput
            size="xs"
            label={t("Generator.Source.Until", "To year")}
            value={source.untilYear ?? ""}
            onChange={(next) =>
              onChange({ ...source, untilYear: typeof next === "number" ? next : undefined })
            }
          />
        </SimpleGrid>
      )}
    </Stack>
  );
}

export function FocusCards({
  value,
  onChange,
  maiaAvailable,
}: {
  value: GeneratorFocus;
  onChange: (focus: GeneratorFocus) => void;
  maiaAvailable: boolean;
}) {
  const labels = useFocusLabels();
  const { t } = useTranslation();
  return (
    <Radio.Group value={value} onChange={(next) => onChange(next as GeneratorFocus)}>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6}>
        {(Object.keys(labels) as GeneratorFocus[]).map((focus) => (
          <Radio.Card key={focus} value={focus} className={classes.focusCard} radius="md">
            <Group wrap="nowrap" align="flex-start" gap="xs">
              <Radio.Indicator size="xs" mt={3} />
              <div>
                <Text size="sm" fw={600}>
                  {labels[focus].title}
                </Text>
                <Text size="xs" c="dimmed">
                  {labels[focus].description}
                </Text>
                {(focus === "tricky" || focus === "surprise") && (
                  <Text size="xs" c="orange.6">
                    {t(
                      "Generator.Focus.Slower",
                      "Slower: it checks every candidate with the engine and asks Maia where the source has few games (a few seconds per position).",
                    )}
                  </Text>
                )}
                {(focus === "tricky" || focus === "surprise") && !maiaAvailable && (
                  <Text size="xs" c="yellow.7">
                    {t(
                      "Generator.Focus.WithoutMaia",
                      "Without Maia, only positions with enough games are judged.",
                    )}
                  </Text>
                )}
              </div>
            </Group>
          </Radio.Card>
        ))}
      </SimpleGrid>
    </Radio.Group>
  );
}

/** Opponent replies, the engine and the limits of the run. */
export function OpponentAndLimits({
  settings,
  update,
  engines,
  maiaAvailable,
  mode,
}: {
  settings: RepertoireGeneratorSettings;
  update: (change: Partial<RepertoireGeneratorSettings>) => void;
  engines: LocalEngine[];
  maiaAvailable: boolean;
  mode: "repertoire" | "surprises";
}) {
  const { t } = useTranslation();
  const opponent = settings.opponent;
  return (
    <Stack gap="sm">
      {mode === "repertoire" && (
        <Paper withBorder radius="md" p="sm">
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              {t("Generator.Opponent", "Opponent replies")}
            </Text>
            <SegmentedControl
              size="xs"
              value={opponent.mode}
              onChange={(value) =>
                update({ opponent: { ...opponent, mode: value as "popular" | "maia" } })
              }
              data={[
                { value: "popular", label: t("Generator.Opponent.Popular", "Most played") },
                {
                  value: "maia",
                  label: t("Generator.Opponent.Maia", "What Maia predicts"),
                  disabled: !maiaAvailable,
                },
              ]}
            />
            <SimpleGrid cols={3} spacing="xs">
              <NumberInput
                size="xs"
                label={t("Generator.Opponent.Replies", "Replies per position")}
                min={1}
                max={6}
                value={opponent.maxReplies}
                onChange={(value) =>
                  typeof value === "number" &&
                  update({ opponent: { ...opponent, maxReplies: value } })
                }
              />
              <NumberInput
                size="xs"
                label={t("Generator.Opponent.MinShare", "Minimum share (%)")}
                min={1}
                max={50}
                value={opponent.minShare}
                onChange={(value) =>
                  typeof value === "number" &&
                  update({ opponent: { ...opponent, minShare: value } })
                }
              />
              <NumberInput
                size="xs"
                label={t("Generator.Opponent.Elo", "Opponent Elo")}
                min={600}
                max={2600}
                step={100}
                value={opponent.elo}
                onChange={(value) =>
                  typeof value === "number" && update({ opponent: { ...opponent, elo: value } })
                }
              />
            </SimpleGrid>
          </Stack>
        </Paper>
      )}
      {mode === "surprises" && (
        <Paper withBorder radius="md" p="sm">
          <Stack gap="xs">
            <Switch
              size="xs"
              checked={settings.surprises.mySideOnly}
              label={t("Generator.Surprises.MySide", "Only my moves (the side I play)")}
              onChange={(event) =>
                update({
                  surprises: { ...settings.surprises, mySideOnly: event.currentTarget.checked },
                })
              }
            />
            <SimpleGrid cols={2} spacing="xs">
              <NumberInput
                size="xs"
                label={t("Generator.Surprises.FirstMove", "From move")}
                min={1}
                value={settings.surprises.firstMove}
                onChange={(value) =>
                  typeof value === "number" &&
                  update({ surprises: { ...settings.surprises, firstMove: value } })
                }
              />
              <NumberInput
                size="xs"
                label={t("Generator.Surprises.StopGames", "Stop below (games)")}
                min={1}
                value={settings.surprises.stopGames}
                onChange={(value) =>
                  typeof value === "number" &&
                  update({ surprises: { ...settings.surprises, stopGames: value } })
                }
              />
              <NumberInput
                size="xs"
                label={t("Generator.Surprises.MaxShare", "At most (% of games)")}
                min={0}
                max={25}
                value={settings.surprises.maxShare}
                onChange={(value) =>
                  typeof value === "number" &&
                  update({ surprises: { ...settings.surprises, maxShare: value } })
                }
              />
              <NumberInput
                size="xs"
                label={t("Generator.Opponent.Elo", "Opponent Elo")}
                min={600}
                max={2600}
                step={100}
                value={opponent.elo}
                onChange={(value) =>
                  typeof value === "number" && update({ opponent: { ...opponent, elo: value } })
                }
              />
            </SimpleGrid>
          </Stack>
        </Paper>
      )}
      <Accordion variant="separated" radius="md" chevronPosition="right">
        <Accordion.Item value="advanced">
          <Accordion.Control>
            <Text size="sm" fw={600}>
              {t("Generator.Advanced", "Engine and limits")}
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <SimpleGrid cols={2} spacing="xs">
              <Select
                size="xs"
                label={t("Generator.Engine", "Engine")}
                value={settings.engineId ?? engines[0]?.id ?? null}
                data={engines.map((engine) => ({ value: engine.id, label: engine.name }))}
                onChange={(value) => update({ engineId: value })}
                allowDeselect={false}
              />
              <NumberInput
                size="xs"
                label={t("Generator.EngineMs", "Milliseconds per position")}
                min={100}
                max={5000}
                step={100}
                value={settings.engineMs}
                onChange={(value) => typeof value === "number" && update({ engineMs: value })}
              />
              {mode === "repertoire" ? (
                <>
                  <NumberInput
                    size="xs"
                    label={t("Generator.Depth", "Depth (half-moves)")}
                    min={2}
                    max={24}
                    value={settings.depth}
                    onChange={(value) => typeof value === "number" && update({ depth: value })}
                  />
                  <NumberInput
                    size="xs"
                    label={t("Generator.MinGames", "Games to trust a move")}
                    min={1}
                    value={settings.minGames}
                    onChange={(value) => typeof value === "number" && update({ minGames: value })}
                  />
                  <NumberInput
                    size="xs"
                    label={t("Generator.MaxLoss", "Largest engine loss (centipawns)")}
                    min={0}
                    max={200}
                    step={5}
                    value={settings.maxLoss}
                    onChange={(value) => typeof value === "number" && update({ maxLoss: value })}
                  />
                  <NumberInput
                    size="xs"
                    label={t("Generator.MaxPositions", "Positions at most")}
                    min={10}
                    max={500}
                    step={10}
                    value={settings.maxPositions}
                    onChange={(value) =>
                      typeof value === "number" && update({ maxPositions: value })
                    }
                  />
                  {settings.focus === "surprise" && (
                    <NumberInput
                      size="xs"
                      label={t("Generator.SurpriseShare", "A surprise is at most (% of games)")}
                      min={0}
                      max={25}
                      value={settings.surpriseShare}
                      onChange={(value) =>
                        typeof value === "number" && update({ surpriseShare: value })
                      }
                    />
                  )}
                </>
              ) : (
                <NumberInput
                  size="xs"
                  label={t("Generator.MaxLoss", "Largest engine loss (centipawns)")}
                  min={0}
                  max={200}
                  step={5}
                  value={settings.surprises.maxLoss}
                  onChange={(value) =>
                    typeof value === "number" &&
                    update({ surprises: { ...settings.surprises, maxLoss: value } })
                  }
                />
              )}
            </SimpleGrid>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
