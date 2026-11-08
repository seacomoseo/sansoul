# Manual de un proyecto SanSoul

Este es el manual humano compartido para el repositorio que consume SanSoul. Vive dentro de `core/` para distribuirse con el motor, pero los comandos y rutas parten de la raíz del proyecto. Los consumidores existentes también pueden conservar `themes/sansoul/`.

Para la arquitectura interna del tema, consulta [`core/README.md`](README.md). Las instrucciones operativas se generan directamente en el `AGENTS.md` raíz desde `core/templates/root/AGENTS.md`; no son una traducción de este manual.

## Principios del proyecto

- La raíz contiene la configuración, el contenido y las personalizaciones de un sitio concreto.
- `core/` contiene el motor compartido y es un submódulo Git.
- Se priorizan los datos y la composición de secciones frente a los overrides de layouts.
- Los README se dirigen a personas y están escritos en español; los AGENTS se dirigen a agentes y están escritos en inglés. Se actualiza solo el documento cuya audiencia o contrato haya cambiado.
- No se deben incluir credenciales ni secretos en archivos rastreados: el contenido del sitio, la configuración generada del CMS y los parámetros de Hugo pueden terminar publicados.

## Requisitos e instalación

Necesitas Git y Hugo Extended. Para desarrollar sin `node_modules` en cada
proyecto, instala Dart Sass una sola vez en el `PATH`
(`brew install sass/sass/sass` en macOS). Node.js se requiere para los servidores
administrados y el build completo; `sh do build` instala las dependencias ausentes
con el gestor del proyecto. Las versiones de despliegue se fijan en
`.node-version`, `netlify.toml` y `wrangler.toml`.

```sh
git clone --recurse-submodules <url-del-repositorio>
cd <carpeta-del-proyecto>
sh do dev
```

Si el repositorio ya estaba clonado:

```sh
git submodule update --init --recursive
```

Solo debes usar `git submodule add https://github.com/seacomoseo/sansoul.git core` al crear un repositorio nuevo que aún no tenga la entrada de SanSoul en `.gitmodules`.

## Comandos principales

Ejecuta todos los comandos desde la raíz:

| Comando | Función |
| --- | --- |
| `sh do dev` | Vigila sitio y prebuild, con salida en disco y sin generar CMS ni preview. |
| `sh do cms` | Servidor del CMS con salida en disco, invalidación de rutas eliminadas y regeneración atómica del prebuild. |
| `sh do preview --demo` | Prototipo de preview estructural con Hugo persistente en una copia temporal; demo virtual sin escrituras en el proyecto. |
| `sh do local` | Sirve producción en localhost:1313 y repite el build completo al cambiar las fuentes; alias `live`. |
| `sh do build` | Ejecuta la compilación completa y el posprocesado de imágenes. |
| `sh do update` | Actualiza SanSoul, ejecuta migraciones automáticas, regenera README/AGENTS y compila; hace preflight y se detiene ante cambios locales o conflictos. |
| `sh do update --check` | Comprueba el plan y los conflictos sin cambiar archivos ni el commit activo del tema. |
| `sh do migrations` | Muestra las adaptaciones pendientes para la versión instalada del tema. |
| `sh do root-docs` | Genera README/AGENTS raíz desde las plantillas canónicas del tema. |
| `sh do prebuild` | Regenera únicamente la configuración previa requerida por Hugo. |
| `sh do imgs` | Regenera favicon, PNG derivados y variantes AVIF a partir de los manifiestos del build. |

`public/`, `resources/`, `.hugo_build.lock` y `core/prebuild/public/` son salidas generadas. No deben editarse a mano.

`dev`, `cms` y `local` eliminan esas salidas al cerrar con Ctrl-C, SIGTERM, SIGHUP o una
salida normal. Alias: `server` = `dev`, `live` = `local`, `hugo` = `build`.
`sh do` sin argumentos muestra ayuda. Hay un bloqueo por
proyecto: no ejecutes dos servidores administrados ni un build simultáneo en
la misma carpeta; usa copias independientes. SIGKILL, un apagado o un fallo del
sistema no permiten ejecutar la limpieza. El siguiente arranque detecta el
bloqueo abandonado.

### Dependencias compartidas con pnpm

Hugo recomendado: **0.168.0** (mínimo del motor: 0.164.0). La
[comparación y validación de la actualización](docs/hugo-0.168.0.md) recoge los
cambios de seguridad y compatibilidad. Netlify usa `netlify.toml`; el flujo de
esta referencia mantiene sus versiones de Cloudflare Pages en `wrangler.toml`.
Se conservan `HUGO_VERSION=0.168.0` y `PNPM_VERSION=10.28.2` en el consumidor.

Cada repositorio mantiene su propio `package.json` y `pnpm-lock.yaml`. No se
necesita un monorepo ni un workspace compartido. El almacén de contenido de pnpm
reutiliza paquetes entre proyectos, incluidas versiones distintas; el virtual
store estable sigue dentro de `node_modules/.pnpm` de cada proyecto.

En los proyectos convertidos, usa Node y pnpm en las versiones fijadas. Instala
dependencias al clonar o cuando cambie el lockfile; no en cada arranque:

```sh
# Activa previamente Node según .node-version y pnpm según packageManager.
# Diagnóstico opcional: pnpm --version; pnpm store path
pnpm install --frozen-lockfile
sh do dev
sh do cms
sh do build
```

La configuración de referencia fija pnpm 10.28.2 y el virtual store de proyecto.
No cambia configuración global. El almacén debe estar en el mismo sistema de
archivos que los proyectos para aprovechar enlaces o copias CoW. En un entorno
normal, pnpm lo ubica en `~/Library/pnpm/store` en macOS o
`~/.local/share/pnpm/store` en Linux; compruébalo con `pnpm store path`. No borres
ese almacén ni los `node_modules` ajenos para migrar un proyecto.

El modo experimental se prueba por comando con
`pnpm install --frozen-lockfile --config.enable-global-virtual-store=true`.
No es el modo recomendado por defecto y no debe activarse en CI. Hugo 0.166+
restringe symlinks e imports fuera de sus rutas permitidas; el modo global
requiere una validación adicional y no se habilita ampliando permisos generales.
En pnpm 10 la
opción se llama `enableGlobalVirtualStore`; `virtualStoreType` pertenece a
versiones posteriores. Cambiar de modo puede requerir reinstalar el
`node_modules` propio; no compartas una carpeta mutable de dependencias mediante
un enlace a `../_tools/node_modules` entre proyectos con versiones distintas.

El build utiliza el gestor declarado y exige el lockfile de pnpm. Las
migraciones que modifican dependencias actualizan el lockfile de ese gestor
antes de compilar. `sh do update` convierte automáticamente los proyectos npm a pnpm;
ya no es opcional.
Consulta el [informe de pruebas y migración](docs/development-dependencies.md)
antes de convertir otros proyectos.

### Recursos de producción

