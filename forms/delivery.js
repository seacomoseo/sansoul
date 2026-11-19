// Delivery plan of a form submission: the account of each channel (site mail
// kinds `forms.owner` and `forms.visitor`) and where large files go. The plan
// is frozen in each job's authority when the submission is accepted.
import { FormsError, sha256Hex } from './http.js'
import { LIMITS, driveEnabled } from './intake.js'
import { loadRoutes } from '../mail/accounts.js'

export const OWNER_KIND = 'forms.owner'
export const VISITOR_KIND = 'forms.visitor'
const CHANNEL_KIND = { owner: OWNER_KIND, confirmation: VISITOR_KIND }
// No account yet (or the chosen one is missing): the submission is stored and
// its owner job waits, held, until someone configures mail and releases it.
export const UNCONFIGURED = 'mail_unconfigured'

async function withFingerprint (authority) {
  return { ...authority, fingerprint: authority.fingerprint || await sha256Hex(JSON.stringify(authority)) }
}

// Authority of one channel: `hold` on previews, the resolved account, or a
// `pending` placeholder that names what to resolve later.
export async function channelAuthority ({ env, mailer, channel, spec, routes }) {
  const kind = CHANNEL_KIND[channel]
  if (env.FORMS_PROVIDER === 'hold') return withFingerprint({ provider: 'hold' })
  try {
    const resolved = await mailer.resolve(env, kind, { account: spec.account || '', routes })
    if (resolved) return resolved
  } catch (error) {
    if (!(error instanceof FormsError)) throw error
  }
  return { provider: 'pending', kind, choice: spec.account || '' }
}

// Small totals ride inside the email; larger ones go to a Gmail account's
// Drive. Without Drive, larger sets stay in the panel, linked from the notice.
// Measured on Workers Free (14.20, mail/README.md): encoding 1 MB costs 4-9 ms
// of CPU and 2 MB 8-23 ms, so Brevo, SMTP2GO and SMTP attach up to
// LIMITS.inlineBytes; Gmail keeps its historical LIMITS.noDriveBytes
// (FORMS_DRIVE = "false"), which can exceed the 10 ms budget.
export async function filesPlan ({ env, mailer, authority, files, manifest, spec, routes }) {
  if (!files.length) return null
  const bytes = files.reduce((total, file) => total + file.size, 0)
  const base = { root: env.FORMS_DRIVE_FOLDER || '', project: manifest.project || manifest.site, label: spec.id }
  if (bytes <= LIMITS.inlineBytes) return { ...base, mode: 'inline' }
  if (driveEnabled(env)) {
    // Hold: nothing is sent; keep the historical plan.
    if (authority.provider === 'hold') return { ...base, mode: 'drive' }
    const drive = await mailer.driveAuthority(env, authority, routes)
    if (drive) return { ...base, mode: 'drive', ...(drive.ref !== authority.ref || drive.provider !== authority.provider ? { drive } : {}) }
  }
  const attachable = authority.provider === 'gmail' ? LIMITS.noDriveBytes : LIMITS.inlineBytes
  return { ...base, mode: bytes <= attachable ? 'inline' : 'panel' }
}

// Owner and visitor jobs for an accepted (or review) submission.
export async function planJobs ({ env, mailer, parsed, manifest, content, extra, confirm }) {
  const routes = await loadRoutes(env)
  const spec = parsed.spec
  const owner = await channelAuthority({ env, mailer, channel: 'owner', spec, routes })
  const storage = owner.provider === 'pending' ? null : await filesPlan({ env, mailer, authority: owner, files: parsed.files, manifest, spec, routes })
  const held = parsed.status === 'review' ? 'review' : owner.provider === 'hold' ? 'delivery_disabled' : owner.provider === 'pending' ? UNCONFIGURED : null
  const ownerLead = extra?.owner ? { lead: extra.owner, leadHide: extra.hide || [] } : null
  const jobs = [{ channel: 'owner', state: held ? 'held' : 'pending', reason: held, authority: { ...content, ...owner, ...(storage ? { files: storage } : {}), ...ownerLead } }]
  if (!confirm) return jobs
  const visitor = await channelAuthority({ env, mailer, channel: 'confirmation', spec, routes })
  // A confirmation days later would confuse the visitor: none without an account.
  if (visitor.provider === 'pending') return jobs
  const visitorHeld = parsed.status === 'review' ? 'review' : visitor.provider === 'hold' ? 'delivery_disabled' : null
  jobs.push({ channel: 'confirmation', state: visitorHeld ? 'held' : 'pending', reason: visitorHeld, authority: { ...content, ...visitor, confirm: spec.confirm, ...(extra?.visitor ? { lead: extra.visitor } : null) } })
  return jobs
}

// Releasing an owner job that waited for an account: resolve it now (a human
// decision) and replace the placeholder job. Returns the new authority or null.
export async function resolvePending ({ env, mailer, stored, submission, manifest }) {
  const routes = await loadRoutes(env)
  const spec = { account: stored.choice || '', id: stored.files?.label || formLabel(submission) }
  const owner = await channelAuthority({ env, mailer, channel: 'owner', spec, routes })
  if (owner.provider === 'pending' || owner.provider === 'hold') return null
  const { provider, kind, choice, files, ...content } = stored
  const storage = await filesPlan({ env, mailer, authority: owner, files: submission.files, manifest, spec, routes })
  return { ...content, ...owner, ...(storage ? { files: storage } : {}) }
}

const formLabel = submission => String(submission.form_key || '').split('#').slice(1).join('#') || 'form'
