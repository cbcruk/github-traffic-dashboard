import { createFileRoute } from '@tanstack/react-router'
import { collectTraffic } from '@/lib/collect-traffic'

/**
 * Traffic collection endpoint, driven by Vercel Cron (see vercel.json).
 *
 * Protected by CRON_SECRET: when the env var is set, requests must send
 * `Authorization: Bearer <CRON_SECRET>`. Vercel Cron adds this header
 * automatically when the project has a CRON_SECRET env var.
 */
export const Route = createFileRoute('/api/collect')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET
        if (secret) {
          const auth = request.headers.get('authorization')
          if (auth !== `Bearer ${secret}`) {
            return new Response('Unauthorized', { status: 401 })
          }
        }

        try {
          const result = await collectTraffic()
          return Response.json({ ok: true, ...result })
        } catch (error) {
          console.error('Traffic collection failed:', error)
          return Response.json(
            { ok: false, error: String(error) },
            { status: 500 },
          )
        }
      },
    },
  },
})
