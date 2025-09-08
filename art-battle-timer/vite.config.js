import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const timestamp = Date.now();
export default defineConfig({
  plugins: [react()],
  base: '/timer/',
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