# Vista previa visual experimental del CMS

La vista previa está activada de forma predeterminada en las colecciones de contenido `content/<tipo>/*.md`, tanto en desarrollo como en producción. Abre `/admin/`, edita una entrada y muestra su panel de vista previa. No necesita un parámetro en la URL ni `params.cms_live_preview`; esa opción de la antigua prueba local ya no controla la integración.

El panel abre la página real compilada por Hugo y le aplica el borrador sin guardar. Hugo conserva la fusión de `data/types/all.yml`, el tipo, las secciones reutilizables y la página. El cliente no vuelve a implementar esa composición. El aviso superior recuerda que es experimental y puede haber diferencias con el resultado publicado.

La integración fija Sveltia CMS **0.245.1**, incluida la URL de sus chunks, para
validar las APIs de Markdown y `data-key-path` con una versión reproducible.
No mezcla un bundle principal antiguo en caché con módulos de otra versión.

## Campos y Markdown

Los componentes de título, subtítulo, precio, Markdown e imagen que Hugo ya ha renderizado incluyen vínculos a sus campos de origen. Los `get` de las plantillas enlazan el campo de página correspondiente; los valores locales falsos o vacíos siguen recuperando los globales del idioma, igual que Hugo. Si varios `get` alimentan el mismo componente, gana el último con valor no vacío; el clic sigue el campo que está aportando ese valor. El patrón exacto `md: '{{% content %}}'` enlaza el cuerpo Markdown de la entrada con el campo `body`. Los campos directos dentro de `tpl.sections[].params.boxes[]`, incluidas sus cajas anidadas, conservan su ruta de edición.

