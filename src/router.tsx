import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},

    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Show a route's skeleton once its loader has taken 200ms, then keep it at
    // least 500ms so a load that ends just after does not flash it.
    defaultPendingMs: 200,
    defaultPendingMinMs: 500,
  })

  return router
}
