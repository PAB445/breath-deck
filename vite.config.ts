import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5287, host: '127.0.0.1', strictPort: true },
  preview: { port: 5288 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
