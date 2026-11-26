#!/usr/bin/env node

/*
Purpose: `sh do new`: create a SanSoul project, or bring an existing one up to
  the current setup (migrations), with idempotent steps that look up their
  resources by name in each service (no state file).
Run from: Anywhere with `sh <engine>/do new <domain> --owner <org> ...` for a
  new project (cloned to ~/repos/<domain>, or --dir), or from a consumer root
  with `sh do new [--only steps]`, which reads hugo.yml.
Default: print the plan only. --apply executes it; --production also allows
  zone, DNS, Worker custom domains and Search Console verification.
Credentials: see scripts/new/lib.js (never printed, never written to the repo).
*/
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { parse } from 'yaml'
import { readProject } from './project.js'
import { git, projectName, repoSecrets } from './new/lib.js'
import { MAIL_STEPS, confirmMails } from './new/mails.js'
import repo, { identity } from './new/repo.js'
import team from './new/team.js'
import retire from './new/retire.js'
import cloudflare from './new/cloudflare.js'
import ciToken from './new/ci-token.js'
import gitlab from './new/gitlab.js'
import ga4 from './new/ga4.js'
import gsc from './new/gsc.js'
import drive from './new/drive.js'
import formsHistory from './new/forms-history.js'
import gmail from './new/gmail.js'

const netlify = {
  id: 'netlify',
  title: 'Espejo de Netlify',
  skip: ctx => !ctx.netlify,
  async run (ctx) {
    const stored = !ctx.created && repoSecrets(`${ctx.owner}/${ctx.repo}`).includes('NETLIFY_AUTH_TOKEN')
    if (stored) ctx.done(`secreto NETLIFY_AUTH_TOKEN (el CI crea el sitio ${ctx.netlify})`)
    else ctx.manual(`Netlify: crear un token personal y guardarlo como secreto NETLIFY_AUTH_TOKEN de ${ctx.owner}/${ctx.repo}`)
  }
}

const publish = {
  id: 'publish',
  title: 'Publicación',
  async run (ctx) {
    if (!ctx.dir || !fs.existsSync(path.join(ctx.dir, '.git'))) return ctx.apply || ctx.todo('primer commit y push a main')
    const dirty = git(['status', '--porcelain'], ctx.dir)
    const unpushed = ctx.created || !hasUpstream(ctx.dir) ? 'todo' : git(['log', '--oneline', '@{u}..'], ctx.dir)
    if (!dirty && !unpushed) return ctx.done('nada que publicar')
    if (!ctx.apply) return ctx.todo(`commit y push a main (${ctx.changed.join(', ') || 'repositorio nuevo'})`)
    if (dirty) {
      identity(ctx.dir)
      git(['add', ...(ctx.changed.length ? ['--', ...ctx.changed] : ['-A', '--', '.', ':(exclude).sansoul-dev.lock'])], ctx.dir)
      git(['commit', '--quiet', '-m', `SanSoul: ${ctx.created ? 'alta de' : 'sh do new en'} ${ctx.domain} (${ctx.changed.join(', ') || 'configuración'})`], ctx.dir)
    }
    git(['push', '--quiet', '-u', 'origin', 'main'], ctx.dir)
    ctx.done(`publicado en ${ctx.owner}/${ctx.repo} (el CI despliega${ctx.workersDev ? ` en ${ctx.workersDev}` : ''})`)
  }
}

export const STEPS = [repo, team, cloudflare, ciToken, gitlab, netlify, ga4, gsc, drive, formsHistory, gmail, publish, retire]