Los segmentos CSS autocontenidos de hasta 1 KiB se insertan en su posición
original, sin cambiar la especificidad ni la cascada. Para mantener todos como
archivos externos, usa `params.assets_inline_css: false` en `hugo.yml`.

Producción selecciona módulos completos de JavaScript y SCSS según los
componentes renderizados, incluidos los modales ocultos. No elimina estados
dinámicos por no aparecer activos en el HTML. JavaScript comparte módulos ESM
y CSS comparte segmentos contiguos, manteniendo el orden de la cascada. Hay más
peticiones y algo más de transferencia en la primera carga; navegar reutiliza
el código común. Desarrollo mantiene los bundles completos. Las fuentes de texto conservan todos sus pesos y solo precargan los
roles críticos; los binarios idénticos de una familia comparten URL en producción.

Las integraciones personalizadas que no se pueden inferir conservan el modo
completo. Para desactivarlo explícitamente, configura `params.assets_full: true`
en `hugo.yml`. Es un ajuste técnico de integración; no un campo editorial nuevo
del CMS. Consulta el [contrato y mediciones](docs/production-assets.md).

## Estructura del repositorio

### Contenido y datos

- `content/`: contenido traducible.
  - `content/<type>/*.<lang>.md`: entradas de una colección.
  - `content/<type>/_index.<lang>.md`: metadatos y URL de la página índice de una colección.
  - `content/single/_home.<lang>.md`: página de inicio de cada idioma.
  - `content/single/*.<lang>.md`: páginas únicas componibles.
  - `content/page/*.<lang>.md`: páginas simples; algunas tienen una implementación predeterminada en el tema.
  - `content/global.<lang>.yml`: valores globales por idioma, como menú, botones flotantes y pie.
- `data/`: configuración que Hugo fusiona con los valores del tema.
  - `data/config.yml`: comportamiento general, integraciones y CMS.
  - `data/langs.yml`: idiomas y ajustes por idioma.
  - `data/styles.yml`: tipografías, iconos, colores y estilos globales.
  - `data/types/*.yml`: colecciones y plantillas por tipo.
  - `data/section/*.yml`: secciones reutilizables del constructor de páginas.
  - `data/defaults.yml`: valores predeterminados aplicados por idioma, tipo o ruta.
  - `data/customs.yml`: campos de contenido personalizados que también se exponen en el CMS.
  - `data/remote.yml`: fuentes remotas que el Content Adapter transforma en páginas virtuales.
  - `data/redirects.yml`: redirecciones generadas para el despliegue.
  - `data/resources.yml`: recursos que CSS, JavaScript o datos dinámicos usan sin pasar por los layouts; los usos renderizados se agrupan automáticamente.
- `dna/`: identidad, criterios y restricciones particulares del proyecto.
  - `dna/_index.md`: resumen obligatorio e índice que indica qué otros documentos consultar según la tarea.

Desde Hugo 0.164, `y` y `n` son cadenas, no booleanos. En `hugo.yml`,
`content/` y `data/` escribe `true` o `false`; en los campos pseudobooleanos
que administra el CMS, la ausencia o el valor nulo hereda el valor de la
cadena de merges.

### Personalización y archivos públicos

- `assets/_custom.scss`: estilos adicionales incluidos en el CSS final.
- `assets/custom.js`: JavaScript adicional, si existe.
- `assets/robots.txt`: reglas adicionales para rastreadores; el sitemap se incorpora durante el build.
- `assets/llms.txt`: contenido adicional para el archivo `llms.txt` generado.
- `uploads/`: medios originales administrables por el CMS.

`uploads/foo/bar.png` se monta como recurso y como archivo estático. En el contenido se referencia mediante `/u/foo/bar.png`, no mediante `/uploads/...`.

### Recursos dinámicos

Los iconos usados por layouts, shortcodes, render hooks y componentes se registran al renderizar la página. Solo los recursos consumidos indirectamente por CSS, JavaScript o contenido dinámico necesitan declararse en `data/resources.yml`:

```yaml
glyphs: [arrow_forward]
svgs: [svg:base/logo, brand:github]
divs: [waves]
```

En desarrollo (`dev` y `cms`), los SVG se resuelven por página sin agrupar por uso global: cada icono o imagen usa un archivo independiente y cada conjunto local de divisores usa su hoja. Los archivos conservan URLs con hash; las fuentes de símbolos usan el recurso local completo. Esta vía prioriza la respuesta del servidor y no cambia la salida de producción.

En producción, declara aquí solo los recursos que CSS, JavaScript o contenido dinámico usan sin pasar por los layouts. SanSoul detecta los SVG usados por layouts y contenido al renderizar, y agrupa los recursos seguros por el conjunto exacto de páginas que los utiliza. Los iconos usados solo en una página se insertan allí, salvo que esa página ya necesite un sprite para imágenes SVG o divisores; en ese caso comparten ese archivo. Las animaciones se mantienen dentro del documento de cada página; los SVG con IDs en colisión o reglas `<style>` quedan como archivos independientes y se siguen usando con `<use>`.

Los SVG usados como imágenes conservan `<img>`, `alt` y la carga diferida. Imágenes, iconos seguros y divisores que aparecen en las mismas páginas pueden compartir un sprite; cada `<img>` apunta a su vista, mientras los iconos quedan dentro de `<defs>` y no aparecen dentro de ella. Los grupos se calculan automáticamente por conjunto de páginas de uso. Los sprites conservan raíces SVG anidadas, gradientes, referencias internas y animaciones; no se convierten a `<symbol>`. No hace falta declarar grupos manuales.

Las fuentes y los SVG publicados usan SHA-256 truncado a 12 caracteres hexadecimales. En JavaScript, el bundle de cada página expone el mapa `icons` mediante `@params`, con las claves SVG normalizadas existentes y las URLs finales. En CSS se publican propiedades `--sansoul-svg-<id>` con la URL del SVG. Los nombres `brand:` usan los mounts existentes de Font Awesome Brands y Simple Icons.

### ADN del proyecto

`dna/_index.md` es obligatorio y se lee antes de trabajar. Resume la identidad y las restricciones del sitio, enumera los demás documentos de `dna/` y explica cuándo consultar cada uno. Un agente no debe cargar todo el directorio por defecto: lee el índice y abre solo las referencias pertinentes para la tarea. Si el índice falta, está vacío o conserva únicamente los textos orientativos de la plantilla, debe preguntar al usuario cómo definirlo antes de realizar trabajo específico del proyecto.

Utiliza Markdown para las reglas y resúmenes que deban buscarse con facilidad. PDF, imágenes y otros originales pueden convivir como fuentes de apoyo, siempre enlazados desde el índice con una indicación clara de su autoridad. Copy, audiencia, identidad visual, negocio e integraciones son ejemplos, no una estructura obligatoria.

Las particularidades nunca deben añadirse a README/AGENTS raíz porque son generados. `sh do root-docs` crea un índice orientativo cuando falta, pero no copia en él contenido de documentos antiguos. Después, el ADN pertenece exclusivamente al proyecto y no se sobrescribe al sincronizar.

