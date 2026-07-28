# Manual de un proyecto SanSoul

Este es el manual humano compartido para el repositorio que consume SanSoul. Vive dentro de `themes/sansoul/` para distribuirse con el tema, pero todas sus rutas son relativas a la raíz del proyecto, dos niveles por encima.

Para la arquitectura interna del tema, consulta [`themes/sansoul/README.md`](README.md). Las instrucciones operativas se generan directamente en el `AGENTS.md` raíz desde `themes/sansoul/templates/root/AGENTS.md`; no son una traducción de este manual.

## Principios del proyecto

- La raíz contiene la configuración, el contenido y las personalizaciones de un sitio concreto.
- `themes/sansoul/` contiene el motor compartido y es un submódulo Git.
- Se priorizan los datos y la composición de secciones frente a los overrides de layouts.
- Los README se dirigen a personas y están escritos en español; los AGENTS se dirigen a agentes y están escritos en inglés. Se actualiza solo el documento cuya audiencia o contrato haya cambiado.
- No se deben incluir credenciales ni secretos en archivos rastreados: el contenido del sitio, la configuración generada del CMS y los parámetros de Hugo pueden terminar publicados.

## Requisitos e instalación

Necesitas Git y Hugo Extended. Para desarrollar sin `node_modules` en cada
proyecto, instala Dart Sass una sola vez en el `PATH`
(`brew install sass/sass/sass` en macOS). Node.js y las dependencias npm se
requieren para la preconstrucción y el build completo; `sh do hugo` las instala
si faltan. Las versiones de despliegue se fijan en `netlify.toml` y
`wrangler.toml`.

```sh
git clone --recurse-submodules <url-del-repositorio>
cd <carpeta-del-proyecto>
sh do server
```

Si el repositorio ya estaba clonado:

```sh
git submodule update --init --recursive
```

Solo debes usar `git submodule add https://github.com/seacomoseo/sansoul.git themes/sansoul` al crear un repositorio nuevo que aún no tenga la entrada de SanSoul en `.gitmodules`.

## Comandos principales

Ejecuta todos los comandos desde la raíz:

| Comando | Función |
| --- | --- |
| `sh do server` | Preconstruye y levanta el servidor local. |
| `sh do local` | Servidor del CMS con invalidación de caché y regeneración automática de la preconstrucción. |
| `sh do hugo` | Ejecuta la compilación completa y el posprocesado de imágenes. |
| `sh do migrations` | Muestra las adaptaciones pendientes para la versión instalada del tema. |
| `sh do root-docs` | Genera README/AGENTS raíz desde las plantillas canónicas del tema. |
| `sh do prebuild` | Regenera únicamente la configuración y el contenido intermedio. |
| `sh do imgs` | Regenera favicon, PNG derivados y variantes AVIF a partir de los manifiestos del build. |

`public/`, `resources/`, `.hugo_build.lock`, `postcss.config.js` y `themes/sansoul/prebuild/public/` son salidas generadas. No deben editarse a mano.

## Estructura del repositorio

### Contenido y datos

- `content/`: contenido traducible.
  - `content/<type>/*.<lang>.md`: entradas de una colección.
  - `content/<type>/_index.<lang>.md`: metadatos y URL de la página índice de una colección.
  - `content/single/_home.<lang>.md`: página de inicio de cada idioma.
  - `content/single/*.<lang>.md`: páginas únicas componibles.
  - `content/page/*.<lang>.md`: páginas simples; algunas tienen una implementación predeterminada en el tema.
  - `content/values.<lang>.yml`: valores globales por idioma, como menú, botones flotantes y pie.
- `data/`: configuración que Hugo fusiona con los valores del tema.
  - `data/config.yml`: comportamiento general, integraciones y CMS.
  - `data/langs.yml`: idiomas y ajustes por idioma.
  - `data/styles.yml`: tipografías, iconos, colores y estilos globales.
  - `data/types/*.yml`: colecciones y plantillas por tipo.
  - `data/section/*.yml`: secciones reutilizables del constructor de páginas.
  - `data/defaults.yml`: valores predeterminados aplicados por idioma, tipo o ruta.
  - `data/customs.yml`: campos de contenido personalizados que también se exponen en el CMS.
  - `data/remote.yml`: fuentes remotas que la preconstrucción transforma en contenido local.
  - `data/redirects.yml`: redirecciones generadas para el despliegue.
- `dna/`: identidad, criterios y restricciones particulares del proyecto.
  - `dna/_index.md`: resumen obligatorio e índice que indica qué otros documentos consultar según la tarea.

