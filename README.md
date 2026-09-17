<div align="center">
  <img width="140" src="assets/brand/source/onyx-chess-lab-master.png" alt="Onyx Chess Lab logo">
  <h1>Onyx Chess Lab</h1>
  <p><strong>A local-first chess study, training and experimentation lab.</strong></p>
  <p>
    <a href="https://github.com/ArguedasG/onyx-chess-lab/releases">Download releases</a>
    ·
    <a href="PROJECT_ROADMAP.md">Project roadmap</a>
    ·
    <a href="https://github.com/ArguedasG/onyx-chess-lab/issues">Report an issue</a>
  </p>
</div>

Onyx Chess Lab is an open-source desktop application for studying chess, training practical skills
and running reproducible experiments with engines and human-like bots. It is a fork of
[En Croissant](https://github.com/franciscoBSalgueiro/en-croissant) and is distributed under GPLv3.

The project is currently an **early public alpha/beta**. The repository and GitHub releases are
public, while active testing is still being carried out with a small group of users. Windows x64 is
the currently validated distribution target; macOS and Linux support is planned but is not yet
declared production-ready.

## Highlights

- Local chess databases with exact and partial position search.
- Paginated game exploration designed for large local databases.
- Opening reports with statistics, theory, move orders, transpositions and HTML/PGN export.
- Player Analysis with filters, evidence, engine metrics and trainable critical positions.
- Dedicated training experiences for tactics, opening repertoires and endgames.
- Human-like Maia-based bots with local history and measurements.
- Reproducible model-game generation, batches, experiments and analysis.
- UCI engine support, including guided installation of the managed Maia 3 package on Windows x64.
- Signed Onyx update channel for Windows x64.
- Local-first storage: personal games, profiles and experiments remain on the user's computer by
  default.

The current status, limitations and implementation order are documented in
[PROJECT_ROADMAP.md](PROJECT_ROADMAP.md).

## Downloads

Windows x64 builds and signed updater artifacts are published through
[GitHub Releases](https://github.com/ArguedasG/onyx-chess-lab/releases).

Because the application is still in an early public stage, keeping backups of important PGN files
and application data is recommended. Bugs and reproducible problems can be reported through
[GitHub Issues](https://github.com/ArguedasG/onyx-chess-lab/issues).

## Building from source

The application uses React and TypeScript for the interface and Rust with Tauri for filesystem,
database, engine and desktop integration.

Requirements:

- Node.js and [pnpm](https://pnpm.io/installation);
- a Rust toolchain;
- the platform prerequisites documented by
  [Tauri](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/ArguedasG/onyx-chess-lab.git
cd onyx-chess-lab
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm test
pnpm lint
pnpm build
```

`pnpm build` creates the desktop build through Tauri. Release installers are produced by the release
workflow and should not be treated as equivalent to an unverified local build.

## Project history and attribution

Onyx Chess Lab is derived from
[En Croissant](https://github.com/franciscoBSalgueiro/en-croissant). The upstream project, its
contributors and its retained copyright notices remain credited in accordance with GPLv3.

The Onyx Chess Lab brand artwork has separate provenance and licensing information in
[assets/brand/README.md](assets/brand/README.md).

## License

The source code is licensed under the [GNU General Public License v3.0](LICENSE). Individual assets,
models, engines and imported chess content may have their own licenses and notices.
