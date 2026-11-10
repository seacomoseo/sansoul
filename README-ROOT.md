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
con el gestor del proyecto. Node se fija en `.node-version`; Hugo y Wrangler, en
el motor (`core/ci/run` y `core/package.json`).

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
cambios de seguridad y compatibilidad. El CI la instala desde `core/ci/run`.

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

- `hugo.yml`: URL base y parámetros del proyecto —específicos, no secretos—, incluida su identidad de despliegue (`owner`, `repo`, `worker`, `netlify`, `worker_vars`; `domain` sale del host de `baseURL`).
- `package.json`: dependencias Node utilizadas por Hugo y los scripts de posprocesado.
- `.github/workflows/sansoul.yml`: stub generado por `sh do root-docs`; toda la lógica está en `core/ci/run`.
- `worker/` (generado, fuera de Git): entrada del Worker, manifiesto de formularios y `wrangler.jsonc`.
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

Guardar no publica: el CMS guarda con `[skip ci]`. Para publicar, «Publicar
cambios» en el menú de la cuenta de Sveltia lanza el workflow `SanSoul`
(`repository_dispatch`), y Sveltia muestra el estado del run junto a cada cambio.
`/admin/info/` ya no existe: redirige a `/admin/`, que antes de iniciar sesión
muestra la ayuda de acceso.

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

## Comercio opt-in

El comercio es opt-in y su backend corre como Worker del proyecto (o, por compatibilidad, como Pages Functions). `enabled` activa el catálogo; `functions_enabled` controla por separado el enrutamiento de Pages Functions. Si este último se omite, sigue el valor de `enabled` para conservar la configuración de consumidores existentes. Sin `data/commerce.yml`, o con ambos valores desactivados, no se enrutan Functions de comercio. Ninguno de estos ajustes autoriza cobros: la autorización de checkout es independiente y falla cerrada.

Con comercio activo, `data/commerce.yml` también requiere `origin`, `currency` y `stock_mode`. La parte de aprobación usa `checkout_approved` (booleano), `checkout_legal_version` (identificador de versión aprobada), `checkout_destination_countries` (lista de códigos ISO alfa-2 en mayúsculas), `checkout_tax_policy` (`included`, `calculated` o `not_applicable`) y `checkout_shipping_policy` (`included`, `flat_rate`, `calculated` o `not_applicable`). Sus valores iniciales son `false`, `null`, `[]`, `null` y `null`, respectivamente. El parser admite arrays YAML en línea y en bloque; por ejemplo:

```yaml
checkout_destination_countries:
  - "ES"
  - "PT"
```

El generador valida formato y coherencia, no verifica el contenido real del aviso legal, los destinos autorizados ni las reglas del negocio: debe aprobarlos la persona responsable. No guardes secretos ahí: el catálogo generado puede publicarse junto a Functions.

La autorización de Stripe requiere además configuración explícita del servidor (variables del Worker): `COMMERCE_ENV` debe ser `test` o `live`, `COMMERCE_PROVIDER=stripe` y `COMMERCE_CHECKOUT_APPROVED=true`. Los parámetros de URL, `localStorage` y el payload del navegador no pueden habilitarla. En la implementación actual los totales de impuestos y envío no están calculados, por lo que Stripe queda bloqueado también con los demás valores completos; no se considera `subtotal` un total comercial válido para productos físicos.

El proveedor `fake` solo admite fixtures sintéticos cuando `COMMERCE_ENV=test` y `COMMERCE_TEST_FIXTURE=synthetic-commerce-test`; se rechaza en `live`. Al apagar la autorización se bloquean también los replays de checkout para no volver a entregar URLs de pago. Esto no revoca sesiones Stripe emitidas previamente; esas sesiones caducan según su expiración o requieren cancelación por el proveedor. Webhooks, conciliación y consulta privada del estado de pedidos anteriores siguen activos.


