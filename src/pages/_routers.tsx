import { createBrowserRouter, Navigate, RouteObject } from 'react-router'

import Layout from './_layout'
import { navItems } from './_navigation'
import ThemeManagerPage from './theme-manager'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      ...navItems.map(
        (item) =>
          ({
            path: item.path,
            Component: item.Component,
          }) as RouteObject,
      ),
      {
        path: '/app-routing',
        element: <Navigate replace to="/rules" />,
      },
      {
        path: '/extensions/themes',
        Component: ThemeManagerPage,
      },
    ],
  },
])
