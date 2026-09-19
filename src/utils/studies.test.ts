import { describe, expect, it } from "vitest";
import {
    addStudyChapter,
    createEmptyStudyLibrary,
    createStudy,
    deleteStudy,
    deleteStudyChapter,
    exportStudyPgn,
    restoreStudyChapterRevision,
    restoreStudyTrashEntry,
    updateStudyChapter,
} from "./studies";

const pgn = `[Event "Bot game"]
[Site "Onyx"]
[Result "*"]

1. e4 e5 *`;

function libraryWithChapter() {
    let library = createStudy(createEmptyStudyLibrary(), "Mis partidas contra bots", "Análisis");
    const studyId = library.studyOrder[0];
    library = addStudyChapter(
        library,
        studyId,
        { title: "Pérdida contra Maia", pgn, source: { kind: "board", label: "Maia" } },
        "chapter-1",
    );
    return { library, studyId };
}

describe("study library", () => {
    it("keeps studies and chapters ordered and exports Lichess-compatible grouping headers", () => {
        const { library, studyId } = libraryWithChapter();
        const study = library.studies[studyId];
        expect(study.chapterOrder).toEqual(["chapter-1"]);
        expect(exportStudyPgn(study)).toContain('[StudyName "Mis partidas contra bots"]');
        expect(exportStudyPgn(study)).toContain('[ChapterName "Pérdida contra Maia"]');
        expect(exportStudyPgn(study)).toContain("1. e4 e5");
    });

    it("creates bounded chapter revisions and can restore an earlier PGN without losing the latest", () => {
        const { library, studyId } = libraryWithChapter();
        const changed = updateStudyChapter(library, studyId, "chapter-1", {
            pgn: pgn.replace("e5", "c5"),
        });
        const revision = changed.studies[studyId].chapters["chapter-1"].revisions[0];
        expect(revision.pgn).toContain("e5");

        const restored = restoreStudyChapterRevision(changed, studyId, "chapter-1", revision.id);
        expect(restored.studies[studyId].chapters["chapter-1"].pgn).toContain("e5");
        expect(restored.studies[studyId].chapters["chapter-1"].revisions.at(-1)?.pgn).toContain(
            "c5",
        );
    });

    it("soft-deletes and restores chapters and complete studies", () => {
        const { library, studyId } = libraryWithChapter();
        const withoutChapter = deleteStudyChapter(library, studyId, "chapter-1");
        const chapterTrash = withoutChapter.trash[0];
        const chapterRestored = restoreStudyTrashEntry(withoutChapter, chapterTrash.id);
        expect(chapterRestored.studies[studyId].chapters["chapter-1"]).toBeDefined();

        const withoutStudy = deleteStudy(chapterRestored, studyId);
        const studyTrash = withoutStudy.trash.find((entry) => entry.kind === "study")!;
        const studyRestored = restoreStudyTrashEntry(withoutStudy, studyTrash.id);
        expect(studyRestored.studyOrder).toContain(studyId);
        expect(studyRestored.studies[studyId].chapters["chapter-1"]).toBeDefined();
    });
});
