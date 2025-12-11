# SanSoul Hugo Theme

[![sansoul](/uploads/base/icon.png)](https://github.com/seacomoseo/sansoul)


## Scripts para actualizar proyectos a v3
- `node ../_tools/updater/migrations-v2/modals.js`
- `node ../_tools/updater/migrations-v2/sections.js`
- `node ../_tools/updater/migrations-v2/langs.js`
- `../_tools/updater/migrations-v2/home.sh`
- `node ../_tools/updater/migrations-v2/menu.js`
- `../_tools/updater/migrations-v2/icons.sh`
- `node ../_tools/updater/migrations-v2/icons.js ../_tools/updater/migrations-v2/fontawesome-to-materialsymbol.json`
- `../_tools/updater/migrations-v2/cms.sh`
- `../_tools/updater/migrations-v2/v3.sh`

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
    - `weight: (.+)`
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


## New language

- `themes/sansoul`
  - [ ] `./hugo.default.yml` > `languages`
  - [ ] `./data/options.yml` > `langs`
  - [ ] `./i18n/new.yml`
  - [ ] `./i18n/*.yml` add `option-langs-{lang}`
