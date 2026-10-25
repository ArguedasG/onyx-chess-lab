import { useTranslation as useTrainingTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { useEffect, useMemo, useState } from "react";
import {
  ENDGAME_THEME_ORDER,
  groupEndgameImport,
  hasUsefulChapters,
  previewEndgameImport,
  type EndgameImportGroup,
  type EndgameImportGrouping,
} from "@/utils/endgameImport";
import type { EndgameSet, ParsedTrainingRecord } from "@/utils/trainingAreas";
import { getEndgameThemeMetadata } from "./endgameThemes";

export type EndgameImportRequest =
  | { kind: "new"; groups: EndgameImportGroup[]; computeObjectives: boolean }
  | {
      kind: "existing";
      setId: string;
      records: ParsedTrainingRecord[];
      computeObjectives: boolean;
    };

const NEW_SET = "__new__";

/**
 * Preview of a PGN with many endgames before importing it (I-08): family and size of each
 * position, read from the position itself, and how it becomes sets — one set, one per family or
 * one per chapter of the book — or added to a set that already exists.
 */
export function EndgameImportModal({
  records,
  suggestedName,
  userSets,
  onClose,
  onImport,
}: {
  records: ParsedTrainingRecord[] | null;
  suggestedName: string;
  userSets: EndgameSet[];
  onClose: () => void;
  onImport: (request: EndgameImportRequest) => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const themes = getEndgameThemeMetadata(trainingT);
  const themeLabel = (id: string) => themes.find((theme) => theme.id === id)?.label ?? id;
  const preview = useMemo(() => previewEndgameImport(records ?? []), [records]);
  const [name, setName] = useState(suggestedName);
  const [grouping, setGrouping] = useState<EndgameImportGrouping>("single");
  const [destination, setDestination] = useState(NEW_SET);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [computeObjectives, setComputeObjectives] = useState(true);

  useEffect(() => {
    setName(suggestedName);
    setGrouping("single");
    setDestination(NEW_SET);
    setExcluded(new Set());
  }, [records, suggestedName]);

  const selected = preview.filter((item) => !excluded.has(item.index));
  const chaptersAvailable = hasUsefulChapters(preview);
  const groups = groupEndgameImport(selected, grouping, name.trim() || suggestedName, themeLabel);
  const exactCount = selected.filter((item) => item.pieces <= 7).length;
  const writtenObjectives = selected.filter((item) => item.objective).length;
  const toExisting = grouping === "single" && destination !== NEW_SET;

  function toggle(index: number) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function confirm() {
    if (selected.length === 0) return;
    if (toExisting) {
      onImport({
        kind: "existing",
        setId: destination,
        records: selected.map((item) => item.record),
        computeObjectives,
      });
    } else {
      onImport({ kind: "new", groups, computeObjectives });
    }
  }

  return (
    <Modal
      opened={records !== null}
      onClose={onClose}
      size="min(78rem, 94vw)"
      title={trainingT("Endgames.Import.Title", "Import endgames")}
    >
      <Stack>
        <Group gap="xs">
          <Badge variant="light" color="teal">
            {trainingT("Endgames.Import.Positions", "{{count}} positions", {
              count: selected.length,
            })}
          </Badge>
          <Badge variant="light" color="gray">
            {trainingT("Endgames.Import.Exact", "{{count}} with 7 pieces or fewer", {
              count: exactCount,
            })}
          </Badge>
          {writtenObjectives > 0 && (
            <Badge variant="light" color="gray">
              {trainingT("Endgames.Import.Written", "{{count}} with objective in the PGN", {
                count: writtenObjectives,
              })}
            </Badge>
          )}
        </Group>

        <Group grow align="flex-end">
          <TextInput
            label={trainingT("Training.Copy.Setname.a54101c6", "Set name")}
            value={name}
            disabled={toExisting}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              {trainingT("Endgames.Import.Grouping", "Organize as")}
            </Text>
            <SegmentedControl
              fullWidth
              value={grouping}
              onChange={(value) => setGrouping(value as EndgameImportGrouping)}
              data={[
                { value: "single", label: trainingT("Endgames.Import.Single", "One set") },
                { value: "theme", label: trainingT("Endgames.Import.ByTheme", "By theme") },
                {
                  value: "chapter",
                  label: trainingT("Endgames.Import.ByChapter", "By chapter"),
                  disabled: !chaptersAvailable,
                },
              ]}
            />
          </div>
        </Group>

        {grouping === "single" && userSets.length > 0 && (
          <Select
            label={trainingT("Endgames.Import.Destination", "Destination")}
            value={destination}
            onChange={(value) => setDestination(value ?? NEW_SET)}
            data={[
              { value: NEW_SET, label: trainingT("Endgames.Import.NewSet", "New set") },
              ...userSets.map((set) => ({
                value: set.id,
                label: trainingT("Endgames.Import.AddTo", "Add to “{{name}}”", { name: set.name }),
              })),
            ]}
          />
        )}

        {!toExisting && groups.length > 1 && (
          <Alert color="teal" variant="light" p="xs">
            <Text size="sm">
              {trainingT("Endgames.Import.WillCreate", "{{count}} sets will be created:", {
                count: groups.length,
              })}{" "}
              {groups.map((group) => `${group.name} (${group.records.length})`).join(" · ")}
            </Text>
          </Alert>
        )}

        <ScrollArea h={300} type="auto">
          <Stack gap={4} pr="sm">
            {preview.map((item) => (
              <Group
                key={item.index}
                justify="space-between"
                wrap="nowrap"
                gap="xs"
                opacity={excluded.has(item.index) ? 0.45 : 1}
              >
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Checkbox
                    size="xs"
                    checked={!excluded.has(item.index)}
                    onChange={() => toggle(item.index)}
                    aria-label={item.record.title}
                  />
                  <Text size="xs" c="dimmed" w={28}>
                    {item.index + 1}
                  </Text>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" truncate>
                      {item.record.title}
                    </Text>
                    {item.chapter && (
                      <Text size="xs" c="dimmed" truncate>
                        {item.chapter}
                      </Text>
                    )}
                  </div>
                </Group>
                <Group gap={4} wrap="nowrap">
                  {item.objective && (
                    <Badge size="xs" variant="outline" color="gray">
                      {item.objective === "win"
                        ? trainingT("Training.Copy.Win.fc572f64", "Win")
                        : item.objective === "draw"
                          ? trainingT("Training.Copy.Draw.9c0dd07e", "Draw")
                          : trainingT("Training.Copy.Defend.69d716e2", "Defend")}
                    </Badge>
                  )}
                  <Badge size="xs" variant="light" color="teal">
                    {themeLabel(item.theme)}
                  </Badge>
                  <Badge size="xs" variant="default">
                    {trainingT("Endgames.Import.Pieces", "{{count}} pcs", { count: item.pieces })}
                  </Badge>
                </Group>
              </Group>
            ))}
          </Stack>
        </ScrollArea>

        <Switch
          checked={computeObjectives}
          onChange={(event) => setComputeObjectives(event.currentTarget.checked)}
          label={trainingT("Endgames.Import.Compute", "Calculate objectives after importing")}
          description={trainingT(
            "Endgames.Import.ComputeDesc",
            "Tablebase up to 7 pieces, Stockfish above. An objective written in the PGN is kept; if the calculation disagrees, you will see a notice.",
          )}
        />

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {ENDGAME_THEME_ORDER.filter((theme) => selected.some((item) => item.theme === theme))
              .map(
                (theme) =>
                  `${themeLabel(theme)}: ${selected.filter((item) => item.theme === theme).length}`,
              )
              .join(" · ")}
          </Text>
          <Group>
            <Button variant="default" onClick={onClose}>
              {trainingT("Training.Copy.Cancel.bb9dbb40", "Cancel")}
            </Button>
            <Button color="teal" disabled={selected.length === 0} onClick={confirm}>
              {trainingT("Endgames.Import.Confirm", "Import")}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
