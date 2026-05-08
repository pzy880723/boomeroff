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
  build: {
    // 把大的第三方依赖拆成独立 chunk，便于浏览器长效缓存
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) {
            return "react-vendor";
          }
          if (id.includes("@radix-ui")) return "radix";
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
