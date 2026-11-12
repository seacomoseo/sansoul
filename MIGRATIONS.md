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

Después del preflight, `sh do update` avanza el submódulo, ejecuta los scripts de migración registrados, mueve el motor a `core/` si aún está en `themes/sansoul` (`git mv` hace staging solo de ese movimiento), sincroniza siempre README y AGENTS desde las plantillas de SanSoul, convierte o verifica pnpm (obligatorio) y compila el proyecto. Si quedan validaciones específicas de una migración, las muestra y solicita confirmación antes de sincronizar la versión raíz. En una ejecución no interactiva deja la versión sin cambiar; tras completar las comprobaciones, ejecuta `sh do migrations mark --yes`.

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


## 14.3.1 — 2026-11-12 — avisos de pedido en tablas

**Impacto:** solo presentación. Los avisos al vendedor y la confirmación al comprador pasan del listado con viñetas a tablas HTML (artículo, cantidad, precio; subtotal, envío, IVA y total al pie; comprador y dirección en tablas). El texto plano no cambia. Sin migraciones ni cambios de configuración.

## 14.3.0 — 2026-11-12 — avisos completos de pedido y factura PDF

**Impacto:** ninguno salvo que se active. Los proyectos sin `order_notices` ni `invoice` en
`data/commerce.yml` envían exactamente los mismos avisos que antes. Es una versión *minor*:
añade la migración D1 `0007_invoices.sql`, que el CI aplica sola con el resto
(`wrangler d1 migrations apply`).

### Qué incorpora

- **Factura PDF** generada en el Worker (`commerce/invoice.js`, `commerce/pdf.js`, sin
  dependencias; unos 3 KB por factura) desde el pedido pagado y la configuración `invoice`:
  titular, NIF, domicilio, serie propia por proyecto (`WEB-2026-0001`, contador atómico en D1
  sin saltos y sin duplicados por reintentos), desglose de IVA por tipo, IVA del envío,
  coletilla de exención y forma de pago configurable. Descarga/emisión manual:
  `GET /api/commerce/admin/orders/<id>/invoice.pdf` (token de administración).
- **Aviso completo al vendedor** (`order_notices`): además de artículos e importes, nombre,
  correo, teléfono y dirección de envío del comprador, con la factura adjunta y `Reply-To` al
  comprador. Sin activar, el aviso sigue sin datos personales.
- **Confirmación al comprador**, activada por defecto dentro de `order_notices`, con resumen y
  la misma factura (la adjunta se puede quitar aparte con `buyer_invoice: false`).
- Factura rectificativa preparada para reembolsos (serie propia, importes en negativo): el motor
  puede emitirla, pero ningún flujo la emite todavía.

### Acciones (opcionales)

- Para adoptarlo: añade `invoice` y `order_notices` a `data/commerce.yml` (ver README-ROOT,
  «Avisos completos y factura PDF») y revisa `privacy_retention`: el aviso ya no es «sin datos
  personales» y las facturas emitidas se conservan por obligación fiscal aunque se borren los
  datos de entrega.
- Con Stripe, desactiva en el panel los recibos por correo de Stripe si la confirmación propia
  está activada, para que el comprador no reciba dos.

### Validación

- `pnpm run test:commerce` (incluye `commerce/test/unit/invoice.test.js`) y
  `pnpm run test:commerce:d1` desde `core/`.
- Con el Worker de pruebas: una compra de prueba genera un correo con PDF; repetir el despacho
  no emite un segundo número.


## 14.1.0 — 2026-11-09 — espejo Netlify y Worker local

**Impacto:** ninguno salvo que se active. Proyectos sin `params.netlify` y sin
formularios `action: worker` ni comercio no notan cambios.

### Qué incorpora

- **Espejo Netlify** (`core/scripts/netlify-mirror.js`, paso 5 de `core/ci/run`): con
  `params.netlify` y el secreto `NETLIFY_AUTH_TOKEN`, el CI crea el sitio si falta (sin Git,
  sin distintivo «Powered by Netlify»), genera `netlify.toml` en una carpeta limpia
  (`/api/*` → Worker, `status = 200`, `signed = "SANSOUL_PROXY_SECRET"`), fija el secreto una
  sola vez en Netlify y en el Worker y publica `public/` con `netlify-cli` fijado
  (`deploy --prod --no-build`); las reglas de `_redirects` pasan al `netlify.toml` detrás de
  `/api/*`. Límites de créditos Free: un despliegue por hora por sitio y 15 por equipo de
  Netlify en 31 días; el workflow generado incluye una recuperación cada 6 horas solo en
  proyectos con `netlify`, que publica únicamente commits que el Worker ya ejecuta.
- Workflow generado: grupos de concurrencia `sansoul-deploy` y `sansoul-mirror`, permiso
  `actions: read` y `wrangler deploy --message "SanSoul <sha>"` en `core/ci/run`.
