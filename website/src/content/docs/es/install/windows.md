---
title: Instalar en Windows
description: Cómo instalar Onyx Chess Lab en Windows 10 y 11, y qué hacer si aparece el aviso de SmartScreen.
---

## Requisitos

- Windows 10 u 11 de 64 bits (x64).
- Espacio libre para la app y para las bases y motores que descargues.

## Instalación

1. Descarga el instalador `Onyx.Chess.Lab_X.Y.Z_x64-setup.exe` desde la [página de descarga](../../download/).
2. Ábrelo y sigue los pasos del instalador.
3. Abre **Onyx Chess Lab** desde el menú Inicio.

## Si aparece «Windows protegió su PC»

El instalador todavía no está firmado con un certificado de Windows, así que **SmartScreen** puede mostrar un aviso la primera vez. No significa que el archivo esté dañado.

1. Pulsa **Más información**.
2. Comprueba que el archivo se llama `Onyx.Chess.Lab_..._x64-setup.exe`.
3. Pulsa **Ejecutar de todas formas**.

:::note
Está previsto firmar el instalador de Windows con el programa gratuito de SignPath Foundation para proyectos de código abierto. Cuando ocurra, el aviso irá desapareciendo a medida que el instalador gane reputación. Más detalles en la [política de firma](../../project/signing-policy/).
:::

## Actualizaciones

En Windows, Onyx se actualiza desde la propia app: cuando hay una versión nueva, muestra las notas y la instala con un clic. Las actualizaciones van **firmadas**, y Onyx rechaza cualquier archivo cuya firma no coincida.

## Desinstalar

En **Configuración → Aplicaciones → Aplicaciones instaladas**, busca Onyx Chess Lab y pulsa **Desinstalar**. Tus bases y archivos en **Documentos/Onyx Chess Lab** no se borran.
