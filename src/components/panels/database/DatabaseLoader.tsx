import { Progress, Text } from "@mantine/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type ProgressPayload = {
  id: string;
  progress: number;
  finished: boolean;
  requestId: number;
  /** "index" while the position index of the base is built, "scan" or "sort" afterwards. */
  stage?: string;
  /** Games added to the index so far (index stage only). */
  processed?: number;
};

function DatabaseLoader({ isLoading, tab }: { isLoading: boolean; tab: string | null }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const [indexedGames, setIndexedGames] = useState<number | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<ProgressPayload>("search_progress", ({ payload }) => {
      if (payload.id !== tab) return;
      if (payload.requestId < latestRequest.current) return;
      if (payload.requestId > latestRequest.current) {
        latestRequest.current = payload.requestId;
        setProgress(0);
        setIndexedGames(null);
      }
      if (payload.finished) {
        setProgress(0);
        setIndexedGames(null);
      } else if (payload.stage === "index") {
        setIndexedGames(payload.processed ?? 0);
      } else {
        setIndexedGames(null);
        setProgress((current) => Math.max(current, payload.progress));
      }
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });

    return () => {
      disposed = true;
      unlisten?.();
      latestRequest.current = 0;
    };
  }, [tab]);

  useEffect(() => {
    if (!isLoading) {
      setProgress(0);
      setIndexedGames(null);
    }
  }, [isLoading]);

  const isLoadingFromMemory = isLoading && progress === 0;

  return (
    <>
      <Progress
        animated={isLoadingFromMemory}
        value={isLoadingFromMemory ? 100 : progress}
        size="xs"
        mt="xs"
      />
      {isLoading && indexedGames !== null && (
        <Text size="xs" c="dimmed" mt={4}>
          {t(
            "Board.Database.BuildingIndex",
            "Building the position index of this base (first search, or after its games changed): {{games}} games so far. It is done once.",
            { games: indexedGames.toLocaleString() },
          )}
        </Text>
      )}
    </>
  );
}

export default DatabaseLoader;
