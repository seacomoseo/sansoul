# Backend opcional en Workers Free

El ejemplo `worker.js` adapta los mismos cuatro handlers Pages; no duplica lógica
comercial, SQL ni autenticación. Copia `worker.js`, `wrangler.workers.toml` y
`functions/` a la raíz de un consumidor aislado. `sh do hugo` genera el catálogo
privado fuera de `public/`; `wrangler deploy --config wrangler.workers.toml --dry-run`
valida el bundle, pero no publica. Wrangler está fijado en el lock del tema.

`assets.run_worker_first` contiene exclusivamente `/api/commerce/*`.
`not_found_handling = "404-page"` evita usar un fallback SPA; `_routes.json` no
controla Workers. La prueba local instrumenta cada respuesta del Worker para
comprobar bypass en HTML, CSS, HEAD, redirects y misses 404. No publique catálogos,
source del backend, credenciales ni datos de pedidos como assets.

`functions_enabled` conserva su nombre y semántica compatibles. Una tienda nunca
comercial debe usar despliegue assets-only (sin `main`), no este ejemplo de API.
Para pausar compras existentes conserva `functions_enabled: true` y D1; usa
`enabled: false` y `checkout_approved: false`. No borres webhooks ni estado.

El ID D1 es deliberadamente ficticio: reemplazar sólo después de revisión del padre.
D1 continúa siendo SQL; R2 no sustituye transacciones ni pedidos. No se aplica
ninguna migración remota. Free es una decisión de cuenta, no una opción TOML:
no configurar CPU paid ni cambiar plan. Si agota cuotas, falla cerrado, no paga.

Ejecuta `npm run test:commerce:workers` dentro del tema y conserva el resultado.
Las fixtures fake son sintéticas, sin pagos reales. La prueba completa requiere
varios minutos; un timeout no cuenta como pass. CPU de workerd local y tiempos
HTTP no certifican CPU cloud de 10 ms. El contrato incompatible propuesto para
8.0.0 (paquetes/locks locales sincronizados; sin publicar) separa mantenimiento: un pedido de
expiración/reparación, un pedido del proveedor o un evento unmatched en llamadas
distintas. Véase `README-ROOT.md` y `MIGRATIONS.md` para los tres valores de
`operation`, cursores/revisión CAS y migraciones 0005–0006. Dispatch intenta una
notificación, recupera como máximo una lease y devuelve `has_more` en lugar del
contador exacto `pending`. No usa COUNT ni ordena todo el backlog del outbox.
La selección due usa `(next_attempt_at, event_key)`, por lo que los reintentos
postergados no monopolizan los turnos. Writes de ack/fallback verifican lease y
número de intento; el notifier debe deduplicar eventKey. La reparación de un
pedido revalida estado dentro del batch antes de liberar sus reservas.
No borra idempotencia ni capabilities. Las pruebas SQL cuentan cada sentencia,
incluidos fallos y constituyentes de batch; esto no certifica CPU ni cuota diaria.
La consulta de expiración aún puede examinar candidatos no vencidos; no afirmar
trabajo SQL constante para todos los perfiles legacy. Datos fuera del límite de
líneas del checkout requieren auditoría. Mantener Free y los gates cerrados.

Paridad revisada contra `wrangler pages functions build` oficial: estos cuatro
handlers no usan middleware, `next`, `functionPath` ni fail-open. El adaptador
conserva Request/cuerpo, métodos, headers y contexto utilizado; admite una barra
final y deja rutas desconocidas a ASSETS. No es un reemplazo genérico del runtime
Pages: añadir middleware requiere volver a compilar oficialmente o revisar el
contrato. El prefijo es sensible a mayúsculas; las rutas `/API/...` quedan fuera
del router API y no tienen la paridad case-insensitive del compilador Pages.

**Excepción comprobada:** workerd normaliza `%2F` antes de escoger assets y antes
de entregar Request. `/api/commerce%2Fcheckout` entra al Worker como
`/api/commerce/checkout`; el gate sigue cerrado, pero no hay aislamiento de cuota
basado en el prefijo de la URL cruda. La prueba conserva esta excepción y el
negativo original fallido como evidencia externa. No afirmar bypass absoluto ni
aprobar el despliegue sin revisar esta aceptación de routing.

El opt-in CMS `cms_repo` desacopla el repositorio GitHub de domain/URLs;
backend.skip_ci sigue true. Esta integración 8.0.0 es local, no una publicación.
No mover gitlinks hasta verificar el SHA compartido publicado.
