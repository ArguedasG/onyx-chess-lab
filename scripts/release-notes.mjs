import { appendFile, readFile } from "node:fs/promises";

// Writes the English notes of the version being released, from src/data/changelog.json, as the
// `body` output of the step. tauri-action publishes them in the release and in latest.json, so the
// updater shows them before installing. Keep the Markdown in sync with releaseNotesMarkdown().
const [packageJsonText, changelogText] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../src/data/changelog.json", import.meta.url), "utf8"),
]);

const version = JSON.parse(packageJsonText).version;
const entry = JSON.parse(changelogText).find((candidate) => candidate.version === version);
if (!entry) {
  console.error(`src/data/changelog.json has no entry for ${version}`);
  process.exit(1);
}

const notes = entry.notes.en;
const lines = notes.summary ? [notes.summary, ""] : [];
for (const section of notes.sections) {
  lines.push(`### ${section.title}`, ...section.items.map((item) => `- ${item}`), "");
}
// After the rule, only the release page shows it; the app stops reading there.
lines.push(
  "---",
  "Signed Onyx Chess Lab update. Windows x64 is the validated platform; Linux and macOS builds are untested previews.",
);
const body = lines.join("\n").trim();

if (process.env.GITHUB_OUTPUT) {
  const delimiter = `NOTES_${Date.now()}`;
  await appendFile(process.env.GITHUB_OUTPUT, `body<<${delimiter}\n${body}\n${delimiter}\n`);
}
console.log(body);
