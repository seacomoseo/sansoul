# SanSoul Hugo Theme

[![sansoul](/assets/media/logo.png)](https://github.com/lorensansol/sansoul)


# TO DO LIST

- [/] Quitar rows y columnas, todo son elementos (items) recursivos, cada grupo con un design común
  - [x] Comprobar primero
    - [-] [Widget Relations](https://www.staticcms.org/docs/widget-relation)
    - [x] CMS puede filtrar por defecto como columna
    - [x] CMS puede filtrar según valores de tíos (hermanos de padre)
    - [x] En CSS se pueden acumular los contenedores recursivos para calcular los anchos de las columnas
  - [/] Cambios
    - [/] Comprobar cambios en `example.yml` y reflejarlos en Hugo y CMS
    - [/] En
      - [/] Hugo (example y sansoul.es)
      - [ ] CMS
      - [ ] Todos los proyectos (`.yml`, `.md`, `custom.css`, `custom.js` y submodule `lorensansol/sansoul` > `seacomoseo/sansoul`)
    - [/] General
      - [x] Cambiar medidas con respecto al contenedor (container y columna) `cqw`
      - [x] `.contenedor { container-type: inline-size; }`
      - [x] Cambiar clases de `rows`, `columns`, por `boxes`
      - [x] Eliminar `box__content` > para ello hay que ajustar el box en modo `card`
      - [x] `column|column--item-` > `box|box--`
      - [x] `section__(header|title)` > `box__(header|title)`
      - [x] `form.fill_inputs > site.data.design.inputs.fill`
      - [x] Eliminar `max` de todos `gallery`
      - [x] Poner hijos de `more` a su mismo nivel, quitar este y poner un check booleano para mostrar todas las opciones en el CMS
      - [x] `type: columns` recursivo (ojo cms, probablemente limitar a 3 o 4 niveles)
      - [x] `padding_hide` > `ph`
      - [x] `padding_top` > `pt`
      - [x] `padding_bottom` > `pb`
      - [x] `rows` > `../` o `boxes`
        - [x] Añadir `design` paralelo
      - [x] `type` > `view` + cambiar visualización en CMS según éste; IDEA: usar arrays
        - [x] `view: columns`:
          - [x] `design` > `box`
          - [x] `items` > `boxes`
          - [x] `num` > `columns`
          - [x] `num_xs` > `columns_min`
          - [x] `title_size` > `hs`
          - [x] Add `hn`
        - [x] `view: steps`:
          - [x] `design` > `step`
          - [x] `items` > `steps`
        - [x] `view: gallery`:
          - [x] `design.alt` > `gallery.type` with 3 options: `grid`, `grid-contain`, `rows` and `columns`
          - [x] `design` > `gallery`
          - [x] `items` > `limages`
        - [x] `view: articles`:
          - [x] `design` > `box`
          - [x] `*` > `articles.*`
          - [x] `articles.kind` > `articles.type`
        - [x] `view: collapsibles`:
          - [x] `design` > `collapsible`
          - [x] `items` > `collapsibles`
        - [x] `view: reviews`:
          - [x] `design` > `review`
          - [x] `items` > `reviews`
          - [x] `num` > `columns`
          - [x] `num_xs` > `columns_min`
        - [x] `view: reviews`:
          - [x] `design` > `review`
          - [x] `items` > `reviews`
        - [x] `view: contact`:
          - [x] `data` > `buttons`
            - [x] `address.active` > `address.hide`
          - [x] `form`
            - [x] `form.action` > `action`
            - [x] `form.items` > `inputs`
            - [x] `fill_inputs` > remove
          - [x] `map`
            - [x] `active` > `hide`
      - [x] Cambiar etiquetas HTML
        - [x] `aside.logo` > `header.logo`
        - [x] Artículos:
          - [x] `section.tov` > `nav.toc`
          - [?] `author` y `share` se mantienen en `aside` dentro de `article`
          - [?] `related` se mantienen en `aside` dentro de `main`, pero fuera de `article`
        - [x] Seccionadas:
          - [x] `header` > `main/section`
          - [x] Opción de tipo de etiqueta HTML para cada sección `section, header, footer, nav, article, aside`
      - [x] `page.md/sections[*].custom` > `../`
      - [x] `footer` content and icons
      - [x] `menu.callnow_active` > `menu.callnow_hide`
      - [x] menu `screen_sticky` like `size_sticky` options
      - [x] Add `box_gap`
      - [x] `config.social` > `boxes[social]`
      - [x] `principal|main` > id de la primera section
      - [x] `shadow` > `hide_shadow` and `hide_radius` like brother (in `boxes`, `box` and `review`)
      - [x] `full_screen` > `full` and `section--full-screen` > `section--full` 
      - [x] `bg--image-fixed` > `bg--fix` 
      - [x] `reviews` > alineaciones
      - [x] `collapsibles` > alineaciones
      - [x] Cambiar alineaciones por defecto en box
      - [x] `schema`
      - [x] `schema` de autores y eventos
      - [x] Add `job_title` and `social` in `authors`
      - [x] Add `price` and `artist` in `events`
      - [x] `articles`
      - [x] `title` + `link` each box (`like_article` or not)
      - [x] `pill`
      - [x] `content` > `description`
      - [x] Página divisores
      - [x] Add `file` key in each modal
      - [x] `design.buttons.font_base` > `design.buttons.font_main.type` and bool to options `[ base, title, cursive ]`
      - [x] Add `design.buttons.font_main.bold` (bool)
      - [x] Add `design.buttons.font_main.uppercase` (bool)
      - [x] Add `design.buttons.font_alt.type` with same options tath `font_main`
      - [x] `design.fonts.*.strong` > `design.fonts.*.bold`
      - [x] `data.robots.md` > `assets.robots.md`
      - [x] `data.redirects.md` > `assets.redirects.md`
      - [x] `aricles.content.title` > `config.logo_title`
      - [x] `aricles.content.subtitle` > `config.logo_subtitle`
      - [x] `header_article` > `menu.header` with background section and container options
      - [x] `menu.items.normal` > `menu.items` and `menu.items.more` like item with `label: Más` + `icon: plus` + `items`
      - [x] Remove `menu.articles_sticky`
      - [x] Remove `menu.show_blog_auto`
      - [x] Remove `menu.show_products_auto`
      - [x] Remove `menu.show_taxonomies_auto`
      - [x] Remove `menu.search`
      - [x] Remove `menu.langs_in_more`
      - [x] With `menu.google_translate`, add in a item `link: translate` where you want
      - [x] `menu.screen_sticky` > `menu.sticky`
      - [x] `menu.size_sticky` > `menu.size`
      - [x] `menu.hide_anchors` > `menu.hide_sections`
      - [x] `menu.show_modals` > `menu.hide_modals`
      - [x] `menu.langs_out` > `menu.langs_group`
      - [x] Remove `data.menu`
      - [x] Remove `data.sections`
      - [x] Remove `data.modals`
      - [x] Remove `kind/article` {{ partial "sections/article/summaries" (dict "related" true) }}
      - [x] Remove `kind/404`
      - [x] Remove `functions/is-sectioned`
      - [x] `data.menu.[lang].items` > `$params.menu.[lang]`
      - [x] `data.menu.[lang].callnow_buttoms` > `$params.callnow.[lang]`
      - [x] `functions/lang-param` > `functions/config-lang`
      - [x] `functions/lang-params-custom-code` > `functions/config-lang`
      - [x] `$params` recursive from `baseof`
      - [x] ¿Constructor de tipos de páginas? (opción de `schema`)
        - [x] Crear sistema de plantillas, con `template` en cada página y en cada `_index`
        - [x] `data.templates._`
        - [x] `data.templates._custom`
        - [x] `data.templates._articles`
        - [x] `data.templates._lists`
      - [x] [Objetos reusables en YAML](https://yaml.org/type/merge.html) + hacer 3 reemplazos del json:
        ```hugo
          | jsonify (dict "prefix" " " "indent" "  ")
          | replaceRE `"\\u003c\\u003c":` " <<: "
          | replaceRE `\"\\u0026(.+?)\":` ` "$1": &$1 `
          | replaceRE `\"(\*.+?)\"` ` $1 `
          | safeHTML
        ```
      - [x] `sections.[es|en]/footer.yml` > `sections.[es|en]/base/footer.yml`
      - [x] Nested sections
      - [x] `hide_arrows` > `arrows: [bottom, float, hide]` (float styles in backtoroots.es)
      - [x] `hide_bullets` > `bullets: [dash, radius, hide]` (float styles in backtoroots.es)
      - [x] `data.templates.*.general` > `section`
      - [x] Add `data.templates.*` > `background`
      - [x] Remove default white color of sections
      - [x] `footer.divider`
      - [ ] mv partials sections
      - [ ] h1
      - [ ] Articles related type
      - [ ] Shortcodes
        - [ ] data
        - [ ] pagination
        - [ ] comments
        - [ ] if
      - [ ] Menu sticky
        - [ ] baseof
        - [ ] css
        - [ ] js
      - [ ] Remove `data.articles` or update
      - [ ] `design.yml` > `styles.yml`
      - [ ] Remove `custom` type and rename `sectioned` > `custom`
      - [ ] Add `data` in `box` like multiselect: `[ reading_time, categories, ... ]`
      - [ ] cp `data/templates` > `themes/sansoul/data/templates`
      - [ ] Images src sizes
      - [ ] Reset `cookies`.md
      - [ ] Reset `admin`.md
      - [ ] Comprobar enlaces ofuscados en Google Translate y la propia traducción
- [ ] [i18n](https://www.staticcms.org/docs/i18n-support)
  - [ ] ¿Cambiar idiomas de carpetas (`content.es/example.md`) a archivos (`content/example.es.md`)?
  - [ ] ¿Quitar montaje de módulos de `hugo.default.yml`?
  - [ ] ¿Quitar `translationKey` de cada archivo `.md` y del CMS?
- cms
  - config split in partials
  - pros
    - widget conditions
    - multiple images
    - media subfolders
    - multiple list with only one field = array of strings
    - versión móvil
    - i18n?
  - contra
    - booleanos se guardan forzosamente -> custom widget
    - style demasiado compacto -> css
    - markdown en hint's no funciona -> ahora si
    - no tiene flujo editorial -> ahora si, aunque faltan los enlaces y estados de las vistas previas
- cms
  - condition for show or hide widgets: https://www.staticcms.org/docs/widgets#example
  - listas plegadas cambian el nombre de la etiqueta por el de su hijo cuando solo hay uno
  - quitar "(opcional)" de las etiquetas
  - i18n
    # Required and can be one of multiple_folders, multiple_files or single_file
    # multiple_folders - persists files in `<folder>/<locale>/<slug>.<extension>`
    # multiple_files - persists files in `<folder>/<slug>.<locale>.<extension>`
    # single_file - persists a single file in `<folder>/<slug>.<extension>`
    structure: multiple_folders
  - editorial workflow previews get status deploy and links
    - https://api.netlify.com/api/v1/badges/30021f24-3d47-42ac-8b61-fe843fed3414/deploy-status?branch=deploy-preview-4
    - https://api.netlify.com/api/v1/badges/30021f24-3d47-42ac-8b61-fe843fed3414/deploy-status?branch=cms/sections-es/contacto
    - https://decapcms.org/docs/deploy-preview-links/
    - https://decapcms.org/docs/configuration-options/#preview_path_date_field
    - https://deploy-preview-966.staticcms.org/docs/cms-events
  - remove nulls
  - widget
    - color none
    - list
      - collapse only items, not all list
    - image/file external url
      - try custom widget with fusion
  - preSave
    - Campos de texto sin contenido: undefined (para campos no requeridos en colecciones que se puedan añadir archivos)
      - https://deploy-preview-966.staticcms.org/docs/cms-events#pre-save-event
+ UI Visual RPA
  - NewProject
    - https://app.netlify.com/sites/ssndental/configuration/deploys#branches-and-deploy-contexts
    - Configure
    - Branch deploys: All
    - Deploy Previews: None
  - EndDomainProject
    - SearchConsole
      - Add property: click last Continue
    - Netlify
      - Set SSL
  - file:///Users/lorensansol/Mi%20unidad/⚡%20Sea%20Como%20SEO/🤖%20UI.Vision/ui.vision.html?direct=1¯o=VALEVALE&macro=SanSoul/VarsToFile&cmd_var1&savelog=log1.txt
- sansoul
  - example.yml all files
  - partials/\*.html
  - cms-config.html
- projects
  - sections/\*.yml
  - data/sections.yml
  - pages/\*.md > sections
- check
  - ¿Añadir `.button` en `button` y quitar este de css? (16 de scss vs 44 de html)
  - `form.fill_inputs > site.data.design.inputs.fill`

- grid.html in article and partial from sectioned
- button in shpreadsheet (and CMS?) to build

---

- underline_width
- sitemap.html?
- dark mode
- screencast
  - Forms
  - Disqus
  - Analytics
  - Google My Business / Google Maps

- gitlab pages subfolder
  - script to add folder in the styles link (href="/sansoul.es/css/") in gitlab compiles
  - change te links with base64Encode for .RelPermalink

- not solution:
  - video not cover in grid__item
  - paginator not rule in "terms" of sections (maybe in taxonomies)
  - geo coordinates not rule in netlifycms
  - src svgs (lazyload) spaces imposible change for %20 with minify


# New language

- `./hugo.yml` (in all projects and sansoul template)
  - `disableLanguages: [en, … new]`
  - `languages: [en, … new]`
- `./hugo.default.yml`
  - `languages`
  - `disableLanguages`
  - `mounts`
- `./i18n/new.yml`
- `./data/options/langs.yml`
- `./data/utilities/default_disable_langs.yml`
- `./data/menu.yml`
- `./data/config.yml`
- `./content/*`
- `./assets/sections.new`
