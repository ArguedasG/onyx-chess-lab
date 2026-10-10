import {
  ActionIcon,
  Collapse,
  Divider,
  Group,
  Popover,
  SimpleGrid,
  Text,
  Tooltip,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import {
  IconArrowUp,
  IconEraser,
  IconMessage,
  IconMessageFilled,
  IconTrash,
} from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { memo, useContext } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import { keyMapAtom } from "@/state/keybinds";
import { ANNOTATION_INFO, type Annotation, isBasicAnnotation } from "@/utils/annotation";
import AnnotationEditor from "./AnnotationEditor";
import classes from "./AnnotationToolbar.module.css";

/** Whether the annotation bar is shown under the notation (toggled from the notation header). */
export const annotationToolbarAtom = atomWithStorage("annotation-toolbar", true);
const commentEditorOpenAtom = atomWithStorage("comment-editor-open", false);

const BASIC = ["!!", "!", "!?", "?!", "?", "??"] as const;
const ADVANTAGE = ["+-", "±", "⩲", "=", "∞", "⩱", "∓", "-+"] as const;
const EXTRA = ["N", "↑↑", "↑", "→", "⇆", "=∞", "⊕", "∆", "□", "⨀", "⊗"] as const;

function useSymbolLabel() {
  const { t } = useTranslation();
  return (annotation: Annotation) => {
    const { translationKey, name } = ANNOTATION_INFO[annotation];
    return translationKey ? t(`Annotate.${translationKey}`) : name;
  };
}

const SymbolButton = memo(function SymbolButton({
  annotation,
  active,
  onToggle,
}: {
  annotation: Annotation;
  active: boolean;
  onToggle: (annotation: Annotation) => void;
}) {
  const label = useSymbolLabel();
  const theme = useMantineTheme();
  const color = isBasicAnnotation(annotation)
    ? ANNOTATION_INFO[annotation].color
    : theme.primaryColor;
  return (
    <Tooltip label={label(annotation)} openDelay={300}>
      <ActionIcon
        size="sm"
        variant={active ? "filled" : "subtle"}
        color={active ? color : "gray"}
        onClick={() => onToggle(annotation)}
        className={classes.symbol}
      >
        {annotation}
      </ActionIcon>
    </Tooltip>
  );
});

/**
 * Annotation tools right under the notation, replacing the old Annotate tab: move symbols,
 * evaluation symbols, a comment editor and quick edits of the current move.
 */
function AnnotationToolbar() {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const node = useStore(store, (s) => s.currentNode());
  const position = useStore(store, (s) => s.position);
  const setAnnotation = useStore(store, (s) => s.setAnnotation);
  const promoteVariation = useStore(store, (s) => s.promoteVariation);
  const deleteMove = useStore(store, (s) => s.deleteMove);
  const clearShapes = useStore(store, (s) => s.clearShapes);
  const [commentOpen, setCommentOpen] = useAtom(commentEditorOpenAtom);
  const keyMap = useAtomValue(keyMapAtom);

  useHotkeys(keyMap.ANNOTATE_TAB.keys, () => setCommentOpen((open) => !open), {
    preventDefault: true,
  });

  const atStart = position.length === 0;
  const isVariation = position.some((index) => index > 0);
  const evaluation = node.annotations.find(
    (annotation) => !(BASIC as readonly string[]).includes(annotation),
  );
  const hasShapes = node.shapes.length > 0;

  return (
    <div className={classes.root}>
      <Group gap={2} wrap="nowrap" className={classes.bar}>
        {BASIC.map((annotation) => (
          <SymbolButton
            key={annotation}
            annotation={annotation}
            active={node.annotations.includes(annotation)}
            onToggle={setAnnotation}
          />
        ))}
        <Divider orientation="vertical" mx={4} />
        <Popover position="top" shadow="md" withinPortal>
          <Popover.Target>
            <Tooltip label={t("Annotate.MoreSymbols", "Evaluation and other symbols")}>
              <UnstyledButton
                className={`${classes.more} ${evaluation ? classes.moreActive : ""}`}
                disabled={atStart}
              >
                {evaluation ?? "±"}
              </UnstyledButton>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown p="xs">
            <Text size="xs" c="dimmed" mb={4}>
              {t("Annotate.Evaluation", "Evaluation")}
            </Text>
            <SimpleGrid cols={8} spacing={2}>
              {ADVANTAGE.map((annotation) => (
                <SymbolButton
                  key={annotation}
                  annotation={annotation}
                  active={node.annotations.includes(annotation)}
                  onToggle={setAnnotation}
                />
              ))}
            </SimpleGrid>
            <Text size="xs" c="dimmed" mt="xs" mb={4}>
              {t("Annotate.OtherSymbols", "Other symbols")}
            </Text>
            <SimpleGrid cols={8} spacing={2}>
              {EXTRA.map((annotation) => (
                <SymbolButton
                  key={annotation}
                  annotation={annotation}
                  active={node.annotations.includes(annotation)}
                  onToggle={setAnnotation}
                />
              ))}
            </SimpleGrid>
          </Popover.Dropdown>
        </Popover>
        <Divider orientation="vertical" mx={4} />
        <Tooltip
          label={`${t("Annotate.Comment", "Comment")} (${keyMap.ANNOTATE_TAB.keys.toUpperCase()})`}
        >
          <ActionIcon
            size="sm"
            variant={commentOpen ? "light" : "subtle"}
            color={commentOpen ? undefined : "gray"}
            onClick={() => setCommentOpen((open) => !open)}
          >
            {node.comment ? <IconMessageFilled size={15} /> : <IconMessage size={15} />}
          </ActionIcon>
        </Tooltip>
        <div className={classes.spacer} />
        <Tooltip label={t("Annotate.PromoteVariation", "Promote variation")}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            disabled={!isVariation}
            onClick={() => promoteVariation(position)}
          >
            <IconArrowUp size={15} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("Annotate.ClearArrows", "Clear arrows and highlights")}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            disabled={!hasShapes}
            onClick={clearShapes}
          >
            <IconEraser size={15} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("Annotate.DeleteFromHere", "Delete from this move")}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            disabled={atStart}
            onClick={() => deleteMove()}
          >
            <IconTrash size={15} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Collapse in={commentOpen}>
        <div className={classes.editor}>{commentOpen && <AnnotationEditor compact />}</div>
      </Collapse>
    </div>
  );
}

export default memo(AnnotationToolbar);