En `stock_mode: finite`, las reservas `held` descuentan disponibilidad hasta que se confirman (`committed`), se liberan o vencen (`expired`). Un checkout válido o `POST /api/commerce/admin/reconcile?operation=expiration` repara como máximo un pedido vencido por llamada y sus reservas `held`; no necesita que llegue un webhook. Stripe deja vencer sus Checkout Sessions a las 24 horas de su creación real por defecto. El backend omite `expires_at` para que Stripe aplique ese plazo desde la creación efectiva y el payload siga idéntico en reintentos con la misma clave. El backend permite reintentar durante 23 horas (margen previo a la retención mínima documentada de claves de idempotencia); conserva la reserva hasta el posible vencimiento de una sesión creada en el último reintento, con cinco minutos de margen, y limita el watchdog de recuperación a 47 h y 5 min (23 h + 24 h + 5 min). Al recibir la sesión, alinea el pedido y las reservas `held` con el `expires_at` devuelto por Stripe. Un timeout ambiguo no demuestra que el proveedor no creara la sesión ni autoriza ampliar una sesión existente. Aplica, en este orden, las migraciones `0001_commerce.sql` a `0006_bounded_maintenance.sql` antes de actualizar el backend. `0001` crea las tablas de idempotencia, pedidos, inventario, reservas, límites, webhooks y outbox con sus restricciones; `0002` añade capabilities de estado privadas para comprador; `0003` permite alinear el vencimiento operativo del pedido con el vencimiento real de la sesión sin hacer mutable el snapshot; `0004` crea el almacenamiento privado de datos de entrega, el resumen durable de webhooks sin pedido y los cursores de operaciones. En D1, aplica cada SQL solo tras verificar la base, el entorno y una copia recuperable; `pnpm run test:commerce:d1` (desde `core/`) prueba D1 local y no aplica migraciones remotas.

Desde la raíz del consumidor, usa la versión de Wrangler fijada en `core/package.json` (`devDependencies`). Tras aprobar y respaldar el entorno, ejecuta cada archivo una sola vez y en orden:

```sh
pnpm dlx wrangler@4.147.0 d1 execute <NOMBRE_BASE> --remote --file core/commerce/migrations/0001_commerce.sql
pnpm dlx wrangler@4.147.0 d1 execute <NOMBRE_BASE> --remote --file core/commerce/migrations/0002_buyer_status.sql
pnpm dlx wrangler@4.147.0 d1 execute <NOMBRE_BASE> --remote --file core/commerce/migrations/0003_provider_session_expiry.sql
pnpm dlx wrangler@4.147.0 d1 execute <NOMBRE_BASE> --remote --file core/commerce/migrations/0004_operations_and_delivery.sql
pnpm dlx wrangler@4.147.0 d1 execute <NOMBRE_BASE> --remote --file core/commerce/migrations/0005_outbox_indexes.sql
pnpm dlx wrangler@4.147.0 d1 execute <NOMBRE_BASE> --remote --file core/commerce/migrations/0006_bounded_maintenance.sql
```

Un pago tardío se registra, pero pasa a `inventory_exception`, no se prepara automáticamente y genera una notificación en el outbox durable para revisión. Un reembolso parcial antes o después de `paid`, mientras el pedido esté en `awaiting_payment` o `ready`, también lo lleva a `inventory_exception` sin cambiar `payment_status=partially_refunded` ni reducir `refund_amount_minor`. La conciliación mueve a esa misma excepción los pedidos heredados que aún estén esperando; nunca trata un reembolso parcial como un pago impagado, ni vence o libera automáticamente sus reservas `held`. La notificación durable de excepción/cancelación no contiene contacto ni dirección.

Una persona autorizada puede resolver esa excepción con `POST /api/commerce/admin/orders/<orderId>/cancel-partial`, usando la misma autenticación administrativa. En un único batch condicionado al ganador, cancela solo el fulfillment y libera solo reservas `held`; conserva `committed`, el estado monetario y el importe reembolsado. Repetir una cancelación aplicada devuelve éxito sin repetir efectos. Esta acción no devuelve dinero ni confirma un reembolso: el saldo monetario restante requiere una gestión separada del titular de la cuenta/proveedor, fuera de este corte. Las rutas `manufacture` y `ship` rechazan pedidos en excepción. Un reembolso completo libera únicamente reservas aún `held`; las unidades `committed` no se reponen automáticamente y un reembolso no revierte fabricación o envío: los pedidos `manufacturing` o `shipped` conservan su fase y requieren resolución operativa explícita.