- Formularios `action: worker` de proyectos con espejo: 8 MB por archivo (Netlify rechaza
  peticiones de más de 8 MiB). El resto conserva 20 MB.
- **`sh do local` con Worker**: si el build genera backend (formularios o comercio), arranca
  `wrangler dev` con D1/KV locales (`worker/.wrangler/state`), `FORMS_PROVIDER=hold` y
  `COMMERCE_ENV=test`, y le envía `/api/*`. Secretos opcionales en `worker/.dev.vars`.

### Acciones

- Ninguna obligatoria. `sh do update` regenera el workflow con `sh do root-docs`.
- Para activar el espejo: `netlify: <sitio>` en `params`, secreto `NETLIFY_AUTH_TOKEN` en
  GitHub, `sh do root-docs` (añade la recuperación programada) y `baseURL` con el dominio que
  sirve Netlify. El dominio propio en Netlify se configura a mano.

### Validación

- Primer push: el paso «Netlify mirror» crea el sitio, informa «Proxy secret: Netlify created,
  Worker updated» y publica; `curl -X POST https://<dominio>/api/forms/submit` responde JSON del
  Worker (no 404 de Netlify).
- `sh do local`: el log muestra `Worker (forms/commerce, local D1/KV, …) on /api/*`.


## 14.0.0 — 2026-11-09 — solo Workers: CI y Worker generados por el motor

**Impacto:** todos los proyectos. Cloudflare Workers pasa a ser el único
hosting (Pages convive solo hasta verificar la migración de cada proyecto) y
todo lo repetido entre proyectos vive en `core/`. El proyecto conserva sus datos
(`hugo.yml`) y stubs generados.

### Qué cambia

- **Parámetros planos en `hugo.yml`:** `owner`, `repo` (repositorio GitHub),
  `worker` (nombre del Worker; por defecto `repo` en minúsculas), `netlify`
  (sitio espejo, opcional), `drive_url`, `drive_mails` y `worker_vars` (mapa de
  variables del Worker, p. ej. `FORMS_PROVIDER`). `domain` se deriva del host de
  `baseURL` y solo se escribe para sobrescribirlo. Se eliminan `name`,
  `netlify_id`, `netlify_hook` y `cloudflare_id`. El repositorio del CMS y del
  manifiesto de formularios es `owner/repo` (`cms_repo` sigue como override).
- **Worker generado:** `sh do build` + `core/scripts/worker-config.js` escriben
  `worker/entry.generated.js` y `worker/wrangler.jsonc` desde `hugo.yml`; el
  proyecto ya no lleva `worker.js` ni `wrangler.workers.toml`. D1/KV propios
  por nombre (`<worker>-forms`, `<worker>-files`, `<worker>-commerce`), buscados
  o creados (Free) por el CI; cuenta = la única que ve el token o
  `CLOUDFLARE_ACCOUNT_ID`. El reintento de entregas de formularios pasa a un
  cron del Worker cada 15 min (antes, Action programada).
- **Un único workflow:** `.github/workflows/sansoul.yml`, generado por
  `sh do root-docs` desde `core/templates/root/sansoul.yml`, llama a
  `core/ci/run`: copia en GitLab (`GL_PAT`), build, migraciones D1 y despliegue
  (`CLOUDFLARE_API_TOKEN`). Sustituye `deploy-workers.yml`, `backup.yml` y
  `forms-dispatch.yml`. Un solo job por push: menos minutos de Actions en
  repositorios privados.
- `/worker/`, `.wrangler` y `.dev.vars` quedan fuera de Git.
- **Publicar desde el CMS:** el CMS sigue guardando con `[skip ci]`; «Publicar
  cambios» (menú de la cuenta en Sveltia) envía `repository_dispatch`
  `sveltia-cms-publish`, que el workflow escucha. Sveltia muestra el estado del
  run junto a cada cambio.
- **`/admin/info/` desaparece** (páginas `content/page/cms.*`, `info.js`, sus
  estilos y textos, y los Workers `deploy`/`deploy-status` dejan de usarse): las
  redirecciones por defecto llevan `/admin/info/*` a `/admin/`. En el login de
  `/admin/` hay un botón «Ayuda» (acceso con GitHub, publicar, tutorial, hoja de
  Drive con emails escritos por JS, enlaces a GitHub, Actions, Cloudflare, Netlify
  y GitLab), que dentro del CMS es la página «Ayuda» (`/admin/help/`). El mapa del
  sitio enlaza a `/admin/`.
