import purgecssLib from '@fullhuman/postcss-purgecss'

const purgecss = purgecssLib({
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
    /^search__result-/,
    'ritz'
  ],
  defaultExtractor: (content) => {
    const els = JSON.parse(content).htmlElements
    return els.tags.concat(els.classes, els.ids)
  }
})

export default {
  plugins: [
    ...(process.env.HUGO_ENVIRONMENT === 'production' ? [purgecss] : [])
  ]
}