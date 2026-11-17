/*
Purpose: `gitlab` step. Backup project gitlab.com/seacomoseo/<name> (renamed
  from --gitlab-old if given, else created) with a deploy key of its own (push,
  no expiry) whose private half only exists as the GL_DEPLOY_KEY Actions
  secret. --rotate regenerates the key; --delete-old removes the old project
  once the new one holds the mirrored history.
Credentials: GITLAB_TOKEN or secrets file gitlab-seacomoseo.env (GITLAB_TOKEN).
*/
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GITLAB_NAMESPACE, http, repoSecrets, secret, setRepoSecret } from './lib.js'

const GL = 'https://gitlab.com/api/v4'
const KEY_TITLE = 'achu-backup-deploy'
const q = value => encodeURIComponent(value)

export default {
  id: 'gitlab',
  title: 'Copia en GitLab',
  async run (ctx) {
    const slug = `${ctx.owner}/${ctx.repo}`
    const target = `${GITLAB_NAMESPACE}/${ctx.name}`
    const headers = { 'private-token': secret('GITLAB_TOKEN', 'gitlab-seacomoseo.env', 'GITLAB_TOKEN') }
    const get = p => http(`${GL}${p}`, { headers, ok: [200, 404] }).then(r => (r.status === 200 ? r.data : null))
    let project = await get(`/projects/${q(target)}`)
    const old = ctx.gitlabOld && ctx.gitlabOld !== target ? await get(`/projects/${q(ctx.gitlabOld)}`) : null
    if (project) ctx.done(`gitlab.com/${target}`)
    else if (!ctx.apply) ctx.todo(old ? `renombrar gitlab.com/${ctx.gitlabOld} → ${target}` : `crear gitlab.com/${target} (privado)`)
    else if (old) {
      project = (await http(`${GL}/projects/${old.id}`, { method: 'PUT', headers, body: { name: ctx.name, path: ctx.name } })).data
      ctx.done(`gitlab.com/${ctx.gitlabOld} renombrado a ${target}`)
    } else {
      const namespace = await get(`/namespaces/${q(GITLAB_NAMESPACE)}`)
      project = (await http(`${GL}/projects`, {
        method: 'POST',
        headers,
        body: { name: ctx.name, path: ctx.name, namespace_id: namespace.id, visibility: 'private', initialize_with_readme: false }
      })).data
      ctx.done(`gitlab.com/${target} creado`)
    }
    if (!project) return ctx.todo(`clave de despliegue y secreto GL_DEPLOY_KEY en ${slug}`)

    const keys = (await get(`/projects/${project.id}/deploy_keys`) || []).filter(k => k.title.startsWith(KEY_TITLE))
    const stored = ctx.created ? false : repoSecrets(slug).includes('GL_DEPLOY_KEY')
    if (keys.length && stored && !ctx.rotate) ctx.done('clave de despliegue y secreto GL_DEPLOY_KEY')
    else if (!ctx.apply) ctx.todo(`${keys.length ? 'regenerar' : 'crear'} la clave de despliegue y el secreto GL_DEPLOY_KEY`)
    else {
      const { publicKey, privateKey } = keypair(slug)
      const added = (await http(`${GL}/projects/${project.id}/deploy_keys`, {
        method: 'POST', headers, body: { title: `${KEY_TITLE} ${slug}`, key: publicKey, can_push: true }
      })).data
      try {
        setRepoSecret(slug, 'GL_DEPLOY_KEY', privateKey)
      } catch (error) {
        await http(`${GL}/projects/${project.id}/deploy_keys/${added.id}`, { method: 'DELETE', headers })
        throw new Error(`${error.message}; clave nueva retirada, la anterior sigue`)
      }
      for (const key of keys) await http(`${GL}/projects/${project.id}/deploy_keys/${key.id}`, { method: 'DELETE', headers })
      ctx.done(`clave de despliegue nueva y secreto GL_DEPLOY_KEY${keys.length ? ` (${keys.length} anterior(es) retirada(s))` : ''}`)
    }

    if (old && ctx.deleteOld) {
      const commits = await get(`/projects/${project.id}/repository/commits?per_page=1`)
      if (!commits?.length) ctx.warn(`gitlab.com/${ctx.gitlabOld} se conserva: ${target} aún no tiene commits (espera al CI y repite)`)
      else if (!ctx.apply) ctx.todo(`borrar gitlab.com/${ctx.gitlabOld}`)
      else { await http(`${GL}/projects/${old.id}`, { method: 'DELETE', headers }); ctx.done(`gitlab.com/${ctx.gitlabOld} borrado`) }
    }
  }
}

// ed25519 pair in a private temp dir removed at once; the key stays in memory.
function keypair (slug) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-key-'))
  try {
    const file = path.join(dir, 'key')
    execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-q', '-C', `achu-gitlab-backup ${slug}`, '-f', file])
    return { publicKey: fs.readFileSync(`${file}.pub`, 'utf8').trim(), privateKey: fs.readFileSync(file, 'utf8') }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
