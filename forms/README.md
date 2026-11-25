# Formularios con backend propio (Worker)

Envío por defecto desde 14.18.0. Un formulario sin `action` (ni propio ni en
`form.action` de `data/styles.yml`, antes `inputs.action`), o con `action: worker`, envía al Worker
del propio proyecto en `POST /api/forms/submit`, same-origin. Un formulario con
una URL (Apps Script, FormSubmit o acción propia) sigue con ese proveedor: el
puente GAS no cambia. Los proyectos anteriores a 14.18.0 conservan el Apps
Script compartido porque la migración lo fija en `form.action`; quitarlo pasa
el proyecto al Worker.

## Contrato navegador → Worker

- Cuerpo `multipart/form-data` nativo (`FormData`) solo con texto: orden,
  campos repetidos y valores vacíos llegan tal cual. También se acepta
  `application/x-www-form-urlencoded` (reintento local sin archivos). Una parte
  binaria en el envío se rechaza con `upload_required`.
- Archivos: antes del envío, el navegador sube cada archivo raw a
  `POST /api/forms/upload?submission=&page=&form=&field=&index=` con
  `Content-Type`, `Content-Length`, `X-File-Name` (URI-encoded) y
  `X-File-Sha256` (calculado en el navegador). El Worker no parsea ni hashea:
  pasa el stream a KV con `FixedLengthStream`. Motivo medido: en Workers,
  `formData()` costó 8/113/170 ms de CPU para texto/5/8 MiB y el stream raw a
  KV, 2–4 ms con 8 MB. En el envío, el campo de archivo lleva el índice de su
  subida. Cada subida tiene su propia clave en KV (un reintento fallido nunca
  borra la copia buena anterior). Subir a un envío ya guardado da
  `409 submission_committed`; el navegador sigue y el reenvío devuelve el recibo
  original (las referencias se resuelven desde el envío guardado). Las subidas
  no usadas se borran al guardar el envío; las abandonadas, pasadas 24 h (al
  subir otros archivos, en el dispatch admin o con el cron). Una subida de más
  de 12 h ya no vale para enviar. Límites de subida: los del envío, 30 por IP y
  10 minutos y 300 por sitio y día (KV Free: 1.000 escrituras/día por cuenta).
- Campos reservados: `_form` (ID del formulario), `_page` (ruta de la página),
  `_submission_id` (UUID del navegador, clave de idempotencia) y `_gotcha`
  (honeypot). Ningún input oculto define destinatarios, textos ni cuentas.
- Respuesta: `{ result: 'success', persisted: true, submissionId, status }` con
  `status` `accepted` o `review`, siempre tras el commit en D1. Errores:
  `{ result: 'error', error: <código> }` con 4xx/5xx; nunca éxito sin persistir.
- Mismo ID y mismo contenido devuelve el mismo recibo; mismo ID con otro
  contenido, `409 submission_conflict` (el JS reenvía una vez con ID nuevo).
- `Origin` debe coincidir con el origen del Worker, el de `baseURL` o un
  origen adicional declarado en `params.forms_origins` de `hugo.yml`. Añade
  solo dominios del propio sitio, con esquema y sin ruta. El antispam,
  los límites y la revisión siguen aplicando. Límite de 6 envíos nuevos por IP
  y 10 minutos. Los reintentos de un envío ya guardado no cuentan.

## Política en servidor

`sh do build` hace que Hugo publique la política de cada formulario Worker
(destinatarios de `form.mail`/`mail`, asunto, confirmación, campos y reglas de
archivos) y `scripts/build-manifest.js` la mueve a `worker/forms.generated.js`,
fuera de `public/`. Campos desconocidos, honeypot, URLs o palabras de spam y
emails inválidos dejan el envío en `review`: se guarda y no envía nada hasta
que un administrador lo libera. Archivos: tipo según `accept`, número según
`max` (y 10 por envío): 20 MB por archivo y 25 MB por envío. Hasta 1 MB en
total pueden viajar adjuntos si el proveedor admite el formato. La cuenta
explícita de Drive conserva también esos archivos. Los archivos que no se
adjuntan se enlazan desde Drive o el panel, según la configuración.
Con `FORMS_DRIVE = "false"`, sin Drive: 2 MB en total por envío.
Los formularios Worker anuncian 20/25 MB al navegador (`data-file-max`,
`data-files-max`); si se desactiva Drive, el servidor responde 413 por encima
de 2 MB.