### Operación del proyecto

- `hugo.yml`: URL base y parámetros privados del proyecto —privados en el sentido de específicos, no secretos—.
- `package.json`: dependencias Node utilizadas por Hugo y los scripts de posprocesado.
- `netlify.toml` y `wrangler.toml`: configuración de despliegue.
- `.github/workflows/`: automatizaciones; `backup.yml` replica el repositorio en GitLab. Requiere el secreto `GL_PAT`; GitHub proporciona automáticamente el token temporal de lectura usado para clonar el origen.
- `TODO.md`: lista humana de tareas y anotaciones; los agentes no deben leerla ni modificarla salvo petición expresa.

## El ciclo de construcción

SanSoul usa dos compilaciones de Hugo.

1. El wrapper raíz `do` delega en `core/do`.
2. La preconstrucción ejecuta el sitio Hugo de `core/prebuild/`.
3. Ese sitio combina `hugo.yml`, idiomas, tipos, defaults y metadatos de índices.
4. Publica atómicamente `core/prebuild/public/hugo.prebuild.yml`.
5. La compilación principal carga, en orden, la configuración base del tema, la configuración generada y `hugo.yml`.
6. Los mounts estáticos exponen contenido, datos, uploads, iconos y dependencias; el Content Adapter crea índices de colección y páginas remotas.
7. En producción, el script de imágenes procesa los manifiestos creados por Hugo.

Tanto `sh do dev` como `sh do cms` vigilan las entradas de la preconstrucción, agrupa cambios rápidos y regenera la configuración de forma serial y atómica. Después de una regeneración válida reinicia Hugo y rehace el build completo. Una preconstrucción fallida conserva la última configuración válida; si Hugo cae durante una actualización, el supervisor lo recupera al corregir las entradas. Se actualizan automáticamente al cambiar:

- `data/config.yml`, `data/langs.yml`, `data/defaults.yml` o `data/customs.yml`;
- `data/types/*.yml`, salvo cambios estrictamente internos a `tpl` que Hugo pueda recargar;
- `content/<type>/_index.<lang>.md`, especialmente `prefix`.

Los cambios en `data/remote.yml` y `content/global.<lang>.yml` se reconstruyen directamente dentro del proceso principal de Hugo.

## Markdown, vídeos y vista previa del CMS

Los títulos Markdown usan llaves para los parámetros: `[Texto](/ruta/ "{lock blank}")`
y `![Descripción](/u/imagen.jpg "Leyenda {3/2}")`. El ratio ya no ocupa el texto
alternativo de la imagen. Las dimensiones de presentación usan tokens explícitos:
`![Descripción](/u/imagen.jpg "Leyenda {16/9 w360 h220}")`. Se puede indicar solo
`w360`, solo `h220` o combinarlos con el ratio; el lado que falta se calcula
según ese ratio o la proporción intrínseca. En `box` y `boxes.*` se usan `img_w`
y `img_h`, enteros positivos en píxeles. Si se indican ambas medidas, se usan
ambas. Una imagen remota sin medidas conocidas ni ratio conserva solo el lado
indicado, sin descargarla para calcular el otro. Estos ajustes no modifican los
metadatos reales del vídeo.
El CMS escribe esta sintaxis y el renderizador sigue
leyendo la anterior; la [migración](docs/markdown-metadata.md) convierte las formas
reconocidas sin reescribir código ni contenido ambiguo.

El [sistema de vídeos](docs/video-metadata.md) completa una caché versionable con
FFprobe para archivos locales y las APIs disponibles de YouTube/Vimeo. Puede
extraer el primer fotograma local como poster; no descarga vídeos externos.
`sh do videos` actualiza la caché; los builds lo hacen automáticamente y los
servidores vigilan cambios. El HTML siempre dispone de dimensiones de
presentación, que se mantienen separadas de los metadatos reales. Solo un ratio
escrito por el autor activa `.img--ratio`. El poster usa los tamaños del vídeo.
El schema omite vídeos que carezcan de los datos obligatorios de Google, con
un aviso; no inventa fechas de publicación.
Los ajustes opcionales de cada vídeo son `vid_w`, `vid_h`,
`vid_duration`, `vid_upload`, `vid_title` y `vid_desc`; también se editan desde
el CMS. `vid_width` y `vid_height` siguen como alias de lectura para consumidores
existentes; si la clave nueva tiene un valor no nulo, tiene prioridad. No se reescriben
archivos automáticamente. `vid_upload: '2025-01-01 00:00:00'` se interpreta como UTC.

Con `cookies_legal: true`, GA4 espera «Análisis» y YouTube, Vimeo y Disqus
esperan «Medios». La retirada del permiso detiene los componentes correspondientes.
Con `false` o sin el ajuste, estos componentes cargan sin esperar selección.

Los mapas y los campos geográficos cargan al acercarse a la vista. Leaflet y
Leaflet Draw se sirven desde el propio sitio. El navegador pide las imágenes de
OpenStreetMap o Google mediante CORS anónimo, sin enviar las cookies del proveedor
ni aceptar cookies de esas respuestas. El proveedor recibe la IP y los datos de
la petición de la tesela. La capa inicial depende de la configuración y las otras
capas solo solicitan imágenes cuando se seleccionan. Las coordenadas o figuras
del formulario siguen siendo datos del formulario. Editarlas o borrarlas
actualiza sus campos condicionales.

Si el navegador impide guardar la selección, el banner permanece abierto y no
anuncia una aceptación. Intenta restaurar los valores anteriores si hubo una
escritura parcial; si el almacenamiento también impide borrar o restaurar, no
puede garantizarse una revocación persistida. Retirar una integración tampoco
deshace un SDK ya ejecutado ni las peticiones enviadas antes de la retirada.

La [vista previa visual experimental](docs/cms-live-preview.md) se activa en las
colecciones de contenido, también en producción, sin parámetros manuales en la
URL. Usa la página real compilada por Hugo y actualiza sus campos enlazados sin
guardar, con Markdown aproximado y medios remotos. Hacer clic en un componente
enlazado localiza su campo en Sveltia. Los cambios estructurales y las condiciones
requieren recompilar; no se generan ramas ocultas.

Para probar la recompilación estructural local usa `sh do preview --demo` y abre
`http://127.0.0.1:13164/admin/`. Mantiene Hugo vivo sobre una copia temporal y
recalcula `if/get/remap` al editar, sin guardar en el proyecto. Es experimental:
consulta los límites y la diferencia respecto al CMS alojado en la guía enlazada.

Guardar no significa que el despliegue haya terminado. Sveltia muestra el estado
del cambio junto al enlace a la entrada publicada cuando Git y CI están
conectados. El indicador general de `/admin/info/` no demuestra qué versión de
una entrada está publicada.

La [validación de SanSoul 8](docs/sansoul-8-validation.md) recoge las pruebas
integradas, el clon limpio y las comprobaciones reales del editor y reproductor.