El Markdown del borrador usa el analizador `window.marked` que [Sveltia documenta](https://sveltiacms.app/en/docs/api/rendering-markdown), con un renderer DOM de SanSoul. Aproxima los reemplazos de texto, iconos —también en listas—, encabezados, enlaces y botones con color/tipo/tamaño/fuente, tablas y medios. Reconoce `{{ get campo }}`, `{{% get campo %}}` y `{{< get campo >}}`. No ejecuta otros shortcodes ni HTML escrito por el autor. Las plantillas heredadas que dependen de otros shortcodes conservan su HTML compilado por Hugo; si un `get` deja de aportar un override, recuperan ese HTML. Si Marked no está disponible, conserva el texto del borrador sin interpretarlo.

Las imágenes pueden ser locales, remotas HTTP/HTTPS o archivos sin guardar resueltos con `getAsset()`. El contenedor conserva la proporción explícita. El Markdown genera una versión sencilla de `figure`, `.img`, `picture` e `img`, sin derivados ni `srcset`; los SVG se muestran como imagen. También muestra archivos de vídeo con controles y enlaces de YouTube/Vimeo mediante iframes construidos a partir de sus identificadores. No reproduce la lógica completa de posters, mute, galerías ni optimización de medios de Hugo.

El receptor carga los estilos completos y la fuente de iconos solamente dentro de la sesión de vista previa, para que los nuevos botones y medios del borrador no dependan de los componentes detectados en la página publicada. Reutiliza el helper de iconos del CMS para Material Symbols, emoji, texto, marcas y SVG.

## Páginas, idiomas y estructura

El índice público del CMS relaciona cada archivo con su URL real de Hugo, incluidos los permalinks e idiomas. Para entradas nuevas todavía sin página compilada se usa una página publicada del mismo tipo e idioma, o del idioma predeterminado si no existe otra; el aviso indica explícitamente que se está usando una estructura de ejemplo. Si no existe ningún modelo de ese tipo, se explica que hay que publicar la primera entrada.

Se mantiene la estructura que Hugo compiló. Añadir, quitar o reordenar secciones/cajas, cambiar `file`, condiciones `if`, diseño, `remap`, consultas de colecciones o bloques especializados requiere recompilar. No se genera HTML de ramas ocultas ni se evalúan condiciones en el navegador. Un campo que no tiene un componente visible en el HTML compilado no adquiere uno al rellenarlo. Cambiar o retirar un override de diseño puede seguir mostrando el layout anterior hasta publicar.

Hacer clic en un componente enlazado envía su ruta al documento nativo de vista previa. Allí se utiliza el atributo [`data-key-path` documentado por Sveltia](https://sveltiacms.app/en/docs/api/preview-templates#linking-to-the-edit-pane), que delega en el editor la localización y apertura de campos anidados. Los reintentos son acotados y se cancelan ante otro clic. Si el campo todavía no está montado, se desplaza su grupo usando `data-key-path` y roles semánticos antes de volver a pedir el foco; no se manipulan estados internos de Svelte ni botones del editor. Los bloques heredados de archivos de datos que no corresponden a un campo de la entrada no tienen un destino de edición local.

## Transporte y límites

Cada iframe tiene un token aleatorio creado por el CMS. El receptor exige estar dentro del iframe registrado de esa sesión, el origen del CMS y su ventana emisora exacta; el token se añade automáticamente a la URL interna. Visitar directamente una página publicada, incluso copiando esa URL, no aplica borradores ni bloquea enlaces o formularios. Durante una sesión autenticada, los enlaces y formularios del iframe no navegan ni envían datos.

El mensaje contiene datos estructurados acotados: profundidad máxima de 24, 500 elementos por lista/mapa, 20.000 nodos, 100.000 caracteres por texto y un millón en total. Rechaza claves de contaminación de prototipos y valores no serializables. No interpreta datos como HTML. Solo admite esquemas de medio HTTP/HTTPS y blobs del origen; rechaza JavaScript, data URLs y blobs ajenos. Los únicos iframes creados por el renderer son de YouTube y Vimeo en sus hosts fijos.

Los manifiestos contienen parámetros públicos de la página y sus globales localizados. Como el resto de las fuentes consumidas por Hugo y el CMS, estos archivos nunca deben contener secretos. El iframe comparte el origen de confianza del sitio y el CMS; no aísla código malicioso que ya estuviera instalado en ese origen.

## Estado de publicación

Guardar en el CMS crea un cambio; la web se actualiza cuando termina su
construcción y despliegue. [Sveltia lo muestra de forma nativa](https://sveltiacms.app/en/docs/workflows/deploy-previews)
junto al enlace para ver la entrada, asociando el estado al commit guardado.
Funciona con los backends Git compatibles y su CI conectado; Cloudflare Pages
puede aportar el estado mediante checks y Netlify mediante estados/despliegues.
SanSoul ya genera `site_url` y `preview_path`; no se añade un sondeo paralelo.
`backend.preview_context` permite elegir un proveedor si hay varios estados.

El indicador de `/admin/info/` resume la construcción del sitio, pero no
identifica qué cambio de una entrada está publicado. Se conserva y se añade
esta distinción. El backend local de prueba no tiene commits ni CI: permite
validar el editor, pero no comprobar estados reales de Cloudflare o Netlify.

## Comprobación aislada

Las pruebas de transporte y renderer se ejecutan con:

```sh
node --test core/scripts/tests/live-preview.test.js core/scripts/tests/preview-markdown.test.js
```

Después de compilar una copia temporal del proyecto se puede crear un snapshot con el [backend oficial de prueba de Sveltia](https://sveltiacms.app/en/docs/backends/test):

```sh
node core/scripts/tests/browser-preview-fixture.js /private/tmp/sansoul-preview-browser /ruta/a/la/copia/temporal
python3 -m http.server 13143 --bind 127.0.0.1 --directory /private/tmp/sansoul-preview-browser
```

Abre `http://127.0.0.1:13143/admin/` y elige iniciar la demo. El snapshot sustituye el backend únicamente en su configuración temporal y añade el manifiesto de seed. Las ediciones quedan en el sistema virtual del navegador; no modifican el repositorio ni GitHub. Verifica título, Markdown, imagen remota/local, vídeo y clic en un campo dentro de objetos plegados; prueba también una página traducida y otra colección con herencia de tipo.
