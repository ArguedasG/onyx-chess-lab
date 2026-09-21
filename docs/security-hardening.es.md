# Endurecimiento de seguridad y calidad

Estado: implementado y validado automáticamente el 2026-09-19; requiere la comprobación manual
nativa indicada al final.

## Alcance

- Los comentarios y anotaciones PGN se procesan como Markdown sin HTML crudo. El subrayado `++texto++`
  se conserva mediante una transformación estructurada y los enlaces solo admiten HTTP o HTTPS.
- La aplicación declara una CSP de producción y otra de desarrollo. No se habilitan scripts remotos.
- Las capacidades de escritura del plugin de archivos se limitan a las seis operaciones utilizadas.
  Los directorios elegidos por el usuario siguen siendo compatibles.
- La telemetría comienza desactivada en instalaciones nuevas y PostHog no se inicializa mientras el
  usuario no la habilite. Una preferencia previa explícitamente activada se conserva.
- En Windows, Onyx intenta mantener una copia adicional del token de Lichess cifrada con DPAPI para
  el usuario actual. El token también permanece en la sesión persistida: esta compatibilidad es
  deliberada porque un fallo de DPAPI no debe dejar visible una cuenta que el explorador considere
  no autenticada. La copia segura nunca bloquea el inicio de sesión ni el cierre de la cuenta.
- Cada autenticación Lichess crea CSRF, PKCE, puerto y servidor nuevos; rechaza intentos simultáneos,
  expira en cinco minutos y termina después del callback válido.
- Las descargas requieren HTTPS; HTTP solo se admite para direcciones loopback locales sin token.
  Nunca envían un token a un host distinto de `lichess.org`, limitan redirecciones y rechazan archivos
  o extracciones de tamaño anómalo, enlaces de archivo y rutas no normalizadas.
- GitHub Actions ejecuta frontend y Rust por separado. Las acciones se fijan por SHA y Rust ejecuta
  formato, Clippy y sus pruebas en Windows.

## Decisiones conservadoras

- No se cambia todavía `org.encroissant.app`: hacerlo sin migración podría separar a los usuarios de
  sus datos existentes. Se mantiene como deuda explícita para la Fase 9.
- El alcance de rutas de archivos y del protocolo de recursos no se reduce a una carpeta fija porque
  Onyx admite bases, motores, imágenes y documentos escogidos por el usuario. Antes de estrecharlo
  más se necesita una autoridad nativa de rutas persistentes.
- No se refactorizan de una vez los módulos grandes. Se extrajo el cálculo de estadísticas tácticas
  como primer límite puro y cubierto por pruebas; las siguientes divisiones deben hacerse de la misma
  forma para evitar regresiones y cambios de rendimiento.

## Rendimiento

Ningún control nuevo se ejecuta dentro del análisis del motor, consultas de posiciones o bucles de
partida. DPAPI se consulta únicamente al iniciar y al cambiar una cuenta. Las comprobaciones de
descarga se realizan durante un flujo que ya recorre cada bloque o entrada. El bundle JavaScript de
producción se redujo al retirar el procesador de HTML crudo.

## Validación manual necesaria en Windows

1. Abrir una partida con comentarios Markdown, subrayado y un fragmento HTML; Markdown y subrayado
   deben verse, pero el HTML no debe crear elementos activos.
2. Iniciar sesión con Lichess, cerrar y volver a abrir Onyx. La sesión y los informes remotos deben
   continuar funcionando. Después, eliminar la cuenta, reiniciar y confirmar que no reaparece.
3. Repetir un inicio de sesión cancelándolo y otro dejándolo expirar; un intento posterior debe poder
   completarse normalmente.
4. Descargar una base, un set de problemas y un motor ZIP habituales, y confirmar su instalación.
5. Abrir una imagen local, una carpeta, importar/exportar PGN y guardar un informe para comprobar la
   CSP y las capacidades de archivos.
6. Activar telemetría, reiniciar y desactivarla de nuevo; la preferencia debe conservarse.
