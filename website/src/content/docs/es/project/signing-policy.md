---
title: Política de firma de código
description: Cómo se construyen, aprueban y firman los instaladores de Onyx Chess Lab.
---

:::note[Estado]
La firma de código de Windows con SignPath Foundation **todavía no está activa**. Hasta entonces, el instalador de Windows no lleva firma Authenticode; las actualizaciones dentro de la app sí van firmadas con minisign (ver abajo).
:::

Firma de código gratuita proporcionada por [SignPath.io](https://about.signpath.io/), certificado de [SignPath Foundation](https://signpath.org/), en cuanto el proyecto sea aceptado en su programa para código abierto.

## Qué se firma

Solo los archivos que publica este proyecto, construidos a partir de su [código fuente público](https://github.com/ArguedasG/onyx-chess-lab):

- El instalador de Windows (`Onyx.Chess.Lab_X.Y.Z_x64-setup.exe`) y, cuando se firme, el ejecutable de la app que incluye.

## Cómo se construye

- Cada versión se construye en **GitHub Actions** a partir de una etiqueta de versión del repositorio, con el workflow público [`release.yml`](https://github.com/ArguedasG/onyx-chess-lab/blob/main/.github/workflows/release.yml).
- Nunca se firman compilaciones hechas en una computadora personal.
- Las dependencias se instalan desde los registros oficiales con archivos de bloqueo versionados (`pnpm-lock.yaml`, `Cargo.lock`).

## Roles

| Rol | Personas |
| --- | --- |
| Autores y revisores | [Gabriel Arguedas](https://github.com/ArguedasG) |
| Aprobadores | [Gabriel Arguedas](https://github.com/ArguedasG) |

Cada solicitud de firma se aprueba **manualmente** por cada versión. Las contribuciones externas se revisan antes de entrar a la rama principal. Las cuentas con permisos usan autenticación de dos factores.

## Actualizaciones

Independientemente de la firma de Windows, el actualizador de Onyx verifica una firma **minisign** de cada instalador antes de instalarlo. La clave privada solo está disponible para el workflow de publicación.

## Privacidad

Onyx no transfiere información a otros sistemas en red salvo cuando el usuario lo pide, con dos excepciones automáticas: la comprobación de versiones nuevas y la descarga de los catálogos de descargas. El detalle está en la [política de privacidad](../privacy/).

## Contacto

Para reportar un problema de seguridad o un archivo firmado sospechoso, abre un [issue en GitHub](https://github.com/ArguedasG/onyx-chess-lab/issues).