- **Worker tras el espejo Netlify:** los formularios aceptan también el `Origin`
  de `baseURL` (manifiesto `origins`); con `SANSOUL_PROXY_SECRET` y la firma
  `x-nf-sign` válida, formularios y comercio limitan por la IP real del visitante
  y comercio acepta el origen canónico a través del proxy (`core/edge/proxy.js`).
  `static/_headers` añade `X-Robots-Tag: noindex` solo en el host `workers.dev`.
  `_redirects` deja el sufijo `!` exclusivo de Netlify: un build sirve a ambos.
- Ejemplo `_examples/forms-backend/` sin archivos que copiar.

### Acciones obligatorias

1. Ejecutar `sh do update`. La automatización
   `core/scripts/migrations/14.0.0-workers-ci.js` aplana los parámetros
   (`owner`/`repo` desde el remoto GitHub, `worker` desde el Worker ya desplegado
   o desde `name` si el repositorio no es un nombre válido, `netlify` desde
   `name` si había `netlify_id`, `[vars]` de `wrangler.workers.toml` a
   `worker_vars`) y borra solo los archivos de serie reconocidos; los
   personalizados se conservan y se avisan.
2. Revisar `params` en `hugo.yml`: `worker` es el nombre del Worker en
   `workers.dev`; `domain` solo si difiere del host de `baseURL`.
3. Crear el secreto `CLOUDFLARE_API_TOKEN` (token **de cuenta** del cliente con
   Workers Scripts, D1 y Workers KV en escritura y Account Settings en lectura) y,
   para la copia, `GL_PAT`. Nunca el token personal amplio.
4. Si el proyecto ya tenía D1/KV de formularios con otro nombre, el primer
   despliegue crea `<worker>-forms`/`<worker>-files` vacíos: copiar los datos o
   aceptar el cambio antes de borrar los antiguos.
5. Tras verificar el despliegue en `workers.dev`, borrar el proyecto Pages o
   desconectar Netlify de Git y retirar `wrangler.toml`/`netlify.toml` heredados.
   Hacer privado el repositorio.

**Validación:** el run de `SanSoul` en Actions termina en verde con
«Deploy Worker» y la URL `workers.dev` sirve el build; `/api/forms/*` responde
si hay formularios `action: worker`.


## 13.7.0 — 2026-11-09 — formularios con backend propio

**Impacto:** ninguno para formularios existentes. GAS, FormSubmit y acciones
propias conservan su HTML y su JS. Aplica solo a formularios que elijan
`action: worker` (o `inputs.action: worker` en `data/styles.yml`).

### Qué incorpora

- `core/forms/`: recepción same-origin en `POST /api/forms/submit` del Worker
  del proyecto, política en servidor generada en el build (`worker/forms.generated.js`),
  recibo durable `accepted`/`review` en D1, adjuntos temporales en KV, entrega
  con lease/fencing y proveedor Gmail con cuenta por proyecto o por formulario
  (`form.account`, campo CMS nuevo). Contrato en `core/forms/README.md`.
- Archivos por subida raw (`POST /api/forms/upload`, uno por archivo, directo a
  KV sin parsear ni hashear en el Worker); el envío solo lleva texto y
  referencias. Hasta 20 MB por archivo y 25 MB por envío: si el total pasa de
  1 MB, va al Drive de la cuenta remitente (`Forms/<proyecto>/<formulario>/`,
  scope `drive.file`) con enlace en el correo; si no, adjunto. `FORMS_DRIVE =
  "false"` desactiva Drive (2 MB por envío). Migración `0002_files.sql`.
- Mensajes `form_error_file_size(_total)` con `{s}` (MB) en los seis idiomas; el
  JS usa 3/4 MB salvo que el formulario declare `data-file-max`/`data-files-max`.
  Un consumidor que haya sobrescrito esos textos con la cifra fija la conserva.
- Cuenta por defecto de SanSoul `sansoulsend@gmail.com`, cargada como
  configuración (`FORMS_GMAIL_DEFAULT` + secreto) con
  `forms/scripts/gmail-credentials.js`, que nunca imprime valores.
- Ejemplo `_examples/forms-backend/` (Worker + `wrangler.workers.toml`, Free).
- Panel de formularios en `/admin/forms/` (página «Formularios» del CMS vía
  `CMS.registerCustomPage`, solo si el Worker responde `/api/forms/admin/*`).
  Autoriza con la sesión GitHub del CMS (permiso de escritura en `cms_repo`).
  Tablas con orden, filtros, grupos y búsqueda en D1, borrado por lotes y CSV/ZIP.
  Retención opcional `FORMS_RETENTION_DAYS`. Migraciones `0003_panel.sql` (índice
  y tabla `forms_meta`; sin ella el panel funciona, sin el aviso de D1 compartida)
  y `0004_forms_index.sql` (índice por formulario).
- `scripts/update.js` registra 13.6.0 y 13.7.0 (13.6.0 faltaba en la política
  del actualizador).

