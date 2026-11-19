// Admin API of the site mail («Correo» page): accounts, a test send per
// account, the route of each kind of mail and the release of notices that
// waited for an account. Same people as the forms panel (GitHub push access).
import { authorize, releaseOrDiscard } from '../forms/admin.js'
import { WAIT_UNTIL_MS, dispatch } from '../forms/dispatch.js'
import { UNCONFIGURED } from '../forms/delivery.js'
import { FormsError, jsonResponse } from '../forms/http.js'
import { validAddress } from '../forms/mime.js'
import { connectRef, googleConfigured, grantKeyConfigured, startConnect } from '../forms/grants.js'
import { hitRate, requireDatabase } from '../forms/store.js'
import { ACCOUNT_ID, accountProvider, deleteAccount, listAccounts, loadRoutes, recordTest, resolveAccountId, saveAccount, saveRoutes } from './accounts.js'
import { DRIVE_KIND, mailKinds } from './kinds.js'

const DAY_MS = 24 * 3600 * 1000
const TESTS_PER_DAY = 20
const RELEASE_MAX = 20
const BODY_MAX = 8192

async function body (request) {
  if (Number(request.headers.get('content-length') || 0) > BODY_MAX) throw new FormsError('payload_too_large', 413)
  const data = await request.json().catch(() => null)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new FormsError('invalid_body', 400)
  return data
}

// Variable a feature reads before the default route (kept for projects set up
// before the panel existed).
const kindFallback = (env, kind) => kind.startsWith('commerce.') ? env.COMMERCE_NOTIFY_ACCOUNT || '' : ''

async function summary (db, env) {
  const [accounts, routes] = await Promise.all([listAccounts(env), loadRoutes(env)])
  const effective = {}
  for (const kind of mailKinds()) {
    if (kind.id === DRIVE_KIND) continue
    effective[kind.id] = await resolveAccountId(env, kind.id, { fallback: kindFallback(env, kind.id), routes })
  }
  const owner = accounts.find(account => account.id === effective['forms.owner']?.id)
  effective[DRIVE_KIND] = routes[DRIVE_KIND] ? { id: routes[DRIVE_KIND], source: 'route' } : owner?.provider === 'gmail' ? { id: owner.id, source: 'forms.owner' } : null
  const [unconfigured, sent] = (await db.batch([
    db.prepare("SELECT COUNT(*) AS n FROM forms_jobs WHERE state = 'held' AND last_error = ?").bind(UNCONFIGURED),
    db.prepare(`SELECT json_extract(authority, '$.ref') AS ref, COUNT(*) AS sent FROM forms_jobs
      WHERE state = 'sent' AND updated_at >= ? GROUP BY ref`).bind(Date.now() - DAY_MS)
  ])).map(result => result.results)
  return {
    accounts: accounts.map(account => ({ ...account, sent24h: sent.find(row => row.ref === account.id)?.sent || 0 })),
    routes,
    effective,
    kinds: mailKinds().map(kind => ({ id: kind.id, label: kind.label, group: kind.group, gmailOnly: kind.gmailOnly })),
    hold: env.FORMS_PROVIDER === 'hold',
    unconfigured: unconfigured[0].n,
    google: { configured: googleConfigured(env), connectRef: connectRef(env) },
    grantKey: grantKeyConfigured(env),
    variables: {
      FORMS_PROVIDER: env.FORMS_PROVIDER || null,
      FORMS_GMAIL_DEFAULT: env.FORMS_GMAIL_DEFAULT || null,
      COMMERCE_NOTIFY_ACCOUNT: env.COMMERCE_NOTIFY_ACCOUNT || null
    }
  }
}

function testMessage (site, account, lang) {
  const es = lang !== 'en'
  const subject = es ? `Prueba de correo de ${site}` : `Mail test from ${site}`
  const text = es
    ? `Este es un correo de prueba de la cuenta «${account.id}» (${account.account}) de ${site}. Si lo recibes, la cuenta funciona.`
    : `This is a test mail from the account "${account.id}" (${account.account}) of ${site}. If you receive it, the account works.`
  return { subject, text: `${text}\n`, html: `<p>${text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char])}</p>` }
}

