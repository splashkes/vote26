import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const timestamp = Date.now();
export default defineConfig({
  plugins: [react()],
  base: '/results/',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${timestamp}-[hash].js`,
        chunkFileNames: `assets/[name]-${timestamp}-[hash].js`,
        assetFileNames: `assets/[name]-${timestamp}-[hash].[ext]`
      }
    }
  }
})