## Idiomas y valores globales

Cada entrada traducible usa el sufijo `.<lang>.md`, por ejemplo `servicio.es.md`. `data/langs.yml` declara los idiomas disponibles; `hide: true` desactiva uno en el proyecto sin borrar su configuración.

`content/global.<lang>.yml` se monta internamente como datos localizados. Sus usos habituales son:

- `menu`: logo, título, subtítulo y navegación personalizada;
- `callnows`: accesos flotantes;
- `footer`: contenido y aspecto del pie;
- cualquier valor propio consumido por `get` o por el shortcode `get`.

## Tipos de página

Un archivo `data/types/<type>.yml` declara una colección. Sus páginas viven en `content/<type>/` y su índice opcional en `content/<type>/_index.<lang>.md`.

Los tipos base reconocidos incluyen `article`, `event`, `product`, `brand`, `author`, `org`, `service` y `page`. Nombres habituales como `blog`, `new`, `category`, `supplier` o `manufacturer` reciben valores i18n predeterminados, pero pueden sobrescribirse por completo.

Tres tipos tienen un papel estructural:

- `all`: defaults de plantilla compartidos por todas las páginas;
- `single`: páginas únicas, cuya composición puede ampliarse en su propio front matter;
- `page`: páginas simples y páginas de sistema como legal, privacidad, cookies, sitemap, búsqueda y CMS.

Si `data/types/all.yml`, `single.yml` o `page.yml` no existen en la raíz, se usan los equivalentes del tema.

Parámetros relevantes de un tipo:

- `base`: familia semántica y de schema;
- `title`, `icon`, `emoji`, `weight`: presentación en CMS e índices;
- `hide`, `noindex`, `body`, `comments`, `rel`: capacidades y valores predeterminados;
- `tax_of`: relaciones entre colecciones;
- `tpl`: composición visual.

## Composición `tpl`

El constructor no depende de un layout distinto por cada página. Fusiona objetos `tpl` y renderiza una lista de secciones.

Prioridad general, de menor a mayor:

1. defaults internos del tema;
2. valores globales por idioma;
3. `data/types/all.yml`;
4. `data/types/<type>.yml`;
5. `content/single/<page>.<lang>.md` para páginas únicas;
6. valores específicos de la página.

Dentro de `tpl`:

- `section`: defaults de secciones. El elemento `0` se aplica a todas; los elementos siguientes se aplican cíclicamente por posición.
- `sections`: lista concreta de secciones que se van a renderizar.
- `bg`, `menu`, `callnow`, `list` y `rel`: configuración compartida de fondo, navegación y listados.

Una base habitual es:

```yml
tpl:
  sections:
  - file: base-_hero
  - file: base-toc
  - file: base-content
  - file: base-address
  - file: base-author
  - file: base-social
  - file: base-comments
  - file: base-children
  - file: base-share
  - file: base-rel
```

Cada `file` carga `data/section/<file>.yml`. Los valores específicos se escriben directamente en el mismo elemento de `sections` (`id`, `color`, `box`, `boxes`, etc.) y tienen prioridad sobre el archivo. En el CMS se muestran en el grupo plegado «Contenido»; ese grupo es sólo visual y no añade una clave al YAML. La raíz puede definir secciones propias o sobrescribir las secciones base del tema con el mismo nombre.

## Secciones, cajas y bloques

La jerarquía de renderizado es:

```text
página → secciones → cajas → bloques o subcajas
```

Los márgenes `mt`, `mb`, `ml`, `mr` de `box` se aplican una vez al
conjunto de `boxes`, también cuando se muestra como carrusel. Las variantes
`*_vl` permiten otro valor en pantallas grandes. Los márgenes ya definidos
directamente en una entrada de `boxes` siguen siendo individuales.

Una sección controla fondo, tamaño, espaciado, separadores, entrada de menú y modales. `boxes` contiene sus cajas y `box` define valores compartidos para ellas. `pt` y `pb` ajustan el padding vertical base; `pt_vl` y `pb_vl` permiten otro valor en viewports grandes. Si solo se define uno de los dos valores de cada lado, se usa en todos los tamaños; si se definen ambos, se interpolan entre pantallas pequeñas y grandes. El cero es un valor explícito. Si faltan ambos, se conservan los valores predeterminados (5 em; el padding superior del footer es 3 em). Como CSS no admite padding negativo, los valores negativos se representan como márgenes exteriores que desplazan la sección o el contenido siguiente.

Las cajas aceptan títulos, Markdown, icono, imagen o vídeo, botón, fondo, distribución y composición recursiva. `class` añade clases CSS al contenedor de la caja; el título conserva sus propias clases. `mt`, `mb`, `ml` y `mr` ajustan sus márgenes base; las variantes `_vl` permiten otro valor en viewports grandes. Admiten valores negativos y se interpolan entre tamaños. Si sólo se define el valor base, se hereda al grande; si sólo se define `_vl`, el pequeño parte de cero. `mt` y `mt_vl` en los defaults de un bloque (`step`, `review`, `gallery`, `faq`, `form`, `geo`, `link` o `list`) sustituyen su separación superior, incluido cero. Si se omiten ambos se conserva la separación automática. Algunas claves activan bloques especializados:

| Clave | Bloque |
| --- | --- |
| `list` | Listado de páginas o relaciones. |
| `steps` | Pasos de un proceso; `step` configura sus defaults. |
| `imgs` / `limgs` | Galería; `gallery` configura el conjunto. |
| `faqs` | Preguntas desplegables; `faq` configura el conjunto. |
| `reviews` | Reseñas; `review` configura el conjunto. |
| `inputs` | Formulario; `form` configura envío y presentación. |
| `geos` | Mapa; `geo` configura vista y capas. |
| `links`, `dots`, `when`, `gss` | Enlaces, redes, horarios y datos tabulares. |
| `boxes` | Subcajas recursivas. |

Los formularios admiten `type: range` con `min`, `max`, `step` y `value`,
incluido el cero. El control tiene etiqueta, valor visible y teclado nativo;
también está disponible en el CMS. `show_if` y `req_if` interpretan `&&` antes
que `||` y tienen en cuenta la opción marcada de los grupos de radio.

SanSoul respeta «Reducir movimiento» del sistema (`prefers-reduced-motion`),
incluso si cambia mientras la página está abierta. Desactiva el desplazamiento
suave, el parallax y el avance automático de carruseles; muestra los contadores
sin animarlos y acorta las transiciones decorativas. Los controles siguen
funcionando y esta preferencia no cambia la reproducción de vídeos ni su
consentimiento. Comprueba también tus animaciones personalizadas con esta
preferencia activada.

Los placeholders y la opción vacía de los selectores heredan el color del
campo sin atenuación adicional. Los formularios sin relleno usan el color
del texto para delimitar sus campos. Los
campos de texto muestran un contorno interior al recibir foco de teclado;
radios y casillas usan un contorno exterior en el color del texto. Comprueba
el contraste de texto, foco y fondo cuando personalices los colores.

