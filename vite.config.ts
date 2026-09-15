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
      // Bindings and the cron trigger live in wrangler.jsonc, which Nitro
      // merges into the generated Worker config.
      cloudflare: {
        deployConfig: true,
        nodeCompat: true,
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
