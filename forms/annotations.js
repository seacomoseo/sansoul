import { FormsError } from './http.js'

export const LABEL_ID = /^[a-f0-9-]{36}$/

export const labels = async db => (await db.prepare('SELECT id, name, color FROM forms_labels ORDER BY name COLLATE NOCASE, id').all()).results

// Stable keys give each submission one group, even with several labels.
export const LABELS_SQL = `(SELECT json_group_array(label_id) FROM (
  SELECT label_id FROM forms_submission_labels WHERE submission_id = s.id ORDER BY label_id
))`

export async function readAnnotation (db, id) {
  const row = await db.prepare(`SELECT (SELECT note FROM forms_annotations WHERE submission_id = s.id) AS note,
    ${LABELS_SQL} AS labels FROM forms_submissions s WHERE s.id = ?`).bind(id).first()
  const selected = JSON.parse(row?.labels || '[]')
  return { note: row?.note || '', label: selected[0] || null, labels: selected }
}

export async function saveAnnotation (db, submissionId, body) {
  const note = body?.note
  const selected = body?.labels === undefined ? (body?.label == null ? [] : [body.label]) : body.labels
  if (typeof note !== 'string' || note.length > 4000 || note.includes('\0')) throw new FormsError('invalid_note')
  if (!Array.isArray(selected) || selected.length > 100 || selected.some(id => typeof id !== 'string' || !LABEL_ID.test(id))) throw new FormsError('invalid_label')
  const ids = JSON.stringify([...new Set(selected)].sort())
  const valid = 'NOT EXISTS (SELECT 1 FROM json_each(?2) WHERE value NOT IN (SELECT id FROM forms_labels))'
  const [result] = await db.batch([
    db.prepare(`INSERT INTO forms_annotations (submission_id, note, label_id)
      SELECT ?1, ?3, json_extract(?2, '$[0]') WHERE EXISTS (SELECT 1 FROM forms_submissions WHERE id = ?1)
        AND ${valid}
      ON CONFLICT (submission_id) DO UPDATE SET note = excluded.note, label_id = excluded.label_id`).bind(submissionId, ids, note.trim()),
    db.prepare(`DELETE FROM forms_submission_labels WHERE submission_id = ?1 AND ${valid}`).bind(submissionId, ids),
    db.prepare(`INSERT INTO forms_submission_labels (submission_id, label_id)
      SELECT ?1, value FROM json_each(?2) WHERE EXISTS (SELECT 1 FROM forms_submissions WHERE id = ?1) AND ${valid}`).bind(submissionId, ids)
  ])
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
