import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Pagination,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChessKnight,
  IconDots,
  IconDownload,
  IconPlayerPlay,
  IconPlaylistAdd,
  IconTrash,
} from "@tabler/icons-react";
import { ask, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LeakCategory } from "@/utils/mistakes/leaks";
import {
  addMistakes,
  dueItems,
  isDue,
  isLearned,
  matchesFilter,
  type MistakeFilter,
  recordResult,
  type MistakeItem,
  type MistakeQueue,
  removeMistake,
  summarizeQueue,
} from "@/utils/mistakes/queue";
import type { PlayerAnalysisCriticalPosition } from "@/utils/playerAnalysis";
import { EngineAnalysisButton, StatTile } from "../common";
import { EmptyState, SectionHeader } from "../preparation/common";
import { phaseName } from "../preparation/labels";
import { categoryName, categoryRule } from "./labels";
import MistakeSession from "./MistakeSession";

const PAGE = 25;
const SESSION_SIZE = 20;

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * "My mistakes" (I-17): the queue of errors of the analyzed games, due today, by phase and by
 * category, with short spaced-repetition sessions. Each item leads back to its game.
 */
export default function MistakeQueueSection({
  queue,
  onChange,
  criticals,
  name,
  isSelf,
  initialFilter,
  onOpenSource,
}: {
  queue: MistakeQueue;
  onChange: (change: (queue: MistakeQueue) => MistakeQueue) => void;
  /** Errors of the current engine analysis, within the card filters. */
  criticals: PlayerAnalysisCriticalPosition[];
  name: string;
  isSelf: boolean;
  initialFilter?: MistakeFilter;
  onOpenSource: (item: MistakeItem) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<MistakeFilter>(initialFilter ?? {});
  const [session, setSession] = useState<MistakeItem[] | null>(null);
  const [page, setPage] = useState(1);
  const summary = useMemo(() => summarizeQueue(queue), [queue]);
  const pending = useMemo(() => addMistakes(queue, criticals).added, [criticals, queue]);
  const filtered = useMemo(
    () =>
      Object.values(queue.items)
        .filter((item) => matchesFilter(item, filter))
        .sort((a, b) => Number(isDue(b)) - Number(isDue(a)) || b.addedAt.localeCompare(a.addedAt)),
    [filter, queue.items],
  );
  const dueFiltered = useMemo(() => dueItems(queue, filter, SESSION_SIZE), [filter, queue]);
  const filtering = Boolean(filter.phase || filter.category);

  function addFromAnalysis() {
    onChange((current) => {
      const { queue: next, added } = addMistakes(current, criticals);
      notifications.show({
        color: added ? "green" : "gray",
        message: added
          ? t("Mistakes.Added", "{{count}} errors added to the queue.", { count: added })
          : t("Mistakes.NothingNew", "No new errors in this analysis."),
      });
      return next;
    });
  }

  async function exportQueue() {
    const path = await save({
      defaultPath: `${name.replace(/[\\/:*?"<>|]/g, "_")} - ${t("Mistakes.File", "mistakes")}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    await writeTextFile(path, JSON.stringify(queue, null, 2));
    notifications.show({ color: "green", message: t("Mistakes.Exported", "Queue exported.") });
  }

  return (
    <Stack gap="md">
      {session && (
        <MistakeSession
          items={session}
          onResult={(item, result) =>
            onChange((current) => {
              const stored = current.items[item.id];
              if (!stored) return current;
              return {
                ...current,
                items: { ...current.items, [item.id]: recordResult(stored, result) },
              };
            })
          }
          onOpenGame={onOpenSource}
          onClose={() => setSession(null)}
        />
      )}
      <SectionHeader
        icon={<IconPlaylistAdd size={18} />}
        title={
          isSelf
            ? t("Mistakes.Title", "My mistakes")
            : t("Mistakes.TitleOther", "Mistakes of {{name}}", { name })
        }
        description={t(
          "Mistakes.Description",
          "The errors of the analyzed games as exercises: find a better move than the one played. Each comes back by spaced repetition until it is learned; the same position counts once, whatever the number of games.",
        )}
        right={
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconDownload size={14} />}
                onClick={() => void exportQueue()}
              >
                {t("Mistakes.Export", "Export the queue (JSON)")}
              </Menu.Item>
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={async () => {
                  if (
                    !(await ask(
                      t(
                        "Mistakes.ClearConfirm",
                        "Empty the queue? Its progress is lost and these positions are not added again automatically.",
                      ),
                      { kind: "warning" },
                    ))
                  )
                    return;
                  onChange((current) => ({
                    ...current,
                    items: {},
                    dismissed: [
                      ...new Set([
                        ...current.dismissed,
                        ...Object.values(current.items).map((item) => item.key),
                      ]),
                    ],
                  }));
                }}
              >
                {t("Mistakes.Clear", "Empty the queue")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        }
      />

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <StatTile
          label={t("Mistakes.DueToday", "Due today")}
          value={summary.due}
          accent={summary.due ? "orange" : undefined}
        />
        <StatTile label={t("Mistakes.InQueue", "In the queue")} value={summary.total} />
        <StatTile label={t("Mistakes.Learned", "Learned")} value={summary.learned} accent="teal" />
        <StatTile
          label={t("Mistakes.NextReview", "Next review")}
          value={summary.due ? t("Mistakes.Now", "Now") : formatDate(summary.nextDue)}
        />
      </SimpleGrid>

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Stack gap={8}>
            <Switch
              checked={queue.autoAdd}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                onChange((current) => ({ ...current, autoAdd: checked }));
              }}
              label={t("Mistakes.AutoAdd", "Add errors automatically after each engine analysis")}
              description={t(
                "Mistakes.AutoAddHint",
                "Mistakes and blunders of this card; removed items do not come back.",
              )}
            />
            <Switch
              size="xs"
              checked={queue.includeInaccuracies}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                onChange((current) => ({ ...current, includeInaccuracies: checked }));
              }}
              label={t("Mistakes.Inaccuracies", "Include inaccuracies")}
            />
          </Stack>
          <Group gap="xs">
            {criticals.length === 0 ? (
              <EngineAnalysisButton />
            ) : (
              <Button
                variant="default"
                leftSection={<IconPlaylistAdd size={16} />}
                disabled={pending === 0}
                onClick={addFromAnalysis}
              >
                {t("Mistakes.AddFromAnalysis", "Add from the analysis ({{count}} new)", {
                  count: pending,
                })}
              </Button>
            )}
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              disabled={dueFiltered.length === 0}
              onClick={() => setSession(dueFiltered)}
            >
              {filtering
                ? t("Mistakes.ReviewFiltered", "Review these ({{count}})", {
                    count: dueFiltered.length,
                  })
                : t("Mistakes.Review", "Review today ({{count}})", { count: dueFiltered.length })}
            </Button>
          </Group>
        </Group>
      </Paper>

      {summary.total === 0 ? (
        <EmptyState>
          {criticals.length
            ? t(
                "Mistakes.EmptyWithAnalysis",
                "The queue is empty. Add the errors of the current analysis or turn on the automatic addition.",
              )
            : t(
                "Mistakes.EmptyNoAnalysis",
                "The queue fills from the engine analysis of the games: analyze some games first.",
              )}
        </EmptyState>
      ) : (
        <>
          <Group gap="sm" wrap="wrap">
            <SegmentedControl
              size="xs"
              value={filter.phase ?? "all"}
              onChange={(value) => {
                setFilter((previous) => ({
                  ...previous,
                  phase: value === "all" ? undefined : (value as MistakeItem["phase"]),
                }));
                setPage(1);
              }}
              data={[
                {
                  value: "all",
                  label: t("Mistakes.AllPhases", "All phases · {{count}}", {
                    count: summary.total,
                  }),
                },
                ...(["opening", "middlegame", "endgame"] as const).map((phase) => ({
                  value: phase,
                  label: `${phaseName(phase, t)} · ${summary.byPhase[phase].due}/${summary.byPhase[phase].total}`,
                })),
              ]}
            />
            <Select
              size="xs"
              w={240}
              clearable
              placeholder={t("Mistakes.AllCategories", "All categories")}
              value={filter.category ?? null}
              onChange={(value) => {
                setFilter((previous) => ({
                  ...previous,
                  category: (value as LeakCategory | null) ?? undefined,
                }));
                setPage(1);
              }}
              data={summary.byCategory.map((row) => ({
                value: row.category,
                label: `${categoryName(row.category, t)} · ${row.due}/${row.total}`,
              }))}
            />
            <Text size="xs" c="dimmed">
              {t("Mistakes.FilterHint", "Due / total")}
            </Text>
          </Group>

          <Paper withBorder radius="md" p={0}>
            <Table striped highlightOnHover verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("PlayerAnalysis.Game", "Game")}</Table.Th>
                  <Table.Th>{t("Mistakes.Category", "Category")}</Table.Th>
                  <Table.Th>{t("PlayerAnalysis.Phase", "Phase")}</Table.Th>
                  <Table.Th ta="right">{t("Mistakes.Loss", "Lost")}</Table.Th>
                  <Table.Th>{t("Mistakes.Next", "Next")}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.slice((page - 1) * PAGE, page * PAGE).map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td maw={260}>
                      <Text size="sm" lineClamp={1}>
                        {item.sources[0]?.gameLabel}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {item.opening}
                        {item.sources.length > 1 &&
                          ` · ${t("Mistakes.Session.Repeated", "in {{count}} games", { count: item.sources.length })}`}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Tooltip multiline w={280} label={categoryRule(item.category, t)}>
                        <Badge size="sm" variant="light" color="grape" style={{ cursor: "help" }}>
                          {categoryName(item.category, t)}
                        </Badge>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{phaseName(item.phase, t)}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm">
                        {item.winChanceLoss != null
                          ? `${Math.round(item.winChanceLoss)} %`
                          : `${Math.round(item.cpLoss)} cp`}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {isDue(item) ? (
                        <Badge size="sm" color="orange" variant="light">
                          {t("Mistakes.Now", "Now")}
                        </Badge>
                      ) : isLearned(item) ? (
                        <Badge size="sm" color="teal" variant="light">
                          {formatDate(item.review?.due)}
                        </Badge>
                      ) : (
                        <Text size="sm">{formatDate(item.review?.due)}</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={2} justify="flex-end" wrap="nowrap">
                        <Tooltip label={t("Mistakes.ReviewOne", "Review now")}>
                          <ActionIcon variant="subtle" onClick={() => setSession([item])}>
                            <IconPlayerPlay size={15} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={t("Mistakes.Session.OpenGame", "Open the game")}>
                          <ActionIcon variant="subtle" onClick={() => onOpenSource(item)}>
                            <IconChessKnight size={15} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={t("Mistakes.Remove", "Remove from the queue")}>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => onChange((current) => removeMistake(current, item.id))}
                          >
                            <IconTrash size={15} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
          {filtered.length > PAGE && (
            <Group justify="center">
              <Pagination
                size="sm"
                total={Math.ceil(filtered.length / PAGE)}
                value={page}
                onChange={setPage}
              />
            </Group>
          )}
        </>
      )}
    </Stack>
  );
}
