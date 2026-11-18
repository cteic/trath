import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Tauri loads the dev server from a fixed address, so the port must not move.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  test: {
    environment: 'jsdom',
    env: { TZ: 'Europe/Dublin' },
  },
});
