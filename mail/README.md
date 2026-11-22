# Correo del sitio

Desde 14.20.0, formularios (`forms/`), comercio (`commerce/notifier.js`) y las
funciones futuras envían por una sola configuración de correo del proyecto: las
**cuentas de envío** y la **cuenta de cada tipo de envío**. El cliente la
gestiona desde la página **«Correo»** del CMS (`/admin/mail/`) sin depender de
ninguna cuenta de Seacomoseo.

## Cuentas

| Proveedor | Cómo se conecta | Dónde vive |
| --- | --- | --- |
| `gmail` | Botón «Conectar Gmail» (OAuth, app «SanSoul Web») | `forms_grants` (token cifrado) o secreto `FORMS_GMAIL_CREDENTIALS` |
| `brevo` | Clave API (`POST https://api.brevo.com/v3/smtp/email`) | `mail_accounts` o secreto `MAIL_ACCOUNTS` |
| `smtp2go` | Clave API (`POST https://api.smtp2go.com/v3/email/send`) | `mail_accounts` o secreto `MAIL_ACCOUNTS` |
| `smtp` | Servidor, puerto 587 (STARTTLS) / 465 (TLS) / 2525, usuario y contraseña | `mail_accounts` o secreto `MAIL_ACCOUNTS` |

- Puede haber varias cuentas a la vez, también dos del mismo proveedor con
  remitentes distintos. Todas comparten un espacio de ids (`[A-Za-z0-9_.-]`).
- El panel asigna el id al crear la cuenta. El nombre visible es opcional y
  editable, también para Gmail, y se puede cambiar sin tocar las rutas.
- Claves y contraseñas se guardan cifradas en D1 (`FORMS_DB`, migración
  `forms/migrations/0006_mail.sql`) con AES-GCM derivado de `FORMS_GRANT_KEY`,
  ligadas a id, proveedor y remitente. Sin `FORMS_GRANT_KEY` el panel no guarda
  cuentas (las de Gmail tampoco).
- Alternativa por secretos del Worker: `MAIL_ACCOUNTS` =
  `{ "<id>": { "provider", "sender", "sender_name"?, "api_key" | "host", "port", "security", "username", "password" } }`.
  Un secreto gana a una fila de D1 con el mismo id y el panel lo muestra en solo
  lectura.
- El SMTP usa `connect()` de `cloudflare:sockets`; el puerto 25 está bloqueado
  por Cloudflare y se rechaza.
- La primera cuenta que se añade (o el primer Gmail conectado) pasa a ser la
  cuenta por defecto, salvo que ya la decida `FORMS_GMAIL_DEFAULT` o una ruta.
- Cada cuenta tiene «Probar» (hasta 20 pruebas al día por sitio); el resultado
  queda en la tarjeta.

## Tipos de envío y reparto

En Correo, «Configurar una cuenta por tipo de envío» agrupa las rutas de
Formularios, Pedidos y Drive. Debajo de cada selector aparece la cuenta en uso.

Registro en `mail/kinds.js` (`registerMailKind` para funciones nuevas; el id se
guarda en D1, no se renombra):

| Tipo | Uso |
| --- | --- |
| `forms.owner` | Aviso de cada formulario al propietario |
| `forms.visitor` | Confirmación a quien envía el formulario |
| `commerce.merchant` | Avisos de pedidos a la tienda |
| `commerce.buyer` | Confirmación, envío y factura al comprador |
| `drive` | Gmail cuyo Drive guarda archivos de formularios y copias de facturas |

`mail_routes` guarda la cuenta de cada tipo (`default` = cuenta por defecto).
Orden de resolución:

1. `FORMS_PROVIDER = "hold"` (solo formularios): no se envía nada.
2. Cuenta elegida en el propio formulario (`form.account`).
3. Ruta del tipo (panel).
4. Variable de la función: `COMMERCE_NOTIFY_ACCOUNT` para los tipos de comercio.
5. Ruta `default` (panel).
6. `FORMS_GMAIL_DEFAULT` (configuración anterior al panel).
7. Ninguna: sin cuenta (ver abajo).

