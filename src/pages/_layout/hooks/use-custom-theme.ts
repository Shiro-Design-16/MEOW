import { alpha, createTheme, Shadows } from '@mui/material'
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from '@tauri-apps/api/webviewWindow'
import { Theme as TauriOsTheme } from '@tauri-apps/api/window'
import { useEffect, useMemo } from 'react'

import { useVerge } from '@/hooks/use-verge'
import { useSetThemeMode, useThemeMode } from '@/services/states'
import {
  canSelectThemeMode,
  getThemeDefinition,
  resolveSupportedThemeMode,
  ThemeColorMode,
} from '@/services/themes'

export const useCustomTheme = () => {
  const appWindow: WebviewWindow = useMemo(() => getCurrentWebviewWindow(), [])
  const { verge } = useVerge()
  const { theme_mode, active_theme } = verge ?? {}
  const configuredTheme = useMemo(
    () => getThemeDefinition(active_theme),
    [active_theme],
  )
  const mode = useThemeMode()
  const setMode = useSetThemeMode()
  const supportsBothModes = canSelectThemeMode(configuredTheme)
  const effectiveMode = resolveSupportedThemeMode(
    configuredTheme,
    mode as ThemeColorMode,
  )

  useEffect(() => {
    if (!supportsBothModes || theme_mode !== 'system') return

    let mounted = true
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const syncMediaTheme = () => setMode(mediaQuery.matches ? 'dark' : 'light')

    syncMediaTheme()
    appWindow
      .setTheme(null)
      .then(() => appWindow.theme())
      .then((systemTheme) => {
        if (mounted && systemTheme) setMode(systemTheme)
      })
      .catch((error) => console.error('Failed to read system theme:', error))

    const unlisten = appWindow.onThemeChanged(({ payload }) => {
      if (mounted) setMode(payload)
    })
    mediaQuery.addEventListener('change', syncMediaTheme)

    return () => {
      mounted = false
      mediaQuery.removeEventListener('change', syncMediaTheme)
      void unlisten.then((dispose) => dispose())
    }
  }, [appWindow, setMode, supportsBothModes, theme_mode])

  useEffect(() => {
    if (!supportsBothModes) {
      const supportedMode = configuredTheme.supportedModes[0]
      setMode(supportedMode)
      void appWindow
        .setTheme(supportedMode as TauriOsTheme)
        .catch((error) => console.error('Failed to set window theme:', error))
      return
    }
    if (theme_mode === 'light' || theme_mode === 'dark') {
      setMode(theme_mode)
      void appWindow
        .setTheme(theme_mode as TauriOsTheme)
        .catch((error) => console.error('Failed to set window theme:', error))
    }
  }, [appWindow, configuredTheme, setMode, supportsBothModes, theme_mode])

  const theme = useMemo(() => {
    const tokens = configuredTheme.modes[effectiveMode]
    const { palette, chrome } = tokens
    const muiTheme = createTheme({
      breakpoints: {
        values: { xs: 0, sm: 650, md: 900, lg: 1200, xl: 1536 },
      },
      palette: {
        mode: effectiveMode,
        primary: { main: palette.primary },
        secondary: { main: palette.secondary },
        info: { main: palette.info },
        error: { main: palette.error },
        warning: { main: palette.warning },
        success: { main: palette.success },
        text: {
          primary: palette.textPrimary,
          secondary: palette.textSecondary,
        },
        background: {
          paper: palette.background,
          default: palette.background,
        },
      },
      shadows: Array(25).fill('none') as Shadows,
      typography: { fontFamily: configuredTheme.typography.fontFamily },
    })

    const root = document.documentElement
    root.style.setProperty('--divider-color', chrome.divider)
    root.style.setProperty('--background-color', chrome.rootBackground)
    root.style.setProperty('--selection-color', chrome.selection)
    root.style.setProperty('--scroller-color', chrome.scroller)
    root.style.setProperty('--primary-main', muiTheme.palette.primary.main)
    root.style.setProperty(
      '--background-color-alpha',
      alpha(muiTheme.palette.primary.main, 0.1),
    )
    root.style.setProperty('--window-border-color', chrome.windowBorder)
    root.style.setProperty('--scrollbar-bg', chrome.scrollbarBackground)
    root.style.setProperty('--scrollbar-thumb', chrome.scrollbarThumb)

    let style = document.querySelector<HTMLStyleElement>('style#meow-theme')
    if (!style) {
      style = document.createElement('style')
      style.id = 'meow-theme'
      document.head.appendChild(style)
    }
    style.textContent = `
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
        background-color: var(--scrollbar-bg);
      }
      ::-webkit-scrollbar-thumb {
        background-color: var(--scrollbar-thumb);
        border-radius: 4px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background-color: ${chrome.scrollbarThumbHover};
      }
      body { background-color: var(--background-color); }
      .MuiPaper-root { border-color: var(--window-border-color) !important; }
      .MuiDialog-paper { background-color: ${palette.dialogBackground} !important; }
      * { outline: none !important; box-shadow: none !important; }
    `

    return muiTheme
  }, [configuredTheme, effectiveMode])

  useEffect(() => {
    const gradient = document.querySelector('#Gradient2')
    if (gradient) {
      gradient.innerHTML = `
        <stop offset="0%" stop-color="${theme.palette.primary.main}" />
        <stop offset="80%" stop-color="${theme.palette.primary.dark}" />
        <stop offset="100%" stop-color="${theme.palette.primary.dark}" />
      `
    }
  }, [theme.palette.primary.dark, theme.palette.primary.main])

  return { theme, themeDefinition: configuredTheme }
}
