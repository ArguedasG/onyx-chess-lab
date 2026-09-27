import {
    getOpeningImportGroupPreviews,
    type OpeningGroupingMode,
    type OpeningImportGroupPreview,
    type OpeningPgnInspection,
    type OpeningPgnSample,
} from "@/utils/openingTraining";

/**
 * Editable plan of how PGN records become repertoire sections. It starts from the automatic
 * grouping and only stores the user's decisions; the PGN itself is not touched until import.
 */
export type OpeningImportDraftSection = {
    key: string;
    name: string;
    startingFen: string;
    contentType: OpeningPgnSample["contentType"];
    recordIndexes: number[];
};

export type OpeningImportDraft = {
    sections: OpeningImportDraftSection[];
    excluded: number[];
    /** Section each excluded record came from, so restoring it puts it back where it was. */
    excludedFrom: Record<number, string>;
    /** Manual line names by source record index. */
    recordNames: Record<number, string>;
    nextSectionId: number;
};

export type OpeningImportDraftTarget =
    | { kind: "section"; key: string; index: number }
    | { kind: "newSection"; name: string }
    | { kind: "excluded" };

type Samples = Pick<OpeningPgnInspection, "samples">;

function sampleByIndex(inspection: Samples, index: number): OpeningPgnSample | undefined {
    return inspection.samples.find((sample) => sample.index === index);
}

export function createOpeningImportDraft(
    inspection: Pick<OpeningPgnInspection, "filename" | "samples">,
    mode: OpeningGroupingMode,
): OpeningImportDraft {
    return {
        sections: getOpeningImportGroupPreviews(inspection, mode).map((group) => ({
            key: group.key,
            name: group.name,
            startingFen: group.startingFen,
            contentType: group.contentType,
            recordIndexes: [...group.recordIndexes],
        })),
        excluded: [],
        excludedFrom: {},
        recordNames: {},
        nextSectionId: 1,
    };
}

export function findDraftRecordSection(
    draft: OpeningImportDraft,
    recordIndex: number,
): OpeningImportDraftSection | undefined {
    return draft.sections.find((section) => section.recordIndexes.includes(recordIndex));
}

/** Records can only share a section when their trees start from the same position. */
export function canPlaceDraftRecord(
    inspection: Samples,
    section: Pick<OpeningImportDraftSection, "startingFen">,
    recordIndex: number,
): boolean {
    return sampleByIndex(inspection, recordIndex)?.startingFen === section.startingFen;
}

function withoutRecord(draft: OpeningImportDraft, recordIndex: number): OpeningImportDraft {
    const excludedFrom = { ...draft.excludedFrom };
    delete excludedFrom[recordIndex];
    return {
        ...draft,
        sections: draft.sections.map((section) =>
            section.recordIndexes.includes(recordIndex)
                ? {
                      ...section,
                      recordIndexes: section.recordIndexes.filter((index) => index !== recordIndex),
                  }
                : section,
        ),
        excluded: draft.excluded.filter((index) => index !== recordIndex),
        excludedFrom,
    };
}

/**
 * Moves a record to another section, a new section or the excluded list. Returns `null` when the
 * move would merge incompatible starting positions. Empty sections are kept while editing so a
 * drag does not make the list jump; they are dropped when the draft is converted for import.
 */
export function moveDraftRecord(
    inspection: Samples,
    draft: OpeningImportDraft,
    recordIndex: number,
    target: OpeningImportDraftTarget,
): OpeningImportDraft | null {
    const sample = sampleByIndex(inspection, recordIndex);
    if (!sample || sample.error) return null;
    const origin = findDraftRecordSection(draft, recordIndex);
    const next = withoutRecord(draft, recordIndex);

    if (target.kind === "excluded") {
        return {
            ...next,
            excluded: [...next.excluded, recordIndex],
            excludedFrom: origin
                ? { ...next.excludedFrom, [recordIndex]: origin.key }
                : next.excludedFrom,
        };
    }

    if (target.kind === "newSection") {
        const section: OpeningImportDraftSection = {
            key: `custom:${draft.nextSectionId}`,
            name: target.name.trim() || sample.name,
            startingFen: sample.startingFen,
            contentType: origin?.contentType ?? sample.contentType,
            recordIndexes: [recordIndex],
        };
        const originPosition = origin
            ? next.sections.findIndex((candidate) => candidate.key === origin.key)
            : -1;
        const sections = [...next.sections];
        sections.splice(originPosition >= 0 ? originPosition + 1 : sections.length, 0, section);
        return { ...next, sections, nextSectionId: draft.nextSectionId + 1 };
    }

    const destination = next.sections.find((section) => section.key === target.key);
    if (!destination || !canPlaceDraftRecord(inspection, destination, recordIndex)) return null;
    return {
        ...next,
        sections: next.sections.map((section) => {
            if (section.key !== target.key) return section;
            const recordIndexes = [...section.recordIndexes];
            const index = Math.max(0, Math.min(target.index, recordIndexes.length));
            recordIndexes.splice(index, 0, recordIndex);
            return { ...section, recordIndexes };
        }),
    };
}

