import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Grid,
  Group,
  List,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { IconChessKnight, IconDatabase, IconPlayerPlay, IconSearch } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type PawnStructure, type StructureModelGames } from "@/bindings";
import { Chessground } from "@/chessground/Chessground";
import MaiaRequiredAlert from "@/components/common/MaiaRequiredAlert";
import { DEFAULT_TIME_CONTROL } from "@/components/boards/OpponentForm";
import { RatingParValue } from "@/components/players/common";
import { formatScore } from "@/components/players/labels";
import { usePreparationEngines } from "@/components/players/preparation/common";
import {
  activeTabAtom,
  gameInputColorAtom,
  gamePlayer1SettingsAtom,
  gamePlayer2SettingsAtom,
  referenceDbAtom,
  tabsAtom,
} from "@/state/atoms";
import { clampMaiaElo, MAIA_ELO_MAX } from "@/utils/humanBots";
import { gamesWithStructure, structureRole } from "@/utils/preparation/structures";
import type { ProfileGame } from "@/utils/players/profileGames";
import { resultBucket } from "@/utils/players/results";
import { breakSquares, STRUCTURE_INFO } from "@/utils/structures/catalog";
import { createTab } from "@/utils/tabs";
import { launchTrainingPosition } from "@/utils/trainingLaunch";
import { unwrap } from "@/utils/unwrap";
import {
  familyName,
  structureName,
  structurePlans,
  structureRule,
  structureSummary,
} from "./texts";

const MODEL_GAMES = 20;

/** The player whose games are shown in the card, when it is opened from a player card. */
export type StructurePlayerContext = {
  name: string;
  games: readonly ProfileGame[];
  onOpenGame: (game: ProfileGame, ply: number | null) => void;
};

function SkeletonBoard({ structure }: { structure: PawnStructure }) {
  const info = STRUCTURE_INFO[structure];
  const shapes: DrawShape[] = [
    ...info.breaks.white.map((move) => {
      const [orig, dest] = breakSquares(move);
      return { orig: orig as Key, dest: dest as Key, brush: "green" };
    }),
    ...info.breaks.black.map((move) => {
      const [orig, dest] = breakSquares(move);
      return { orig: orig as Key, dest: dest as Key, brush: "blue" };
    }),
  ];
  return (
    <Box style={{ aspectRatio: "1 / 1", width: "100%", maxWidth: 300, margin: "0 auto" }}>
      <Chessground
        fen={info.skeleton}
        coordinates
        viewOnly
        orientation={info.ownerWhite ? "white" : "black"}
        drawable={{ enabled: false, visible: true, autoShapes: shapes }}
      />
    </Box>
  );
}

/**
 * The card of a named pawn structure (I-31, 9.3): its skeleton with the typical breaks, the plans
 * of each side, the structures it turns into, the player's games in it (from a player card) and
 * model games of the reference database, to open or to play from the moment it arises.
 */
export default function StructureDetailModal({
  structure,
  onClose,
  player,
}: {
  structure: PawnStructure | null;
  onClose: () => void;
  player?: StructurePlayerContext;
}) {
  const { t } = useTranslation();
  // Related structures open in the same card.
  const [current, setCurrent] = useState<PawnStructure | null>(structure);
  useEffect(() => setCurrent(structure), [structure]);

  return (
    <Modal
      opened={current !== null}
      onClose={onClose}
      size="xl"
      title={
        current && (
          <Group gap="xs">
            <Title order={4}>{structureName(current, t)}</Title>
            <Badge variant="light" color="gray">
              {familyName(STRUCTURE_INFO[current].family, t)}
            </Badge>
          </Group>
        )
      }
      scrollAreaComponent={ScrollArea.Autosize}
    >
      {current && <StructureCard structure={current} onSelect={setCurrent} player={player} />}
    </Modal>
  );
}

