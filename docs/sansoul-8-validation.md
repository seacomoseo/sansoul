# Validación de SanSoul 8.0.0

Cierre local del 16 de octubre de 2026, macOS ARM64, Hugo Extended 0.168.0,
Node 22.22.3 y pnpm 10.28.2. Proyecto y motor declaran compatibilidad 8.0.0;
`sh do migrations check` no muestra migraciones pendientes.

- `sh do check`: 64 pruebas correctas, sintaxis, prebuild, producción, imágenes
  y configuración CMS, sin advertencias. Tras la última corrección focal,
  pasaron las 15 pruebas de vídeo y preview y otro build de producción.
- La revisión independiente corrigió el lookup de vídeos con rutas codificadas.
  La regresión cubre espacios, Unicode, signos `+`, escapes, overrides y rutas
  inválidas; también pasó con el binario mínimo Hugo 0.164.0 preservado.
- Un clon Git recursivo desde orígenes temporales inicializó `core`, conservando
  el nombre interno histórico del submódulo. La instalación congelada reutilizó
  27 paquetes y descargó cero. Producción pasó también sin FFprobe disponible,
  usando la caché versionada. Esto no demuestra disponibilidad de los cambios
  pendientes en GitHub.
- El consumidor generó 44 archivos HTML y 143 bloques JSON-LD válidos. El ejemplo
  copiable compiló con 69 divisores y su esquema CMS conservó las opciones de
  flechas, `table_columns` y `bulk_edit`. Los títulos, párrafos e imágenes de las
  nuevas páginas se comprobaron en el HTML visible, excluyendo scripts.
- En un `dev` real del clon, reemplazar un vídeo actualizó caché y HTML de
  180 × 320/PT1S a 320 × 180/PT2S conservando el PID de Hugo. SIGINT cerró el
  proceso con 130 y eliminó salidas y bloqueo.
- En navegador, ambos reproductores locales conservaron los atributos
  180 × 320 y la duración de un segundo. La miniatura mantuvo sus propias
  dimensiones 1024 × 1024; sustituirla por el vídeo no cambió las cajas medidas:
  1200 × 2133,328125 en vertical y 1200 × 1200 con ratio 1/1. Sin errores ni
  advertencias de consola en esa página.
- El backend oficial de prueba de Sveltia confirmó título, resumen, selección de
  imagen, título de caja y adición/eliminación/reordenación de secciones sin
  guardar. El iframe conservó su URL durante esas ediciones y sirvió HTML de
  un snapshot estático. La [guía del preview](cms-live-preview.md) registra sus
  límites y el fallo de «Duplicar» observado en el CMS.

La versión inicial tenía errores reales que las pruebas detectaron: wrappers
históricos descartaban argumentos, formas ambiguas de YAML podían corromperse,
las demos usaban una composición incompleta y el puente de mensajes no tenía en
cuenta el iframe intermedio de Sveltia. Se corrigieron y añadieron regresiones.
La fecha local de creación se guarda como `dateCreated`, sin inventar
`uploadDate`; los refrescos conservan overrides y sustituyen hechos obsoletos.

Los avisos de opciones ignoradas por Sveltia ya existían en el esquema previo.
No se autenticó GitHub, guardó contenido real, descargó vídeo externo, midió
PageSpeed ni validó infraestructura Linux/Netlify/Cloudflare. La consulta YouTube
con credencial propia no se ejercitó contra una cuenta; sus respuestas y fallos
se cubren con fixtures, y oEmbed sí se resolvió en los ejemplos.

Evidencia temporal inspeccionable:

- `/private/tmp/sansoul-v8-20261015/`: logs finales, captura y datos del preview,
  medidas de reproducción y copias de los índices Git originales.
- `/private/tmp/sansoul-v8-consumer-20261015/`: clon, informe independiente,
  instalación congelada, ejemplos y watcher real.

Los índices y los commits originales de ambos repositorios se conservaron. Los
cambios están en la rama `codex/markdown-video-preview`, sin staging, commits,
push ni despliegues. Los archivos temporales no son un backup permanente.

## Ajuste posterior de paddings, sin cambio de versión