El estado privado para comprador está disponible en `GET /api/commerce/status/<orderId>` solo con la cookie de capability que emitió checkout. No basta conocer el UUID del pedido. Las órdenes creadas antes de migrar `0002_buyer_status.sql` no reciben una capability retroactiva ni se vuelven accesibles por su ID. La capability aleatoria de 256 bits se guarda en D1 como hash y se vincula a la orden, la clave de idempotencia y la sesión; la cookie `__Secure-commerce-status-<orderId>` usa `HttpOnly`, `Secure`, `SameSite=Lax`, ruta `/api/commerce` y caduca como máximo a los 90 días o al vencimiento operativo de la orden. La respuesta contiene únicamente `order_id` y `payment_status`, no incluye dirección ni contacto y se entrega sin caché, con `Vary: Cookie` y `Referrer-Policy: no-referrer`. Si se pierde la respuesta inicial o la cookie, no hay recuperación de acceso por UUID o clave de idempotencia ni reasignación automática de la capability a una orden antigua; el endpoint falla cerrado con 404. No registres la URL ni la capability en analytics, referer o almacenamiento del navegador.

Durante `sh do build`, el tema genera el catálogo antes de la compilación Hugo. Sin adaptadores de Pages Functions no genera artefactos de comercio. Con los adaptadores presentes, una configuración ausente o desactivada sin `functions_enabled: true` genera un catálogo desactivado y `_routes.json` incluye y excluye únicamente `/`; no exige SKU ni activa tráfico de Functions. `functions_enabled: true` conserva `/api/commerce/*` incluso cuando `enabled: false`: ese modo mantiene webhook, estado privado, administración y conciliación accesibles, mientras el checkout y sus replays quedan bloqueados por el catálogo desactivado. Para detener todo el tráfico de Functions, usa `functions_enabled: false` o elimina la configuración únicamente cuando no haya operaciones pendientes. Quitar configuración/rutas no cancela sesiones ya emitidas ni revierte pedidos o pagos en D1/Stripe; para pausar una tienda con pedidos, conserva binding, base y credenciales necesarias, y usa `enabled: false` junto a `functions_enabled: true`. La salida de catálogo queda en `functions/_commerce/catalog.generated.js`, fuera de `public/`; no la copies ni publiques como asset estático.

### Textos visibles y avisos de pedidos

`notes` (opcional) en `data/commerce.yml` añade una línea Markdown bajo el botón de compra de la ficha (`product`) y sobre el pago en el carrito (`cart`): IVA incluido, condiciones de envío, destinos con presupuesto. Cada valor es un texto o un mapa idioma → texto; son solo informativos y no cambian el cálculo, que sigue saliendo de `totals_policy`.

```yaml
notes:
  product: "IVA incluido. Envío a península y Baleares: 12,05 €."
  cart:
    es: "Otros destinos o más de 2 kg: pide presupuesto."
```

El cron del Worker (el mismo de formularios, cada 15 minutos) envía a la tienda un correo por cada evento del outbox (`payment.paid`, reembolsos y excepciones) cuando hay `COMMERCE_NOTIFY_TO` (una o varias direcciones separadas por comas, en `worker_vars`) y credenciales Gmail de formularios (`FORMS_GMAIL_CREDENTIALS` con `FORMS_GMAIL_DEFAULT`, o la referencia de `COMMERCE_NOTIFY_ACCOUNT`). El correo lleva pedido, identificador de pago, artículos, totales y código postal de destino; nombre, contacto y dirección se consultan en el panel de Stripe o en `admin/orders`, para no dejar datos personales en el buzón emisor. Si el envío falla, el evento queda pendiente con reintentos y el código del proveedor en `last_error` (p. ej. `gmail_grant_invalid`). Un binding `COMMERCE_NOTIFIER` tiene prioridad sobre el correo. La conciliación sigue siendo manual (`admin/reconcile`).

