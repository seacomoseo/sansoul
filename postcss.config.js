const purgecss = require('@fullhuman/postcss-purgecss')({
  content: [
    './hugo_stats.json'
  ],
  safelist: [
    'lazyload',
    'class',
    'type',
    'hidden',
    'hidden-scroll',
    /sl-.+/,
    /data-.+/,
    /active$/,
    /^search__result-/
  ],
  defaultExtractor: (content) => {
    const els = JSON.parse(content).htmlElements
    return els.tags.concat(els.classes, els.ids)
  }
})

module.exports = {
  plugins: [
    ...(process.env.HUGO_ENVIRONMENT === 'production' ? [purgecss] : [])
  ]
}
