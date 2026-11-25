---
title: Code signing policy
description: How Onyx Chess Lab installers are built, approved and signed.
---

:::note[Status]
Windows code signing through SignPath Foundation is **not active yet**. Until then, the Windows installer carries no Authenticode signature; in-app updates are signed with minisign (see below).
:::

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/), once the project is accepted into their open-source program.

## What is signed

Only the files this project publishes, built from its [public source code](https://github.com/ArguedasG/onyx-chess-lab):

- The Windows installer (`Onyx.Chess.Lab_X.Y.Z_x64-setup.exe`) and, once signed, the app executable it contains.

## How it is built

- Every release is built on **GitHub Actions** from a version tag of the repository, with the public [`release.yml`](https://github.com/ArguedasG/onyx-chess-lab/blob/main/.github/workflows/release.yml) workflow.
- Builds made on a personal computer are never signed.
- Dependencies are installed from the official registries with committed lock files (`pnpm-lock.yaml`, `Cargo.lock`).

## Roles

| Role | People |
| --- | --- |
| Committers and reviewers | [Gabriel Arguedas](https://github.com/ArguedasG) |
| Approvers | [Gabriel Arguedas](https://github.com/ArguedasG) |

Every signing request is approved **manually** for each release. External contributions are reviewed before they reach the main branch. Accounts with these permissions use two-factor authentication.

## Updates

Independently of Windows signing, the Onyx updater verifies a **minisign** signature of every installer before installing it. The private key is only available to the release workflow.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user, with two automatic exceptions: checking for new versions and fetching the download catalogs. The details are in the [privacy policy](../privacy/).

## Contact

To report a security problem or a suspicious signed file, open an [issue on GitHub](https://github.com/ArguedasG/onyx-chess-lab/issues).
