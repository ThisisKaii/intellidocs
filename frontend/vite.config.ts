import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * A production bundle needs the backend's full URL. A relative value such as
 * "/api" only works behind this dev server's proxy: on a static host the request
 * lands on the SPA fallback and every API call (login included) returns 405.
 */
function requireAbsoluteApiUrl(): Plugin {
  return {
    name: 'require-absolute-api-url',
    config(_config, { command, mode }) {
      if (command !== 'build' || mode !== 'production') return
      const url = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL
      if (url && /^https?:\/\//i.test(url)) return
      throw new Error(
        `VITE_API_URL must be the backend's full URL (for example https://your-api.onrender.com) in a production build; got ${url ? `"${url}"` : 'nothing'}. ` +
          'A relative value like "/api" only works behind the Vite dev server proxy.',
      )
    },
  }
}

export default defineConfig({
  plugins: [requireAbsoluteApiUrl(), tailwindcss(), react()],
  // harper.js loads its WASM binary via `new URL(..., import.meta.url)`. The
  // dependency pre-bundler does not rewrite that reference, so keep the
  // package out of optimizeDeps and let Vite's asset pipeline serve it.
  optimizeDeps: {
    exclude: ['harper.js'],
  },
  // Unit tests run in jsdom so editor code that touches the DOM can be tested.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': `${__dirname}/src`,
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
