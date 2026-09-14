import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // Vercel's Supabase integration exposes NEXT_PUBLIC_* variables.
  // Keep VITE_* support for local/manual deployments as well.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: { host: '127.0.0.1', watch: { useFsEvents: false, usePolling: true, interval: 500 } },
  test: { testTimeout: 30000, hookTimeout: 30000 },
});
