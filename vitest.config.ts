import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'

// Separate from vite.config.ts on purpose: its devtools server and Nitro's
// Cloudflare dev emulation would otherwise start inside every test run, keep
// vitest from exiting, and leave a workerd process behind. Tests that need D1
// start their own through src/lib/test-d1.ts.
export default defineConfig({
  plugins: [viteTsConfigPaths({ projects: ['./tsconfig.json'] }), viteReact()],
})
