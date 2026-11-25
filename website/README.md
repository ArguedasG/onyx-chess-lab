# Onyx Chess Lab website

The public site, built with [Astro](https://astro.build/) and [Starlight](https://starlight.astro.build/)
and published to GitHub Pages by `.github/workflows/website.yml`
(`https://arguedasg.github.io/onyx-chess-lab/`).

It is its own pnpm workspace, separate from the desktop app at the repository root.

```bash
cd website
pnpm install
pnpm dev      # http://localhost:4321/onyx-chess-lab/
pnpm build    # static site in website/dist
```

Astro 6 is pinned because Astro 7 needs Node 22.23.4 or newer.

## Structure

| Path | What it is |
| --- | --- |
| `src/pages/index.astro` | Root page: sends visitors to `/es/` or `/en/` (saved choice, then browser language, else English) |
| `src/pages/[lang]/index.astro` | Landing page, in both languages |
| `src/pages/[lang]/download.astro` | Download page with system detection |
| `src/i18n/ui.ts` | Text of the landing and download pages, Spanish and English |
| `src/content/docs/{es,en}/` | Documentation (Starlight). Every page exists in both languages with the same path |
| `src/lib/release.ts` | Latest release, resolved at build time from the GitHub API |
| `src/assets/screenshots/` | App screenshots for the landing page (see below) |
| `src/styles/tokens.css` | Colours, fonts and sizes shared by the landing and the docs |

## Screenshots

The landing page shows five app screenshots. To replace one, take it with Onyx's defaults (dark
theme, blue accent, **maestro** pieces, **gray** board), with the app window about 1900 px wide and
the sidebar visible, and save it as PNG with the same name:

| File | What it shows |
| --- | --- |
| `src/assets/screenshots/analysis.png` | Board with engine analysis and the explorer (main image, top of the page) |
| `src/assets/screenshots/database.png` | A database with a position search |
| `src/assets/screenshots/training.png` | A training session (tactics or openings) |
| `src/assets/screenshots/preparation.png` | A rival's profile in Players |
| `src/assets/screenshots/books.png` | A PDF book beside the board |

If a file is missing, `pnpm dev` shows a labelled placeholder and the production build leaves the
slot out.

Images for the guides go in `src/assets/guides/` and are referenced from the Markdown with a relative
path, for example `![The report](../../../../assets/guides/report.png)`. Astro optimizes them.

## Latest release

The download buttons are filled in at build time from
`https://api.github.com/repos/ArguedasG/onyx-chess-lab/releases/latest`. The workflow rebuilds the
site on every published release. If the API cannot be reached during the build, the buttons point
at the releases page and the browser asks the API instead.
