import i18n from "i18next";
import type {
    OpeningGroupingMode,
    OpeningImportGroupPreview,
    OpeningPgnInspection,
    OpeningPgnSample,
} from "@/utils/openingTraining";

/**
 * Smart grouping of imported PGN records into repertoire sections. Courses exported from sites
 * like Chessable name the chapter in a header (often `White`) and mix theory with model games and
 * puzzles; these rules only rely on generic signals, never on a specific course.
 */

type Inspection = Pick<OpeningPgnInspection, "filename" | "samples">;

const STANDARD_START_FIELDS = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
const QUICKSTARTER = /quick\s*-?\s*start(?:er)?/i;
const PUZZLE_WORDS =
    /\b(?:puzzles?|quiz(?:zes)?|drills?|exercises?|ejercicios?|problems?|problemas?|tactics?|t[aá]cticas?)\b/i;
// Explanations rather than lines to learn: a course's "Typical Plans" chapter.
const PLAN_WORDS = /\b(?:typical\s+plans?|plans?|planes|ideas?|strateg(?:y|ies)|estrategias?)\b/i;
// "Carlsen, Magnus" or "Carlsen, M." — a player, never a chapter title.
const PERSON_NAME = /^[\p{L}'’. -]+,\s*[\p{L}'’. -]+$/u;

export function isStandardStart(fen: string): boolean {
    return fen.trim().split(/\s+/).slice(0, 4).join(" ") === STANDARD_START_FIELDS;
}

/** Start of the tree a record joins (see `OpeningPgnSample.sectionFen`). */
export function sampleSectionFen(sample: Pick<OpeningPgnSample, "startingFen" | "sectionFen">) {
    return sample.sectionFen ?? sample.startingFen;
}

export function normalizedGroupKey(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("en-US");
}

function sampleLabels(sample: OpeningPgnSample): string[] {
    return [
        sample.chapterName,
        sample.whiteName,
        sample.blackName,
        sample.eventName,
        sample.name,
    ].filter((value): value is string => Boolean(value));
}

/**
 * Records that start from a custom position and are not lines to learn: puzzles and plans (a
 * header says so), or positions that cannot join any tree of the file. A record whose position is
 * reached in another record joins that tree instead (see `sampleSectionFen`). Informative
 * sections keep one tree per record, so they take any starting position.
 */
export function getOpeningImportPuzzleIndexes(inspection: Pick<Inspection, "samples">): number[] {
    const valid = inspection.samples.filter((sample) => !sample.error);
    const fenCounts = new Map<string, number>();
    for (const sample of valid) {
        const fen = sampleSectionFen(sample);
        fenCounts.set(fen, (fenCounts.get(fen) ?? 0) + 1);
    }
    const informative = (sample: OpeningPgnSample) =>
        sampleLabels(sample).some((label) => PUZZLE_WORDS.test(label) || PLAN_WORDS.test(label));
    return valid
        .filter((sample) => {
            if (isStandardStart(sample.startingFen)) return false;
            const fen = sampleSectionFen(sample);
            if (isStandardStart(fen)) return informative(sample);
            return fenCounts.get(fen) === 1 || informative(sample);
        })
        .map((sample) => sample.index);
}

/**
 * `White` labels that behave like chapter titles: repeated, never used as `Black` elsewhere (in a
 * database of games, players appear on both sides) and not shaped like a player's name.
 */
function chapterLikeWhiteLabels(samples: OpeningPgnSample[]): Set<string> {
    const whiteCounts = new Map<string, number>();
    const blackLabels = new Set<string>();
    for (const sample of samples) {
        if (sample.whiteName) {
            const key = normalizedGroupKey(sample.whiteName);
            whiteCounts.set(key, (whiteCounts.get(key) ?? 0) + 1);
        }
        if (sample.blackName) blackLabels.add(normalizedGroupKey(sample.blackName));
    }
    const labels = new Set<string>();
    for (const sample of samples) {
        const label = sample.whiteName;
        if (!label || PERSON_NAME.test(label)) continue;
        const key = normalizedGroupKey(label);
        if ((whiteCounts.get(key) ?? 0) > 1 && !blackLabels.has(key)) labels.add(key);
    }
    return labels;
}

