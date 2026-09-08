# Fase 5.2 — Canal estable de actualizaciones de Onyx

Fecha: 2026-09-07. Alcance inicial: Windows x64, NSIS, un único canal estable y GitHub Releases
público en `ArguedasG/onyx-chess-lab`. macOS y Linux permanecen pendientes de Fase 9.

Estado al 2026-09-07: `v0.15.2` se construyó y firmó en GitHub Actions, se publicó como transición y
se instaló manualmente. El usuario validó el caso «sin actualización» contra el feed público. El
cierre del P0 continúa pendiente de la prueba real `0.15.2 → 0.15.3` y las pruebas negativas.

## Contrato del canal

- La aplicación consulta únicamente
  `https://github.com/ArguedasG/onyx-chess-lab/releases/latest/download/latest.json`.
- La comprobación se hace al iniciar una build de producción. El menú **Buscar actualizaciones**
  permite repetirla manualmente.
- Una actualización disponible muestra versión y notas. No descarga nada hasta que el usuario
  confirma; durante la descarga muestra bytes y tamaño total cuando el servidor lo informa.
- Tauri verifica obligatoriamente la firma antes de instalar. Windows usa el modo pasivo de NSIS y
  reinicia la aplicación después de actualizar.
- Los fallos automáticos de red al iniciar solo se registran. Una comprobación manual sí muestra el
  error al usuario.
- El identificador `org.encroissant.app` se conserva durante la transición para no mezclar el canal
  nuevo con una migración de datos. Su sustitución tendrá una prueba independiente.

## Clave y secretos

La clave privada se genera cifrada fuera del repositorio. Nunca se añade a Git, a un issue, a un log
ni a este documento. La clave pública sí se incorpora a `src-tauri/tauri.conf.json`.

Los siguientes secretos ya están configurados en **GitHub → Settings → Secrets and variables →
Actions**:

1. `TAURI_SIGNING_PRIVATE_KEY`: contenido completo del archivo privado generado por Tauri.
2. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: contraseña de esa clave.

Debe existir al menos un respaldo cifrado fuera del equipo de desarrollo. Perder la clave impediría
firmar nuevas actualizaciones aceptadas por las instalaciones existentes; exponerla permitiría a un
atacante firmar un paquete malicioso.

La copia de trabajo local se conserva fuera del repositorio, con acceso restringido, en
`C:\Users\50662\Documents\Onyx Chess Lab Secrets`. Ese directorio contiene la clave privada, la
clave pública y la contraseña en archivos separados y debe respaldarse en otro medio cifrado antes de
publicar la transición. Ninguno de esos archivos debe añadirse a Git.

## Flujo de release

1. Ejecutar pruebas, typecheck, lint, auditorías y build local.
2. Confirmar que `package.json` y `src-tauri/Cargo.toml` tienen la misma versión.
3. Crear y subir el tag `vX.Y.Z` únicamente desde el commit aprobado.
4. GitHub Actions construye Windows x64 NSIS, firma el artefacto y genera `latest.json`.
5. La release queda como borrador. Revisar versión, notas, instalador, `.sig`, `latest.json` y hashes.
6. Instalar el candidato manualmente en el equipo de prueba y publicar la release solo al aprobarlo.
7. Tras publicarla, comprobar **Buscar actualizaciones** desde la versión anterior y después el
   arranque de la versión instalada.

## Transición y validación obligatoria

- `0.15.2` es la transición que los usuarios instalan manualmente; incorpora el canal firmado de
  Onyx y conserva sus datos actuales.
- `0.15.2` está publicada e instalada; la comprobación manual devuelve correctamente que Onyx está
  actualizado cuando el feed anuncia la misma versión.
- `0.15.3` debe demostrar el recorrido completo `0.15.2 → 0.15.3`
  antes de considerar cerrado el P0.
- Probar: sin actualización, actualización aceptada, cancelación antes de descargar, red caída,
  metadatos inválidos, firma incorrecta, paquete ajeno, conservación de datos y reapertura.
- Conservar el instalador manual de la última versión válida. La primera implementación no promete
  rollback automático.

La firma del actualizador protege la procedencia del paquete, pero no sustituye un certificado de
código de Windows para reputación de SmartScreen. Ese certificado es una decisión de distribución
separada.
