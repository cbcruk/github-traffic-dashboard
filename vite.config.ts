import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath, URL } from 'url'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    devtools(),
    nitro({
      // Deploy target: Cloudflare Workers.
      preset: 'cloudflare_module',
      // Server plugin that runs traffic collection on the cron trigger.
      plugins: [
        fileURLToPath(new URL('./src/nitro/scheduled.ts', import.meta.url)),
      ],
      // @libsql/client pulls in cross-fetch -> node-fetch, whose node:http path
      // crashes on workerd. Force it to the runtime's native fetch.
      alias: {
        'cross-fetch': fileURLToPath(
          new URL('./src/nitro/native-fetch.ts', import.meta.url),
        ),
      },
      cloudflare: {
        deployConfig: true,
        nodeCompat: true,
        wrangler: {
          // Daily at 00:00 UTC. Cloudflare cron triggers are not disabled by
          // repository inactivity (unlike GitHub Actions schedules).
          triggers: {
            crons: ['0 0 * * *'],
          },
        },
      },
    }),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),

    tanstackStart(),
    viteReact(),
  ],
})

export default config
