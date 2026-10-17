# Grupos plegables del CMS

Las secciones, modales y cajas usan grupos plegables con el widget `object`
nativo de Sveltia. Sus campos conservan los widgets originales. La agrupación
solo existe en el editor: `title`, `md`, `color`, etc. se siguen guardando como
hermanos en el YAML que consume Hugo.

El selector `view` y sus estilos de ocultación se han retirado. Los valores
`view` antiguos no necesitan migración: se conservan como datos desconocidos y
ya no controlan el editor. El `view` de un campo geográfico sigue siendo válido.

## Activación y compatibilidad futura

Está activado por defecto. Para usar el editor plano, configura en `hugo.yml`:

```yaml
params:
  cms_groups: false
```

No vuelve el sistema de CSS anterior. La [propuesta oficial #592](https://github.com/sveltia/sveltia-cms/discussions/592)
no ofrece todavía un contrato público para detectar agrupación nativa. Por eso
se usa un único interruptor, sin adivinar versiones ni inspeccionar HTML interno.
Cuando exista una API estable, la sustitución se concentra en
`assets/js/cms/field-groups.js`; las declaraciones de pertenencia pueden seguir
siendo la fuente del esquema.

## Declarar pertenencia

`layouts/partials/cms/config/collections/sections.html` reúne los campos mediante
el parcial `cms/group`:

```go-html-template
{{ $titles := partial "cms/group" (dict
  "name" "titles" "label" (index . "cms_group_titles")
  "fields" (slice `~title` `~sub` `~hanchor`)
) }}
```

El parcial añade `_sansoul_group: {name, label}` a cada campo del esquema plano.
`cms/fields` concatena los segmentos sin anidar listas. Los textos se traducen
en `data/cms/es.yml` y `en.yml`. No se escriben esos metadatos en el contenido.
Un campo pertenece a un solo grupo en cada objeto; los nombres duplicados se
rechazan. Los grupos internos usan el prefijo reservado `_sansoul_group_`;
`_sansoul_source_token` también queda reservado para la presencia temporal.

## Lectura y guardado

La configuración publicada siempre es plana. Antes de iniciar Sveltia, el
adaptador registra un [formato personalizado público](https://sveltiacms.app/en/docs/api/file-formats)
por esquema y crea los objetos visuales en memoria. Los callbacks no reciben
la ruta ni la colección: cada formato conoce su propio esquema y cada objeto
se identifica explícitamente, sin depender del último documento abierto. Al
guardar deshace los grupos según ese mismo esquema.
La vista previa recibe los datos planos y traduce las rutas de foco al editor.

Si faltan las APIs necesarias (formatos o eventos), se desactiva la agrupación
o falla su preparación, se utiliza el esquema plano limpio. Si ni siquiera se puede cargar la configuración, no
se inicia un editor que pudiera guardar objetos virtuales por accidente.
No se modifica Sveltia ni se añaden estilos o selectores de agrupación.

La dependencia `yaml` analiza YAML y front matter YAML, preservando los valores
desconocidos, objetos/listas anidados y la distinción entre ausencia, `null`,
`false`, cero y vacíos explícitos. Se conserva `output.omit_empty_optional_fields`: Sveltia puede inicializar
campos ausentes con valores vacíos, que deben seguir omitiéndose. Un evento
público `preSave` captura los vacíos explícitos de los campos presentes en el
archivo original antes de que Sveltia filtre los datos. El serializador los
restaura. Referencias opacas por objeto mantienen esa presencia al reordenar o
copiar elementos; nunca se escriben en el YAML ni se envían al preview.
Si el evento no prepara un documento existente, el serializador rechaza el
guardado. Esto evita pérdida de datos si falla la carga de Immutable que usa
Sveltia para sus eventos. Las operaciones internas que serializan sin ese
evento pueden necesitar desactivar los grupos; el modo plano conserva las
operaciones nativas. No se interceptan esas funciones privadas. JSON/TOML u otros formatos configurados siguen
usando campos planos. Los enteros inseguros, claves duplicadas, colisiones con
el prefijo reservado y alias cíclicos se rechazan para evitar corrupción.

Se conserva la estructura y los valores, no una copia textual idéntica del
archivo: la API de formatos entrega objetos y normaliza saltos de línea. Al
guardar pueden cambiar comillas, orden, formato y comentarios. No se reescriben
archivos al compilar o abrir el editor.

## Verificación

```sh
node --test core/scripts/tests/groups.test.js core/scripts/tests/groups-initialization.test.js core/scripts/tests/cms-config.test.js
sh do check
```

Además de las pruebas, abre una sección y una página con cajas/modales anidados,
edita un campo dentro de un grupo, guarda y vuelve a abrir. Comprueba el YAML
resultante y compílalo con Hugo. Usa el backend de prueba aislado descrito en
[las vistas previas](cms-live-preview.md); no hace commits ni despliegues.

Para observar el texto real que el formato entrega al guardar, genera el fixture
con `--groups`. Añade una página de prueba con vacíos, campos desconocidos, cajas
y modales; un observador temporal de `registerCustomFormat` muestra el resultado
en `#fixture-saved-output` del DOM. No forma parte del CMS de producción. Compara
el YAML analizado con la fuente y las ediciones esperadas; no basta con releer el
formulario, porque Sveltia puede materializar campos que nunca existieron.
