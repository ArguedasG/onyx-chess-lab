import {
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useDebouncedCallback } from "@mantine/hooks";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clearGameFilters,
  countActiveGameFilters,
  type GameFilterColor,
  type GameFilterField,
  type GameFilterResult,
  type GameFilterValue,
  toPgnDate,
} from "@/utils/gameFilters";

const ALL_FIELDS: GameFilterField[] = ["color", "elo", "dates", "result"];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text fw="bold" fz="sm">
      {children}
    </Text>
  );
}

/** Typing "2200" must run one query, not four: bounds are applied once the typing stops. */
const ELO_TYPING_DELAY_MS = 400;

/** Minimum and maximum Elo; an empty bound leaves that side open. */
export function EloRangeInput({
  min,
  max,
  onChange,
  label,
  description,
}: {
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  label?: string;
  description?: string;
}) {
  const { t } = useTranslation();
  const any = t("Board.Database.Local.Result.Any");
  const parse = (value: string | number) => (value === "" ? null : Number(value));
  const [draft, setDraft] = useState({ min, max });
  // A change from outside (clearing the filters, another tab) replaces what was typed.
  useEffect(() => setDraft({ min, max }), [min, max]);
  const commit = useDebouncedCallback(
    (next: { min: number | null; max: number | null }) => onChange(next.min, next.max),
    ELO_TYPING_DELAY_MS,
  );
  const update = (next: { min: number | null; max: number | null }) => {
    setDraft(next);
    commit(next);
  };
  return (
    <Stack gap={4}>
      <FieldLabel>{label ?? t("GameFilters.Elo", "Elo")}</FieldLabel>
      <Group grow gap="xs" wrap="nowrap">
        <NumberInput
          aria-label={t("Board.Database.Local.MinimumElo")}
          placeholder={`${t("GameFilters.Min", "Min")} · ${any}`}
          min={1}
          max={4000}
          step={50}
          allowDecimal={false}
          value={draft.min ?? ""}
          onChange={(value) => update({ ...draft, min: parse(value) })}
        />
        <NumberInput
          aria-label={t("Board.Database.Local.MaximumElo")}
          placeholder={`${t("GameFilters.Max", "Max")} · ${any}`}
          min={1}
          max={4000}
          step={50}
          allowDecimal={false}
          value={draft.max ?? ""}
          onChange={(value) => update({ ...draft, max: parse(value) })}
        />
      </Group>
      {description && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}
    </Stack>
  );
}

/** From and to, as PGN dates ("YYYY.MM.DD"); either can stay empty. */
export function DateRangeInput({
  start,
  end,
  onChange,
}: {
  start: string | null;
  end: string | null;
  onChange: (start: string | null, end: string | null) => void;
}) {
  const { t } = useTranslation();
  const toDate = (value: string | null) => {
    const pgn = toPgnDate(value);
    return pgn ? dayjs(pgn, "YYYY.MM.DD").toDate() : null;
  };
  const toPgn = (value: Date | string | null) => (value ? dayjs(value).format("YYYY.MM.DD") : null);
  return (
    <Stack gap={4}>
      <FieldLabel>{t("GameFilters.Dates", "Dates")}</FieldLabel>
      <Group grow gap="xs" wrap="nowrap">
        <DateInput
          aria-label={t("Common.From")}
          placeholder={t("Common.StartDate")}
          valueFormat="YYYY-MM-DD"
          clearable
          value={toDate(start)}
          onChange={(value) => onChange(toPgn(value), end)}
        />
        <DateInput
          aria-label={t("Common.To")}
          placeholder={t("Common.EndDate")}
          valueFormat="YYYY-MM-DD"
          clearable
          value={toDate(end)}
          onChange={(value) => onChange(start, toPgn(value))}
        />
      </Group>
    </Stack>
  );
}

export function ColorFilterInput({
  value,
  onChange,
  label,
}: {
  value: GameFilterColor;
  onChange: (value: GameFilterColor) => void;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <Stack gap={4}>
      <FieldLabel>{label ?? t("Board.Database.Local.Color")}</FieldLabel>
      <SegmentedControl
        data={[
          { value: "any", label: t("Board.Database.Local.EitherColor") },
          { value: "white", label: t("Fen.White") },
          { value: "black", label: t("Fen.Black") },
        ]}
        value={value}
        onChange={(next) => onChange(next as GameFilterColor)}
      />
    </Stack>
  );
}

export function ResultFilterInput({
  value,
  onChange,
}: {
  value: GameFilterResult;
  onChange: (value: GameFilterResult) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack gap={4}>
      <FieldLabel>{t("Board.Database.Local.Result")}</FieldLabel>
      <Select
        allowDeselect={false}
        data={[
          { value: "any", label: t("Board.Database.Local.Result.Any") },
          { value: "whitewon", label: t("Board.Database.Local.Result.WhiteWon") },
          { value: "draw", label: t("Board.Analysis.Tablebase.Draw") },
          { value: "blackwon", label: t("Board.Database.Local.Result.BlackWon") },
        ]}
        value={value}
        onChange={(next) => next && onChange(next as GameFilterResult)}
      />
    </Stack>
  );
}

/**
 * The shared game filters, laid out in a grid with a "Clear filters" button. A screen shows only
 * the fields it supports and can add its own controls with `children`.
 */
export default function GameFilters({
  value,
  onChange,
  fields = ALL_FIELDS,
  eloLabel,
  eloDescription,
  colorLabel,
  cols = 2,
  children,
}: {
  value: GameFilterValue;
  onChange: (value: GameFilterValue) => void;
  fields?: readonly GameFilterField[];
  eloLabel?: string;
  eloDescription?: string;
  colorLabel?: string;
  cols?: number | Record<string, number>;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const active = countActiveGameFilters(value, fields);
  return (
    <Stack gap="xs">
      <SimpleGrid cols={cols}>
        {fields.includes("color") && (
          <ColorFilterInput
            label={colorLabel}
            value={value.color}
            onChange={(color) => onChange({ ...value, color })}
          />
        )}
        {fields.includes("result") && (
          <ResultFilterInput
            value={value.result}
            onChange={(result) => onChange({ ...value, result })}
          />
        )}
        {fields.includes("elo") && (
          <EloRangeInput
            label={eloLabel}
            description={eloDescription}
            min={value.eloMin}
            max={value.eloMax}
            onChange={(eloMin, eloMax) => onChange({ ...value, eloMin, eloMax })}
          />
        )}
        {fields.includes("dates") && (
          <DateRangeInput
            start={value.startDate}
            end={value.endDate}
            onChange={(startDate, endDate) => onChange({ ...value, startDate, endDate })}
          />
        )}
        {children}
      </SimpleGrid>
      {active > 0 && (
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          w="fit-content"
          onClick={() => onChange(clearGameFilters(value, fields))}
        >
          {t("GameFilters.Clear", "Clear filters ({{count}})", { count: active })}
        </Button>
      )}
    </Stack>
  );
}