`get` obtiene valores de la página o de `content/global.<lang>.yml`. `remap` mueve, copia o elimina rutas de parámetros. `if` condiciona el renderizado. Son herramientas potentes: pruébalas con una página aislada antes de reutilizarlas globalmente.

Los formularios enviados a Google Apps Script asignan un `_submission_id` estable y conservan temporalmente en `localStorage` los envíos sin recibo verificable para reintentarlos. También adjuntan `User Agent` y, cuando el servicio externo responde en 1,5 segundos, la IP pública consultada mediante ipify; un fallo de esa consulta nunca bloquea el formulario. El Apps Script receptor debe persistir el payload antes de responder y devolver el mismo identificador. Documenta este tratamiento y su finalidad en la política de privacidad del sitio.

Para enviar una confirmación al correo facilitado por el usuario únicamente después de aceptar el envío, actívala en la configuración del formulario:

```yml
form:
  confirm:
    enabled: true
```

SanSoul resuelve los textos en el idioma de la página y envía a GAS un único campo oculto `_confirmation` con la configuración ya traducida. `intro` y `notice` aceptan Markdown, que Hugo convierte a HTML y el receptor filtra antes de incluirlo en el correo. `fields` decide si se muestra la tabla con los datos enviados y vale `true` por defecto. Cualquier valor omitido usa la traducción predeterminada:

Los textos también pueden insertar el primer valor de un campo mediante su nombre entre corchetes dobles, por ejemplo `[[Nombre]]`. Un `notice` vacío elimina por completo el aviso final.

```yml
form:
  confirm:
    enabled: true
    fields: false
    subject: Confirmación de inscripción
    intro: |
      Hemos recibido **correctamente** tu inscripción.
    notice: |
      Este es un mensaje automático. Por favor, no respondas a este correo.
```

El receptor duradero mantiene una sola fila por payload en `logs` y registra cada archivo adjunto por separado en `file_logs`. Conserva el JSON completo en `Raw Parameters`; solo crea un archivo de Drive cuando el payload supera el límite seguro de una celda, en cuyo caso esa misma celda contiene el enlace de recuperación. Los reintentos reutilizan el registro y los archivos ya creados; si un mismo `_submission_id` llega con contenido distinto, el receptor conserva ambos payloads y deriva el segundo a revisión. Los clientes antiguos sin identificador reciben uno determinista a partir del payload para que repetir exactamente la misma petición no genere otro registro.

`file_logs` guarda el hash SHA-256 y el enlace del archivo binario. No duplica el base64 de un archivo válido porque ya está conservado dentro de `Raw Parameters`; cuando el archivo no puede procesarse, intenta añadir además un enlace `Recovery Data` al payload base64 independiente. La copia local del navegador protege los envíos modernos mientras no exista un recibo verificable, pero ningún receptor puede prometer persistencia si fallan simultáneamente el navegador, Google Sheets y Google Drive.

Los envíos en `Review` o `Error`, los que permanecen en `Received` durante más de cinco minutos y los aceptados con errores de correo quedan pendientes de revisión administrativa. `retryFailedSubmissionEmails`, ejecutado por el activador periódico de cada spreadsheet, envía a partir de las 09:00 de `Europe/Madrid` un único resumen diario a `info@seacomoseo.com`. El resumen incluye el estado, enlaces, metadatos y una tabla equivalente a la del correo aceptado; los valores demasiado grandes se acortan en el email, pero permanecen completos en `logs`. Solo un error que impida crear el registro duradero se avisa inmediatamente, porque no podría recuperarse para el resumen.

La confirmación puede usar el remitente genérico `no-reply` únicamente cuando el script se ejecuta desde Google Workspace. En cuentas personales de Gmail incluye un aviso de correo automático, pero técnicamente no puede impedir que el destinatario pulse «Responder».

Consulta [`_examples/data/section/example.yml`](_examples/data/section/example.yml) como catálogo comentado y [`_examples/content/blog/2020-01-01-entrada.es.md`](_examples/content/blog/2020-01-01-entrada.es.md) como chuleta de Markdown.

## CMS

SanSoul genera la configuración de Sveltia CMS a partir de los idiomas, tipos, secciones, defaults y campos personalizados. Usa `sh do cms` para trabajar con el editor. `sh do dev` no genera el administrador, sus assets ni los bindings/manifiestos/receptor de preview; mantiene el prebuild necesario para renderizar el sitio. `sh do build` conserva el CMS para el sitio construido. Tras construir, la configuración final se encuentra en `public/admin/config.<hash>.yml` y se enlaza desde `public/admin/index.html`.

Las secciones, modales y cajas usan [grupos plegables](docs/cms-field-groups.md)
con widgets nativos. Los campos siguen siendo hermanos en el YAML; no requieren
migrar contenido. `params.cms_groups: false` permite desactivar el adaptador y
usar campos planos. El antiguo selector `view` ya no se utiliza.

Esa salida es la referencia más precisa para comprobar qué campos ve el editor, pero nunca debe modificarse a mano. En Sveltia CMS los campos son obligatorios de forma predeterminada; usa `required: false` cuando corresponda.

Cuando cambies el modelo de contenido:

1. usa `sh do cms` y espera a que termine la regeneración automática;
2. comprueba que se genera el YAML del CMS;
3. abre `/admin/` y prueba crear o editar una entrada representativa;
4. compila el contenido guardado por el CMS.

## Defaults y campos personalizados

`data/defaults.yml` aplica valores sin repetirlos en cada archivo. Debido a su alcance, una regla demasiado amplia puede cambiar muchas páginas; usa selectores de ruta, tipo e idioma tan específicos como sea posible.

`data/customs.yml` declara campos adicionales. Un campo puede exponerse al CMS y luego consumirse desde una sección mediante `get`. Para rutas anidadas se usa notación de puntos, por ejemplo `example.param`.

## Fuentes remotas

`data/remote.yml` permite generar páginas virtuales durante el build principal desde JSON, YAML, Markdown, CSV u otros recursos. El Content Adapter se vuelve a ejecutar al cambiar la configuración local. La salida es determinista solo si la fuente también lo es. Evita credenciales en URLs, define fallos aceptables de forma explícita y no dependas de una API remota para contenido crítico sin una estrategia de caché o respaldo.

## Overrides del tema

Hugo permite sobrescribir layouts, partials, shortcodes, assets y datos del tema desde la raíz. Úsalo solo cuando la diferencia sea propia de un proyecto. Si la corrección beneficia a todos los sitios, debe hacerse en el submódulo y publicarse como una actualización del tema.

Un override crea una bifurcación silenciosa: documenta el motivo, el archivo original y cómo comprobarlo tras actualizar el submódulo.

## Ejemplos reutilizables

`core/_examples/` es a la vez un sitio de demostración copiable y un conjunto de chuletas. Para poblar un proyecto vacío, copia sus carpetas `data/` y `content/` sobre la raíz después de revisar posibles colisiones. Lee primero su [`README.md`](_examples/README.md).

