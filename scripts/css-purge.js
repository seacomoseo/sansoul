const fs = require('fs')
const path = require('path')

// Directorio donde se encuentran los archivos CSS
const cssDir = path.join(__dirname, '../../public/css')
// Patrón de archivo CSS
const cssPattern = /^styles\..*\.css$/
// Archivo JSON con las clases, ids y etiquetas HTML
const jsonFilePath = path.join(__dirname, '../../hugo_stats.json')

// Función para encontrar el archivo CSS que coincida con el patrón
const findCssFile = (dir, pattern) => {
  const files = fs.readdirSync(dir)
  for (const file of files) {
    if (pattern.test(file)) {
      return path.join(dir, file)
    }
  }
  throw new Error(`No se encontró ningún archivo que coincida con el patrón: ${pattern}`)
}

// Función para hacer split en las comas que no estén dentro de paréntesis
const splitPorComas = (texto) => {
  const resultado = []
  let profundidad = 0
  let segmento = ''

  for (let i = 0; i < texto.length; i++) {
    const char = texto[i]

    if (char === '(') {
      profundidad++
    } else if (char === ')') {
      profundidad--
    }

    // Si encontramos una coma y no estamos dentro de paréntesis, hacemos un split
    if (char === ',' && profundidad === 0) {
      resultado.push(segmento.trim())
      segmento = ''
    } else {
      segmento += char
    }
  }

  // Añadir el último segmento si existe
  if (segmento) {
    resultado.push(segmento.trim())
  }

  return resultado
}

// Encontrar el archivo CSS
const cssFilePath = findCssFile(cssDir, cssPattern)

// Leer el archivo JSON
fs.readFile(jsonFilePath, 'utf8', (err, jsonData) => {
  if (err) throw err

  const elements = JSON.parse(jsonData).htmlElements
  const tags = elements.tags.join('|')
  const classes = elements.classes.join('|')
  const ids = elements.ids.join('|')
  const safelist = [
    'active',
    'hidden',
    '\\.sl-',
    '\\.form__submit',
    '\\.form__error',
    '\\.show--will',
    '\\.search__result-item-link',
    '\\.cookies--hide'
  ].join('|')

  const elementsRegex = new RegExp(`(^|\\.|\\])(\\*|\\[.+\\]|:[\\w:-]+|(${tags})|\\.(${classes})|#(${ids}))($|=|:|\\[|\\]|\\.)|${safelist}`)

  // Leer archivo CSS
  fs.readFile(cssFilePath, 'utf8', (err, data) => {
    if (err) throw err

    // Sustituciones iniciales
    let result = data
      .replace(/\n\s*/g, '') // Quitar saltos de línea + posibles espacios
      .replace(/(\()\s/g, '$1') // Quitar espacio que precede a (
      .replace(/\s(\))/g, '$1') // Quitar espacio que antecede a )
      .replace(/(\})/g, '$1\n') // Añadir salto de línea después de }
      .replace(/(@media[^{]*\{)/g, '$1\n') // Añadir salto de línea después de @media...{
      .replace(/^((@keyframes|\.?\d|from|to).+)\n/gm, '$1') // Quitar salto de línea que precede a @keyframes e hijos
      .replace(/\/\*.*?\*\//g, '') // Quitar comentarios
      .replace(/^([^@]+?)\{/gm, '$1\n{') // Añadir salto de línea antes del primer { en línea que NO empiece ni tenga @

    // Procesar línea por línea
    const lines = result.split('\n')
    const processedLines = []

    for (const line of lines) {
      // Omitir líneas que empiecen por @, { y }
      if (/^[@{}]/.test(line)) {
        processedLines.push(line)
      } else {
        // Separar por comas que no estén entre paréntesis
        const selectors = splitPorComas(line)

        // Procesar selector por selector
        const processedSelectors = []
        for (const selector of selectors) {
          // Elimina todo lo que está dentro de los paréntesis más externos
          let selectorCleaned = selector
          while (/\([^()]*\)/.test(selectorCleaned)) {
            selectorCleaned = selectorCleaned.replace(/\([^()]*\)/g, '')
          }

          selectorCleaned = selectorCleaned
            .replace(/^.*[\s>+~]/g, '') // Quita todos los selectores excepto el último

          // Si es un elemento genérico o está entre las clases, ids y etiquetas html
          if (elementsRegex.test(selectorCleaned)) {
            processedSelectors.push(selector)
          }
        }
        processedSelectors.join(',')

        processedLines.push(processedSelectors)
      }
    }

    // Unir las líneas procesadas
    result = processedLines.join('\n')
      .replace(/\n\n\{.+/gm, '') // Eliminar propiedades huérfanas
      .replace(/^@media.+\{\n\}\n/gm, '') // Eliminar mediaqueries huérfanas

    // Nombres de animaciones
    const animations = [...result.matchAll(/animation(-name)?:([\w-]+)/g)].map(animation => animation[2]).join('|')
    // Regex para @keyframes
    const regexAnimations = new RegExp(`^@keyframes\\s(?!${animations})[\\w-]+\\{.+\n`, 'gm')
    // Eliminar @keyframes no usados
    result = result
      .replace(regexAnimations, '')
      .replace(/\n/g, '') // Eliminar saltos de linea

    // Guardar resultado
    fs.writeFile(cssFilePath, result, 'utf8', (err) => {
      if (err) throw err
      console.log('Processed and saved css file')
    })
  })
})
