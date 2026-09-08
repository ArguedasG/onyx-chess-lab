import { readFile } from "node:fs/promises";

const files = [
  "package.json",
  "src/App.tsx",
  "src/components/AppUpdater.tsx",
  "src/routes/__root.tsx",
  "src-tauri/Cargo.toml",
  "src-tauri/capabilities/main.json",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
  ".github/workflows/release.yml",
];

const forbidden = [
  ["En Croissant's update endpoint", "encroissant.org/updates"],
  ["En Croissant's GitHub release endpoint", "franciscoBSalgueiro/en-croissant/releases"],
];

const required = [
  ["package.json", "@tauri-apps/plugin-updater", "the JavaScript updater plugin"],
  ["src/components/AppUpdater.tsx", "downloadAndInstall", "the confirmed install flow"],
  ["src/routes/__root.tsx", "requestAppUpdateCheck", "the manual update check"],
  ["src-tauri/Cargo.toml", "tauri-plugin-updater", "the Rust updater plugin"],
  ["src-tauri/capabilities/main.json", "updater:default", "the updater IPC permission"],
  ["src-tauri/src/main.rs", "tauri_plugin_updater", "the updater initialization"],
  [".github/workflows/release.yml", "TAURI_SIGNING_PRIVATE_KEY", "the updater signing secret"],
];

const contents = await Promise.all(
  files.map(async (file) => [file, await readFile(new URL(`../${file}`, import.meta.url), "utf8")]),
);

const violations = forbidden.flatMap(([description, pattern]) =>
  contents
    .filter(([, content]) => content.includes(pattern))
    .map(([file]) => `${file} contains ${description} (${pattern})`),
);

for (const [file, pattern, description] of required) {
  const content = contents.find(([candidate]) => candidate === file)?.[1] ?? "";
  if (!content.includes(pattern)) violations.push(`${file} is missing ${description} (${pattern})`);
}

const config = JSON.parse(contents.find(([file]) => file === "src-tauri/tauri.conf.json")[1]);
if (config.bundle?.createUpdaterArtifacts !== true) {
  violations.push("src-tauri/tauri.conf.json must create signed updater artifacts");
}
const updater = config.plugins?.updater;
const expectedEndpoint =
  "https://github.com/ArguedasG/onyx-chess-lab/releases/latest/download/latest.json";
const expectedPublicKey =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEI0NjZBMzg3NDEwMkNERTcKUldUbnpRSkJoNk5tdEtCTTZjNzk2MGdyaUs1eHRvS0xiTTU5WEU0YnRoNzUyaDFET2F5TWUrb1AK";
if (!updater || updater.endpoints?.length !== 1 || updater.endpoints[0] !== expectedEndpoint) {
  violations.push(`src-tauri/tauri.conf.json must use only ${expectedEndpoint}`);
}
if (updater?.pubkey !== expectedPublicKey) {
  violations.push("src-tauri/tauri.conf.json must contain the exact Onyx updater public key");
}
if (updater?.windows?.installMode !== "passive") {
  violations.push("src-tauri/tauri.conf.json must use the passive Windows install mode");
}

const workflow = contents.find(([file]) => file === ".github/workflows/release.yml")?.[1] ?? "";
if (workflow.includes("macos-latest") || workflow.includes("ubuntu-")) {
  violations.push("the first updater release workflow must remain Windows x64 only");
}
if (!workflow.includes("releaseDraft: true") || !workflow.includes("prerelease: false")) {
  violations.push("the stable release must remain a manually approved draft before publication");
}

if (violations.length > 0) {
  console.error("Unsafe update configuration:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Update isolation audit passed");
}
