# Backend de formularios en Workers Free

No hay nada que copiar: marca los formularios con `action: worker` (o
`inputs.action: worker` en `data/styles.yml`). `sh do build` genera
`worker/forms.generated.js` y el CI (`core/ci/run`) genera la entrada del Worker y
`worker/wrangler.jsonc`, crea por nombre la D1 `<worker>-forms` y el KV
`<worker>-files` del proyecto (nunca compartidos con otra web), aplica las
migraciones y despliega. Las variables no secretas van en `hugo.yml`:

```yaml
params:
  # Solo si estos alias sirven el mismo sitio sin redirigir a baseURL.
  # forms_origins:
  #   - https://alias.ejemplo.es
  worker_vars:
    FORMS_PROVIDER: hold          # previews: no envía; en producción, quítalo
    FORMS_SENDER_NAME: Ejemplo
    # FORMS_GMAIL_DEFAULT: sansoulsend   # configuración anterior al panel «Correo»
    # FORMS_DRIVE: "false"
    # FORMS_GOOGLE_REDIRECT: https://<relé>/api/forms/google/relay   # relé OAuth opcional
```

Las cuentas de envío (Gmail, Brevo, SMTP2GO, SMTP) y la cuenta de cada tipo de
envío se configuran desde la página «Correo» del CMS (secreto `FORMS_GRANT_KEY`
obligatorio) o con el secreto `MAIL_ACCOUNTS`
(`core/mail/README.md`):

```json
{ "avisos": { "provider": "brevo", "sender": "web@ejemplo.es", "sender_name": "Ejemplo", "api_key": "<clave>" } }
```

Secretos (`FORMS_ADMIN_TOKEN`, `FORMS_GMAIL_CREDENTIALS`): una vez por Worker con
`wrangler secret put … --config worker/wrangler.jsonc` (ver «Cuenta por defecto de
SanSoul» en `core/forms/README.md`; el script de credenciales nunca imprime valores).

Prueba local tras `sh do build`:

```sh
node core/scripts/worker-config.js
pnpm dlx wrangler@4.147.0 d1 migrations apply FORMS_DB --local --config worker/wrangler.jsonc
pnpm dlx wrangler@4.147.0 dev --config worker/wrangler.jsonc
```

Detalle del contrato en `core/forms/README.md` y `core/mail/README.md`.

## Rutas heredadas en un espejo Netlify

Cuando un sitio ya reenvía formularios a Workers separados, declara primero
las rutas más específicas. El resto de `/api/*` se dirige al Worker del
proyecto con la firma del espejo.

```yaml
params:
  netlify: ejemplo
  netlify_form_proxies:
    - from: /api/forms/evento
      to: https://eventos.ejemplo.workers.dev/v1/forms
    - from: /api/forms
      to: https://eventos.ejemplo.workers.dev/v1/forms
      route: 'principal:ejemplo.es:form-evento'
    - from: /api/forms
      to: https://historico.ejemplo.workers.dev/v1/forms
```

Cada receptor heredado conserva su validación de peticiones. La variable
`SANSOUL_PROXY_SECRET` del espejo sigue asociada al Worker del proyecto.