const HELP = `Uso:
  Proyecto nuevo:     sh <motor>/do new <dominio> --owner <org> [opciones]
  Proyecto existente: sh do new [opciones]   (desde su raíz; lee hugo.yml)
Opciones:
  --project "Nombre"  nombre del proyecto, como su nota del Vault (params.project): nombra la
                      cuenta de Cloudflare y los archivos de Drive
  --repo NAME         repositorio (por defecto site)
  --worker NAME       Worker (por defecto el repo: <repo>.<org>.workers.dev)
  --mails a,b         correos del cliente (drive_mails): confirma a quién se comparten la hoja de
                      accesos y GA4; sin él, --apply pide confirmar los de hugo.yml (o no comparte)
  --members u1,u2     usuarios de GitHub del cliente (equipo clients: maintain en el repo)
  --netlify NAME      espejo de Netlify opcional
  --cf-account ID     cuenta de Cloudflare (por defecto, la que se llame como el dominio)
  --gitlab-old NS/P   proyecto de GitLab antiguo a renombrar; --delete-old lo borra tras copiar
  --dir PATH          carpeta del clon (por defecto ~/repos/<dominio>)
  --only a,b          pasos: ${STEPS.map(s => s.id).join(', ')}
  --rotate            regenera el token de CI y la clave de GitLab
  --apply             ejecuta (sin él solo muestra el plan)
  --production        permite zona, DNS, dominios del Worker y verificar Search Console
  --retire            tras verificar la migración: borra el Pages antiguo y el repo antiguo
                      (--old-repo OWNER/REPO, por defecto seacomoseo/<dominio>), con copia previa`

async function main () {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      owner: { type: 'string' },
      project: { type: 'string' },
      repo: { type: 'string' },
      worker: { type: 'string' },
      mails: { type: 'string' },
      members: { type: 'string' },
      retire: { type: 'boolean' },
      'old-repo': { type: 'string' },
      netlify: { type: 'string' },
      'cf-account': { type: 'string' },
      'gitlab-old': { type: 'string' },
      'delete-old': { type: 'boolean' },
      dir: { type: 'string' },
      only: { type: 'string' },
      rotate: { type: 'boolean' },
      apply: { type: 'boolean' },
      production: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' }
    }
  })
  if (values.help) return console.log(HELP)
  const ctx = context(values, positionals)
  const only = values.only ? values.only.split(',').map(s => s.trim()) : null
  const unknown = (only || []).filter(id => !STEPS.some(s => s.id === id))
  if (unknown.length) throw new Error(`pasos desconocidos: ${unknown.join(', ')}`)

  if (!ctx.project) console.log('\n! Sin params.project: pasa --project "Nombre del Vault" (se guarda en hugo.yml) para nombrar la cuenta de Cloudflare y los archivos de Drive.')
  console.log(`\nSanSoul new · ${ctx.project ? `${ctx.project} · ` : ''}${ctx.domain} · ${ctx.owner}/${ctx.repo} · Worker ${ctx.worker} · ${ctx.apply ? 'EJECUCIÓN' : 'PLAN (sin cambios; --apply para ejecutar)'}${ctx.production ? ' · PRODUCCIÓN' : ''}`)
  if (ctx.mails.length && (!only || only.some(id => MAIL_STEPS.includes(id)))) {
    console.log(`Destinatarios (hoja de accesos y lectura en GA4): ${ctx.mails.join(', ')} · ${ctx.mailsSource === 'flag' ? 'de --mails' : 'de params.drive_mails en hugo.yml: compruébalos; --apply pedirá confirmación o --mails'}`)
  }
  for (const step of STEPS) {
    if ((only && !only.includes(step.id)) || step.skip?.(ctx)) continue
    console.log(`\n▸ ${step.title}`)
    try {
      await step.run(ctx)
    } catch (error) {
      ctx.failed.push(step.id)
      console.log(`  ✗ ${error.message}`)
      if (step.id === 'repo') break
    }
  }
  if (ctx.manuals.length) {
    console.log('\nSolo Loren:')
    for (const item of ctx.manuals) console.log(`  [ ] ${item}`)
  }
  console.log(`\n${ctx.failed.length ? `Fallaron: ${ctx.failed.join(', ')}. ` : ''}${ctx.todos ? `${ctx.todos} acción(es) ${ctx.apply ? 'pendientes' : 'por ejecutar con --apply'}.` : ctx.failed.length ? '' : ctx.manuals.length ? 'Nada automático pendiente.' : 'Todo al día.'} Repetir es seguro.`)
  if (ctx.failed.length) process.exitCode = 1
}

