import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Progress,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconBroadcast,
  IconCloudDownload,
  IconFileImport,
  IconSearch,
  IconUserPlus,
} from "@tabler/icons-react";
import { resolve } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { commands } from "@/bindings";
import { databaseConversionStateAtom, sessionsAtom, storedDatabasesDirAtom } from "@/state/atoms";
import { sourceKey } from "@/state/playerCards";
import { getDatabases, query_players } from "@/utils/db";
import {
  BROADCAST_DATABASE_TITLE,
  type BroadcastTour,
  broadcastImports,
  importBroadcasts,
  searchBroadcasts,
} from "@/utils/lichess/broadcasts";
import { getLichessAccount } from "@/utils/lichess/api";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import { syncAccountGames } from "@/utils/players/accountSync";
import { unwrap } from "@/utils/unwrap";

type Kind = "lichess" | "chesscom" | "pgn" | "broadcasts";

type Target = { path: string; title: string; query: string };

function formatDates(dates?: number[]) {
  if (!dates?.length) return "";
  const format = (value: number) =>
    new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  return dates.length > 1 && dates[1] !== dates[0]
    ? `${format(dates[0])} – ${format(dates[1])}`
    : format(dates[0]);
}

/**
 * Games of a rival from where they are (8.6): their Lichess or Chess.com account, a PGN file or
 * Lichess broadcasts of over-the-board tournaments (part of I-04). Each source becomes a local
 * database; the user then picks the rival's record in it, as with any alias (Onyx never infers
 * identities).
 */
