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

test('el pie enlaza al formulario con página, ancla e id, en HTML y texto', () => {
  const { html, text } = renderOwner({
    submission: { fields: [['Mensaje', 'hola']], files: [], page: '/contacto/', form_key: '/contacto/#form-contacto', id: 'abc-123' },
    authority: { subject: 's', site: 'example.com', pageTitle: 'Contacto & ayuda' }
  })
  assert.match(html, /<a href="https:\/\/example\.com\/contacto\/#form-contacto"[^>]*>Contacto &amp; ayuda · #form-contacto<\/a>/)
  assert.match(html, /abc-123/)
  assert.match(text, /--\nContacto & ayuda · #form-contacto\nhttps:\/\/example\.com\/contacto\/#form-contacto\nabc-123\n$/)
})

test('un aviso en cola sin título usa la ruta de la página', () => {
  const { text } = renderOwner({
    submission: { fields: [], files: [], page: '/es/', form_key: '/es/#form-footer', id: 'x' },
    authority: { subject: 's', site: 'example.com' }
  })
  assert.match(text, /\n\/es\/ · #form-footer\nhttps:\/\/example\.com\/es\/#form-footer\nx\n$/)
})