### Operación privada, exportación y respaldo

Todas las rutas `/api/commerce/admin/*` exigen `Authorization: Bearer <COMMERCE_ADMIN_TOKEN>` y el binding privado `COMMERCE_ADMIN_TOKEN`, de al menos 32 caracteres; las respuestas no se almacenan en caché. Falta de configuración válida devuelve 503 y credenciales incorrectas 401. Usa el token solo desde un cliente administrativo protegido: no lo incluyas en HTML, JavaScript del navegador, URL, CMS o `localStorage`. `GET /api/commerce/admin/orders?limit=50&cursor=…` admite 1–100 pedidos por página, en orden estable `(created_at DESC, id DESC)`, y devuelve `next_cursor`. Reutiliza el cursor con los mismos filtros `payment_status`/`fulfillment_status`; no es un snapshot transaccional: cambios de estado no reordenan filas y pedidos nuevos anteriores al cursor quedan para una consulta posterior.

`GET /api/commerce/admin/export.csv?limit=100&cursor=…` exporta una página y devuelve la siguiente clave en `x-next-cursor`; solicita páginas sucesivas hasta que esa cabecera esté vacía para recorrer todo el historial. Incluye snapshot de artículos/precios, estados, referencias del proveedor, reembolsos y, si el proveedor los entregó, contacto/dirección privada. Guárdalo como dato sensible y compártelo solo con personal autorizado. Es un extracto operativo CSV, no copia de seguridad: no contiene el esquema completo, reservas, eventos, deduplicación, capacidades ni outbox.

Para una copia SQL, desde un entorno autorizado ejecuta `pnpm dlx wrangler@4.147.0 d1 export <nombre-base> --remote --output <ruta-segura>/commerce.sql`. El SQL incluye pedidos y datos personales: cifra/restringe la copia y no la añadas al repositorio. `pnpm run test:commerce:d1` (desde `core/`) ejercita el export SQL con Wrangler/D1 local, restaura en otra base local (`commerce-restored`) y otro `--persist-to`, y compara filas completas/estados de todas las tablas de comercio. Comprueba que el SQL exportado conserva tablas, índices y triggers; en la base restaurada verifica con escrituras rechazadas el trigger de snapshot, las restricciones `CHECK` y las claves foráneas. El ejecutor D1 local bloquea consultas directas a `sqlite_master` y `PRAGMA` (`SQLITE_AUTH`), por lo que este test no las usa. La prueba no ejecuta `--remote`, no verifica una copia alojada ni acredita recuperación ante desastre en Cloudflare. Restaura únicamente en una D1 desechable y vacía; una copia antigua sobre una base viva puede sobrescribir pedidos o pagos posteriores.

**Mantenimiento acotado (desde 13.6.0).**
`POST /api/commerce/admin/reconcile?operation=orders` concilia un solo pedido;
`operation=expiration` repara un solo pedido vencido o parcialmente reembolsado;
`operation=unmatched_webhooks` replaya un solo evento. Omitir `operation` selecciona
`orders`, ya no ejecuta las otras clases. Cursores D1 independientes por
`(created_at, id)` con revisión CAS rotan los pendientes, incluso una cola de un
solo elemento. La respuesta añade `operation` y `has_more`: un lookahead acotado
indica otros candidatos, no garantiza agotamiento ni éxito (el elemento actual
puede fallar/diferirse y reaparecer en otra pasada). El caller debe programar las
tres clases con turnos independientes y límite de llamadas, sin bucles de drenaje
ilimitados ni esperar `has_more=false` antes de dar turno a otra clase. Aplicar
`0005_outbox_indexes.sql` y `0006_bounded_maintenance.sql` en orden, una vez y solo
sobre la base aprobada/respaldada; `0006` conserva posiciones, añade revisión y
cursor de expiración e índices. No borra pedidos/eventos/capabilities/idempotencia.