## Enriquecimiento en servidor (`enrich`)

Una política puede declarar `enrich: { type, cart }`: antes de guardar, el Worker
llama a la función registrada para ese `type` en
`createFormsWorker(manifest, { enrichers })`, que recibe los campos validados y
devuelve los campos que se guardan, un bloque `{ html, text }` para el aviso
(`lead`, con `leadHide` para no repetir campos) y otro para la confirmación. El
digest de idempotencia cubre lo que envió el visitante, así que un reintento
devuelve el mismo recibo. `cart` debe ser un campo `hidden` del propio
formulario; si el `type` no está registrado, el envío responde
`503 forms_unavailable` sin guardar nada. Uso actual: `commerce_quote`
(`core/commerce/quote-request.js`, formulario de presupuesto del carrito con
`cart_quote: true`), que el generador del Worker conecta solo cuando el proyecto
tiene formularios y comercio.

## Persistencia y entrega

- D1 (`FORMS_DB`, migraciones en `forms/migrations`) es el registro canónico:
  envío inmutable y un trabajo por canal (`owner`, `confirmation`) con la
  autoridad de entrega congelada (proveedor, cuenta, destinatarios y textos).
- KV (`FORMS_FILES`) guarda los bytes de los adjuntos hasta enviar el correo al
  propietario (o descartarlo); después se borran. KV Free admite 1.000
  escrituras y 1.000 borrados al día por cuenta: cada archivo gasta uno de cada. TTL de seguridad de 90 días:
  un envío retenido debe resolverse antes. Sin archivos no hace falta KV; si
  KV falla, el envío responde `503 files_unavailable` sin guardar nada.
- Entrega inmediata con `waitUntil`; reintentos con `POST /api/forms/admin/dispatch`
  (Bearer `FORMS_ADMIN_TOKEN`, p. ej. desde una Action programada) o cron
  opcional. Lease de 90 s con fencing antes del envío: un lease caducado antes
  de llamar al proveedor vuelve a `pending` con backoff (tras 6 intentos, `held`);
  después de llamarlo, queda `held`.
- Respuestas ambiguas del proveedor (red caída, 5xx) quedan `held` y nunca se
  reenvían solas; cuotas (429, 403 de límite) se reintentan con backoff; los
  errores de configuración (grant, scope, cuenta) quedan `held` hasta corregirlos.
  `POST /api/forms/admin/jobs/<id>:<canal>/release|discard` es la decisión
  humana (release también reabre un `failed`; discard del propietario purga
  sus adjuntos).
- Confirmación al visitante: una por destinatario y día y 100 por sitio y día;
  por encima solo se notifica al propietario. Solo con email válido para MIME
  (los demás pasan a `review`). Un cambio de credencial o proveedor posterior al
  envío deja el trabajo `held` (`authority_drift`): la historia no se reasigna.

## Proveedores

Desde 14.20.0 los formularios envían por el **correo del sitio** (`mail/`,
[mail/README.md](../mail/README.md)): el aviso al propietario usa la cuenta del
tipo `forms.owner` y la confirmación, la de `forms.visitor` (Gmail, Brevo,
SMTP2GO o SMTP, configurables desde la página «Correo» del CMS). `form.account`
sigue eligiendo la cuenta de un formulario; sin rutas ni cuentas en el panel,
todo funciona como antes con las variables de abajo.

- `FORMS_PROVIDER = "hold"`: guarda y no envía (previews TEST).
- `FORMS_PROVIDER = "gmail"`: secreto `FORMS_GMAIL_CREDENTIALS` con un mapa
  `{ "<ref>": { account, client_id, client_secret, refresh_token } }` y
  `FORMS_GMAIL_DEFAULT`. Cada formulario puede elegir otra referencia con
  `form.account`. El grant necesita `gmail.send` y `openid email` (sin el
  scope de email no se puede atestiguar la cuenta). Antes de enviar se
  comprueban la cuenta y `gmail.send` del token; si no coinciden, el trabajo
  queda `held` sin enviar. Rotar el refresh token del mismo cliente y cuenta no
  cambia la autoridad; otro cliente OAuth u otra cuenta, sí (`authority_drift`).
- Sin cuenta de correo (ni rutas, ni `FORMS_GMAIL_DEFAULT`, o la cuenta elegida
  no existe) el envío **se guarda** y su aviso queda `held` con
  `mail_unconfigured`, visible en Atención; «Correo» → «Enviar pendientes» lo
  resuelve con la cuenta configurada después. No se crea confirmación al
  visitante. (Hasta 14.19 respondía `503 forms_unavailable` sin guardar.)

