import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { IconChessKnight, IconPlayerStop, IconRadar, IconSparkles } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { SourceSettings } from "@/components/generator/GeneratorSettingsPanel";
import RepertoireGeneratorModal from "@/components/generator/RepertoireGeneratorModal";
import { activeTabAtom, sessionsAtom, tabsAtom } from "@/state/atoms";
import { repertoireGeneratorSettingsAtom } from "@/state/repertoireGenerator";
import { getDatabases } from "@/utils/db";
import { playUci } from "@/utils/repertoireGenerator/positions";
import { loadSource } from "@/utils/repertoireGenerator/sources";
import type { StatsSourceConfig } from "@/utils/repertoireGenerator/types";
import { findRepertoireGaps, formatMoveList, type RepertoireGap } from "@/utils/repertoireGaps";
import { createTab } from "@/utils/tabs";
import { defaultTree } from "@/utils/treeReducer";
import type { OpeningsState, OpeningRepertoire } from "@/utils/trainingAreas";

const ALL_SECTIONS = "__all__";
const MAX_POSITIONS = 150;
/** The local tree is read in one pass; deeper lines are rare in a repertoire. */
const LOCAL_TREE_DEPTH = 24;

type SearchState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; stopped: boolean }
  | { status: "error"; message: string };

const percent = (value: number) =>
  value >= 0.1 ? `${Math.round(value * 100)} %` : `${(value * 100).toFixed(1)} %`;

/**
 * Coverage of a repertoire (I-34), on demand: the opponent's replies the repertoire does not
 * answer, ordered by how often they will come up. Nothing changes until the user acts: a gap can
 * be opened on the board to add a reply by hand, or handed to the repertoire generator.
 */
