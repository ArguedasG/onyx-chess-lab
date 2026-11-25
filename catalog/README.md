# Onyx download catalog

These are the lists of game databases, puzzle databases and engines that Onyx offers to download. Since the first release after 0.29.1, Onyx reads them from:

```
https://raw.githubusercontent.com/ArguedasG/onyx-chess-lab/main/catalog/<file>.json
```

Every installed copy of Onyx has that address written in its code, so **these files must never move or be renamed**. Editing them on `main` changes what every installation from that release on lists, without a new release (GitHub caches them for about five minutes).

| File                    | Contents                                                                       |
| ----------------------- | ------------------------------------------------------------------------------ |
| `databases.json`        | Game databases. Onyx only lists `.db3` (SQLite) files.                         |
| `puzzle_databases.json` | Puzzle databases, also `.db3`.                                                 |
| `engines.json`          | Engine builds per system (`os`: `windows`, `macos`, `linux`) and CPU (`bmi2`). |

Each entry needs a `downloadLink`; engines also need the `path` of the executable inside the archive. Two engine builds from the same archive are told apart by `path`.

What these files list is exactly what the app offers: removing or replacing an entry here removes or replaces it in the app. The app also ships a copy in `src/data/catalog/`, used only when these files cannot be reached and nothing was received before. When an entry changes here, change it there as well so the next release carries it.

The files themselves are still hosted by their authors or by En Croissant (`db.encroissant.org`). Moving the databases to Onyx's own hosting is Stage 5 of `docs/public-launch-plan.es.md`.