## Actualizar el tema

El `package.json` del tema declara la versión instalada; el de la raíz declara la última versión con la que el proyecto ya es compatible. Las acciones necesarias para pasar de una a otra se publican en [`MIGRATIONS.md`](MIGRATIONS.md).

También puedes ejecutar el flujo desde la terminal:

```sh
sh do update --check
sh do update
```

`--check` descarga la referencia remota y presenta el plan, pero no cambia archivos ni el commit activo del tema. `sh do update` repite el preflight y, si es seguro, avanza SanSoul, ejecuta las migraciones automáticas conocidas, mueve el motor a `core/` si seguía en `themes/sansoul` (con `git mv`, que hace staging solo de ese movimiento), convierte a pnpm si aún usaba npm, sincroniza `README.md` y `AGENTS.md` desde sus plantillas y compila el proyecto. Se detiene si detecta cambios locales, historial divergente, documentos raíz no generados, una migración desconocida o un destino de renombrado ocupado. No confirma ni publica cambios.

Si quedan validaciones manuales de alguna migración, el comando las muestra y pide confirmación antes de actualizar la versión compatible en `package.json`. Si se ejecuta sin terminal interactiva, conserva la versión anterior; completa esas comprobaciones y ejecuta:

```sh
sh do migrations mark --yes
```

Si el submódulo instalado es demasiado antiguo para incluir `sh do update`, hay que incorporarlo una vez con `git submodule update --remote core`; después se puede ejecutar `sh do update --check` y `sh do update`.

### Archivos README y AGENTS de la raíz

README y AGENTS raíz son archivos genéricos generados íntegramente desde `core/templates/root/`; `sh do update` siempre los sincroniza. Sus cabeceras advierten que no deben personalizarse.

Si README/AGENTS no fueron generados, `sh do root-docs` se niega a sobrescribirlos sin `--force`. Con `--force` los reemplaza íntegramente y descarta su contenido: no intenta interpretarlo ni trasladarlo al ADN. Si falta `dna/_index.md`, crea únicamente el scaffold orientativo. En actualizaciones posteriores puede reemplazar README/AGENTS de forma segura, pero nunca sobrescribe el ADN.

El README raíz es una portada breve que enlaza este manual. El AGENTS raíz contiene el contrato operativo completo para que Codex lo descubra sin lecturas indirectas. Toda particularidad debe vivir en `dna/`, cuyo `_index.md` se lee siempre y dirige hacia los documentos relevantes.

## Despliegue

Tanto Netlify como Cloudflare Pages publican `public/` y ejecutan `sh do build`. Mantén alineadas las versiones de Hugo Extended y Node declaradas por cada plataforma y prueba localmente esas mismas versiones antes de actualizar.

El workflow `.github/workflows/backup.yml` inicializa los submódulos y ejecuta el script de réplica del tema. Sus tokens deben vivir exclusivamente en secretos del proveedor.

## Lista mínima de validación

Antes de dar por terminado un cambio:

1. revisa `git status` en la raíz y dentro del submódulo;
2. ejecuta `sh do build` y comprueba que también finaliza el posprocesado de imágenes;
3. distingue avisos de red de errores reales de plantillas o assets;
4. prueba las páginas afectadas y `/admin/` cuando cambie el modelo de contenido;
5. revisa la página de referencia de separadores indicada en el ADN, si existe, cuando cambies secciones o estilos;
6. verifica enlaces, responsive, accesibilidad básica y consola del navegador;
7. sincroniza la documentación afectada.

## Layout de enlaces y formularios (9.0)

`link` define defaults para `links`: URL, etiqueta, icono, botón, intercambio,
bloqueo y GA4. Los valores individuales tienen prioridad, incluido `false`.
`link.cols`/`cols_vs` y `form.cols`/`cols_vs` eligen columnas; cero conserva
el cálculo automático compartido con cajas. `fit`/`fit_vs` en cada enlace o
campo expresan fracciones de columna. Sin columnas declaradas, fit tiene
base 100 %; `fit: 0.75` con `fit_vs: null` da 100 % en `vs` y 75 % en `vl`.

Los enlaces sin columnas/fit conservan ancho de contenido y `link.align_x`
omiso equivale a `grow`, que reparte el espacio creciendo. Las proporciones
explícitas se respetan; otras alineaciones usan las opciones de `box.align_x`.
En cajas `grow` es optativo, no su nuevo default. Se retiran `inputs.full` y
`links.full`: la migración transforma `true` en `fit: 1`. Los campos de área,
geografía, radios, checks, archivos y encabezados continúan completos salvo
fit explícito. Los campos automáticos usan 280 px como mínimo habitual,
permitiendo encoger una columna estrecha sin desbordamiento.

Los defaults de mapas se llaman `geo` y sus elementos siguen en `geos`; las
clases y el SDK Leaflet conservan sus nombres. Véase [migración 9.0](MIGRATIONS.md).

## Producción en local

`sh do local` (alias `live`) prioriza fidelidad: ejecuta el build completo,
sirve en localhost:1313 y vigila las fuentes para repetirlo. Mientras construye
o hay un fallo devuelve 503 en lugar de mostrar una salida parcial. No inyecta
livereload: recarga el navegador después del build. Ctrl-C/SIGTERM/SIGHUP
eliminan public/resources; sólo un proceso administrado por proyecto.

Para el editor usa `sh do cms`; para iterar rápido sin editor, `sh do dev`.
La evaluación de [plantillas de preview](docs/preview-template-evaluation-2026-10-19.md)
explica por qué un shell HTML por tipo no ejecuta de nuevo la composición Hugo.


## Autoría 10.0: prefijos, iconos y eventos

En los índices de colección, `prefix` define el prefijo de las URLs de fichas;
Hugo sigue recibiendo `permalinks` en el prebuild. `sublock` sustituye
`homefollow` en metadata de enlaces Markdown.

Los enlaces usan `il`/`ir` para iconos izquierdo/derecho. Las cajas conservan
su `icon` propio; su antiguo `pin` pasa a `il`. En reseñas, `il`/`ir`
sustituyen `icon`/`icon_right`. También puedes escribir iconos Markdown en
orden: `[::check:: Texto ::link:: intermedio ::close::](url)`.

`ga4: lead_contact,special_click` solicita ambos eventos. También admite un solo nombre. En Markdown, escribe `[Ejemplo](/ejemplo/ "{ga4:lead_contact,special_click}")`. Los iconos de un enlace o botón se eligen por separado en el editor. La sintaxis es `[::download:: Ejemplo ::brand:github::](/ejemplo/)`. `ga4: none` anula el evento personalizado heredado y se conserva al guardar en el CMS; los eventos automáticos `contact` siguen activos. En Markdown se escribe `{ga4:none}`. Los enlaces
de contacto tipados y los formularios enviados correctamente conservan
además `contact`; el nombre coincidente se envía una sola vez. En un enlace
genérico, el string sólo solicita el evento personalizado. Markdown usa
`[Descargar](url "Título {ga4:descargar_catalogo sublock}")`. No escribas
identificadores personales en nombres o etiquetas. Los eventos respetan la
infraestructura y consentimiento GA4 existentes; configurar eventos clave y
definiciones personalizadas en GA4 corresponde a cada proyecto.

