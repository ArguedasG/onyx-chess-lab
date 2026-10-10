import type { StudyLibrary } from "./studies";
import type { OpeningRepertoire, TrainingAreasState } from "./trainingAreas";

export type RepertoireFileRole = "editable" | "source" | "imported";

export type PgnUsage =
    | { kind: "repertoire"; role: RepertoireFileRole; id: string; name: string }
    | { kind: "tactics"; id: string; name: string }
    | { kind: "study"; id: string; name: string; chapters: number };

/**
 * Compares paths the way the user perceives them. Case is folded because Windows paths are
 * case-insensitive; on other systems this can only produce an extra warning, never hide one.
 */
export function normalizeFilePath(path: string): string {
    return path.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function samePath(a: string | undefined | null, b: string | undefined | null): boolean {
    return !!a && !!b && normalizeFilePath(a) === normalizeFilePath(b);
}

/** How a PGN file relates to a repertoire, strongest relation first. */
export function repertoireFileRole(
    repertoire: OpeningRepertoire,
    path: string,
): RepertoireFileRole | null {
    if (samePath(repertoire.path, path)) return "editable";
    if (samePath(repertoire.sourcePath, path)) return "source";
    if (repertoire.imports?.some((entry) => samePath(entry.source, path))) return "imported";
    return null;
}

export function findPgnUsages(
    path: string,
    areas: Pick<TrainingAreasState, "openings" | "tactics">,
    studies?: StudyLibrary | null,
): PgnUsage[] {
    const usages: PgnUsage[] = [];

    for (const repertoire of Object.values(areas.openings.repertoires)) {
        const role = repertoireFileRole(repertoire, path);
        if (role)
            usages.push({ kind: "repertoire", role, id: repertoire.id, name: repertoire.name });
    }

    for (const set of Object.values(areas.tactics.sets)) {
        if (set.source?.kind === "pgnFile" && samePath(set.source.path, path)) {
            usages.push({ kind: "tactics", id: set.id, name: set.name });
        }
    }

    for (const id of studies?.studyOrder ?? []) {
        const study = studies?.studies[id];
        if (!study) continue;
        const chapters = Object.values(study.chapters).filter(
            (chapter) => chapter.source?.kind === "file" && samePath(chapter.source.label, path),
        ).length;
        if (chapters > 0) usages.push({ kind: "study", id, name: study.name, chapters });
    }

    return usages;
}
