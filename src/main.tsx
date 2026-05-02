import { installStorageShim } from "./lib/installStorageShim";
// 必须在任何会触碰 localStorage 的模块（尤其是 supabase client）被导入前执行
installStorageShim();

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "./components/system/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary scope="root">
    <App />
  </ErrorBoundary>
);
