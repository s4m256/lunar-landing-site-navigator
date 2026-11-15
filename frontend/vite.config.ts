import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { thirdPartyLicenses } from './licenses-plugin.mjs';

export default defineConfig({
  plugins: [react(), thirdPartyLicenses()],
  test: { environment: 'jsdom', setupFiles: './src/test-setup.ts' },
});
