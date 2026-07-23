import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Resvg } from '@resvg/resvg-js'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const resourcesDir = path.join(projectRoot, 'resources')
const generatedDir = path.join(projectRoot, '.generated')
const themePath = path.join(resourcesDir, 'theme.json')
const theme = JSON.parse(readFileSync(themePath, 'utf8'))
const macIconBundle = path.join(
  resourcesDir,
  'application',
  'app-icon-mac.icon',
)

const renderSvg = (source, target, width) => {
  mkdirSync(path.dirname(target), { recursive: true })
  const svg = readFileSync(source, 'utf8')
  const renderer = new Resvg(svg, { fitTo: { mode: 'width', value: width } })
  writeFileSync(target, renderer.render().asPng())
}

const setMacRetinaDpi = (target) => {
  if (process.platform !== 'darwin') return

  const result = spawnSync(
    'sips',
    [
      '--setProperty',
      'dpiWidth',
      '144',
      '--setProperty',
      'dpiHeight',
      '144',
      target,
    ],
    { encoding: 'utf8', stdio: 'pipe' },
  )
  if (result.status !== 0) {
    throw new Error(
      result.stderr ||
        result.stdout ||
        'Failed to set Retina DMG background DPI',
    )
  }
}

const walkFiles = (directory) =>
  readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name)
    return statSync(file).isDirectory() ? walkFiles(file) : [file]
  })

const resolveThemeAsset = (relativePath) => {
  const resolved = path.resolve(resourcesDir, relativePath)
  if (
    !resolved.startsWith(`${resourcesDir}${path.sep}`) ||
    !existsSync(resolved)
  ) {
    throw new Error(
      `Theme asset is missing or outside resources/: ${relativePath}`,
    )
  }
  return resolved
}

const collectStrings = (value) => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectStrings)
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings)
  }
  return []
}

