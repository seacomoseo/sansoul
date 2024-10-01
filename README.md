# SanSoul Hugo Theme

[![sansoul](/assets/media/base/icon.png)](https://github.com/seacomoseo/sansoul)


## Comprobar cambios en `example.yml`
## Script para actualizar proyectos

### SHELL INICIAL

### YAML y MARKDOWN


Quiero crear un script en node en el archivo `update-v2.js` que realice todas estas acciones:

- Copiar desde `data/articles.yml` > `content.logo` hacia `data/template.yml` > `menu.es.image`
- Copiar desde `data/articles.yml` > `content.title` hacia `data/template.yml` > `menu.es.title`
- Copiar desde `data/articles.yml` > `content.subtitle` hacia `data/template.yml` > `menu.es.subtitle`
- Copiar desde `data/articles.yml` > `common` hacia `data/template.yml` > `list`
- Si `content.es/authors.md` > `draft: false` entonces añadir a `data/types.yml` > `_: []` esto: `{ base: author, taxonomy_of: [ name: blog, schema: author ] }`
- Si `content.es/blog.md` > `draft: false` entonces añadir a `data/types.yml` > `_: []` esto: `{ base: article, name: blog, related: true }`
- Si `content.es/categories.md` > `draft: false` entonces añadir a `data/types.yml` > `_: []` esto: `{ base: page, name: category, taxonomy_of: [ { name: blog, multiple: true, breadcrumbs: true, schema: articleSection }, { name: category, multiple: true, breadcrumbs: true } ] }`
- Si `content.es/custom.md` > `draft: false` entonces añadir a `data/types.yml` > `_: []` esto: `{ base: page, name: page }`
- Si `content.es/events.md` > `draft: false` entonces añadir a `data/types.yml` > `_: []` esto: `{ base: event, related: true }`
- Si `content.es/products.md` > `draft: false` entonces añadir a `data/types.yml` > `_: []` esto: `{ base: product, related: true }`
- Copiar desde `data/menu.yml` > `*` hacia `data/template.yml` > `menu`
- Copiar desde `data/modals.yml` > `*` hacia `data/template.yml` > `modal`
- En el archivo `data/template.yml`
  - `general` > `section[0]`
  - `alternate` > Añadir a `section[]`
  - `menu.items.normal` > `menu.es.items`
  - `menu.items.more` > Añadir a `menu.es.items[]` colgando de otro parámetro llamado `items`
  - `menu.size_sticky` > `menu.size`
  - `menu.hide_anchors` > `menu.show_sections`
  - `menu.callnow_active: undefined` > `callnow.hide: true`
  - `menu.callnow_buttons` > `callnow.items`
  - Añadir `menu.sticky: auto`

- Copiar desde `data/config_old.yml` > `location_type` hacia `content.es/_index.md` > `types`
- Copiar desde `data/config_old.yml` > `alternate_name` hacia `content.es/_index.md` > `names`
- Copiar desde `data/config_old.yml` > `logo` hacia `content.es/_index.md` > `logo`
- Copiar desde `data/config_old.yml` > `social` hacia `content.es/_index.md` > `social`
- Copiar desde `data/config_old.yml` > `legal_name` hacia `content.es/_index.md` > `legal`
- Copiar desde `data/config_old.yml` > `legal_dni` hacia `content.es/_index.md` > `nif`
- Copiar desde `data/config_old.yml` > `legal_email` hacia `content.es/_index.md` > `email`
- Copiar desde `content.*/section/contact.yml` > `form.fill_inputs` hacia `data/styles.yml` > `inputs.fill`
- Copiar desde `content.*/section/contact.yml` > `rows[type: contact].data[type: address].streetAddress` hacia `content.*/_index.md` > `address.streetAddress`
- Copiar desde `content.*/section/contact.yml` > `rows[type: contact].data[type: address].postalCode` hacia `content.*/_index.md` > `address.postalCode`
- Copiar desde `content.*/section/contact.yml` > `rows[type: contact].data[type: address].addressLocality` hacia `content.*/_index.md` > `address.addressLocality`
- Copiar desde `content.*/section/contact.yml` > `rows[type: contact].data[type: address].addressRegion` hacia `content.*/_index.md` > `address.addressRegion`
- Copiar desde `content.*/section/contact.yml` > `rows[type: contact].data[type: address].addressCountry` hacia `content.*/_index.md` > `address.addressCountry`
- Copiar desde `content.*/section/contact.yml` > `rows[type: contact].data[type: address].coordinates` hacia `content.*/_index.md` > `address.coordinates`
- Copiar desde `content.*/section/contact.yml` > `rows[type: contact].data[type: phone].label` hacia `content.*/_index.md` > Añadir a `phones: []`
- Copiar desde `content.*/section/contact.yml` > `rows[type: contact].data[type: whatsapp].label` hacia `content.*/_index.md` > Añadir a `phones: []`
- Copiar desde `content.*/section/contact.yml` > `rows[type: contact].data[type: schedule].days` hacia `content.*/_index.md` > Añadir a `open[0].days []`
- Copiar desde `content.*/section/contact.yml` > `rows[type: contact].data[type: schedule].hours` hacia `content.*/_index.md` > `open[0].open`
- Copiar desde `data/config_old.yml` > `price_range` hacia `content.es/_index.md` > `prices`
- Copiar desde `data/config_old.yml` > `title` hacia `data/config.yml` > `langs[lang: es].title`
- Copiar desde `data/config_old.yml` > `description` hacia `data/config.yml` > `langs[lang: es].description`
- Copiar desde `data/config_old.yml` > `google_analytics` hacia `data/config.yml` > `langs[lang: es].google_analytics`
- Copiar desde `data/config_old.yml` > `google_site_verification` hacia `data/config.yml` > `langs[lang: es].google_site_verification`
- Copiar desde `data/config_old.yml` > `google_translate` hacia `data/config.yml` > `langs[lang: es].google_translate`
- Copiar desde `data/config_old.yml` > `google_file_verification` hacia `data/config.yml` > `langs[lang: es].google_file_verification`
- Copiar desde `data/config_old.yml` > `disqus` hacia `data/config.yml` > `langs[lang: es].disqus`
- Copiar desde `data/config_old.yml` > `custom_code.html_head.code` hacia `data/config.yml` > `langs[lang: es].html.head`
- Si existe el directorio `content.en` entonces:
  - Añadir en `data/config.yml` > `langs: []` el objeto `{ lang: en }`
  - Copiar desde `data/config_old.yml` > `en.title` hacia `data/config.yml` > `langs[en].title`
  - Copiar desde `data/config_old.yml` > `en.description` hacia `data/config.yml` > `langs[en].description`
- Si existe el directorio `content.fr` entonces:
  - Añadir en `data/config.yml` > `langs: []` el objeto `{ lang: fr }`
  - Copiar desde `data/config_old.yml` > `fr.title` hacia `data/config.yml` > `langs[fr].title`
  - Copiar desde `data/config_old.yml` > `fr.description` hacia `data/config.yml` > `langs[fr].description`
- Copiar desde `data/config_old.yml` > `cookies_legal` hacia `data/config.yml` > `others.cookies_legal`
- Copiar desde `data/config_old.yml` > `analytics_pagespeed` hacia `data/config.yml` > `others.analytics_pagespeed_disabled`
- Copiar desde `data/config_old.yml` > `process_all_images` hacia `data/config.yml` > `others.process_all_images`
- Copiar desde `data/config_old.yml` > `development` hacia `data/config.yml` > `others.development`
- Copiar desde `data/config_old.yml` > `cms_editorial_workflow` hacia `data/config.yml` > `others.cms.editorial_workflow`
- Copiar desde `data/config_old.yml` > `social` hacia `content.*/section/base/footer` > `boxes[0].social`
- En el archivo `content.*/section/base/footer`
  - `content` > `boxes[1].content`
- En el archivo `hugo.yml`
  - `Paginate` > eliminar
  - `defaultContentLanguage` > eliminar
  - `disableLanguages` > eliminar
  - `languages` > eliminar

- En todos los archivos de `content.*/section/*.yml` y `content.*/modal/*.yml`
  - `more.*` > `*`
  - `rows[*].items.more.*` > `rows[*].items.*`

- En todos los archivos de `content.*/*.md`, en los parámetros `general`, `modal` y todos los elementos de `alternate: []`
  - `image_min` > eliminar
  - `image_max` > eliminar
  - `image_align` > eliminar
  - `anchor` > `hanchor`
  - `padding_hide` > `ph`
  - `padding_top` > `pt`
  - `padding_bottom` > `pb`
  - `menu` > `menu_label`
  - `button` > `menu_button`
  - `font_alt` > `menu_font_alt`
  - `opacity` > `alpha: ${1 - opacity}`
  - `container` > `box_color`
  - `container_gradient` > `box_gradient`
  - `container_gradient_type` > `box_gradient_type`
  - `container_opacity` > `box_alpha: ${1 - container_opacity}`

- En todos los archivos de `content.*/*.md`
  - `general` > `section[0]`
  - `alternate` > Añadir a `section[]`
  - `menu.items.normal` > `menu.items`
  - `menu.items.more` > Añadir a `menu.items[]` colgando de un parámetro llamado `items`
  - `menu.hide_sticky` > eliminar
  - `menu.screen_sticky` > eliminar
  - Añadir `menu.sticky: auto`
  - `menu.size_sticky` > `menu.size`
  - `menu.hide_anchors` > `menu.show_sections`
  - `menu.show_blog_auto` > eliminar
  - `menu.show_products_auto` > eliminar
  - `menu.show_taxonomies_auto` > eliminar
  - `menu.search` > eliminar
  - `menu.google_translate` > eliminar
  - `menu.langs_in_more` > eliminar
  - `menu.langs_out` > eliminar
  - `callnow_active: undefined` > `callnow.hide: true`
  - `callnow_buttons` > `callnow.items`

- En todos los archivos de `content.*/section/*.yml` y `content.*/modal/*.yml`
  - `image_min` > eliminar
  - `image_max` > eliminar
  - `image_align` > eliminar
  - `anchor` > `hanchor`
  - `padding_hide` > `ph`
  - `padding_top` > `pt`
  - `padding_bottom` > `pb`
  - `menu` > `menu_label`
  - `button` > `menu_button`
  - `font_alt` > `menu_font_alt`
  - `opacity` > `alpha: ${1 - opacity}`
  - `container` > `box_color`
  - `container_gradient` > `box_gradient`
  - `container_gradient_type` > `box_gradient_type`
  - `container_opacity` > `box_alpha: ${1 - container_opacity}`
  - `rows` > `boxes`
    - `design.num` > `design.columns`
    - `design.num_xs: true` > `design.columns_min: 2`
    - `design.title_size` > `design.hs`
    - `items[*].title_size` > `items[*].hs`
    - `design.opacity` > `design.alpha: ${1 - design.opacity}`
    - `items[*].opacity` > `items[*].alpha: ${1 - items[*].opacity}`
    - `design.color_opacity` > `design.color_alpha: ${1 - design.color_opacity}`
    - `items[*].color_opacity` > `items[*].color_alpha: ${1 - items[*].color_opacity}`
    - `design.hide_bullets: true` > `design.bullets: hide`
    - `design.hide_arrows: true` > `design.arrows: hide`
    - `design.align_xl` > `design.align_max`
    - `items[*].align_xl` > `items[*].align_max`
    - Si `type: columns`
      - `design` > `box`
      - `items` > `boxes`
    - Si `type: steps`
      - `design` > `step`
      - `items` > `steps`
    - Si `type: gallery`
      - `design.alt: true` > `design.type: rows`
      - `design.wrap: true` > `design.color: white`
      - `design.cover: false` > `design.contain: true`
      - `design.gap: true` > `design.gap: .5`
      - `design.max` > eliminar
      - `design` > `gallery`
      - `items` > `limages`
    - Si `type: articles`
      - `categories` > `category`
      - `authors` > `author`
      - `kind: *` > `types: [*]`
      - `*` (todos menos `design`) > `list.*`
      - `design` > `box`
    - Si `type: collapsibles`
      - `design` > `collapsible`
      - `items` > `collapsibles`
    - Si `type: gss`
      - `id` > `gss`
      - `id_sheet` > `gss_sheet`
    - Si `type: reviews`
      - `design` > `review`
      - `items` > `reviews`
    - Si `type: contact`
      - `data` > `contact`
        - Si `type: address`
          - Si `active: true` entonces `label: ${streetAddress}, ${postalCode} ${addressLocality}, ${addressRegion}`
          - Si `active: true` entonces `anchor: ${name}, ${streetAddress}, ${postalCode} ${addressLocality}, ${addressRegion}, ${addressCountry}`
          - `rows[type: contact].data[type: address].active` > eliminar
          - `rows[type: contact].data[type: address].name` > eliminar
          - `rows[type: contact].data[type: address].streetAddress` > eliminar
          - `rows[type: contact].data[type: address].postalCode` > eliminar
          - `rows[type: contact].data[type: address].addressLocality` > eliminar
          - `rows[type: contact].data[type: address].addressRegion` > eliminar
          - `rows[type: contact].data[type: address].addressCountry` > eliminar
          - `rows[type: contact].data[type: address].coordinates` > eliminar
      - `form.action` > `action`
      - `form.items` > `inputs`
      - `fill_inputs` > eliminar
      - Si `map.active: true` y si `map.link` entonces `map.link` > `map.anchor`
      - Si `map.active: true` y no `map.iframe` entonces `map.anchor` = `${data[type: address].name}, ${data[type: address].streetAddress}, ${data[type: address].postalCode} ${data[type: address].addressLocality}, ${data[type: address].addressRegion}, ${data[type: address].addressCountry}`
      - Si `map.active: true` y si `map.iframe` entonces `map.link` > `map.anchor`
      - `map.divider` > eliminar
      - `map.flip_x` > eliminar
      - `map.flip_y` > eliminar
      - Si no `map.active: true` entonces eliminar `map`
      - `map.active` > eliminar
    - `type` > eliminar
  - Añadir como primer parámetro `name` con el nombre del archivo sin extensión como valor (en formato título: cambiando guiones medios por espacios y primera letra de cada palabra en mayúscula)

A tener en cuenta:
- Debe usar la biblioteca `yaml` con las siguientes preferencias para guardar cada archivo `.yml` o `.md` (frontmatter):
```json
{
  "toStringOptions": {
    "simpleKeys": true,
    "singleQuote": true,
    "blockQuote": "literal",
    "lineWidth": 0,
    "indent": 2,
    "indentSeq": false
  }
}
```
- Para editar el frontmatter de los archivos markdown (`.md`), utiliza algo como esto:
```js
import fs from 'fs'
import yaml from 'yaml'

// Lee el archivo Markdown
const markdownFileContent = fs.readFileSync('archivo.md', 'utf8')

// Utiliza una expresión regular para extraer el frontmatter y el contenido
const match = markdownFileContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)?/)

if (match) {
  const yamlContent = match[1] // Frontmatter YAML
  const markdownContent = match[2] || '' // Contenido Markdown (puede ser vacío)

  // Analiza el frontmatter YAML
  const frontmatter = yaml.parse(yamlContent)

  console.log('Frontmatter:', frontmatter)
  console.log('Contenido Markdown:', markdownContent)
} else {
  console.error('No se encontró frontmatter YAML válido en el archivo.')
}
```

### SHELL FINAL

### CAMBIOS Y COMPROBACIONES MANUALES

- Cambiar enlaces que apuntan a `#principal|#main` por id de la siguiente section a `header`
- Ojo con `shadow: true` (en `boxes`, `box` y `review`)
- `file:` en cada modal
- `header_article` > `menu.logo` and `menu.logo_sticky: false` with background section and container options
- `menu.items.more` > `menu.items + { label: Más, icon: plus, items: $1 }`
- `submited_` > `submited-`













## TO DO

- [ ] Fix
  - [ ] background gradient with parallax fix > fix!
  - [ ] main color text/link contrast
  - [ ] logo_sticky bg color
  - [ ] menu scroll spy
- [ ] Static CMS isues preview images in subdir and `public_folder: ''`
- [ ] `i18n` editable in cms?
- [ ] `buildFuture`
- [ ] 404 js
- [ ] `menu-gradient`
- [ ] Menu title in sticky
- [ ] `images` in `product` and `event`
- [ ] `pairings` > array with type (string, slice, number)?
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
- [ ] Check comments
- [ ] Check Google Translate ofuscate links and la propia traducción
- [ ] ¿Remove `columns` and `columns_min`? > Only `span` and `span_min`?
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
