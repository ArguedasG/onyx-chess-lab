import { useEffect, useRef, useState } from "react";
import {
  cachedCustomPieceCss,
  customPieceSetIdOf,
  isCustomPieceSet,
  loadCustomPieceCss,
} from "@/utils/customPieces";

const FALLBACK_SET = "maestro";

function stylesheetOf(pieceSet: string) {
  if (!isCustomPieceSet(pieceSet))
    return <link rel="stylesheet" href={`/pieces/${pieceSet}.css`} />;
  const css = cachedCustomPieceCss(customPieceSetIdOf(pieceSet));
  if (css === undefined) return undefined;
  // Its file is gone (app data cleaned by hand): the default set rather than no pieces.
  if (css === null) return <link rel="stylesheet" href={`/pieces/${FALLBACK_SET}.css`} />;
  return <style>{css}</style>;
}

/** The stylesheet of the chosen piece set: a bundled one, or one the user loaded from a folder. */
export default function PieceSetStyle({ pieceSet }: { pieceSet: string }) {
  const [, setLoaded] = useState(0);
  // While a custom set is read, the previous pieces stay instead of an empty board.
  const lastShown = useRef(FALLBACK_SET);
  const stylesheet = stylesheetOf(pieceSet);
  const ready = stylesheet !== undefined;

  useEffect(() => {
    if (ready) {
      lastShown.current = pieceSet;
      return;
    }
    let cancelled = false;
    void loadCustomPieceCss(customPieceSetIdOf(pieceSet)).then(() => {
      if (!cancelled) setLoaded((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [pieceSet, ready]);

  return stylesheet ?? stylesheetOf(lastShown.current) ?? stylesheetOf(FALLBACK_SET);
}
