import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(__dirname, '..')

await rm(path.join(packageDir, 'dist'), { recursive: true, force: true })
await rm(path.join(packageDir, 'tsconfig.tsbuildinfo'), { force: true })
