---
title: Instalar en Linux
description: Cómo instalar Onyx Chess Lab en Linux x64 con AppImage o con el paquete .deb.
---

Onyx publica dos formatos para Linux x64. Los dos están en la [página de descarga](../../download/).

## AppImage (recomendado)

Funciona en casi cualquier distribución, sin instalar nada.

1. Descarga `Onyx.Chess.Lab_X.Y.Z_amd64.AppImage`.
2. Dale permiso de ejecución y ábrelo:

   ```bash
   chmod +x Onyx.Chess.Lab_*_amd64.AppImage
   ./Onyx.Chess.Lab_*_amd64.AppImage
   ```

Si no abre, probablemente falte **FUSE 2**. En Ubuntu 24.04 y derivadas:

```bash
sudo apt install libfuse2t64
```

En versiones anteriores, el paquete se llama `libfuse2`.

## Paquete .deb

Para Debian, Ubuntu y derivadas:

```bash
sudo apt install ./Onyx.Chess.Lab_*_amd64.deb
```

## Actualizaciones

Onyx te avisa dentro de la app cuando hay una versión nueva. Descarga el AppImage o el `.deb` nuevo y reemplaza el anterior; tus datos se conservan.

## Maia 3 en Linux

Onyx instala Maia 3 por ti desde **Motores → Motores recomendados**. Necesita glibc 2.28 o posterior (Ubuntu 20.04, Debian 10, Fedora 29 o más recientes) y usa la versión de PyTorch solo para CPU, así que no descarga librerías de CUDA.