### Acciones para adoptarlo (opcionales)

1. Copiar el ejemplo, crear D1 y KV **propios del proyecto** (no compartidos
   con otra web) y aplicar `core/forms/migrations`; añadir
   `worker/forms.generated.js` a `.gitignore`.
2. Configurar `FORMS_PROVIDER` (`hold` o `gmail`), los secretos
   `FORMS_GMAIL_CREDENTIALS`/`FORMS_ADMIN_TOKEN` y `FORMS_GMAIL_DEFAULT`
   (Drive activo salvo `FORMS_DRIVE = "false"`; opcional `FORMS_DRIVE_FOLDER`).
3. Marcar los formularios con `action: worker` y comprobar en el build que
   `public/_forms/` no existe y el manifiesto lista sus destinatarios.

**Validación:** `pnpm run test:forms` en `core/`; envío de prueba en local con
`FORMS_PROVIDER = "hold"` y recibo `accepted`. El puente GAS sigue vigente
hasta migrar cada proyecto; mover el frontend no copia su deduplicación.


## 13.6.0 — 2026-11-09 — comercio opt-in

**Impacto:** ninguno para proyectos sin `data/commerce.yml` o con
`enabled: false` y sin adaptadores: no se insertan UI, JS, CSS ni rutas de
comercio. Aplica solo a consumidores que adopten el comercio, incluidos los que
traían las ramas locales 7.1.0/8.0.0 de comercio (nunca publicadas en `main`).

### Qué incorpora

- Catálogo, carrito, ficha de compra y página `commerce-cart`, activados con
  `data/commerce.yml` `enabled: true`. Campos CMS ES/EN `commerce_id`,
  `commerce_active`, `commerce_quote` y `commerce_weight_kg` (visibles solo con
  comercio activo). El JS y el CSS de comercio entran en el pipeline selectivo
  de producción como componente `commerce`.
- Backend reutilizable en `core/commerce/` (checkout, totales y destinos
  cotizados en servidor, webhook Stripe, estado privado del comprador,
  administración, outbox con consumo `claim/ack`, mantenimiento acotado) con
  ejemplos Workers y Pages en `core/_examples/commerce-backend/`.
- `cms_repo` opcional en `data/config.yml` para separar el repositorio del CMS
  de `owner/domain`.

### Acciones al adoptar comercio

