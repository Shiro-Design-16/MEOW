import { Box } from '@mui/material'
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'

import { BaseLoading } from '@/components/base'
import { ensureLanguageSections } from '@/services/i18n'
import ConnectionsSvg from '@root/resources/navigation/nav-connections.svg?react'
import ExtensionsSvg from '@root/resources/navigation/nav-extensions.svg?react'
import HomeSvg from '@root/resources/navigation/nav-home.svg?react'
import LogsSvg from '@root/resources/navigation/nav-logs.svg?react'
import ProfilesSvg from '@root/resources/navigation/nav-profiles.svg?react'
import ProxiesSvg from '@root/resources/navigation/nav-proxies.svg?react'
import RulesSvg from '@root/resources/navigation/nav-rules.svg?react'
import SettingsSvg from '@root/resources/navigation/nav-settings.svg?react'
import TestsSvg from '@root/resources/navigation/nav-tests.svg?react'

import { navigationItems } from './_navigation-meta'
import HomePage from './home'

type NavigationItem = {
  label: (typeof navigationItems)[keyof typeof navigationItems]['label']
  path: string
  icon: ReactNode
  Component: ComponentType
  preload?: () => Promise<{ default: ComponentType }>
}

const waitForWarmupIdle = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    let idleId: number | undefined
    let timeoutId: number | undefined

    const cleanup = () => {
      signal.removeEventListener('abort', finish)
      if (idleId !== undefined) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }

    const finish = () => {
      cleanup()
      resolve()
    }

    if (signal.aborted) {
      resolve()
      return
    }

    signal.addEventListener('abort', finish, { once: true })

    if (window.requestIdleCallback) {
      idleId = window.requestIdleCallback(finish, { timeout: 500 })
    } else {
      timeoutId = window.setTimeout(finish, 120)
    }
  })

const createRoutePreload = (
  load: () => Promise<{ default: ComponentType }>,
  sections?: string | readonly string[],
) => {
  let componentPromise: Promise<{ default: ComponentType }> | undefined

  const loadComponent = () => {
    componentPromise ??= load().catch((error) => {
      componentPromise = undefined
      throw error
    })

    return componentPromise
  }

  if (!sections) {
    return loadComponent
  }

  return async () => {
    const [component] = await Promise.all([
      loadComponent(),
      ensureLanguageSections(sections),
    ])
    return component
  }
}

const createLazyRoute = (
  load: () => Promise<{ default: ComponentType }>,
  sections?: string | readonly string[],
) => {
  const preload = createRoutePreload(load, sections)
  const Component = lazy(preload)
  const LazyRoute = () => (
    <Suspense
      fallback={
        <Box
          sx={{
            display: 'flex',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BaseLoading />
        </Box>
      }
    >
      <Component />
    </Suspense>
  )

  return { Component: LazyRoute, preload }
}

export const preloadLogsPage = createRoutePreload(
  () => import('./logs'),
  'logs',
)

export const navItems: NavigationItem[] = [
  {
    ...navigationItems.home,
    icon: <HomeSvg />,
    Component: HomePage,
  },
  {
    ...navigationItems.proxies,
    icon: <ProxiesSvg />,
    ...createLazyRoute(() => import('./proxies')),
  },
  {
    ...navigationItems.profiles,
    icon: <ProfilesSvg />,
    ...createLazyRoute(() => import('./profiles'), 'rules'),
  },
  {
    ...navigationItems.connections,
    icon: <ConnectionsSvg />,
    ...createLazyRoute(() => import('./connections'), 'connections'),
  },
  {
    ...navigationItems.rules,
    icon: <RulesSvg />,
    ...createLazyRoute(() => import('./rules'), 'rules'),
  },
  {
    ...navigationItems.logs,
    icon: <LogsSvg />,
    Component: () => null /* LogsPage rendered in Layout only on /logs route */,
    preload: preloadLogsPage,
  },
  {
    ...navigationItems.unlock,
    icon: <TestsSvg />,
    ...createLazyRoute(() => import('./unlock')),
  },
  {
    ...navigationItems.extensions,
    icon: <ExtensionsSvg />,
    ...createLazyRoute(() => import('./extensions'), 'rules'),
  },
  {
    ...navigationItems.settings,
    icon: <SettingsSvg />,
    ...createLazyRoute(() => import('./settings')),
  },
]

export const preloadNavigationRoutes = async (signal: AbortSignal) => {
  await waitForWarmupIdle(signal)
  if (signal.aborted) {
    return
  }

  await Promise.all(
    navItems.map((item) => {
      const preload = 'preload' in item ? item.preload : undefined
      return preload?.().catch(() => {})
    }),
  )
}
