import { mergeConfig } from 'vitest/config';

import { createVitestConfig } from '@cteic/vitest-config';

// Day maths reads the local time zone, so the tests pin one that has daylight saving.
export default mergeConfig(createVitestConfig(), {
  test: {
    env: { TZ: 'Europe/Dublin' },
  },
});
