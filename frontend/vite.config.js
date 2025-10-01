import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Allow requests proxied via Nginx/Cloudflare using the asset domain
    // and direct container-to-container host header "frontend" used in tests
    allowedHosts: ['asset.094510.xyz', 'frontend'],
    proxy: {
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true
      }
    }
  }
})