export function context (values, positionals) {
  const consumer = fs.existsSync('hugo.yml') && (fs.existsSync('core/do') || fs.existsSync('themes/sansoul/do'))
  let base
  if (positionals[0]) {
    if (!values.owner) throw new Error('falta --owner <org de GitHub>')
    const domain = positionals[0].toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!values.project) throw new Error('falta --project "Nombre del proyecto en el Vault"')
    base = { domain, owner: values.owner, repo: values.repo || 'site', dir: path.resolve(values.dir || path.join(os.homedir(), 'repos', domain)), worker: values.worker }
  } else if (consumer) {
    let project
    try { project = readProject() } catch (error) { throw new Error(identityHint(error, process.cwd())) }
    const params = parse(fs.readFileSync('hugo.yml', 'utf8'))?.params || {}
    base = { domain: project.domain, owner: project.owner, repo: project.repo, dir: process.cwd(), worker: project.worker, netlify: project.netlify, mails: params.drive_mails, project: params.project }
  } else {
    throw new Error(`indica el dominio (o ejecútalo desde la raíz de un proyecto)\n\n${HELP}`)
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(base.domain)) throw new Error(`dominio no válido: ${base.domain}`)
  const name = projectName(base.owner, base.repo).toLowerCase()
  const mails = String(values.mails ?? base.mails ?? '').split(',').map(m => m.trim()).filter(Boolean)
  const lines = (prefix, list) => item => { list.push(item); console.log(`  ${prefix} ${item}`) }
  const ctx = {
    ...base,
    name,
    project: String(values.project ?? base.project ?? '').trim(),
    worker: (values.worker || base.worker || base.repo).toLowerCase(),
    netlify: values.netlify ?? base.netlify ?? '',
    mails,
    // --mails is an explicit confirmation; recipients read from hugo.yml may be
    // stale (a former partner) and need confirming before anything is shared.
    mailsSource: values.mails !== undefined ? 'flag' : mails.length ? 'hugo.yml' : '',
    members: String(values.members ?? '').split(',').map(m => m.trim().replace(/^@/, '')).filter(Boolean),
    retire: Boolean(values.retire),
    oldRepo: values['old-repo'] || '',
    cfAccount: values['cf-account'] || '',
    gitlabOld: values['gitlab-old'] || '',
    deleteOld: Boolean(values['delete-old']),
    rotate: Boolean(values.rotate),
    apply: Boolean(values.apply),
    production: Boolean(values.production),
    created: false,
    changed: [],
    manuals: [],
    failed: [],
    todos: 0
  }
  ctx.done = item => console.log(`  ✓ ${item}`)
  ctx.todo = item => { ctx.todos++; console.log(`  + ${item}`) }
  ctx.warn = item => console.log(`  ! ${item}`)
  ctx.manual = lines('☐', ctx.manuals)
  ctx.confirmMails = () => confirmMails(ctx)
  return ctx
}

export const UPDATE_COMMAND = 'sansoul_update=$(curl -fsSL https://raw.githubusercontent.com/seacomoseo/sansoul/main/scripts/update-project.sh) && sh -c "$sansoul_update"'

// hugo.yml identity errors usually mean a project still on an engine before
// 14.0.0 (no flat params.owner/params.repo): say how to update it first.
export function identityHint (error, dir) {
  let version = ''
  try { version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || '' } catch {}
  const major = Number(String(version).split('.')[0])
  const legacy = fs.existsSync(path.join(dir, 'themes', 'sansoul', 'do')) || (Number.isFinite(major) && major > 0 && major < 14)
  if (!legacy) return `${error.message}\nCorrige params.owner y params.repo en hugo.yml (org y repositorio de GitHub de destino) y repite sh do new.`
  return [
    error.message,
    `Este proyecto está en SanSoul ${version || 'anterior a 14'}: sh do new necesita el motor 14 o posterior. Orden:`,
    '  1. Con el árbol limpio y el servidor local parado, actualiza el motor desde la raíz del proyecto:',
    `     ${UPDATE_COMMAND}`,
    '  2. Revisa params.owner y params.repo en hugo.yml (org y repositorio de GitHub de destino) y confirma el cambio.',
    '  3. Repite sh do new.'
  ].join('\n')
}

function hasUpstream (dir) {
  try { git(['rev-parse', '--abbrev-ref', '@{u}'], dir); return true } catch { return false }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error(`error: ${error.message}`); process.exit(1) })
}
