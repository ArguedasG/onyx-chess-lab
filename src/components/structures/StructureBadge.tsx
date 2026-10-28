import { Badge, Group, Tooltip } from "@mantine/core";
import { IconGridDots } from "@tabler/icons-react";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { useStore } from "zustand";
import { commands, type PawnStructure } from "@/bindings";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import StructureDetailModal from "./StructureDetailModal";
import { structureName } from "./texts";

/** Only the pawns decide a structure: positions with the same pawns share the query. */
function pawnsOf(fen: string): string {
  const board = fen.split(" ")[0] ?? "";
  return board.replace(/[nbrqkNBRQK]/g, "1");
}

/**
 * The named structures of the current position (9.3), next to the opening name; each opens its
 * card. It applies the rule to this position alone (a game counts a structure only when it holds
 * for a few moves); with the pawns still at home it shows nothing.
 */
export default function StructureBadge() {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const fen = useStore(store, (s) => s.currentNode().fen);
  const [card, setCard] = useState<PawnStructure | null>(null);
  const pawns = pawnsOf(fen);
  const { data } = useSWR(
    ["pawn-structures", pawns],
    async () => {
      const result = await commands.detectPawnStructures(fen);
      return result.status === "ok" ? result.data : [];
    },
    { revalidateOnFocus: false },
  );
  if (!data || data.length === 0) return null;
  return (
    <>
      <Group gap={4} wrap="nowrap">
        {data.map((found) => (
          <Tooltip
            key={`${found.structure}-${found.ownerWhite}`}
            label={
              found.ownerWhite
                ? t("Structures.Badge.White", "Pawn structure (White has it): open its plans")
                : t("Structures.Badge.Black", "Pawn structure (Black has it): open its plans")
            }
          >
            <Badge
              size="sm"
              variant="light"
              color="grape"
              leftSection={<IconGridDots size={11} />}
              style={{ cursor: "pointer", flexShrink: 0 }}
              onClick={() => setCard(found.structure)}
            >
              {structureName(found.structure, t)}
            </Badge>
          </Tooltip>
        ))}
      </Group>
      <StructureDetailModal structure={card} onClose={() => setCard(null)} />
    </>
  );
}
