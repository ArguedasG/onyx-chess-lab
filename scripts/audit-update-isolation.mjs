import { readFile } from "node:fs/promises";

const files = [
  "package.json",
  "src/App.tsx",
  "src/routes/__root.tsx",
  "src-tauri/Cargo.toml",
  "src-tauri/capabilities/main.json",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
];

const forbidden = [
  ["En Croissant's update endpoint", "encroissant.org/updates"],
  ["the JavaScript updater plugin", "@tauri-apps/plugin-updater"],
  ["the Rust updater plugin", "tauri-plugin-updater"],
  ["the updater IPC permission", "updater:default"],
];

const contents = await Promise.all(
  files.map(async (file) => [file, await readFile(new URL(`../${file}`, import.meta.url), "utf8")]),
);

const violations = forbidden.flatMap(([description, pattern]) =>
  contents
    .filter(([, content]) => content.includes(pattern))
    .map(([file]) => `${file} contains ${description} (${pattern})`),
);

const config = JSON.parse(contents.find(([file]) => file === "src-tauri/tauri.conf.json")[1]);
if (config.bundle?.createUpdaterArtifacts !== false) {
  violations.push("src-tauri/tauri.conf.json must keep createUpdaterArtifacts disabled");
}
if (config.plugins?.updater) {
  violations.push(
    "src-tauri/tauri.conf.json must not configure an updater without Onyx signing keys",
  );
}

if (violations.length > 0) {
  console.error("Unsafe update configuration:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Update isolation audit passed");
}