function smartSection(
    sample: OpeningPgnSample,
    chapterLabels: Set<string>,
    eventCounts: Map<string, number>,
): { name: string; identity: string } | null {
    if (sample.contentType === "modelGame") {
        return {
            name: i18n.t("OpeningImport.ModelGamesSection", "Model games"),
            identity: "smart:model-games",
        };
    }
    if (
        [sample.chapterName, sample.chessableGroupName, sample.whiteName].some(
            (label) => label && QUICKSTARTER.test(label),
        )
    ) {
        return { name: "Quickstarter", identity: "smart:quickstarter" };
    }
    const whiteChapter =
        sample.whiteName && chapterLabels.has(normalizedGroupKey(sample.whiteName))
            ? sample.whiteName
            : undefined;
    const eventRepeats = sample.eventName
        ? (eventCounts.get(normalizedGroupKey(sample.eventName)) ?? 0) > 1
        : false;
    const suggested =
        sample.chapterName ??
        sample.chessableGroupName ??
        whiteChapter ??
        (eventRepeats ? sample.eventName : undefined);
    return suggested
        ? { name: suggested, identity: `smart:${normalizedGroupKey(suggested)}` }
        : null;
}

/**
 * Records the smart grouping proposes to leave out; the import review can restore them. Puzzles
 * and other loose positions now go to informative sections instead (9.3 follow-up).
 */
export function getOpeningImportSuggestedExclusions(
    _inspection: Pick<Inspection, "samples">,
    _mode: OpeningGroupingMode,
): number[] {
    return [];
}

export function getOpeningImportGroupPreviews(
    inspection: Inspection,
    mode: OpeningGroupingMode,
): OpeningImportGroupPreview[] {
    const excluded = new Set(getOpeningImportSuggestedExclusions(inspection, mode));
    const valid = inspection.samples.filter(
        (sample) => !sample.error && !excluded.has(sample.index),
    );
    const eventCounts = new Map<string, number>();
    for (const sample of valid) {
        if (!sample.eventName) continue;
        const key = normalizedGroupKey(sample.eventName);
        eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1);
    }
    const chapterLabels = chapterLikeWhiteLabels(valid);
    // "One section per record" keeps every record as it is; the other modes set puzzles and plans
    // apart in informative sections.
    const loose = new Set(mode === "records" ? [] : getOpeningImportPuzzleIndexes(inspection));
    // A chapter of mostly puzzles or plans is informative as a whole, its introduction included,
    // instead of leaving a one-record theory section beside it.
    const chapterRecords = new Map<string, number[]>();
    for (const sample of mode === "records" ? [] : valid) {
        const chapter = smartSection(sample, chapterLabels, eventCounts)?.identity;
        if (!chapter || chapter === "smart:model-games") continue;
        chapterRecords.set(chapter, [...(chapterRecords.get(chapter) ?? []), sample.index]);
    }
    for (const indexes of chapterRecords.values()) {
        const informative = indexes.filter((index) => loose.has(index)).length;
        if (informative * 2 > indexes.length) for (const index of indexes) loose.add(index);
    }

    const groups = new Map<string, OpeningImportGroupPreview>();
    for (const sample of valid) {
        let name = sample.name;
        let identity = `record:${sample.index}`;
        let contentType = sample.contentType;
        if (loose.has(sample.index)) {
            // Exercises and other loose positions: informative, grouped by their chapter.
            const section = smartSection(sample, chapterLabels, eventCounts);
            contentType = "reference";
            name =
                section && section.identity !== "smart:model-games"
                    ? section.name
                    : (i18n.t("OpeningImport.ExercisesSection", "Exercises") ?? "Exercises");
            identity = `reference:${normalizedGroupKey(name)}`;
        } else if (mode === "single" && sample.contentType === "theory") {
            name = inspection.filename.replace(/\.pgn$/i, "") || "Imported lines";
            identity = "single";
        } else if (mode === "smart") {
            const section = smartSection(sample, chapterLabels, eventCounts);
            if (section) ({ name, identity } = section);
        }

        // Informative sections keep one tree per record, so their starting positions may differ.
        const key =
            contentType === "reference"
                ? `${contentType}|${identity}`
                : `${contentType}|${sampleSectionFen(sample)}|${identity}`;
        const existing = groups.get(key);
        if (existing) {
            existing.recordIndexes.push(sample.index);
            existing.lineCount += sample.lineCount;
            existing.commentCount += sample.commentCount;
        } else {
            groups.set(key, {
                key,
                name,
                startingFen: sampleSectionFen(sample),
                recordIndexes: [sample.index],
                lineCount: sample.lineCount,
                commentCount: sample.commentCount,
                contentType,
            });
        }
    }
    const usedNames = new Map<string, number>();
    return [...groups.values()].map((group) => {
        const normalized = normalizedGroupKey(group.name);
        const occurrence = (usedNames.get(normalized) ?? 0) + 1;
        usedNames.set(normalized, occurrence);
        return occurrence === 1 ? group : { ...group, name: `${group.name} (${occurrence})` };
    });
}