`drive`: la ruta `drive` (solo Gmail) o, si no hay, la cuenta de
`forms.owner`/`commerce.merchant` cuando es Gmail.

## Envío y estados

Cada trabajo congela su autoridad `{ provider, ref, account, fingerprint }`.
Antes de cada envío se vuelve a resolver la cuenta por su id: otro proveedor,
remitente, servidor o usuario deja el trabajo `held` (`authority_drift`); rotar
la clave o la contraseña de la misma cuenta no. El nombre de remitente de la
cuenta, si lo tiene, gana al del sitio.

| Resultado | Brevo | SMTP2GO | SMTP |
| --- | --- | --- | --- |
| Enviado | 201 con `messageId` | 200, `succeeded > 0` | 250 tras el punto final de DATA |
| Reintento (no se envió) | 429, 402 (sin créditos) | 429 | conexión fallida, 4xx antes o después de DATA |
| Retenido por configuración | 401, otros 4xx | 401/403, otros 4xx | AUTH rechazado (535), 5xx |
| Ambiguo (retenido, nunca se reenvía solo) | red, 5xx | red, 5xx | sin respuesta tras el punto final |

Brevo y SMTP2GO exigen `to`: un aviso con varios destinatarios va al propio
remitente con los destinatarios en copia oculta. En SMTP la copia oculta solo
viaja en el sobre (`RCPT TO`), nunca en las cabeceras.

## Sin cuenta configurada

Un formulario del Worker ya no responde 503: el envío se guarda en D1 y su aviso
al propietario queda `held` con `mail_unconfigured` (sin confirmación al
visitante: llegaría tarde). El panel «Formularios» lo muestra en Atención con un
enlace a «Correo», y «Correo» ofrece **«Enviar pendientes»**: al liberarlo se
resuelve la cuenta en ese momento (decisión humana) y el trabajo se sustituye por
uno con la autoridad real (la autoridad sigue siendo inmutable).

Si el sitio tenía `FORMS_PROVIDER = "hold"`, los avisos antiguos siguen
retenidos cuando se habilita el envío. Para solicitar uno, abre el detalle en
«Formularios» y pulsa **«Enviar»**. Se resuelve la cuenta para ese aviso en ese
momento y se conservan su texto y destinatarios.

Si Brevo rechazó el aviso con HTTP 400, el detalle muestra **«Reintentar con
la configuración actual»**. Al pulsarlo, se elige otra vez la cuenta y el
destino de los adjuntos. Las respuestas ambiguas conservan la cuenta original.

## Archivos

- Hasta 1 MB en total: adjuntos en el correo (desde KV). Si se elige una cuenta
  explícita para `drive`, se conserva también una copia en su Drive y el aviso
  incluye el enlace.
- Cuando Brevo no admite una extensión, como WebP, el aviso enlaza a Drive
  si está configurado o al panel de Formularios si el archivo sigue en KV.
- Más de 1 MB con una cuenta Gmail para `drive`: se suben a su Drive y el correo
  los enlaza (puede salir por Brevo, SMTP2GO o SMTP con los enlaces de Drive).
- Sin Gmail: los archivos de más de 1 MB en total se quedan en KV (TTL de 90
  días) y el aviso enlaza a `/admin/forms/`, donde se descargan.
- CPU medida en Workers Free (cuenta SanSoul, 2026-11-19, `cpuTime` de
  `wrangler tail`, 3 rondas, solo la codificación del adjunto):

  | Adjunto | Brevo (JSON) | SMTP2GO (JSON) | SMTP / Gmail (MIME) |
  | --- | --- | --- | --- |
  | 512 KB | 2–6 ms | 1–2 ms | 4–5 ms |
  | 1 MB | 4–6 ms | 4–6 ms | 5–9 ms |
  | 2 MB | 8–14 ms | 8–14 ms | 10–23 ms |

  El límite de Free es 10 ms por invocación: por eso el corte en 1 MB. Gmail con
  `FORMS_DRIVE = "false"` sigue adjuntando hasta 2 MB (comportamiento anterior),
  que puede pasar de ese límite.
