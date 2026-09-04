import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { LinkProvider } from '@astryxdesign/core/Link'
import { ThemeProvider } from '../components/theme-provider'
import { RouterLink } from '../components/router-link'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'GitHub Traffic Dashboard',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
    ],
  }),

  shellComponent: RootDocument,
})

/*
 * Applies the stored color mode before first paint. Astryx <Theme> takes over
 * on hydration and writes the same attributes, so this only covers the gap
 * between HTML parse and hydration. Without a stored preference the attribute
 * is left off and Astryx follows the OS via `color-scheme: light dark`.
 */
const themeScript = `
  (function() {
    try {
      var stored = localStorage.getItem('theme')
      if (stored === 'dark' || stored === 'light') {
        document.documentElement.setAttribute('data-theme', stored)
      }
      document.documentElement.setAttribute('data-astryx-theme', 'neutral')
    } catch (e) {}
  })()
`

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <LinkProvider component={RouterLink}>{children}</LinkProvider>
        </ThemeProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
