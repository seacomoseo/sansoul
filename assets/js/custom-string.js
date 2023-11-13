{{ $context := . }}
{{ with partial "functions/lang-params-custom-code" (dict "params" "js") }}
  {{-
    (.
      | resources.FromString (print "aux_js." $.Lang)
      | resources.ExecuteAsTemplate (print "aux_js." $.Lang) $context
    ).Content
    | safeJS
  -}}
{{ end }}