## Drive (archivos de formularios)

Drive está activo salvo `FORMS_DRIVE = "false"`. La cuenta Gmail que se elige
explícitamente para `drive` guarda los archivos antes de enviar el aviso,
incluidos los que viajan adjuntos. Sin esa asignación, el aviso usa el Drive
de su cuenta Gmail para los archivos que no se puedan adjuntar. Los enlaces
en el aviso son privados: el propietario del Drive comparte la carpeta con
quien deba verlos. Hace falta un grant con `drive.file`. Ruta:
`Forms/<proyecto>/<id del formulario>/`, con el proyecto
calculado como en el puente GAS (`params.name`; `params.owner` si el nombre es
`site`; si no, `<owner>-<name>`). `FORMS_DRIVE_FOLDER` (ID de una carpeta a la
que la app tenga acceso) sustituye a `Forms`. Con `drive.file` la app solo ve
lo que crea ella: las carpetas de GAS no se reutilizan.

- El ID de cada archivo se genera (`generateIds`) y se guarda en D1 antes de
  subir nada; crear con ese ID y subir el contenido (`PATCH uploadType=media`,
  stream desde KV) se puede repetir sin duplicar, así que los fallos de red o
  5xx de Drive se reintentan solos.
- Tras subir, Drive debe devolver el mismo tamaño, la carpeta y el SHA-256 que
  declaró el navegador; si no coincide, `held` (`drive_checksum_mismatch`) sin
  correo. Grant sin `drive.file` (`drive_scope_missing`) o Drive lleno
  (`drive_storage_full`): `held` antes de subir o enviar.
- Las carpetas se buscan o crean una vez por cuenta y se guardan en D1. Si
  desaparece una carpeta guardada se vuelve a resolver; si desaparece
  `FORMS_DRIVE_FOLDER`, `held` (`drive_root_missing`).
- Tiempos: tras el envío, `waitUntil` da 25 s a Drive (el runtime corta a los
  30 s); lo que no termine lo completa `POST /api/forms/admin/dispatch` (Action
  programada) o el cron. Un trabajo Drive por invocación: puede gastar ~40 de
  las 50 subpeticiones de Free.
- KV es eventualmente consistente entre ubicaciones: si los bytes no aparecen y
  el envío tiene menos de 5 minutos, se reintenta; después, `held`.

## Cuenta por defecto de SanSoul

La cuenta remitente por defecto es `sansoulsend@gmail.com` (grant `gmail.send`,
`drive.file`, `openid`, `userinfo.email`). Loren autoriza guardarla como secreto
del Worker de cada proyecto, también en cuentas Cloudflare de clientes. Es
configuración, no código:

```sh
node core/forms/scripts/gmail-credentials.js --check sansoulsend=<grant.json>
node core/forms/scripts/gmail-credentials.js sansoulsend=<grant.json> \
  | node core/node_modules/wrangler/bin/wrangler.js secret put FORMS_GMAIL_CREDENTIALS --config worker/wrangler.jsonc
```

y en `[vars]`: `FORMS_PROVIDER = "gmail"` y `FORMS_GMAIL_DEFAULT = "sansoulsend"`
(Drive va activo por defecto). El script valida claves y scopes (`drive.file`
incluido salvo `--no-drive`, y entonces `FORMS_DRIVE = "false"`) y se niega a
escribir el secreto en una terminal. Un `form.account` propio sigue teniendo prioridad.
La cuota diaria de Gmail de `sansoulsend` la comparten todos los proyectos que
la usan.

Brevo, SMTP2GO y SMTP: ver [mail/README.md](../mail/README.md).

## Panel del proyecto

`/admin/forms/` (página «Formularios» dentro de Sveltia CMS) muestra los envíos
en tablas: **Todos**, **Atención** (fallidos y retenidos que piden una
decisión), **Revisión** (posible spam) y **Tabla** (un formulario, con sus
campos como columnas). Cada tabla se ordena por cualquier columna, se filtra
(campo, operador y valor; todos los filtros a la vez), se agrupa (grupos
plegables con recuento) y se busca en los valores; la configuración queda por
vista en el navegador. En pantalla ancha, tabla y detalle van lado a lado; en
una columna, la tabla añade el resumen de valores y se desplaza en horizontal.
Detalle con adjuntos (descarga mientras sigan en KV, enlace de Drive después),
«Enviar»/«Descartar» por trabajo y borrado por fila o por selección (casillas,
seleccionar todo y mayúsculas+clic para un rango). «Exportar» ofrece el CSV de
la vista y, en las vistas generales, un ZIP con un CSV por formulario (fórmulas
neutralizadas, BOM UTF-8, hasta 5.000 envíos por descarga). Avisa del envío
desactivado (`hold`), de los correos enviados en 24 h por cuenta (la cuota de
Gmail de una cuenta compartida la gastan todas sus webs), del estado de Drive,
de la retención y de una D1 compartida con otra web.

