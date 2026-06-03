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
    // The firestore.rules test needs the Firestore emulator on 127.0.0.1:8080.
    // It is emulator-gated and would fail in a plain `npm test` run, so by
    // default it is excluded and instead run via `npm run test:rules` (which
    // sets RULES_TEST=1 and wraps it in `firebase emulators:exec`).
    exclude: [
      '**/node_modules/**',
      ...(process.env.RULES_TEST ? [] : ['**/firestore-rules.test.ts']),
    ],
  },
})
