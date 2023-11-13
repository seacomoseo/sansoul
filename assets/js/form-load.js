{{ partial "types/forms" (dict "js" true "Page" .Page)
  | replaceRE `\s{2,}` ` `
  | replaceRE `\n` ``
}}