import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDirectory = path.join(projectDirectory, 'public')

const iconSvg = (maskable = false) => {
  const tileSize = maskable ? 108 : 124
  const gap = maskable ? 12 : 14
  const markSize = tileSize * 2 + gap
  const offset = (512 - markSize) / 2
  const radius = maskable ? 0 : 88

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <rect width="512" height="512" rx="${radius}" fill="#ffffff"/>
      <rect x="${offset}" y="${offset}" width="${tileSize}" height="${tileSize}" fill="#f25022"/>
      <rect x="${offset + tileSize + gap}" y="${offset}" width="${tileSize}" height="${tileSize}" fill="#7fba00"/>
      <rect x="${offset}" y="${offset + tileSize + gap}" width="${tileSize}" height="${tileSize}" fill="#00a4ef"/>
      <rect x="${offset + tileSize + gap}" y="${offset + tileSize + gap}" width="${tileSize}" height="${tileSize}" fill="#ffb900"/>
    </svg>
  `
}

const outputs = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'pwa-maskable-512x512.png', size: 512, maskable: true },
]

await mkdir(publicDirectory, { recursive: true })
await Promise.all(outputs.map(({ name, size, maskable }) =>
  sharp(Buffer.from(iconSvg(maskable)))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDirectory, name)),
))