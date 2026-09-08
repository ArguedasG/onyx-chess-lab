import { readFile } from "node:fs/promises";

const [packageJsonText, cargoToml, cargoLock] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/Cargo.lock", import.meta.url), "utf8"),
]);

const packageVersion = JSON.parse(packageJsonText).version;
const cargoPackage = cargoToml.split(/^\[package\]\s*$/m)[1];
const cargoVersion = cargoPackage?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const lockPackage = cargoLock
  .split(/^\[\[package\]\]\s*$/m)
  .find((entry) => /^name\s*=\s*"onyx-chess-lab"$/m.test(entry));
const lockVersion = lockPackage?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const violations = [];
if (!packageVersion || !cargoVersion || !lockVersion) {
  violations.push("Could not read all three application versions");
} else if (new Set([packageVersion, cargoVersion, lockVersion]).size !== 1) {
  violations.push(
    `Version mismatch: package.json=${packageVersion}, Cargo.toml=${cargoVersion}, Cargo.lock=${lockVersion}`,
  );
}

const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined;
if (tag && tag !== `v${packageVersion}`) {
  violations.push(`Release tag ${tag} does not match application version v${packageVersion}`);
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Release version verified: ${packageVersion}`);
}
