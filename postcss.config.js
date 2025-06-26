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
<<<<<<< HEAD
})

const autoprefixer = require('autoprefixer')({})

const cssnano = require('cssnano')({
  preset: ['default', {
    svgo: false
  }]
=======
>>>>>>> 3c1c646474044268b088da6ce391479f7976107c
})

export default {
  plugins: [
<<<<<<< HEAD
    ...(process.env.HUGO_ENVIRONMENT === 'production' ? [purgecss, autoprefixer, cssnano] : [])
  ]
}
=======
    ...(process.env.HUGO_ENVIRONMENT === 'production' ? [purgecss] : [])
  ]
}
>>>>>>> 3c1c646474044268b088da6ce391479f7976107c