- **Una D1 y un KV por proyecto.** Las tablas no llevan columna de sitio: dos
  Workers sobre la misma base mezclarían envíos, límites y retención. El panel
  guarda el sitio (`manifest.site`) que usó la base primero y avisa si otro
  sitio la usa. Si un proyecto cambia de dominio a propósito:
  `DELETE FROM forms_meta WHERE key = 'site'` en su D1.

- **Personas:** la sesión GitHub del propio CMS (Sveltia la guarda en
  `localStorage`, mismo origen). El panel la manda como
  `Authorization: GitHub <token>` y el Worker exige `permissions.push` sobre el
  repositorio del CMS (`cms_repo` o `<owner>/<domain>`, que viaja en el
  manifiesto; `FORMS_ADMIN_REPO` lo sustituye). Un token OAuth o clásico debe
  traer además el scope `repo` o `public_repo` (el del CMS lo trae): el token
  de otra aplicación de alguien con permiso no basta. Resultado positivo en caché
  5 min por isolate. Sin sesión, el panel manda a entrar en el CMS; no hay
  login propio ni credenciales generales en el navegador. Revocar el permiso en
  GitHub tarda hasta esos 5 min en surtir efecto en el panel; las denegaciones
  se recuerdan 1 min y un token con formato que no es de GitHub se rechaza sin
  consultarlo.
- **Automatizaciones:** `Authorization: Bearer <FORMS_ADMIN_TOKEN>` (Action de
  dispatch). Mismas rutas.
- El CMS solo registra la página si `GET /api/forms/admin/summary` sin
  credenciales responde 401 JSON (Worker de formularios presente). La página
  «Correo» (`/admin/mail/`) se registra igual con `GET /api/mail/admin/summary`. Página con
  CSP estricta (`script-src 'self'`, `connect-src 'self'`), se niega a
  pintarse dentro de otro origen y copia los tokens `--sui-*` del CMS para
  seguir su tema. Respuestas `private, no-store`; descargas como
  `application/octet-stream` adjunto con `sandbox`.

Rutas (`/api/forms/admin/…`): `GET summary`, `GET forms`, `GET submissions`,
`GET submissions/<id>`, `GET submissions/<id>/files/<n>`, `POST submissions/<id>/delete`,
`POST submissions/delete` (`{ ids }`, hasta 50; responde `deleted`, `busy` y
`missing`), `POST jobs/<id>:<canal>/release|discard` (release intenta enviar en
el acto; un trabajo descartado no se reabre), `POST dispatch` (devuelve también
`attention` y `pruned`) y `POST retention`.

El detalle permite guardar una anotación y marcar varias etiquetas de seguimiento
con color. La sesión GitHub puede editar estos datos mediante
`POST submissions/<id>/annotation` con `{ note, labels }` y gestionar las etiquetas
con `POST labels` con `{ id?, name, color }` y `POST labels/<id>/delete`.
Se sigue aceptando `{ note, label }` para clientes con una sola etiqueta.

**Reenviar aviso** conserva el intento anterior y crea otro para el mismo
destinatario desde la cuenta actual, incluso si coincide con la anterior.
El panel pide confirmar el remitente y avisa si faltan adjuntos. El correo
enlaza los archivos disponibles en Drive o en Formularios. «Enviado» significa
que el proveedor lo aceptó, sin confirmar su llegada al buzón.

