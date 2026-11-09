import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Content-Security-Policy for the packaged app. Added to builds only: the dev
// server injects inline scripts for hot reload. Scripts may come only from the
// app itself, and network access is limited to Supabase and the map lookups.
function contentSecurityPolicy(env) {
  let supabase = ''
  try {
    const url = new URL(env.VITE_SUPABASE_URL)
    supabase = `${url.origin} wss://${url.host}`
  } catch {
    throw new Error('VITE_SUPABASE_URL must be set to build Blossom.')
  }

  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Product photos are arbitrary https image URLs entered by staff.
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${supabase} https://nominatim.openstreetmap.org https://raw.githubusercontent.com`,
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
  ].join('; ')

  return {
    name: 'blossom-csp',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }]
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), contentSecurityPolicy(env)],
    base: './',          // ← CRITIQUE pour Electron
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Split the big libraries out of the app bundle (was one 1.6 MB
          // file) so they parse separately and cache across app updates.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/[\\/]node_modules[\\/](recharts|d3-|victory-vendor)/.test(id)) return 'vendor-charts'
            if (/[\\/]node_modules[\\/](lottie-web|lottie-react)[\\/]/.test(id)) return 'vendor-lottie'
            if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return 'vendor-supabase'
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
            return 'vendor'
          },
        },
      },
    },
    server: {
      proxy: {
        '/__local-ollama': {
          target: 'http://127.0.0.1:11434',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/__local-ollama/, ''),
        },
      },
    },
  }
})
