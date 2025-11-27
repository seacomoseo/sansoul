# SanSoul Hugo Theme

[![sansoul](/uploads/base/icon.png)](https://github.com/seacomoseo/sansoul)


## Scripts para actualizar proyectos nuevos
- `node ../_tools/updater/migrations-v2/modals.js`
- `node ../_tools/updater/migrations-v2/sections.js`
- `node ../_tools/updater/migrations-v2/langs.js`
- `../_tools/updater/migrations-v2/home.sh`
- `node ../_tools/updater/migrations-v2/menu.js`
- `../_tools/updater/migrations-v2/icons.sh`
- `node ../_tools/updater/migrations-v2/icons.js ../_tools/updater/migrations-v2/fontawesome-to-materialsymbol.json`
- `../_tools/updater/migrations-v2/cms.sh`
- `../_tools/updater/migrations-v2/v3.sh`

## Comprobar cambios en `example.yml`
## Script para actualizar proyectos antiguos
### CAMBIOS Y COMPROBACIONES MANUALES

- `: ''`
- `*.yml`
  - `placeholder` > `label`
- `content`
  - `values.${lang}.yml`
  - `_home.${lang}.md`
    - `images`
    - `schedule`
  - `{blog|event}/*.${lang}.yml`
    - `{date|mod}: 2025-02-18 00:00:00` (`T` > ` `)
  - `single/*.${lang}.md`
    - `menu.hide_anchors`
    - `menu|modal|section|sections|...` > `tpl.*`
- `data/section/*.yml`
  - `base-footer.yml`
  - `contacto.yml`
    - `address.geo`
    - `geos`
    - `form.mail`
  - `mapa.yml`
    - `geos`
  - Cambiar enlaces que apuntan a `#principal|#main` por id de la siguiente section a `header`
  - Ojo con `shadow: true` (en `boxes`, `box` y `review`)
  - `hs`
  - `ratio`
  - `rate`
- `data/types/all.yml`
  - columns: 3
    image: gradient
    ratio: 16x9
    inset: y
    align: left
    color: white
    hide_categories: y
    reading_time: y
    button: hide
  - cols: 3
    align: left
    color: such
    shade: y
    inset: y
    ratio: 16/9
    icon: hide
    btn: hide
    tags:
    - type: date
- `data/types/*.yml`
    - `tpl.list`
      - `tags`
      - `reading_time`
      - `hide_categories`
- `data/types/*.yml|content/single/*.${lang}.md`
  - `header_article` > `menu.logo` and `menu.logo_sticky: false` with background section and container options
  - `menu.items.more` > `menu.items + { label: Más, icon: plus, items: $1 }`
- `assets/_custom.scss`
- `assets/custom.js`
  - `submited_` > `submited-`
- `data/config.yml`
  - `ga4`
  - `mail`
- coordinates


## TO DO

- [ ] Fix
  - [ ] background gradient with scroll fix > fix!
- [ ] `buildFuture`
- [ ] Rehuse `boxes` partial in `reviews`
- [ ] `search.html`
- [ ] Check Google Translate ofuscate links and la propia traducción
- [ ] ¿Remove `cols` and `cols_vs`? > Only `fit` and `fit_vs`?
- cms
  - condition for show or hide widgets: https://www.staticcms.org/docs/widgets#example
  - listas plegadas cambian el nombre de la etiqueta por el de su hijo cuando solo hay uno
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
- button in shpreadsheet (and CMS?) to build


## New language

- `themes/sansoul`
  - [ ] `./hugo.default.yml` > `languages`
  - [ ] `./data/options.yml` > `langs`
  - [ ] `./i18n/new.yml`
  - [ ] `./i18n/*.yml` add `option-langs-{lang}`
