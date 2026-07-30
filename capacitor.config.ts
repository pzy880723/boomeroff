import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.boomeroff.go',
  appName: 'BOOMER GO',
  webDir: 'dist',
  server: {
    url: 'https://bef32724-503e-467a-af03-2062176cf921.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
