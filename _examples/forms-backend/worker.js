import { createFormsWorker } from './core/forms/worker.js'
import { manifest } from './worker/forms.generated.js'

const forms = createFormsWorker(manifest)

// Forms answer /api/forms/*; everything else stays on Static Assets. With
// commerce, return `commerce.fetch(request, env, ctx)` instead of ASSETS.
export default {
  fetch (request, env, ctx) {
    if (new URL(request.url).pathname.startsWith('/api/forms/')) return forms.fetch(request, env, ctx)
    return env.ASSETS.fetch(request)
  },
  scheduled: forms.scheduled
}
