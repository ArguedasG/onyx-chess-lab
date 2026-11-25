---
title: Instalar en macOS
description: Cómo instalar Onyx Chess Lab en un Mac con Apple Silicon o Intel y abrirlo por primera vez.
---

## Qué archivo descargar

Abre el menú Apple → **Acerca de esta Mac**:

- si dice **Chip Apple M1, M2, M3…**, descarga el archivo **Apple Silicon** (`_aarch64.dmg`);
- si dice **Procesador Intel**, descarga el archivo **Intel** (`_x64.dmg`).

Los dos están en la [página de descarga](../../download/).

## Instalación

1. Abre el `.dmg` y arrastra **Onyx Chess Lab** a la carpeta **Aplicaciones**.
2. Abre **Terminal** (en Aplicaciones → Utilidades) y ejecuta:

   ```bash
   xattr -cr "/Applications/Onyx Chess Lab.app"
   ```

3. Abre Onyx desde **Aplicaciones**.

## Por qué hace falta ese comando

Onyx no está firmado con un certificado de Apple Developer, que cuesta 99 USD al año, y Onyx es gratis. macOS pone en «cuarentena» las apps descargadas sin esa firma y se niega a abrirlas. El comando `xattr -cr` solo le quita esa marca a Onyx; no cambia ningún ajuste de seguridad de tu Mac.

Si macOS sigue sin abrirla, ve a **Ajustes del Sistema → Privacidad y seguridad**, baja hasta el final, pulsa **Abrir igualmente** y confirma.

## Actualizaciones

Onyx te avisa dentro de la app cuando hay una versión nueva y te lleva a la página de descarga. Para actualizar, descarga el `.dmg` nuevo, reemplaza la app en **Aplicaciones** y repite el comando `xattr -cr`. Tus datos se conservan.

## Maia 3 en Mac

Los bots humanos usan Maia 3, que Onyx instala por ti desde **Motores → Motores recomendados**:

- **Apple Silicon:** necesita macOS 14 (Sonoma) o posterior.
- **Intel:** usa PyTorch 2.2.2, la última versión publicada para Mac con Intel.
