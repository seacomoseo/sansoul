import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import ico from 'sharp-ico'

const publicDir = './public'

async function readJson (filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function getPublishDir () {
  const hugoConfig = './hugo.yml'
  if (!existsSync(hugoConfig)) return publicDir

  const config = await fs.readFile(hugoConfig, 'utf8')
  const baseUrl = config.match(/^baseURL:\s*['"]?(https?:\/\/[^\s'"]+)/m)?.[1]
  if (!baseUrl) return publicDir

  const pathname = new URL(baseUrl).pathname.replace(/\/$/, '')
  return pathname ? publicDir + pathname : publicDir
}

async function removeGeneratedFile (filePath) {
  await fs.rm(filePath, { force: true })
  console.log(`🗑️ Deleted ${filePath}`)
}

async function processFavicons (publishDir) {
  const manifestPath = `${publishDir}/favicons.json`
  if (!existsSync(manifestPath)) return

  const entries = await readJson(manifestPath)
  if (!Array.isArray(entries)) {
    throw new TypeError(`${manifestPath} must contain an array`)
  }

  await Promise.all(entries.map(async ({ from, ext }) => {
    if (!from || !ext) {
      throw new TypeError(`Invalid favicon entry in ${manifestPath}`)
    }

    const inputPath = publicDir + from
    const outputPath = `${publishDir}/favicon.${ext}`

    if (ext === 'ico') {
      const sizes = [48, 32, 16]
      const images = await Promise.all(sizes.map(size =>
        sharp(inputPath)
          .resize(size, size, { fit: 'contain' })
          .png({ quality: 1, effort: 1 })
          .toBuffer()
      ))

      await ico.sharpsToIco(images.map(buffer => sharp(buffer)), outputPath)
    } else {
      await sharp(inputPath)
        .resize(192, 192, { fit: 'contain' })
        .png({ quality: 75, effort: 1 })
        .toFile(outputPath)
    }

    console.log(`✅ Favicon: ${inputPath} ⏩️ ${outputPath}`)
  }))

  console.log('🎉 Favicons completed!')
  await removeGeneratedFile(manifestPath)
}

async function processOpenGraphImages (publishDir) {
  const manifestPath = `${publishDir}/og-svgs.json`
  if (!existsSync(manifestPath)) return

  const svgPaths = await readJson(manifestPath)
  if (!Array.isArray(svgPaths)) {
    throw new TypeError(`${manifestPath} must contain an array`)
  }

  await Promise.all(svgPaths.map(async svgPath => {
    const inputPath = publicDir + svgPath
    const outputPath = inputPath.replace(/\.svg$/, '.png')

    await sharp(inputPath)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png({ quality: 50, effort: 1 })
      .toFile(outputPath)

    console.log(`✅ Open Graph PNG: ${inputPath} ⏩️ ${outputPath}`)
  }))

  console.log('🎉 Open Graph PNGs completed!')
  await removeGeneratedFile(manifestPath)
}

async function processAvifImages (publishDir) {
  const manifestDir = `${publishDir}/img_list`
  if (!existsSync(manifestDir)) return

  const files = await fs.readdir(manifestDir)
  await Promise.all(files.map(async file => {
    const manifestPath = path.join(manifestDir, file)
    const data = await readJson(manifestPath)
    if (!data.path) {
      throw new TypeError(`${manifestPath} does not contain a valid path`)
    }

    const inputPath = publicDir + data.path
    const extension = path.extname(inputPath)
    const baseName = inputPath.slice(0, -extension.length)
    const outputPath = data.width && data.height
      ? `${baseName}-${data.width}x${data.height}.avif`
      : `${baseName}.avif`

    let image = sharp(inputPath)
    if (data.width && data.height) {
      image = image.resize(data.width, data.height)
    }

    await image.avif({ quality: 50, effort: 0 }).toFile(outputPath)
    console.log(`✅ AVIF: ${inputPath} ⏩️ ${outputPath}`)
  }))

  console.log('🎉 AVIF images completed!')
  await fs.rm(manifestDir, { recursive: true, force: true })
  console.log(`🗑️ Deleted ${manifestDir}`)
}

async function main () {
  const publishDir = await getPublishDir()
  await Promise.all([
    processFavicons(publishDir),
    processOpenGraphImages(publishDir),
    processAvifImages(publishDir)
  ])
}

main().catch(error => {
  console.error('❌ Image post-processing failed:', error)
  process.exitCode = 1
})