async function testAccount ({ db, env, mailer, manifest, id, input, now }) {
  const to = String(input.to || '').trim().toLowerCase()
  if (!validAddress(to)) throw new FormsError('mail_to_invalid', 400)
  if (await hitRate(db, `mail:test:${manifest.site}`, now(), DAY_MS) > TESTS_PER_DAY) throw new FormsError('rate_limited', 429)
  let authority
  try {
    authority = await mailer.authority(env, id)
  } catch (error) {
    await recordTest(env, id, error.code || 'mail_account_missing', now())
    return { ok: false, error: error.code || 'mail_account_missing' }
  }
  const site = env.FORMS_SITE || manifest.site
  try {
    const result = await mailer.send({
      env,
      authority,
      message: { ...testMessage(site, authority, input.lang), fromName: env.FORMS_SENDER_NAME || site, to: [to], messageId: `mail-test.${crypto.randomUUID()}` },
      signal: AbortSignal.timeout(20000)
    })
    await recordTest(env, id, null, now())
    return { ok: true, ref: result.ref || null, via: result.via || null }
  } catch (error) {
    const code = String(error.code || 'mail_test_failed').slice(0, 120)
    await recordTest(env, id, code, now())
    return { ok: false, error: code, kind: error.kind || null }
  }
}

// Owner notices that waited for an account get it now, a few per call.
async function releasePending ({ db, env, ctx, mailer, manifest, now }) {
  const ids = (await db.prepare("SELECT id FROM forms_jobs WHERE state = 'held' AND last_error = ? ORDER BY updated_at LIMIT ?").bind(UNCONFIGURED, RELEASE_MAX).all()).results.map(row => row.id)
  let released = 0
  for (const id of ids) {
    try {
      if (await releaseOrDiscard({ db, env, mailer, manifest, id, action: 'release', now })) released++
    } catch (error) {
      if (error.code === UNCONFIGURED || error.code === 'delivery_disabled') throw error
    }
  }
  if (released) {
    const work = dispatch({ env, db, kv: env.FORMS_FILES, providers: mailer, now, limit: 3, driveTimeoutMs: 25000, deadline: now() + WAIT_UNTIL_MS })
      .catch(error => console.error('mail_release_dispatch_error', error?.name, String(error?.message).slice(0, 200)))
    if (ctx?.waitUntil) ctx.waitUntil(work)
    else await work
  }
  const left = await db.prepare("SELECT COUNT(*) AS n FROM forms_jobs WHERE state = 'held' AND last_error = ?").bind(UNCONFIGURED).first()
  return { released, remaining: left.n }
}

export async function mailAdmin ({ request, env, ctx, path, manifest, mailer, fetch, now }) {
  const actor = await authorize(request, env, { manifest, fetch, now })
  // Accounts and credentials are a person's decision, never an automation's.
  if (actor !== 'github') throw new FormsError('forbidden', 403)
  const db = requireDatabase(env)
  const method = request.method
  if (method === 'GET' && path === 'summary') return jsonResponse(await summary(db, env))
  if (method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, POST' })
  if (path === 'accounts') {
    const id = await saveAccount(env, await body(request), now())
    return jsonResponse({ ok: true, id })
  }
  const account = path.match(/^accounts\/([^/]{1,64})\/(delete|test)$/)
  if (account) {
    const id = decodeURIComponent(account[1])
    if (!ACCOUNT_ID.test(id)) throw new FormsError('mail_account_id_invalid', 400)
    if (account[2] === 'delete') {
      if (!await deleteAccount(env, id)) throw new FormsError('not_found', 404)
      return jsonResponse({ ok: true })
    }
    return jsonResponse(await testAccount({ db, env, mailer, manifest, id, input: await body(request), now }))
  }
  if (path === 'routes') {
    const input = await body(request)
    await saveRoutes(env, input.routes, now())
    return jsonResponse({ ok: true, routes: await loadRoutes(env) })
  }
  if (path === 'pending/release') return jsonResponse(await releasePending({ db, env, ctx, mailer, manifest, now }))
  if (path === 'google/connect') {
    // Same flow as the forms panel; a new reference adds another Gmail account.
    const clone = request.clone()
    const input = await clone.json().catch(() => ({}))
    const ref = input?.ref || connectRef(env)
    const provider = await accountProvider(env, ref)
    if (provider && provider !== 'gmail') throw new FormsError('account_exists', 409)
    return jsonResponse(await startConnect({ request, env, now, origins: manifest.origins }))
  }
  throw new FormsError('not_found', 404)
}
