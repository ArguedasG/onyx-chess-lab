import { Button, Popover, SegmentedControl, Select } from "@mantine/core";
import { IconCalendar, IconChevronDown } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { DateRangeInput, EloRangeInput } from "@/components/common/GameFilters";
import { toPgnDate } from "@/utils/gameFilters";
import type { PlayerAnalysisFilters } from "@/utils/playerAnalysis";
import { type ProfilePeriod, periodStart } from "@/utils/players/profileGames";

const PRESETS: ProfilePeriod[] = ["all", "12m", "3m", "1m"];
const toPgn = (value: string | null) => (value ? dayjs(value).format("YYYY.MM.DD") : null);
const presetStart = (period: ProfilePeriod) => toPgn(periodStart(period, new Date()));

/**
 * The analysis filters in one line, styled like the filter bar of the other card tabs: period
 * shortcuts (a hand-picked range opens from "Dates"), colour, opponent Elo and time control.
 */
export default function AnalysisFiltersBar({
  filters,
  setFilters,
  timeControls,
}: {
  filters: PlayerAnalysisFilters;
  setFilters: (update: (previous: PlayerAnalysisFilters) => PlayerAnalysisFilters) => void;
  timeControls: string[];
}) {
  const { t } = useTranslation();
  const preset =
    filters.endDate === null
      ? PRESETS.find((period) => presetStart(period) === toPgnDate(filters.startDate))
      : undefined;
  const range = [filters.startDate, filters.endDate].map((date) => date?.replace(/\./g, "-"));
  const eloLabel =
    filters.opponentEloMin === null && filters.opponentEloMax === null
      ? t("PlayerAnalysis.OpponentEloAny", "Opponent Elo: any")
      : `${t("GameFilters.OpponentElo", "Opponent Elo")} ${filters.opponentEloMin ?? ""}–${
          filters.opponentEloMax ?? ""
        }`;

  return (
    <>
      <SegmentedControl
        size="xs"
        value={preset ?? ""}
        onChange={(value) =>
          setFilters((previous) => ({
            ...previous,
            startDate: presetStart(value as ProfilePeriod),
            endDate: null,
          }))
        }
        data={[
          { value: "all", label: t("Players.Filter.AllTime", "All time") },
          { value: "12m", label: t("Players.Filter.Year", "12 months") },
          { value: "3m", label: t("Players.Filter.Quarter", "3 months") },
          { value: "1m", label: t("Players.Filter.Month", "1 month") },
        ]}
      />
      <Popover position="bottom-start" shadow="md" width={320}>
        <Popover.Target>
          <Button
            size="xs"
            variant={preset ? "default" : "light"}
            leftSection={<IconCalendar size={14} />}
            rightSection={<IconChevronDown size={12} />}
          >
            {preset ? t("GameFilters.Dates", "Dates") : `${range[0] ?? "…"} – ${range[1] ?? "…"}`}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <DateRangeInput
            start={filters.startDate}
            end={filters.endDate}
            onChange={(startDate, endDate) =>
              setFilters((previous) => ({ ...previous, startDate, endDate }))
            }
          />
        </Popover.Dropdown>
      </Popover>
      <SegmentedControl
        size="xs"
        value={filters.color}
        onChange={(value) =>
          setFilters((previous) => ({
            ...previous,
            color: value as PlayerAnalysisFilters["color"],
          }))
        }
        data={[
          { value: "any", label: t("Players.Filter.BothColors", "Both colors") },
          { value: "white", label: t("Fen.White", "White") },
          { value: "black", label: t("Fen.Black", "Black") },
        ]}
      />
      <Popover position="bottom-start" shadow="md" width={280}>
        <Popover.Target>
          <Button
            size="xs"
            variant={
              filters.opponentEloMin === null && filters.opponentEloMax === null
                ? "default"
                : "light"
            }
            rightSection={<IconChevronDown size={12} />}
          >
            {eloLabel}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <EloRangeInput
            label={t("GameFilters.OpponentElo", "Opponent Elo")}
            min={filters.opponentEloMin}
            max={filters.opponentEloMax}
            onChange={(opponentEloMin, opponentEloMax) =>
              setFilters((previous) => ({ ...previous, opponentEloMin, opponentEloMax }))
            }
          />
        </Popover.Dropdown>
      </Popover>
      <Select
        size="xs"
        w={160}
        clearable
        aria-label={t("PlayerAnalysis.TimeControl", "Time control")}
        placeholder={t("Players.Filter.AllTimeControls", "All time controls")}
        value={filters.timeControl}
        data={timeControls}
        onChange={(value) => setFilters((previous) => ({ ...previous, timeControl: value }))}
      />
    </>
  );
}
