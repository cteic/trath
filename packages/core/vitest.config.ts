import { defineConfig } from 'vitest/config';

// Day maths reads the local time zone, so the tests pin one that has daylight saving.
export default defineConfig({
  test: {
    env: { TZ: 'Europe/Dublin' },
  },
});
