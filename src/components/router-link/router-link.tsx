import { Link as RouterNavLink } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

// Astryx also passes the href as `to`, which must not override the split one.
type AnchorProps = ComponentProps<'a'> & { to?: string }

/**
 * Adapter that lets Astryx <Link> (and any component that renders one) route
 * through TanStack Router instead of doing a full page load. Astryx passes
 * `href`; TanStack Router expects `to`, with the query as a `search` object
 * that the target route's `validateSearch` then reads.
 */
export function RouterLink({ href, to: _to, children, ...props }: AnchorProps) {
  if (!href) {
    return <a {...props}>{children}</a>
  }

  const [to, query] = href.split('?', 2)

  return (
    <RouterNavLink
      to={to}
      search={
        query ? Object.fromEntries(new URLSearchParams(query)) : undefined
      }
      {...props}
    >
      {children}
    </RouterNavLink>
  )
}
