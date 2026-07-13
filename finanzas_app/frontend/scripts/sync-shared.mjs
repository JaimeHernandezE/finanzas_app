/**
 * Copia finanzas_app/shared → frontend/shared para Railway (root = frontend).
 * En Docker local el volumen monta encima de frontend/shared.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.resolve(frontendRoot, '../shared')
const dest = path.resolve(frontendRoot, 'shared')

function hasPackage(dir) {
  try {
    return fs.existsSync(path.join(dir, 'package.json'))
  } catch {
    return false
  }
}

if (hasPackage(src)) {
  fs.cpSync(src, dest, { recursive: true, force: true })
  console.log('sync-shared: copiado ../shared → frontend/shared')
  process.exit(0)
}

if (hasPackage(dest)) {
  console.log('sync-shared: usando frontend/shared existente')
  process.exit(0)
}

console.error('sync-shared: falta ../shared y frontend/shared')
process.exit(1)
