# Fase 5.3.1 — Instalación administrada de Maia 3

Fecha: 2026-09-07. Estado: implementada para Windows x64; pendiente de validación manual desde un
ejecutable empaquetado y una instalación limpia.

## Experiencia de usuario

En **Motores → Descargar**, Onyx muestra una tarjeta propia de **Maia 3 5M** antes del catálogo
remoto. En Windows permite:

- ver versión, licencia, procedencia, fuerza seleccionable, tamaño instalado aproximado y espacio
  temporal requerido;
- instalar Maia sin tener Python, Git o PowerShell configurados;
- seguir el progreso y cancelar;
- registrar automáticamente el motor, sus argumentos, el modelo local y la semilla aleatoria;
- reparar una instalación incompleta, dañada o administrada con versiones anteriores;
- desinstalar solo la copia administrada por Onyx.

La primera instalación suele tardar entre 5 y 15 minutos según la conexión, el disco y el antivirus.
Una vez descargados los componentes, la comprobación final debería durar menos de un minuto; en el
equipo de desarrollo tardó aproximadamente 4,8 segundos.

Las instalaciones Maia añadidas manualmente siguen siendo independientes y nunca se eliminan al
desinstalar la copia administrada.

## Componentes fijados

La primera entrega usa CPU y fija cada componente reproducible:

| Componente          | Versión o revisión                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Maia 3              | `0.1.0`, commit `1e13597c42d4858b7cfd7cfdae01e297263364b2`                                                                      |
| Modelo Maia3-5M     | revisión `b6559de2398d7140b985f28fd2c19fb5e47ddabe`; SHA-256 `ba14208b2992d85502f5fb501934abf6aaaeb355e9f3fdf90e326911f562524f` |
| Python administrado | CPython `3.11.16`                                                                                                               |
| uv de arranque      | `0.12.10`, archivo Windows x64 con SHA-256 fijado                                                                               |

El instalador descarga `uv` desde su release oficial, verifica su SHA-256, crea un Python y un
entorno virtual privados, instala Maia y dependencias con versiones bloqueadas y almacena el modelo
oficial en una caché exclusiva. También verifica el SHA-256 publicado para ese checkpoint. Al
terminar elimina el bootstrap y la caché de instalación; conserva solo los aproximadamente 660 MB
necesarios para ejecutar Maia. Durante el proceso se recomiendan
aproximadamente 1.500 MB libres.

La limpieza de las decenas de miles de archivos temporales se aísla mediante un cambio de nombre
atómico y continúa en segundo plano. Así no mantiene la interfaz detenida cerca del final. Si la
aplicación se cierra durante esa limpieza, Onyx la reanuda al volver a consultar la instalación.

La ruta es `<directorio de motores>/managed/maia3`. Un manifiesto y un marcador de propiedad impiden
que las operaciones de reparar o desinstalar actúen sobre una carpeta que Onyx no reconoce como
propia.

## Verificación y uso sin red

Antes de registrar el motor, Onyx ejecuta `uci`, `isready` y `quit` y exige recibir `uciok` y
`readyok`. Los argumentos registrados fijan la revisión del modelo, su caché privada y
`--local-files-only`; por tanto, una partida normal no vuelve a descargar pesos ni depende de la red.

La opción `--use-uci-history` y una semilla nueva en cada inicio conservan la integración existente
con bots humanos, partidas normales, Finales y el Generador de partidas modelo. El ELO mostrado es
el objetivo solicitado a Maia, no una fuerza calibrada por Onyx.

## Licencias y procedencia

- Maia 3: código oficial de `CSSLab/maia3`, licencia AGPL-3.0.
- Maia3-5M: repositorio oficial `UofTCSSLab/Maia3-5M` en Hugging Face; antes de redistribuir un
  paquete autocontenido debe revisarse también la ficha/licencia vigente del modelo.
- uv: release oficial de Astral; descarga verificada antes de ejecutarse.
- CPython, PyTorch y las demás dependencias conservan sus licencias propias. Esta entrega las
  descarga desde sus fuentes de distribución y no las incorpora al instalador NSIS de Onyx.

## Validación

La prueba técnica previa reprodujo una instalación completa sin Python del sistema: descargó el
Python administrado, instaló las dependencias fijadas, almacenó Maia3-5M y superó `uciok` y
`readyok`. Antes de marcar la fase como validada faltan estos casos desde una build de Onyx:

1. instalación limpia desde **Motores** y uso en Jugar;
2. selección en un bot humano, Finales y Generador de partidas modelo;
3. cancelación durante descarga y reparación posterior;
4. cierre/reapertura con Maia todavía registrado;
5. desinstalación sin afectar un Maia añadido manualmente;
6. mensaje comprensible con red caída o espacio insuficiente;
7. repetición desde el ejecutable NSIS publicado.

macOS y Linux continúan pendientes de Fase 9.

## Incidencia corregida durante la primera validación

El primer intento real descargó correctamente Python, las dependencias y el checkpoint, pero quedó
visible cerca del 97 % mientras Windows borraba de forma síncrona más de 38.000 archivos de caché.
La cancelación tampoco podía terminar hasta concluir ese borrado, por lo que **Reparar instalación**
permanecía temporalmente deshabilitado. No era necesario esperar 10–15 minutos en esa fase final.

La corrección hace tres cambios:

- muestra el texto completo de las insignias y evita que los `Badge` se encojan hasta `…`;
- cambia el rótulo a **Verificando Maia…** a partir del tramo final;
- reutiliza el ejecutable y modelo íntegros después de una interrupción y mueve la limpieza pesada a
  segundo plano.

El segundo intento expuso otro defecto exclusivamente en la comprobación final. La configuración
persistida usa `{{randomSeed}}`, que el lanzador normal sustituye por un número al iniciar una partida,
pero el validador lo enviaba literalmente a `--seed`. Maia terminaba con código 2 antes de emitir
`uciok`. El validador comparte ahora la misma resolución de argumentos que el lanzamiento normal,
usa una semilla determinista para el smoke test y muestra tanto `stdout` como `stderr` si vuelve a
fallar.
