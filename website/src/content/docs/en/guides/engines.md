---
title: Engines
description: Install Stockfish and Maia 3 from the app, or add any UCI engine by hand.
---

Onyx works with any **UCI** engine. To get started, the app installs the two most used ones for you:

| Engine | What it is for | Size |
| --- | --- | --- |
| **Stockfish** | Analysis, evaluations and the strength and style of the bots | ~80 MB |
| **Maia 3** | Bots, tournaments and twins that play like people | ~660 MB |

## Guided installation

Open **Engines → Recommended engines** (or the “Install the engines” step of the [first steps](../../start/first-steps/)) and press **Install both**, **Install Stockfish** or **Install Maia 3**.

Maia 3 is installed inside Onyx's data folder, with its own Python, PyTorch and the Maia3-5M model: you do not need Python on your system. Requirements outside Windows x64:

- **Apple Silicon Macs:** macOS 14 (Sonoma) or later.
- **Intel Macs:** PyTorch 2.2.2, the last release for Intel, is used together with a small compatibility module that Onyx adds.
- **Linux x64:** glibc 2.28 or newer. The CPU-only build of PyTorch is installed.

:::tip[After an update]
If Onyx finds that Maia 3 needs repairing (for example, after the data folder moved), it says so in **Engines** with a **Repair Maia 3** button.
:::

## Other engines

**Engines → Other engines…** shows the full catalog, including Lc0 (the CUDA build needs an NVIDIA graphics card).

## Add an engine by hand

If the guided installation fails (for example, offline or behind a firewall):

1. Download Stockfish for your system from [stockfishchess.org/download](https://stockfishchess.org/download/) and unzip it.
2. In **Engines**, press **+** (Add New) and choose the **Local** tab.
3. Select the Stockfish executable inside the unzipped folder.
4. On macOS, if the system says the developer cannot be verified, go to **System Settings → Privacy & Security** and press **Open Anyway**, or run `xattr -cr` on the unzipped folder.

Any other UCI engine is added the same way. **Executable arguments** takes one argument per line.

## Maia 3 by hand

On systems without guided installation, Maia 3 can be installed with Python 3.10 or newer. On Linux, install the CPU-only PyTorch first to avoid several GB of CUDA libraries:

```bash
python3 -m venv ~/maia3
~/maia3/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
~/maia3/bin/pip install "maia3 @ https://github.com/CSSLab/maia3/archive/1e13597c42d4858b7cfd7cfdae01e297263364b2.zip"
~/maia3/bin/maia3-cache --model maia3-5m
```

Then add `~/maia3/bin/maia3-5m` as a local engine with these arguments:

```text
--use-uci-history --seed {{randomSeed}} --temperature 1.0 --multipv 1 --device cpu --no-use-amp
```
