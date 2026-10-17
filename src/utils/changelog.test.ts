import { describe, expect, it } from "vitest";
import {
    CHANGELOG,
    type ChangelogEntry,
    compareVersions,
    notesForLanguage,
    parseReleaseNotesMarkdown,
    releaseNotesMarkdown,
    unseenEntries,
} from "./changelog";

function entry(version: string): ChangelogEntry {
    return { version, notes: { en: { sections: [{ title: version, items: ["x"] }] } } };
}

const entries = ["0.23.0", "0.22.1", "0.22.0", "0.21.0"].map(entry);
const versions = (list: ChangelogEntry[]) => list.map((item) => item.version);

describe("changelog", () => {
    it("compares versions numerically", () => {
        expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
        expect(compareVersions("0.22.0", "0.22.0")).toBe(0);
        expect(compareVersions("0.22.0-rc1", "0.22.0")).toBe(0);
        expect(compareVersions("0.21.4", "0.22")).toBe(-1);
    });

    it("shows every version since the last one seen, up to the running one", () => {
        expect(versions(unseenEntries(entries, "0.22.1", "0.21.0", false))).toEqual([
            "0.22.1",
            "0.22.0",
        ]);
        expect(unseenEntries(entries, "0.22.1", "0.22.1", false)).toEqual([]);
    });

    it("shows nothing on a new install and the current notes to older installs", () => {
        expect(unseenEntries(entries, "0.22.0", null, true)).toEqual([]);
        expect(versions(unseenEntries(entries, "0.22.0", null, false))).toEqual(["0.22.0"]);
    });

    it("reads back the Markdown published with a release", () => {
        const notes = {
            summary: "Summary.",
            sections: [{ title: "Tactics", items: ["One", "Two"] }],
        };
        const published = `${releaseNotesMarkdown(notes)}\n\n---\nFooter for the release page.`;
        expect(parseReleaseNotesMarkdown(published)).toEqual(notes);
        expect(parseReleaseNotesMarkdown("Plain text")).toEqual({
            summary: "Plain text",
            sections: [],
        });
    });

    it("has Spanish and English notes, newest first", () => {
        for (const item of CHANGELOG) {
            expect(item.notes.en.sections.length).toBeGreaterThan(0);
            expect(notesForLanguage(item, "es-ES")).toBe(item.notes.es ?? item.notes.en);
            expect(notesForLanguage(item, "fr-FR")).toBe(item.notes.en);
        }
        const sorted = [...CHANGELOG].sort((a, b) => compareVersions(b.version, a.version));
        expect(CHANGELOG).toEqual(sorted);
    });
});
