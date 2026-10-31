import {
  Alert,
  Button,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconChartDots, IconPlayerStop } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LocalEngine } from "@/utils/engines";
import { clampMaiaElo } from "@/utils/humanBots";
import { loadPlayerBooks } from "@/utils/preparation/book";
import {
  type FidelityResult,
  fidelityPlan,
  measureFidelity,
  splitForFidelity,
} from "@/utils/preparation/twin";
import { chronological, type ProfileGame } from "@/utils/players/profileGames";
import { MaiaSampler } from "@/utils/repertoireGenerator/engines";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";

/** Samples per position when measuring: enough to compare, quick enough for 120 positions. */
const FIDELITY_SAMPLES = 8;

type Measure =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; result: FidelityResult; elo: number }
  | { status: "error"; message: string };

/**
 * How faithful the twin's book is (8.6): the most recent games of the profile with the twin's
 * color are left out of the book, and in their positions inside it the book's chance of the real
 * move is compared with plain Maia at the same rating.
 */
export default function TwinFidelityCard({
  games,
  color,
  elo,
  name,
  maia,
}: {
  /** The profile's games. */
  games: ProfileGame[];
  color: GeneratorColor;
  elo: number;
  name: string;
  maia: LocalEngine | null;
}) {
  const { t } = useTranslation();
  const [measure, setMeasure] = useState<Measure>({ status: "idle" });
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  // Another profile or color asks for another measurement.
  useEffect(() => {
    cancel.current?.();
    setMeasure({ status: "idle" });
  }, [games, color]);

  async function run() {
    if (!maia) return;
    // Newest first, so the test games are the most recent ones.
    const own = chronological(
      games.filter((game) => game.isWhite === (color === "white") && !game.customStart),
    ).reverse();
    const { train, test } = splitForFidelity(own);
    if (train.length < 10) return;
    const sampler = new MaiaSampler(
      maia,
      clampMaiaElo(elo),
      `twin-fidelity-${Date.now()}`,
      FIDELITY_SAMPLES,
    );
    let cancelled = false;
    cancel.current = () => {
      cancelled = true;
      sampler.cancel();
    };
    setMeasure({ status: "running", done: 0, total: 1 });
    try {
      const [trainBooks, testBooks] = await Promise.all([
        loadPlayerBooks(train),
        loadPlayerBooks(test),
      ]);
      const plan = fidelityPlan(trainBooks[color].lines, testBooks[color].lines, color);
      const result = await measureFidelity(plan, sampler, (done, total) =>
        setMeasure({ status: "running", done, total }),
      );
      if (!cancelled) setMeasure({ status: "done", result, elo: clampMaiaElo(elo) });
    } catch (error) {
      setMeasure(
        cancelled
          ? { status: "idle" }
          : { status: "error", message: error instanceof Error ? error.message : String(error) },
      );
    } finally {
      sampler.close();
      cancel.current = null;
    }
  }

  const ownGames = games.filter((game) => game.isWhite === (color === "white")).length;
  const result = measure.status === "done" ? measure.result : null;
  const better = result ? result.twin.probability - result.maia.probability : 0;

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap={2} style={{ flex: 1, minWidth: 260 }}>
          <Group gap="xs">
            <IconChartDots size={16} />
            <Text fw={700}>{t("Preparation.Twin.Fidelity", "How faithful is the book?")}</Text>
          </Group>
          <Text size="xs" c="dimmed">
            {t(
              "Preparation.Twin.FidelityHint",
              "The most recent 20% of the games are left out of the book. In each of {{name}}'s positions inside the book, how often the twin would play the move really played, against plain Maia at the same rating. Out of the book the twin is Maia, so both match there.",
              { name },
            )}
          </Text>
        </Stack>
        {measure.status === "running" ? (
          <Button
            variant="default"
            leftSection={<IconPlayerStop size={16} />}
            onClick={() => cancel.current?.()}
          >
            {t("Common.Cancel", "Cancel")}
          </Button>
        ) : (
          <Button variant="light" disabled={!maia || ownGames < 15} onClick={() => void run()}>
            {t("Preparation.Twin.MeasureBook", "Measure")}
          </Button>
        )}
      </Group>
      {ownGames < 15 && (
        <Text size="xs" c="dimmed" mt="xs">
          {t("Preparation.Twin.FewGames", "At least 15 games with this color are needed.")}
        </Text>
      )}
      {measure.status === "running" && (
        <Progress
          mt="sm"
          value={measure.total ? (measure.done / measure.total) * 100 : 0}
          animated
          striped
        />
      )}
      {measure.status === "error" && (
        <Alert color="red" mt="sm">
          {measure.message}
        </Alert>
      )}
      {result &&
        (result.sampled === 0 ? (
          <Text size="sm" c="dimmed" mt="sm">
            {t(
              "Preparation.Twin.NoBookPositions",
              "None of the test games stays in the book: the twin plays like Maia from the first move.",
            )}
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm">
            <Table withTableBorder verticalSpacing={4}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th />
                  <Table.Th ta="right">
                    {t("Preparation.Twin.Probability", "Plays the real move")}
                  </Table.Th>
                  <Table.Th ta="right">{t("Preparation.Twin.Top", "First choice")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td fw={600}>{t("Preparation.Twin.TwinRow", "Twin")}</Table.Td>
                  <Table.Td ta="right">{`${result.twin.probability.toFixed(0)}%`}</Table.Td>
                  <Table.Td ta="right">{`${result.twin.top.toFixed(0)}%`}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>
                    {t("Preparation.Twin.MaiaRow", "Maia {{elo}}", {
                      elo: measure.status === "done" ? measure.elo : elo,
                    })}
                  </Table.Td>
                  <Table.Td ta="right">{`${result.maia.probability.toFixed(0)}%`}</Table.Td>
                  <Table.Td ta="right">{`${result.maia.top.toFixed(0)}%`}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
            <Stack gap={4}>
              <Text size="sm">
                {better >= 5
                  ? t(
                      "Preparation.Twin.Better",
                      "Inside the book the twin reproduces {{name}}'s moves clearly better than plain Maia.",
                      { name },
                    )
                  : better > -5
                    ? t(
                        "Preparation.Twin.Same",
                        "The twin does not improve on plain Maia here: {{name}}'s repertoire is close to what that rating usually plays, or too varied.",
                        { name },
                      )
                    : t(
                        "Preparation.Twin.Worse",
                        "The book reproduces these games worse than Maia: the recent games depart from the older ones.",
                      )}
              </Text>
              <Text size="xs" c="dimmed">
                {t(
                  "Preparation.Twin.Sample",
                  "{{positions}} positions in the book ({{sampled}} measured, {{samples}} Maia samples each), {{out}} moves out of the book; book from {{train}} games, test with {{test}}.",
                  {
                    positions: result.positions,
                    sampled: result.sampled,
                    samples: FIDELITY_SAMPLES,
                    out: result.outOfBook,
                    train: result.trainGames,
                    test: result.testGames,
                  },
                )}
              </Text>
            </Stack>
          </SimpleGrid>
        ))}
    </Paper>
  );
}
