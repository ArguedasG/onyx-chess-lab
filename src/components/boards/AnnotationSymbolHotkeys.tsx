import { useAtomValue } from "jotai";
import { useHotkeys } from "react-hotkeys-hook";
import { keyMapAtom } from "@/state/keybinds";
import type { Annotation } from "@/utils/annotation";

const SYMBOL_KEYBINDS = [
  ["ANNOTATION_WHITE_WINNING", "+-"],
  ["ANNOTATION_WHITE_ADVANTAGE", "±"],
  ["ANNOTATION_WHITE_EDGE", "⩲"],
  ["ANNOTATION_EQUAL", "="],
  ["ANNOTATION_UNCLEAR", "∞"],
  ["ANNOTATION_BLACK_EDGE", "⩱"],
  ["ANNOTATION_BLACK_ADVANTAGE", "∓"],
  ["ANNOTATION_BLACK_WINNING", "-+"],
  ["ANNOTATION_COUNTERPLAY", "⇆"],
  ["ANNOTATION_COMPENSATION", "=∞"],
] as const satisfies readonly (readonly [string, Annotation])[];

// react-hotkeys-hook matches physical keys, so Shift+digit works on every keyboard layout.
function SymbolHotkey({
  keys,
  annotation,
  onAnnotate,
}: {
  keys: string;
  annotation: Annotation;
  onAnnotate: (annotation: Annotation) => void;
}) {
  useHotkeys(keys, () => onAnnotate(annotation), { preventDefault: true });
  return null;
}

/** Shortcuts for the position-evaluation symbols (Shift+1…0 by default), like Lichess. */
export default function AnnotationSymbolHotkeys({
  onAnnotate,
}: {
  onAnnotate: (annotation: Annotation) => void;
}) {
  const keyMap = useAtomValue(keyMapAtom);
  return SYMBOL_KEYBINDS.map(([action, annotation]) => (
    <SymbolHotkey
      key={action}
      keys={keyMap[action].keys}
      annotation={annotation}
      onAnnotate={onAnnotate}
    />
  ));
}
