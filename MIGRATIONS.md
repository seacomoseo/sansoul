# Migraciones de SanSoul

Este archivo registra únicamente cambios del tema que requieren revisar o modificar un proyecto consumidor. No sustituye al historial de Git ni pretende enumerar correcciones internas.

La versión publicada del tema vive en `package.json` y sigue [Semantic Versioning](https://semver.org/):

- **major**: incompatibilidad deliberada o migración obligatoria;
- **minor**: funcionalidad compatible; puede incluir una adaptación opcional;
- **patch**: corrección compatible sin cambios esperados en el proyecto.

El `package.json` del tema declara la versión instalada y el `package.json` de la raíz declara la última versión con la que el proyecto es compatible. Después de actualizar el submódulo, `sh do migrations` compara ambos valores y muestra las secciones pendientes.

## Flujo de actualización

```sh
# Después de actualizar themes/sansoul
sh do migrations

# Tras aplicar las acciones indicadas y validar el proyecto
sh do migrations mark --yes
```

`sh do migrations check` termina con error mientras las versiones difieran, aunque una actualización compatible no tenga acciones documentadas. `mark --yes` actualiza la versión de `package.json` y, si existe, de `package-lock.json` en la raíz. Nunca lo ejecutes antes de realizar las acciones y validar el build.

## Cómo añadir una migración

Añade una sección `## x.y.z — fecha` por cada versión que requiera intervención. Indica:

- **Impacto**: qué proyectos están afectados;
- **Acciones obligatorias**: pasos concretos, comprobables y en orden;
- **Automatización**: script idempotente disponible, si existe;
- **Validación**: resultado que demuestra compatibilidad.

Si una transformación puede automatizarse con seguridad, colócala en `scripts/migrations/` y enlázala desde la sección. No ejecutes migraciones automáticamente durante `hugo`, `server`, `local` ni al actualizar el submódulo.

Desde `5.1.0`, README y AGENTS de la raíz son genéricos y se generan íntegramente desde `templates/root/`. Las particularidades pertenecen exclusivamente a `dna/`.

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

1. Actualiza `sharp` a `^0.35.3` en las dependencias de la raíz y reinstálalas.
2. Ejecuta el build completo.
3. Comprueba una variante AVIF, una imagen Open Graph procedente de SVG y el
   favicon ICO generado.

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
   raíz y revisa el diff.
2. Añade `sass-embedded` con la versión declarada por el tema a las dependencias
   de la raíz. Para desarrollo sin `node_modules`, instala Dart Sass standalone
   una vez en el `PATH`; en macOS: `brew install sass/sass/sass`.
3. Ejecuta el script de migración: además de convertir los booleanos,
   sincroniza automáticamente cualquier `HUGO_VERSION` existente en
   `netlify.toml` y `wrangler.toml` con el mínimo declarado por el tema.
4. Ejecuta `sh do root-docs`.
5. Compila con Hugo Extended 0.164.0 y ejecuta una auditoría con
   `--logLevel info` para detectar deprecaciones.
6. Valida el proyecto actual, el CMS generado y la copia de `_examples/`.

### Automatización

`scripts/migrations/6.0.0-explicit-booleans.js` convierte de forma idempotente
los escalares `y`/`n` en YAML y front matter a `true`/`false`, y sincroniza los
`HUGO_VERSION` que ya existan en `netlify.toml` y `wrangler.toml` con
`module.hugoVersion.min` del tema. No crea configuraciones ausentes ni toca el
tema, dependencias, uploads ni salidas generadas.

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

1. Si el proyecto todavía depende de las migraciones encadenadas del actualizador privado, ejecuta `sh do update` antes de sustituir su tema antiguo.
2. Lleva el proyecto a la estructura funcional de la línea base `5.0.0` y confirma que compila correctamente antes de aplicar migraciones posteriores.
3. Conserva el actualizador privado únicamente como puente hasta que todos los proyectos heredados alcancen esta línea base.

### Validación

`sh do hugo` debe finalizar correctamente en la línea base antes de continuar con versiones posteriores.
