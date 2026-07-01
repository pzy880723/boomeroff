import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

const FALLBACK_STATUS_BAR_HEIGHT = 24;
const STATUS_BAR_COLOR = "#F8F5EF";

function setNativeStatusBarHeight(height: number) {
  document.documentElement.style.setProperty("--app-statusbar-height", `${height}px`);
}

export async function configureNativeChrome() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  document.documentElement.classList.add("capacitor-native");
  setNativeStatusBarHeight(FALLBACK_STATUS_BAR_HEIGHT);

  try {
    await StatusBar.show();
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: STATUS_BAR_COLOR });
    await StatusBar.setOverlaysWebView({ overlay: false });

    const statusBar = await StatusBar.getInfo();
    if (statusBar.height > 0) {
      setNativeStatusBarHeight(statusBar.height);
    }
  } catch {
    // The CSS fallback above keeps Android/iOS content out of the status bar.
  }
}