- Límites de los proveedores (solo para otros usos): Brevo 4 MB por adjunto y
  20 MB por mensaje; SMTP2GO 50 MB por mensaje con el base64.
- R2 en la cuenta del cliente queda descartado: exige activar un método de pago
  en Cloudflare aunque no se pase del plan gratuito.

## Panel «Correo»

Aparece en el CMS siempre que el Worker tenga el backend de formularios
(formularios, histórico importado o comercio: desde 14.20.0 el comercio también
enlaza `FORMS_DB`/`FORMS_FILES`), aunque no haya formularios ni envíos. Mismas
personas que «Formularios» (permiso de escritura en el repositorio del CMS); el
token Bearer de automatizaciones no puede tocar cuentas.

Rutas (`/api/mail/admin/…`): `GET summary`, `POST accounts` (alta o edición; sin
secreto conserva el guardado), `POST accounts/<id>/delete` (un Gmail del panel
se desconecta), `POST accounts/<id>/test` (`{ to }`), `POST routes`
(`{ routes: { <tipo>|default: <id>|'' } }`), `POST pending/release` (hasta 20 por
llamada) y `POST google/connect` (`{ ref }`; una referencia nueva añade otro
Gmail).

Para cambiar el nombre visible de una cuenta Gmail del panel, se usa
`POST accounts/<id>/name` con `{ displayName }`.

## Conectar Gmail sin registrar cada dominio

Hoy cada dominio necesita su URI de retorno en el cliente OAuth «SanSoul Web».
Alternativa: un **relé de retorno fijo**.

- En el Worker que hace de relé (p. ej. sansoul.es): `FORMS_OAUTH_RELAY_HOSTS`
  con los hosts a los que puede reenviar (`cliente.es,*.sansoul.es`). Se registra
  una sola vez `https://<relé>/api/forms/google/relay` en Google Cloud.
- En cada sitio: `FORMS_GOOGLE_REDIRECT = "https://<relé>/api/forms/google/relay"`.
  El estado firmado lleva el callback del propio sitio; Google vuelve al relé y
  este redirige `code` y `state` a ese callback, que comprueba firma, cookie del
  navegador y PKCE como siempre.
- El relé no guarda nada ni tiene secretos; sin la lista de hosts responde 404.
  El código no sirve sin el secreto del cliente OAuth y el verificador PKCE del
  sitio, pero el secreto está en todos los Workers de clientes: por eso la lista
  de hosts es obligatoria (añadir un dominio es cambiar una variable nuestra, no
  la consola de Google).

## DNS del dominio (SPF, DKIM, DMARC)

Con Gmail no hace falta nada. Con Brevo, SMTP2GO o un SMTP propio, el remitente
debe estar verificado y el dominio autenticado en la zona del cliente con los
registros que da cada proveedor:

- **Brevo** (Remitentes, dominios e IP dedicadas → Dominios → Autenticar): TXT
  `brevo-code:…`, dos CNAME DKIM (`brevo1._domainkey`, `brevo2._domainkey`) y un
  TXT `_dmarc` si no existe.
- **SMTP2GO** (Sending → Verified Senders → Sender Domains): tres CNAME (retorno,
  DKIM `s…._domainkey` y seguimiento de enlaces).
- **SMTP propio**: SPF (`include:` del proveedor en el TXT `v=spf1` del dominio,
  uno solo por dominio) y DKIM según el proveedor.

Automatizarlo en `sh do new` (zona en Cloudflare) queda pendiente: los valores
salen del panel de cada proveedor tras dar de alta el dominio.

## Pruebas

`pnpm run test:forms` incluye `mail/test/mail.test.js`: Brevo y SMTP2GO falsos,
un servidor SMTP en memoria detrás de un `connect()` como el de
`cloudflare:sockets`, reparto, deriva de autoridad, envío sin cuenta, archivos y
relé. No envía correos reales.
