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
    console.error(`❌ Error when deleting ${dirPath}: `, error.message)
  }
}

// Leer el archivo hugo.yml y obtener el publishDir
let publishDir = './public'
const hugoYAML = './hugo.yml'
if (fs.existsSync(hugoYAML)) {
  const hugo = fs.readFileSync(hugoYAML, 'utf8')
  const subDirMatch = hugo.match(/^baseURL: '?https?:\/\/.+?(\/.+)\b/)
  if (subDirMatch) publishDir += subDirMatch[1]
}

// Rutas de archivos y directorios con JSON
const faviconsJSON = `${publishDir}/favicons.json`
const ogSVGsJSON = `${publishDir}/og-svgs.json`
const imageListDir = `${publishDir}/image_list`

// Leer el archivo JSON y parsear los favicons
if (fs.existsSync(faviconsJSON)) {
  const svgPaths = JSON.parse(fs.readFileSync(faviconsJSON, 'utf8'))
  if (Array.isArray(svgPaths) && svgPaths.length !== 0) {
    // Convertir cada archivo en paralelo
    Promise.all(
      svgPaths.map(async ({ from, ext }) => {
        const inputPath = './public' + from
        const outputPath = `${publishDir}/favicon.${ext}`

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

          console.log(`✅ ICO: ${inputPath} ⏩️ ${outputPath}`)
        } catch (error) {
          console.error(`❌ Error: ${inputPath}: `, error)
        }
      })
    ).then(() => {
      console.log('🎉 Favicons completed!')
      removeFile(faviconsJSON)
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
        const initPath = './public' + svgPath
        const pngPath = initPath.replace(/\.svg$/, '.png')

        try {
          await sharp(initPath)
            // .resize({ width: 1200 })
            .flatten({ background: { r: 255, g: 255, b: 255 } }) // Establece el fondo blanco
            .png({
              quality: 50,
              effort: 1
            })
            .toFile(pngPath)

          console.log(`✅ PNG: ${initPath} ⏩️ ${pngPath}`)
        } catch (error) {
          console.error(`❌ Error: ${initPath}: `, error)
        }
      })
    ).then(() => {
      console.log('🎉 PNG completed!')
      removeFile(ogSVGsJSON)
    })
  }
}

// Procesar los archivos JSON dentro de ${publishDir}/image_list
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

      const initPath = './public' + data.path
      const ext = path.extname(initPath)
      const baseName = initPath.replace(ext, '')
      const avifPath = data.width && data.height
        ? `${baseName}-${data.width}x${data.height}.avif`
        : `${baseName}.avif`

      try {
        let image = sharp(initPath)
        if (data.width && data.height) {
          image = image.resize(data.width, data.height)
        }

        await image
          .avif({
            quality: 50,
            effort: 0
          })
          .toFile(avifPath)

        console.log(`✅ AVIF: ${initPath} ⏩️ ${avifPath}`)
      } catch (error) {
        console.error(`❌ Error: ${initPath}: `, error)
      }
    })
  ).then(() => {
    console.log('🎉 AVIF completed!')
    removeDir(imageListDir)
  })
}