Desde Hugo 0.164, `y` y `n` son cadenas, no booleanos. En `hugo.yml` y otros
archivos de configuración escribe `true` o `false`. En `content/` y `data/`,
los campos pseudobooleanos que administra el CMS usan `1` para activar y `0`
para desactivar; si la clave no existe, hereda el valor de la cadena de merges.
Sveltia conserva expresamente el `0` aun con `omit_empty_optional_fields`.

### Personalización y archivos públicos

- `assets/_custom.scss`: estilos adicionales incluidos en el CSS final.
- `assets/custom.js`: JavaScript adicional, si existe.
- `assets/robots.txt`: reglas adicionales para rastreadores; el sitemap se incorpora durante el build.
- `assets/llms.txt`: contenido adicional para el archivo `llms.txt` generado.
- `uploads/`: medios originales administrables por el CMS.

`uploads/foo/bar.png` se monta como recurso y como archivo estático. En el contenido se referencia mediante `/u/foo/bar.png`, no mediante `/uploads/...`.

### ADN del proyecto

`dna/_index.md` es obligatorio y se lee antes de trabajar. Resume la identidad y las restricciones del sitio, enumera los demás documentos de `dna/` y explica cuándo consultar cada uno. Un agente no debe cargar todo el directorio por defecto: lee el índice y abre solo las referencias pertinentes para la tarea. Si el índice falta, está vacío o conserva únicamente los textos orientativos de la plantilla, debe preguntar al usuario cómo definirlo antes de realizar trabajo específico del proyecto.

Utiliza Markdown para las reglas y resúmenes que deban buscarse con facilidad. PDF, imágenes y otros originales pueden convivir como fuentes de apoyo, siempre enlazados desde el índice con una indicación clara de su autoridad. Copy, audiencia, identidad visual, negocio e integraciones son ejemplos, no una estructura obligatoria.

Las particularidades nunca deben añadirse a README/AGENTS raíz porque son generados. `sh do root-docs` crea un índice orientativo cuando falta, pero no copia en él contenido de documentos antiguos. Después, el ADN pertenece exclusivamente al proyecto y no se sobrescribe al sincronizar.

### Operación del proyecto

- `hugo.yml`: URL base y parámetros privados del proyecto —privados en el sentido de específicos, no secretos—.
- `package.json`: dependencias Node utilizadas por Hugo y los scripts de posprocesado.
- `netlify.toml` y `wrangler.toml`: configuración de despliegue.
- `.github/workflows/`: automatizaciones; `backup.yml` replica el repositorio en GitLab.
- `TODO.md`: lista humana de tareas y anotaciones; los agentes no deben leerla ni modificarla salvo petición expresa.

## El ciclo de construcción

SanSoul usa dos compilaciones de Hugo.

1. El wrapper raíz `do` delega en `themes/sansoul/do`.
2. La preconstrucción ejecuta el sitio Hugo de `themes/sansoul/prebuild/`.
3. Ese sitio combina `hugo.yml`, idiomas, tipos, defaults y fuentes remotas.
4. Escribe `themes/sansoul/prebuild/public/hugo.prebuild.yml` y contenido intermedio.
5. La compilación principal carga, en orden, la configuración base del tema, la configuración generada y `hugo.yml`.
6. Hugo monta contenido, datos, uploads, iconos y dependencias en su sistema de archivos virtual.
7. En producción, el script de imágenes procesa los manifiestos creados por Hugo.

`sh do local` vigila las entradas de la preconstrucción, agrupa cambios rápidos, detiene el servidor principal, regenera la salida intermedia y lo inicia de nuevo. Con `sh do server`, reinicia manualmente cuando cambies:

- `data/config.yml`, `data/langs.yml`, `data/defaults.yml`, `data/customs.yml` o `data/remote.yml`;
- `data/types/*.yml`, salvo cambios estrictamente internos a `tpl` que Hugo pueda recargar;
- `content/<type>/_index.<lang>.md`, especialmente `permalinks`.

El reinicio administrado evita que Hugo lea `prebuild/public/` mientras se está reescribiendo. Si el prebuild falla, el supervisor no inicia el servidor con una salida parcial: queda a la espera del siguiente cambio para volver a intentarlo.

## Idiomas y valores globales

Cada entrada traducible usa el sufijo `.<lang>.md`, por ejemplo `servicio.es.md`. `data/langs.yml` declara los idiomas disponibles; `hide: 1` desactiva uno en el proyecto sin borrar su configuración.

`content/values.<lang>.yml` se monta internamente como `data/values.<lang>.yml`. Sus usos habituales son:

- `menu`: logo, título, subtítulo y navegación personalizada;
- `callnows`: accesos flotantes;
- `footer`: contenido y aspecto del pie;
- cualquier valor propio consumido por `get` o por el shortcode `get`.

## Tipos de página

Un archivo `data/types/<type>.yml` declara una colección. Sus páginas viven en `content/<type>/` y su índice opcional en `content/<type>/_index.<lang>.md`.

