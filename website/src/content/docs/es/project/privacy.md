---
title: Privacidad
description: Qué datos guarda Onyx, a qué servicios se conecta y cuándo. Sin telemetría ni analítica.
---

Onyx no recoge datos de uso, no tiene analítica ni telemetría y no exige una cuenta. Tus partidas, bases, perfiles y entrenamientos se guardan en tu computadora.

## Qué guarda Onyx y dónde

- **Documentos/Onyx Chess Lab:** tus bases, motores, puzzles y archivos.
- **La carpeta de datos de la aplicación:** configuración, entrenamientos, historial y el entorno de Maia 3.

Nada de esto sale de tu equipo salvo que tú lo exportes o lo compartas.

## Conexiones automáticas

Onyx solo se conecta a internet por su cuenta en estos casos:

| Cuándo | A dónde | Para qué |
| --- | --- | --- |
| Al abrir la app | GitHub (`github.com`, `api.github.com`) | Comprobar si hay una versión nueva |
| Al abrir los catálogos de descargas o los primeros pasos | GitHub (`raw.githubusercontent.com`), donde Onyx publica su catálogo | Obtener la lista de bases, puzzles y motores disponibles |

Estas peticiones solo envían lo que cualquier petición web incluye (tu IP y la versión de Onyx en el agente de usuario).

## Conexiones que tú inicias

Las demás conexiones ocurren solo cuando usas una función que las necesita:

- **Descargas** de bases, puzzles, motores y Maia 3, desde el servidor de cada archivo (GitHub, los autores de cada motor, PyPI, PyTorch, Hugging Face y otros).
- **Lichess y Chess.com**, si conectas una cuenta, importas partidas, usas el explorador o las tablas de finales de Lichess.
- **Evaluaciones en la nube** (ChessDB) y **ratings FIDE**, si los consultas.

Si conectas Lichess, el token se guarda en tu equipo (en Windows, cifrado con la protección de datos del sistema) y solo se envía a Lichess.

## Este sitio web

El sitio está alojado en GitHub Pages. No usa cookies, analítica ni fuentes de terceros. GitHub puede registrar datos técnicos de las visitas según su [declaración de privacidad](https://docs.github.com/es/site-policy/privacy-policies/github-general-privacy-statement). La página de descarga solo consulta la API de GitHub desde tu navegador si no pudo obtener la última versión al construirse el sitio.
