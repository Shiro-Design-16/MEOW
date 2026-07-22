import { convertFileSrc } from '@tauri-apps/api/core'
import { exists, readTextFile } from '@tauri-apps/plugin-fs'
import { useSyncExternalStore } from 'react'

import builtInPreviewDark from '@root/resources/previews/pre-dark.png'
import builtInPreviewIcon from '@root/resources/previews/pre-icon.svg?url'
import builtInPreviewLight from '@root/resources/previews/pre-light.png'
import builtInThemeJson from '@root/resources/theme.json'

export type ThemeColorMode = 'light' | 'dark'

export interface ThemeModeTokens {
  palette: {
    primary: string
    secondary: string
    info: string
    error: string
    warning: string
    success: string
    textPrimary: string
    textSecondary: string
    background: string
    dialogBackground: string
  }
  chrome: {
    rootBackground: string
    selection: string
    scroller: string
    divider: string
    windowBorder: string
    scrollbarBackground: string
    scrollbarThumb: string
    scrollbarThumbHover: string
  }
}

export interface ThemePreviewDefinition {
  icon: string
  images:
    | { light: string; dark: string; default?: never }
    | { default: string; light?: never; dark?: never }
}

export interface ThemeDefinition {
  schemaVersion: 1
  id: string
  name: string
  version: string
  author: string
  supportedModes: ThemeColorMode[]
  assets?: unknown
  preview: ThemePreviewDefinition
  typography: { fontFamily: string }
  modes: Record<ThemeColorMode, ThemeModeTokens>
}

export interface InstalledThemePackage {
  theme: ThemeDefinition
  source: 'built-in' | 'local'
  sourceDirectory?: string
  preview: {
    icon: string
    light?: string
    dark?: string
    default?: string
  }
}

interface StoredThemePackage {
  theme: ThemeDefinition
  sourceDirectory: string
}

const STORAGE_KEY = 'meow.theme-packages.v1'
const builtInTheme = builtInThemeJson as unknown as ThemeDefinition
const listeners = new Set<() => void>()

const joinSourcePath = (directory: string, relativePath: string) => {
  const separator = directory.includes('\\') ? '\\' : '/'
  return `${directory.replace(/[\\/]+$/u, '')}${separator}${relativePath.replaceAll('/', separator)}`
}

const getStorage = () =>
  typeof window === 'undefined' ? undefined : window.localStorage

const readStoredThemes = (): StoredThemePackage[] => {
  try {
    const raw = getStorage()?.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const localPreviewUrl = (directory: string, relativePath: string) =>
  convertFileSrc(joinSourcePath(directory, relativePath))

const toInstalledPackage = ({
  theme,
  sourceDirectory,
}: StoredThemePackage): InstalledThemePackage => ({
  theme,
  source: 'local',
  sourceDirectory,
  preview: {
    icon: localPreviewUrl(sourceDirectory, theme.preview.icon),
    light:
      typeof theme.preview.images.light === 'string'
        ? localPreviewUrl(sourceDirectory, theme.preview.images.light)
        : undefined,
    dark:
      typeof theme.preview.images.dark === 'string'
        ? localPreviewUrl(sourceDirectory, theme.preview.images.dark)
        : undefined,
    default:
      typeof theme.preview.images.default === 'string'
        ? localPreviewUrl(sourceDirectory, theme.preview.images.default)
        : undefined,
  },
})

const builtInPackage: InstalledThemePackage = {
  theme: builtInTheme,
  source: 'built-in',
  preview: {
    icon: builtInPreviewIcon,
    light: builtInPreviewLight,
    dark: builtInPreviewDark,
  },
}

let installedPackages: readonly InstalledThemePackage[] = [
  builtInPackage,
  ...readStoredThemes().map(toInstalledPackage),
]

const updateInstalledPackages = (storedThemes: StoredThemePackage[]) => {
  getStorage()?.setItem(STORAGE_KEY, JSON.stringify(storedThemes))
  installedPackages = [builtInPackage, ...storedThemes.map(toInstalledPackage)]
  listeners.forEach((listener) => listener())
}

const collectStrings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectStrings)
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings)
  }
  return []
}

const isStringRecord = (value: unknown, keys: readonly string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return keys.every((key) => typeof record[key] === 'string')
}

