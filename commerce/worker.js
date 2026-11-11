import { jsonResponse } from './http.js'
import { dispatchScheduledNotices } from './admin.js'
import { purgeExpiredDeliveryDetails } from './maintenance.js'

// Adapt the existing Pages handlers without changing their business or D1 logic.
// Static Assets normally bypass this module; fallback is also safe in local tests.
export function createCommerceWorker (catalog, routes) {
  return {
    async fetch (request, env, executionContext) {
      const pathname = new URL(request.url).pathname
      if (!pathname.startsWith('/api/commerce/')) return env.ASSETS.fetch(request)
      if (!catalog?.functionsEnabled) return jsonResponse({ error: 'commerce_unavailable' }, 404)
      // The official Functions compiler accepts one trailing slash. Keep the
      // original Request unchanged for method, signature and same-origin checks.
      const routePath = pathname.replace(/\/$/, '')
      let handler
      let params = {}
      if (routePath === '/api/commerce/checkout') handler = routes.checkout
      else if (routePath === '/api/commerce/quote') handler = routes.quote
      else if (routePath === '/api/commerce/webhook') handler = routes.webhook
      else {
        const status = routePath.match(/^\/api\/commerce\/status\/([^/]+)$/)
        const admin = routePath.match(/^\/api\/commerce\/admin(?:\/(.*))?$/)
        if (status) {
          handler = routes.status
          params = { orderId: status[1] }
        } else if (admin) {
          handler = routes.admin
          params = { path: admin[1] ? admin[1].split('/') : [] }
        }
      }
      if (!handler) return env.ASSETS.fetch(request)
      return handler({
        request,
        env,
        params,
        data: {},
        waitUntil: executionContext?.waitUntil?.bind(executionContext),
        passThroughOnException: executionContext?.passThroughOnException?.bind(executionContext)
      })
    },
    // Cron: drain merchant order notices and erase expired delivery data (both bounded).
    // Errors stay in the outbox row; a failed purge retries on the next run.
    scheduled (_event, env, ctx) {
      if (!catalog?.functionsEnabled || !env.COMMERCE_DB) return
      ctx.waitUntil(dispatchScheduledNotices(env, catalog).catch(() => {}))
      const retentionDays = catalog.checkout?.deliveryRetentionDays
      if (retentionDays) ctx.waitUntil(purgeExpiredDeliveryDetails(env.COMMERCE_DB, retentionDays, Math.floor(Date.now() / 1000)).catch(() => {}))
    }
  }
}
