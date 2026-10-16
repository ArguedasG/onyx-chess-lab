import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconExternalLink, IconSearch, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr/immutable";
import { commands } from "@/bindings";
import { PlayerSearchInput } from "@/components/databases/PlayerSearchInput";
import { type PlayerCardKind, type PlayerFideLink, sourceKey } from "@/state/playerCards";
import { getDatabases } from "@/utils/db";
import { type LichessFidePlayer, searchFidePlayers } from "@/utils/lichess/api";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import { unwrap } from "@/utils/unwrap";

export function useKindLabels() {
  const { t } = useTranslation();
  return {
    self: t("Players.Kind.Self", "Me"),
    rival: t("Players.Kind.Rival", "Rival"),
    student: t("Players.Kind.Student", "Student"),
    other: t("Players.Kind.Other", "Other"),
  } satisfies Record<PlayerCardKind, string>;
}

export const KIND_COLORS: Record<PlayerCardKind, string> = {
  self: "blue",
  rival: "red",
  student: "teal",
  other: "gray",
};

/** Name, kind and notes of a card; used to save a search result and to edit a saved card. */
export function CardEditModal({
  opened,
  onClose,
  title,
  initial,
  onSubmit,
  allowName = true,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  initial: { name: string; kind: PlayerCardKind; notes?: string };
  onSubmit: (value: { name: string; kind: PlayerCardKind; notes: string }) => void;
  allowName?: boolean;
}) {
  const { t } = useTranslation();
  const kinds = useKindLabels();
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState<PlayerCardKind>(initial.kind);
  const [notes, setNotes] = useState(initial.notes ?? "");
  useEffect(() => {
    if (!opened) return;
    setName(initial.name);
    setKind(initial.kind);
    setNotes(initial.notes ?? "");
  }, [initial.kind, initial.name, initial.notes, opened]);

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          onSubmit({ name: name.trim(), kind, notes });
        }}
      >
        <Stack>
          {allowName && (
            <TextInput
              label={t("Players.Edit.Name", "Name on the card")}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              required
              data-autofocus
            />
          )}
          <div>
            <Text size="sm" fw={500} mb={4}>
              {t("Players.Edit.Kind", "Kind")}
            </Text>
            <SegmentedControl
              fullWidth
              value={kind}
              onChange={(value) => setKind(value as PlayerCardKind)}
              data={(Object.keys(kinds) as PlayerCardKind[]).map((value) => ({
                value,
                label: kinds[value],
              }))}
            />
          </div>
          <Textarea
            label={t("Players.Edit.Notes", "Notes")}
            placeholder={t("Players.Edit.NotesPlaceholder", "Club, team, what to prepare…")}
            autosize
            minRows={2}
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t("Common.Cancel", "Cancel")}
            </Button>
            <Button type="submit">{t("Common.Save", "Save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/**
 * Player records of a card. Onyx never joins records by itself: every alias is a record the user
 * picks in a local database (the decision kept from 7.2).
 */
export function SourcesModal({
  opened,
  onClose,
  sources,
  fixed,
  onChange,
}: {
  opened: boolean;
  onClose: () => void;
  sources: PlayerAnalysisSource[];
  /** Records that cannot be removed here (the connected accounts). */
  fixed: ReadonlySet<string>;
  onChange: (sources: PlayerAnalysisSource[]) => void;
}) {
  const { t } = useTranslation();
  const { data: databases } = useSWR(opened ? "player-card-databases" : null, async () =>
    (await getDatabases()).filter((database) => database.type === "success"),
  );
  const [databasePath, setDatabasePath] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<number | undefined>();
  const [error, setError] = useState("");

  async function add() {
    if (!databasePath || playerId == null) return;
    const database = databases?.find((candidate) => candidate.file === databasePath);
    try {
      const player = unwrap(await commands.getPlayer(databasePath, playerId));
      if (!player?.name) throw new Error("Player not found");
      const source: PlayerAnalysisSource = {
        databasePath,
        databaseTitle:
          (database?.type === "success" && (database.title || database.filename)) || databasePath,
        playerId: player.id,
        playerName: player.name,
      };
      if (!sources.some((candidate) => sourceKey(candidate) === sourceKey(source)))
        onChange([...sources, source]);
      setPlayerId(undefined);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Players.Sources.Title", "Sources and aliases")}
      centered
      size="lg"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t(
            "Players.Sources.Scope",
            "Add the records of the same person in other databases (an OTB base, another account). Onyx never joins records by itself.",
          )}
        </Text>
        <Stack gap={6}>
          {sources.map((source) => (
            <Paper key={sourceKey(source)} withBorder radius="sm" px="sm" py={6}>
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500} truncate>
                    {source.playerName}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {source.databaseTitle}
                  </Text>
                </div>
                {fixed.has(sourceKey(source)) ? (
                  <Badge variant="light" size="sm">
                    {t("Players.Sources.Account", "Account")}
                  </Badge>
                ) : (
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    disabled={sources.length <= 1}
                    onClick={() =>
                      onChange(
                        sources.filter((candidate) => sourceKey(candidate) !== sourceKey(source)),
                      )
                    }
                    aria-label={t("Common.Remove", "Remove")}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
            </Paper>
          ))}
        </Stack>
        <Paper withBorder radius="md" p="sm">
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              {t("Players.Sources.Add", "Add a record")}
            </Text>
            <Select
              label={t("PlayerAnalysis.AliasDatabase", "Database")}
              placeholder={t("Players.Sources.ChooseDatabase", "Choose a database")}
              data={(databases ?? []).map((database) => ({
                value: database.file,
                label: (database.type === "success" && database.title) || database.filename,
              }))}
              value={databasePath}
              onChange={(value) => {
                setDatabasePath(value);
                setPlayerId(undefined);
              }}
              searchable
            />
            {databasePath && (
              <PlayerSearchInput
                label={t("PlayerAnalysis.AliasPlayer", "Search player")}
                file={databasePath}
                value={playerId}
                setValue={setPlayerId}
              />
            )}
            {error && (
              <Alert color="red" py={6}>
                {error}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button disabled={playerId == null} onClick={() => void add()}>
                {t("PlayerAnalysis.AddAlias", "Add selected alias")}
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Modal>
  );
}

function fideLink(player: LichessFidePlayer): PlayerFideLink {
  return {
    id: String(player.id),
    name: player.name,
    title: player.title ?? null,
    federation: player.federation ?? null,
    standard: player.standard ?? null,
    rapid: player.rapid ?? null,
    blitz: player.blitz ?? null,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Manual FIDE link (I-03): one lookup through the Lichess API, the user confirms a candidate and
 * only that profile and its current ratings are kept on the card.
 */
export function FideLinkModal({
  opened,
  onClose,
  name,
  linked,
  onLink,
}: {
  opened: boolean;
  onClose: () => void;
  name: string;
  linked?: PlayerFideLink;
  onLink: (link: PlayerFideLink | undefined) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(name);
  const [submitted, setSubmitted] = useState<string | null>(null);
  useEffect(() => {
    if (opened) {
      setQuery(name);
      setSubmitted(linked ? null : name);
    }
  }, [linked, name, opened]);
  const { data, error, isLoading } = useSWR(
    opened && submitted ? ["fide-search", submitted] : null,
    ([, value]) => searchFidePlayers(value),
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Players.Fide.Title", "FIDE profile")}
      centered
      size="lg"
    >
      <Stack>
        {linked && (
          <Paper withBorder radius="md" p="sm" bg="var(--mantine-color-blue-light)">
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Group gap="xs">
                  {linked.title && <Badge>{linked.title}</Badge>}
                  <Text fw={700}>{linked.name}</Text>
                </Group>
                <Text size="xs" c="dimmed">
                  FIDE ID {linked.id}
                  {linked.federation ? ` · ${linked.federation}` : ""} ·{" "}
                  {t("Players.Fide.Checked", "checked {{date}}", {
                    date: new Date(linked.checkedAt).toLocaleDateString(),
                  })}
                </Text>
              </div>
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="xs"
                  variant="default"
                  component="a"
                  href={`https://ratings.fide.com/profile/${linked.id}`}
                  target="_blank"
                  rel="noreferrer"
                  rightSection={<IconExternalLink size={14} />}
                >
                  ratings.fide.com
                </Button>
                <Button size="xs" color="red" variant="light" onClick={() => onLink(undefined)}>
                  {t("Players.Fide.Unlink", "Unlink")}
                </Button>
              </Group>
            </Group>
          </Paper>
        )}
        <Text size="sm" c="dimmed">
          {t(
            "Players.Fide.Scope",
            "Searches the FIDE list through Lichess and lets you confirm the right person. Only the profile you choose and its current ratings are saved on the card.",
          )}
        </Text>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim()) setSubmitted(query.trim());
          }}
        >
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              label={t("Players.Fide.Search", "Name or FIDE ID")}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <Button type="submit" leftSection={<IconSearch size={14} />}>
              {t("Players.Fide.SearchButton", "Search")}
            </Button>
          </Group>
        </form>
        {isLoading && <Loader size="sm" />}
        {error && (
          <Alert color="red">
            {t("Players.Fide.Error", "The FIDE search failed: {{error}}", {
              error: error instanceof Error ? error.message : String(error),
            })}
          </Alert>
        )}
        {data && data.length === 0 && (
          <Text size="sm" c="dimmed">
            {t("Databases.FIDE.PlayerNotFound", "Player not found")}
          </Text>
        )}
        <Stack gap={6}>
          {data?.map((player) => (
            <UnstyledButton
              key={player.id}
              onClick={() => {
                onLink(fideLink(player));
                onClose();
              }}
            >
              <Paper withBorder radius="sm" px="sm" py={8}>
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Group gap="xs" wrap="nowrap">
                      {player.title && <Badge size="sm">{player.title}</Badge>}
                      <Text size="sm" fw={600} truncate>
                        {player.name}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {[player.federation, player.year && `${player.year}`, `ID ${player.id}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </div>
                  <Group gap="md" wrap="nowrap">
                    {(["standard", "rapid", "blitz"] as const).map((key) => (
                      <div key={key} style={{ textAlign: "right" }}>
                        <Text size="xs" c="dimmed">
                          {
                            {
                              standard: t("Databases.FIDE.Standard", "Standard"),
                              rapid: t("Databases.FIDE.Rapid", "Rapid"),
                              blitz: t("Databases.FIDE.Blitz", "Blitz"),
                            }[key]
                          }
                        </Text>
                        <Text size="sm" fw={600}>
                          {player[key] || "—"}
                        </Text>
                      </div>
                    ))}
                  </Group>
                </Group>
              </Paper>
            </UnstyledButton>
          ))}
        </Stack>
      </Stack>
    </Modal>
  );
}
