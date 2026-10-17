# Metadatos Markdown en SanSoul 8

Los parámetros se escriben en un bloque `{…}` al final del título Markdown. El título visible y el texto alternativo de una imagen siguen siendo contenido editorial.

```md
[Enlace](/destino/ "Texto del título {blank}")
[[::svg:arrow-right:: Botón]](/destino/ "Texto del título {main dot sm}")
[Enlace ofuscado](https://example.com/ "Texto del título {lock}")
![](/u/foto.jpg "Leyenda {3/2}")
![Descripción accesible de la foto](/u/foto.jpg "Leyenda {3/2}")
![](/u/foto.jpg "{3/2}")
```

`lock` reemplaza el antiguo `nofollow`: conserva la ofuscación existente de SanSoul. No es un cambio del atributo HTML `rel`. Se conservan `homefollow`, `blank`, `ga4` y los parámetros de los botones (`main`, `alt`, `cta`, `light`, `dark`, `turn`, `such`, `whatsapp`, `dot`, `sm`, `swap`). Los corchetes del texto de los botones siguen siendo `[[Botón]]`.

Solo se interpreta un bloque final formado por parámetros conocidos. Un título normal como `Informe [edición revisada]` o `Informe {edición revisada}` se conserva. El ratio de las imágenes es una fracción, por ejemplo `3/2`, `16/9` o `1/1`; no forma parte de la leyenda publicada. Una imagen con ratio puede mantener un `alt` descriptivo. Los vídeos sin ratio explícito aprovechan los metadatos de su fuente y conservan el valor de respaldo cuando faltan.

El editor de enlaces, las galerías y las imágenes en línea de Sveltia leen el formato anterior y escriben el nuevo. Las comillas y barras del título se escapan al guardar. La galería simple comparte título, ratio y texto alternativo entre sus imágenes; para textos alternativos distintos utiliza la galería completa.

## Migración

`sh do update` ejecuta `scripts/migrations/8.0.0-markdown-metadata.js` al cruzar la versión 8.0.0. Para revisar o repetir la migración desde la raíz de un proyecto con instalación `core`:

```sh
node core/scripts/migrations/8.0.0-markdown-metadata.js --check
node core/scripts/migrations/8.0.0-markdown-metadata.js
```

En instalaciones antiguas sustituye `core/` por `themes/sansoul/`. No es necesario cambiar de ruta para utilizar el formato nuevo.

La migración es idempotente y procesa los archivos `.md`, `.yml` y `.yaml` de `content/` y `data/`, incluidos escalares simples entre comillas YAML y textos Markdown en bloques literales `|`. Los bloques se desindentan para distinguir el código Markdown de la estructura YAML y después recuperan su indentación original. Convierte los bloques reconocidos de enlaces y los textos alternativos que solo contienen un ratio. Mantiene el código entre backticks, los bloques de código cercados, el código Markdown indentado y los enlaces simbólicos, incluidas las carpetas raíz `content/` o `data/` si son enlaces. No reescribe archivos de otras carpetas ni reformatea YAML completo.

Por prudencia, se conservan los bloques con parámetros desconocidos. Si una región YAML contiene listas entre comillas, colecciones flow (`[...]`/`{...}`), comillas multilínea, bloques con anclas o etiquetas YAML, u otros escapes no compatibles con JSON, se conserva toda esa región sin modificar y el comando avisa del archivo que requiere revisión manual. En Markdown solo se omite el front matter afectado: el cuerpo puede migrarse por separado. Los bloques plegados `>` y los bloques con indentación explícita (`|2`, etc.) se conservan por separado con un aviso. Esta decisión evita alterar el entrecomillado, el plegado o corromper YAML; el formato anterior continúa funcionando. Los formatos Markdown no soportados por los componentes actuales, como títulos delimitados con comillas simples, no se convierten automáticamente. La compatibilidad de lectura de los formatos antiguos sigue disponible; revisa las personalizaciones del proyecto antes de retirar esa compatibilidad en el futuro.