Los tipos base reconocidos incluyen `article`, `event`, `product`, `brand`, `author`, `org`, `service` y `page`. Nombres habituales como `blog`, `new`, `category`, `supplier` o `manufacturer` reciben valores i18n predeterminados, pero pueden sobrescribirse por completo.

Tres tipos tienen un papel estructural:

- `all`: defaults de plantilla compartidos por todas las páginas;
- `single`: páginas únicas, cuya composición puede ampliarse en su propio front matter;
- `page`: páginas simples y páginas de sistema como legal, privacidad, cookies, sitemap, búsqueda y CMS.

Si `data/types/all.yml`, `single.yml` o `page.yml` no existen en la raíz, se usan los equivalentes del tema.

Parámetros relevantes de un tipo:

- `base`: familia semántica y de schema;
- `title`, `icon`, `emoji`, `weight`: presentación en CMS e índices;
- `hide`, `noindex`, `body`, `comments`, `rel`: capacidades y valores predeterminados;
- `tax_of`: relaciones entre colecciones;
- `tpl`: composición visual.

## Composición `tpl`

El constructor no depende de un layout distinto por cada página. Fusiona objetos `tpl` y renderiza una lista de secciones.

Prioridad general, de menor a mayor:

1. defaults internos del tema;
2. valores globales por idioma;
3. `data/types/all.yml`;
4. `data/types/<type>.yml`;
5. `content/single/<page>.<lang>.md` para páginas únicas;
6. valores específicos de la página.

Dentro de `tpl`:

- `section`: defaults de secciones. El elemento `0` se aplica a todas; los elementos siguientes se aplican cíclicamente por posición.
- `sections`: lista concreta de secciones que se van a renderizar.
- `bg`, `menu`, `callnow`, `list` y `rel`: configuración compartida de fondo, navegación y listados.

Una base habitual es:

```yml
tpl:
  sections:
  - file: base-_header
  - file: base-toc
  - file: base-content
  - file: base-address
  - file: base-author
  - file: base-social
  - file: base-comments
  - file: base-children
  - file: base-share
  - file: base-rel
```

Cada `file` carga `data/section/<file>.yml`. La raíz puede definir secciones propias o sobrescribir las secciones base del tema con el mismo nombre.

## Secciones, cajas y bloques

La jerarquía de renderizado es:

```text
página → secciones → cajas → bloques o subcajas
```

Una sección controla fondo, tamaño, espaciado, separadores, entrada de menú y modales. `boxes` contiene sus cajas y `box` define valores compartidos para ellas.

Las cajas aceptan títulos, Markdown, icono, imagen o vídeo, botón, fondo, distribución y composición recursiva. Algunas claves activan bloques especializados:

| Clave | Bloque |
| --- | --- |
| `list` | Listado de páginas o relaciones. |
| `steps` | Pasos de un proceso; `step` configura sus defaults. |
| `imgs` / `limgs` | Galería; `gallery` configura el conjunto. |
| `faqs` | Preguntas desplegables; `faq` configura el conjunto. |
| `reviews` | Reseñas; `review` configura el conjunto. |
| `inputs` | Formulario; `form` configura envío y presentación. |
| `geos` | Mapa; `map` configura vista y capas. |
| `links`, `dots`, `when`, `gss` | Enlaces, redes, horarios y datos tabulares. |
| `boxes` | Subcajas recursivas. |

`get` obtiene valores de la página o de `content/values.<lang>.yml`. `remap` mueve, copia o elimina rutas de parámetros. `if` condiciona el renderizado. Son herramientas potentes: pruébalas con una página aislada antes de reutilizarlas globalmente.

Consulta [`_examples/data/section/example.yml`](_examples/data/section/example.yml) como catálogo comentado y [`_examples/content/blog/2020-01-01-entrada.es.md`](_examples/content/blog/2020-01-01-entrada.es.md) como chuleta de Markdown.

## CMS

SanSoul genera la configuración de Sveltia CMS a partir de los idiomas, tipos, secciones, defaults y campos personalizados. Tras construir, la configuración final se encuentra en `public/admin/config.<hash>.yml` y se enlaza desde `public/admin/index.html`.

Esa salida es la referencia más precisa para comprobar qué campos ve el editor, pero nunca debe modificarse a mano. En Sveltia CMS los campos son obligatorios de forma predeterminada; usa `required: false` cuando corresponda.

Cuando cambies el modelo de contenido:

1. usa `sh do local` y espera a que termine la regeneración automática;
2. comprueba que se genera el YAML del CMS;
3. abre `/admin/` y prueba crear o editar una entrada representativa;
4. compila el contenido guardado por el CMS.

## Defaults y campos personalizados

