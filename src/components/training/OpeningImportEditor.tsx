import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type BeforeCapture,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  IconArrowBackUp,
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconEyeOff,
  IconGripVertical,
  IconPencil,
  IconRefresh,
  IconRowInsertBottom,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { OpeningPgnInspection } from "@/utils/openingTraining";
import {
  draftRecordName,
  excludeDraftSection,
  mergeDraftSections,
  moveDraftRecord,
  moveDraftSection,
  renameDraftRecord,
  restoreDraftRecord,
  updateDraftSection,
  type OpeningImportDraft,
  type OpeningImportDraftSection,
  type OpeningImportDraftTarget,
} from "@/utils/openingImportDraft";

const NEW_SECTION_DROPPABLE = "new-section";
const EXCLUDED_DROPPABLE = "excluded";
const RECORDS_PREFIX = "records:";
const RECORD_PREFIX = "record:";
/** Large imports start collapsed so the section structure is readable at a glance. */
const EXPANDED_BY_DEFAULT_MAX_RECORDS = 40;

type Props = {
  inspection: OpeningPgnInspection;
  draft: OpeningImportDraft;
  onChange: (draft: OpeningImportDraft) => void;
  onReset: () => void;
  disabled?: boolean;
};

export default function OpeningImportEditor({
  inspection,
  draft,
  onChange,
  onReset,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const records = draft.sections.reduce((sum, s) => sum + s.recordIndexes.length, 0);
    return new Set(
      records <= EXPANDED_BY_DEFAULT_MAX_RECORDS ? draft.sections.map((s) => s.key) : [],
    );
  });
  const [draggingFen, setDraggingFen] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<{ index: number; name: string } | null>(null);
  const sampleFor = (index: number) => inspection.samples.find((sample) => sample.index === index);
  // Sections emptied by a drag are ignored at import time, so they disappear from the editor too.
  const visibleSections = draft.sections.filter((section) => section.recordIndexes.length > 0);

  function toggleSection(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Runs before droppable dimensions are measured, so collapsed sections can grow a drop strip.
  function handleBeforeCapture(before: BeforeCapture) {
    if (!before.draggableId.startsWith(RECORD_PREFIX)) return;
    const recordIndex = Number(before.draggableId.slice(RECORD_PREFIX.length));
    setDraggingFen(sampleFor(recordIndex)?.startingFen ?? null);
  }

  function handleDragEnd(result: DropResult) {
    setDraggingFen(null);
    const { destination, source } = result;
    if (!destination) return;
    if (result.type === "SECTION") {
      const from = draft.sections.findIndex(
        (section) => section.key === visibleSections[source.index]?.key,
      );
      const to = draft.sections.findIndex(
        (section) => section.key === visibleSections[destination.index]?.key,
      );
      if (from >= 0 && to >= 0) onChange(moveDraftSection(draft, from, to));
      return;
    }

    const recordIndex = Number(result.draggableId.slice(RECORD_PREFIX.length));
    let target: OpeningImportDraftTarget;
    if (destination.droppableId === EXCLUDED_DROPPABLE) {
      target = { kind: "excluded" };
    } else if (destination.droppableId === NEW_SECTION_DROPPABLE) {
      target = { kind: "newSection", name: draftRecordName(inspection, draft, recordIndex) };
    } else {
      const key = destination.droppableId.slice(RECORDS_PREFIX.length);
      target = {
        kind: "section",
        key,
        // Collapsed sections only show a drop strip, so dropped records go to the end.
        index: expanded.has(key) ? destination.index : Number.MAX_SAFE_INTEGER,
      };
      setExpanded((current) => new Set(current).add(key));
    }
    const next = moveDraftRecord(inspection, draft, recordIndex, target);
    if (next) onChange(next);
  }

  function commitRecordName() {
    if (!editingRecord) return;
    const original = sampleFor(editingRecord.index)?.name ?? "";
    const name = editingRecord.name.trim();
    onChange(renameDraftRecord(draft, editingRecord.index, name === original ? "" : name));
    setEditingRecord(null);
  }

  function renderRecord(recordIndex: number, index: number, section?: OpeningImportDraftSection) {
    const sample = sampleFor(recordIndex);
    const isEditing = editingRecord?.index === recordIndex;
    const renamed = draft.recordNames[recordIndex] !== undefined;
    return (
      <Draggable
        key={recordIndex}
        draggableId={`${RECORD_PREFIX}${recordIndex}`}
        index={index}
        isDragDisabled={disabled || isEditing}
      >
        {(provided, snapshot) => (
          <Card
            ref={provided.innerRef}
            {...provided.draggableProps}
            withBorder
            padding={6}
            shadow={snapshot.isDragging ? "md" : undefined}
            style={provided.draggableProps.style}
          >
            <Group gap="xs" wrap="nowrap">
              <div
                {...provided.dragHandleProps}
                aria-label={t("OpeningImportEditor.DragLine", "Drag line")}
                style={{ cursor: "grab", display: "flex" }}
              >
                <IconGripVertical size={14} opacity={0.6} />
              </div>
              {isEditing ? (
                <TextInput
                  size="xs"
                  autoFocus
                  style={{ flex: 1 }}
                  value={editingRecord.name}
                  onChange={(event) =>
                    setEditingRecord({ index: recordIndex, name: event.currentTarget.value })
                  }
                  onBlur={commitRecordName}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRecordName();
                    if (event.key === "Escape") setEditingRecord(null);
                  }}
                />
              ) : (
                <Text
                  size="sm"
                  style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", cursor: "text" }}
                  fs={renamed ? "italic" : undefined}
                  onDoubleClick={() =>
                    !disabled &&
                    setEditingRecord({
                      index: recordIndex,
                      name: draftRecordName(inspection, draft, recordIndex),
                    })
                  }
                >
                  {draftRecordName(inspection, draft, recordIndex)}
                </Text>
              )}
              <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                {t("OpeningImportEditor.LineCount", "Lines: {{count}}", {
                  count: sample?.lineCount ?? 0,
                })}
              </Text>
              {sample && section && sample.contentType !== section.contentType && (
                <Tooltip
                  label={t(
                    "OpeningImportEditor.TypeOverridden",
                    "Detected as a different content type; the section type will be used.",
                  )}
                >
                  <Badge size="xs" variant="outline" color="gray">
                    {sample.contentType === "modelGame"
                      ? t("Training.Copy.Modelgame.f131746e", "Model game")
                      : t("OpeningImportEditor.Theory", "Theory")}
                  </Badge>
                </Tooltip>
              )}
              {!isEditing && (
                <Tooltip label={t("OpeningImportEditor.RenameLine", "Rename line")}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    disabled={disabled}
                    onClick={() =>
                      setEditingRecord({
                        index: recordIndex,
                        name: draftRecordName(inspection, draft, recordIndex),
                      })
                    }
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
              {section ? (
                <Tooltip label={t("OpeningImportEditor.Exclude", "Do not import")}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    disabled={disabled}
                    onClick={() => {
                      const next = moveDraftRecord(inspection, draft, recordIndex, {
                        kind: "excluded",
                      });
                      if (next) onChange(next);
                    }}
                  >
                    <IconEyeOff size={14} />
                  </ActionIcon>
                </Tooltip>
              ) : (
                <Tooltip label={t("OpeningImportEditor.Restore", "Restore")}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    disabled={disabled}
                    onClick={() => onChange(restoreDraftRecord(inspection, draft, recordIndex))}
                  >
                    <IconArrowBackUp size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Card>
        )}
      </Draggable>
    );
  }

  function renderSection(section: OpeningImportDraftSection, index: number) {
    const isExpanded = expanded.has(section.key);
    const lineCount = section.recordIndexes.reduce(
      (sum, recordIndex) => sum + (sampleFor(recordIndex)?.lineCount ?? 0),
      0,
    );
    const incompatible = draggingFen !== null && draggingFen !== section.startingFen;
    const mergeTargets = draft.sections.filter(
      (candidate) =>
        candidate.key !== section.key &&
        candidate.startingFen === section.startingFen &&
        candidate.recordIndexes.length > 0,
    );
    return (
      <Draggable
        key={section.key}
        draggableId={`section:${section.key}`}
        index={index}
        isDragDisabled={disabled}
      >
        {(provided, snapshot) => (
          <Card
            ref={provided.innerRef}
            {...provided.draggableProps}
            withBorder
            padding="xs"
            shadow={snapshot.isDragging ? "md" : undefined}
            style={{ ...provided.draggableProps.style, opacity: incompatible ? 0.45 : 1 }}
          >
            <Group gap="xs" wrap="nowrap">
              <div
                {...provided.dragHandleProps}
                aria-label={t("OpeningImportEditor.DragSection", "Drag section")}
                style={{ cursor: "grab", display: "flex" }}
              >
                <IconGripVertical size={16} />
              </div>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={() => toggleSection(section.key)}
                aria-label={t("OpeningImportEditor.ToggleSection", "Show or hide lines")}
              >
                {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
              </ActionIcon>
              <TextInput
                size="xs"
                variant="unstyled"
                fw={600}
                style={{ flex: 1 }}
                disabled={disabled}
                placeholder={t("OpeningImportEditor.SectionName", "Section name")}
                value={section.name}
                onChange={(event) =>
                  onChange(
                    updateDraftSection(draft, section.key, { name: event.currentTarget.value }),
                  )
                }
              />
              <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                {t("OpeningImportEditor.SectionCounts", "{{records}} records · {{lines}} lines", {
                  records: section.recordIndexes.length,
                  lines: lineCount,
                })}
              </Text>
              {section.contentType === "modelGame" && (
                <Badge color="violet" size="sm">
                  {t("Training.Copy.Modelgame.f131746e", "Model game")}
                </Badge>
              )}
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon size="sm" variant="subtle" color="gray" disabled={disabled}>
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    onClick={() =>
                      onChange(
                        updateDraftSection(draft, section.key, {
                          contentType: section.contentType === "theory" ? "modelGame" : "theory",
                        }),
                      )
                    }
                  >
                    {section.contentType === "theory"
                      ? t("OpeningImportEditor.MarkModelGame", "Mark as model games")
                      : t("OpeningImportEditor.MarkTheory", "Mark as trainable theory")}
                  </Menu.Item>
                  <Menu.Item
                    color="red"
                    leftSection={<IconEyeOff size={14} />}
                    onClick={() => onChange(excludeDraftSection(draft, section.key))}
                  >
                    {t("OpeningImportEditor.ExcludeSection", "Do not import this section")}
                  </Menu.Item>
                  {mergeTargets.length > 0 && (
                    <>
                      <Menu.Divider />
                      <Menu.Label>{t("OpeningImportEditor.MergeInto", "Merge into")}</Menu.Label>
                      <ScrollArea.Autosize mah={220}>
                        {mergeTargets.map((target) => (
                          <Menu.Item
                            key={target.key}
                            onClick={() => {
                              const next = mergeDraftSections(draft, section.key, target.key);
                              if (next) onChange(next);
                            }}
                          >
                            {target.name ||
                              t("OpeningImportEditor.UnnamedSection", "Unnamed section")}
                          </Menu.Item>
                        ))}
                      </ScrollArea.Autosize>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
            <Droppable
              droppableId={`${RECORDS_PREFIX}${section.key}`}
              type="RECORD"
              isDropDisabled={incompatible}
            >
              {(dropProvided, dropSnapshot) => (
                <Stack
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  gap={4}
                  mt={isExpanded || draggingFen ? 6 : 0}
                  pl={isExpanded ? 28 : 0}
                  mih={draggingFen && !incompatible ? 28 : undefined}
                  style={{
                    borderRadius: 6,
                    background: dropSnapshot.isDraggingOver
                      ? "var(--mantine-color-blue-light)"
                      : undefined,
                  }}
                >
                  {isExpanded &&
                    section.recordIndexes.map((recordIndex, recordPosition) =>
                      renderRecord(recordIndex, recordPosition, section),
                    )}
                  {!isExpanded && draggingFen && !incompatible && (
                    <Text size="xs" c="dimmed" ta="center" py={4}>
                      {t("OpeningImportEditor.DropAtEnd", "Drop to add at the end")}
                    </Text>
                  )}
                  {dropProvided.placeholder}
                </Stack>
              )}
            </Droppable>
          </Card>
        )}
      </Draggable>
    );
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="xs" c="dimmed" style={{ flex: 1 }}>
          {t(
            "OpeningImportEditor.Help",
            "Drag lines between sections, rename sections and lines, or exclude what you do not want to import. Only records that share a starting position can go in the same section.",
          )}
        </Text>
        <Group gap={4}>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() =>
              setExpanded(expanded.size > 0 ? new Set() : new Set(draft.sections.map((s) => s.key)))
            }
          >
            {expanded.size > 0
              ? t("OpeningImportEditor.CollapseAll", "Collapse all")
              : t("OpeningImportEditor.ExpandAll", "Expand all")}
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<IconRefresh size={12} />}
            disabled={disabled}
            onClick={onReset}
          >
            {t("OpeningImportEditor.Reset", "Reset grouping")}
          </Button>
        </Group>
      </Group>
      <DragDropContext onBeforeCapture={handleBeforeCapture} onDragEnd={handleDragEnd}>
        {/* No inner scroll area: the modal must be the only scroll parent of the droppables. */}
        <Stack gap="xs">
          <Droppable droppableId="sections" type="SECTION">
            {(provided) => (
              <Stack ref={provided.innerRef} {...provided.droppableProps} gap="xs">
                {visibleSections.map(renderSection)}
                {provided.placeholder}
              </Stack>
            )}
          </Droppable>
          <Droppable droppableId={NEW_SECTION_DROPPABLE} type="RECORD">
            {(provided, snapshot) => (
              <Card
                ref={provided.innerRef}
                {...provided.droppableProps}
                withBorder
                padding="xs"
                style={{
                  borderStyle: "dashed",
                  background: snapshot.isDraggingOver
                    ? "var(--mantine-color-blue-light)"
                    : undefined,
                }}
              >
                <Group gap="xs" c="dimmed">
                  <IconRowInsertBottom size={16} />
                  <Text size="xs">
                    {t(
                      "OpeningImportEditor.DropNewSection",
                      "Drop a line here to create a new section",
                    )}
                  </Text>
                </Group>
                {provided.placeholder}
              </Card>
            )}
          </Droppable>
          <Droppable droppableId={EXCLUDED_DROPPABLE} type="RECORD">
            {(provided, snapshot) => (
              <Card
                ref={provided.innerRef}
                {...provided.droppableProps}
                withBorder
                padding="xs"
                style={{
                  borderStyle: "dashed",
                  background: snapshot.isDraggingOver
                    ? "var(--mantine-color-red-light)"
                    : undefined,
                }}
              >
                <Group gap="xs" c="dimmed" mb={draft.excluded.length > 0 ? 6 : 0}>
                  <IconEyeOff size={16} />
                  <Text size="xs">
                    {draft.excluded.length > 0
                      ? t("OpeningImportEditor.ExcludedCount", "Not imported ({{count}})", {
                          count: draft.excluded.length,
                        })
                      : t(
                          "OpeningImportEditor.DropExclude",
                          "Drop a line here to leave it out of the repertoire",
                        )}
                  </Text>
                </Group>
                <Stack gap={4}>
                  {draft.excluded.map((recordIndex, index) => renderRecord(recordIndex, index))}
                </Stack>
                {provided.placeholder}
              </Card>
            )}
          </Droppable>
        </Stack>
      </DragDropContext>
    </Stack>
  );
}
