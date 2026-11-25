---
title: Motores
description: Instala Stockfish y Maia 3 desde la app o añade cualquier motor UCI a mano.
---

Onyx funciona con cualquier motor **UCI**. Para empezar, la app instala por ti los dos que más se usan:

| Motor | Para qué sirve | Tamaño |
| --- | --- | --- |
| **Stockfish** | Análisis, evaluaciones y la fuerza y el estilo de los bots | ~80 MB |
| **Maia 3** | Bots, torneos y gemelos que juegan como personas | ~660 MB |

## Instalación guiada

Abre **Motores → Motores recomendados** (o el paso «Instala los motores» de los [primeros pasos](../../start/first-steps/)) y pulsa **Instalar los dos**, **Instalar Stockfish** o **Instalar Maia 3**.

Maia 3 se instala dentro de la carpeta de datos de Onyx, con su propio Python, PyTorch y el modelo Maia3-5M: no necesitas Python en el sistema. Requisitos fuera de Windows x64:

- **Mac con Apple Silicon:** macOS 14 (Sonoma) o posterior.
- **Mac con Intel:** se usa PyTorch 2.2.2, la última versión para Intel, con un pequeño módulo de compatibilidad que añade Onyx.
- **Linux x64:** glibc 2.28 o posterior. Se instala la versión de PyTorch solo para CPU.

:::tip[Después de actualizar]
Si Onyx detecta que Maia 3 necesita repararse (por ejemplo, tras mover la carpeta de datos), lo avisa en **Motores** con el botón **Reparar Maia 3**.
:::

## Otros motores

En **Motores → Otros motores…** está el catálogo completo, que incluye Lc0 (la versión CUDA necesita una tarjeta gráfica NVIDIA).

## Añadir un motor a mano

Si la instalación guiada falla (por ejemplo, sin internet o detrás de un cortafuegos):

1. Descarga Stockfish para tu sistema desde [stockfishchess.org/download](https://stockfishchess.org/download/) y descomprímelo.
2. En **Motores**, pulsa **+** (Agregar nuevo) y elige la pestaña **Local**.
3. Selecciona el ejecutable de Stockfish dentro de la carpeta descomprimida.
4. En macOS, si el sistema dice que no puede verificar al desarrollador, ve a **Ajustes del Sistema → Privacidad y seguridad** y pulsa **Abrir igualmente**, o ejecuta `xattr -cr` sobre la carpeta descomprimida.

Cualquier otro motor UCI se añade igual. En **Argumentos del ejecutable** puedes pasar un argumento por línea.

## Maia 3 a mano

En sistemas sin instalación guiada, Maia 3 se puede instalar con Python 3.10 o posterior. En Linux, instala primero PyTorch solo para CPU para evitar varios GB de librerías CUDA:

```bash
python3 -m venv ~/maia3
~/maia3/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
~/maia3/bin/pip install "maia3 @ https://github.com/CSSLab/maia3/archive/1e13597c42d4858b7cfd7cfdae01e297263364b2.zip"
~/maia3/bin/maia3-cache --model maia3-5m
```

Después añade `~/maia3/bin/maia3-5m` como motor local con estos argumentos:

```text
--use-uci-history --seed {{randomSeed}} --temperature 1.0 --multipv 1 --device cpu --no-use-amp
```