function StructureCard({
  structure,
  onSelect,
  player,
}: {
  structure: PawnStructure;
  onSelect: (structure: PawnStructure) => void;
  player?: StructurePlayerContext;
}) {
  const { t } = useTranslation();
  const info = STRUCTURE_INFO[structure];
  const plans = structurePlans(structure, t);
  const playerGames = useMemo(
    () => (player ? gamesWithStructure(player.games, structure) : []),
    [player, structure],
  );
  const [tab, setTab] = useState<string | null>(playerGames.length > 0 ? "player" : "models");

  return (
    <Stack gap="md">
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, sm: 5 }}>
          <Stack gap="xs">
            <SkeletonBoard structure={structure} />
            <Text size="xs" c="dimmed" ta="center">
              {t(
                "Structures.Card.Arrows",
                "Arrows: typical breaks of White (green) and Black (blue).",
              )}
            </Text>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 7 }}>
          <Stack gap="sm">
            <Text size="sm">{structureSummary(structure, t)}</Text>
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
              {(["white", "black"] as const).map((color) => (
                <Stack key={color} gap={4}>
                  <Text size="sm" fw={600}>
                    {color === "white"
                      ? t("Structures.Card.WhitePlans", "White's plans")
                      : t("Structures.Card.BlackPlans", "Black's plans")}
                  </Text>
                  <List size="sm" spacing={4}>
                    {plans[color].map((plan) => (
                      <List.Item key={plan}>{plan}</List.Item>
                    ))}
                  </List>
                </Stack>
              ))}
            </SimpleGrid>
            <Paper withBorder radius="sm" p="xs" bg="var(--mantine-color-default-hover)">
              <Text size="xs" c="dimmed">
                {t("Structures.Card.Rule", "How Onyx recognises it")}
              </Text>
              <Text size="xs">{structureRule(structure, t)}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "Structures.Card.Reversed",
                  "It also counts with the colours reversed. Plans summarised from Mauricio Flores Rios, Chess Structures.",
                )}
              </Text>
            </Paper>
            {info.related.length > 0 && (
              <Group gap={6}>
                <Text size="xs" c="dimmed">
                  {t("Structures.Card.Related", "Related:")}
                </Text>
                {info.related.map((related) => (
                  <UnstyledButton key={related} onClick={() => onSelect(related)}>
                    <Badge variant="outline" style={{ cursor: "pointer" }}>
                      {structureName(related, t)}
                    </Badge>
                  </UnstyledButton>
                ))}
              </Group>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List>
          {player && (
            <Tabs.Tab value="player">
              {t("Structures.Card.PlayerGames", "Games of {{name}} · {{count}}", {
                name: player.name,
                count: playerGames.length,
              })}
            </Tabs.Tab>
          )}
          <Tabs.Tab value="models">{t("Structures.Card.ModelGames", "Model games")}</Tabs.Tab>
        </Tabs.List>
        {player && (
          <Tabs.Panel value="player" pt="sm">
            <PlayerGames structure={structure} player={player} games={playerGames} />
          </Tabs.Panel>
        )}
        <Tabs.Panel value="models" pt="sm">
          <ModelGames structure={structure} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function PlayerGames({
  structure,
  player,
  games,
}: {
  structure: PawnStructure;
  player: StructurePlayerContext;
  games: ProfileGame[];
}) {
  const { t } = useTranslation();
  const own = games.filter((game) =>
    game.structures.some(
      (hit) => hit.structure === structure && structureRole(game, hit.ownerWhite) === "own",
    ),
  );
  const against = games.filter((game) => !own.includes(game));
  if (games.length === 0)
    return (
      <Text size="sm" c="dimmed">
        {t("Structures.Card.NoPlayerGames", "No game of {{name}} with this structure.", {
          name: player.name,
        })}
      </Text>
    );
  return (
    <Stack gap="xs">
      <Group gap="lg">
        {(
          [
            [t("Structures.Card.WithIt", "With it"), resultBucket("own", own)],
            [t("Structures.Card.AgainstIt", "Against it"), resultBucket("against", against)],
          ] as const
        ).map(([label, bucket]) => (
          <Group key={label} gap={6}>
            <Text size="sm" fw={600}>
              {label}
            </Text>
            <Text size="sm">
              {t("Structures.Card.Bucket", "{{games}} games · {{score}}", {
                games: bucket.games,
                score: formatScore(bucket.scorePercent),
              })}
            </Text>
            {bucket.games > 0 && <RatingParValue par={bucket} />}
          </Group>
        ))}
      </Group>
      <Paper withBorder radius="md" p={0}>
        <ScrollArea.Autosize mah={260}>
          <Table striped highlightOnHover verticalSpacing={4}>
            <Table.Tbody>
              {games.slice(0, 40).map((game) => {
                const hit = game.structures.find((candidate) => candidate.structure === structure);
                return (
                  <Table.Tr key={game.key}>
                    <Table.Td>
                      <Text size="sm" lineClamp={1}>
                        {`${game.isWhite ? "○" : "●"} ${game.opponent}${game.opponentElo ? ` (${game.opponentElo})` : ""}`}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="sm"
                        variant="light"
                        color={own.includes(game) ? "teal" : "orange"}
                      >
                        {own.includes(game)
                          ? t("Structures.Card.WithIt", "With it")
                          : t("Structures.Card.AgainstIt", "Against it")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{game.result}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {game.day ?? ""}
                      </Text>
                    </Table.Td>
                    <Table.Td w={40}>
                      <Tooltip label={t("Structures.Card.OpenAt", "Open where it arises")}>
                        <ActionIcon
                          variant="subtle"
                          onClick={() => player.onOpenGame(game, hit ? hit.ply : null)}
                        >
                          <IconChessKnight size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      </Paper>
    </Stack>
  );
}

function databaseName(path: string) {
  return (
    path
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.db3$/, "") ?? path
  );
}

type PlaySide = "owner" | "opponent";

function ModelGames({ structure }: { structure: PawnStructure }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const database = useAtomValue(referenceDbAtom);
  const { maia } = usePreparationEngines();
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const setPlayer1 = useSetAtom(gamePlayer1SettingsAtom);
  const setPlayer2 = useSetAtom(gamePlayer2SettingsAtom);
  const setInputColor = useSetAtom(gameInputColorAtom);
  const [minElo, setMinElo] = useState("2400");
  const [result, setResult] = useState<StructureModelGames | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<PlaySide>("owner");
  const [botElo, setBotElo] = useState<number>(1800);
  const searchId = useRef<string | null>(null);

  // A new structure starts a new search.
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [structure]);
  useEffect(
    () => () => {
      if (searchId.current) void commands.cancelStructureModelGames(searchId.current);
    },
    [],
  );

  async function search() {
    if (!database) return;
    const id = `${structure}-${Date.now()}`;
    searchId.current = id;
    setSearching(true);
    setError(null);
    try {
      const found = unwrap(
        await commands.getStructureModelGames(
          database,
          structure,
          null,
          Number(minElo),
          MODEL_GAMES,
          id,
        ),
      );
      if (searchId.current === id) setResult(found);
    } catch (cause) {
      setError(String(cause));
    } finally {
      if (searchId.current === id) {
        searchId.current = null;
        setSearching(false);
      }
    }
  }

  function cancel() {
    if (searchId.current) void commands.cancelStructureModelGames(searchId.current);
  }

  async function openGame(gameId: number, ply: number) {
    if (!database) return;
    const response = unwrap(
      await commands.getGames(database, {
        game_id: gameId,
        options: { page: 1, pageSize: 1, skipCount: true, sort: "id", direction: "asc" },
      }),
    );
    const game = response.data[0];
    if (!game) return;
    await createTab({
      tab: { name: `${game.white} - ${game.black}`, type: "analysis" },
      setTabs,
      setActiveTab,
      pgn: game.moves,
      headers: game,
      position: Array(ply).fill(0),
      gameOrigin: { kind: "database", database, gameId },
      preserveNewTab: true,
    });
    await navigate({ to: "/" });
  }

  async function play(fen: string, ownerWhite: boolean) {
    if (!maia) return;
    const userWhite = side === "owner" ? ownerWhite : !ownerWhite;
    setInputColor(userWhite ? "white" : "black");
    setPlayer1({
      type: "human",
      name: t("Preparation.Twin.You", "You"),
      timeControl: DEFAULT_TIME_CONTROL,
      timeUnit: "m",
      incrementUnit: "s",
    });
    setPlayer2({
      type: "engine",
      engine: maia,
      go: { t: "Depth", c: 1 },
      presetId: "custom",
      targetElo: Math.min(clampMaiaElo(botElo), MAIA_ELO_MAX),
      timeControl: DEFAULT_TIME_CONTROL,
      timeUnit: "m",
      incrementUnit: "s",
    });
    await navigate({ to: "/" });
    await launchTrainingPosition({
      fen,
      name: t("Structures.Play.Title", "Structure · {{name}}", {
        name: structureName(structure, t),
      }),
      type: "play",
      setTabs,
      setActiveTab,
      trainingContext: { ChessLabStructure: structure },
    });
  }

  if (!database)
    return (
      <Alert color="gray" icon={<IconDatabase size={16} />}>
        {t(
          "Structures.Models.NoDatabase",
          "Model games come from the reference database. Choose one in Databases (for example the Gigabase).",
        )}
      </Alert>
    );

  return (
    <Stack gap="sm">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label={t("Structures.Models.MinElo", "Both players rated at least")}
          data={["2000", "2200", "2400", "2600"]}
          value={minElo}
          onChange={(value) => value && setMinElo(value)}
          allowDeselect={false}
          w={200}
        />
        {searching ? (
          <Button variant="default" leftSection={<Loader size={14} />} onClick={cancel}>
            {t("Structures.Models.Cancel", "Cancel search")}
          </Button>
        ) : (
          <Button leftSection={<IconSearch size={16} />} onClick={search}>
            {t("Structures.Models.Search", "Search in {{database}}", {
              database: databaseName(database),
            })}
          </Button>
        )}
      </Group>
      {!result && !searching && (
        <Text size="xs" c="dimmed">
          {t(
            "Structures.Models.Explain",
            "Reads the database's most recent strong games up to move 25 and keeps the strongest where the structure holds for three moves. Usually a second; the first search of a session can take up to half a minute.",
          )}
        </Text>
      )}
      {error && (
        <Alert color="red" py={8}>
          {error}
        </Alert>
      )}
      {result && (
        <>
          <Text size="xs" c="dimmed">
            {result.cancelled
              ? t("Structures.Models.Cancelled", "Search cancelled after {{count}} games.", {
                  count: result.scanned,
                })
              : t(
                  "Structures.Models.Scanned",
                  "{{found}} games found among {{count}} rated games.",
                  {
                    found: result.games.length,
                    count: result.scanned,
                  },
                )}
            {result.truncated &&
              ` ${t("Structures.Models.Truncated", "The search stops there; try a lower rating.")}`}
          </Text>
          {result.games.length > 0 && (
            <>
              {maia ? (
                <Paper withBorder radius="sm" p="xs">
                  <Group gap="sm" wrap="wrap">
                    <IconPlayerPlay size={16} />
                    <Text size="sm">
                      {t("Structures.Play.Label", "Play from the position with")}
                    </Text>
                    <SegmentedControl
                      size="xs"
                      value={side}
                      onChange={(value) => setSide(value as PlaySide)}
                      data={[
                        { value: "owner", label: t("Structures.Play.Owner", "the structure") },
                        { value: "opponent", label: t("Structures.Play.Opponent", "against it") },
                      ]}
                    />
                    <Text size="sm">{t("Structures.Play.Against", "against Maia")}</Text>
                    <NumberInput
                      size="xs"
                      w={90}
                      min={600}
                      max={MAIA_ELO_MAX}
                      step={100}
                      value={botElo}
                      onChange={(value) => typeof value === "number" && setBotElo(value)}
                    />
                  </Group>
                </Paper>
              ) : (
                <MaiaRequiredAlert>
                  {t("Structures.Play.NoMaia", "Playing a structure needs Maia 3, from Engines.")}
                </MaiaRequiredAlert>
              )}
              <Paper withBorder radius="md" p={0}>
                <ScrollArea.Autosize mah={300}>
                  <Table striped highlightOnHover verticalSpacing={4}>
                    <Table.Tbody>
                      {result.games.map((game) => (
                        <Table.Tr key={game.id}>
                          <Table.Td>
                            <Text size="sm" lineClamp={1}>
                              {`${game.white}${game.whiteElo ? ` (${game.whiteElo})` : ""} – ${game.black}${game.blackElo ? ` (${game.blackElo})` : ""}`}
                            </Text>
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {[game.event, game.date?.slice(0, 4)].filter(Boolean).join(" · ")}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{game.result}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" c="dimmed">
                              {game.ownerWhite
                                ? t("Structures.Models.OwnerWhite", "White has it")
                                : t("Structures.Models.OwnerBlack", "Black has it")}
                            </Text>
                          </Table.Td>
                          <Table.Td w={80}>
                            <Group gap={2} wrap="nowrap">
                              <Tooltip label={t("Structures.Card.OpenAt", "Open where it arises")}>
                                <ActionIcon
                                  variant="subtle"
                                  onClick={() => openGame(game.id, game.ply)}
                                >
                                  <IconChessKnight size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label={t("Structures.Play.Here", "Play from here")}>
                                <ActionIcon
                                  variant="subtle"
                                  color="teal"
                                  disabled={!maia}
                                  onClick={() => play(game.fen, game.ownerWhite)}
                                >
                                  <IconPlayerPlay size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
              </Paper>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
