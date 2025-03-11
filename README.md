# SanSoul Hugo Theme

[![sansoul](/assets/media/base/icon.png)](https://github.com/seacomoseo/sansoul)


## Comprobar cambios en `example.yml`
## Script para actualizar proyectos
### CAMBIOS Y COMPROBACIONES MANUALES

- `*.yml`
  - `placeholder` > `label`
- `content.${lang}`
  - `_index.md`
    - `images`
    - `schedule`
  - `{sections|modals}/*.yml`
    - `contacto.yml`
      - `address.geo`
      - `geos`
      - `form.email`
    - `mapa.yml`
      - `geos`
    - Cambiar enlaces que apuntan a `#principal|#main` por id de la siguiente section a `header`
    - Ojo con `shadow: true` (en `boxes`, `box` y `review`)
    - `hs`
    - `ratio`
    - `rate`
  - `single/*.md`
    - `menu.hide_anchors`
- `types/*.yml`
    - `template.list`
      - `tags`
      - `reading_time`
      - `hide_categories`
- `types/all.yml`
  - columns: 3
    image: gradient
    ratio: 16x9
    inset: true
    align: left
    color: white
    hide_categories: true
    reading_time: true
    button: hide
  - cols: 3
    color: white
    shade: true
    inset: true
    ratio: 16/9
    icon: hide
    align: left
    button: hide
    tags:
    - type: date
    - type: address
- `types/*.yml|content.${lang}/single/*.md`
  - `file:` en cada modal
  - `header_article` > `menu.logo` and `menu.logo_sticky: false` with background section and container options
  - `menu.items.more` > `menu.items + { label: Más, icon: plus, items: $1 }`
- `assets/css/_custom.scss`
- `assets/js/custom.js`
  - `submited_` > `submited-`
- `data/config.yml`
  - `langs.0.google_analytics`
  - `langs.0.email`
- coordinates


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
- [ ] `images` in `product` and `event`
- [ ] Rehuse `boxes` partial in `reviews`
- [ ] `search.html`
- [ ] `.cols--gap-0`
- [ ] cp `data/templates` > `themes/sansoul/data/templates`
- [ ] Reset `cookies`.md
- [ ] Reset `admin`.md
- [ ] Check `forms` `actions`
- [ ] Check comments
- [ ] Check Google Translate ofuscate links and la propia traducción
- [ ] ¿Remove `cols` and `cols_vs`? > Only `fit` and `fit_vs`?
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
