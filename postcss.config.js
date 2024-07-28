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

const autoprefixer = require('autoprefixer')({})

const cssnano = require('cssnano')({
  preset: ['default', {
    svgo: false
  }]
})

module.exports = {
  plugins: [
    ...(process.env.HUGO_ENVIRONMENT === 'production' ? [purgecss, autoprefixer, cssnano] : [])
  ]
}
