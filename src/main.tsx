import { installStorageShim } from "./lib/installStorageShim";
import { installChunkLoadRecovery } from "./lib/chunkLoadRecovery";
import { configureNativeChrome } from "./lib/nativeChrome";
import { installNativeBackSwipe } from "./lib/nativeBackSwipe";
// 必须在任何会触碰 localStorage 的模块（尤其是 supabase client）被导入前执行
installStorageShim();
installChunkLoadRecovery();
void configureNativeChrome();
installNativeBackSwipe();

import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "./components/system/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary scope="root">
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </ErrorBoundary>
);
