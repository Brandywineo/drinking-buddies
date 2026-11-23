import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { PwaInstall } from '../components/PwaInstall'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#10110f' },
      { name: 'description', content: 'An 18+ social discovery community. Find your people, make plans and discover local venues.' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { title: 'Drinking Buddies — Find your people' },
    ],
    links: [
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/icons/app-icon-192.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/icons/app-icon-192.svg' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return <RootDocument><Outlet /><PwaInstall /></RootDocument>
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  )
}
