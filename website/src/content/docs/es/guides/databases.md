---
title: Bases de datos
description: Descarga bases ya preparadas o convierte tus PGN, y busca partidas por jugador, evento o posición.
---

Las bases de datos son tus colecciones de partidas. Además de consultarlas directamente, alimentan el explorador de aperturas del tablero, los informes de aperturas, la preparación contra rivales y las fichas de jugadores.

## Añadir una base

En **Bases de datos**, pulsa el botón **+** (Agregar nuevo). Se abre **Agregar base de datos** con dos pestañas.

### Web: bases ya preparadas

Muestra el catálogo de bases listas para usar, con su tamaño y número de partidas. Pulsa **Instalar** y Onyx la descarga en tu carpeta de bases. Las [fuentes recomendadas](../../resources/free-resources/) explican de dónde viene cada una y su licencia.

### Local: tus archivos PGN

1. Escribe un **nombre** y, si quieres, una descripción.
2. Elige el **archivo PGN**.
3. Pulsa **Convertir**.

Onyx importa las partidas, crea los índices y finaliza la base. Puedes seguir usando la app mientras tanto: la base aparecerá en la lista cuando esté lista.

## Buscar partidas

Abre una base para ver sus partidas, jugadores y torneos. Puedes filtrar por jugador, evento, fecha, resultado o rating, y buscar por **posición**:

- **exacta:** partidas que pasan por esa posición concreta;
- **parcial:** partidas donde aparecen las piezas que marcas, estén donde estén las demás.

La búsqueda usa un índice propio pensado para bases de más de diez millones de partidas, y la lista de resultados se carga por páginas para que la app siga respondiendo.

## Informes de aperturas

Desde una posición, Onyx puede generar un informe con estadísticas, teoría, órdenes de jugadas y transposiciones. Se puede exportar a **HTML** o **PGN**.

## Dónde se guardan

Las bases se guardan como archivos `.db3` (SQLite) en tu carpeta de bases, dentro de **Documentos/Onyx Chess Lab**. Puedes cambiar esa carpeta en **Configuración**; Onyx te ofrece mover su contenido al hacerlo.
