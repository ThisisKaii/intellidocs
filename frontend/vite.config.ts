import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [tailwindcss(), react()],
  // harper.js loads its WASM binary via `new URL(..., import.meta.url)`. The
  // dependency pre-bundler does not rewrite that reference, so keep the
  // package out of optimizeDeps and let Vite's asset pipeline serve it.
  optimizeDeps: {
    exclude: ['harper.js'],
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
