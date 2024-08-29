# SanSoul Hugo Theme

[![sansoul](/assets/media/logo.png)](https://github.com/lorensansol/sansoul)


## TO DO LIST

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
          - [x] `design.alt` > `gallery.type` with 3 options: `grid`, `rows` and `columns`
          - [x] `design` > `gallery`
          - [x] `items` > `limages`
          - [x] `wrap` > `color`
          - [x] `gap` boolean > float
          - [x] Add `ratio` option
        - [x] `view: articles`:
          - [x] `design` > `box`
          - [x] `*` > `articles.*`
          - [x] `articles.kind` > `articles.types` and multiple select
          - [x] Add `date_ini`
          - [x] Add `date_end`
          - [x] `date_ini` > `date`
          - [x] `date_end` > `end`
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
          - [x] `data` > `contact`
            - [x] `address.active` > remove
            - [x] `address.streetAddress` > remove
            - [x] `address.postalCode` > remove
            - [x] `address.addressLocality` > remove
            - [x] `address.addressRegion` > remove
            - [x] `address.addressCountry` > remove
            - [x] `address.coordinates` > remove
            - [x] Add `anchor`
          - [x] `form`
            - [x] `form.action` > `action`
            - [x] `form.items` > `inputs`
            - [x] `fill_inputs` > remove
          - [x] `map` > obj to string with address and remove children (if whant map like a section, create a section with only this)
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
      - [x] Add `price` and `artists` in `events`
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
      - [x] `header_article` > `menu.logo` and `menu.logo_sticky: false` with background section and container options
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
      - [x] `menu.hide_anchors` > `menu.show_sections`
      - [x] Remove `menu.langs_out`
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
      - [x] `hugo.yml` > remove `languages.lang.permalinks` not custom (ojo `blog`, la mayoría tiene `page.blog: :slug`)
      - [x] `hugo.yml` > replace `disableLanguages` to `languages.lang.disabled: false` (al revés, solo dejar `disabled: true` lo que no tiene `disableLanguages`)
      - [x] `$params` recursive from `baseof`
      - [x] ¿Constructor de tipos de páginas? (opción de `schema`)
        - [x] Crear sistema de plantillas, con `template` en cada página y en cada `_index`
        - [x] `data.templates._`
        - [x] `data.templates._custom`
        - [x] `data.templates._articles`
        - [x] `data.templates._lists`
      - [x] [Objetos reusables en YAML](https://yaml.org/type/merge.html) + hacer 3 reemplazos del json:
        ```hugo
          | jsonify (dict "prefix" "" "indent" "  ")
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
      - [x] Add `font.size`
      - [x] `align_xl` > `align_max`
      - [x] delimit
      - [x] `columns_min: true` > `columns_min: 2`
      - [x] Add `span_min`
      - [x] CMS add langs in sidebar
      - [x] `opacity` > `alpha`
      - [x] class > variables css inline:
        - [x] `columns`
        - [x] `columns_min`
        - [x] `span`
        - [x] `span_min`
        - [x] `gap`
        - [x] `gap_ny`
        - [x] `padding`
        - [x] `alpha`
        - [x] `order`
        - [x] `icon_size` (only box)
      - [x] Add `sharp` option in `data.design.icons` (not for duotone)
      - [x] Add `name` option in `sections`
      - [x] `.columns` > `.boxes`
      - [x] `type: articles` > `type: list`
      - [x] `data/articles.yml` > `data/lists.yml`
      - [x] `data/design.yml` > `data/styles.yml`
      - [x] `summaries`
        - [x] Articles related type
      - [x] fix slider with button hide
      - [x] Remove:
        - [x] `image_min`
        - [x] `image_max`
        - [x] `image_align`
      - [x] if
      - [x] data
      - [x] pagination
      - [x] Slider with padding inline
      - [x] Slider fix interval stop general scroll
      - [x] Slider arrows float prety
      - [x] h1
      - [x] new dividers
      - [x] `fan-op` > `arrow-op-fan`
      - [x] Remove `slug` from `content.*/_index/*`
      - [x] `config` add `schema`
      - [x] `config.location_type` > `schema.types`
      - [x] `config.alternate_name` > `schema.names`
      - [x] `config.logo` > `schema.logo`
      - [x] `config.social` > `schema.social`
      - [x] `schema` add `phones` by `contact`
      - [x] `schema` add `address` by `contact`
      - [x] `schema` add `address.lnik` by `contact`
      - [x] `schema` add `open` by `contact`
      - [x] `schema` add `rating`
      - [x] `config` add `favicon`
      - [x] `config` add `menu`
      - [x] `config.legal_name` > `config.legal.name`
      - [x] `config.legal_dni` > `config.legal.nif`
      - [x] `config.legal_email` > `config.legal.email`
      - [x] `config.legal_location` > `config.legal.location`
      - [x] `config.country` > `config.legal.country`
      - [x] `config` add `cms`
      - [x] `config.cms_editorial_workflow` > `config.cms.editorial`
      - [x] `config.cms_disable` > `config.cms.disable`
      - [x] `config` add `cms.logo`
      - [x] `config.yml` > `config.es.yml`
      - [x] `hugo.yml` > `languages` > `data/langs.yml`
      - [x] schema and legal only by config, not crawl all site
      - [x] `.button-up` > `.up`
      - [x] `.button-callnow` > `.callnow`
      - [x] `.contact__form-` > `.form__`
      - [x] `.contact__form` > `.form`
      - [x] `.contact__buttons-` > `.contact__`
      - [x] `.contact__buttons` > `.contact`
      - [x] `submited_` > `submited-`
      - [x] `cms/config/fields`
        - [x] `FONT` and `BASE_COLOR` > `cms/config/settings/styles`
        - [x] `LISTS` > `cms/config/settings/lists`
        - [x] `CONTACT` + `FORM` + `MAP` + `SECTION` + `DIVIDER` > i18n
      - [x] `section` > `alternate` first section
      - [x] `alternate` > `section` after 1 section
      - [x] Menu sticky
      - [x] mv partials sections
      - [x] dividers in `draws.svg`
      - [x] Fix `draws-purge` script
      - [x] Move `icon` and `logo` from `assets` to `assets/base`, and remove almost every process of it
      - [x] `box_gap` > `gap_y`
      - [x] `box_ratio` > `rate`
      - [x] `image_hover` > `hover`
      - [x] `anchor` in section > `hanchor`
      - [x] `menu` in section > `menu_label`
      - [x] `button` in section > `menu_button`
      - [x] `font_alt` in section > `menu_font_alt`
      - [x] `[data-showup]` > `.show`
      - [x] `styles.performance.showup` > `styles.performance.show`
      - [x] `parallax` boolean > options? [ `none`, `smooth`, `fix`, `box` ]
      - [x] `parallax` en los bloques siempre es suave
      - [x] Remove `config.others.custom_code.css`
      - [x] Remove `config.others.custom_code.js`
      - [x] `cms/config/base`
      - [x] `cms/config/collections`
      - [x] forms check ✅❌
      - [x] `view` conditions in childs
      - [x] `data.config.schema` > `data.schema`
      - [x] Add `schema.departments`
      - [x] `cms/config/box`
      - [x] CMS language by config
      - [x] `data.langs` > `data.config.langs` and all params in `data.config` (less `favicon`, `cms` and hidden) > `data.config.langs`
      - [x] Translate CMS
      - [x] New `de`, `it` and `pt` translates
      - [x] Cookies small
      - [x] Fix slider
      - [x] Fix lightbox
      - [x] Fix purgecss
      - [x] Images src sizes
      - [x] Remove `site.Data.list`
      - [x] New `brand` schema
      - [x] Remove `taxonomy` base
      - [x] root directories in singular
      - [x] Remove `T` in `date`, `lastmod` and `end`
      - [x] Filter `list` by `date`
      - [ ] Fix types in CMS
      - [ ] Translate CMS
      - [ ] 404
      - [ ] `types`
        - [ ] `params` > `relations`
          - [ ] Remove `type: [relation]`
          - [ ] Remove `relation`
          - [ ] Slice to string `schema`
        - [ ] `breadcrumbs` > `relations`
        - [ ] `categories` params > `category`
        - [ ] `authors` params > `author`
      - [x] `cascade.type: single` en páginas únicas
      - [/] `params` in each box
      - [x] `data.config.langs.[lang].types` in `data.types`
      - [x] CMS
        - [ ] `collections` by custom types base params
        - [ ] `date`'s
        - [x] Collection icons
        - [ ] Fix `settings.types` arrays to objects
      - [ ] Static CMS isues preview images in subdir and `public_folder: ''`
      - [ ] Box `data`
      - [ ] `i18n` editable in cms?
      - [ ] `buildFuture`
      - [ ] 404 js
      - [ ] `menu-gradient`
      - [ ] Menu title in sticky
      - [ ] `images` in `product` and `event`
      - [ ] `pairings` > array with type (string, slice, number)?
      - [ ] Probar selector de `templates` en cms
      - [ ] Remove `custom` type and rename `sectioned` > `custom`
      - [ ] Remove nth-childs classes
      - [ ] Rehuse `boxes` partial in `reviews`
      - [ ] search template
      - [ ] `search.html`
      - [ ] `.columns--gap-0`
      - [ ] cp `data/templates` > `themes/sansoul/data/templates`
      - [ ] Reset `cookies`.md
      - [ ] Reset `admin`.md
      - [ ] Check `forms` `actions`
      - [ ] Check events
      - [ ] Check comments
      - [ ] Check Google Translate ofuscate links and la propia traducción
      - [ ] ¿Remove `columns` and `columns_min`? > Only `span` and `span_min`
      - [ ] `styles.performance`
- [ ] [i18n](https://www.staticcms.org/docs/i18n-support)
  - [ ] ¿Cambiar idiomas de carpetas (`content.es/example.md`) a archivos (`content/example.es.md`)?
  - [ ] ¿Quitar montaje de módulos de `hugo.default.yml`?
  - [ ] ¿Quitar `translationKey` de cada archivo `.md` y del CMS?
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

- Diferencias CMS
  - Less important
  - Static CMS
    - ❌ i18n folder (edit in other lang panel)
    - ❌ Image subfolders not show in image widgets
    - ❌ `public_folder: ""` `"/"` coloca 1 barra antes del nombre de archivo
    - ❌ Widget `select` with `multiple` create value `''` when load
  - Sveltia CMS
    - ✅ i18n
    - ❌ `relation` widget impide cargar la colección
    - ❌ `public_folder: ""` es igual que `media_folder`, y `"/"` coloca 2 barras antes del nombre de archivo
    - ❌ Custom widgets (lists and booleans widgets force values)
    - ❌ Media subfolders
    - ❌ Nested collections
    - ¿? Widget conditions
    - Less important
      - ❌ Login with Netlify Identity
      - ❌ Mobile version (min-width: 480px)
      - ❌ Multiple images
      - ❌ Multiple list with only one field = array of strings
      - ❌ Spanish UI
      - ❌ Editorial workflow
      - ❌ Widget keyvalue
      - ✅ Disabling automatic deployments
      - ✅ Pretty
      - ✅ Local backend without `npx`

- button in shpreadsheet (and CMS?) to build


## New language

- `themes/sansoul`
  - [x] `./hugo.default.yml`
    - `languages`
    - `mounts`
  - [/] `./i18n/new.yml`
  - [x] `./data/options.yml`
    - `langs`
  - [/] `./content.new/`
  - [x] `./prebuild/hugo.yml`
    - `module.mounts`

## Migrations

```shell
# Change submódules
git submodule deinit -f themes/sansoul
git rm -f themes/sansoul
rm -rf .git/modules/themes/sansoul
git submodule add https://github.com/seacomoseo/sansoul.git themes/sansoul
git submodule update --init --recursive
# Update files from sansoul
cp ../sansoul.es/netlify.toml netlify.toml
cp ../sansoul.es/package.json package.json
cp ../sansoul.es/themes/sansoul/data/schema.yml data/schema.yml
# Move and rename files
mv ./data/redirects.md   ./assets/redirects.md
mv ./data/robots.md      ./assets/robots.md
mv ./data/articles.yml   ./data/lists.yml
mv ./data/design.yml     ./data/styles.yml
mv ./content.es/custom/* ./content.es/pages/   # and add template
mv ./content.en/custom/* ./content.en/pages/   # and add template
# Copy from to
## ./hugo.languages.[lang].permalinks > ./data/config.langs.*.types
## ./hugo.prebuild.params             > ./data/config.langs.*.remote
cp ./data/config                      > ./data/schema
## ./data/config                      > ./data/schema
## ./content.[lang]/sections/contact  > ./data/schema
## ./data/lists.content               > ./data/templates.__
## ./data/lists.custom                > ./data/lists.pages
## ./data/menu                        > ./data/templates.__
## ./data/sections                    > ./data/templates.custom
## ./data/modals                      > ./data/templates.custom
## ./content-[lang].*.header_article  > ./content-[lang].*.menu.logo and logo_sticky
## ./content-[lang].*.alternate       > ./content-[lang].*.section
# Revise info
## ./data/lists
##   - common ?
##   - blog ?
##   - events ?
##   - products ?
##   - taxonomies ?
##   - custom ?
## base/icon.svg
## base/icon.png
# Clean files
perl -0777 -i'' -pe 's/Paginate: .+?\n//igs'                       hugo.yml
perl -0777 -i'' -pe 's/defaultContentLanguage:.+//igs'             hugo.yml
perl -0777 -i'' -pe 's/ #.+//ig'                                   data/schema.yml
perl -0777 -i'' -pe 's/departments:.+//igs'                         data/schema.yml
yq -i '.types =           load("data/config.yml").location_type'   data/schema.yml
yq -i '.names +=          [load("data/config.yml").title]'         data/schema.yml
yq -i '.names +=          load("data/config.yml").alternate_name'  data/schema.yml
yq -i '.description =     load("data/config.yml").description'     data/schema.yml
yq -i '.logo =            load("data/config.yml").logo'            data/schema.yml
yq -i '.address.country = load("data/config.yml").country'         data/schema.yml
yq -i '.social +=         load("data/config.yml").social'          data/schema.yml
yq -i '.prices =          load("data/config.yml").price_range'     data/schema.yml
perl -0777 -i'' -pe 's/(\n\s*)  - /$1- /igs'                       data/schema.yml
perl -0777 -i'' -pe 's/\n# /\n/ig'                                 data/schema.yml
perl -0777 -i'' -pe 's/(open:) ../$1/ig'                           data/schema.yml
perl -0777 -i'' -pe 's/from.+?(opens)/$1/igs'                      data/schema.yml
perl -0777 -i'' -pe 's/(- )link: /$1/ig'                           data/schema.yml
perl -0777 -i'' -pe 's/\nurl: null//ig'                            data/schema.yml
yq -i '.menu.logo =       load("data/lists.yml").content.logo'     data/config.yml
perl -0777 -i'' -pe 's/(\n\s*)  - /$1- /igs'                       data/schema.yml
perl -0777 -i'' -pe 's/logo:/menu:\n  logo:/igs'                   data/config.yml
perl -0777 -i'' -pe 's/legal_name:/legal:\n  name:/igs'            data/config.yml
perl -0777 -i'' -pe 's/legal_/  /igs'                              data/config.yml
perl -0777 -i'' -pe 's/country:.+?price_range:.+?\n//igs'          data/config.yml
perl -0777 -i'' -pe 's/disqus:.+?\n/types:\n  blog:\n    permalinks: :slug\n/igs' data/config.yml
perl -0777 -i'' -pe 's/\ncookies_legal:.+?(\nen:|\n$)/$1/igs'      data/config.yml
perl -0777 -i'' -pe 's/\n/\n  /igs'                                data/config.yml
perl -0777 -i'' -pe 's/^(title:)/langs:\n- lang: es\n  $1/igs'     data/config.yml
perl -0777 -i'' -pe 's/\n  en:/\n- lang: en/igs'                   data/config.yml
perl -0777 -i'' -pe 's/\n    (title|description):/\n  $1:/igs'     data/config.yml





perl -0777 -i'' -pe 's/(\n\s+top:)/\n    size: 1$1/igs'            data/styles.yml
perl -0777 -i'' -pe 's/(\nshadow:)/\ninputs:\n  fill: false$1/igs' data/styles.yml
perl -0777 -i'' -pe 's/font_base:.+/font_main:\n    type: title\n    bold: false\n    uppercase: true\n  font_alt:\n    type: base\n    bold: false\n    uppercase: false/ig' data/styles.yml
perl -0777 -i'' -pe 's/opacity:/alpha:/igs'                        data/styles.yml
yq -i '.shadow.alpha = 1 - (.shadow.alpha // 0)'                   data/styles.yml
perl -0777 -i'' -pe 's/lightbox_overlay:\n.+\n.+\n//ig'            data/styles.yml
perl -0777 -i'' -pe 's/\n  parallax:.+//ig'                        data/styles.yml
perl -0777 -i'' -pe 's/\n  srcsetx2:.+//ig'                        data/styles.yml
perl -0777 -i'' -pe 's/common:/all:/igs'                           data/lists.yml
perl -0777 -i'' -pe 's/custom:/pages:/igs'                         data/lists.yml
perl -0777 -i'' -pe 's/content:(.|\n)+\n(common:)/$2/igs'          data/lists.yml
perl -0777 -i'' -pe 's/\nheader_article:.+//ig'                    content.es/*.md
perl -0777 -i'' -pe 's/\nheader_article:.+//ig'                    content.en/*.md
perl -0777 -i'' -pe 's/\nmodals:/\nmodal:/igs'                     content.es/*.md
perl -0777 -i'' -pe 's/\nmodals:/\nmodal:/igs'                     content.en/*.md
perl -0777 -i'' -pe 's/(\n  - )/$1file: /igs'                      content.es/*.md
perl -0777 -i'' -pe 's/(\n  - )/$1file: /igs'                      content.en/*.md


```
