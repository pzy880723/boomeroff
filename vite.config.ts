import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    // 生产构建移除 console / debugger，减小体积、加快解析
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    reportCompressedSize: false,
    // 把大的第三方依赖拆成独立 chunk，便于浏览器长效缓存
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          // 所有会在模块顶层调用 React API 的库都并入同一个 chunk,
          // 避免 rollup 分包时因加载顺序错乱导致 React.forwardRef undefined 白屏。
          if (
            id.includes("/react-dom/") ||
            id.includes("/react/") ||
            id.includes("/scheduler/") ||
            id.includes("@radix-ui") ||
            id.includes("react-hook-form") ||
            id.includes("@hookform") ||
            id.includes("@tanstack/react-query") ||
            id.includes("react-router")
          ) {
            return "react-vendor";
          }
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("react-markdown") || id.includes("remark") || id.includes("micromark") || id.includes("mdast") || id.includes("hast")) {
            return "markdown";
          }
          if (id.includes("react-day-picker") || id.includes("date-fns")) return "date";
          if (id.includes("@dnd-kit")) return "dnd";
          if (id.includes("embla-carousel")) return "carousel";
          if (id.includes("html-to-image")) return "html-to-image";
          if (id.includes("lucide-react")) return "icons";
        },
      },
    },
  },
}));
