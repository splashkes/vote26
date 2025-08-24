import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const timestamp = Date.now();

// Check for OPTIMIZE environment variable
const isOptimized = process.env.OPTIMIZE === 'true';

export default defineConfig({
  plugins: [react()],
  build: {
    // Use Terser for production optimization when OPTIMIZE=true
    minify: isOptimized ? 'terser' : 'esbuild',
    terserOptions: isOptimized ? {
      compress: {
        drop_console: true,    // Remove all console.log statements
        drop_debugger: true,   // Remove debugger statements
        pure_funcs: ['console.log', 'console.info', 'console.warn'], // Extra console cleanup
        passes: 2              // Run compression twice for better results
      },
      mangle: {
        toplevel: true         // Mangle top-level variable names for better compression
      }
    } : undefined,
    target: isOptimized ? 'es2020' : 'es2015', // Modern target for smaller output
    cssCodeSplit: true,        // Split CSS into separate files
    sourcemap: false,          // Don't generate source maps in production
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${timestamp}-[hash].js`,
        chunkFileNames: `assets/[name]-${timestamp}-[hash].js`,
        assetFileNames: `assets/[name]-${timestamp}-[hash].[ext]`,
        compact: isOptimized   // More compact output when optimizing
      }
    }
  }
})
