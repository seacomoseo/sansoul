# Tema SanSoul

[![SanSoul](/uploads/base/icon.png)](https://github.com/seacomoseo/sansoul)

SanSoul es un tema de [Hugo](https://gohugo.io/) orientado a sitios de servicios, construido alrededor de datos: tipos de contenido, secciones componibles, cajas recursivas, bloques especializados y una configuración de Sveltia CMS generada automáticamente.

Este repositorio se consume normalmente como submódulo Git en `themes/sansoul/`. Es código compartido: un cambio publicado aquí puede afectar a todos los proyectos que actualicen el submódulo.

Este es el manual humano para mantener ese código compartido. Para crear o editar un sitio consumidor, empieza por [`README-ROOT.md`](README-ROOT.md); el contrato operativo raíz se genera desde `templates/root/AGENTS.md`.

- [Manual del proyecto consumidor](README-ROOT.md)
- [Instrucciones para agentes del tema](AGENTS.md)
- [Plantillas de los archivos raíz](templates/root/)
- [Migraciones para proyectos consumidores](MIGRATIONS.md)
- [Ejemplos y chuletas](./_examples/README.md)
- [Proyecto base](https://github.com/seacomoseo/sansoul.es)

## Requisitos

- Hugo Extended, en la versión fijada por el proyecto consumidor.
- Node.js y las dependencias declaradas en el `package.json` de la raíz.
- Git con el submódulo inicializado.

Desde la raíz del proyecto:

```sh
git submodule update --init --recursive
npm ci
sh do server
```

La compilación completa se ejecuta con `sh do hugo`.

## Responsabilidades del tema

SanSoul proporciona:

- defaults de Hugo, contenido de sistema e internacionalización;
- preconstrucción de configuración, tipos, permalinks y contenido remoto;
- layouts, render hooks, shortcodes y schema.org;
- constructor de páginas basado en `tpl`;
- SCSS, JavaScript y carga condicional de módulos;
- generación de la configuración de Sveltia CMS;
- salida de `robots.txt`, `llms.txt`, redirecciones, índice de búsqueda y recursos derivados;
- scripts de imágenes y utilidades de despliegue.

El proyecto consumidor aporta el contenido y sobrescribe los datos del tema mediante las reglas de fusión de Hugo.

## Mapa del repositorio

```text
themes/sansoul/
├── archetypes/       # Front matter inicial de `hugo new`
├── assets/           # SCSS, módulos JavaScript y recursos procesables
├── content/          # Páginas de sistema traducidas
├── data/             # Defaults, CMS, tipos, secciones y opciones
├── i18n/             # Textos y defaults semánticos por idioma
├── layouts/          # Renderizado Hugo, shortcodes y generación de archivos
├── prebuild/         # Sitio Hugo previo que genera configuración y contenido
├── scripts/          # Posprocesado de imágenes y utilidades
├── static/           # Archivos publicados sin transformación
├── templates/        # README/AGENTS generados y scaffold inicial de DNA
└── _examples/        # Demo copiable y catálogos de referencia
```

## Pipeline de construcción

El wrapper del proyecto llama a `themes/sansoul/do`.

### 1. Preconstrucción

El sitio de `prebuild/` se ejecuta antes del sitio principal. Lee el proyecto consumidor y genera en `prebuild/public/`:

- `hugo.prebuild.yml`: idiomas, permalinks, mounts y configuración calculada;
- `content/`: índices y contenido derivado;
- recursos remotos materializados cuando `data/remote.yml` lo solicita.

La preconstrucción permite resolver decisiones que Hugo no puede convertir dinámicamente en configuración durante el render principal.

En desarrollo, `sh do local` ejecuta `scripts/local-server.js`. El supervisor vigila datos, índices de colección y fuentes del prebuild; agrupa guardados consecutivos, regenera la salida de forma serial y reinicia el servidor Hugo únicamente después de una preconstrucción válida. Los cache busters de `hugo.local.yml` invalidan las claves internas de los recursos del CMS, pero no sustituyen esta regeneración.

### 2. Sistema de archivos virtual

La configuración generada monta, entre otros:

- `content/single/_home.<lang>.md` como `content/_index.<lang>.md`;
- `content/values.<lang>.yml` como `data/values.<lang>.yml`;
- `uploads/` como `static/u/` y `assets/u/`;
- contenido generado y páginas de sistema del tema;
- iconos y fuentes de `node_modules`.

Definir mounts reemplaza los mounts predeterminados de ese componente, por lo que cualquier cambio debe conservar explícitamente todas las fuentes necesarias.

### 3. Render principal

La configuración se carga de menor a mayor prioridad:

1. `hugo.default.yml`;
2. `hugo.local.yml` o `hugo.production.yml`, si corresponde;
3. `prebuild/public/hugo.prebuild.yml`;
4. `hugo.yml` del proyecto.

Los templates ensamblan cada página, recopilan recursos utilizados en `page.Store` y `hugo.Store`, y generan los archivos auxiliares.

### 4. Posprocesado

En producción, `scripts/imgs.js` consume manifiestos temporales creados por Hugo para generar favicon, PNG y AVIF. Un build válido debe finalizar también esta fase.

## Constructor de páginas

El flujo principal es:

```text
baseof
  -> func/tpl-sections
  -> sections/items-tpl
  -> sections/merged-*
  -> sections/item
  -> boxes/items
  -> boxes/item
  -> blocks/* o boxes/items recursivo
```

`func/tpls.html` reúne las capas de `tpl`; `func/tpl-sections.html` construye la lista efectiva; los partials `sections/merged-*` expanden archivos, parámetros, IDs, defaults posicionales y relaciones anterior/siguiente.

### Fusión de `tpl`

La precedencia general es:

1. defaults internos;
2. valores del idioma;
3. tipo `all`;
4. tipo de la página;
5. front matter de la página.

`tpl.section[0]` actúa como default para todas las secciones. Los elementos posteriores se aplican cíclicamente según la posición. `tpl.sections` contiene las secciones explícitas y tiene la prioridad final.

Los mapas se fusionan en profundidad. Las listas tienen lógica específica; no asumas que se concatenan como mapas normales.

### Secciones

Una sección puede venir de `data/section/<file>.yml` y ampliarse en línea. Controla:

- fondo (`color`, `fade`, `bi`, `alpha`, `scroll`);
- tamaño y espaciado (`size`, `full`, `pt`, `pb`, `ph`);
- separadores (`div`, `div_x`, `div_y`);
- navegación (`menu_label`, `menu_btn`, `menu_swap`);
- semántica (`id`, `node`, `if`);
- cajas y modales.

`sections/attr.html` produce atributos y clases; `sections/merged-expand.html` resuelve el contexto final; `sections/item.html` genera el nodo.

### Cajas y bloques

`boxes/item.html` es el dispatcher principal. Una caja puede renderizar títulos, Markdown, icono, imagen, botón, tags, bloques o más cajas.

Las claves especializadas se mapean así:

| Datos | Partial principal |
| --- | --- |
| `list` | `blocks/list.html` |
| `steps` | `blocks/steps.html` |
| `imgs`, `limgs` | `blocks/gallery.html` |
| `faqs` | `blocks/faq.html` |
| `reviews` | `blocks/reviews.html` |
| `inputs` | `blocks/form.html` |
| `geos` | `blocks/map.html` |
| `links` | `blocks/links.html` |
| `dots` | `blocks/dots.html` |
| `when` | `blocks/when.html` |
| `gss` | `blocks/gss.html` |
| `boxes` | `boxes/items.html`, de forma recursiva |

La lista completa de parámetros y valores orientativos vive en `_examples/data/section/example.yml`. La configuración final del CMS es una segunda fuente de verdad generada.

## Renderizado Markdown

Los render hooks de `layouts/_default/_markup/` personalizan encabezados, enlaces, imágenes, tablas y alertas. Los shortcodes añaden datos del sitio, enlaces internos, contenido, mapas, fechas, divisores y utilidades.

No elimines un shortcode o render hook porque no aparezca en la demo actual: puede ser una API pública del tema para otros proyectos.

## Medios, iconos y recursos

Los partials `media/*` resuelven imágenes internas, externas, SVG y vídeo. `icon.html` admite Material Symbols, Font Awesome/Simple Icons y recursos SVG propios. Los stores recopilan solo los glifos y dibujos utilizados para reducir la salida.

`uploads/` pertenece al proyecto, pero Hugo lo monta bajo `/u/`. El tema también utiliza manifiestos temporales para generar variantes de imágenes fuera de Hugo Pipes.

## CSS

`assets/styles.scss` es el punto de entrada público. Importa tokens, utilidades, layout, componentes, Markdown, vendors y finalmente personalizaciones del proyecto.

Convenciones:

- SCSS con dos espacios de sangrado;
- nombres de clase siguiendo la convención existente tipo BEM;
- tokens y funciones antes de valores aislados;
- estilos de estado coordinados con el JavaScript que los activa;
- cualquier cambio en separadores se verifica con la página `divisores.es.md` de `_examples/` copiada en un proyecto de prueba.

`assets/css/cms.scss` compila los estilos específicos del editor.

## JavaScript

El tema usa módulos ESM, StandardJS, comillas simples, dos espacios y sin punto y coma. `assets/scripts.js` es el grafo de entrada. Hugo concatena o transpila recursos y `scripts.html` decide qué módulos condicionales incluir.

Cada módulo debe:

- exportar una función de inicialización con un nombre explícito;
- ser seguro cuando el elemento objetivo no existe;
- evitar efectos secundarios al importarse, salvo en el entrypoint deliberado;
- manejar fallos de red y APIs opcionales sin romper el resto de la página;
- no registrar datos sensibles ni dejar logs de depuración en producción.

## CMS generado

Los partials bajo `layouts/partials/cms/` construyen el YAML de Sveltia CMS a partir de:

- `data/cms/<lang>.yml`: etiquetas y ayudas;
- tipos y secciones del proyecto;
- `data/options.yml` y `data/utilities.yml`;
- defaults, customs, idiomas y valores;
- archivos editables como estilos, robots y llms.

Los archivos generados en `public/admin/` no son código fuente. Corrige el generador o sus datos y vuelve a construir.

## Schema, SEO y archivos auxiliares

`layouts/partials/schema/` genera JSON-LD para sitio, organización, página y tipos semánticos. `head.html` genera metadatos, canonical, alternates y Open Graph.

`layouts/partials/files/` genera, según la configuración y las páginas existentes:

- índice JSON de búsqueda;
- `robots.txt` y `llms.txt`;
- redirecciones;
- archivos de verificación;
- fuentes, glifos, SVG y manifiestos de imágenes.

Los cambios SEO deben probar páginas home, sección, entrada, traducción, noindex y 404.

## Desarrollo seguro

Antes de modificar el tema:

1. revisa `git status` en el proyecto y en el submódulo;
2. crea una línea base con `sh do hugo`;
3. identifica todos los call sites del partial o módulo;
4. conserva contratos de contexto y salida;
5. aplica un cambio pequeño;
6. construye el proyecto de referencia y `_examples/`;
7. inspecciona visualmente los casos afectados;
8. documenta cualquier cambio de API o datos.

No confíes únicamente en `--printUnusedTemplates`: Hugo no siempre puede detectar llamadas dinámicas, shortcodes opcionales o plantillas usadas por otros tipos de contenido.

## Contratos de partials

Los partials no obvios deben comenzar con un comentario de contrato. Incluye solo lo que ayude a mantenerlos:

```go-html-template
{{/*
Partial: func/example
Purpose: Resolve an example value without rendering markup.
Context:
  - Page (page.Page, required): Current page.
  - name (string, required): Parameter path.
Returns: Any resolved value, or nil when absent.
Side effects: None.
Example: {{ $value := partial "func/example" (dict "Page" . "name" "org.mail") }}
*/}}
```

Para partials que reciben directamente una `Page`, un string u otro valor, indícalo expresamente. Distingue “Returns” de “Renders” y documenta usos de `page.Store`, `site.Store`, escritura de archivos o carga remota.

Los comentarios internos deben explicar una invariante o una decisión sorprendente, no traducir cada línea del template.

## Compatibilidad y versiones

La versión canónica está en `package.json` y sigue SemVer: major para incompatibilidades, minor para funcionalidad compatible y patch para correcciones compatibles. [`MIGRATIONS.md`](MIGRATIONS.md) registra exclusivamente acciones que debe realizar un proyecto consumidor; Git continúa siendo el historial completo del código.

`sh do update` se conserva temporalmente como puente para proyectos anteriores a `5.0.0` que todavía dependen del actualizador privado `../_tools/updater/`. No forma parte del flujo portátil posterior a esa línea base y podrá retirarse cuando todos los proyectos heredados hayan migrado.

El proyecto base es la matriz de compatibilidad inmediata. Antes de publicar una versión o subir Hugo o Node:

- revisa si el cambio necesita una entrada de migración y una subida de versión;
- alinea `netlify.toml`, `wrangler.toml`, documentación y CI;
- revisa deprecaciones de mounts y templates en la documentación oficial de Hugo;
- ejecuta la preconstrucción, el build principal y el posprocesado;
- comprueba CMS, idiomas, URLs y salida de imágenes;
- describe cualquier requisito mínimo nuevo.

## Publicación del submódulo

Una modificación del tema y la actualización del proyecto consumidor son dos operaciones Git distintas. No mezcles sus commits y no avances el puntero del submódulo hasta que el commit del tema exista y sea accesible. La versión del `package.json` raíz solo debe sincronizarse después de aplicar las migraciones y validar el resultado. Ninguna de estas operaciones debe realizarse sin petición expresa del usuario.
