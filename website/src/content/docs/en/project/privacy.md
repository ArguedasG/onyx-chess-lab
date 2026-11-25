---
title: Privacy
description: What Onyx stores, which services it connects to and when. No telemetry or analytics.
---

Onyx collects no usage data, has no analytics or telemetry and does not require an account. Your games, databases, profiles and training are stored on your computer.

## What Onyx stores and where

- **Documents/Onyx Chess Lab:** your databases, engines, puzzles and files.
- **The app's data folder:** settings, training, history and the Maia 3 environment.

None of this leaves your machine unless you export or share it.

## Automatic connections

Onyx only connects to the internet on its own in these cases:

| When | Where | What for |
| --- | --- | --- |
| When the app opens | GitHub (`github.com`, `api.github.com`) | Checking for a new version |
| When you open the download catalogs or the first steps | GitHub (`raw.githubusercontent.com`), where Onyx publishes its catalog | Getting the list of available databases, puzzles and engines |

These requests only send what any web request includes (your IP address, and the Onyx version in the user agent).

## Connections you start

Every other connection happens only when you use a feature that needs it:

- **Downloads** of databases, puzzles, engines and Maia 3, from each file's server (GitHub, each engine's authors, PyPI, PyTorch, Hugging Face and others).
- **Lichess and Chess.com**, if you connect an account, import games, or use the Lichess explorer or tablebases.
- **Cloud evaluations** (ChessDB) and **FIDE ratings**, if you look them up.

If you connect Lichess, the token is stored on your machine (on Windows, encrypted with the system's data protection) and only sent to Lichess.

## This website

The site is hosted on GitHub Pages. It uses no cookies, analytics or third-party fonts. GitHub may log technical data about visits under its [privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). The download page only queries the GitHub API from your browser if the latest release could not be resolved when the site was built.
