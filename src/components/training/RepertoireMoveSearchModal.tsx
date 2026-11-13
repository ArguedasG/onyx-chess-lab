import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { Modal } from "@/components/common/Modal";
import { trainingAreasAtom } from "@/state/trainingAreas";
import {
  indexRepertoireRecords,
  type MoveSearchColor,
  normalizeSearchMove,
  searchRepertoireIndex,
} from "@/utils/repertoireMoveSearch";
import type { OpeningRepertoire, OpeningVariant } from "@/utils/trainingAreas";
import { unwrap } from "@/utils/unwrap";

/** Hits shown per section before "show all": a common move can appear dozens of times. */
const HITS_PER_SECTION = 3;

/**
 * Finds a move anywhere in the repertoire: trained lines, the variations that are not trained,
 * model games and reference sections. A hit opens its section at that move.
 */
export default function RepertoireMoveSearchModal({
  repertoire,
  opened,
  onClose,
  onOpenHit,
}: {
  repertoire: OpeningRepertoire;
  opened: boolean;
  onClose: () => void;
  onOpenHit: (variant: OpeningVariant, path: number[]) => void;
}) {
  const { t } = useTranslation();
  const openings = useAtomValue(trainingAreasAtom).openings;
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<MoveSearchColor>("both");
  const [records, setRecords] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // The PGN is read once per opening of the window, so edits made meanwhile are seen next time.
  useEffect(() => {
    if (!opened) {
      setRecords(null);
      return;
    }
    let cancelled = false;
    setError("");
    void (async () => {
      try {
        const count = unwrap(await commands.countPgnGames(repertoire.path));
        const read =
          count > 0 ? unwrap(await commands.readGames(repertoire.path, 0, count - 1)) : [];
        if (!cancelled) setRecords(read);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, repertoire.path]);

  const move = normalizeSearchMove(query);
  const index = useMemo(
    () => (records ? indexRepertoireRecords(records, repertoire.id, openings) : null),
    [openings, records, repertoire.id],
  );
  const sections = useMemo(
    () => (index && move ? searchRepertoireIndex(index, move, color) : []),
    [color, index, move],
  );
  const total = sections.reduce((sum, section) => sum + section.hits.length, 0);

  const typeLabel = (variant: OpeningVariant) =>
    variant.contentType === "modelGame"
      ? t("MoveSearch.ModelGame", "Model game")
      : variant.contentType === "reference"
        ? t("MoveSearch.Reference", "Reference")
        : t("MoveSearch.Theory", "Theory");

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={t("MoveSearch.Title", "Search a move in “{{name}}”", { name: repertoire.name })}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t(
            "MoveSearch.Intro",
            "Type a move in English notation, like Bb5 or O-O. It is found in every section, at any point and in any variation, including the ones that are not trained.",
          )}
        </Text>
        <Group align="flex-end" wrap="wrap">
          <TextInput
            data-autofocus
            leftSection={<IconSearch size={16} />}
            placeholder="Bb5"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            w={160}
          />
          <SegmentedControl
            value={color}
            onChange={(value) => setColor(value as MoveSearchColor)}
            data={[
              { value: "both", label: t("Players.Filter.BothColors", "Both colors") },
              { value: "white", label: t("Fen.White", "White") },
              { value: "black", label: t("Fen.Black", "Black") },
            ]}
          />
        </Group>
        {error && <Alert color="red">{error}</Alert>}
        {!records && !error && opened && <Loader size="sm" />}
        {records && move && (
          <Text size="sm" fw={500}>
            {total === 0
              ? t("MoveSearch.None", "{{move}} does not appear in this repertoire.", { move })
              : t("MoveSearch.Found", "{{move}}: {{count}} times in {{sections}} sections", {
                  move,
                  count: total,
                  sections: sections.length,
                })}
          </Text>
        )}
        {sections.length > 0 && (
          <ScrollArea.Autosize mah="55vh">
            <Stack gap="xs">
              {sections.map(({ variant, hits }) => {
                const showAll = expanded.has(variant.id);
                const shown = showAll ? hits : hits.slice(0, HITS_PER_SECTION);
                return (
                  <Paper key={variant.id} withBorder p="sm">
                    <Group justify="space-between" wrap="nowrap" mb={6}>
                      <Text fw={600} style={{ overflowWrap: "anywhere" }}>
                        {variant.name}
                      </Text>
                      <Group gap={6} wrap="nowrap">
                        <Badge size="sm" variant="light" color="gray">
                          {typeLabel(variant)}
                        </Badge>
                        <Badge size="sm" variant="light">
                          {hits.length}
                        </Badge>
                      </Group>
                    </Group>
                    <Stack gap={4}>
                      {shown.map((hit) => (
                        <Group key={hit.path.join(".")} justify="space-between" wrap="nowrap">
                          <Text size="sm" ff="monospace" style={{ overflowWrap: "anywhere" }}>
                            {hit.line}
                          </Text>
                          <Group gap={6} wrap="nowrap">
                            {variant.contentType === "theory" && (
                              <Badge size="xs" variant="dot" color={hit.trained ? "teal" : "gray"}>
                                {hit.trained
                                  ? t("MoveSearch.Trained", "Trained")
                                  : t("MoveSearch.NotTrained", "Not trained")}
                              </Badge>
                            )}
                            <Button
                              size="compact-xs"
                              variant="light"
                              onClick={() => onOpenHit(variant, hit.path)}
                            >
                              {t("MoveSearch.Open", "Open")}
                            </Button>
                          </Group>
                        </Group>
                      ))}
                      {hits.length > HITS_PER_SECTION && (
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          w="fit-content"
                          onClick={() =>
                            setExpanded((current) => {
                              const next = new Set(current);
                              if (showAll) next.delete(variant.id);
                              else next.add(variant.id);
                              return next;
                            })
                          }
                        >
                          {showAll
                            ? t("MoveSearch.ShowLess", "Show less")
                            : t("MoveSearch.ShowAll", "Show all {{count}}", {
                                count: hits.length,
                              })}
                        </Button>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </Modal>
  );
}