export default function RivalGamesModal({
  opened,
  onClose,
  name,
  sources,
  onAdd,
}: {
  opened: boolean;
  onClose: () => void;
  name: string;
  sources: PlayerAnalysisSource[];
  onAdd: (sources: PlayerAnalysisSource[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>("lichess");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [databaseDir] = useAtom(storedDatabasesDirAtom);
  const [, setConversionState] = useAtom(databaseConversionStateAtom);
  const sessions = useAtomValue(sessionsAtom);
  const token = sessions.find((session) => session.lichess?.accessToken)?.lichess?.accessToken;

  useEffect(() => {
    if (!opened) {
      setTarget(null);
      setError(null);
      setBusy(null);
      setProgress(null);
    }
  }, [opened]);

  async function run(label: string, task: () => Promise<Target | null>) {
    setBusy(label);
    setError(null);
    try {
      const result = await task();
      if (result) setTarget(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function downloadAccount(type: "lichess" | "chesscom") {
    const user = username.trim();
    if (!user) return;
    await run(t("Players.RivalGames.Downloading", "Downloading the games…"), async () => {
      const filename = `${user}_${type}.db3`;
      const database = (await getDatabases()).find((candidate) => candidate.filename === filename);
      let total = 0;
      if (type === "lichess") {
        const account = await getLichessAccount({ username: user });
        if (!account) return null;
        total = (account as { count?: { all?: number } }).count?.all ?? 0;
      }
      await syncAccountGames(
        {
          type,
          title: user,
          database: database ?? null,
          total,
          token: type === "lichess" ? token : undefined,
        },
        databaseDir,
        setConversionState,
        (value) => setProgress(value),
      );
      return {
        path: await resolve(databaseDir, filename),
        title: `${user} ${type === "lichess" ? "Lichess" : "Chess.com"}`,
        query: user,
      };
    });
  }

  async function importPgn() {
    const file = await open({ multiple: false, filters: [{ name: "PGN", extensions: ["pgn"] }] });
    if (!file || Array.isArray(file)) return;
    await run(t("Players.RivalGames.Importing", "Importing the PGN…"), async () => {
      const base =
        file
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.pgn$/i, "") || "Rival";
      const path = await resolve(databaseDir, `${base}.db3`);
      unwrap(await commands.convertPgn([file], path, null, base, null));
      return { path, title: base, query: name };
    });
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      centered
      title={
        <Group gap="xs">
          <IconCloudDownload size={18} />
          <Text fw={700}>{t("Players.RivalGames.Title", "Add games of {{name}}", { name })}</Text>
        </Group>
      }
    >
      {target ? (
        <PickRecords
          target={target}
          existing={sources}
          onBack={() => setTarget(null)}
          onAdd={async (picked) => {
            await onAdd(picked);
            onClose();
          }}
        />
      ) : (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t(
              "Players.RivalGames.Description",
              "The games go into a local database; then choose which player in it is {{name}}. The preparation does not need a reference database.",
              { name },
            )}
          </Text>
          <SegmentedControl
            fullWidth
            value={kind}
            onChange={(value) => setKind(value as Kind)}
            disabled={Boolean(busy)}
            data={[
              { value: "lichess", label: "Lichess" },
              { value: "chesscom", label: "Chess.com" },
              { value: "pgn", label: t("Players.RivalGames.Pgn", "PGN file") },
              { value: "broadcasts", label: t("Players.RivalGames.Broadcasts", "Broadcasts") },
            ]}
          />
          {(kind === "lichess" || kind === "chesscom") && (
            <Group align="flex-end">
              <TextInput
                style={{ flex: 1 }}
                label={t("Players.RivalGames.Username", "Username")}
                value={username}
                onChange={(event) => setUsername(event.currentTarget.value)}
                disabled={Boolean(busy)}
              />
              <Button
                leftSection={<IconCloudDownload size={16} />}
                disabled={!username.trim() || Boolean(busy)}
                onClick={() => void downloadAccount(kind)}
              >
                {t("Players.RivalGames.Download", "Download")}
              </Button>
            </Group>
          )}
          {kind === "pgn" && (
            <Button
              variant="light"
              leftSection={<IconFileImport size={16} />}
              disabled={Boolean(busy)}
              onClick={() => void importPgn()}
            >
              {t("Players.RivalGames.ChoosePgn", "Choose a PGN file")}
            </Button>
          )}
          {kind === "broadcasts" && (
            <BroadcastSearch
              initialQuery=""
              busy={Boolean(busy)}
              onImport={(tours) =>
                void run(
                  t("Players.RivalGames.Downloading", "Downloading the games…"),
                  async () => ({
                    path: await importBroadcasts(tours, (done, total) =>
                      setProgress(total ? (done / total) * 100 : null),
                    ),
                    title: BROADCAST_DATABASE_TITLE,
                    query: name,
                  }),
                )
              }
            />
          )}
          {busy && (
            <Stack gap={4}>
              <Progress value={progress ?? 100} animated striped />
              <Text size="xs" c="dimmed">
                {busy}
              </Text>
            </Stack>
          )}
          {error && <Alert color="red">{error}</Alert>}
        </Stack>
      )}
    </Modal>
  );
}

function BroadcastSearch({
  initialQuery,
  busy,
  onImport,
}: {
  initialQuery: string;
  busy: boolean;
  onImport: (tours: BroadcastTour[]) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [debounced] = useDebouncedValue(query.trim(), 400);
  const [selected, setSelected] = useState<Record<string, BroadcastTour>>({});
  const { data, isLoading, error } = useSWR(
    debounced.length >= 3 ? ["broadcast-search", debounced] : null,
    ([, value]) => searchBroadcasts(value),
  );
  const imported = broadcastImports();
  const chosen = Object.values(selected);
  return (
    <Stack gap="sm">
      <TextInput
        leftSection={<IconSearch size={16} />}
        placeholder={t("Players.RivalGames.BroadcastQuery", "Tournament, country or city")}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        disabled={busy}
      />
      <Text size="xs" c="dimmed">
        {t(
          "Players.RivalGames.BroadcastHint",
          "Official Lichess broadcasts of over-the-board tournaments (CC BY-SA). All rounds of the chosen tournaments go into the “Lichess broadcasts” database.",
        )}
      </Text>
      {error && <Alert color="red">{error instanceof Error ? error.message : String(error)}</Alert>}
      <ScrollArea.Autosize mah={300} offsetScrollbars>
        <Stack gap={6}>
          {isLoading && (
            <Text size="sm" c="dimmed">
              {t("Players.RivalGames.Searching", "Searching…")}
            </Text>
          )}
          {data?.length === 0 && (
            <Text size="sm" c="dimmed">
              {t("Players.RivalGames.NoBroadcasts", "No broadcast matches.")}
            </Text>
          )}
          {data?.map((tour) => (
            <Paper key={tour.id} withBorder radius="md" p="xs">
              <Checkbox
                checked={Boolean(selected[tour.id])}
                disabled={busy}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setSelected((previous) => {
                    const next = { ...previous };
                    if (checked) next[tour.id] = tour;
                    else delete next[tour.id];
                    return next;
                  });
                }}
                label={
                  <Stack gap={2}>
                    <Group gap={6}>
                      <Text size="sm" fw={600}>
                        {tour.name}
                      </Text>
                      {imported[tour.id] && (
                        <Badge size="xs" variant="light" color="teal">
                          {t("Players.RivalGames.Imported", "Imported")}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {[tour.location, tour.timeControl, formatDates(tour.dates)]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Stack>
                }
              />
            </Paper>
          ))}
        </Stack>
      </ScrollArea.Autosize>
      <Group justify="flex-end">
        <Button
          leftSection={<IconBroadcast size={16} />}
          disabled={chosen.length === 0 || busy}
          onClick={() => onImport(chosen)}
        >
          {t("Players.RivalGames.ImportBroadcasts", "Import {{count}} tournaments", {
            count: chosen.length,
          })}
        </Button>
      </Group>
    </Stack>
  );
}

/** Second step: which records of the new database are the rival. */
function PickRecords({
  target,
  existing,
  onBack,
  onAdd,
}: {
  target: Target;
  existing: PlayerAnalysisSource[];
  onBack: () => void;
  onAdd: (sources: PlayerAnalysisSource[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(target.query);
  const [debounced] = useDebouncedValue(query.trim(), 300);
  const [picked, setPicked] = useState<Record<string, PlayerAnalysisSource>>({});
  const [saving, setSaving] = useState(false);
  const known = new Set(existing.map(sourceKey));
  const { data, isLoading } = useSWR(
    debounced ? ["rival-records", target.path, debounced] : null,
    async () => {
      const players = await query_players(target.path, {
        name: debounced,
        options: { page: 1, pageSize: 20, sort: "games", direction: "desc", skipCount: true },
      });
      return players.data
        .filter((player) => player.id !== 0 && player.name)
        .map((player) => ({
          source: {
            databasePath: target.path,
            databaseTitle: target.title,
            playerId: player.id,
            playerName: player.name!,
          } satisfies PlayerAnalysisSource,
          elo: player.elo,
        }));
    },
  );
  const chosen = Object.values(picked);
  return (
    <Stack gap="md">
      <Alert color="teal" variant="light" py={8}>
        {t("Players.RivalGames.Ready", "Games saved in “{{title}}”. Choose the player's records:", {
          title: target.title,
        })}
      </Alert>
      <TextInput
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <ScrollArea.Autosize mah={320} offsetScrollbars>
        <Stack gap={6}>
          {isLoading && (
            <Text size="sm" c="dimmed">
              {t("Players.RivalGames.Searching", "Searching…")}
            </Text>
          )}
          {data?.length === 0 && (
            <Text size="sm" c="dimmed">
              {t("Players.RivalGames.NoRecords", "No player with those words in this database.")}
            </Text>
          )}
          {data?.map(({ source, elo }) => {
            const key = sourceKey(source);
            const already = known.has(key);
            return (
              <Checkbox
                key={key}
                disabled={already}
                checked={already || Boolean(picked[key])}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setPicked((previous) => {
                    const next = { ...previous };
                    if (checked) next[key] = source;
                    else delete next[key];
                    return next;
                  });
                }}
                label={
                  <Group gap={6}>
                    <Text size="sm">{source.playerName}</Text>
                    {elo != null && elo > 0 && (
                      <Text size="xs" c="dimmed">
                        {elo}
                      </Text>
                    )}
                    {already && (
                      <Badge size="xs" variant="light">
                        {t("Players.RivalGames.InCard", "In the card")}
                      </Badge>
                    )}
                  </Group>
                }
              />
            );
          })}
        </Stack>
      </ScrollArea.Autosize>
      <Group justify="space-between">
        <Button variant="default" onClick={onBack}>
          {t("Common.Back", "Back")}
        </Button>
        <Button
          leftSection={<IconUserPlus size={16} />}
          disabled={chosen.length === 0}
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onAdd(chosen);
            } finally {
              setSaving(false);
            }
          }}
        >
          {t("Players.RivalGames.Add", "Add to the card")}
        </Button>
      </Group>
    </Stack>
  );
}
