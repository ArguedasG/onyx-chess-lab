import { Autocomplete } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { commands, type Player } from "@/bindings";
import { query_players } from "@/utils/db";
import { unwrap } from "@/utils/unwrap";

export function PlayerSearchInput({
  label,
  value,
  file,
  rightSection,
  setValue,
}: {
  label: string;
  value?: number;
  file: string;
  rightSection?: ReactNode;
  setValue: (val: number | undefined) => void;
}) {
  const [tempValue, setTempValue] = useState("");
  const [data, setData] = useState<Player[]>([]);
  // Only the latest search may replace the suggestions; slower earlier ones arrive late.
  const latestSearch = useRef(0);

  useEffect(() => {
    if (value !== undefined) {
      commands.getPlayer(file, value).then((res) => {
        const player = unwrap(res);
        if (player?.name) {
          setTempValue(player.name);
        }
      });
    }
  }, [value]);

  async function handleChange(val: string) {
    setTempValue(val);
    if (val.trim().length === 0) {
      setValue(undefined);
      setData([]);
      return;
    }
    const player = data.find((player) => player.name === val);
    if (player) {
      setValue(player.id);
    }

    const search = ++latestSearch.current;
    const res = await query_players(file, {
      name: val,
      options: {
        page: 1,
        pageSize: 5,
        skipCount: true,
        // The best-known match first: homonyms with a handful of games go after it.
        sort: "games",
        direction: "desc",
      },
    });
    if (search === latestSearch.current) setData(res.data);
  }
  return (
    <Autocomplete
      value={tempValue}
      // Names are unique options; the backend already matched the words in any order and
      // without accents, so the input's own substring filter would hide those matches.
      data={[...new Set(data.flatMap((player) => (player.name ? [player.name] : [])))]}
      filter={({ options }) => options}
      onChange={handleChange}
      rightSection={rightSection}
      leftSection={<IconSearch size="1rem" />}
      placeholder={label}
    />
  );
}
