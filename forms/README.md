# Formularios con backend propio (Worker)

Módulo opt-in del motor. Un formulario con `action: worker` (o todos, con
`inputs.action: worker` en `data/styles.yml`) envía al Worker del propio
proyecto en `POST /api/forms/submit`, same-origin. El resto de formularios sigue
igual (GAS, FormSubmit o acción propia): el puente GAS no cambia.

## Contrato navegador → Worker

- Cuerpo `multipart/form-data` nativo (`FormData`): orden, campos repetidos,
  valores vacíos y archivos binarios llegan tal cual, sin Base64. También se
  acepta `application/x-www-form-urlencoded` (reintento local sin archivos).
- Campos reservados: `_form` (ID del formulario), `_page` (ruta de la página),
  `_submission_id` (UUID del navegador, clave de idempotencia) y `_gotcha`
  (honeypot). Ningún input oculto define destinatarios, textos ni cuentas.
- Respuesta: `{ result: 'success', persisted: true, submissionId, status }` con
  `status` `accepted` o `review`, siempre tras el commit en D1. Errores:
  `{ result: 'error', error: <código> }` con 4xx/5xx; nunca éxito sin persistir.
- Mismo ID y mismo contenido devuelve el mismo recibo; mismo ID con otro
  contenido, `409 submission_conflict` (el JS reenvía una vez con ID nuevo).
- `Origin` debe coincidir con el host (no autentica al visitante; el antispam,
  los límites y la revisión siguen aplicando). Límite de 6 envíos nuevos por IP
  y 10 minutos; los reintentos de un envío ya guardado no cuentan.

## Política en servidor

`sh do build` hace que Hugo publique la política de cada formulario Worker
(destinatarios de `form.mail`/`mail`, asunto, confirmación, campos y reglas de
archivos) y `scripts/build-manifest.js` la mueve a `worker/forms.generated.js`,
fuera de `public/`. Campos desconocidos, honeypot, URLs o palabras de spam y
emails inválidos dejan el envío en `review`: se guarda y no envía nada hasta
que un administrador lo libera. Archivos: tipo según `accept`, número según
`max` y 2 MB en total por envío (los adjuntos viajan en base64 dentro del correo y
plegarlos cuesta ~2–7 ms de CPU por MB en workerd local; las imágenes ya se
comprimen en el navegador). Archivos mayores requieren el adaptador Drive, pendiente.

## Persistencia y entrega

- D1 (`FORMS_DB`, migraciones en `forms/migrations`) es el registro canónico:
  envío inmutable y un trabajo por canal (`owner`, `confirmation`) con la
  autoridad de entrega congelada (proveedor, cuenta, destinatarios y textos).
- KV (`FORMS_FILES`) guarda los bytes de los adjuntos hasta enviar el correo al
  propietario (o descartarlo); después se borran. TTL de seguridad de 90 días:
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

- `FORMS_PROVIDER = "hold"`: guarda y no envía (previews TEST).
- `FORMS_PROVIDER = "gmail"`: secreto `FORMS_GMAIL_CREDENTIALS` con un mapa
  `{ "<ref>": { account, client_id, client_secret, refresh_token } }` y
  `FORMS_GMAIL_DEFAULT`. Cada formulario puede elegir otra referencia con
  `form.account`. El grant necesita `gmail.send` y `openid email` (sin el
  scope de email no se puede atestiguar la cuenta). Antes de enviar se
  comprueban la cuenta y `gmail.send` del token; si no coinciden, el trabajo
  queda `held` sin enviar. Rotar el refresh token del mismo cliente y cuenta no
  cambia la autoridad; otro cliente OAuth u otra cuenta, sí (`authority_drift`).
- Sin proveedor válido el endpoint responde `503 forms_unavailable` y no guarda.

Drive, Sheets y otros proveedores (Brevo) no forman parte de este corte.

## Pruebas

`pnpm run test:forms` usa D1 y KV locales de workerd y un Google falso. No
envía correos reales ni certifica la CPU de Workers Free en la nube.
