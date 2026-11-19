import { FormsError } from './http.js'

export const LABEL_ID = /^[a-f0-9-]{36}$/

export const labels = async db => (await db.prepare('SELECT id, name, color FROM forms_labels ORDER BY name COLLATE NOCASE, id').all()).results

export async function readAnnotation (db, id) {
  const row = await db.prepare('SELECT note, label_id FROM forms_annotations WHERE submission_id = ?').bind(id).first()
  return { note: row?.note || '', label: row?.label_id || null }
}

export async function saveAnnotation (db, submissionId, body) {
  const note = body?.note
  const label = body?.label ?? null
  if (typeof note !== 'string' || note.length > 4000 || note.includes('\0')) throw new FormsError('invalid_note')
  if (label !== null && (typeof label !== 'string' || !LABEL_ID.test(label))) throw new FormsError('invalid_label')
  const result = await db.prepare(
    `INSERT INTO forms_annotations (submission_id, note, label_id)
     SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM forms_submissions WHERE id = ?1)
       AND (?3 IS NULL OR EXISTS (SELECT 1 FROM forms_labels WHERE id = ?3))
     ON CONFLICT (submission_id) DO UPDATE SET note = excluded.note, label_id = excluded.label_id`
  ).bind(submissionId, note.trim(), label).run()
  if (!result.meta.changes) {
    const exists = await db.prepare('SELECT id FROM forms_submissions WHERE id = ?').bind(submissionId).first()
    if (!exists) throw new FormsError('not_found', 404)
    throw new FormsError('invalid_label')
  }
}

export async function saveLabel (db, body) {
  const id = body?.id ?? null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const color = body?.color
  if ((id !== null && (typeof id !== 'string' || !LABEL_ID.test(id))) || !name || name.length > 80 || /[\r\n\0]/.test(name) ||
      typeof color !== 'string' || !/^#[a-f0-9]{6}$/i.test(color)) throw new FormsError('invalid_label')
  if (id) {
    const updated = await db.prepare('UPDATE forms_labels SET name = ?, color = ? WHERE id = ?').bind(name, color, id).run()
    if (!updated.meta.changes) throw new FormsError('not_found', 404)
    return id
  }
  const freshId = crypto.randomUUID()
  const inserted = await db.prepare(
    'INSERT INTO forms_labels (id, name, color) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM forms_labels) < 100'
  ).bind(freshId, name, color).run()
  if (!inserted.meta.changes) throw new FormsError('label_limit', 409)
  return freshId
}
