import { useTranslation as useTrainingTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Chip,
  Group,
  MultiSelect,
  NumberInput,
  RangeSlider,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { IconTarget, IconWand } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { commands, type PuzzleDatabaseInfo } from "@/bindings";
import { formatThemeLabel } from "@/utils/format";
import { buildPuzzleFilter, type PuzzleLength, type PuzzleQuality } from "@/utils/puzzleSession";
import { PUZZLE_SET_TEMPLATES } from "@/utils/puzzleSets";
import type { PuzzleWithThemes } from "@/bindings";
import type { TacticsSet } from "@/utils/trainingAreas";

export type PuzzleSetRequest = {
  name: string;
  description: string;
  puzzles: PuzzleWithThemes[];
  band: [number, number];
  mode: TacticsSet["config"]["mode"];
};

/**
 * Builds a tactics set from the Lichess puzzle database (I-20): themes, rating band, quality,
 * length and size, or a ready-made template. The result trains with every mode of the sets.
 */
export default function PuzzleSetBuilder({
  opened,
  databases,
  myLevel,
  onClose,
  onCreate,
}: {
  opened: boolean;
  databases: PuzzleDatabaseInfo[];
  myLevel: [number, number] | null;
  onClose: () => void;
  onCreate: (request: PuzzleSetRequest) => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const [database, setDatabase] = useState<string | null>(databases[0]?.path ?? null);
  const [availableThemes, setAvailableThemes] = useState<string[]>([]);
  const [template, setTemplate] = useState<string | null>(null);
  const [themes, setThemes] = useState<string[]>([]);
  const [themeMode, setThemeMode] = useState<"any" | "all">("any");
  const [excludedThemes, setExcludedThemes] = useState<string[]>([]);
  const [band, setBand] = useState<[number, number]>(myLevel ?? [1200, 1600]);
  const [quality, setQuality] = useState<PuzzleQuality>("good");
  const [length, setLength] = useState<PuzzleLength>("any");
  const [maxPieces, setMaxPieces] = useState<number | string>("");
  const [size, setSize] = useState<number | string>(50);
  const [mode, setMode] = useState<TacticsSet["config"]["mode"]>("guided");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateLabels: Record<string, string> = {
    mateIn2: trainingT("Tactics.Builder.Template.MateIn2", "Mate in 2"),
    forks: trainingT("Tactics.Builder.Template.Forks", "Forks"),
    pins: trainingT("Tactics.Builder.Template.Pins", "Pins and skewers"),
    deflection: trainingT("Tactics.Builder.Template.Deflection", "Deflection and attraction"),
    positional: trainingT("Tactics.Builder.Template.Positional", "Quiet and positional"),
    endgames: trainingT("Tactics.Builder.Template.Endgames", "Endgames"),
    defense: trainingT("Tactics.Builder.Template.Defense", "Defense"),
    visualization: trainingT("Tactics.Builder.Template.Visualization", "For visualization"),
  };

  useEffect(() => {
    if (!database && databases[0]) setDatabase(databases[0].path);
  }, [database, databases]);

  useEffect(() => {
    if (!database || !opened) return;
    void commands.getPuzzleThemes(database).then((result) => {
      setAvailableThemes(result.status === "ok" ? result.data : []);
    });
  }, [database, opened]);

  function applyTemplate(id: string | null) {
    setTemplate(id);
    const found = PUZZLE_SET_TEMPLATES.find((item) => item.id === id);
    if (!found) return;
    setThemes(found.themes);
    setThemeMode(found.themeMode);
    setLength(found.length ?? "any");
    setMaxPieces(found.maxPieces ?? "");
  }

  const suggestedName = `${
    template
      ? templateLabels[template]
      : themes.length > 0
        ? themes.slice(0, 3).map(formatThemeLabel).join(" + ")
        : trainingT("Tactics.Builder.Mixed", "Mixed tactics")
  } · ${band[0]}–${band[1]}`;

  async function create() {
    if (!database) return;
    const count = Math.min(500, Math.max(5, Number(size) || 50));
    setBusy(true);
    setError(null);
    try {
      const result = await commands.samplePuzzles(
        database,
        buildPuzzleFilter({
          range: band,
          themes: themes.filter((theme) => availableThemes.includes(theme)),
          themeMode,
          excludeThemes: excludedThemes.filter((theme) => availableThemes.includes(theme)),
          quality,
          length,
          maxPieces: typeof maxPieces === "number" ? maxPieces : null,
        }),
        count,
        [],
      );
      if (result.status === "error" || result.data.length === 0) {
        setError(
          trainingT(
            "Tactics.Builder.None",
            "No puzzle matches these filters. Widen the band, the themes or the quality.",
          ),
        );
        return;
      }
      onCreate({
        name: name.trim() || suggestedName,
        description: trainingT(
          "Tactics.Builder.Description",
          "{{count}} Lichess puzzles · {{min}}–{{max}}{{themes}}",
          {
            count: result.data.length,
            min: band[0],
            max: band[1],
            themes: themes.length > 0 ? ` · ${themes.map(formatThemeLabel).join(", ")}` : "",
          },
        ),
        puzzles: result.data,
        band,
        mode,
      });
      setName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={trainingT("Tactics.Builder.Title", "New set from the puzzle database")}
    >
      <Stack>
        {databases.length === 0 ? (
          <Alert color="yellow">
            {trainingT(
              "Tactics.Builder.NoDatabase",
              "Install the Lichess puzzle database first (puzzle trainer → add database).",
            )}
          </Alert>
        ) : (
          <>
            <div>
              <Text size="sm" fw={500} mb={6}>
                {trainingT("Tactics.Builder.Templates", "Start from a template")}
              </Text>
              <Chip.Group multiple={false} value={template} onChange={applyTemplate}>
                <Group gap={6}>
                  {PUZZLE_SET_TEMPLATES.map((item) => (
                    <Chip key={item.id} value={item.id} size="xs" variant="light" color="orange">
                      {templateLabels[item.id]}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </div>

            {databases.length > 1 && (
              <Select
                label={trainingT("Tactics.Builder.Database", "Database")}
                value={database}
                allowDeselect={false}
                onChange={setDatabase}
                data={databases.map((item) => ({
                  value: item.path,
                  label: item.title.replace(/\.db3$/i, ""),
                }))}
              />
            )}

            <div>
              <MultiSelect
                label={trainingT("Puzzle.Themes", "Themes")}
                placeholder={
                  themes.length === 0 ? trainingT("Puzzle.AllThemes", "All themes") : undefined
                }
                data={availableThemes.map((theme) => ({
                  value: theme,
                  label: formatThemeLabel(theme),
                }))}
                value={themes}
                onChange={(value) => {
                  setThemes(value);
                  setTemplate(null);
                }}
                searchable
                clearable
                hidePickedOptions
                maxDropdownHeight={240}
              />
              {themes.length > 1 && (
                <SegmentedControl
                  mt="xs"
                  size="xs"
                  fullWidth
                  value={themeMode}
                  onChange={(value) => setThemeMode(value as "any" | "all")}
                  data={[
                    { value: "any", label: trainingT("Puzzle.ThemeAny", "Any of them (a mix)") },
                    { value: "all", label: trainingT("Puzzle.ThemeAll", "All at once") },
                  ]}
                />
              )}
              <MultiSelect
                mt="sm"
                label={trainingT("Puzzle.ExcludeThemes", "Leave out themes")}
                description={trainingT(
                  "Puzzle.ExcludeThemesDesc",
                  "Puzzles with any of these themes never appear.",
                )}
                placeholder={
                  excludedThemes.length === 0 ? trainingT("Puzzle.ExcludeNone", "None") : undefined
                }
                data={availableThemes
                  .filter((theme) => !themes.includes(theme))
                  .map((theme) => ({ value: theme, label: formatThemeLabel(theme) }))}
                value={excludedThemes}
                onChange={setExcludedThemes}
                searchable
                clearable
                hidePickedOptions
                maxDropdownHeight={240}
                styles={{ pill: { textDecoration: "line-through" } }}
              />
            </div>

            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={500}>
                  {trainingT("Tactics.Builder.Band", "Rating band")}
                </Text>
                {myLevel && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    leftSection={<IconTarget size={12} />}
                    onClick={() => setBand(myLevel)}
                  >
                    {trainingT("Puzzle.MyLevel", "My level")}
                  </Button>
                )}
              </Group>
              <RangeSlider
                min={400}
                max={3200}
                step={50}
                minRange={100}
                value={band}
                onChange={setBand}
                marks={[
                  { value: 400, label: "400" },
                  { value: 1800, label: "1800" },
                  { value: 3200, label: "3200" },
                ]}
                mb="lg"
              />
            </div>

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select
                label={trainingT("Puzzle.Quality", "Quality")}
                value={quality}
                allowDeselect={false}
                onChange={(value) => value && setQuality(value as PuzzleQuality)}
                data={[
                  { value: "all", label: trainingT("Puzzle.Quality.All", "All") },
                  { value: "good", label: trainingT("Puzzle.Quality.Good", "Well rated") },
                  { value: "excellent", label: trainingT("Puzzle.Quality.Excellent", "Top rated") },
                ]}
              />
              <Select
                label={trainingT("Puzzle.Length", "Solution length")}
                value={length}
                allowDeselect={false}
                onChange={(value) => value && setLength(value as PuzzleLength)}
                data={[
                  { value: "any", label: trainingT("Puzzle.Length.Any", "Any") },
                  { value: "short", label: trainingT("Puzzle.Length.Short", "Short · 1–2 moves") },
                  { value: "medium", label: trainingT("Puzzle.Length.Medium", "Medium · 3 moves") },
                  { value: "long", label: trainingT("Puzzle.Length.Long", "Long · 4+ moves") },
                ]}
              />
              <NumberInput
                label={trainingT("Tactics.Builder.MaxPieces", "At most this many pieces")}
                description={trainingT(
                  "Tactics.Builder.MaxPiecesDesc",
                  "Optional; fewer pieces make visualization easier",
                )}
                min={3}
                max={32}
                value={maxPieces}
                onChange={setMaxPieces}
                placeholder={trainingT("Training.Copy.Optional.a6e63474", "Optional")}
              />
              <NumberInput
                label={trainingT("Tactics.Builder.Size", "Puzzles")}
                min={5}
                max={500}
                step={10}
                value={size}
                onChange={setSize}
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label={trainingT("Training.Copy.Name.562bb157", "Name")}
                placeholder={suggestedName}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <Select
                label={trainingT("Training.Copy.Type.3868d284", "Type")}
                value={mode}
                allowDeselect={false}
                onChange={(value) => value && setMode(value as TacticsSet["config"]["mode"])}
                data={[
                  { value: "guided", label: trainingT("Training.Copy.Guided.57bd258f", "Guided") },
                  { value: "woodpecker", label: "Woodpecker" },
                ]}
              />
            </SimpleGrid>

            {error && <Alert color="yellow">{error}</Alert>}

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                {trainingT("Training.Copy.Cancel.bb9dbb40", "Cancel")}
              </Button>
              <Button
                color="orange"
                leftSection={<IconWand size={16} />}
                loading={busy}
                disabled={!database}
                onClick={() => void create()}
              >
                {trainingT("Tactics.Builder.Create", "Create set")}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
