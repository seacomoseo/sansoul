# Backend de formularios en Workers Free

No hay nada que copiar: marca los formularios con `action: worker` (o
`inputs.action: worker` en `data/styles.yml`). `sh do build` genera
`worker/forms.generated.js` y el CI (`core/ci/run`) genera la entrada del Worker y
`worker/wrangler.jsonc`, crea por nombre la D1 `<worker>-forms` y el KV
`<worker>-files` del proyecto (nunca compartidos con otra web), aplica las
migraciones y despliega. Las variables no secretas van en `hugo.yml`:

```yaml
params:
  worker_vars:
    FORMS_PROVIDER: hold          # producción: gmail
    FORMS_SENDER_NAME: Ejemplo
    # FORMS_GMAIL_DEFAULT: sansoulsend
    # FORMS_DRIVE: "false"
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

Detalle del contrato en `core/forms/README.md`.
