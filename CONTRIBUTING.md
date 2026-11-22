# Contributing to Onyx Chess Lab

Thank you for your interest in contributing to **Onyx Chess Lab**! Contributions of all kinds — bug
reports, translations, documentation, tests, and code — are welcome.

## Initial Steps

Before starting work on a change, please check the
[existing issues](https://github.com/ArguedasG/onyx-chess-lab/issues) to see whether someone is
already discussing or working on the same topic.

## Development

1. Fork the repository on GitHub.
2. Clone your fork:

   ```bash
   git clone https://github.com/<your-username>/onyx-chess-lab.git
   cd onyx-chess-lab
   ```

3. Create a branch from `main`:

   ```bash
   git checkout -b your-feature-name
   ```

4. Install dependencies:

   ```bash
   pnpm install
   ```

### Useful Commands

- `pnpm dev` — starts the desktop application in development mode.
- `pnpm test` — runs the frontend test suite (Vitest).
- `pnpm lint` — runs TypeScript type-checking and `oxlint`.
- `pnpm format` — formats the TypeScript/React codebase with `oxfmt`.
- `pnpm lint:ci` — runs the full CI check (type-check, format check, lint, i18n audit, and update/identity isolation audit).
- `pnpm i18n:extract` — updates translation keys in [src/translation](./src/translation/).
- `pnpm build` — builds the desktop application through Tauri.
- `cargo test --manifest-path src-tauri/Cargo.toml` — runs the Rust backend test suite.

## Submitting a Pull Request

1. Make sure `pnpm test`, `pnpm lint:ci`, and `cargo test --manifest-path src-tauri/Cargo.toml` pass.
2. Open a Pull Request against `main` on
   [ArguedasG/onyx-chess-lab](https://github.com/ArguedasG/onyx-chess-lab/pulls) with a clear
   summary of the change and how you tested it.

## Architecture Notes

- Rust + Tauri backend: [src-tauri/src](./src-tauri/src/) (filesystem, SQLite/mmap databases, UCI engines, managed Maia 3, ONNX diagram recognizer).
- React + TypeScript frontend: [src](./src/).
- Project status and decisions: [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md).
