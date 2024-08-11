const fs = require('fs')
const yaml = require('yaml')

// Función para obtener una propiedad anidada de un objeto usando una ruta
const getNestedProperty = (obj, path) => {
  return path.split('/').reduce((acc, key) => {
    if (key === '') return acc // Ignora el primer elemento vacío
    return acc ? acc[key] : undefined
  }, obj)
}

// Leer y parsear el archivo YAML con configuraciones ajustadas
const filePath = 'public/admin/config.5a2a5194588b5a08f02ce2f01c4e02af2bd79e7dd99143fa0a39119bafe2cfa6.yml'
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
    const ruta = "/collections/11/files/0/fields/1/fields/13/fields/4"

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
