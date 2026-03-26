import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // target: 'http://localhost:2006',
        target: 'http://93.127.172.217:2006',
        changeOrigin: true,
      }
    }
  }
})
