import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const timestamp = Date.now();

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';

  return {
    plugins: [react()],
    base: '/',
    // Console logs will be removed by Terser in production mode
    build: {
      // Enable source maps only in development
      sourcemap: !isProduction,
      // More aggressive minification in production
      minify: isProduction ? 'terser' : 'esbuild',
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name]-${timestamp}-[hash].js`,
          chunkFileNames: `assets/[name]-${timestamp}-[hash].js`,
          assetFileNames: `assets/[name]-${timestamp}-[hash].[ext]`
        }
      },
      // Terser options for production - BROADCAST-SAFE CONFIGURATION
      ...(isProduction && {
        terserOptions: {
          compress: {
            // KEEP console.log for broadcast system debugging/monitoring
            drop_console: false,
            drop_debugger: true,
            // Safe optimizations only
            passes: 1,
            // DISABLE unsafe optimizations that could break WebSocket/Supabase
            unsafe: false,
            unsafe_comps: false,
            unsafe_Function: false,
            unsafe_math: false,
            unsafe_symbols: false,
            unsafe_methods: false,
            unsafe_proto: false,
            unsafe_regexp: false,
            unsafe_undefined: false,
            // Safe dead code elimination
            dead_code: true,
            // Safe constant folding
            evaluate: true,
            // DISABLE function inlining (could break callbacks)
            inline: false,
            // Safe variable joining
            join_vars: true,
            // Safe loop optimizations
            loops: true,
            // DISABLE pure_getters (could break Supabase properties)
            pure_getters: false,
            // Safe variable reduction
            reduce_vars: true,
            // Safe variable collapsing
            collapse_vars: true,
          },
          mangle: {
            // PRESERVE top-level names (WebSocket channels, Supabase client)
            toplevel: false,
            // PRESERVE function names (callbacks, event handlers)
            keep_fnames: true,
            // PRESERVE class names (Supabase classes)
            keep_classnames: true,
            // DISABLE property mangling (could break Supabase API calls)
            properties: false
          },
          format: {
            // Remove comments for size
            comments: false,
            // Compact but readable output
            beautify: false,
            // Keep semicolons for safety
            semicolons: true,
            // Conservative quote style
            quote_style: 0
          }
        }
      })
    }
  }
})