/** Restores an excluded record to its previous section, or to a new one if it no longer fits. */
export function restoreDraftRecord(
    inspection: Samples,
    draft: OpeningImportDraft,
    recordIndex: number,
): OpeningImportDraft {
    const originKey = draft.excludedFrom[recordIndex];
    const origin = draft.sections.find((section) => section.key === originKey);
    const restored =
        origin &&
        moveDraftRecord(inspection, draft, recordIndex, {
            kind: "section",
            key: origin.key,
            index: origin.recordIndexes.length,
        });
    return (
        restored ??
        moveDraftRecord(inspection, draft, recordIndex, { kind: "newSection", name: "" }) ??
        draft
    );
}

export function moveDraftSection(
    draft: OpeningImportDraft,
    fromIndex: number,
    toIndex: number,
): OpeningImportDraft {
    if (fromIndex === toIndex || !draft.sections[fromIndex]) return draft;
    const sections = [...draft.sections];
    const [section] = sections.splice(fromIndex, 1);
    sections.splice(Math.max(0, Math.min(toIndex, sections.length)), 0, section);
    return { ...draft, sections };
}

export function updateDraftSection(
    draft: OpeningImportDraft,
    key: string,
    input: Partial<Pick<OpeningImportDraftSection, "name" | "contentType">>,
): OpeningImportDraft {
    return {
        ...draft,
        sections: draft.sections.map((section) =>
            section.key === key ? { ...section, ...input } : section,
        ),
    };
}

/**
 * Leaves a whole section out of the import. Its records keep a link to the (now empty) section,
 * so restoring any of them puts it back where it was, name included.
 */
export function excludeDraftSection(draft: OpeningImportDraft, key: string): OpeningImportDraft {
    const section = draft.sections.find((candidate) => candidate.key === key);
    if (!section || section.recordIndexes.length === 0) return draft;
    const excludedFrom = { ...draft.excludedFrom };
    for (const recordIndex of section.recordIndexes) excludedFrom[recordIndex] = key;
    return {
        ...draft,
        sections: draft.sections.map((candidate) =>
            candidate.key === key ? { ...candidate, recordIndexes: [] } : candidate,
        ),
        excluded: [...draft.excluded, ...section.recordIndexes],
        excludedFrom,
    };
}

/** Moves every record of `sourceKey` to the end of `targetKey` when their positions match. */
export function mergeDraftSections(
    draft: OpeningImportDraft,
    sourceKey: string,
    targetKey: string,
): OpeningImportDraft | null {
    const source = draft.sections.find((section) => section.key === sourceKey);
    const target = draft.sections.find((section) => section.key === targetKey);
    if (!source || !target || source === target || source.startingFen !== target.startingFen) {
        return null;
    }
    return {
        ...draft,
        sections: draft.sections
            .filter((section) => section.key !== sourceKey)
            .map((section) =>
                section.key === targetKey
                    ? {
                          ...section,
                          recordIndexes: [...section.recordIndexes, ...source.recordIndexes],
                      }
                    : section,
            ),
    };
}

export function renameDraftRecord(
    draft: OpeningImportDraft,
    recordIndex: number,
    name: string,
): OpeningImportDraft {
    const recordNames = { ...draft.recordNames };
    if (name.trim()) recordNames[recordIndex] = name.trim();
    else delete recordNames[recordIndex];
    return { ...draft, recordNames };
}

export function draftRecordName(
    inspection: Samples,
    draft: OpeningImportDraft,
    recordIndex: number,
): string {
    return (
        draft.recordNames[recordIndex] ??
        sampleByIndex(inspection, recordIndex)?.name ??
        `#${recordIndex + 1}`
    );
}

/**
 * Converts the draft into the group contract used by `prepareOpeningImport`: empty sections are
 * removed, blank names fall back to the first record and duplicate names stay distinguishable.
 */
export function draftToImportGroups(
    inspection: Samples,
    draft: OpeningImportDraft,
): OpeningImportGroupPreview[] {
    const usedNames = new Map<string, number>();
    return draft.sections.flatMap((section) => {
        const samples = section.recordIndexes.flatMap((index) => {
            const sample = sampleByIndex(inspection, index);
            return sample && !sample.error ? [sample] : [];
        });
        if (samples.length === 0) return [];
        const baseName = section.name.trim() || samples[0].name;
        const normalized = baseName.toLocaleLowerCase();
        const occurrence = (usedNames.get(normalized) ?? 0) + 1;
        usedNames.set(normalized, occurrence);
        return [
            {
                key: section.key,
                name: occurrence === 1 ? baseName : `${baseName} (${occurrence})`,
                startingFen: section.startingFen,
                recordIndexes: samples.map((sample) => sample.index),
                lineCount: samples.reduce((sum, sample) => sum + sample.lineCount, 0),
                commentCount: samples.reduce((sum, sample) => sum + sample.commentCount, 0),
                contentType: section.contentType,
            },
        ];
    });
}