El CMS usa `duplicate_if_empty` por defecto en medios y ofrece esa opción
en campos personalizados. Los grupos Google, locale, CMS, comportamiento e
imágenes de `data/config.yml` son sólo visuales: los campos se guardan planos.

## Imágenes responsive

`imgs_webp: true` selecciona WebP; por defecto se conserva AVIF.
`imgs_quality` (1–100, por defecto60) controla ambos codificadores, aunque un
mismo número no garantiza idéntica calidad perceptual entre formatos.
`imgs_dpr` (positivo, por defecto2) limita la generación según el ancho de
presentación estimable; nunca se amplía el original. `img_sizes` se retira.

La escala compartida parte de150 px y crece ×1,5, más el techo necesario por
uso. El cálculo conserva containers y productos recursivos de columnas;
el fallback interpola entre extremos y descuenta el margen exterior conocido.
Los gaps y paddings arbitrarios de contenido anidado siguen siendo una
estimación conservadora en navegadores sin auto-sizes. Las imágenes lazy
normales usan `sizes="auto, <fallback>"`; las eager usan el fallback explícito.
Sólo la primera imagen eager elegible recibe prioridad alta.

Las imágenes con ratio o disco recortado usan también el fallback explícito,
para evitar que auto-sizes subestime su escala interna.

Los fondos `cover` no usan auto-sizes: estiman la ampliación como el máximo
entre ancho del wrapper y una altura de viewport por la proporción original.
En cajas con `rate` se incluye además la ampliación exigida por su altura
mínima (`ancho / rate`), incluidos los valores implícitos de tarjetas y cajas
vacías. Esto evita subestimar cajas muy altas; no trata el mínimo como una
altura máxima ni reduce la estimación de contenido desconocido.
Para altura de contenido desconocida se conserva el techo original en la
escala. Una sección excepcionalmente más alta que el viewport puede necesitar
el original: ninguna heurística estática conoce todos los contenidos. No hay
JS que cambie tamaños tras iniciar la descarga. Tampoco se introducen recortes
automáticos que puedan eliminar contenido; los ratios expresamente pedidos
por el autor mantienen su recorte anterior.

AVIF se procesa con concurrencia acotada y caché por contenido/dimensiones/
calidad/versión del codificador en `resources/_gen/sansoul-avif`; los resultados
se guardan en caché mediante archivo temporal y renombrado. Las URLs derivadas
distinguen contenido original y calidad, evitando colisiones de basename y
cachés antiguas tras sustituir una imagen. WebP conserva
la caché nativa de Hugo, ahora con calidad explícita.


### Campos personalizados y etiquetas de formularios

En `data/customs.yml`, los hijos de un objeto/lista se declaran con `fields`,
no con `sub`. La migración 11.0.0 conserva las claves de contenido y sólo renombra
la definición del esquema. La clave `widget` sigue siendo la de Sveltia; el partial
interno del motor ahora se llama `cms/field`. Los valores explícitos de i18n y los
defaults false/0 se conservan al compilar campos personalizados. Los medios
individuales usan `duplicate_if_empty` por defecto; los campos de medios con
`multiple: true` usan `i18n: true`, porque Sveltia no admite aquella estrategia
para arrays. Una configuración i18n explícita se conserva.

`inputs.labels` en estilos y `form.labels` por formulario admiten `in`, `out` y
`both`. Con `both`, una etiqueta HTML asociada empieza dentro del campo vacío,
sube al enfocar o tener valor y vuelve al interior al vaciarlo y perder foco.
No se necesita JavaScript para sincronizarla: responde también a valores nativos
y autofill. Selectores y fechas conservan sus controles; rangos, archivos, grupos
y mapas mantienen su presentación específica. Se respeta Reducir movimiento.

En cajas con `side: left/right`, sizes calcula viewport completo bajo el umbral
xl y medio viewport por encima; `side: center` usa el viewport completo. Se ignora
el gap en la estimación de forma conservadora, y se mantienen el límite del
original y el tratamiento cover. La alternancia de `box.sides` se resuelve antes
del cálculo. Se propaga a imágenes, hover, vídeos con poster y fondos. Las reglas
side permiten explícitamente que el contenedor de medios supere el ancho de la
caja; esto no genera derivados mayores que el archivo original.

La [evaluación del modelo de autoría](docs/authoring-model-evaluation-2026-10-21.md)
explica las propuestas de globals por archivos, catálogo de singles y templates.
Son propuestas para revisión, no funcionalidades activas.


### Indicadores de slider

`pips` admite `line`, `dot`, `pill` y `hide`. Con `pill`, el punto activo se
alarga horizontalmente junto con su botón, desplazando suavemente a los
indicadores vecinos mientras el anterior se contrae. Hereda las esquinas
redondeadas o los chaflanes del diseño. La transición se desactiva al solicitar
«Reducir movimiento».
`time` se expresa en segundos; `0` desactiva el avance automático.


### Valores hermanos con set

Una cadena puede interpolar valores escalares de su mismo objeto:

```yml
boxes:
- custom: contacto
  url: '#{{ set custom }}'
  title: Ir al contacto
```

`set` resuelve después de obtener y remapear los valores y de fusionar defaults
con el elemento concreto. No busca en padres ni evalúa código Hugo. Conserva
`0` y `false` al convertirlos en texto; una clave ausente, una referencia a un
objeto/lista o un ciclo produce un error de build con contexto. Los objetos
anidados tienen su propio ámbito de hermanos. La preview estructural requiere
Hugo para recalcular estos valores; la vista alojada no promete resolverlos.


### Defaults de acciones circulares, horarios y hojas

`dot` configura los elementos de `dots`, con los mismos defaults de enlace que
`link` (iconos, URL, etiqueta, botón, consentimiento analítico, columnas/fit) y
`align_x`, `mt`, `mt_vl`. Admite listas antiguas de URLs o mapas de cada elemento;
los valores concretos tienen prioridad. Por defecto los iconos se agrupan al
centro, manteniendo el tamaño del botón de icono incluso con columnas explícitas.

`when` contiene `align_x`, `mt` y `mt_vl`; `whens` contiene los horarios (`days`,
`hours`, `full`). Su reparto predeterminado sigue siendo `grow`. La información
estructurada de organización `org.when` conserva su contrato independiente.

`gss` carga la hoja al aproximarse a la ventana. Si falla la red, vuelve a
intentarlo cuando se aleja y vuelve a entrar en esa zona; una carga completada
se reutiliza en la misma página.

