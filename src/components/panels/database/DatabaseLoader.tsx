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
  /** Games added to the index so far (index and pattern stages). */
  processed?: number;
  /** Games of the base (pattern stage). */
  total?: number;
};

function DatabaseLoader({ isLoading, tab }: { isLoading: boolean; tab: string | null }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const [indexedGames, setIndexedGames] = useState<number | null>(null);
  /** The pattern index being built: games done and in all. */
  const [patternBuild, setPatternBuild] = useState<{ done: number; total: number } | null>(null);
  const patternBuildRef = useRef(false);
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
        setPatternBuild(null);
      }
      if (payload.finished) {
        setProgress(0);
        setIndexedGames(null);
        setPatternBuild(null);
      } else if (payload.stage === "index") {
        setIndexedGames(payload.processed ?? 0);
      } else if (payload.stage === "pattern") {
        const done = payload.processed ?? 0;
        const total = Math.max(payload.total ?? 1, 1);
        patternBuildRef.current = true;
        setPatternBuild({ done, total });
        setProgress((done / total) * 100);
      } else {
        setIndexedGames(null);
        if (patternBuildRef.current) {
          // The scan after the build starts its own bar.
          patternBuildRef.current = false;
          setPatternBuild(null);
          setProgress(payload.progress);
        } else {
          setProgress((current) => Math.max(current, payload.progress));
        }
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
      setPatternBuild(null);
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
      {isLoading && patternBuild !== null && (
        <Text size="xs" c="dimmed" mt={4}>
          {t(
            "Board.Database.BuildingPatternIndex",
            "Preparing this base for pattern searches (first pattern search, or after its games changed): {{done}} of {{total}} games. It is done once; later pattern searches are several times faster.",
            {
              done: patternBuild.done.toLocaleString(),
              total: patternBuild.total.toLocaleString(),
            },
          )}
        </Text>
      )}
    </>
  );
}

export default DatabaseLoader;
