import { Button, Chip, Group, RangeSlider, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { OpeningReport } from "@/bindings";
import { isFiltered, type ReportCellFilter } from "@/utils/openingReportFilters";
import classes from "./report.module.css";

export function bandLabel(minElo: number, maxElo: number) {
  if (minElo <= 1) return `≤${maxElo}`;
  if (maxElo >= 32767) return `${minElo}+`;
  return `${minElo}–${maxElo}`;
}

/** Rating class and period, applied to the moves, the Elo table and the trends. */
export default function ReportFiltersBar({
  report,
  filter,
  onChange,
  yearRange,
}: {
  report: OpeningReport;
  filter: ReportCellFilter;
  onChange: (filter: ReportCellFilter) => void;
  yearRange: [number, number] | null;
}) {
  const { t } = useTranslation();
  const from = filter.from ?? yearRange?.[0] ?? 0;
  const to = filter.to ?? yearRange?.[1] ?? 0;
  const allYears = filter.from === null && filter.to === null;

  return (
    <div>
      <Group gap="xs" align="center" wrap="wrap" mb={10}>
        <span className={classes.label} style={{ width: 72 }}>
          {t("OpeningReport.RatingClass", "Rating")}
        </span>
        <Chip.Group
          value={filter.band === null ? "all" : String(filter.band)}
          onChange={(value) =>
            onChange({ ...filter, band: value === "all" ? null : Number(value) })
          }
        >
          <Group gap={6}>
            <Chip value="all" size="xs" radius="sm">
              {t("OpeningReport.All", "All")}
            </Chip>
            {report.eloBands.map((band, index) => (
              <Chip key={band.minElo} value={String(index)} size="xs" radius="sm">
                {bandLabel(band.minElo, band.maxElo)}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </Group>
      {yearRange && yearRange[0] < yearRange[1] && (
        <Group gap="xs" align="center" wrap="nowrap">
          <span className={classes.label} style={{ width: 72 }}>
            {t("OpeningReport.PeriodFilter", "Period")}
          </span>
          <RangeSlider
            style={{ flex: 1 }}
            size="sm"
            min={yearRange[0]}
            max={yearRange[1]}
            minRange={0}
            value={[from, to]}
            label={(value) => String(value)}
            onChange={([start, end]) =>
              onChange({
                ...filter,
                from: start === yearRange[0] && end === yearRange[1] ? null : start,
                to: start === yearRange[0] && end === yearRange[1] ? null : end,
              })
            }
          />
          <Text size="xs" ff="monospace" w={96} ta="right">
            {allYears ? t("OpeningReport.AllYears", "all years") : `${from}–${to}`}
          </Text>
        </Group>
      )}
      {isFiltered(filter) && (
        <Button
          variant="subtle"
          size="compact-xs"
          mt={6}
          onClick={() => onChange({ band: null, from: null, to: null })}
        >
          {t("OpeningReport.ClearFilters", "Clear filters")}
        </Button>
      )}
    </div>
  );
}