export default function RepertoireGapsModal({
  opened,
  onClose,
  repertoire,
  openings,
  documentDir,
}: {
  opened: boolean;
  onClose: () => void;
  repertoire: OpeningRepertoire;
  openings: OpeningsState;
  documentDir: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const sessions = useAtomValue(sessionsAtom);
  const generatorSettings = useAtomValue(repertoireGeneratorSettingsAtom);
  const token = sessions.find((session) => session.lichess?.accessToken)?.lichess?.accessToken;
  const [source, setSource] = useState<StatsSourceConfig>(generatorSettings.source);
  const [color, setColor] = useState<"white" | "black">(
    repertoire.color === "black" ? "black" : "white",
  );
  const [section, setSection] = useState(ALL_SECTIONS);
  const [minShare, setMinShare] = useState(5);
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [gaps, setGaps] = useState<RepertoireGap[]>([]);
  const [generatorGap, setGeneratorGap] = useState<RepertoireGap | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: databases = [] } = useSWR(opened ? "gaps-databases" : null, async () =>
    (await getDatabases()).flatMap((database) =>
      database.type === "success"
        ? [{ path: database.file, title: database.title || database.filename }]
        : [],
    ),
  );

  const sections = repertoire.variantIds.flatMap((id) => {
    const variant = openings.variants[id];
    return variant?.contentType === "theory" ? [variant] : [];
  });
  const lines = useMemo(
    () =>
      (section === ALL_SECTIONS ? sections : sections.filter((item) => item.id === section))
        .flatMap((variant) => variant.lineIds)
        .flatMap((id) => (openings.lines[id]?.trainable ? [openings.lines[id]] : []))
        .map((line) => ({ fen: line.fen, moves: line.moves })),
    [openings.lines, section, sections],
  );
  const running = state.status === "running";
  const needsToken = source.kind !== "local" && !token;

  async function search() {
    if (lines.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGaps([]);
    setState({ status: "running", done: 0, total: 0 });
    try {
      const loaded = await loadSource(source, lines[0].fen, LOCAL_TREE_DEPTH, 3, {
        id: `repertoire-gaps-${repertoire.id}`,
        token,
        signal: controller.signal,
      });
      const found: RepertoireGap[] = [];
      const result = await findRepertoireGaps(
        lines,
        (fen) => loaded.position(fen, controller.signal),
        { color, minShare: minShare / 100, minGames: 5, maxPositions: MAX_POSITIONS },
        {
          signal: controller.signal,
          onProgress: (done, total) => setState({ status: "running", done, total }),
          onGap: (gap) => {
            found.push(gap);
            setGaps([...found].sort((left, right) => right.weight - left.weight));
          },
        },
      );
      setGaps(result);
      setState({ status: "done", stopped: controller.signal.aborted });
    } catch (error) {
      if (controller.signal.aborted) {
        setState({ status: "done", stopped: true });
        return;
      }
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function openOnBoard(gap: RepertoireGap) {
    const headers = defaultTree(gap.startFen).headers;
    onClose();
    await navigate({ to: "/" });
    await createTab({
      tab: {
        name: t("Gaps.TabName", "Gap · {{move}}", { move: gap.move.san }),
        type: "analysis",
      },
      setTabs,
      setActiveTab,
      pgn: formatMoveList(gap.startFen, gap.sans, gap.move.san),
      headers: { ...headers, fen: gap.startFen, orientation: color },
    });
  }

  const generatorRoot = generatorGap ? playUci(generatorGap.fen, generatorGap.move.uci) : null;

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        size="min(72rem, 94vw)"
        title={
          <Group gap="xs">
            <IconRadar size={18} />
            <Text fw={600}>
              {t("Gaps.Title", "Coverage of {{name}}", { name: repertoire.name })}
            </Text>
          </Group>
        }
      >
        <Stack>
          <Text size="sm" c="dimmed">
            {t(
              "Gaps.Description",
              "Opponent replies your repertoire does not answer, ordered by how often you will meet them. Where a line ends on purpose, nothing is reported.",
            )}
          </Text>

          <Group grow align="flex-start">
            <SourceSettings
              source={source}
              onChange={setSource}
              databases={databases}
              hasToken={Boolean(token)}
            />
            <Stack gap="xs">
              {sections.length > 1 && (
                <Select
                  label={t("Gaps.Section", "Lines")}
                  value={section}
                  allowDeselect={false}
                  onChange={(value) => setSection(value ?? ALL_SECTIONS)}
                  data={[
                    { value: ALL_SECTIONS, label: t("Gaps.AllSections", "Whole repertoire") },
                    ...sections.map((variant) => ({ value: variant.id, label: variant.name })),
                  ]}
                />
              )}
              <Group grow>
                {repertoire.color === "both" && (
                  <div>
                    <Text size="sm" fw={500} mb={4}>
                      {t("Gaps.Color", "I play")}
                    </Text>
                    <SegmentedControl
                      fullWidth
                      value={color}
                      onChange={(value) => setColor(value as "white" | "black")}
                      data={[
                        { value: "white", label: t("Fen.White", "White") },
                        { value: "black", label: t("Fen.Black", "Black") },
                      ]}
                    />
                  </div>
                )}
                <NumberInput
                  label={t("Gaps.MinShare", "Ignore replies below")}
                  suffix=" %"
                  min={1}
                  max={50}
                  value={minShare}
                  onChange={(value) => setMinShare(Math.min(50, Math.max(1, Number(value) || 5)))}
                />
              </Group>
            </Stack>
          </Group>

          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {t("Gaps.Lines", "{{count}} lines checked", { count: lines.length })}
            </Text>
            {running ? (
              <Button
                variant="default"
                leftSection={<IconPlayerStop size={16} />}
                onClick={() => abortRef.current?.abort()}
              >
                {t("Gaps.Stop", "Stop")}
              </Button>
            ) : (
              <Button
                leftSection={<IconRadar size={16} />}
                disabled={needsToken || lines.length === 0}
                onClick={() => void search()}
              >
                {state.status === "idle"
                  ? t("Gaps.Search", "Check coverage")
                  : t("Gaps.SearchAgain", "Check again")}
              </Button>
            )}
          </Group>

          {running && (
            <Stack gap={4}>
              <Progress
                value={state.total > 0 ? (state.done / state.total) * 100 : 5}
                animated={state.total === 0}
              />
              <Text size="xs" c="dimmed">
                {state.total > 0
                  ? t("Gaps.Progress", "{{done}} of {{total}} opponent positions", {
                      done: state.done,
                      total: state.total,
                    })
                  : t("Gaps.Loading", "Reading the statistics…")}
              </Text>
            </Stack>
          )}
          {state.status === "error" && <Alert color="red">{state.message}</Alert>}
          {state.status === "done" && gaps.length === 0 && (
            <Alert color="teal" variant="light">
              {t(
                "Gaps.None",
                "No uncovered replies above {{share}} % of the games. Your repertoire answers what usually comes up.",
                { share: minShare },
              )}
            </Alert>
          )}

          {gaps.length > 0 && (
            <ScrollArea.Autosize mah={420} type="auto">
              <Table verticalSpacing="xs" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("Gaps.Column.Reply", "Uncovered reply")}</Table.Th>
                    <Table.Th>{t("Gaps.Column.Share", "Of the games")}</Table.Th>
                    <Table.Th>
                      <Tooltip
                        label={t(
                          "Gaps.Column.WeightTip",
                          "Chance of reaching the position times the share of the reply.",
                        )}
                      >
                        <span>{t("Gaps.Column.Weight", "You will meet it")}</span>
                      </Tooltip>
                    </Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {gaps.map((gap) => (
                    <Table.Tr key={`${gap.fen}-${gap.move.uci}`}>
                      <Table.Td maw={340}>
                        <Text size="xs" c="dimmed" truncate>
                          {gap.sans.length > 0
                            ? formatMoveList(gap.startFen, gap.sans)
                            : t("Gaps.StartPosition", "Start position")}
                        </Text>
                        <Text size="sm" fw={700}>
                          {formatMoveList(gap.startFen, gap.sans, gap.move.san).split(" ").at(-1)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{percent(gap.share)}</Text>
                        <Text size="xs" c="dimmed">
                          {t("Gaps.Games", "{{count}} games", {
                            count: gap.games,
                          })}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          color={
                            gap.weight >= 0.05 ? "orange" : gap.weight >= 0.01 ? "yellow" : "gray"
                          }
                        >
                          {percent(gap.weight)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap" justify="flex-end">
                          <Button
                            size="compact-xs"
                            variant="default"
                            leftSection={<IconChessKnight size={12} />}
                            onClick={() => void openOnBoard(gap)}
                          >
                            {t("Gaps.OpenBoard", "Add by hand")}
                          </Button>
                          <Button
                            size="compact-xs"
                            variant="light"
                            leftSection={<IconSparkles size={12} />}
                            onClick={() => {
                              onClose();
                              setGeneratorGap(gap);
                            }}
                          >
                            {t("Gaps.Generate", "Generate")}
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          )}
          {gaps.length > 0 && (
            <Text size="xs" c="dimmed">
              {t(
                "Gaps.Footer",
                "“Add by hand” opens the position on the board: play your reply and use “Add to repertoire”. “Generate” builds a few lines from there with the repertoire generator, which you can review and add the same way.",
              )}
            </Text>
          )}
        </Stack>
      </Modal>

      {generatorGap && generatorRoot && (
        <RepertoireGeneratorModal
          opened
          onClose={() => setGeneratorGap(null)}
          startFen={generatorGap.startFen}
          rootFen={generatorRoot.fen}
          rootMoves={[...generatorGap.path, generatorRoot.uci]}
          line={[{ fen: generatorRoot.fen }]}
          documentDir={documentDir}
          initialColor={color}
        />
      )}
    </>
  );
}
