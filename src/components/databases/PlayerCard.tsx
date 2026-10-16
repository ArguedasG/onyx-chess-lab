import { Paper } from "@mantine/core";
import { useSetAtom } from "jotai";
import type { Player } from "@/bindings";
import PlayerCardView from "@/components/players/PlayerCardView";
import { usePlayerCards } from "@/components/players/usePlayerCards";
import { playerCardSelectionAtom, sourceKey } from "@/state/playerCards";

/**
 * The player card of the Players section for a player of this database. If a saved card already
 * has this record, that card is shown (with its aliases); otherwise it can be saved from here.
 */
function PlayerCard({ player, file }: { player: Player; file: string }) {
  const cards = usePlayerCards();
  const setSelection = useSetAtom(playerCardSelectionAtom);
  const source = {
    databasePath: file,
    databaseTitle: file.split(/[\\/]/).at(-1) || file,
    playerId: player.id,
    playerName: player.name || "Unknown",
  };
  const key = sourceKey(source);
  const saved = cards.savedCards.find((card) =>
    card.sources.some((item) => sourceKey(item) === key),
  );
  const card = saved ?? cards.resolve({ origin: "search", source })!;

  return (
    <Paper h="100%" shadow="sm" p="md" withBorder style={{ overflow: "hidden" }}>
      <PlayerCardView
        key={card.id}
        card={card}
        returnPath="/databases"
        selfSources={cards.selfSources}
        actions={
          card.origin === "search"
            ? {
                save: (value) => {
                  const id = cards.saveCard(card.sources, value);
                  setSelection({ origin: "saved", id });
                },
              }
            : {
                update: (change) => cards.updateCard(card, change),
                markAliasesMigrated: () => cards.markAliasesMigrated(card.analysisProfileId),
              }
        }
      />
    </Paper>
  );
}

export default PlayerCard;