El 16 de octubre se sustituyeron `pt_vs`/`pb_vs` por el esquema base
`pt`/`pb` y grande `pt_vl`/`pb_vl`, con fallback simétrico. Por indicación de Loren
no se añadió migración ni se cambió la versión. Se corrigió además el fallback
CSS ausente que impedía aplicar algunos márgenes superiores negativos sin divisor.

La validación se ejecutó en copias aisladas porque el consumidor tenía un
servidor de desarrollo activo: **66/66 pruebas**, producción y ejemplo copiable
correctos, sin advertencias de build. La regresión de paddings cubre 14 casos;
las mediciones del navegador a 360, 800 y 1280 px confirman extremos,
interpolación, cero, negativos, null, footer y ocultación del padding. El esquema
CMS generado contiene los cuatro nombres nuevos y ningún nombre anterior.

Una entrada en el backend virtual de Sveltia se guardó y reabrió con `pt: -1.5`,
`pt_vl` vacío, `pb: 0` y `pb_vl: 4`. Los valores leídos del formulario persistido
se reprodujeron en un fixture compilado: el extremo superior grande heredó
`-1.5` y el cero inferior se conservó. No se exportó ni se afirma haber compilado
el archivo serializado interno del backend virtual. El CMS emitió inicialmente
un aviso de descarga de traducción y funcionó con su interfaz en inglés.

Portada y galería de 69 divisores se comprobaron a 390 y 1280 px, sin
desbordamiento ni errores de consola. Evidencia temporal:
`/private/tmp/sansoul-padding-20261016/`. El servidor original se mantuvo activo.

## Vídeo, preview de colecciones y recursos compartidos — 16 de octubre

Antes de la siguiente fase de grupos visuales: `sh do check` aislado completó
83/83 pruebas y el build del consumidor; los ajustes finales de foco pasaron
21/21 pruebas de preview/Markdown y otro build completo del consumidor.
El pipeline de recursos pasó con Hugo 0.164 y 0.168 y el ejemplo copiable;
la concatenación de segmentos conserva exactamente la cascada del CSS completo.

Chrome con Sveltia 0.245.1 verificó borrador de blog heredado, título, cuerpo,
las tres formas de get, listas con iconos, botones, tablas, SVG remoto y
iframes YouTube/Vimeo. Guardar y reabrir se hizo exclusivamente en el backend
de prueba OPFS. El clic en una caja plegada alcanzó el campo
`tpl.sections.1.params.boxes.0.title`; evidencia temporal en
`/private/tmp/sansoul-media-preview-20261016/cms-nested-focus.jpg` y `.json`.
Los tamaños naturales y explícitos de vídeo se comprobaron en desktop y
móvil (390 px), con reproducción local y consola limpia.

No se comprobó un despliegue Git/CI real ni Search Console. Los avisos de DNS
de Google Fonts y el fallback local se registraron aparte; no se ejecutó
PageSpeed. La demo sintética carece de uploadDate real, por lo que su
VideoObject se omite con un aviso. Se actualizó la caché raíz mediante
`sh do videos` cuando no había servidor/lock activo.

## Grupos plegables del CMS — 16 de octubre

Se retiraron `view`, su import SCSS y el helper de placeholders. La configuración
publicada sigue plana, con pertenencia declarada por `cms/group`; el adaptador
usa `object`, formatos y `preSave` públicos. Se conserva el `view` geográfico.
No se migraron los archivos de contenido existentes.

La revisión independiente detectó y se corrigieron defaults compuestos,
configuración efectiva de idiomas, extensiones, arrays anidados del generador
y omisión de valores. Un guardado inicial del navegador reveló vacíos
sintetizados y otro `weight: null` añadido por Sveltia; ambos se corrigieron.

`sh do check` en un consumidor aislado completó **123/123 pruebas** y el build
con los archivos realmente obtenidos del CMS. El último ajuste del parser para
resolver merges YAML pasó otras **40/40 pruebas focales** y builds completos
del consumidor (Hugo 0.168) y de los ejemplos canónicos (Hugo 0.164). El corpus
incluyó 26 archivos de páginas, tipos y secciones con el evento de guardado.
`pnpm install --frozen-lockfile` pasó con pnpm 10.28.2 y yaml 2.9.1.

