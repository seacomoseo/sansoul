# Ejemplo opcional: backend de comercio

Este ejemplo separado activa únicamente las Pages Functions de comercio. No añade interfaz, datos de producto, valores comerciales reales, binding D1 ni configuración de Stripe. No se copia con el ejemplo general de `_examples/data/` y `_examples/content/`.

Úsalo en un consumidor aislado o vacío, desde la raíz del proyecto:

```sh
cp themes/sansoul/_examples/commerce-backend/data/commerce.yml data/commerce.yml
cp -R themes/sansoul/_examples/commerce-backend/functions/. functions/
sh do hugo
```

El build debe incluir únicamente `/api/commerce/*` en `public/_routes.json`. `functions_enabled` opta por ese enrutamiento; si se omite, sigue `enabled` por compatibilidad. El manifiesto generado permanece en `functions/_commerce/catalog.generated.js`, fuera de `public/`. La compilación no inserta JavaScript ni UI de comercio.

`checkout_approved: false` y la ausencia de bindings mantienen bloqueada la creación de sesiones. El ejemplo no está listo para desplegar: no incluye base D1 ni secretos. No lo copies a una tienda con productos sin asignar primero, de forma explícita, sus identificadores comerciales estables y SKU únicos; con `enabled: true`, el build valida todos los productos y falla si esos datos faltan o son inválidos. Si `data/commerce.yml` se omite o se deja desactivado sin `functions_enabled: true`, esos campos no son necesarios y no se incluyen rutas de Functions.

Si una tienda ya tiene pedidos, no uses la eliminación de `data/commerce.yml` como rollback: eso quita las rutas y no cancela sesiones existentes ni revierte D1 o Stripe. Para pausar nuevas ventas sin perder webhooks, consulta de estado ni operaciones administrativas, conserva la configuración y usa `enabled: false` con `functions_enabled: true`. El catálogo desactivado bloquea también el checkout repetido con una clave de idempotencia previa. Mantén D1 y los bindings privados operativos; las sesiones externas ya creadas requieren expiración o cancelación en Stripe.

Para pruebas de Pages Functions + D1 locales, consulta `commerce/test/d1.integration.test.js`; no se usan pagos reales.
