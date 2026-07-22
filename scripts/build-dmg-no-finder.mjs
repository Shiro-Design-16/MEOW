import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const tauriConfig = JSON.parse(
  readFileSync(path.join(projectRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'),
)
const productName = tauriConfig.productName
const version = tauriConfig.version
const packageOnly = process.argv.includes('--package-only')

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`)
  }
}

if (process.platform !== 'darwin') {
  throw new Error('Finder-free DMG packaging is only available on macOS')
}

if (!packageOnly) {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  run(pnpm, ['tauri', 'build', '--bundles', 'app'])
}

const appPath = path.join(
  projectRoot,
  'target',
  'release',
  'bundle',
  'macos',
  `${productName}.app`,
)
if (!existsSync(appPath)) {
  throw new Error(`Built app bundle is missing: ${appPath}`)
}

const architecture = process.arch === 'arm64' ? 'aarch64' : process.arch
const outputDir = path.join(projectRoot, 'target', 'release', 'bundle', 'dmg')
const outputPath = path.join(
  outputDir,
  `${productName}_${version}_${architecture}.dmg`,
)
const stagingDir = mkdtempSync(
  path.join(os.tmpdir(), `${productName.toLowerCase()}-dmg-`),
)

try {
  mkdirSync(outputDir, { recursive: true })
  run('/usr/bin/ditto', [appPath, path.join(stagingDir, `${productName}.app`)])
  symlinkSync('/Applications', path.join(stagingDir, 'Applications'))
  run('/usr/bin/hdiutil', [
    'create',
    '-volname',
    productName,
    '-srcfolder',
    stagingDir,
    '-fs',
    'HFS+',
    '-format',
    'UDZO',
    '-imagekey',
    'zlib-level=9',
    '-ov',
    outputPath,
  ])
} finally {
  rmSync(stagingDir, { recursive: true, force: true })
}

console.log(`Finder-free DMG created at ${outputPath}`)