Chrome y Sveltia 0.245.1, backend oficial de prueba: abrir, editar un título
agrupado, guardar, reabrir y reordenar cajas produjo YAML semánticamente idéntico
a la fuente salvo los cambios previstos. Se conservaron ausencia, null, cadena
vacía, false, cero, listas/objetos vacíos, claves desconocidas, `view` antiguo,
cajas anidadas, modal y cuerpo Markdown. Una sección YAML real (`faq.yml`) se
editó con `pt: 2`, se guardó y reabrió con el valor correcto; su salida coincidió
exactamente en valores con la fuente más ese cambio. Ambos archivos obtenidos
del serializador real del CMS se compilaron con Hugo. No quedaron claves
virtuales ni referencias temporales en ellos; consola sin errores.

El observador temporal del fixture captura únicamente la salida de la API
pública del formatter; no lee OPFS ni estado interno. Evidencia local temporal:
`/private/tmp/sansoul-groups-20261016/` (`browser-roundtrip-final.json`,
`browser-reordered-final.json`, `browser-section-final.json`,
`cms-groups-final.png`, `verified-check.log`, `browser-saved-build.log`).
Las ediciones de prueba no tocaron las fuentes del consumidor ni Git.

La API no permite distinguir operaciones internas que serialicen sin `preSave`.
El adaptador rechaza esos guardados de documentos existentes para evitar
pérdida; se puede usar `params.cms_groups: false` para esas operaciones. Esto
está documentado como límite, no validado como cobertura total del CMS. Los
comentarios y el formato textual del YAML pueden normalizarse al guardar.
Índices Git y HEAD de los dos repositorios permanecieron intactos.

## Shorts, metadatos editables e imágenes Markdown — 17 de octubre

La consulta pública de YouTube solicita `player` con límites de tamaño y
guarda únicamente la proporción cuando devuelve ambas medidas. No convierte
el tamaño del reproductor en resolución original. Las entradas antiguas se
enriquecen una vez si aparece una clave de Data API. Sin proporción conocida,
una URL `/shorts/` recibe el respaldo vertical 608 × 1080; dimensiones reales,
proporción cacheada y póster explícito conservan prioridad. El Short añadido
por Loren en el hero se verificó en el DOM con esas dimensiones verticales.

Los seis parámetros `vid_*` están documentados, presentes como campos opcionales
en la configuración generada y mantienen lectura de los alias anteriores.
Chrome/Sveltia 0.245.1 guardó y reabrió los metadatos de una caja de una sección
existente en el backend de prueba: `vid_upload: '2025-01-01 00:00:00'` y, en
otro guardado, `'2025-01-01 12:34:56'`. Los campos permanecieron hermanos en YAML.
La comparación conservó los demás valores salvo un salto final del texto
Markdown, normalizado por Sveltia; no se afirma identidad textual o de ese
carácter. Se compiló el archivo obtenido del serializador real. La prueba Hugo
con zona `Europe/Madrid` confirmó que la fecha sin zona se interpreta como UTC
y se emite `2025-01-01T00:00:00Z`.

El editor Markdown mostró iconos Material Symbols, marca, emoji y texto dentro
del propio campo. Se eligieron PNG desde la biblioteca en imagen en línea,
galería y galería simple; esta última conservó la selección múltiple. Se guardó
el borrador únicamente en el backend de prueba. La subida automatizada quedó
bloqueada por el permiso «Allow access to file URLs» de la extensión; no se
modificó ese permiso ni se da la subida por verificada. La consola no registró
errores durante la comprobación final del CMS.

`sh do check` completó **129/129 pruebas** y el build del consumidor con Hugo
0.168, incluyendo YAML real guardado por el CMS. La primera ejecución restringida
falló en cuatro pruebas de watchers con `EMFILE`; la repetición autorizada fuera
del sandbox pasó. El ejemplo canónico compiló con Hugo 0.164. Hubo avisos de DNS
de Google Fonts en el ejemplo, con fallback local, y avisos previstos de
VideoObject sin publicación real. No se ejecutó PageSpeed ni un despliegue.
No había clave de YouTube disponible: el nuevo camino Data API se verificó con
respuestas simuladas y documentación oficial, no con una consulta autenticada.
Una revisión independiente no encontró problemas bloqueantes.

