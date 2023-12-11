# SanSoul Hugo Theme

[![sansoul](/assets/media/logo.png)](https://github.com/lorensansol/sansoul)


# TO DO LIST

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
  - `form.items > form` (ojo `actions`)

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