`data/defaults.yml` aplica valores sin repetirlos en cada archivo. Debido a su alcance, una regla demasiado amplia puede cambiar muchas páginas; usa selectores de ruta, tipo e idioma tan específicos como sea posible.

`data/customs.yml` declara campos adicionales. Un campo puede exponerse al CMS y luego consumirse desde una sección mediante `get`. Para rutas anidadas se usa notación de puntos, por ejemplo `example.param`.

## Fuentes remotas

`data/remote.yml` permite generar contenido antes del build desde JSON, YAML, Markdown, CSV u otros recursos. La preconstrucción es determinista solo si la fuente también lo es. Evita credenciales en URLs, define fallos aceptables de forma explícita y no dependas de una API remota para contenido crítico sin una estrategia de caché o respaldo.

## Overrides del tema

Hugo permite sobrescribir layouts, partials, shortcodes, assets y datos del tema desde la raíz. Úsalo solo cuando la diferencia sea propia de un proyecto. Si la corrección beneficia a todos los sitios, debe hacerse en el submódulo y publicarse como una actualización del tema.

Un override crea una bifurcación silenciosa: documenta el motivo, el archivo original y cómo comprobarlo tras actualizar el submódulo.

## Ejemplos reutilizables

`themes/sansoul/_examples/` es a la vez un sitio de demostración copiable y un conjunto de chuletas. Para poblar un proyecto vacío, copia sus carpetas `data/` y `content/` sobre la raíz después de revisar posibles colisiones. Lee primero su [`README.md`](_examples/README.md).

## Actualizar el tema

El `package.json` del tema declara la versión instalada; el de la raíz declara la última versión con la que el proyecto ya es compatible. Las acciones necesarias para pasar de una a otra se publican en [`MIGRATIONS.md`](MIGRATIONS.md).

Puedes delegar el flujo completo a Codex simplemente con:

> Actualiza el submódulo.

Las instrucciones del repositorio convierten esa petición en el flujo completo: el agente lee los contratos aplicables, conserva cambios existentes, actualiza el tema, ejecuta migraciones, valida y sincroniza las versiones. La petición no autoriza commit, push ni despliegue.

Después de actualizar el submódulo:

1. ejecuta `sh do migrations`;
2. aplica las migraciones pendientes en orden;
3. construye y revisa el proyecto;
4. ejecuta `sh do migrations mark --yes` únicamente cuando la compatibilidad esté comprobada; el comando sincronizará la versión de `package.json` y, si existe, de `package-lock.json` en la raíz.

El comando informa y verifica; no modifica contenido ni configuración automáticamente. Una migración concreta puede ofrecer un script idempotente, pero nunca se ejecutará como efecto secundario de un build o de la actualización del submódulo.

### Archivos README y AGENTS de la raíz

No se modifican como efecto secundario de Git. Después de actualizar el submódulo, una migración puede pedir `sh do root-docs`. README y AGENTS raíz son archivos genéricos generados íntegramente desde `themes/sansoul/templates/root/`; sus cabeceras advierten que no deben personalizarse.

Si README/AGENTS no fueron generados, `sh do root-docs` se niega a sobrescribirlos sin `--force`. Con `--force` los reemplaza íntegramente y descarta su contenido: no intenta interpretarlo ni trasladarlo al ADN. Si falta `dna/_index.md`, crea únicamente el scaffold orientativo. En actualizaciones posteriores puede reemplazar README/AGENTS de forma segura, pero nunca sobrescribe el ADN.

El README raíz es una portada breve que enlaza este manual. El AGENTS raíz contiene el contrato operativo completo para que Codex lo descubra sin lecturas indirectas. Toda particularidad debe vivir en `dna/`, cuyo `_index.md` se lee siempre y dirige hacia los documentos relevantes.

## Despliegue

Tanto Netlify como Cloudflare Pages publican `public/` y ejecutan `sh do hugo`. Mantén alineadas las versiones de Hugo Extended y Node declaradas por cada plataforma y prueba localmente esas mismas versiones antes de actualizar.

El workflow `.github/workflows/backup.yml` inicializa los submódulos y ejecuta el script de réplica del tema. Sus tokens deben vivir exclusivamente en secretos del proveedor.

## Lista mínima de validación

Antes de dar por terminado un cambio:

1. revisa `git status` en la raíz y dentro del submódulo;
2. ejecuta `sh do hugo` y comprueba que también finaliza el posprocesado de imágenes;
3. distingue avisos de red de errores reales de plantillas o assets;
4. prueba las páginas afectadas y `/admin/` cuando cambie el modelo de contenido;
5. revisa la página de referencia de separadores indicada en el ADN, si existe, cuando cambies secciones o estilos;
6. verifica enlaces, responsive, accesibilidad básica y consola del navegador;
7. sincroniza la documentación afectada.
