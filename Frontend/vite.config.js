import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dedicated rule for SSE MUST come before the generic /api rule.
      // Without this, Vite's proxy buffers the stream and drops the connection.
      '/api/v1/alerts/stream': {
        target: 'http://localhost:2006',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Disable proxy-level response buffering for SSE
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
        },
      },
      '/api': {
        target: 'http://localhost:2006',
        // target: 'http://93.127.172.217:2006',
        changeOrigin: true,
      },
    }
  }
})
