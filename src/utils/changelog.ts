import changelog from "@/data/changelog.json";

export const APP_WHATS_NEW_EVENT = "onyx:whats-new";

export type ReleaseNotesSection = { title: string; items: string[] };
export type ReleaseNotes = { summary?: string; sections: ReleaseNotesSection[] };
export type ChangelogEntry = {
    version: string;
    notes: { en: ReleaseNotes; es?: ReleaseNotes };
};

/** Newest first. The release workflow publishes the English notes as the update's description. */
export const CHANGELOG: readonly ChangelogEntry[] = changelog;

/** Compares `major.minor.patch` versions; anything after a `-` is ignored. */
export function compareVersions(left: string, right: string) {
    const parts = (version: string) =>
        version
            .split("-")[0]
            .split(".")
            .map((part) => Number.parseInt(part, 10) || 0);
    const a = parts(left);
    const b = parts(right);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const difference = (a[i] ?? 0) - (b[i] ?? 0);
        if (difference !== 0) return Math.sign(difference);
    }
    return 0;
}

/**
 * The entries to show once when the app starts. A new install has nothing to catch up on; an
 * install from before this window existed has no version stored, so it gets the current notes.
 */
export function unseenEntries(
    entries: readonly ChangelogEntry[],
    currentVersion: string,
    lastSeenVersion: string | null,
    isNewInstall: boolean,
): ChangelogEntry[] {
    if (lastSeenVersion === null && isNewInstall) return [];
    return entries.filter(
        (entry) =>
            compareVersions(entry.version, currentVersion) <= 0 &&
            (lastSeenVersion === null
                ? compareVersions(entry.version, currentVersion) === 0
                : compareVersions(entry.version, lastSeenVersion) > 0),
    );
}

export function notesForLanguage(entry: ChangelogEntry, language: string): ReleaseNotes {
    return (language.toLowerCase().startsWith("es") && entry.notes.es) || entry.notes.en;
}

/** Markdown for the GitHub release and the updater's description. */
export function releaseNotesMarkdown(notes: ReleaseNotes) {
    const lines = notes.summary ? [notes.summary, ""] : [];
    for (const section of notes.sections) {
        lines.push(`### ${section.title}`, ...section.items.map((item) => `- ${item}`), "");
    }
    return lines.join("\n").trim();
}

/**
 * Reads back the Markdown above, which is all an update offers about a version this app has never
 * bundled. Lines that are neither headings nor items go to the summary; a `---` rule ends it.
 */
export function parseReleaseNotesMarkdown(markdown: string): ReleaseNotes {
    const summary: string[] = [];
    const sections: ReleaseNotesSection[] = [];
    for (const raw of markdown.split(/\r?\n/)) {
        const line = raw.trim();
        // The release page adds a footer after a rule.
        if (/^-{3,}$/.test(line)) break;
        if (!line) continue;
        const heading = line.match(/^#{1,6}\s+(.*)$/);
        const item = line.match(/^[-*]\s+(.*)$/);
        if (heading) {
            sections.push({ title: heading[1], items: [] });
        } else if (item) {
            if (sections.length === 0) sections.push({ title: "", items: [] });
            sections[sections.length - 1].items.push(item[1]);
        } else {
            summary.push(line);
        }
    }
    return { summary: summary.join(" ") || undefined, sections };
}

export function requestWhatsNew() {
    window.dispatchEvent(new Event(APP_WHATS_NEW_EVENT));
}
