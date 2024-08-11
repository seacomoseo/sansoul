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

// Patrón de expresión regular para dividir por comas fuera de paréntesis
const splitByCommasOutsideParentheses = (line) => {
  const result = []
  let startIndex = 0
  let parenCount = 0

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '(') {
      parenCount++
    } else if (line[i] === ')') {
      parenCount--
    } else if (line[i] === ',' && parenCount === 0) {
      result.push(line.substring(startIndex, i).trim())
      startIndex = i + 1
    }
  }

  // Añadir el fragmento final
  result.push(line.substring(startIndex).trim())

  return result
}

// Patrón de expresión regular para obtener el último elemento
const elementsWithoutPseu = (line) => {
  const result = []
  let startIndex = 0
  let parenCount = 0

  for (let i = 0; i < line.length; i++) {
    if (/:(not|where|is|has)\(/g.test(line[i])) {
      parenCount++
    } else if (line[i] === ')') {
      parenCount--
    } else if (/[\s>~+]/g.test(line[i]) && parenCount === 0) {
      result.push(line.substring(startIndex, i).trim())
      startIndex = i + 1
    }
  }

  // Añadir el fragmento final
  result.push(line.substring(startIndex).trim())

  return result.at(-1)
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

  const elementsRegex = new RegExp(`\\*|\\[|(^|[ ,>~+(])(:|${tags})|\\.(${classes})|#(${ids})`, 'g')

  // Leer archivo CSS
  fs.readFile(cssFilePath, 'utf8', (err, data) => {
    if (err) throw err

    // Sustituciones iniciales
    let result = data
      .replace(/\n\s*/g, '') // Quitar saltos de línea + posibles espacios
      .replace(/(\()\s/g, '$1') // Quitar espacio que precede a `(`
      .replace(/\s(\))/g, '$1') // Quitar espacio que antecede a `)`
      .replace(/(\})/g, '$1\n') // Añadir salto de línea después de `}`
      .replace(/(@media[^{]*\{)/g, '$1\n') // Añadir salto de línea después de `@media...{`
      .replace(/^((@keyframes|\.?\d|from|to).+)\n/gm, '$1') // Quitar salto de línea que precede a `@keyframes` e hijos
      .replace(/\/\*.*?\*\//g, '') // Quitar comentarios
      // .replace(/^([^@].+\{)/g, '\n$1') // Añadir salto de línea antes de cualquier línea que NO empiece por `@` y que contenga `{`
      // .replace(/^([^@].+)\{/g, '$1\n{') // Añadir salto de línea antes del primer `{` en línea que NO empiece por `@`

    // Procesar línea por línea
    const lines = result.split('\n')
    const processedLines = []

    for (const line of lines) {
      // Omitir líneas que empiecen por @, { y }
      if (/^[@{}]/.test(line)) {
        processedLines.push(line)
      } else {
        // Sustituir * dentro de :not() por ∑
        // line = line.replace(/:not\(([^)]*)\*([^)]*)\)/g, ':not($1∑$2)')

        // Split por comas fuera de paréntesis
        const splitLines = splitByCommasOutsideParentheses(line)

        // Conservar líneas que contengan alguna de las clases, ids, etiquetas HTMLs
        // const filteredLines = splitLines.filter(splitLine => elementsRegex.test(splitLine))

        const filteredLines = []
        let processedSplitLine = false
        for (const splitLine of splitLines) {
          // Comprueba solamente el último elemento del selector
          const lastElement = elementsWithoutPseu(splitLine)
          // const lastElement =
          //   splitLine
          //     .replace(/:(not|where|is|has)\(.+?\)/g, '')
          //     .replace(/:(not|where|is|has)\(.+?\)/g, '')
          //     .replace(/:(not|where|is|has)\(.+?\)/g, '')
          //     .replace(/:(not|where|is|has)\(.+?\)/g, '')
          //     .replace(/.+[\s>~+](.+)/g, '$1')
          // Conservar líneas que contengan alguna de las clases, ids, etiquetas HTMLs
          if (elementsRegex.test(lastElement)) {
            // processedSplitLine = true
            filteredLines.push(splitLine)
          }
        }
        // if (processedSplitLine) {
        //   filteredLines.push(line)
        // }

        if (filteredLines.length > 0) {
          // processedLines.push(filteredLines.join(','))
          filteredLines.forEach(l => { processedLines.push(l + ',') })
        }
      }
    }

    // Unir las líneas procesadas
    // result = processedLines.join('\n')
      // .replace(/\}\n\{.+\}/g, '}')
      // .replace(/,*\n\{/g, '{')
      // .replace(/^@media.+\{\n\}/g, '')
      // .replace(/(@|\{|\}).*/g, '')

    // Guardar resultado
    fs.writeFile('processed_styles.css', result, 'utf8', (err) => {
      if (err) throw err
      console.log('Archivo procesado guardado como processed_styles.css')
    })
  })
})
