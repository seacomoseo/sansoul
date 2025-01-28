import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

// Ruta del archivo JSON con la lista de SVGs
const jsonFilePath = './public/og-svgs.json'
const imageListDir = './public/image_list'

// Leer el archivo JSON y parsear la lista de rutas de SVG
if (fs.existsSync(jsonFilePath)) {
  const svgPaths = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'))
  if (Array.isArray(svgPaths) && svgPaths.length !== 0) {
    // Convertir cada archivo SVG a PNG en paralelo
    Promise.all(
      svgPaths.map(async (svgPath) => {
        const pngPath = svgPath.replace(/\.svg$/, '.png')

        try {
          await sharp(svgPath)
            // .resize({ width: 1200 })
            .flatten({ background: { r: 255, g: 255, b: 255 } }) // Establece el fondo blanco
            .png({
              quality: 50,
              effort: 1
            })
            .toFile(pngPath)

          console.log(`✅ Converted to PNG: ${svgPath}`)
        } catch (error) {
          console.error(`❌ Error converting ${svgPath}:`, error)
        }
      })
    ).then(() => {
      // Eliminar el archivo JSON después de completar la conversión
      fs.unlink(jsonFilePath, (err) => {
        if (err) {
          console.error(`❌ Error when deleting ${jsonFilePath}:`, err)
        } else {
          console.log(`🗑️ Deleted ${jsonFilePath}`)
        }
      })

      console.log('🎉 PNG conversion completed!')
    })
  }
}

// Procesar los archivos JSON dentro de ./public/image_list
if (fs.existsSync(imageListDir)) {
  const jsonFiles = fs.readdirSync(imageListDir)

  Promise.all(
    jsonFiles.map(async (file) => {
      const filePath = path.join(imageListDir, file)
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))

      if (!data.path) {
        console.error(`❌ The file ${file} does not contain a valid path`)
        return
      }

      const ext = path.extname(data.path)
      const baseName = data.path.replace(ext, '')
      const avifPath = data.width && data.height
        ? `${baseName}-${data.width}x${data.height}.avif`
        : `${baseName}.avif`

      try {
        let image = sharp(data.path)
        if (data.width && data.height) {
          image = image.resize(data.width, data.height)
        }

        await image
          .avif({
            quality: 50,
            effort: 0
          })
          .toFile(avifPath)

        console.log(`✅ Converted to AVIF: ${data.path} ⏩️ ${avifPath}`)
      } catch (error) {
        console.error(`❌ Error while converting ${data.path}:`, error)
      }
    })
  ).then(() => {
    // Eliminar el directorio image_list después de completar la conversión
    try {
      fs.rmSync(imageListDir, { recursive: true, force: true })
      console.log(`🗑️ Deleted ${imageListDir}`)
    } catch (error) {
      console.error(`❌ Error when deleting ${imageListDir}:`, error.message)
    }

    console.log('🎉 AVIF conversion completed!')
  })
}
