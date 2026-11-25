---
title: Install on Linux
description: How to install Onyx Chess Lab on Linux x64 with the AppImage or the .deb package.
---

Onyx publishes two formats for Linux x64. Both are on the [download page](../../download/).

## AppImage (recommended)

Runs on almost any distribution, with nothing to install.

1. Download `Onyx.Chess.Lab_X.Y.Z_amd64.AppImage`.
2. Make it executable and run it:

   ```bash
   chmod +x Onyx.Chess.Lab_*_amd64.AppImage
   ./Onyx.Chess.Lab_*_amd64.AppImage
   ```

If it does not start, **FUSE 2** is probably missing. On Ubuntu 24.04 and derivatives:

```bash
sudo apt install libfuse2t64
```

On older releases the package is called `libfuse2`.

## .deb package

For Debian, Ubuntu and derivatives:

```bash
sudo apt install ./Onyx.Chess.Lab_*_amd64.deb
```

## Updates

Onyx tells you inside the app when a new version is out. Download the new AppImage or `.deb` and replace the old one; your data is kept.

## Maia 3 on Linux

Onyx installs Maia 3 for you from **Engines → Recommended engines**. It needs glibc 2.28 or newer (Ubuntu 20.04, Debian 10, Fedora 29 or later) and uses the CPU-only build of PyTorch, so no CUDA libraries are downloaded.
