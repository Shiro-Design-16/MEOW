import { spawn, spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const shouldOpen = !process.argv.includes('--no-open')

const targets = {
  darwin: {
    arm64: {
      triple: 'aarch64-apple-darwin',
      bundle: 'dmg',
      extension: '.dmg',
    },
    x64: {
      triple: 'x86_64-apple-darwin',
      bundle: 'dmg',
      extension: '.dmg',
    },
  },
  win32: {
    arm64: {
      triple: 'aarch64-pc-windows-msvc',
      bundle: 'nsis',
      extension: '.exe',
    },
    x64: {
      triple: 'x86_64-pc-windows-msvc',
      bundle: 'nsis',
      extension: '.exe',
    },
  },
}

const target = targets[process.platform]?.[process.arch]
if (!target) {
  throw new Error(
    `Unsupported build host: ${process.platform}/${process.arch}. ` +
      'MEOW currently provides local installer builds for macOS and Windows on ARM64 or x86_64.',
  )
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=4096',
    },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`)
  }
}

const newestInstaller = (directory, extension) => {
  const files = readdirSync(directory)
    .map((name) => path.join(directory, name))
    .filter((file) => statSync(file).isFile() && file.endsWith(extension))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)

  if (files.length === 0) {
    throw new Error(`No ${extension} installer was produced in ${directory}`)
  }
  return files[0]
}

console.log(`Preparing MEOW dependencies for ${target.triple}...`)
run(pnpm, ['run', 'prebuild', target.triple])

console.log(`Building the MEOW ${target.bundle.toUpperCase()} installer...`)
run(pnpm, [
  'tauri',
  'build',
  '--target',
  target.triple,
  '--bundles',
  target.bundle,
])

const installerDir = path.join(
  projectRoot,
  'target',
  target.triple,
  'release',
  'bundle',
  target.bundle,
)
const installer = newestInstaller(installerDir, target.extension)

console.log(`MEOW installer created: ${installer}`)
console.warn(
  'This locally built installer is unsigned. Only run installers built from source you trust.',
)

if (!shouldOpen) {
  console.log('Automatic opening was disabled with --no-open.')
  process.exit(0)
}

if (process.platform === 'darwin') {
  run('/usr/bin/open', [installer])
} else {
  const child = spawn(installer, [], {
    cwd: path.dirname(installer),
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
  child.unref()
}

console.log(
  process.platform === 'darwin'
    ? 'The DMG is open. Drag MEOW to Applications if you choose to install it.'
    : 'The Windows installer is open. Continue or cancel from the setup wizard.',
)
