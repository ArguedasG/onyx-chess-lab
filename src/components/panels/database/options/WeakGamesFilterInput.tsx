import { Checkbox, Paper, Select, Stack, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { weakGamesFilterAtom } from "@/state/atoms";

const THRESHOLDS = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800];

/**
 * Leave out games between two weak players. Each player is judged by their best rating in any
 * game of the database, so a strong player who appears with a wrong low rating is not dropped,
 * and a game between a strong and a weak player always stays.
 */
export default function WeakGamesFilterInput() {
  const { t } = useTranslation();
  const [filter, setFilter] = useAtom(weakGamesFilterAtom);
  const value = filter.below != null ? String(filter.below) : filter.unrated ? "unrated" : "off";

  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap="xs">
        <Select
          label={t("Board.Database.Weak.Label", "Leave out games between weak players")}
          description={t(
            "Board.Database.Weak.Desc",
            "Only when both players are weak. Each one is judged by their best rating in the whole database. Applies to every tab.",
          )}
          allowDeselect={false}
          value={value}
          onChange={(next) => {
            if (!next || next === "off") setFilter({ below: null, unrated: false });
            else if (next === "unrated") setFilter({ below: null, unrated: true });
            else setFilter((current) => ({ ...current, below: Number(next) }));
          }}
          data={[
            { value: "off", label: t("Board.Database.Weak.Off", "Keep every game") },
            { value: "unrated", label: t("Board.Database.Weak.Unrated", "Both without a rating") },
            ...THRESHOLDS.map((elo) => ({
              value: String(elo),
              label: t("Board.Database.Weak.Below", "Both below {{elo}}", { elo }),
            })),
          ]}
        />
        {filter.below != null && (
          <Checkbox
            size="xs"
            checked={filter.unrated}
            onChange={(event) => {
              const unrated = event.currentTarget.checked;
              setFilter((current) => ({ ...current, unrated }));
            }}
            label={t(
              "Board.Database.Weak.CountUnrated",
              "Also count players without any rating as weak",
            )}
          />
        )}
        {filter.unrated && (
          <Text size="xs" c="orange">
            {t(
              "Board.Database.Weak.UnratedWarning",
              "Careful: games from before ratings existed (classics such as Morphy or Capablanca) have no rating and will be left out.",
            )}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
