import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.boomeroff.go',
  appName: 'BOOMER GO',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#F8F5EF',
    },
    SplashScreen: {
      backgroundColor: '#F00000',
      launchAutoHide: true,
    },
  },
};

export default config;
