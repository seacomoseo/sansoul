{{ range .Translations }}
CMS.registerAdditionalLink({
  id: '{{ .Lang }}',
  title: '{{ .Language.LanguageName }}',
  data: '{{ .Site.Home.RelPermalink }}admin/'
})
{{ end }}