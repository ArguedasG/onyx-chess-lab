---
title: Install on Windows
description: How to install Onyx Chess Lab on Windows 10 and 11, and what to do if SmartScreen shows a warning.
---

## Requirements

- Windows 10 or 11, 64-bit (x64).
- Free space for the app and for the databases and engines you download.

## Installation

1. Download the installer `Onyx.Chess.Lab_X.Y.Z_x64-setup.exe` from the [download page](../../download/).
2. Open it and follow the installer.
3. Open **Onyx Chess Lab** from the Start menu.

## If you see “Windows protected your PC”

The installer is not yet signed with a Windows certificate, so **SmartScreen** may show a warning the first time. It does not mean the file is damaged.

1. Press **More info**.
2. Check that the file is called `Onyx.Chess.Lab_..._x64-setup.exe`.
3. Press **Run anyway**.

:::note
The Windows installer is planned to be signed through SignPath Foundation's free program for open-source projects. Once it is, the warning will fade as the installer builds reputation. More in the [signing policy](../../project/signing-policy/).
:::

## Updates

On Windows, Onyx updates itself: when a new version is out, it shows the notes and installs it in one click. Updates are **signed**, and Onyx rejects any file whose signature does not match.

## Uninstall

In **Settings → Apps → Installed apps**, find Onyx Chess Lab and press **Uninstall**. Your databases and files in **Documents/Onyx Chess Lab** are not deleted.
