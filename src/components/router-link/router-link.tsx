import { Link as RouterNavLink } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

type AnchorProps = ComponentProps<'a'>

/**
 * Adapter that lets Astryx <Link> (and any component that renders one) route
 * through TanStack Router instead of doing a full page load. Astryx passes
 * `href`; TanStack Router expects `to`.
 */
export function RouterLink({ href, children, ...props }: AnchorProps) {
  if (!href) {
    return <a {...props}>{children}</a>
  }

  return (
    <RouterNavLink to={href} {...props}>
      {children}
    </RouterNavLink>
  )
}