Evidencia temporal: `/private/tmp/sansoul-video-cms-20261017/`, incluidos
`check-verified.log`, `example-hugo164.log`, `browser-date-save.json`,
`browser-date-seconds-save.json`, `cms-date-saved.png` y `cms-icons-media.png`.
Las pruebas usaron copias aisladas y el servidor de desarrollo de Loren siguió
activo; no se modificaron sus datos con los guardados del navegador.

## Auditoría general y entrega de recursos — 17 de octubre

La segunda tanda añadió inserción de CSS autocontenido de hasta 1 KiB en su
posición de cascada, carga diferida del receptor de preview y cabeceras para
recursos con hash. Se corrigieron listas por fechas, búsqueda, cargadores,
consentimiento de vídeo/GA4, formularios condicionales, rango, accesibilidad de
menú/FAQ, datos remotos falsy y datos estructurados. Véase el
[informe completo](audit-2026-10-17.md) para cambios, propuestas y límites.

`sh do check` completó **146/146 pruebas** y build con Hugo 0.168 en copia
aislada. El ejemplo canónico compiló con Hugo 0.164. Se comprobaron 112 archivos
JavaScript y 92 dependencias sin vulnerabilidades conocidas según `pnpm audit`.
El corpus público de 42 HTML, 2 XML y 9 SVG pasó los controles propios de parseo,
referencias locales, IDs, imágenes y JSON-LD. Nu se ejecutó también sobre CSS y
SVG: detectó un selector de archivo incorrecto que se corrigió, pero conserva
diagnósticos de sintaxis moderna; no se declara conformidad W3C completa.

La matriz visual de esta tanda sigue pendiente. El navegador denegó el origen
local por permiso persistente incluso después de que Loren autorizara las
pruebas. No se usaron otras superficies para eludirlo. No hay PageSpeed, prueba
real de Rich Results, despliegue ni verificación de indexación de esta versión.
Las pruebas anteriores del CMS no sustituyen esa revisión visual. Tampoco se
ha obtenido el ratio mediante una llamada autenticada a YouTube: falta una
clave disponible en el entorno. El TTL se verificó con respuestas simuladas y
no programa renovación ni purga el historial Git.

Evidencia temporal: `/private/tmp/sansoul-audit-20261017/`, especialmente
`check-final.log`, `consumer-final-build.log`, `example-hugo164.log`,
`site-audit.json`, `vnu-typed.json` y `dependencies-audit.json`.

## Comprobación autenticada de YouTube y caché persistente — 17 de octubre

Se creó una clave estándar restringida a YouTube Data API en un proyecto sin
cuenta de facturación vinculada. Se probó el generador real con dos IDs públicos
en una copia temporal: ratios 16:9 y 3:4, duración y publicación obtenidas, sin
avisos. Una segunda ejecución reutilizó el JSON sin acceder a la red. La clave
se pasó por entorno, quedó fuera de Git y no apareció en el JSON. El fixture de
metadatos se eliminó después de verificarlo. Esto sustituye el límite anterior
de no haber probado una llamada autenticada; no verifica resolución original.

Por petición posterior de Loren se retiraron la renovación y purga por edad.
La caché ahora permanece por ID hasta un refresco explícito; los reintentos de
fallos y el enriquecimiento inicial con Data API se mantienen. La prueba focal
cubre datos de 2020, ausencia de fecha, entradas no referenciadas, un año sin
consultas, refresco manual, overrides y fallo de red. La norma externa de Google
sigue documentada; no se afirma conformidad por conservar datos indefinidamente.
No se instaló un workflow de GitHub ni se contactó con Hermes.

Se volvió a intentar abrir el mismo origen local después de recibir acceso
completo de terminal. La herramienta mantuvo la denegación por permiso guardado.
La documentación oficial localiza el control en ChatGPT > Ajustes > Uso del
ordenador > Administrar junto al navegador > sitios bloqueados. No se intentó
eludirlo mediante otra dirección, superficie o motor.

El cambio de caché persistente pasó de nuevo `sh do check`: **146/146 pruebas**
y build completo con Hugo 0.168 en el consumidor aislado. El ejemplo canónico
compiló con Hugo 0.164. Evidencia adicional: `check-persistent-cache.log` y
`example-persistent-cache-hugo164.log` en la carpeta temporal de auditoría.
La revisión CSS independiente no confirmó errores adicionales entre 30 familias
de diagnósticos CSS de Nu; mantiene pendiente su comprobación en navegadores.
