/*
Purpose: Recipients of the project access (drive_mails): the access sheet share
  (`drive`) and GA4 read access (`ga4`). Mails read from hugo.yml can be stale
  (a former partner), so --apply shares only after a --mails flag or an
  interactive confirmation; a plan only lists them.
*/
import readline from 'node:readline/promises'

export const MAIL_STEPS = ['ga4', 'drive']

// Whether the project mails may receive access now. Plans never share; --mails
// confirms; otherwise an interactive terminal asks once, and a non-interactive
// --apply refuses (the step lists it for Loren with the exact command).
export async function confirmMails (ctx, { interactive = process.stdin.isTTY && process.stdout.isTTY, ask = askYes } = {}) {
  if (!ctx.apply || ctx.mailsSource !== 'hugo.yml') return true
  if (ctx.mailsConfirmed !== undefined) return ctx.mailsConfirmed
  ctx.mailsConfirmed = interactive
    ? await ask(`  ? params.drive_mails de hugo.yml: ${ctx.mails.join(', ')}. ¿Compartir con ellos la hoja de accesos y la lectura en GA4? [s/N] `)
    : false
  return ctx.mailsConfirmed
}

export function unconfirmedMails (ctx, what) {
  ctx.manual(`${what}: sin confirmar params.drive_mails (${ctx.mails.join(', ')}). Corrige hugo.yml si sobra alguno y repite con --mails ${JSON.stringify(ctx.mails.join(','))} --only ${MAIL_STEPS.join(',')} --apply`)
}

async function askYes (question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try { return /^(s|si|sí|y|yes)$/i.test((await rl.question(question)).trim()) } finally { rl.close() }
}