1. Sigue [Comercio opt-in](README-ROOT.md#comercio-opt-in): identidades UUID/SKU
   estables, `data/commerce.yml`, página `single/carrito` y backend copiado del
   ejemplo con las rutas `core/…`.
2. Base D1 aprobada y respaldada: aplica una vez y en orden
   `core/commerce/migrations/0001`–`0006`. Quien venga de 8.0.0 local ya tiene
   `0005`/`0006`; quien venga de 7.1.0 aplica solo las que falten. Ningún build
   aplica migraciones remotas.
3. Callers de mantenimiento: `reconcile` procesa un elemento por llamada y clase
   (`operation=expiration|orders|unmatched_webhooks`; sin parámetro, `orders`);
   `dispatch` devuelve `has_more` booleano en lugar del contador `pending`.
   Programa las clases por turnos con límite de llamadas, sin bucles de drenaje.
4. Mantén `checkout_approved: false` y `COMMERCE_CHECKOUT_APPROVED=false` hasta la
   aprobación comercial (impuestos, envío, legal). El proveedor `fake` solo vale
   con fixtures sintéticas en `test`.

### Validación

Desde `core/`: `pnpm run test:commerce` (unitarias y routing) y
`pnpm run test:commerce:workers` (workerd + D1 local; varios minutos). En el
consumidor: `sh do build`, CMS ES/EN con los campos opcionales, carrito, ficha
y regresión sin comercio (divisores). El pass local no certifica CPU Free cloud.

## 13.5.0 — 2026-11-07

**Impacto:** todos los proyectos. `sh do update` normaliza ahora, sin pasos
opcionales, la ubicación del motor y el gestor de dependencias.

### Cambios automáticos

- **Motor en `core/`.** Si el submódulo sigue en `themes/sansoul`, el actualizador
  ejecuta `git mv themes/sansoul core` (esto **hace staging** del movimiento),
  renombra la sección de `.gitmodules` a `[submodule "core"]`, elimina
  `themes/` si queda vacía y sustituye `themes/sansoul` por `core` en los archivos
  de texto versionados de la raíz (workflows, TOML, `package.json`, DNA…).
  Los selectores `theme`/`themesDir` los retira antes la migración 8.0.0. El wrapper
  `do` canónico admite ambas rutas y se conserva. Si `core/` ya existe o
  `.gitmodules` ya declara otro `core`, se detiene antes de cambiar nada.
- **pnpm obligatorio.** El proyecto queda con `packageManager` `pnpm@10.28.2`,
  `.npmrc` con `enable-global-virtual-store=false` y `strict-dep-builds=true`, y
  un único `pnpm-lock.yaml`. Con `package-lock.json` se usa `pnpm import` (mismas
  versiones) y luego se elimina; sin lockfile se genera uno. Los scripts de
  `package.json` pasan de `npx`/`npm run` a `pnpm dlx`/`pnpm run`. `netlify.toml`
  recibe `PNPM_FLAGS` y `wrangler.toml` recibe `PNPM_VERSION` para que Netlify y
  Cloudflare Pages instalen con el lockfile congelado. Si algo falla, se restauran
  los archivos tocados. Requiere `pnpm` 10.28.2 activo antes de empezar; el
  preflight lo comprueba y no modifica nada si falta.

### Revisión del consumidor

1. Revisa `git status`: el movimiento queda en staging, nada se confirma.
2. Comprueba que CI, Netlify y Cloudflare usan `pnpm-lock.yaml` y confirma la
   versión de Node.
3. Confirma `package.json`, `pnpm-lock.yaml`, `.npmrc`, `.gitmodules`, `core` y los
   archivos con referencias actualizadas en un solo commit.

## 13.3.0 — 2026-10-23

Funciones compatibles, sin migración obligatoria:

- `btn_full`, `btn_mt` y `btn_mt_vl` permiten anular el ancho automático y
  espaciar la acción de cada caja. Se conserva el comportamiento anterior por
  defecto. Personalizaciones que dependan de `.box__btn:where(.bg > *)` pueden
  usar la clase explícita `.box__btn--full`.
- `form.ajax` permite forzar fetch o navegación nativa; vacío conserva el
  comportamiento previo por proveedor.
- `imgs_remote` permite descargar y procesar imágenes externas en el build.
  Está desactivado por defecto; antes de activarlo, comprobar acceso al origen,
  coste de compilación y los avisos de fallback a URL externa.

Revisa los márgenes `mt`, `mb`, `ml`, `mr` y sus variantes `*_vl` en
los valores compartidos `box`: ahora afectan al grupo de cajas una sola vez.
Si una composición dependía de repetir un margen, define el valor en cada
entrada de `boxes` que lo necesite. Los márgenes individuales ya guardados
siguen vigentes.

Los selectores del calendario siguen `styles.inputs.fill`. Sus detalles de hover
se cierran al salir; clic/toque los fija. Las esquinas de medios laterales en el
borde de la ventana se eliminan también cuando hay chaflanes.

## 13.1.0 — 2026-10-22

Ampliación compatible y opcional: `list.view: calendar` muestra bases `event` y
`article` como calendario mensual, con agenda en contenedores pequeños. La vista
predeterminada sigue siendo `list`. Mantiene filtros y `max`; agrupa las entradas
seleccionadas sin paginación para no dividir los meses. Cada entrada aparece en
su fecha inicial y muestra su intervalo completo. Los artículos conservan la
lista cronológica salvo elección expresa. Validar fechas, zona horaria y enlaces.

`box.infinite` y `review.infinite` habilitan continuidad del carrusel reciclando
nodos originales, con suficiente contenido fuera de la vista. No se duplican
IDs, formularios o reproductores. Sin la API `moveBefore`, los carruseles con
medios incrustados permanecen finitos para preservar su estado. Comprobar gestos,
flechas, indicadores, foco y resize en los navegadores objetivo.

No hay renombres ni script de transformación. El actualizador registra la
revisión manual de estas opciones; pueden dejarse ausentes. También se aísla el
HTML de Google Sheets: revisar el formato de las hojas personalizadas después
de actualizar, pues su CSS ya no puede modificar el resto del documento.

## 13.0.0 — 2026-10-22

Se completan los defaults de bloques: `dot` configura `dots`; `when` configura
`whens`; `gss` pasa a ser un objeto con `id`, `sheet`, `mt` y `mt_vl`.
`dot` admite defaults de enlaces, columnas/fit, `align_x` y márgenes; conserva
el tamaño de los botones de icono y alineación centrada por defecto. `when.align_x` conserva
`grow` como reparto predeterminado. Los nombres de bloques de `sort` no cambian.

El actualizador ejecuta `core/scripts/migrations/13.0.0-block-defaults.js`.
Migra sólo composición: lista antigua `when` a `whens`, identificador antiguo
`gss` a `gss.id`, y `gss_sheet` a `gss.sheet`, incluidas rutas destino de `get`
y rutas de `remap`. Conserva `org.when` y las fuentes de datos ajenas a `tpl`.
También cubre payloads serializados y nombres de campos en defaults. `--check`
es de sólo lectura; una colisión, alias/merge o entrada no transformable detiene
todos los archivos antes de escribir. Puede reformatear el objeto de composición
afectado; conserva comentarios y cuerpo Markdown. Revisar diffs y compilar.

Guardar y reabrir defaults y elementos en CMS; verificar márgenes/alineación a
ambos tamaños y la carga lazy de la hoja con un identificador público autorizado.
No hace falta habilitar una hoja remota para comprobar su configuración o schema.

## 12.0.0 — 2026-10-21

Las secciones concretas guardan sus valores directamente en `tpl.sections[*]`;
se elimina el envoltorio `params`. El actualizador ejecuta
`core/scripts/migrations/12.0.0-section-fields.js`, disponible con `--check`.
Conserva el cuerpo Markdown y comentarios, rechaza colisiones antes de escribir
y cubre también defaults serializados `tpl` / `tpl.sections`. Los archivos de
secciones reutilizables y `tpl.section` ya eran planos. En el CMS «Contenido»
es un grupo visual plegado: al guardar no se crea ninguna clave adicional.
Los valores concretos de la sección prevalecen sobre los del archivo `file`.
Compilar, abrir una sección con archivo y valores propios, guardar/reabrirla en
el CMS e inspeccionar el YAML antes de marcar compatibilidad raíz.

Los márgenes de caja cambian de nombres: los antiguos `mt`, `mb`, `ml`, `mr`
pasan a `mt_vl`, `mb_vl`, `ml_vl`, `mr_vl`; los antiguos `mt_vs`, `mb_vs`,
`ml_vs`, `mr_vs` pasan a `mt`, `mb`, `ml`, `mr`. Por indicación expresa de Loren,
que no los utiliza en sus consumidores, esta transformación no se incluye en
scripts. Un consumidor externo que los emplee debe renombrarlos manualmente.
El cero sigue siendo explícito; el valor base se hereda al grande y un `_vl`
aislado parte de cero en pequeño. Los defaults estructurados de bloques admiten
`mt`/`mt_vl` para sustituir la separación automática. Verificar ambos tamaños.

## 11.0.0 — 2026-10-21

`data/customs.yml` cambia `sub` por `fields` en cada definición de campo anidado.
El script `core/scripts/migrations/11.0.0-custom-fields.js` renombra sólo esas
claves, conserva comentarios y valores ajenos, y rechaza colisiones `sub/fields`
y aliases/merges antes de escribir. También admite `data/customs.yaml`; si existen
ambos archivos se requiere resolver la colisión. Se puede revisar con `--check`.
No cambia las claves de los datos publicados ni la clave oficial `widget` de
Sveltia. El partial interno `cms/widget.html` pasa a `cms/field.html`; si un
consumidor tiene llamadas propias a `partial "cms/widget"`, debe ajustarlas.
Compilar, inspeccionar el schema y guardar/reabrir un objeto con campos anidados
en el CMS antes de marcar la compatibilidad raíz.

La salida CMS usa las opciones nativas de la versión fijada de Sveltia:
`modes` para Markdown, `allowInput` para color, `decimals` para mapa y
`media_libraries.all.max_file_size` para límites específicos de archivos.
No se migran valores de contenido por esta normalización.

## 10.0.0 — 2026-10-21

Cambios incompatibles de autoría e imágenes. El actualizador ejecuta
`core/scripts/migrations/10.0.0-authoring-api.js` (también en la instalación
legada `themes/sansoul/`), con preflight completo de colisiones antes de escribir.
Front matter TOML/JSON y aliases/merges de autoría requieren migración manual;
el script detiene todo el plan antes de escribir.
Para una copia de desarrollo con cambios locales, ejecuta primero el mismo
script con `--check` desde la raíz y revisa su plan; no fuerces el actualizador.

- Índices `content/<type>/_index.<lang>.md` y definiciones `data/types/*.yml`:
  `permalinks` pasa a `prefix`. Se deben migrar ambos para conservar las URLs
  personalizadas de las fichas. La configuración generada de Hugo conserva su clave oficial `permalinks`.
- Metadata de enlaces Markdown: `homefollow` pasa a `sublock` y `ga4` a
  `ga4:contact`. Sólo títulos con metadata; código literal no se convierte.
- `ga4: true` pasa a `ga4: contact` en contextos de enlace/formulario.
  `false` y los strings vacíos explícitos pasan a `none` para conservar la anulación de defaults heredados al guardar en el CMS.
  Un string solicita un evento adicional; los contactos tipados y formularios
  correctos conservan `contact`, sin duplicarlo si coincide el nombre.
- Botones de caja/galería: `pin` pasa a `il`. Enlaces, menú, callnow y dots:
  `icon` pasa a `il`; `ir` añade el icono derecho. `review.icon`/`icon_right`
  pasan a `il`/`ir`. Los iconos de caja, pasos, campos, FAQ y geografía se conservan.
- Config: `webp` pasa a `imgs_webp`; `img_sizes` se retira. `imgs_quality`
  controla AVIF/WebP (1–100, por defecto60); `imgs_dpr` limita las variantes
  calculables (mayor que0, por defecto2). Las URLs derivadas incluyen identidad del contenido y calidad; no
  referencies manualmente esos archivos generados. Los fondos de altura
  desconocida conservan el techo original para cubrir casos no medibles.
- CMS: medios heredan `duplicate_if_empty`; los cinco grupos de configuración
  son exclusivamente visuales y no cambian el YAML persistido.

Después de migrar: compila, inspecciona el schema CMS, guarda/reabre una entrada
representativa, revisa enlaces con iconos, eventos GA4 sin enviar datos reales,
y compara imágenes normales/fondos a distintos viewports/DPR. Las definiciones
personalizadas GA4 y eventos clave se configuran en cada propiedad por su dueño.

## 9.0.0 — 2026-10-19

### Cambios incompatibles de autoría

- `link` aporta defaults para `links`, incluidas columnas y alineación. Cada
  elemento puede sobrescribirlos. `link.cols/cols_vs` y `links.fit/fit_vs`
  comparten el cálculo de columnas de cajas. Sin columnas, un fit explícito usa
  el 100 % como base; sin fit/columnas, el ancho natural crece con `align_x: grow`.
- `form.cols/cols_vs` y `inputs.fit/fit_vs` reemplazan `inputs.full`. En modo
  automático los campos mantienen mínimo habitual 280 px, pero una sola columna
  encoge si los paddings dejan menos espacio. Los tipos antes completos lo
  siguen siendo salvo fit explícito.
- Se retira `full` de los elementos `inputs` y `links`; la migración convierte
  `full: true` en `fit: 1` y retira `full: false`. Revisa combinaciones con
  columnas nuevas: `fit: 1` representa una columna, no todo el grupo multicolumna.
- `map` pasa a `geo` como defaults de `geos`, incluido el token de `sort`.
  Clases DOM, SDK Leaflet y geometrías `geo` individuales no cambian.
- `box.grow: true` pasa a `box.align_x: grow`. `grow` es una opción de alineación
  en cajas y enlaces, pero sólo es default en `link`.
- Se retiran los tipos `links` h2–h6, hr y br. Por indicación de Loren no hay
  script para migrarlos: no se usan en proyectos consumidores. El catálogo deja
  de mostrarlos.

### Migración y revisión

El script `core/scripts/migrations/9.0.0-authoring-layout.js` realiza las conversiones
reconocidas de configuración de composición; `--check` informa sin escribir.
Necesita `yaml` 2 instalado en el proyecto; si falta, instala las dependencias
declaradas antes de actualizar. El preflight se detiene sin cambiar el checkout
ni los archivos si no puede analizar la configuración.
Valida colisiones antes de modificar archivos. Revisa referencias personalizadas
`get`/`remap`, código y overrides que mencionen las claves retiradas.

Los enlaces tienen un wrapper `.links__item`; adapta CSS personalizado que use
selectores directos `.links > a` o `.links > button`. Prueba anchos por viewport,
herencia, fit null/ausente y campos completos. Regenera el CMS, revisa una entrada
representativa y compila el YAML guardado antes de marcar la compatibilidad.

### Contraste de tarjetas

Las tarjetas con imagen mantienen el degradado encima del contenido; el panel
bajo el texto usa ahora su fondo configurado completo. Revisa overrides de
`.bg-card::before/::after`. Una transparencia de color elegida por el proyecto
sigue siendo transparente: debe validarse con su imagen y sus textos.

### Comandos locales

`sh do local` sirve builds completos de producción y reconstruye al cambiar las
fuentes; `live` pasa a ser alias de `local`, ya no de `cms`. Usa `cms` para editar
con Hugo en desarrollo y `dev` para desarrollo sin editor. Local escucha por
omisión en localhost:1313, no inyecta livereload y responde 503 durante builds o
fallos, evitando servir una salida parcial. Al cerrar elimina `public/` y
`resources/`. Revisa automatizaciones que antes usaran `local`/`live` para CMS.

El comando optativo `sh do preview` incorpora un prototipo local con Hugo
persistente; `--demo` usa archivos virtuales del navegador. No requiere migrar
contenido ni cambia la preview alojada. Consulta [su alcance](docs/cms-live-preview.md).

## 8.1.0 — 2026-10-18

**Impacto:** dimensiones de presentación editables y comandos de desarrollo
separados del CMS. No hay reescritura automática de contenido ni nuevas
versiones de dependencias.

### Revisión del consumidor

- Usa `sh do dev` para desarrollar el sitio: ahora también supervisa el prebuild,
  pero omite administrador, assets del CMS y anotaciones/manifiestos/receptor de
  preview. Si usabas el editor desde `dev`, cambia a `sh do cms`.
- `sh do cms` incluye el editor y la misma vigilancia de prebuild. `live` y
  `local` siguen funcionando como alias; `server` sigue siendo alias de `dev`.
- `sh do build` es el nombre canónico de compilación; `sh do hugo` sigue
  funcionando. `sh do` sin argumentos muestra ayuda. No es obligatorio modificar CI.
- `img_w` y `img_h` sobrescriben la presentación en `box`, `boxes.*` y modales.
  Una medida calcula la otra con el ratio explícito o proporción conocida.
  En Markdown: `{16/9 w360 h220}`, `{w360}`, `{h220}` o `{w360 h220}`.
  `{16/9}` conserva su significado. Comprueba medidas y herencia en la preview.
- `vid_w` y `vid_h` sustituyen los nombres del CMS `vid_width` y `vid_height`.
  Los nombres anteriores siguen como alias de lectura; una clave nueva no nula
  tiene prioridad. No se migran archivos automáticamente: revisa los valores
  legados al editar. Las medidas `img_*` no cambian los hechos del vídeo.
- Se conserva `cookies_legal`: `false` o ausente no espera consentimiento;
  `true` espera y respeta retirada para GA4 («Análisis») y medios externos
  («Medios»: YouTube/Vimeo, mapas y Disqus). Comprueba los textos alternativos,
  concesión, retirada, reactivación y reintento, y revisa la política de cookies
  del proyecto según sus proveedores. Los mapas/comentarios que antes
  se cargaban por intersección ahora esperan «Medios» cuando el flag es `true`.
  No se cambia el valor explícito de un consumidor al actualizar. La referencia
  usa `false`.

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

- Revisa shortcodes y SCSS propios que dependan de `$timestamp`, de
  `partial "func/timestamp"` o de `/draws.<timestamp>.svg#...`: el motor actual
  resuelve SVG por recurso/página y no conserva ese sprite global. Usa el
  parcial `icon` y clases propias para el estado/color del icono, sin construir
  URLs de sprites ni selectores ligados a sus nombres. Esta adaptación de
  código personalizado requiere revisión manual; los scripts de migración no
  reescriben shortcodes ni SCSS arbitrarios.

- Los segmentos CSS pequeños pueden insertarse en HTML. Para una CSP que no
  permita esos bloques, configura `params.assets_inline_css: false`; no añadas
  `unsafe-inline` para resolverlo. Revisa el preview del CMS con su nuevo bootstrap.
- Los formularios admiten `type: range` (`min`, `max`, `step`, `value`). Los radios
  antiguos con `type: bool` siguen funcionando. Comprueba condiciones mixtas
  `||`/`&&` si antes dependían del comportamiento incorrecto.
- Los límites `list.date`/`list.end` son inicio y fin inclusivos y se aplican
  antes de paginar. Las fuentes remotas conservan cero, false y cadena vacía;
  `def` sólo sustituye valores ausentes o null. Revisa mapeos que dependieran de
  usar el default para una celda vacía.
- La caché YouTube se reutiliza por ID sin caducidad automática; `fetchedAt`
  conserva la procedencia. `sh do videos --refresh` actualiza explícitamente los
  vídeos referenciados y conserva overrides. No se borran entradas antiguas,
  sin fecha o ya no referenciadas. La política externa de renovación de Google
  sigue siendo aplicable: revisa [metadatos de vídeo](docs/video-metadata.md)
  antes de extender su persistencia a otros proyectos.

- La nueva dependencia requiere instalación: en consumidores npm, `npm install`;
  en pnpm, `pnpm install --no-frozen-lockfile` tras la migración para sincronizar
  el lockfile. El actualizador lo coordina; CI continúa usando lockfile congelado.
- Los [grupos plegables](docs/cms-field-groups.md) sustituyen el selector `view`
  sin anidar el YAML guardado. No elimines datos `view` existentes en masa:
  algunos campos geográficos usan ese nombre. Verifica editar/guardar/reabrir
  cajas y modales. `params.cms_groups: false` ofrece el editor plano. Los
  serializadores preservan valores, pero pueden normalizar formato y comentarios.
  Con cuerpo Markdown separado, no uses también su clave (`body` por defecto)
  en la cabecera: el formato agrupado rechaza esa colisión para evitar pérdida.
  Revisa `body_field.key`/`body_field.inline` o usa el editor plano si ocurre.
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
  `vid_upload`, `vid_title` y `vid_desc`, además de sus alias históricos.
  El CMS guarda `vid_upload` como fecha UTC `YYYY-MM-DD HH:mm:ss` y el JSON-LD
  la normaliza a ISO 8601. Revisa también un enlace `/shorts/` sin ratio conocido:
  su fallback es vertical.
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
