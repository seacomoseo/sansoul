import test from 'node:test'
import assert from 'node:assert/strict'
import { renderOwner } from '../render.js'

test('el aviso HTML conserva los saltos de línea con <br> (Gmail ignora white-space)', () => {
  const { html, text } = renderOwner({
    submission: { fields: [['Mensaje', 'uno\ndos <b>']], files: [], page: '/', id: 'x' },
    authority: { subject: 's', site: 'example.com' }
  })
  assert.match(html, /uno<br>dos &lt;b&gt;/)
  assert.match(text, /Mensaje: uno\ndos <b>/)
})
