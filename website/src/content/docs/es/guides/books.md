---
title: Libros
description: Lee tus libros de ajedrez en PDF junto al tablero, convierte sus diagramas en posiciones y abre las partidas impresas en el texto.
---

**Libros** es un lector de PDF pensado para el ajedrez: el libro a la izquierda y un tablero a la derecha. Los diagramas y las partidas del libro dejan de ser imágenes y texto y pasan al tablero, donde puedes analizarlos con el motor.

## Tu biblioteca

Añade tus PDF desde **Libros** o arrastrándolos a la ventana. Onyx guarda la ruta del archivo y una huella para reconocerlo, nunca una copia. Si mueves un archivo, **Localizar el archivo…** lo vuelve a encontrar.

La biblioteca muestra las portadas, permite buscar y recuerda dónde te quedaste en cada libro con **Continuar leyendo**.

## Leer

Al abrir un libro ves dos columnas: el PDF y una columna de estudio con un tablero grande, la notación y las herramientas del tablero de análisis.

- **Ctrl + rueda** cambia el zoom.
- El modo **Diagramas** marca los diagramas de las páginas visibles, y las flechas te llevan al anterior o al siguiente.
- Los libros largos no se cargan enteros: solo se dibujan las páginas que ves.

## De un diagrama al tablero

**Haz doble clic en un diagrama** y el tablero se pone en esa posición. Si el texto indica a quién le toca mover o el número de jugada, Onyx lo lee también.

Funciona con diagramas incrustados como imagen y con páginas escaneadas. Si alguna casilla es dudosa, se abre el editor con esas casillas en rojo para que las revises: Onyx nunca presenta como segura una lectura dudosa.

El reconocedor funciona sin conexión y **aprende de tus correcciones en cada libro**. Después de corregir unas cuantas casillas, los siguientes diagramas de ese libro salen mejor. Lo aprendido se queda en tu computadora y se puede olvidar desde el menú del lector. Cómo está hecho el reconocedor se explica en [Arquitectura](../../technical/architecture/).

## Abrir una partida del texto

**Haz doble clic en una jugada del texto** y la línea hasta esa jugada pasa al tablero, partiendo del diagrama de encima, del tablero o de la posición inicial.

- Entiende la notación en inglés, español y alemán, y también los figurines.
- Sigue las variantes entre paréntesis y las partidas que continúan en la página siguiente.
- Si una jugada no se puede jugar, se marca en rojo en la página y el tablero se queda en la anterior.

En los PDF digitales casi todas las líneas se abren bien. En los escaneados depende de la calidad del texto reconocido.

## Posiciones desde una imagen

Fuera de los libros, el editor de posición tiene **Desde imagen**: abre, pega o arrastra una captura de Chess.com, Lichess, un vídeo o un PDF y conviértela en una posición.