const validateThemeDefinition = (value: unknown): ThemeDefinition => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('theme.json must contain an object')
  }
  const theme = value as Partial<ThemeDefinition>
  if (
    theme.schemaVersion !== 1 ||
    typeof theme.id !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]+$/iu.test(theme.id) ||
    typeof theme.name !== 'string' ||
    typeof theme.version !== 'string' ||
    typeof theme.author !== 'string'
  ) {
    throw new Error('theme.json has invalid identity metadata')
  }
  if (
    !Array.isArray(theme.supportedModes) ||
    theme.supportedModes.length === 0 ||
    new Set(theme.supportedModes).size !== theme.supportedModes.length ||
    theme.supportedModes.some((mode) => !['light', 'dark'].includes(mode))
  ) {
    throw new Error('theme.json has invalid supportedModes')
  }

  const paletteKeys = [
    'primary',
    'secondary',
    'info',
    'error',
    'warning',
    'success',
    'textPrimary',
    'textSecondary',
    'background',
    'dialogBackground',
  ]
  const chromeKeys = [
    'rootBackground',
    'selection',
    'scroller',
    'divider',
    'windowBorder',
    'scrollbarBackground',
    'scrollbarThumb',
    'scrollbarThumbHover',
  ]
  for (const mode of theme.supportedModes) {
    const tokens = theme.modes?.[mode]
    if (
      !tokens ||
      !isStringRecord(tokens.palette, paletteKeys) ||
      !isStringRecord(tokens.chrome, chromeKeys)
    ) {
      throw new Error(`theme.json is missing ${mode} mode tokens`)
    }
  }
  if (typeof theme.typography?.fontFamily !== 'string') {
    throw new Error('theme.json is missing typography.fontFamily')
  }
  if (
    !theme.preview ||
    theme.preview.icon !== 'previews/pre-icon.svg' ||
    !theme.preview.images
  ) {
    throw new Error('theme.json is missing its preview definition')
  }

  const supportsBothModes =
    theme.supportedModes.includes('light') &&
    theme.supportedModes.includes('dark')
  if (
    supportsBothModes &&
    (theme.preview.images.light !== 'previews/pre-light.png' ||
      theme.preview.images.dark !== 'previews/pre-dark.png')
  ) {
    throw new Error('Dual-mode themes require pre-light.png and pre-dark.png')
  }
  if (
    !supportsBothModes &&
    theme.preview.images.default !== 'previews/pre.png'
  ) {
    throw new Error('Single-mode themes require previews/pre.png')
  }

  return theme as ThemeDefinition
}

const validateRelativeAssetPath = (relativePath: string) => {
  if (
    relativePath.startsWith('/') ||
    /^[a-z]:[\\/]/iu.test(relativePath) ||
    relativePath.split(/[\\/]/u).includes('..')
  ) {
    throw new Error(`Theme asset must stay inside its package: ${relativePath}`)
  }
}

export const importThemePackage = async (sourceDirectory: string) => {
  const manifestPath = joinSourcePath(sourceDirectory, 'theme.json')
  const theme = validateThemeDefinition(
    JSON.parse(await readTextFile(manifestPath)),
  )
  if (theme.id === builtInTheme.id) {
    throw new Error('The built-in theme id is reserved')
  }

  const assetPaths = new Set([
    theme.preview.icon,
    ...Object.values(theme.preview.images).filter(
      (path): path is string => typeof path === 'string',
    ),
    ...collectStrings(theme.assets),
  ])
  for (const relativePath of assetPaths) {
    validateRelativeAssetPath(relativePath)
    if (!(await exists(joinSourcePath(sourceDirectory, relativePath)))) {
      throw new Error(`Theme asset is missing: ${relativePath}`)
    }
  }

  const storedThemes = readStoredThemes().filter(
    (item) => item.theme.id !== theme.id,
  )
  storedThemes.push({ theme, sourceDirectory })
  updateInstalledPackages(storedThemes)
  return theme
}

export const removeThemePackage = (id: string) => {
  if (id === builtInTheme.id) return
  updateInstalledPackages(
    readStoredThemes().filter((item) => item.theme.id !== id),
  )
}

export const getInstalledThemePackages = () => installedPackages

export const useInstalledThemePackages = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getInstalledThemePackages,
    getInstalledThemePackages,
  )

export const getThemeDefinition = (id?: string) =>
  installedPackages.find((item) => item.theme.id === id)?.theme ?? builtInTheme

export const getThemePackage = (id?: string) =>
  installedPackages.find((item) => item.theme.id === id) ?? builtInPackage

export const canSelectThemeMode = (theme: ThemeDefinition) =>
  theme.supportedModes.includes('light') &&
  theme.supportedModes.includes('dark')

export const resolveSupportedThemeMode = (
  theme: ThemeDefinition,
  mode: ThemeColorMode,
) => (theme.supportedModes.includes(mode) ? mode : theme.supportedModes[0])