const pngDimensions = (file) => {
  const png = readFileSync(file)
  const signature = '89504e470d0a1a0a'
  if (png.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(
      `Preview is not a PNG file: ${path.relative(projectRoot, file)}`,
    )
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

const ensureDefaultPreview = () => {
  const previewNames =
    theme.supportedModes?.includes('light') &&
    theme.supportedModes?.includes('dark')
      ? ['pre-light.png', 'pre-dark.png']
      : ['pre.png']

  const previewSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#eef5ff"/>
          <stop offset="1" stop-color="#dce7f8"/>
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      <rect x="140" y="82" width="1000" height="556" rx="24" fill="#fff" stroke="#c7d4e8" stroke-width="2"/>
      <rect x="140" y="82" width="230" height="556" rx="24" fill="#f5f7fb"/>
      <rect x="370" y="82" width="770" height="70" fill="#fff"/>
      <circle cx="205" cy="135" r="22" fill="#111"/>
      <text x="242" y="145" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="28" font-weight="700">MEOW</text>
      <g fill="#d7e1f1">
        <rect x="185" y="205" width="140" height="28" rx="14"/>
        <rect x="185" y="255" width="140" height="28" rx="14"/>
        <rect x="185" y="305" width="140" height="28" rx="14"/>
        <rect x="185" y="355" width="140" height="28" rx="14"/>
      </g>
      <text x="420" y="128" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="25" font-weight="650">MEOW Default</text>
      <rect x="420" y="190" width="670" height="160" rx="18" fill="#f4f8ff"/>
      <rect x="420" y="382" width="315" height="205" rx="18" fill="#f4f8ff"/>
      <rect x="775" y="382" width="315" height="205" rx="18" fill="#f4f8ff"/>
      <text x="640" y="326" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="18" fill="#667085">Replace this placeholder with your 16:9 theme preview</text>
    </svg>`
  for (const previewName of previewNames) {
    const target = path.join(resourcesDir, 'previews', previewName)
    if (existsSync(target)) continue
    mkdirSync(path.dirname(target), { recursive: true })
    const renderer = new Resvg(previewSvg, {
      fitTo: { mode: 'width', value: 1280 },
    })
    writeFileSync(target, renderer.render().asPng())
  }
}

const validateTheme = () => {
  if (theme.schemaVersion !== 1)
    throw new Error('Unsupported theme schemaVersion')
  if (
    !Array.isArray(theme.supportedModes) ||
    theme.supportedModes.length === 0
  ) {
    throw new Error('A theme must support at least one color mode')
  }

  for (const mode of theme.supportedModes) {
    if (!['light', 'dark'].includes(mode) || !theme.modes?.[mode]) {
      throw new Error(`Theme mode is invalid or missing tokens: ${mode}`)
    }
  }

  collectStrings(theme.assets).forEach(resolveThemeAsset)
  resolveThemeAsset(theme.preview.icon)

  const previews = theme.preview.images
  const constraints = theme.preview.constraints
  if (!previews || typeof previews !== 'object' || Array.isArray(previews)) {
    throw new Error(
      'Theme preview images must be an object keyed by light/dark or default',
    )
  }

  const supportsBothModes =
    theme.supportedModes.includes('light') &&
    theme.supportedModes.includes('dark')
  const expectedPreviews = supportsBothModes
    ? {
        light: 'previews/pre-light.png',
        dark: 'previews/pre-dark.png',
      }
    : { default: 'previews/pre.png' }
  if (JSON.stringify(previews) !== JSON.stringify(expectedPreviews)) {
    throw new Error(
      supportsBothModes
        ? 'Themes with light and dark modes must use pre-light.png and pre-dark.png'
        : 'Single-mode themes must use pre.png',
    )
  }

  Object.values(previews).forEach((preview) => {
    const file = resolveThemeAsset(preview)
    const { width, height } = pngDimensions(file)
    if (width * 9 !== height * 16) {
      throw new Error(`${preview} must use a 16:9 aspect ratio`)
    }
    if (
      !constraints.resolutions.some(([w, h]) => w === width && h === height)
    ) {
      throw new Error(`${preview} must be 1280x720 or 1920x1080`)
    }
  })

  for (const file of walkFiles(resourcesDir)) {
    const relative = path.relative(resourcesDir, file).split(path.sep).join('/')
    if (path.basename(file) === '.DS_Store') continue
    const extension = path.extname(file).toLowerCase()
    const allowedPreview =
      /^previews\/pre-(?:light|dark)\.png$/.test(relative) ||
      relative === 'previews/pre.png'
    if (!['.svg', '.json'].includes(extension) && !allowedPreview) {
      throw new Error(`Unsupported source graphic in resources/: ${relative}`)
    }
  }
}

const validateMacIconComposerSource = () => {
  const manifestPath = path.join(macIconBundle, 'icon.json')
  const assetsDir = path.join(macIconBundle, 'Assets')
  if (!statSync(macIconBundle, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(
      'Missing Icon Composer bundle: resources/application/app-icon-mac.icon',
    )
  }
  if (!existsSync(manifestPath) || !existsSync(assetsDir)) {
    throw new Error('app-icon-mac.icon must contain icon.json and Assets/')
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const imageNames = collectStrings(manifest)
    .filter((value) => value.toLowerCase().endsWith('.svg'))
    .filter((value, index, values) => values.indexOf(value) === index)
  if (imageNames.length === 0) {
    throw new Error('app-icon-mac.icon does not reference any SVG layers')
  }
  for (const imageName of imageNames) {
    const imagePath = path.resolve(assetsDir, imageName)
    if (
      !imagePath.startsWith(`${assetsDir}${path.sep}`) ||
      !existsSync(imagePath)
    ) {
      throw new Error(`Missing Icon Composer layer: Assets/${imageName}`)
    }
  }
}

const generateMacApplicationAssets = (appDir) => {
  if (process.platform !== 'darwin') return

  const macOutput = path.join(appDir, 'macos')
  const actoolOutput = mkdtempSync(
    path.join(os.tmpdir(), 'meow-icon-composer-'),
  )
  const partialInfoPlist = path.join(actoolOutput, 'icon-info.plist')

  try {
    const result = spawnSync(
      'xcrun',
      [
        'actool',
        macIconBundle,
        '--compile',
        actoolOutput,
        '--platform',
        'macosx',
        '--minimum-deployment-target',
        '11.0',
        '--target-device',
        'mac',
        '--app-icon',
        'app-icon-mac',
        '--output-partial-info-plist',
        partialInfoPlist,
        '--output-format',
        'human-readable-text',
        '--notices',
        '--warnings',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      },
    )
    const assetCatalog = path.join(actoolOutput, 'Assets.car')
    if (result.status !== 0 || !existsSync(assetCatalog)) {
      throw new Error(
        result.stderr ||
          result.stdout ||
          'Icon Composer asset catalog generation failed',
      )
    }

    rmSync(macOutput, { recursive: true, force: true })
    mkdirSync(macOutput, { recursive: true })
    copyFileSync(assetCatalog, path.join(macOutput, 'Assets.car'))
  } finally {
    rmSync(actoolOutput, { recursive: true, force: true })
  }
}

const generateApplicationIcons = () => {
  const appDir = path.join(generatedDir, 'application')
  const appPng = path.join(appDir, 'app-icon.png')
  const iconOutput = path.join(appDir, 'icons')
  renderSvg(
    path.join(resourcesDir, 'application', 'app-icon.svg'),
    appPng,
    1024,
  )
  const dmgBackground = path.join(appDir, 'app-dmg-background.png')
  renderSvg(
    path.join(resourcesDir, 'application', 'app-dmg-background.svg'),
    dmgBackground,
    1320,
  )
  setMacRetinaDpi(dmgBackground)

  const localTauri = path.join(
    projectRoot,
    'node_modules',
    '@tauri-apps',
    'cli',
    'tauri.js',
  )
  if (!existsSync(localTauri)) {
    throw new Error('Local Tauri CLI is missing; run pnpm install first')
  }
  const result = spawnSync(
    process.execPath,
    [localTauri, 'icon', appPng, '-o', iconOutput],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  )
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.stdout || 'Tauri icon generation failed',
    )
  }

  generateMacApplicationAssets(appDir)
}

const generateTrayIcons = () => {
  const entries = [
    [theme.assets.tray.idle, 'tray-idle.png'],
    [theme.assets.tray.systemProxy, 'tray-sys.png'],
    [theme.assets.tray.tun, 'tray-tun.png'],
  ]
  for (const [source, target] of entries) {
    renderSvg(
      resolveThemeAsset(source),
      path.join(generatedDir, 'tray', target),
      64,
    )
  }
}

ensureDefaultPreview()
validateTheme()
validateMacIconComposerSource()
generateApplicationIcons()
generateTrayIcons()

console.log('Theme resources validated and generated in .generated/')
