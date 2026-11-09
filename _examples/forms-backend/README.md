# Backend de formularios en Workers Free

Copia `worker.js` y `wrangler.workers.toml` a la raíz del consumidor y marca
los formularios con `action: worker`. `sh do build` genera
`worker/forms.generated.js` (añádelo a `.gitignore`: se regenera en cada build).

```sh
node core/node_modules/wrangler/bin/wrangler.js d1 migrations apply forms-example --local --config wrangler.workers.toml
node core/node_modules/wrangler/bin/wrangler.js dev --config wrangler.workers.toml
```

Para enviar de verdad con la cuenta por defecto de SanSoul (`sansoulsend`),
sigue «Cuenta por defecto de SanSoul» en `core/forms/README.md`: el secreto se
carga desde el archivo de grant protegido sin imprimir valores.

Los IDs de D1/KV son ficticios: sustitúyelos solo tras revisar la cuenta. Con
comercio, un único Worker compone ambos módulos: `/api/forms/*` primero y el
resto a `createCommerceWorker`; añade las dos rutas a `run_worker_first` y los
bindings de ambos. Usa una base D1 propia por proyecto (Free admite pocas por
cuenta: verifica el límite vigente) y no compartas `FORMS_DB` entre clientes.

Detalle del contrato en `core/forms/README.md`.
