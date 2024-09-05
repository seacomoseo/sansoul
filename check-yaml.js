const fs = require('fs')
const path = require('path')
const yaml = require('/opt/homebrew/lib/node_modules/yaml')

// Directorio donde se encuentra el archivo YAML
const yamlDir = path.join(__dirname, '../../public/admin')
// Patrón de archivo YAML
const yamlPattern = /^config\..*\.yml$/

// Función para encontrar el archivo CSS que coincida con el patrón
const findYamlFile = (dir, pattern) => {
  const files = fs.readdirSync(dir)
  for (const file of files) {
    if (pattern.test(file)) {
      return path.join(dir, file)
    }
  }
  throw new Error(`No se encontró ningún archivo que coincida con el patrón: ${pattern}`)
}

// Función para obtener una propiedad anidada de un objeto usando una ruta
const getNestedProperty = (obj, path) => {
  return path.split('/').reduce((acc, key) => {
    if (key === '') return acc // Ignora el primer elemento vacío
    return acc ? acc[key] : undefined
  }, obj)
}

// Encontrar el archivo CSS
const filePath = findYamlFile(yamlDir, yamlPattern)

// Leer y parsear el archivo YAML con configuraciones ajustadas
fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error al leer el archivo: ${err}`)
    return
  }

  // Configuraciones ajustadas para el análisis de YAML
  const options = {
    maxAliasCount: -1, // Permite una cantidad ilimitada de alias
    maxAliasLength: Infinity // Permite una longitud ilimitada de alias
  }

  try {
    // Parsear el contenido del archivo YAML con las configuraciones ajustadas
    const parsedData = yaml.parse(data, options)

    // Ruta específica a comprobar
    const ruta = "/collections/2/fields/37/fields"

    // Obtener la propiedad especificada
    const contenido = getNestedProperty(parsedData, ruta)

    // Imprimir el resultado
    if (contenido !== undefined) {
      console.log(`Contenido en la ruta '${ruta}':`, contenido)
    } else {
      console.log(`No se encontró contenido en la ruta '${ruta}'`)
    }
  } catch (parseErr) {
    console.error(`Error al parsear el archivo YAML: ${parseErr.message}`)
  }
})