Si falta `session_id`, la recuperación reutiliza el UUID de pedido como clave idempotente del proveedor y el snapshot/payload inmutable persistido; checkout debe estar autorizado. El gate Stripe actual sigue cerrado, por lo que estos casos se conservan y se informan como diferidos fuera de fixtures sintéticos. Los webhooks firmados sin pedido guardan un resumen mínimo sin nombre/dirección; después de aparecer el pedido, conciliación puede replayarlo idempotentemente tras validar identidad, importe y moneda. Esta cola solo recupera eventos ya persistidos: consultar sesiones Checkout no descubre un evento `charge.refunded` que nunca llegó. Si falta, una persona autorizada debe volver a enviar el evento original desde el panel autenticado del proveedor a la URL webhook configurada; se verifica su firma y, si sigue sin pedido, `reconcile` lo aplica cuando exista la orden. Si el proveedor ya no permite reenvío, no hay endpoint de importación/reparación manual en este corte: no edites D1 directamente y escala la conciliación a una operación aprobada. El replay de un reembolso no se probó con Stripe real.

El outbox de D1 conserva fallos y programa reintentos con espera creciente. Dispatch intenta una notificación y recupera como máximo una lease caducada por llamada. La respuesta es `{ attempted, delivered, failed, has_more }`: se elimina el campo numérico `pending` en este contrato incompatible documentado. `has_more` comprueba presencia con `LIMIT 1`, incluye fallos diferidos y leases frescas, y no invita a hacer busy-loop; reprograma con espera/límite. Usa `eventKey` como clave de deduplicación del notifier: una entrega seguida de un ack perdido puede repetirse (at-least-once). `POST /api/commerce/admin/outbox/dispatch` no demuestra entrega de email/factura. Solo se probó con notifier sintético que falla una vez y luego reintenta; la integración real sigue pendiente de acceso y validación en Ops.

Stripe Checkout solicita dirección de entrega únicamente cuando la política y la lista de destinos aprobados la permiten; no se inventan destinos, tarifas ni IVA. El webhook valida y persiste en `order_delivery_details` solo el contacto y dirección devueltos por Stripe. Solo pedidos/exportación administrativos autenticados exponen esos datos; el status del comprador devuelve exclusivamente ID y estado. `ship` exige destinatario, calle, localidad, código postal y país; si faltan, devuelve `delivery_details_missing`. Los webhooks no encontrados guardan un resumen sin PII y el outbox/errores no incluye dirección o contacto. El carrito del frontend conserva únicamente IDs/cantidades: hasta que destinos y políticas estén aprobados, no añadas captura de dirección en UI ni la guardes en URL, analytics o `localStorage`; Stripe Checkout es el punto de captura previsto cuando se autorice. No hay plazo de retención aprobado ni borrado automático implementado para `order_delivery_details`; antes de habilitar pedidos físicos reales, aprobar plazo/propietario y una rutina de eliminación también para exportaciones protegidas. Hasta entonces el gate de checkout físico permanece cerrado.

El generador usa un parser YAML completo para `data/commerce.yml` y el front matter de productos: errores, claves duplicadas y tipos incorrectos detienen el build. Con comercio activo, cada producto necesita `commerce_id` estable, `sku` único en mayúsculas y `commerce_active` booleano; no se inventan ni corrigen identificadores. Los precios se convierten a céntimos desde su texto decimal exacto.

### Catálogo, carrito e identidades

`enabled: true` activa también la UI: acciones de cantidad/añadir en productos y
un panel de carrito compartido. El CMS ES/EN añade `commerce_id`, `sku`,
`commerce_active` y `commerce_quote` opcionales (`required: false`); el build exige
los datos válidos cuando se activa comercio. `commerce_quote: true` sustituye la
compra por un enlace a `#contacto`, sin inventar un precio. El carrito guarda solo
UUID/cantidad, nunca datos de entrega; sus importes son informativos y el backend
vuelve a validar el catálogo autorizado. Subtotal no equivale a total aprobado.

Para una página completa de carrito, crea `content/single/carrito.<lang>.md` para
cada idioma; el enlace del panel resuelve precisamente `single/carrito`:

