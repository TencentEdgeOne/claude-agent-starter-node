import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // @tencent/edgeone is a backend/deploy dependency, frontend does not need pre-optimization
  optimizeDeps: {
    exclude: ['@tencent/edgeone'],
  },
  server: {
    port: 5173,
    headers: {
      'Connection': 'keep-alive',
    },
  },
})
