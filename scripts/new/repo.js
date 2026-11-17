/*
Purpose: `repo` step. A private <owner>/<repo> on GitHub, scaffolded from
  seacomoseo/sansoul-demo with the engine as the `core` submodule at its
  published main. The first push happens in the `publish` step, after the CI
  secrets exist, so the first workflow run can already deploy.
*/
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseDocument } from 'yaml'
import { gh, git } from './lib.js'

const DEMO = 'https://github.com/seacomoseo/sansoul-demo.git'
const ENGINE = 'https://github.com/seacomoseo/sansoul.git'
// Demo-only material: its DNA describes the demo; dividers page is a sample.
const SKIP = [/^core$/, /^dna\//, /^content\/page\//]

export default {
  id: 'repo',
  title: 'Repositorio GitHub',
  async run (ctx) {
    const slug = `${ctx.owner}/${ctx.repo}`
    const remote = gh(['repo', 'view', slug, '--json', 'isPrivate,url'], { allowFail: true })
    const local = fs.existsSync(path.join(ctx.dir, '.git'))
    if (remote) {
      const { isPrivate } = JSON.parse(remote)
      ctx.done(`${slug} existe${isPrivate ? ' (privado)' : ''}`)
      if (!isPrivate) ctx.warn(`${slug} es público: los repos de clientes son privados (gh repo edit ${slug} --visibility private --accept-visibility-change-consequences)`)
      if (!local) {
        if (!ctx.apply) return ctx.todo(`clonar en ${ctx.dir}`)
        gh(['repo', 'clone', slug, ctx.dir, '--', '--recurse-submodules'])
        ctx.done(`clonado en ${ctx.dir}`)
      }
      saveProject(ctx)
      return
    }
    if (local) throw new Error(`${ctx.dir} existe pero ${slug} no está en GitHub: revísalo a mano`)
    if (!ctx.apply) return ctx.todo(`crear ${slug} privado desde sansoul-demo en ${ctx.dir}`)
    try {
      scaffold(ctx)
    } catch (error) {
      fs.rmSync(ctx.dir, { recursive: true, force: true })
      throw error
    }
    gh(['repo', 'create', slug, '--private', '--description', ctx.domain])
    git(['remote', 'add', 'origin', `https://github.com/${slug}.git`], ctx.dir)
    ctx.created = true
    ctx.done(`${slug} creado (privado); se sube en el paso final`)
  }
}

function scaffold (ctx) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sansoul-new-'))
  try {
    git(['clone', '--quiet', '--depth', '1', DEMO, tmp])
    const files = git(['ls-files', '-z'], tmp).split('\0').filter(f => f && !SKIP.some(re => re.test(f)))
    for (const file of files) {
      const target = path.join(ctx.dir, file)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(path.join(tmp, file), target)
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  adapt(ctx.dir, ctx)
  git(['init', '--quiet', '-b', 'main'], ctx.dir)
  identity(ctx.dir)
  git(['submodule', '--quiet', 'add', '-b', 'main', ENGINE, 'core'], ctx.dir)
  execFileSync('sh', ['do', 'root-docs'], { cwd: ctx.dir, stdio: 'inherit' })
  git(['add', '-A'], ctx.dir)
  git(['commit', '--quiet', '-m', `SanSoul: alta de ${ctx.domain}`], ctx.dir)
}

// params.project (Vault name) is the project's identity for account and file names.
function saveProject (ctx) {
  const file = path.join(ctx.dir, 'hugo.yml')
  if (!ctx.project || !fs.existsSync(file)) return
  const current = parseDocument(fs.readFileSync(file, 'utf8')).getIn(['params', 'project'])
  if (current === ctx.project) return ctx.done(`hugo.yml project = ${ctx.project}`)
  if (!ctx.apply) return ctx.todo(`hugo.yml project = ${ctx.project}${current ? ` (antes ${current})` : ''}`)
  editYaml(file, doc => doc.setIn(['params', 'project'], ctx.project))
  ctx.changed.push('hugo.yml')
  ctx.done(`hugo.yml project = ${ctx.project}`)
}

// Without a global git identity, commit as the authenticated GitHub user.
export function identity (dir) {
  try { git(['config', 'user.email'], dir); return } catch {}
  const user = JSON.parse(gh(['api', 'user']))
  git(['config', 'user.name', user.name || user.login], dir)
  git(['config', 'user.email', `${user.login}@users.noreply.github.com`], dir)
}

// Replace the demo identity with the project's; pure file edits (tested).
export function adapt (dir, ctx) {
  editYaml(path.join(dir, 'hugo.yml'), doc => {
    doc.set('baseURL', `https://${ctx.domain}`)
    if (ctx.project) doc.setIn(['params', 'project'], ctx.project)
    doc.setIn(['params', 'owner'], ctx.owner)
    doc.setIn(['params', 'repo'], ctx.repo)
    doc.setIn(['params', 'worker'], ctx.worker)
    doc.deleteIn(['params', 'drive_url'])
    if (ctx.mails.length) doc.setIn(['params', 'drive_mails'], ctx.mails.join(', '))
    else doc.deleteIn(['params', 'drive_mails'])
    if (ctx.netlify) doc.setIn(['params', 'netlify'], ctx.netlify)
    else doc.deleteIn(['params', 'netlify'])
    if (doc.hasIn(['params', 'worker_vars', 'FORMS_SENDER_NAME'])) doc.setIn(['params', 'worker_vars', 'FORMS_SENDER_NAME'], ctx.domain)
  })
  // The demo's leading comment speaks about the demo itself.
  const configFile = path.join(dir, 'data', 'config.yml')
  fs.writeFileSync(configFile, fs.readFileSync(configFile, 'utf8').replace(/^(#.*\n)+\n?/, ''))
  editYaml(configFile, doc => {
    doc.set('mail', ctx.mails[0] || `info@${ctx.domain}`)
    doc.delete('ga4')
    doc.set('cms_repo', `${ctx.owner}/${ctx.repo}`)
  })
  const pkgFile = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
  pkg.name = ctx.name
  const replaceRepo = value => value.replace('seacomoseo/sansoul-demo', `${ctx.owner}/${ctx.repo}`)
  if (pkg.repository?.url) pkg.repository.url = replaceRepo(pkg.repository.url)
  if (pkg.bugs?.url) pkg.bugs.url = replaceRepo(pkg.bugs.url)
  if (pkg.homepage) pkg.homepage = replaceRepo(pkg.homepage)
  fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
  const todo = path.join(dir, 'TODO.md')
  if (fs.existsSync(todo)) {
    fs.writeFileSync(todo, fs.readFileSync(todo, 'utf8')
      .replaceAll('var_domain', ctx.domain).replaceAll('var_owner', ctx.owner).replaceAll('var_name', ctx.worker))
  }
}

export function editYaml (file, edit) {
  const doc = parseDocument(fs.readFileSync(file, 'utf8'))
  edit(doc)
  fs.writeFileSync(file, doc.toString())
}
