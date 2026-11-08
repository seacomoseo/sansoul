import { CommerceError } from './http.js'

// Persistent round-robin keyset cursor. Fetch one lookahead, never a count.
// CAS losers do no business work; equality on wrap revisits singleton backlogs.
export async function rotateCandidates (db, operation, selectSql, whereSql, timeColumn, idColumn, now, args = []) {
  const cursor = await db.prepare(`
    SELECT cursor_created_at, cursor_id, revision FROM commerce_operation_cursors WHERE operation = ?
  `).bind(operation).first()
  if (!cursor) throw new CommerceError('operation_cursor_missing', 503)
  const select = async direction => {
    const operator = direction === 'after' ? '>' : '<='
    const rows = await db.prepare(`
      ${selectSql} ${whereSql}
        AND (${timeColumn}, ${idColumn}) ${operator} (?, ?)
      ORDER BY ${timeColumn} ASC, ${idColumn} ASC LIMIT 2
    `).bind(...args, cursor.cursor_created_at, cursor.cursor_id).all()
    return rows.results || []
  }
  let rows = await select('after')
  if (rows.length < 2) {
    const wrapped = await select('before')
    rows.push(...wrapped.filter(row => !rows.some(existing => existing.cursor_id === row.cursor_id)))
  }
  if (!rows.length) return { rows: [], contended: false, hasMore: false }
  const selected = rows[0]
  const advanced = await db.prepare(`
    UPDATE commerce_operation_cursors SET cursor_created_at = ?, cursor_id = ?, updated_at = ?, revision = revision + 1
    WHERE operation = ? AND cursor_created_at = ? AND cursor_id = ? AND revision = ?
  `).bind(selected.cursor_created_at, selected.cursor_id, now, operation, cursor.cursor_created_at, cursor.cursor_id, cursor.revision).run()
  return { rows: advanced.meta?.changes ? [selected] : [], contended: !advanced.meta?.changes, hasMore: rows.length > 1 }
}
