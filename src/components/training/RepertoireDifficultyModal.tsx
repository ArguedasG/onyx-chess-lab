import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Progress,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconBrain, IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { sessionsAtom } from "@/state/atoms";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { clampMaiaElo } from "@/utils/humanBots";
import {
  type RatedRepertoirePosition,
  rateRepertoirePositions,
  repertoirePositions,
} from "@/utils/preparation/repertoireDifficulty";
import { EngineEvaluator, MaiaSampler } from "@/utils/repertoireGenerator/engines";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import type { Session } from "@/utils/session";
import type { OpeningRepertoire } from "@/utils/trainingAreas";
import { DifficultyBadge } from "../generator/GeneratorResults";
import { LineText, usePreparationEngines } from "../players/preparation/common";

type Run =
  | { status: "idle" }
  | { status: "running"; progress: number }
  | { status: "done"; positions: RatedRepertoirePosition[]; elo: number }
  | { status: "error"; message: string };

/** The user's rating from a connected Lichess account, for the default level. */
function accountRating(sessions: readonly Session[]) {
  for (const session of sessions) {
    const perfs = session.lichess?.account.perfs;
    const rating = perfs?.rapid?.rating ?? perfs?.blitz?.rating ?? perfs?.classical?.rating;
    if (rating) return rating;
  }
  return 1500;
}

/**
 * Where my own repertoire is hard for me (I-33): the positions where it is my move, with the
 * chance that a player of my level keeps the evaluation (Stockfish marks the good moves, Maia at
 * my rating says how often they are found). The hardest ones come first, ready to practice.
 */
export default function RepertoireDifficultyModal({
  repertoire,
  onClose,
  onPractice,
}: {
  repertoire: OpeningRepertoire;
  onClose: () => void;
  onPractice: (variantId: string, lineId: string) => void;
}) {
  const { t } = useTranslation();
  const openings = useAtomValue(trainingAreasAtom).openings;
  const sessions = useAtomValue(sessionsAtom);
  const { reference, maia } = usePreparationEngines();
  const [color, setColor] = useState<GeneratorColor>(
    repertoire.color === "black" ? "black" : "white",
  );
  const [elo, setElo] = useState(() => accountRating(sessions));
  const [run, setRun] = useState<Run>({ status: "idle" });
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  const positions = useMemo(
    () => repertoirePositions(openings, repertoire.id, color),
    [color, openings, repertoire.id],
  );

  async function start() {
    if (!reference || !maia) return;
    const id = `repertoire-difficulty-${Date.now()}`;
    const abort = new AbortController();
    const evaluator = new EngineEvaluator(reference, 400, `${id}-engine`);
    const sampler = new MaiaSampler(maia, clampMaiaElo(elo), `${id}-maia`);
    cancel.current = () => {
      abort.abort();
      evaluator.cancel();
      sampler.cancel();
    };
    setRun({ status: "running", progress: 0 });
    try {
      const rated = await rateRepertoirePositions(
        positions,
        { evaluator, maia: sampler, signal: abort.signal },
        (done, total) => setRun({ status: "running", progress: (done / total) * 100 }),
      );
      setRun({ status: "done", positions: rated, elo });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRun(
        abort.signal.aborted || message.toLowerCase().includes("cancel")
          ? { status: "idle" }
          : { status: "error", message },
      );
    } finally {
      sampler.close();
      cancel.current = null;
    }
  }

  const running = run.status === "running";
  return (
    <Modal
      opened
      onClose={() => {
        cancel.current?.();
        onClose();
      }}
      size="xl"
      centered
      title={
        <Group gap="xs">
          <IconBrain size={18} />
          <Text fw={700}>
            {t("RepertoireDifficulty.Title", "Hard positions for me · {{name}}", {
              name: repertoire.name,
            })}
          </Text>
        </Group>
      }
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t(
            "RepertoireDifficulty.Description",
            "The positions of this repertoire where it is your move, and the chance that a player of your level finds a move that keeps the evaluation. The lowest ones are the first to practice. An estimate from Maia and the engine, not a measure of your own memory.",
          )}
        </Text>
        <Group gap="md" align="flex-end" wrap="wrap">
          {repertoire.color === "both" && (
            <SegmentedControl
              size="xs"
              value={color}
              disabled={running}
              onChange={(value) => setColor(value as GeneratorColor)}
              data={[
                { value: "white", label: t("Fen.White", "White") },
                { value: "black", label: t("Fen.Black", "Black") },
              ]}
            />
          )}
          <NumberInput
            label={t("RepertoireDifficulty.Elo", "My level (Maia)")}
            w={160}
            min={600}
            max={2600}
            step={50}
            value={elo}
            disabled={running}
            onChange={(value) => typeof value === "number" && setElo(value)}
          />
          {running ? (
            <Button
              variant="default"
              leftSection={<IconPlayerStop size={16} />}
              onClick={() => cancel.current?.()}
            >
              {t("Common.Cancel", "Cancel")}
            </Button>
          ) : (
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              disabled={!reference || !maia || positions.length === 0}
              onClick={() => void start()}
            >
              {t("RepertoireDifficulty.Run", "Measure {{count}} positions", {
                count: positions.length,
              })}
            </Button>
          )}
        </Group>
        {(!reference || !maia) && (
          <Alert color="yellow" py={8}>
            {t(
              "RepertoireDifficulty.NeedsEngines",
              "It needs a reference engine such as Stockfish and Maia 3, both from Engines.",
            )}
          </Alert>
        )}
        {running && <Progress value={run.progress} animated striped />}
        {run.status === "error" && <Alert color="red">{run.message}</Alert>}
        {positions.length === 0 && (
          <Text size="sm" c="dimmed">
            {t("RepertoireDifficulty.Empty", "This repertoire has no theory moves of this color.")}
          </Text>
        )}
        {run.status === "done" && (
          <ScrollArea.Autosize mah="55vh" offsetScrollbars>
            <Table striped highlightOnHover verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("Preparation.Key.Line", "Line")}</Table.Th>
                  <Table.Th>{t("RepertoireDifficulty.Prepared", "My move")}</Table.Th>
                  <Table.Th>{t("Preparation.Key.Difficulty", "Keeps the evaluation")}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {run.positions.map((position) => (
                  <Table.Tr key={position.path.join(" ")}>
                    <Table.Td maw={360}>
                      <LineText moves={position.path} />
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={700} ff="monospace">
                          {position.prepared.map((move) => move.san).join(", ")}
                        </Text>
                        {position.preparedIsDubious && (
                          <Tooltip
                            multiline
                            w={260}
                            label={t(
                              "RepertoireDifficulty.DubiousHint",
                              "The engine does not count the prepared move among those that keep the evaluation ({{loss}} cp from its best). Worth reviewing.",
                              { loss: Math.round(position.preparedLoss ?? 0) },
                            )}
                          >
                            <Badge size="xs" color="orange" variant="light">
                              {t("RepertoireDifficulty.Dubious", "Check")}
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {position.difficulty ? (
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm" fw={600} w={40}>
                            {`${Math.round(position.difficulty.keepProbability * 100)}%`}
                          </Text>
                          <DifficultyBadge value={position.difficulty} elo={run.elo} />
                        </Group>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label={t("RepertoireDifficulty.Practice", "Practice this line")}>
                        <ActionIcon
                          variant="light"
                          onClick={() => onPractice(position.variantId, position.lineId)}
                        >
                          <IconPlayerPlay size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </Modal>
  );
}
