# SanSoul Hugo Theme

[![sansoul](/assets/media/logo.png)](https://github.com/lorensansol/sansoul)


# TO DO LIST

- cms
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
  - probar i18n
  - quitar "(opcional)" de las etiquetas
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
