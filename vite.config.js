import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Allow access through dev tunnels (e.g. Cloudflare quick tunnels) so the
    // app can be opened from a phone during development.
    allowedHosts: ['.trycloudflare.com', '.loca.lt', '.ngrok-free.app'],
  },
})
