---
title: Install on macOS
description: How to install Onyx Chess Lab on an Apple Silicon or Intel Mac and open it for the first time.
---

## Which file to download

Open the Apple menu → **About This Mac**:

- if it says **Chip Apple M1, M2, M3…**, download the **Apple Silicon** file (`_aarch64.dmg`);
- if it says **Processor Intel**, download the **Intel** file (`_x64.dmg`).

Both are on the [download page](../../download/).

## Installation

1. Open the `.dmg` and drag **Onyx Chess Lab** into **Applications**.
2. Open **Terminal** (in Applications → Utilities) and run:

   ```bash
   xattr -cr "/Applications/Onyx Chess Lab.app"
   ```

3. Open Onyx from **Applications**.

## Why the command is needed

Onyx is not signed with an Apple Developer certificate, which costs 99 USD a year, and Onyx is free. macOS puts apps downloaded without that signature in “quarantine” and refuses to open them. The `xattr -cr` command only removes that flag from Onyx; it does not change any security setting on your Mac.

If macOS still refuses, go to **System Settings → Privacy & Security**, scroll to the bottom, press **Open Anyway** and confirm.

## Updates

Onyx tells you inside the app when a new version is out and takes you to the download page. To update, download the new `.dmg`, replace the app in **Applications** and run the `xattr -cr` command again. Your data is kept.

## Maia 3 on a Mac

The human-like bots use Maia 3, which Onyx installs for you from **Engines → Recommended engines**:

- **Apple Silicon:** needs macOS 14 (Sonoma) or later.
- **Intel:** uses PyTorch 2.2.2, the last release built for Intel Macs.
