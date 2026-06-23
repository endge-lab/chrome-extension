import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(__dirname, '..')
const staticDir = path.join(packageDir, 'static')
const distDir = path.join(packageDir, 'dist')

await mkdir(distDir, { recursive: true })
await cp(staticDir, distDir, { recursive: true })

const contentPath = path.join(distDir, 'content.js')
const contentSource = await readFile(contentPath, 'utf8')
const sanitizedContentSource = contentSource.replace(/\nexport \{\};\n/, '\n')

if (sanitizedContentSource !== contentSource) {
  await writeFile(contentPath, sanitizedContentSource, 'utf8')
}
