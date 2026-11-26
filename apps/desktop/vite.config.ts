import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';

import { createVitestConfig } from '@cteic/vitest-config';

// Tauri loads the dev server from a fixed address, so the port must not move.
export default mergeConfig(
  createVitestConfig({ environment: 'jsdom' }),
  defineConfig({
    plugins: [react()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      watch: { ignored: ['**/src-tauri/**'] },
    },
    test: {
      env: { TZ: 'Europe/Dublin' },
    },
  })
);
