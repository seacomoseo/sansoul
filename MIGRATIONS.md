# Migraciones de SanSoul

Este archivo registra únicamente cambios del tema que requieren revisar o modificar un proyecto consumidor. No sustituye al historial de Git ni pretende enumerar correcciones internas.

La versión publicada del tema vive en `package.json` y sigue [Semantic Versioning](https://semver.org/):

- **major**: incompatibilidad deliberada o migración obligatoria;
- **minor**: funcionalidad compatible; puede incluir una adaptación opcional;
- **patch**: corrección compatible sin cambios esperados en el proyecto.

El `package.json` del tema declara la versión instalada y el `package.json` de la raíz declara la última versión con la que el proyecto es compatible. `sh do migrations` compara ambos valores y muestra las secciones pendientes; `sh do update` coordina el avance del submódulo con sus scripts automáticos, README/AGENTS raíz y validación.

## Flujo de actualización

```sh
# Desde la raíz del proyecto consumidor; primero solo inspecciona
sh do update --check

# Ejecuta la actualización tras pasar las comprobaciones previas
sh do update
```

El actualizador exige árboles Git limpios, salvo que la única diferencia de la raíz sea un gitlink de SanSoul ya avanzado de forma limpia y directa durante el arranque inicial. Descarga la rama declarada en `.gitmodules`, acepta solo avances directos, comprueba las migraciones conocidas y sus conflictos, y nunca fuerza la sustitución de README/AGENTS raíz no generados. `--check` descarga referencias Git, pero no cambia archivos ni el commit de SanSoul seleccionado.

Después del preflight, `sh do update` avanza el submódulo, ejecuta los scripts de migración registrados, sincroniza siempre README y AGENTS desde las plantillas de SanSoul, instala dependencias cuando una migración lo requiere y compila el proyecto. Si quedan validaciones específicas de una migración, las muestra y solicita confirmación antes de sincronizar la versión raíz. En una ejecución no interactiva deja la versión sin cambiar; tras completar las comprobaciones, ejecuta `sh do migrations mark --yes`.

Para añadir una versión a `MIGRATIONS.md`, registra también su política en `scripts/update.js`. Si el actualizador no reconoce una migración pendiente, se detiene antes de cambiar archivos. Las acciones destructivas como `sh do root-docs --force` nunca se ejecutan automáticamente.

El comando no confirma ni publica cambios. Revisa el diff de la raíz y del submódulo y confirma cada repositorio según el flujo del proyecto.

## Cómo añadir una migración

Añade una sección `## x.y.z — fecha` por cada versión que requiera intervención. Indica:

- **Impacto**: qué proyectos están afectados;
- **Acciones obligatorias**: pasos concretos, comprobables y en orden;
- **Automatización**: script idempotente disponible, si existe;
- **Validación**: resultado que demuestra compatibilidad.

Si una transformación puede automatizarse con seguridad, colócala en `scripts/migrations/` y enlázala desde la sección. No ejecutes migraciones automáticamente durante `hugo`, `server`, `local` ni al actualizar el submódulo.

Desde `5.1.0`, README y AGENTS de la raíz son genéricos y se generan íntegramente desde `templates/root/`. Las particularidades pertenecen exclusivamente a `dna/`.

## 8.0.0 — 2026-10-15

**Impacto:** nueva sintaxis canónica de metadatos Markdown, selección del motor
derivada del prebuild, metadatos de vídeo persistentes, recursos compartidos y una vista previa
experimental para colecciones de contenido y grupos plegables del CMS. Se mantiene la lectura de Markdown legado y la ubicación
`themes/sansoul`; no se mueve ningún submódulo automáticamente.

### Migraciones automáticas

`sh do update` ejecuta:

1. `core/scripts/migrations/8.0.0-project-config.js`: retira selectores de tema
   redundantes reconocidos, ordena `domain`, `owner`, `name` y actualiza los
   wrappers históricos conocidos. Conserva configuraciones personalizadas con
   un aviso para revisarlas.
2. `core/scripts/migrations/8.0.0-markdown-metadata.js`: convierte los parámetros
   de títulos de enlaces a `{…}`, `nofollow` a `lock` y el ratio de imágenes del
   alt al título. Preserva código y las formas que no puede convertir con
   seguridad; el renderizador mantiene compatibilidad con ellas.

3. `core/scripts/migrations/8.0.0-cms-groups.js`: añade `yaml` a las dependencias
   de ejecución si falta (o la mueve desde desarrollo); conserva versiones
   personalizadas. El actualizador sincroniza el lockfile con el gestor declarado.

Los tres scripts admiten `--check`. La migración no cambia el gestor de paquetes:
pnpm sigue siendo una elección explícita mediante la herramienta documentada.

### Comprobaciones

- La nueva dependencia requiere instalación: en consumidores npm, `npm install`;
  en pnpm, `pnpm install --no-frozen-lockfile` tras la migración para sincronizar
  el lockfile. El actualizador lo coordina; CI continúa usando lockfile congelado.
- Los [grupos plegables](docs/cms-field-groups.md) sustituyen el selector `view`
  sin anidar el YAML guardado. No elimines datos `view` existentes en masa:
  algunos campos geográficos usan ese nombre. Verifica editar/guardar/reabrir
  cajas y modales. `params.cms_groups: false` ofrece el editor plano. Los
  serializadores preservan valores, pero pueden normalizar formato y comentarios.
- Revisa imágenes, enlaces especiales y los avisos de migración; compila el
  contenido y abre entradas representativas en el CMS.
- El prebuild genera `theme` y `themesDir` para la ubicación instalada. No edites
  `prebuild/public/hugo.prebuild.yml`. Si quieres mover el submódulo, actualiza
  primero el motor y sigue [el procedimiento](docs/core-migration.md).
- Versiona `data/video_metadata.json` después de revisar los metadatos generados.
  FFprobe solo se necesita para inspeccionar vídeos locales nuevos o cambiados;
  las dimensiones de YouTube no se inventan. Véase [vídeos](docs/video-metadata.md).
- La [vista previa experimental](docs/cms-live-preview.md) queda activada en las
  colecciones de contenido. Revisa su aviso, el Markdown, medios y clic hacia
  campos anidados en `/admin/`. No evalúa `if` ni reconstruye la estructura.
- Los metadatos de medios usan `vid_width`, `vid_height`, `vid_duration`,
  `vid_upload`, `vid_title` y `vid_desc`. Los nombres anteriores siguen como
  alias; no requieren una migración de archivos. El CMS guarda `vid_upload`
  como fecha UTC `YYYY-MM-DD HH:mm:ss` y el JSON-LD la normaliza a ISO 8601.
  Revisa también un enlace `/shorts/` sin ratio conocido: su fallback es vertical.
- Los posters locales generados se guardan en `uploads/video-posters/`; revisa y
  versiona los usados junto con la caché. Los `VideoObject` sin nombre, poster o
  fecha real de publicación se omiten con un aviso.
- Producción comparte segmentos CSS y módulos JS. Revisa la navegación, los
  componentes y cualquier CSP personalizada; desarrollo conserva el bundle
  completo. Los nombres con hash son salidas generadas.

No todas las decisiones anteriores son migraciones automáticas: el cambio de
ruta y la conversión de gestor permanecen explícitos. El actualizador rechaza
árboles con cambios y no hace staging, commits, push ni despliegues.

## 7.7.0 — 2026-10-15

**Impacto:** el motor admite `core/` y la ubicación anterior `themes/sansoul/`.
La referencia copiable usa `core/`; actualizar un consumidor existente no mueve
automáticamente su submódulo.

### Acciones

1. Conserva la ubicación actual o sigue la [migración de ruta](docs/core-migration.md).
   El wrapper, el prebuild, los scripts y los documentos generados resuelven la
   ruta instalada. El nombre interno de Git puede seguir siendo `themes/sansoul`.
2. Regenera README/AGENTS con `sh do root-docs` y ejecuta `sh do check`.
3. Revisa las páginas sencillas y las que contienen componentes interactivos
   con el build de producción antes de sincronizar la versión compatible.
   Desarrollo conserva el pipeline completo.
4. La referencia incluye contenido ficticio para probar colecciones y bloques.
   Ese contenido pertenece al consumidor: actualizar solo el motor no lo copia
   a los sitios existentes. No habilites un proveedor real de formularios en
   las pruebas.

El proceso no cambia el repositorio remoto ni crea commits, staging, push o
despliegues. `sh do update` sigue rechazando cambios pendientes, incluido un
cambio de ruta todavía sin registrar en el índice de Git.

## 7.6.0 — 2026-10-14

**Impacto:** desarrollo local y proyectos que opten por usar pnpm. La conversión
de gestor es opcional; actualizar el tema no convierte otros proyectos.

### Cambios relevantes

- `sh do dev` y `sh do live` son los nombres preferidos de `server` y `local`;
  los nombres anteriores siguen funcionando como alias.
- `live` reinicia Hugo tras un prebuild válido para reconstruir desde cero;
  conserva la última configuración válida cuando el prebuild falla y recupera
  fallos de Hugo asociados a la actualización cuando se corrigen las entradas.
- Los servidores administrados bloquean el proyecto y limpian sus salidas
  generadas al terminar. No ejecutes un build u otro Hugo simultáneo en la misma
  carpeta. Ctrl-C, SIGTERM y SIGHUP permiten limpiar; SIGKILL y apagados no.
- El build y el actualizador respetan el gestor declarado. pnpm requiere una
  versión exacta y un `pnpm-lock.yaml` versionado; npm sigue admitido.
- El pipeline de SVG, fuentes, CSS y JavaScript en producción no cambia.
- La versión recomendada de Hugo pasa de 0.164.0 a 0.168.0 por sus correcciones
  de seguridad. El mínimo del motor sigue siendo 0.164.0; no se usan APIs nuevas.

### Acciones

1. Ejecuta `sh do root-docs` y actualiza tus accesos directos a `dev`/`live`.
2. Comprueba inicio, edición y cierre de ambos servidores; confirma que no quedan
   procesos Hugo ni salidas generadas de esa sesión.
3. Si conviertes a pnpm, sigue el [informe y procedimiento](docs/development-dependencies.md).
   Importa el lockfile sin actualizar versiones, conserva una copia de reversión,
   fija Node/pnpm y valida una instalación congelada y el build completo. No
   actives el virtual store experimental en CI.
4. Compila el proyecto y revisa `/admin/`, la home y los divisores antes de
   sincronizar la versión compatible.
5. Actualiza Hugo local y los `HUGO_VERSION` de despliegue a 0.168.0, manteniendo
   `netlify.toml` y `wrangler.toml` según el flujo de la referencia.
   Revisa los cambios de seguridad, globs y URLs descritos en la
   [comparación de versiones](docs/hugo-0.168.0.md).

### Validación

`sh do check` debe finalizar correctamente. Los proyectos npm continúan
instalando con npm; los convertidos deben compilar con una instalación limpia
`pnpm install --frozen-lockfile`, sin depender de un almacén de otra máquina.
La ruta del submódulo sigue siendo `themes/sansoul`.

## 7.0.0 — 2026-07-28

**Impacto:** todos los proyectos que usen valores globales localizados,
índices de colección o contenido remoto.

### Cambios relevantes

- `content/values.<lang>.yml` pasa a llamarse
  `content/global.<lang>.yml`.
- Los índices `content/<type>/_index.<lang>.md` continúan siendo fuentes
  editables por Sveltia, pero Hugo los monta como recursos y un Content
  Adapter crea sus páginas de sección.
- `data/remote.yml` genera páginas virtuales durante el build principal,
  sin materializar Markdown bajo `prebuild/public/content`.
- Los mounts son estáticos y viven en `hugo.default.yml`; la preconstrucción
  solo genera la configuración que Hugo debe conocer antes de ensamblar el
  sitio.
- `sh do local` publica esa configuración de forma atómica. Hugo la recarga
  dentro del mismo proceso y conserva la última versión válida si falla una
  regeneración.
- La configuración desactiva el `assets/jsconfig.json` autogenerado por Hugo
  para evitar una carrera entre ese cambio de asset y la recarga de
  configuración.

### Acciones obligatorias

1. Ejecuta
   `node themes/sansoul/scripts/migrations/7.0.0-content-adapters.js` desde la
   raíz para renombrar los archivos globales localizados.
2. Ejecuta `sh do root-docs`.
3. Ejecuta el build completo y comprueba una home, un índice de colección,
   una entrada normal y el CMS.
4. Si el proyecto usa `data/remote.yml`, valida una página remota y el
   comportamiento previsto cuando la fuente no esté disponible.

### Automatización

`scripts/migrations/7.0.0-content-adapters.js` renombra de forma idempotente
los archivos localizados. Se detiene sin sobrescribir cuando el destino ya
existe.

### Validación

`themes/sansoul/prebuild/public/` debe contener únicamente
`hugo.prebuild.yml`. El CMS debe guardar los textos globales en
`content/global.<lang>.yml`, y `sh do hugo` debe finalizar sin colisiones entre
índices físicos y virtuales. Tras validar y ejecutar
`sh do migrations mark --yes`, raíz y tema deben indicar `7.0.0`.

## 6.0.2 — 2026-07-27

**Impacto:** proyectos que conserven dependencias o archivos del antiguo
posprocesado de CSS.

### Cambios relevantes

- Se eliminan PurgeCSS y PostCSS porque el pipeline compila SCSS directamente
  con Hugo y Dart Sass.
- Hugo deja de generar `hugo_stats.json`.
- Desaparecen el comando `sh do css-purge`, el script de purgado y
  `postcss.config.js`.

### Acciones obligatorias

1. Ejecuta
   `node themes/sansoul/scripts/migrations/6.0.2-remove-legacy-css.js` desde la
   raíz y revisa el diff y cualquier aviso.
2. Si existe `package-lock.json`, ejecuta `npm install` para sincronizar el
   árbol instalado.
3. Revisa manualmente cualquier `postcss.config.js` personalizado que el script
   haya conservado.
4. Ejecuta el build completo.

### Automatización

`scripts/migrations/6.0.2-remove-legacy-css.js` elimina de `package.json` las
dependencias antiguas, limpia sus entradas de `.gitignore` y borra
`hugo_stats.json`. Solo elimina `postcss.config.js` cuando coincide exactamente
con la antigua copia generada por SanSoul; una configuración personalizada se
conserva y se avisa para revisión. También garantiza en `dependencies` de la
raíz `@fortawesome/fontawesome-free`, `simple-icons`, `sass-embedded`, `sharp`
y `sharp-ico`; conserva las versiones existentes salvo el Sharp histórico
`^0.33.5`, que actualiza a `^0.35.3`. El script es idempotente y no modifica
`package-lock.json` ni instala paquetes.

### Validación

`sh do hugo` debe finalizar correctamente sin generar `postcss.config.js` ni
`hugo_stats.json`. Tras validar y ejecutar `sh do migrations mark --yes`, raíz
y tema deben indicar `6.0.2`.

## 6.0.1 — 2026-07-27

**Impacto:** proyectos que generan imágenes AVIF, Open Graph desde SVG o
favicons durante el postprocesado de producción.

### Cambios relevantes

- Sharp se actualiza de `0.33.5` a `0.35.3`.
- `sharp-ico` permanece en `0.1.5`, su versión vigente.
- La calidad AVIF pasa de `50` a `60` para conservar la fidelidad visual con
  el codificador actualizado.

### Acciones obligatorias

1. Ejecuta
   `node themes/sansoul/scripts/migrations/6.0.1-sharp.js` desde la raíz.
2. Ejecuta `npm install` para sincronizar `package-lock.json` si existe.
3. Ejecuta el build completo.
4. Comprueba una variante AVIF, una imagen Open Graph procedente de SVG y el
   favicon ICO generado.

### Automatización

`scripts/migrations/6.0.1-sharp.js` obtiene la versión de Sharp declarada por
el tema, actualiza la antigua `^0.33.5` y mueve una dependencia existente de
`devDependencies` a `dependencies`. Conserva versiones personalizadas más
nuevas. La instalación y la comprobación de salidas siguen siendo necesarias.

### Validación

`sh do hugo` debe finalizar correctamente y los tres tipos de salida deben ser
archivos de imagen válidos. Tras validar y ejecutar
`sh do migrations mark --yes`, raíz y tema deben indicar `6.0.1`.

## 6.0.0 — 2026-07-27

**Impacto:** todos los proyectos que actualicen a Hugo 0.164.0 o posterior.

### Cambios relevantes

- SanSoul fija Hugo Extended 0.164.0 para desarrollo y despliegue.
- Hugo 0.164 ya no interpreta `y`/`n` como booleanos. En la configuración de
  Hugo, los datos y el front matter administrables se usan `true`/`false`.
  La ausencia o el valor nulo conserva la herencia del selector triestado.
- El pipeline SCSS usa Dart Sass en lugar del LibSass deprecado. En local puede
  instalarse una vez en el `PATH` sin Node; la dependencia `sass-embedded` del
  proyecto actúa como respaldo para los builds de producción.
- Los estilos del tema y del CMS usan el sistema de módulos de Sass; los
  parciales propios deben usar `@use` y declarar explícitamente sus
  dependencias.
- La configuración del tema exige Hugo 0.164.0 como versión mínima.
- Los defaults, contenidos, arquetipos y ejemplos del tema usan booleanos YAML
  reales `true`/`false`, compatibles con YAML 1.2 y con la evaluación booleana
  de Hugo.

### Acciones obligatorias

1. Ejecuta
   `node themes/sansoul/scripts/migrations/6.0.0-explicit-booleans.js` desde la
   raíz para convertir los booleanos, declarar `sass-embedded` con la versión
   del tema y sincronizar cualquier `HUGO_VERSION` existente en
   `netlify.toml` y `wrangler.toml`.
2. Si existe `package-lock.json`, ejecuta `npm install` para sincronizarlo.
3. Para desarrollo sin `node_modules`, instala Dart Sass standalone una vez en
   el `PATH`; en macOS: `brew install sass/sass/sass`.
4. Ejecuta `sh do root-docs`.
5. Compila con Hugo Extended 0.164.0 y ejecuta una auditoría con
   `--logLevel info` para detectar deprecaciones.
6. Valida el proyecto actual, el CMS generado y la copia de `_examples/`.

### Automatización

`scripts/migrations/6.0.0-explicit-booleans.js` convierte de forma idempotente
los escalares `y`/`n` en YAML y front matter a `true`/`false`, declara en la
raíz la versión de `sass-embedded` del tema y sincroniza los `HUGO_VERSION`
que ya existan en `netlify.toml` y `wrangler.toml` con
`module.hugoVersion.min`. No crea configuraciones ausentes ni toca uploads o
salidas generadas.

### Validación

El script debe indicar que no quedan booleanos heredados en una segunda
ejecución. `sh do hugo` debe finalizar con Hugo Extended 0.164.0 y la auditoría
no debe informar usos deprecados. Tras ejecutar
`sh do migrations mark --yes`, raíz y tema deben indicar `6.0.0`.

## 5.1.3 — 2026-07-27

**Impacto:** todos los proyectos que mantengan documentación en `dna/`.

### Cambios relevantes

- El contrato de agentes aclara que el ADN contiene solo identidad, audiencia, criterios editoriales, diseño, negocio, integraciones y excepciones propias del proyecto.
- El ADN no debe repetir arquitectura, flujos de trabajo, validaciones, seguridad ni uso genérico ya documentados en los README/AGENTS de la raíz o del tema.
- Toda petición de cambio reutilizable en README/AGENTS raíz debe aplicarse primero en `templates/root/` y regenerarse en el consumidor; las particularidades locales se redirigen al ADN.

### Acciones obligatorias

1. Ejecuta `sh do root-docs` para sincronizar el contrato raíz.
2. Revisa los documentos de `dna/` y elimina o sustituye por enlaces cualquier repetición de instrucciones genéricas de README/AGENTS.
3. Ejecuta el build completo y las comprobaciones proporcionales al proyecto.

### Validación

Una segunda ejecución de `sh do root-docs` no debe producir cambios. El ADN debe conservar únicamente contexto y restricciones propios del proyecto. Tras validar y ejecutar `sh do migrations mark --yes`, raíz y tema deben indicar `5.1.3`.

## 5.1.1 — 2026-07-23

**Impacto:** proyectos que todavía conservan README/AGENTS raíz no generados o un ADN sin completar.

### Cambios relevantes

- `sh do root-docs --force` reemplaza los documentos raíz antiguos sin copiar ni exigir que se traslade su contenido a `dna/`.
- Si falta `dna/_index.md`, el comando crea únicamente el scaffold del tema.
- Los agentes deben preguntar al usuario cuando el índice DNA falte, esté vacío o conserve solamente los textos orientativos.

### Acciones obligatorias

1. Ejecuta `sh do root-docs --force` si README/AGENTS todavía no son generados; su contenido anterior se descartará.
2. Completa `dna/_index.md` de forma independiente. No deduzcas particularidades desde los documentos reemplazados.
3. Ejecuta el build completo y las comprobaciones proporcionales al proyecto.

### Validación

Una segunda ejecución de `sh do root-docs` no debe producir cambios. El ADN no debe contener texto procedente de README/AGENTS antiguos. Tras validar y ejecutar `sh do migrations mark --yes`, raíz y tema deben indicar `5.1.1`.

## 5.1.0 — 2026-07-18

**Impacto:** todos los proyectos compatibles con `5.0.0`.

### Cambios relevantes

- Se incorpora el registro versionado de migraciones y la comparación entre los paquetes raíz y tema.
- README y AGENTS raíz pasan a generarse desde `templates/root/` mediante `sh do root-docs`.
- `dna/_index.md` pasa a ser la fuente obligatoria de identidad, particularidades y rutas documentales del proyecto.
- `sh do local` incorpora regeneración supervisada de la preconstrucción.

### Acciones obligatorias

1. Si los archivos raíz son antiguos, ejecuta `sh do root-docs --force`; si faltan o ya son generados, ejecuta `sh do root-docs` sin `--force`.
2. Define `dna/_index.md` independientemente; no copies ni deduzcas contenido desde README/AGENTS antiguos.
3. Revisa el diff y confirma que README/AGENTS solo contienen información genérica.
4. Ejecuta el build completo y las comprobaciones proporcionales al proyecto.

### Validación

Una segunda ejecución de `sh do root-docs` no debe producir cambios. Tras validar y ejecutar `sh do migrations mark --yes`, `sh do migrations check` debe indicar que raíz y tema están en `5.1.0`.

## 5.0.0 — línea base

**Impacto:** proyectos anteriores a la línea base `5.0.0`.

### Acciones obligatorias

1. No ejecutes el actualizador seguro en un proyecto anterior a `5.0.0`: se detendrá sin mover el submódulo.
2. Completa una migración verificada a la estructura de `5.0.0`, incluidas las transformaciones auxiliares anteriores al tema público, en especial los iconos, la configuración de recursos y los movimientos finales de medios y fuentes.
3. Compila y valida el proyecto en la línea base `5.0.0`. Solo después actualiza SanSoul y aplica las migraciones posteriores.

### Validación

`sh do hugo` debe finalizar correctamente en la línea base antes de continuar con versiones posteriores.
