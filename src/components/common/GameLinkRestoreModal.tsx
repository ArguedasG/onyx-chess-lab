import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { commands } from "@/bindings";
import DatabaseLoader from "@/components/panels/database/DatabaseLoader";
import { getDatabases } from "@/utils/db";
import {
  findCandidatesByIdentity,
  findCandidatesByPosition,
  type LinkCandidate,
} from "@/utils/gameLinkRestore";
import type { GameLinkIdentity } from "@/utils/gameLinks";

function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

export type RestoreChoice = { file: string; candidate: LinkCandidate & { ply: number } };

/**
 * Restores a link whose game is gone or changed: first by the link's players and year (instant),
 * then, if needed, by every game of the base that reaches the comment's position.
 */
export default function GameLinkRestoreModal({
  opened,
  onClose,
  databaseName,
  identity,
  fen,
  preferredPly,
  reason,
  onRestore,
}: {
  opened: boolean;
  onClose: () => void;
  /** File name stored in the link. */
  databaseName: string;
  identity: GameLinkIdentity | null;
  /** Position of the comment that holds the link. */
  fen: string;
  preferredPly: number;
  reason: "missing" | "changed";
  onRestore: (choice: RestoreChoice) => void;
}) {
  const { t } = useTranslation();
  const { data: databases } = useSWR(opened ? "game-link-restore-dbs" : null, getDatabases);
  const available = (databases ?? []).filter((db) => db.type === "success");
  const [file, setFile] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LinkCandidate[] | null>(null);
  const [positionTotal, setPositionTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState<"identity" | "position" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tabId = useRef(`game-link-restore:${crypto.randomUUID()}`).current;

  // Closing the dialog stops a position search still running.
  useEffect(
    () => () => {
      void commands.cancelPositionSearch(tabId);
    },
    [tabId],
  );

  // The link's own base by default, if it still exists.
  useEffect(() => {
    if (!opened || file || available.length === 0) return;
    const own = available.find((db) => fileName(db.file) === databaseName);
    setFile((own ?? available[0]).file);
  }, [opened, file, available, databaseName]);

  const searchPosition = useCallback(
    async (target: string) => {
      setLoading("position");
      setError(null);
      try {
        const result = await findCandidatesByPosition(target, identity, fen, tabId);
        setCandidates(result.candidates);
        setPositionTotal(result.total);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setLoading(null);
      }
    },
    [identity, fen, tabId],
  );

  // Each base starts with the instant search; without players to search for, by position.
  useEffect(() => {
    if (!opened || !file) return;
    let cancelled = false;
    setCandidates(null);
    setPositionTotal(null);
    setError(null);
    if (!identity) {
      void searchPosition(file);
      return;
    }
    setLoading("identity");
    findCandidatesByIdentity(file, identity, fen, preferredPly)
      .then((found) => {
        if (!cancelled) setCandidates(found);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, [opened, file, identity, fen, preferredPly, searchPosition]);

  const reachable = candidates?.filter((candidate) => candidate.ply !== null) ?? [];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={t("GameLink.Restore.Title", "Restore link")}
    >
      <Stack>
        <Alert color="yellow">
          {reason === "missing"
            ? t("GameLink.Restore.Missing", "The linked game is no longer in {{database}}.", {
                database: databaseName,
              })
            : t(
                "GameLink.Restore.Changed",
                "The link now opens a different game in {{database}}: the base was probably updated.",
                { database: databaseName },
              )}{" "}
          {identity &&
            t("GameLink.Restore.Looking", "Looking for {{white}} - {{black}}{{year}}.", {
              white: identity.white,
              black: identity.black,
              year: identity.year ? ` (${identity.year})` : "",
            })}
        </Alert>
        <Group align="end">
          <Select
            flex={1}
            label={t("GameLink.Restore.Database", "Database")}
            data={available.map((db) => ({
              value: db.file,
              label: (db.type === "success" && db.title) || fileName(db.file),
            }))}
            value={file}
            onChange={setFile}
            allowDeselect={false}
          />
          <Button
            variant="light"
            leftSection={<IconSearch size="1rem" />}
            disabled={!file || loading !== null}
            onClick={() => file && void searchPosition(file)}
          >
            {t("GameLink.Restore.ByPosition", "Search by position")}
          </Button>
        </Group>
        {loading === "position" && (
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              {t(
                "GameLink.Restore.Scanning",
                "Searching every game that reaches this position; it can take a while in a large base.",
              )}
            </Text>
            <DatabaseLoader isLoading tab={tabId} />
          </Stack>
        )}
        {error && <Alert color="red">{error}</Alert>}
        {candidates && loading === null && (
          <Text size="sm" c="dimmed">
            {positionTotal !== null
              ? t(
                  "GameLink.Restore.PositionResults",
                  "Games that reach this position: {{total}} (showing up to {{shown}}).",
                  { total: positionTotal, shown: candidates.length },
                )
              : reachable.length > 0
                ? t(
                    "GameLink.Restore.IdentityResults",
                    "Games of these players that reach this position: {{count}}.",
                    { count: reachable.length },
                  )
                : t(
                    "GameLink.Restore.IdentityNone",
                    "No game of these players reaches this position. Try searching by position.",
                  )}
          </Text>
        )}
        {candidates && candidates.length > 0 && (
          <ScrollArea.Autosize mah={360}>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("GameLink.Restore.Game", "Game")}</Table.Th>
                  <Table.Th>{t("GameLink.Restore.Date", "Date")}</Table.Th>
                  <Table.Th>{t("GameLink.Restore.Event", "Event")}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {candidates.map((candidate) => (
                  <Table.Tr key={candidate.id}>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm">
                          {candidate.white} - {candidate.black}
                        </Text>
                        {candidate.sameGame && (
                          <Badge size="xs" variant="light" color="teal">
                            {t("GameLink.Restore.SamePlayers", "Same players")}
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{candidate.date ?? "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" lineClamp={1}>
                        {candidate.event}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      {candidate.ply === null ? (
                        <Text size="xs" c="dimmed">
                          {t("GameLink.Restore.NotReached", "Does not reach the position")}
                        </Text>
                      ) : (
                        <Button
                          size="compact-sm"
                          variant="light"
                          onClick={() =>
                            file &&
                            onRestore({
                              file,
                              candidate: { ...candidate, ply: candidate.ply! },
                            })
                          }
                        >
                          {t("GameLink.Restore.Choose", "Link this game")}
                        </Button>
                      )}
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
