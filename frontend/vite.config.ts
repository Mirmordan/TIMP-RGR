import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/recordings': {
        target: 'http://localhost:80',
        changeOrigin: true,
      },
      '/live': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
})
