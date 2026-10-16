import {
  Avatar,
  Badge,
  Box,
  Center,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconDatabase, IconSearch, IconUserCircle, IconUsersGroup } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import cx from "clsx";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { playerAnalysisReturnTargetAtom } from "@/state/playerAnalysis";
import {
  type PlayerCardKind,
  type PlayerCardSelection,
  playerCardSelectionAtom,
  sourceKey,
} from "@/state/playerCards";
import { getDatabases, query_players } from "@/utils/db";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import { initials } from "./common";
import { KIND_COLORS, useKindLabels } from "./PlayerCardModals";
import PlayerCardView from "./PlayerCardView";
import classes from "./PlayersPage.module.css";
import { type ResolvedPlayerCard, usePlayerCards } from "./usePlayerCards";

const SEARCH_RESULTS_PER_DATABASE = 6;

type SearchResult = PlayerAnalysisSource;

/** Players in every local database whose name has all the words of the query (I-01). */
async function searchPlayers(query: string): Promise<SearchResult[]> {
  const databases = (await getDatabases()).filter((database) => database.type === "success");
  const results = await Promise.all(
    databases.map(async (database) => {
      try {
        const players = await query_players(database.file, {
          name: query,
          options: {
            page: 1,
            pageSize: SEARCH_RESULTS_PER_DATABASE,
            sort: "games",
            direction: "desc",
            skipCount: true,
          },
        });
        return players.data
          .filter((player) => player.id !== 0 && player.name)
          .map((player) => ({
            databasePath: database.file,
            databaseTitle: (database.type === "success" && database.title) || database.filename,
            playerId: player.id,
            playerName: player.name!,
          }));
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}

function selectionKey(selection: PlayerCardSelection | null) {
  if (!selection) return null;
  if (selection.origin === "saved") return `saved:${selection.id}`;
  if (selection.origin === "account") return `account:${selection.name}`;
  return `search:${sourceKey(selection.source)}`;
}

/** Players section (8.4): search any player of the local databases and keep cards of people. */
export default function PlayersPage() {
  const { t } = useTranslation();
  const kinds = useKindLabels();
  const cards = usePlayerCards();
  const [selection, setSelection] = useAtom(playerCardSelectionAtom);
  const [returnTarget, setReturnTarget] = useAtom(playerAnalysisReturnTargetAtom);
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query.trim(), 300);
  const { data: results, isLoading: searching } = useSWR(
    debouncedQuery.length >= 2 ? ["players-search", debouncedQuery] : null,
    ([, value]) => searchPlayers(value),
    { keepPreviousData: true },
  );

  const allCards = useMemo(
    () => [...cards.accountCards, ...cards.savedCards],
    [cards.accountCards, cards.savedCards],
  );

  // Coming back from a game: the card whose analysis opened it.
  useEffect(() => {
    if (!returnTarget) return;
    const card = allCards.find(
      (candidate) => candidate.analysisProfileId === returnTarget.profileId,
    );
    if (card) {
      setSelection(
        card.origin === "saved"
          ? { origin: "saved", id: card.savedId! }
          : { origin: "account", name: card.name },
      );
      setReturnTarget(null);
    } else if (!cards.accountsLoading) {
      setReturnTarget(null);
    }
  }, [allCards, cards.accountsLoading, returnTarget, setReturnTarget, setSelection]);

  // Without a choice, the user's own card.
  useEffect(() => {
    if (selection || returnTarget || allCards.length === 0) return;
    const first = allCards[0];
    setSelection(
      first.origin === "saved"
        ? { origin: "saved", id: first.savedId! }
        : { origin: "account", name: first.name },
    );
  }, [allCards, returnTarget, selection, setSelection]);

  const { resolve } = cards;
  const card = useMemo(() => resolve(selection), [resolve, selection]);
  // A selection whose card disappeared (deleted, account removed) is dropped.
  useEffect(() => {
    if (selection && !card && !cards.accountsLoading) setSelection(null);
  }, [card, cards.accountsLoading, selection, setSelection]);

  const groups: Array<{ key: string; title: string; cards: ResolvedPlayerCard[] }> = [
    {
      key: "accounts",
      title: t("Players.Group.Accounts", "My accounts"),
      cards: cards.accountCards,
    },
    ...(["self", "rival", "student", "other"] as PlayerCardKind[]).map((kind) => ({
      key: kind,
      title: {
        self: t("Players.Group.Self", "Me (other sources)"),
        rival: t("Players.Group.Rivals", "Rivals"),
        student: t("Players.Group.Students", "Students"),
        other: t("Players.Group.Others", "Others"),
      }[kind],
      cards: cards.savedCards.filter((saved) => saved.kind === kind),
    })),
  ].filter((group) => group.cards.length > 0);

  const activeKey = selectionKey(selection);
  const savedKeys = new Set(cards.savedCards.flatMap((saved) => saved.sources.map(sourceKey)));

  return (
    <Group h="100%" gap={0} wrap="nowrap" align="stretch" style={{ overflow: "hidden" }}>
      <Box className={classes.sidebar}>
        <Stack gap="sm" p="md" pb="xs">
          <Group gap="xs">
            <ThemeIcon variant="light" radius="md" size="lg">
              <IconUsersGroup size={20} />
            </ThemeIcon>
            <div>
              <Title order={4} lh={1.1}>
                {t("Players.Title", "Players")}
              </Title>
              <Text size="xs" c="dimmed">
                {t("Players.Subtitle", "Cards for you, rivals and students")}
              </Text>
            </div>
          </Group>
          <TextInput
            leftSection={<IconSearch size={16} />}
            rightSection={searching ? <Loader size={14} /> : null}
            placeholder={t("Players.Search", "Search players in your databases")}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </Stack>
        <ScrollArea style={{ flex: 1 }} offsetScrollbars px="md">
          <Stack gap="md" pb="md">
            {debouncedQuery.length >= 2 && (
              <Stack gap={4}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  {t("Players.Results", "Results")}
                </Text>
                {results && results.length === 0 && !searching && (
                  <Text size="sm" c="dimmed">
                    {t("Players.NoResults", "Nobody with all those words in a local database.")}
                  </Text>
                )}
                {results?.map((result) => {
                  const selectionValue: PlayerCardSelection = { origin: "search", source: result };
                  return (
                    <UnstyledButton
                      key={sourceKey(result)}
                      className={cx(classes.item, {
                        [classes.active]: activeKey === selectionKey(selectionValue),
                      })}
                      onClick={() => setSelection(selectionValue)}
                    >
                      <Group gap="sm" wrap="nowrap">
                        <Avatar size={32} radius="xl" color="gray">
                          {initials(result.playerName)}
                        </Avatar>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Text size="sm" fw={500} truncate>
                            {result.playerName}
                          </Text>
                          <Group gap={4} wrap="nowrap">
                            <IconDatabase size={12} color="var(--mantine-color-dimmed)" />
                            <Text size="xs" c="dimmed" truncate>
                              {result.databaseTitle}
                            </Text>
                          </Group>
                        </div>
                        {savedKeys.has(sourceKey(result)) && (
                          <Badge size="xs" variant="light">
                            {t("Players.Saved", "Saved")}
                          </Badge>
                        )}
                      </Group>
                    </UnstyledButton>
                  );
                })}
              </Stack>
            )}
            {groups.map((group) => (
              <Stack key={group.key} gap={4}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  {group.title}
                </Text>
                {group.cards.map((item) => {
                  const selectionValue: PlayerCardSelection =
                    item.origin === "saved"
                      ? { origin: "saved", id: item.savedId! }
                      : { origin: "account", name: item.name };
                  return (
                    <UnstyledButton
                      key={item.id}
                      className={cx(classes.item, {
                        [classes.active]: activeKey === selectionKey(selectionValue),
                      })}
                      onClick={() => setSelection(selectionValue)}
                    >
                      <Group gap="sm" wrap="nowrap">
                        <Avatar
                          size={32}
                          radius="xl"
                          color={KIND_COLORS[item.kind]}
                          variant="light"
                        >
                          {initials(item.name)}
                        </Avatar>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Text size="sm" fw={500} truncate>
                            {item.name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {item.origin === "account"
                              ? item.sources.map((source) => source.databaseTitle).join(" · ") ||
                                t("Players.NoDownloads", "Games not downloaded yet")
                              : `${kinds[item.kind]} · ${item.sources.length > 1 ? t("Players.SourcesCount", "{{count}} sources", { count: item.sources.length }) : item.sources[0]?.databaseTitle}`}
                          </Text>
                        </div>
                        {item.fide?.title && (
                          <Badge size="xs" color="yellow">
                            {item.fide.title}
                          </Badge>
                        )}
                      </Group>
                    </UnstyledButton>
                  );
                })}
              </Stack>
            ))}
            {groups.length === 0 && debouncedQuery.length < 2 && (
              <Paper withBorder radius="md" p="md" style={{ borderStyle: "dashed" }}>
                <Text size="sm" c="dimmed">
                  {t(
                    "Players.EmptyList",
                    "Search a player above, or connect your Lichess or Chess.com account in Accounts to get your own card.",
                  )}
                </Text>
              </Paper>
            )}
          </Stack>
        </ScrollArea>
      </Box>

      <Box style={{ flex: 1, minWidth: 0 }} p="md">
        {card ? (
          <PlayerCardView
            key={card.id}
            card={card}
            returnPath="/players"
            selfSources={cards.selfSources}
            actions={
              card.origin === "search"
                ? {
                    save: (value) => {
                      const id = cards.saveCard(card.sources, value);
                      setSelection({ origin: "saved", id });
                    },
                  }
                : {
                    update: (change) => cards.updateCard(card, change),
                    markAliasesMigrated: () => cards.markAliasesMigrated(card.analysisProfileId),
                    remove:
                      card.origin === "saved" && card.savedId
                        ? () => {
                            cards.deleteCard(card.savedId!);
                            setSelection(null);
                          }
                        : undefined,
                  }
            }
          />
        ) : cards.accountsLoading ? (
          <Center h="100%">
            <Loader />
          </Center>
        ) : (
          <Center h="100%">
            <Stack align="center" gap="sm" maw={420}>
              <ThemeIcon size={64} radius="xl" variant="light">
                <IconUserCircle size={36} />
              </ThemeIcon>
              <Title order={4}>{t("Players.Empty.Title", "Pick a player")}</Title>
              <Text c="dimmed" ta="center" size="sm">
                {t(
                  "Players.Empty.Description",
                  "Search any player of your local databases on the left, or connect your accounts to see your own card.",
                )}
              </Text>
              <Text size="sm" component={Link} to="/accounts" c="blue">
                {t("Players.Empty.Accounts", "Go to Accounts")}
              </Text>
            </Stack>
          </Center>
        )}
      </Box>
    </Group>
  );
}
