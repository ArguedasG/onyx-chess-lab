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
// "Carlsen, Magnus" or "Carlsen, M." — a player, never a chapter title.
const PERSON_NAME = /^[\p{L}'’. -]+,\s*[\p{L}'’. -]+$/u;

export function isStandardStart(fen: string): boolean {
    return fen.trim().split(/\s+/).slice(0, 4).join(" ") === STANDARD_START_FIELDS;
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
 * Records that start from a custom position and look like puzzles: their position is unique in
 * the file or a header says so. They cannot share a section with opening theory (a section is a
 * single tree), so the smart grouping leaves them out of the import by default.
 */
export function getOpeningImportPuzzleIndexes(inspection: Pick<Inspection, "samples">): number[] {
    const valid = inspection.samples.filter((sample) => !sample.error);
    const fenCounts = new Map<string, number>();
    for (const sample of valid) {
        fenCounts.set(sample.startingFen, (fenCounts.get(sample.startingFen) ?? 0) + 1);
    }
    return valid
        .filter(
            (sample) =>
                !isStandardStart(sample.startingFen) &&
                (fenCounts.get(sample.startingFen) === 1 ||
                    sampleLabels(sample).some((label) => PUZZLE_WORDS.test(label))),
        )
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

/** Records the smart grouping proposes to leave out; the import review can restore them. */
export function getOpeningImportSuggestedExclusions(
    inspection: Pick<Inspection, "samples">,
    mode: OpeningGroupingMode,
): number[] {
    return mode === "smart" ? getOpeningImportPuzzleIndexes(inspection) : [];
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
    const chapterLabels = mode === "smart" ? chapterLikeWhiteLabels(valid) : new Set<string>();

    const groups = new Map<string, OpeningImportGroupPreview>();
    for (const sample of valid) {
        let name = sample.name;
        let identity = `record:${sample.index}`;
        if (mode === "single" && sample.contentType === "theory") {
            name = inspection.filename.replace(/\.pgn$/i, "") || "Imported lines";
            identity = "single";
        } else if (mode === "smart") {
            const section = smartSection(sample, chapterLabels, eventCounts);
            if (section) ({ name, identity } = section);
        }

        const key = `${sample.contentType}|${sample.startingFen}|${identity}`;
        const existing = groups.get(key);
        if (existing) {
            existing.recordIndexes.push(sample.index);
            existing.lineCount += sample.lineCount;
            existing.commentCount += sample.commentCount;
        } else {
            groups.set(key, {
                key,
                name,
                startingFen: sample.startingFen,
                recordIndexes: [sample.index],
                lineCount: sample.lineCount,
                commentCount: sample.commentCount,
                contentType: sample.contentType,
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