`gss` contiene `id` (archivo publicado), `sheet` (pestaña, incluido cero), `mt`
y `mt_vl`. Sin `id` no se solicita una hoja remota; con él conserva la carga
lazy existente. Véase la migración 13 antes de actualizar consumidores anteriores.

La interpolación `set` limita cada resultado intermedio a 64 KiB y acumula hasta
1 MiB de trabajo de sustitución por objeto efectivo. Comprueba el tamaño antes
de reemplazar tokens repetidos para impedir expansiones multiplicativas.


## Calendario opcional y carruseles continuos

En un bloque `list`, `view: calendar` presenta páginas de base `event` o
`article` por fecha. En un contenedor amplio muestra la cuadrícula mensual y en
uno pequeño un mes compacto con días marcados. El selector de vista permite
mes, año y agenda. El año reúne sus doce meses; los días con eventos usan
mini botones con el estilo y los chaflanes compartidos, y un contador cuando
coinciden varios. Pasar el ratón, enfocar o pulsar un día abre un panel con
todos sus eventos, enlaces y fechas completas. Al retirar el ratón se cierra,
salvo mientras el foco esté dentro o se haya fijado por clic/toque. El panel
permite mover el ratón desde el día hasta sus enlaces. Escape o el botón × lo cierran y
devuelven el foco al día. Los controles recorren los meses o años con entradas; sin
JavaScript se conservan todos los meses y sus enlaces. Los intervalos ocupan una barra continua con el estilo compartido `btn main`
(colores de texto e iconos, esquinas y estados de interacción del botón) desde su fecha
inicial hasta el día final incluido. Se dividen al cambiar de semana y los eventos solapados ocupan filas
independientes. Los días adyacentes visibles de otros meses también muestran
sus eventos; la vista agenda conserva sólo los que afectan al mes seleccionado. En la cuadrícula, los laterales
donde el evento continúa quedan rectos y se desvanecen con una máscara corta;
los extremos reales mantienen las esquinas del botón. La vista agenda muestra
las tarjetas completas, sin ese efecto. El intervalo completo permanece
visible debajo del título con el mismo formato e iconos que las etiquetas de
eventos: una fecha y horas separadas si coinciden los días, inicio/final si no.
Los títulos se muestran completos, con salto de línea; la semana crece para
acomodarlos, sin truncamiento ni puntos suspensivos. Los filtros y `max` se aplican antes de agrupar, y esta
vista no pagina. Para artículos se recomienda conservar `view: list`, la vista
predeterminada. Ejemplo copiable: `_examples/content/single/calendario.es.md`.

```yaml
list:
  type: event
  view: calendar
  max: 100
```

`box.infinite: true` (también `review.infinite`) permite seguir desplazando un
slider en ambos sentidos con sus elementos originales. Se mantiene desactivado
por defecto y sólo entra en funcionamiento cuando hay suficiente contenido
fuera de la vista. Conserva los índices lógicos de los indicadores y no clona
formularios, IDs o medios. El autoplay se pausa con foco y con Reducir
movimiento. Las flechas rápidas se procesan en orden y los gestos directos
cancelan la cola. Los elementos sólo se reciclan al terminar el desplazamiento,
nunca durante su inercia. Un gesto muy largo puede alcanzar un extremo físico
antes de soltar; al detenerse se recupera espacio para el siguiente gesto.
Se prioriza conservar la inercia nativa sin saltos ni parpadeos frente a reciclar
continuamente mientras se arrastra.

La API nativa `moveBefore` permite reordenar sin reiniciar medios incrustados.
Cuando el navegador no la ofrece, los sliders con vídeo, audio o iframes se
mantienen finitos; las tarjetas simples pueden seguir siendo continuas. También
se conserva el modo finito cuando faltan elementos. No garantiza una puntuación
PageSpeed concreta. Ejemplo: `_examples/content/single/carrusel-infinito.es.md`.


Las hojas `gss` se reconstruyen como tablas pasivas: conservan texto, spans,
enlaces HTTP(S) y formato permitido de celdas, sin insertar estilos globales,
scripts ni recursos activos del documento de Google. Las tablas anchas se
desplazan dentro de su bloque. Si una hoja dependía de imágenes o CSS externo,
revisa su presentación tras actualizar; ese contenido activo no se incrusta.


## Ancho y margen de la acción de una caja

En HTML, combina `btn btn--dot btn--sm` para un botón pequeño de icono:
su superficie visible ocupa 2em por lado y conserva las esquinas y colores del
sistema. El área pulsable reserva un mínimo de 48 × 48px en el propio layout,
sin invadir los controles vecinos.
El calendario utiliza esta variante en sus flechas y cierre de detalles.

`btn_full` se declara junto a `url` y `btn`. Vacío conserva el ancho completo
cuando la propia caja tiene fondo. `true` lo fuerza también sin fondo y `false`
conserva el ancho del contenido incluso con fondo o disposición pill.
`btn_mt` y `btn_mt_vl` controlan el margen superior en em; admiten cero y usan
la misma interpolación adaptable que los bloques. Sin `btn_mt_vl`, el margen
se conserva en todos los tamaños.

```yaml
url: /contacto/
btn: cta
btn_full: false
btn_mt: 1
btn_mt_vl: 2
```

## Elegir el envío de formularios

`form.ajax` vacío conserva el comportamiento del proveedor: Apps Script usa
fetch, FormSubmit lo usa sin archivos y las otras acciones navegan normalmente.
`true` fuerza fetch para una acción propia; `false` fuerza el envío nativo,
incluido FormSubmit con su URL sin `/ajax`. Se mantiene la validación compartida.
La acción debe admitir el origen del sitio (CORS) y el formato enviado: con
archivos se usa multipart; sin archivos, datos URL-encoded. Las acciones genéricas
se consideran correctas con HTTP 2xx; Apps Script conserva su validación de
recibo persistido. No se intenta interpretar una página HTML como un recibo JSON.

```yaml
form:
  action: https://receiver.example/contact
  ajax: true
```

## Publicar imágenes externas desde el propio dominio

`data/config.yml` admite `imgs_remote: true`. Durante la compilación, las imágenes
HTTP(S) del sistema de medios —también fondos y pósteres— se descargan con la
caché de recursos de Hugo. Los formatos raster que Hugo puede procesar usan la
misma calidad, recorte y fuentes responsive que los locales; los originales y
sus derivados se publican bajo `/u/remote/`. El contenido forma parte del nombre
para que un cambio de imagen no reutilice la URL anterior. Los SVG se publican
como archivos de imagen, sin insertar su contenido remoto como HTML ni sprites.
Esto no descarga archivos de vídeo ni URLs de integraciones personalizadas que
no pasen por el sistema de medios.

La opción está desactivada por defecto. Si la descarga falla o el formato no es
compatible, el build avisa y conserva la URL remota: ese recurso concreto seguirá
siendo externo. La primera compilación necesita acceso al origen y el volumen de
trabajo de imágenes aumenta según los recursos utilizados; las siguientes
compilaciones pueden reutilizar la caché. No requiere un proxy en producción.
