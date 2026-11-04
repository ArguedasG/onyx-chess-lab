import { appendFile, readFile } from "node:fs/promises";

// Writes the English notes of the version being released, from src/data/changelog.json, as the
// `body` output of the step. tauri-action publishes them in the release and in latest.json, so the
// updater shows them before installing. The Spanish notes follow in an HTML comment, hidden on the
// release page, which the updater reads when the app is in Spanish. Keep the Markdown in sync with
// releaseNotesMarkdown() and RELEASE_NOTES_ES_MARKER in src/utils/changelog.ts.
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

function markdown(notes) {
  const lines = notes.summary ? [notes.summary, ""] : [];
  for (const section of notes.sections) {
    lines.push(`### ${section.title}`, ...section.items.map((item) => `- ${item}`), "");
  }
  return lines;
}

const lines = markdown(entry.notes.en);
// After the rule, only the release page shows it; the app stops reading there.
lines.push("---", "");
if (entry.notes.es) lines.push("## Español", "", ...markdown(entry.notes.es));
const file = (suffix) => `\`Onyx.Chess.Lab_${version}_${suffix}\``;
lines.push(
  "## Downloads / Descargas",
  "",
  "| Platform / Plataforma | File / Archivo | Status / Estado |",
  "|---|---|---|",
  `| Windows x64 | ${file("x64-setup.exe")} | Validated · in-app updates / Validada · actualizaciones desde la app |`,
  `| macOS Apple Silicon | ${file("aarch64.dmg")} | Untested preview / Vista previa sin probar |`,
  `| macOS Intel | ${file("x64.dmg")} | Untested preview / Vista previa sin probar |`,
  `| Linux x64 | ${file("amd64.AppImage")} / \`.deb\` | Untested preview / Vista previa sin probar |`,
  "",
  "Signed Onyx Chess Lab update: Windows users receive it through the built-in updater. On macOS and Linux, download and install new versions manually; the macOS build is not signed by Apple, see the [README](https://github.com/ArguedasG/onyx-chess-lab#opening-the-app-on-macos) for how to open it. Your repertoires, studies, books, training progress, databases, analyses and settings are preserved.",
  "",
  "Actualización firmada de Onyx Chess Lab: en Windows llega por el actualizador integrado. En macOS y Linux, descarga e instala las versiones nuevas a mano; la versión de macOS no está firmada por Apple, consulta el [README](https://github.com/ArguedasG/onyx-chess-lab#opening-the-app-on-macos) para abrirla. Tus repertorios, estudios, libros, progreso de entrenamiento, bases, análisis y ajustes se conservan.",
);
if (entry.notes.es) {
  // The app reads the Spanish notes from here (RELEASE_NOTES_ES_MARKER), not from the visible copy.
  // "--" cannot appear inside an HTML comment.
  const spanish = markdown(entry.notes.es).join("\n").trim().replaceAll("--", "—");
  lines.push("", "<!-- onyx-notes:es", spanish, "-->");
}
const body = lines.join("\n").trim();

if (process.env.GITHUB_OUTPUT) {
  const delimiter = `NOTES_${Date.now()}`;
  await appendFile(process.env.GITHUB_OUTPUT, `body<<${delimiter}\n${body}\n${delimiter}\n`);
}
console.log(body);
