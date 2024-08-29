export function initPreSave () {
  const slugConverter = text => {
    return text.toString().toLowerCase()
      .replace(/[áàä]/, 'a')
      .replace(/[éèë]/, 'e')
      .replace(/[íìï]/, 'i')
      .replace(/[óòö]/, 'o')
      .replace(/[úùü]/, 'u')
      .replace(/[ñ]/, 'n')
      .replace(/[ç]/, 'c')
      .replace(/[^\w-]+/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '')
  }

  // eslint-disable-next-line
  CMS.registerEventListener({
    name: 'preSave',
    handler: ({ data, collection, field }) => {
      const d = data.entry.data
      const dataObj = d
      const articles = [
        'blog',
        'event',
        'product',
        'category',
        'author',
        'page'
      ]
      if (articles.includes(collection)) {
        dataObj.slug = slugConverter(d.slug || d.title)
      }
      if (collection === 'blog') {
        dataObj.date = d.date || new Date().toLocaleDateString('sv-SE')
      }
      if (collection === 'event') {
        if (d.date) dataObj.date = new Date(d.date).toISOString().slice(0, 19)
        if (d.end) dataObj.end = new Date(d.end).toISOString().slice(0, 19)
      }
      return dataObj
    }
  })
}