```markdown
---
title: Carrito
slug: carrito
seo:
  noindex: true
---

{{< commerce-cart >}}
```

Mantén `checkout_approved: false` hasta aprobación comercial e implementación de
totales completos. `CHECKOUT_TOTALS_SUPPORTED=false` sigue bloqueando Stripe;
activar el catálogo, el CMS o el carrito no aprueba impuestos, envío ni contratos.
Sin `enabled: true` no se insertan shell/acciones/JS/SCSS comerciales; el shortcode
es un no-op. El ejemplo general sigue sin comercio y conserva los divisores.

Para altas, usa el allocator/validator del consumidor si dispone de él. Conserva
un registro versionado fuera de `content/`, `data/`, `static/` y mounts públicos,
con el propietario de cada UUID/SKU, bajas permanentes y high-watermark. No asignes
por orden/título ni rellenes huecos: un borrado o traducción no libera identidades.
Reserva la identidad antes de guardar las traducciones, conserva la misma pareja
en todas ellas y valida duplicados, propietario y tombstones antes del build.
Un cambio de ruta requiere trasladar explícitamente el propietario, no asignar
una identidad nueva. Nunca elimines bajas del registro al clonar o publicar.

`themeVersion` del manifiesto se toma del paquete del tema; `release` es SHA256 de
su contenido completo (incluida esa versión), no una aprobación comercial. UI y
backend identifican productos por el mismo UUID; publicar un paquete/manifiesto
nuevo requiere reconstruir y revalidar el snapshot, no reutilizar un gate de otro
hash. Versiones y ambos locks deben ir juntos en la publicación autorizada.

La carpeta [`_examples/commerce-backend/`](_examples/commerce-backend/README.md) es un ejemplo opt-in aislado de backend, sin productos, UI ni datos comerciales reales. No forma parte de las carpetas `data/` y `content/` que se copian como ejemplo general.

## Despliegue

Hosting único: **Cloudflare Workers Free** (Worker con Static Assets en
`<worker>.<subdominio>.workers.dev` o en el dominio del cliente). Cada push a
`main`, «Publicar cambios» en el CMS (`repository_dispatch`) o una ejecución
manual lanzan el workflow `SanSoul`, que ejecuta `core/ci/run` en un solo job:

1. copia en GitLab si existe el secreto `GL_PAT` (`GITLAB_NAMESPACE`, por defecto `seacomoseo`);
2. Hugo Extended fijado por el motor, `pnpm install --frozen-lockfile` y `sh do build`;
3. con `CLOUDFLARE_API_TOKEN`: `core/scripts/worker-config.js --resolve` elige la cuenta
   (la única que ve el token, o `CLOUDFLARE_ACCOUNT_ID`), busca o crea por nombre las
   D1/KV propias (`<worker>-forms`, `<worker>-files`, `<worker>-commerce`), aplica sus
   migraciones y despliega. Sin el secreto, un push a `main` falla de forma visible;
4. con `params.netlify` y el secreto `NETLIFY_AUTH_TOKEN`: publica el espejo en Netlify
   (siguiente apartado).

El token de CI es **de cuenta** (Workers Scripts, D1 y Workers KV en escritura;
Account Settings en lectura), nunca un token personal. Los secretos del Worker
(`FORMS_ADMIN_TOKEN`, credenciales de Gmail…) se cargan una vez con
`wrangler secret put` y sobreviven a los despliegues; las variables no secretas van
en `params.worker_vars`. Con formularios, un cron del Worker cada 15 minutos
reintenta las entregas pendientes. La copia `workers.dev` responde
`X-Robots-Tag: noindex` (`static/_headers`) cuando el canónico es otro dominio.

Para probar la configuración sin desplegar: `sh do build && node core/scripts/worker-config.js`
y `pnpm dlx wrangler@4.147.0 deploy --config worker/wrangler.jsonc --dry-run`.

### Espejo Netlify (opcional)

Para clientes cuyo dominio se sirve desde Netlify (por ejemplo, cuando Cloudflare
puede quedar bloqueado). Basta con `netlify: <nombre-del-sitio>` en `params` y el
secreto `NETLIFY_AUTH_TOKEN` en GitHub; `core/scripts/netlify-mirror.js` hace el resto:

