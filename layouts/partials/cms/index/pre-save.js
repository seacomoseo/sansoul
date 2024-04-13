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

CMS.registerEventListener({
  name: 'preSave',
  handler: ({ data, collection, field }) => {
    const d = data.entry.data
    const dataObj = d
    const notSlugCollections = [
      'sonfig',
      'types',
      'sections',
      'modals'
    ]
    if (!notSlugCollections.includes(collection)) {
      dataObj.slug = slugConverter(d.slug || d.title)
    }
    if (collection === 'blog') {
      dataObj.date = d.date || new Date().toLocaleDateString('sv-SE')
    }
    if (collection === 'events') {
      if (d.date_ini) dataObj.date_ini = new Date(d.date_ini).toISOString().slice(0, 19)
      if (d.date_end) dataObj.date_end = new Date(d.date_end).toISOString().slice(0, 19)
    }
    return dataObj
  }
})
