import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
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
  const cacheDir = path.resolve('resources/_gen/sansoul-avif')
  await fs.mkdir(cacheDir, { recursive: true })
  const inputHashes = new Map()
  const conversions = new Map()
  async function processFile (file) {
    const manifestPath = path.join(manifestDir, file)
    const data = await readJson(manifestPath)
    if (!data.path || !data.output || !Number.isInteger(data.quality) || data.quality < 1 || data.quality > 100) {
      throw new TypeError(`${manifestPath} does not contain valid image processing options`)
    }
    const inputPath = path.resolve(publicDir, `.${data.path}`)
    const outputPath = path.resolve(publicDir, `.${data.output}`)
    const insidePublic = target => target.startsWith(path.resolve(publicDir) + path.sep)
    if (!insidePublic(inputPath) || !insidePublic(outputPath)) throw new TypeError('Image manifest path escapes public directory')
    if (!inputHashes.has(inputPath)) inputHashes.set(inputPath, fs.readFile(inputPath).then(bytes => createHash('sha256').update(bytes).digest('hex')))
    const hash = await inputHashes.get(inputPath)
    const key = createHash('sha256').update(JSON.stringify([hash, data.width, data.height, data.quality, sharp.versions])).digest('hex')
    const cached = path.join(cacheDir, `${key}.avif`)
    if (!conversions.has(key)) conversions.set(key, (async () => {
      if (existsSync(cached)) return
      const temporary = `${cached}.${process.pid}.tmp`
      try {
        await sharp(inputPath).resize(data.width, data.height, { withoutEnlargement: true }).avif({ quality: data.quality, effort: 0 }).toFile(temporary)
        await fs.rename(temporary, cached)
      } finally { await fs.rm(temporary, { force: true }) }
    })())
    await conversions.get(key)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.copyFile(cached, outputPath)
    console.log(`✅ AVIF: ${inputPath} ⏩️ ${outputPath}`)
  }
  // Bound memory use; manifests already deduplicate identical published variants.
  const pending = files[Symbol.iterator]()
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
    for (const file of pending) await processFile(file)
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
