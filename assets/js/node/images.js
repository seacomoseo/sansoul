import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import ico from 'sharp-ico'

function removeFile (filePath) {
  fs.unlink(filePath, err => {
    if (err) {
      console.error(`❌ Error when deleting ${filePath}:`, err)
    } else {
      console.log(`🗑️ Deleted ${filePath}`)
    }
  })
}

function removeDir (dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true })
    console.log(`🗑️ Deleted ${dirPath}`)
  } catch (error) {
    console.error(`❌ Error when deleting ${dirPath}:`, error.message)
  }
}

// Rutas de archivos y directorios con JSON
const faviconsJSON = './public/favicons.json'
const ogSVGsJSON = './public/og-svgs.json'
const imageListDir = './public/image_list'

// Leer el archivo JSON y parsear los favicons
if (fs.existsSync(faviconsJSON)) {
  const svgPaths = JSON.parse(fs.readFileSync(faviconsJSON, 'utf8'))
  if (Array.isArray(svgPaths) && svgPaths.length !== 0) {
    // Convertir cada archivo en paralelo
    Promise.all(
      svgPaths.map(async ({ from, ext }) => {
        const inputPath = './public' + from
        const outputPath = `./public/favicon.${ext}`

        try {
          if (ext === 'ico') {
            // Crear una lista de imágenes redimensionadas
            const sizes = [48, 32, 16]
            const images = await Promise.all(
              sizes.map(size =>
                sharp(inputPath)
                  .resize(size, size, { fit: 'contain' })
                  .png({
                    quality: 1,
                    effort: 1
                  })
                  .toBuffer()
              )
            )
            // Convertir las imágenes redimensionadas a un archivo .ico
            await ico.sharpsToIco(
              images.map(buffer => sharp(buffer)),
              outputPath
            )
          } else {
            await sharp(inputPath)
              .resize(192, 192, { fit: 'contain' })
              .png({
                quality: 75,
                effort: 1
              })
              .toFile(outputPath)
          }

          console.log(`✅ Converted FAVICON: ${inputPath} ⏩️ ${outputPath}`)
        } catch (error) {
          console.error(`❌ Error converting ${inputPath}:`, error)
        }
      })
    ).then(() => {
      removeFile(faviconsJSON)

      console.log('🎉 Favicons completed!')
    })
  }
}

// Leer el archivo JSON de imágenes SVG para Open Graph y parsear la lista de rutas
if (fs.existsSync(ogSVGsJSON)) {
  const svgPaths = JSON.parse(fs.readFileSync(ogSVGsJSON, 'utf8'))
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

          console.log(`✅ Converted to PNG: ${svgPath} ⏩️ ${pngPath}`)
        } catch (error) {
          console.error(`❌ Error converting ${svgPath}:`, error)
        }
      })
    ).then(() => {
      removeFile(ogSVGsJSON)

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
    removeDir(imageListDir)

    console.log('🎉 AVIF conversion completed!')
  })
}
