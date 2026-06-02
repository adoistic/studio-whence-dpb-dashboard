import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@content': path.resolve(__dirname, 'content'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Scope to the Next app's own tests. The functions/ Cloud Functions package
    // is a separate package with its own deps and tests; including it here would
    // try to resolve its node_modules (firebase-admin, @aws-sdk, …) which the
    // app's install does not provide (it breaks in CI's clean checkout).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