`GET submissions` admite `view=all|attention|review`, `form=<página#id>`,
`q=` (busca en los valores, no en los nombres de campo), `filter=` (JSON `[[columna, operador, valor], …]`,
hasta 10), `sort=<columna>:asc|desc` o `sort=[[columna, dirección], …]`
(hasta cuatro criterios en orden de prioridad), `group=<columna>` (con `tz=` en minutos
para agrupar por día), `limit=` (≤ 100), `full=1` (valores completos, para
exportar) y `before=` (el `next` de la página anterior). Columnas: `created`,
`form`, `state`, `files`, `note`, `label` y `f:<campo>`. Para `label`, el
filtro comprueba la presencia de cada etiqueta por id, el orden usa nombres
y los grupos reúnen envíos con la misma combinación. Agrupar por día usa el desfase
horario actual del navegador (en el cambio de hora, un envío cercano a
medianoche puede caer en el día de al lado). Filtrar, ordenar y agrupar ocurre en D1
sobre todos los envíos que cumplen, así que páginas, `total` y `groups` son
exactos; el Worker solo convierte la página que devuelve (50 filas por
defecto). Coste en filas leídas (D1 Free: 5 M al día): con el orden por
defecto, el índice de fecha para tras una página y el recuento de la primera
página lee una fila por envío que cumple; con otro orden o agrupación, cada
envío que cumple cuesta lo que su clave (≈1 fila la fecha o el formulario, ≈2
el estado, ≈1 por campo del envío un campo) y el resumen, el estado y los
valores se calculan solo para la página (medido en D1: ~16 filas por envío si
se calculasen para todos). Borrar es una transacción: si un trabajo del envío está en cola o
enviándose, ese envío no se borra (`busy`); los bytes de KV se borran después,
hasta 100 por llamada (KV Free: 1.000 borrados al día; lo que falle o pase de
ahí lo elimina su TTL de 90 días). Las exportaciones leen en el orden por
defecto (cursor por índice) y ordenan en el navegador; el Worker no parsea los
valores: recorta en SQL o devuelve el JSON guardado tal cual.

Un envío que no cabe en lo que queda de `waitUntil` (30 s, Drive incluido) no
se empieza: vuelve a la cola (`deferred`) sin gastar intento y lo termina el
siguiente dispatch.

**Retención:** `FORMS_RETENTION_DAYS` (sin valor, no se borra nada). Borra los
envíos más antiguos cuyos trabajos estén cerrados (enviados o fallidos), con
sus bytes de KV; los retenidos esperan a una persona. Corre en el dispatch y
en el cron. Los archivos ya copiados a Drive se quedan en Drive.

## Importar el histórico de Google Sheets

**Hoja central (Apps Script compartido):** `sh do new --only cloudflare,forms-history`
muestra el plan y `--apply` lo ejecuta. Exporta la hoja «Formularios» en
memoria como XLSX (`forms/scripts/xlsx.js`, sin dependencias), toma las
pestañas `<dominio>#<id del formulario>` (XLSX corta los nombres a 31
caracteres: el id se recupera de los `id:` del proyecto y, si es ambiguo, el
plan lo marca para revisar), crea la D1 `<worker>-forms` si falta, aplica sus
migraciones registrándolas en `d1_migrations` como Wrangler, importa con
`INSERT OR IGNORE` y comprueba que cada fila exista por su id. Repetirlo solo
añade filas nuevas. Credenciales: el grant de Drive de la agencia y el token de
usuario de Cloudflare. No escribe archivos locales.

El panel aparece tras el siguiente despliegue aunque el proyecto ya no tenga
formularios del Worker: la build publica la identidad del sitio
(`files/forms-site`) y el CI activa el backend si encuentra esa D1
(`worker-config.js --resolve`, `hasHistory`).

**Otras hojas (CSV):** herramienta manual, nunca automática (ni CI, ni build, ni cron): al migrar un proyecto desde el backend antiguo, `node forms/scripts/import-sheet.js --csv <pestaña.csv> --form <id> --tz <zona de la hoja> --out <x.sql>` convierte una pestaña exportada a CSV en `INSERT OR IGNORE` sobre `forms_submissions` (marca `imported:sheets`, sin trabajos de envío, ids estables, repetible sin duplicar). Opciones: `--page /ruta/ --fixed-page` agrupa un formulario retirado bajo una sola entrada del panel; `--drop-values ❌` descarta celdas «no elegido». Se aplica con `wrangler d1 execute <db> --remote --file <x.sql>`, con aprobación y verificación de recuentos; después hay que borrar los CSV/SQL (datos personales). Deshacer: `DELETE FROM forms_submissions WHERE reasons LIKE '%imported:sheets%'`.

## Pruebas

`pnpm run test:forms` usa D1 y KV locales de workerd y un Google falso
(OAuth, Gmail y Drive). No envía correos reales, no escribe en Drive ni
certifica la CPU de Workers Free en la nube.
