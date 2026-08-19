import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.boomeroff.go',
  appName: 'BOOMER GO',
  webDir: 'dist',
  server: {
    url: 'https://ai.boomeroff.com/?native_release=20260819_1',
  },
};

export default config;
