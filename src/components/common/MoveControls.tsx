import { ActionIcon, Box, Divider, Group } from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconArrowBarToDown,
  IconArrowBarToUp,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { memo, useContext } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { keyMapAtom } from "@/state/keybinds";
import type { TreeNode } from "@/utils/treeReducer";
import FirstTimeHint from "./FirstTimeHint";
import ShortcutTooltip, { ShortcutKeys } from "./ShortcutTooltip";
import { TreeStateContext } from "./TreeStateContext";

/** Whether the game has any variation: a move with more than one continuation. */
function hasVariations(node: TreeNode): boolean {
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.children.length > 1) return true;
    stack.push(...current.children);
  }
  return false;
}

function MoveControls({
  readOnly,
  hints = false,
  compact = false,
}: {
  readOnly?: boolean;
  hints?: boolean;
  /** A thin strip (under the board beside a book) instead of the full-size buttons. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const next = useStore(store, (s) => s.goToNext);
  const previous = useStore(store, (s) => s.goToPrevious);
  const start = useStore(store, (s) => s.goToStart);
  const end = useStore(store, (s) => s.goToEnd);
  const deleteMove = useStore(store, (s) => s.deleteMove);
  const startBranch = useStore(store, (s) => s.goToBranchStart);
  const endBranch = useStore(store, (s) => s.goToBranchEnd);
  const nextBranch = useStore(store, (s) => s.nextBranch);
  const previousBranch = useStore(store, (s) => s.previousBranch);
  const nextBranching = useStore(store, (s) => s.nextBranching);
  const previousBranching = useStore(store, (s) => s.previousBranching);
  const variations = useStore(store, (s) => hasVariations(s.root));

  const keyMap = useAtomValue(keyMapAtom);
  useHotkeys(keyMap.PREVIOUS_MOVE.keys, previous);
  useHotkeys(keyMap.NEXT_MOVE.keys, next);
  useHotkeys(keyMap.GO_TO_START.keys, start);
  useHotkeys(keyMap.GO_TO_END.keys, end);
  useHotkeys(keyMap.DELETE_MOVE.keys, readOnly ? () => {} : () => deleteMove());
  useHotkeys(keyMap.GO_TO_BRANCH_START.keys, startBranch);
  useHotkeys(keyMap.GO_TO_BRANCH_END.keys, endBranch);
  useHotkeys(keyMap.NEXT_BRANCH.keys, nextBranch);
  useHotkeys(keyMap.PREVIOUS_BRANCH.keys, previousBranch);
  useHotkeys(keyMap.NEXT_BRANCHING.keys, nextBranching);
  useHotkeys(keyMap.PREVIOUS_BRANCHING.keys, previousBranching);

  const controls = (
    <Group gap="xs" wrap="nowrap">
      <Group grow gap="xs" style={{ flex: 1 }}>
        <ShortcutTooltip
          label={t("Board.Controls.Start", "Start of the game")}
          keys={keyMap.GO_TO_START.keys}
        >
          <ActionIcon
            variant="default"
            size={compact ? "md" : "lg"}
            onClick={start}
            aria-label={t("Board.Controls.Start", "Start of the game")}
          >
            <IconChevronsLeft size={compact ? 18 : undefined} />
          </ActionIcon>
        </ShortcutTooltip>
        <ShortcutTooltip
          label={t("Board.Controls.Previous", "Previous move")}
          keys={keyMap.PREVIOUS_MOVE.keys}
        >
          <ActionIcon
            variant="default"
            size={compact ? "md" : "lg"}
            onClick={previous}
            aria-label={t("Board.Controls.Previous", "Previous move")}
          >
            <IconChevronLeft size={compact ? 18 : undefined} />
          </ActionIcon>
        </ShortcutTooltip>
        <ShortcutTooltip label={t("Board.Controls.Next", "Next move")} keys={keyMap.NEXT_MOVE.keys}>
          <ActionIcon
            variant="default"
            size={compact ? "md" : "lg"}
            onClick={next}
            aria-label={t("Board.Controls.Next", "Next move")}
          >
            <IconChevronRight size={compact ? 18 : undefined} />
          </ActionIcon>
        </ShortcutTooltip>
        <ShortcutTooltip
          label={t("Board.Controls.End", "End of the game")}
          keys={keyMap.GO_TO_END.keys}
        >
          <ActionIcon
            variant="default"
            size={compact ? "md" : "lg"}
            onClick={end}
            aria-label={t("Board.Controls.End", "End of the game")}
          >
            <IconChevronsRight size={compact ? 18 : undefined} />
          </ActionIcon>
        </ShortcutTooltip>
      </Group>
      {/* Only with variations: they would be dead buttons in a game without them. */}
      {variations && (
        <>
          <Divider orientation="vertical" />
          <Group gap="xs" wrap="nowrap">
            <ShortcutTooltip
              label={t("Board.Controls.PreviousVariation", "Previous variation")}
              keys={keyMap.PREVIOUS_BRANCH.keys}
            >
              <ActionIcon
                variant="default"
                size={compact ? "md" : "lg"}
                onClick={previousBranch}
                aria-label={t("Board.Controls.PreviousVariation", "Previous variation")}
              >
                <IconArrowBarToUp size={compact ? 16 : 18} />
              </ActionIcon>
            </ShortcutTooltip>
            <ShortcutTooltip
              label={t("Board.Controls.NextVariation", "Next variation")}
              keys={keyMap.NEXT_BRANCH.keys}
            >
              <ActionIcon
                variant="default"
                size={compact ? "md" : "lg"}
                onClick={nextBranch}
                aria-label={t("Board.Controls.NextVariation", "Next variation")}
              >
                <IconArrowBarToDown size={compact ? 16 : 18} />
              </ActionIcon>
            </ShortcutTooltip>
          </Group>
        </>
      )}
    </Group>
  );

  if (!hints) return controls;

  return (
    <FirstTimeHint
      id="board-controls"
      title={t("Hints.Board.Title", "Every button has a shortcut")}
      shortcutsLink
      target={
        <FirstTimeHint
          id="variations"
          when={variations}
          title={t("Hints.Variations.Title", "This game has variations")}
          shortcutsLink
          // Its arrow points at the two variation buttons, at the right end.
          position="top-end"
          width={360}
          target={controls}
        >
          {t(
            "Hints.Variations.Body",
            "Go through them with the two new buttons on the right, or with these keys:",
          )}
          <Box
            mt={8}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              columnGap: 12,
              rowGap: 6,
              alignItems: "center",
            }}
          >
            <Group gap={4} wrap="nowrap">
              <ShortcutKeys keys={keyMap.PREVIOUS_BRANCH.keys} />
              <ShortcutKeys keys={keyMap.NEXT_BRANCH.keys} />
            </Group>
            <span>{t("Hints.Variations.Switch", "change variation")}</span>
            <Group gap={4} wrap="nowrap">
              <ShortcutKeys keys={keyMap.PREVIOUS_BRANCHING.keys} />
              <ShortcutKeys keys={keyMap.NEXT_BRANCHING.keys} />
            </Group>
            <span>{t("Hints.Variations.Jump", "jump to the next fork")}</span>
          </Box>
        </FirstTimeHint>
      }
    >
      {t(
        "Hints.Board.Body",
        "Rest the mouse on any button to see what it does and its keyboard shortcut. The shortcuts, and what each key does, can be changed in Settings.",
      )}
    </FirstTimeHint>
  );
}

export default memo(MoveControls);
