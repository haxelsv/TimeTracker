import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', watch: { useFsEvents: false, usePolling: true, interval: 500 } },
  test: { testTimeout: 30000, hookTimeout: 30000 },
});
