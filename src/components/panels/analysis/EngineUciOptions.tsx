import {
  Button,
  Checkbox,
  Collapse,
  Loader,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import useSWRImmutable from "swr/immutable";
import { commands, type UciOptionConfig } from "@/bindings";
import type { EngineSettings, LocalEngine } from "@/utils/engines";
import { unwrap } from "@/utils/unwrap";

/** Options the form above already shows, or that Onyx sets itself. */
const HANDLED = new Set(["multipv", "threads", "hash", "uci_chess960"]);

type Value = string | number | boolean | null;

/**
 * Every other UCI option of a local engine (Maia's Elo, Stockfish's Skill Level, Lc0's backend…),
 * for this board only or for all of them when the settings are synced. Values equal to the
 * engine's default are left out, so the engine keeps deciding them.
 */
export default function EngineUciOptions({
  engine,
  settings,
  onChange,
}: {
  engine: LocalEngine;
  settings: EngineSettings;
  onChange: (settings: EngineSettings) => void;
}) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  // The engine is only asked for its options when the section is opened.
  const { data, isLoading, error } = useSWRImmutable(
    opened ? ["engine-config", engine.path, engine.args ?? []] : null,
    async ([, path, args]) => unwrap(await commands.getEngineConfig(path, args)),
  );
  const options = (data?.options ?? []).filter(
    (option): option is Exclude<UciOptionConfig, { type: "button" }> =>
      option.type !== "button" && !HANDLED.has(option.value.name.toLowerCase()),
  );

  const current = (name: string, fallback: Value): Value => {
    const setting = settings.find((candidate) => candidate.name === name);
    return setting ? (setting.value as Value) : fallback;
  };
  const set = (name: string, value: Value, fallback: Value) => {
    const rest = settings.filter((candidate) => candidate.name !== name);
    onChange(value === fallback || value === null ? rest : [...rest, { name, value }]);
  };

  return (
    <Stack gap="xs">
      <Button
        variant="subtle"
        size="compact-sm"
        color="gray"
        w="fit-content"
        leftSection={opened ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        onClick={() => setOpened((value) => !value)}
      >
        {t("Engines.Settings.MoreOptions", "More engine options")}
      </Button>
      <Collapse in={opened}>
        {isLoading ? (
          <Loader size="sm" />
        ) : error ? (
          <Text size="xs" c="red">
            {String(error)}
          </Text>
        ) : options.length === 0 ? (
          <Text size="xs" c="dimmed">
            {t("Engines.Settings.NoMoreOptions", "This engine has no other options.")}
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs" verticalSpacing="xs">
            {options.map((option) => {
              const { name } = option.value;
              if (option.type === "check") {
                const fallback = option.value.default ?? false;
                return (
                  <Checkbox
                    key={name}
                    size="xs"
                    mt="lg"
                    label={name}
                    checked={Boolean(current(name, fallback))}
                    onChange={(event) => set(name, event.currentTarget.checked, fallback)}
                  />
                );
              }
              if (option.type === "spin") {
                const fallback = option.value.default == null ? null : Number(option.value.default);
                const value = current(name, fallback);
                return (
                  <NumberInput
                    key={name}
                    size="xs"
                    label={name}
                    min={option.value.min == null ? undefined : Number(option.value.min)}
                    max={option.value.max == null ? undefined : Number(option.value.max)}
                    value={value == null ? "" : Number(value)}
                    onChange={(next) =>
                      set(name, typeof next === "number" ? next : fallback, fallback)
                    }
                  />
                );
              }
              if (option.type === "combo") {
                const fallback = option.value.default ?? null;
                const value = current(name, fallback);
                return (
                  <Select
                    key={name}
                    size="xs"
                    label={name}
                    data={option.value.var}
                    value={value == null ? null : String(value)}
                    allowDeselect={false}
                    onChange={(next) => set(name, next, fallback)}
                  />
                );
              }
              const fallback = option.value.default ?? "";
              const value = current(name, fallback);
              return (
                <TextInput
                  key={name}
                  size="xs"
                  label={name}
                  value={value == null ? "" : String(value)}
                  onChange={(event) => set(name, event.currentTarget.value, fallback)}
                />
              );
            })}
          </SimpleGrid>
        )}
      </Collapse>
    </Stack>
  );
}
