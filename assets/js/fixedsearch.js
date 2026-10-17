/* Public search index accepts the grouped SanSoul format and legacy arrays. */
;(function () {
  const form = document.getElementById('search__form')
  const input = document.getElementById('search__input')
  const results = document.getElementById('search__results')
  const status = document.getElementById('search__status')
  if (!form || !input || !results) return
  let indexPromise
  let search
  let revision = 0

  const plainText = value => {
    const text = document.createElement('textarea')
    text.innerHTML = String(value || '').replace(/<[^>]*>/g, ' ')
    return text.value.replace(/\s+/g, ' ').trim()
  }
  const terms = value => {
    if (Array.isArray(value)) return value.map(terms).join(' ')
    if (value && typeof value === 'object') return terms(value.title || value.name || value.label || '')
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  }
  const loadIndex = () => {
    if (!indexPromise) {
      indexPromise = fetch(form.dataset.index).then(response => {
        if (!response.ok) throw new Error(`Search index HTTP ${response.status}`)
        return response.json()
      }).then(data => {
        const pages = Array.isArray(data) ? data : Object.entries(data).flatMap(([type, entries]) => Array.isArray(entries) ? entries.map(item => ({ ...item, type })) : [])
        const records = pages.filter(item => item && typeof item.title === 'string' && typeof item.url === 'string')
          .map(item => ({ ...item, searchText: Object.entries(item).filter(([key]) => !['url', 'img', 'lock'].includes(key)).map(([, value]) => plainText(terms(value))).join(' ') }))
        search = new Fuse(records, { keys: ['title', 'searchText'], threshold: 0.35, ignoreLocation: true })
      }).catch(error => {
        indexPromise = null
        throw error
      })
    }
    return indexPromise
  }
  const render = async () => {
    const current = ++revision
    const query = input.value.trim()
    if (!query) {
      results.replaceChildren()
      if (status) status.textContent = ''
      return
    }
    try {
      await loadIndex()
      if (current !== revision) return
      const matches = search.search(query).slice(0, 20)
      results.replaceChildren()
      for (const { item } of matches) {
        const url = new URL(item.url, location.href)
        if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) continue
        const article = document.createElement('article')
        article.className = 'search__result-item box'
        const heading = document.createElement('h2')
        heading.className = 'box__title h6'
        const link = document.createElement(item.lock ? 'b' : 'a')
        link.className = 'link'
        if (item.lock) {
          link.dataset.h = btoa(url.pathname + url.search + url.hash)
          link.tabIndex = 0
          link.setAttribute('role', 'link')
        } else link.href = url.href
        link.textContent = item.title
        heading.append(link)
        article.append(heading)
        if (item.sum) {
          const summary = document.createElement('p')
          summary.textContent = plainText(item.sum)
          article.append(summary)
        }
        results.append(article)
      }
      if (status) status.textContent = results.children.length ? String(results.children.length) : form.dataset.empty
    } catch (error) {
      if (current !== revision) return
      results.replaceChildren()
      if (status) status.textContent = form.dataset.error
      console.error('Search unavailable:', error)
    }
  }
  form.classList.remove('noscript')
  form.addEventListener('submit', event => { event.preventDefault(); render() })
  input.addEventListener('input', render)
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && (event.key === '/' || event.code === 'Slash')) {
      event.preventDefault()
      input.focus()
    }
  })
  form.addEventListener('keydown', event => {
    const links = [...results.querySelectorAll('a, [role="link"]')]
    const position = links.indexOf(document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      input.value = ''
      render()
      input.focus()
    } else if (event.key === 'ArrowDown' && links.length) {
      event.preventDefault()
      links[(position + 1) % links.length].focus()
    } else if (event.key === 'ArrowUp' && links.length) {
      event.preventDefault()
      if (position <= 0) input.focus()
      else links[position - 1].focus()
    }
  })
})()
