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
      // Terser options for production obfuscation
      ...(isProduction && {
        terserOptions: {
          compress: {
            // Remove console statements
            drop_console: true,
            drop_debugger: true,
            // Remove comments
            passes: 2,
            // More aggressive optimizations
            unsafe: true,
            unsafe_comps: true,
            unsafe_Function: true,
            unsafe_math: true,
            unsafe_symbols: true,
            unsafe_methods: true,
            unsafe_proto: true,
            unsafe_regexp: true,
            unsafe_undefined: true,
            // Dead code elimination
            dead_code: true,
            // Constant folding
            evaluate: true,
            // Function inlining
            inline: true,
            // Join variable declarations
            join_vars: true,
            // Loop optimizations
            loops: true,
            // Remove unused code
            pure_getters: true,
            reduce_vars: true,
            // Collapse single-use variables
            collapse_vars: true,
          },
          mangle: {
            // Obfuscate variable names
            toplevel: true,
            // Obfuscate function names
            keep_fnames: false,
            // Obfuscate class names
            keep_classnames: false,
            // More aggressive obfuscation
            properties: {
              regex: /^_/
            }
          },
          format: {
            // Remove all comments
            comments: false,
            // Compact output
            beautify: false,
            // Remove unnecessary semicolons
            semicolons: true,
            // Shorten property access
            quote_style: 1
          }
        }
      })
    }
  }
})