- crea el sitio en Netlify si no existe (sin conectarlo a Git; en el equipo de la variable
  `NETLIFY_ACCOUNT_SLUG` si la defines) y quita el distintivo «Powered by Netlify»;
- sube el mismo `public/` ya construido (`netlify deploy --prod --no-build`, CLI fijada) con
  un `netlify.toml` generado que reenvía `/api/*` al Worker con firma y, detrás, las reglas de
  `_redirects` (Netlify aplica `_redirects` antes que `netlify.toml` y una regla `/*` se
  tragaría `/api/*`);
- genera una sola vez el secreto `SANSOUL_PROXY_SECRET`, lo guarda en el sitio Netlify y en
  el Worker, y no lo rota. Para rotarlo: borrar la variable en Netlify y relanzar el workflow
  (la sincronización se hace aunque no toque desplegar).

Así formularios y comercio siguen viviendo solo en el Worker, que reconoce las peticiones
firmadas por Netlify y usa la IP real del visitante. `baseURL` debe ser el dominio que sirve
Netlify (los formularios solo aceptan ese origen).

Límites del plan Free de Netlify, medidos:

- **Créditos**: cada despliegue de producción cuesta 15 de los 300 que tiene cada equipo de
  Netlify por ciclo. El CI publica como mucho una vez por hora por sitio y 15 veces en
  cualquier periodo de 31 días sumando todos los sitios del equipo; si se salta un commit, lo
  publica el siguiente push o la recuperación automática cada 6 horas (solo en proyectos con
  `netlify`; tras añadir el parámetro, `sh do root-docs`). La recuperación solo publica un
  commit que el Worker ya tiene desplegado y espera si hay otro despliegue en marcha.
- **Adjuntos**: Netlify no deja pasar peticiones de más de 8 MiB, así que en estos proyectos
  el formulario limita cada archivo a 8 MB (en lugar de 20).
- **Tiempo**: Netlify corta a los ~28 s si el Worker no responde.
- En Free, la variable del secreto no puede ocultarse: la ve quien tenga acceso al sitio
  Netlify. Netlify añade además un comentario HTML propio en cada página.

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

Si el proyecto tiene formularios `action: worker` o comercio, `sh do local` también
arranca el Worker del proyecto en tu equipo (`wrangler dev`) y le pasa todo lo que
llega a `/api/*`, así que puedes enviar formularios y probar el carrito de verdad:

- los datos se guardan en una D1/KV local (`worker/.wrangler/state`), nunca en Cloudflare,
  y se conservan entre sesiones (borra esa carpeta para empezar de cero);
- los formularios quedan retenidos (`FORMS_PROVIDER=hold`): no sale ningún correo;
- el comercio funciona solo en modo prueba (`COMMERCE_ENV=test`: Stripe exige claves de test);
- los secretos opcionales (por ejemplo `FORMS_ADMIN_TOKEN` o `STRIPE_SECRET_KEY` de test) van en
  `worker/.dev.vars`, que Git ignora.

El Worker se reinicia tras cada build (mientras tanto, `/api/*` responde 503). Con
`--bind 0.0.0.0` también lo alcanza tu red local, incluidos los secretos de `.dev.vars`.
`sh do dev` y `sh do cms` siguen sin Worker.

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

### CMS y Actions: guardar no equivale a privado

`data/config.yml` admite `cms_repo: organization/site`; ausente mantiene
owner/domain. No cambia el dominio, URLs ni sitio público. El campo CMS es
opcional. Se conserva `backend.skip_ci: true`: guardar sin publicar usa
[skip ci] y no debe iniciar push builds. Un commit de publicación sin marcador
puede iniciar el push workflow; no asumir que todo botón Publicar crea un commit. Un commit guardado sigue en Git y puede salir en un build posterior:
esto no es privacidad ni un branch de borrador aislado. Sveltia delete/deleteMedia
no omite despliegues por seguridad de retención.
