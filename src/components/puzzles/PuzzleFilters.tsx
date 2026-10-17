import {
  Alert,
  Button,
  Group,
  MultiSelect,
  RangeSlider,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconTarget } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  hidePuzzleRatingAtom,
  jumpToNextPuzzleAtom,
  progressivePuzzlesAtom,
  puzzleCandidatesAtom,
  puzzleLengthAtom,
  puzzleQualityAtom,
  puzzleRatingRangeAtom,
  puzzleExcludedThemesAtom,
  puzzleThemeModeAtom,
  puzzleThemesAtom,
  trackPuzzleTimeAtom,
} from "@/state/atoms";
import { formatThemeLabel } from "@/utils/format";
import type { PuzzleLength, PuzzleQuality, PuzzleThemeMode } from "@/utils/puzzleSession";

/**
 * Filters of the Lichess puzzle trainer: rating, several themes at once, quality (the players'
 * votes and the number of plays) and solution length.
 */
export default function PuzzleFilters({
  availableThemes,
  themesTableMissing,
  myLevel,
  rushActive,
  onTrackTimeOff,
}: {
  availableThemes: string[];
  themesTableMissing: boolean;
  /** Rating band around the tactical rating, once it is not provisional. */
  myLevel: [number, number] | null;
  /** Storm and streak choose the difficulty themselves. */
  rushActive: boolean;
  onTrackTimeOff: () => void;
}) {
  const { t } = useTranslation();
  const [ratingRange, setRatingRange] = useAtom(puzzleRatingRangeAtom);
  const [themes, setThemes] = useAtom(puzzleThemesAtom);
  const [themeMode, setThemeMode] = useAtom(puzzleThemeModeAtom);
  const [excluded, setExcludedThemes] = useAtom(puzzleExcludedThemesAtom);
  const excludedThemes = excluded.filter((theme) => availableThemes.includes(theme));
  const [quality, setQuality] = useAtom(puzzleQualityAtom);
  const [length, setLength] = useAtom(puzzleLengthAtom);
  const [progressive, setProgressive] = useAtom(progressivePuzzlesAtom);
  const [hideRating, setHideRating] = useAtom(hidePuzzleRatingAtom);
  const [jumpToNext, setJumpToNext] = useAtom(jumpToNextPuzzleAtom);
  const [trackTime, setTrackTime] = useAtom(trackPuzzleTimeAtom);
  const [candidates, setCandidates] = useAtom(puzzleCandidatesAtom);
  const selectedThemes = themes.filter((theme) => availableThemes.includes(theme));

  return (
    <Stack gap="md">
      {themesTableMissing && (
        <Alert
          icon={<IconAlertTriangle />}
          title={t("Puzzle.Outdated", "Puzzle database outdated")}
          color="yellow"
        >
          {t(
            "Puzzle.OutdatedDesc",
            "This database does not support themes. Update to the latest puzzle database.",
          )}
        </Alert>
      )}
      <div>
        <Group justify="space-between" mb={4}>
          <Text size="sm" fw={500}>
            {t("Puzzle.RatingRange")}
          </Text>
          {myLevel && (
            <Tooltip label={t("Puzzle.MyLevelTip", "Puzzles around your tactical rating")}>
              <Button
                size="compact-xs"
                variant="subtle"
                leftSection={<IconTarget size={12} />}
                disabled={rushActive || progressive}
                onClick={() => setRatingRange(myLevel)}
              >
                {t("Puzzle.MyLevel", "My level")}
              </Button>
            </Tooltip>
          )}
        </Group>
        <RangeSlider
          min={400}
          my="md"
          max={3200}
          step={50}
          minRange={100}
          value={ratingRange}
          onChange={setRatingRange}
          disabled={progressive || rushActive}
          marks={[
            { value: 400, label: "400" },
            { value: 1800, label: "1800" },
            { value: 3200, label: "3200" },
          ]}
        />
        {rushActive && (
          <Text size="xs" c="dimmed">
            {t("Puzzle.RushRange", "In storm and streak the difficulty rises on its own.")}
          </Text>
        )}
      </div>

      <div>
        <MultiSelect
          label={t("Puzzle.Themes", "Themes")}
          placeholder={
            selectedThemes.length === 0 ? t("Puzzle.AllThemes", "All themes") : undefined
          }
          data={availableThemes.map((theme) => ({ label: formatThemeLabel(theme), value: theme }))}
          value={selectedThemes}
          onChange={setThemes}
          searchable
          clearable
          hidePickedOptions
          maxDropdownHeight={260}
        />
        {selectedThemes.length > 1 && (
          <SegmentedControl
            mt="xs"
            size="xs"
            fullWidth
            value={themeMode}
            onChange={(value) => setThemeMode(value as PuzzleThemeMode)}
            data={[
              { value: "any", label: t("Puzzle.ThemeAny", "Any of them (a mix)") },
              { value: "all", label: t("Puzzle.ThemeAll", "All at once") },
            ]}
          />
        )}
        <MultiSelect
          mt="sm"
          label={t("Puzzle.ExcludeThemes", "Leave out themes")}
          description={t(
            "Puzzle.ExcludeThemesDesc",
            "Puzzles with any of these themes never appear.",
          )}
          placeholder={excludedThemes.length === 0 ? t("Puzzle.ExcludeNone", "None") : undefined}
          data={availableThemes
            .filter((theme) => !selectedThemes.includes(theme))
            .map((theme) => ({ label: formatThemeLabel(theme), value: theme }))}
          value={excludedThemes}
          onChange={setExcludedThemes}
          searchable
          clearable
          hidePickedOptions
          maxDropdownHeight={260}
          styles={{ pill: { textDecoration: "line-through" } }}
        />
      </div>

      <SimpleGrid cols={2} spacing="sm">
        <Select
          label={t("Puzzle.Quality", "Quality")}
          value={quality}
          allowDeselect={false}
          onChange={(value) => value && setQuality(value as PuzzleQuality)}
          data={[
            { value: "all", label: t("Puzzle.Quality.All", "All") },
            { value: "good", label: t("Puzzle.Quality.Good", "Well rated") },
            { value: "excellent", label: t("Puzzle.Quality.Excellent", "Top rated") },
          ]}
          description={
            quality === "all"
              ? t("Puzzle.Quality.AllDesc", "Every puzzle")
              : quality === "good"
                ? t("Puzzle.Quality.GoodDesc", "Popularity 70+ and 50+ plays")
                : t("Puzzle.Quality.ExcellentDesc", "Popularity 90+ and 300+ plays")
          }
        />
        <Select
          label={t("Puzzle.Length", "Solution length")}
          value={length}
          allowDeselect={false}
          onChange={(value) => value && setLength(value as PuzzleLength)}
          data={[
            { value: "any", label: t("Puzzle.Length.Any", "Any") },
            { value: "short", label: t("Puzzle.Length.Short", "Short · 1–2 moves") },
            { value: "medium", label: t("Puzzle.Length.Medium", "Medium · 3 moves") },
            { value: "long", label: t("Puzzle.Length.Long", "Long · 4+ moves") },
          ]}
          description={t("Puzzle.Length.Desc", "Your moves only")}
        />
      </SimpleGrid>

      <SimpleGrid cols={2} spacing="sm">
        <Switch
          label={t("Puzzle.Progressive")}
          description={t("Puzzle.Progressive.Desc")}
          checked={progressive}
          disabled={rushActive}
          onChange={(event) => setProgressive(event.currentTarget.checked)}
        />
        <Switch
          label={t("Puzzle.HideRating")}
          description={t("Puzzle.HideRating.Desc")}
          checked={hideRating}
          onChange={(event) => setHideRating(event.currentTarget.checked)}
        />
        <Switch
          label={t("Puzzle.JumpToNextPuzzleImmediately")}
          description={t("Puzzle.JumpToNextPuzzleImmediately.Desc")}
          checked={jumpToNext}
          onChange={(event) => setJumpToNext(event.currentTarget.checked)}
        />
        <Switch
          label={t("Puzzle.TrackPuzzleTime")}
          description={t("Puzzle.TrackPuzzleTime.Desc")}
          checked={trackTime}
          onChange={(event) => {
            if (!event.currentTarget.checked) onTrackTimeOff();
            setTrackTime(event.currentTarget.checked);
          }}
        />
        <Switch
          label={t("Puzzle.Candidates", "Candidate moves")}
          description={t(
            "Puzzle.Candidates.Desc",
            "Choose the first move among a few plausible ones, as a player of that level would see them.",
          )}
          checked={candidates}
          disabled={rushActive}
          onChange={(event) => setCandidates(event.currentTarget.checked)}
        />
      </SimpleGrid>
    </Stack>
  );
}
