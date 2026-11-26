import { nexoChatLanOriginPlugin } from "./vite-plugins/nexoChatLanOriginPlugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { dynamicXmlPlugin } from "./vite-plugins/dynamicXmlPlugin";
import { logoTransformPlugin } from "./vite-plugins/logoTransformPlugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    hmr: {
      overlay: false,
    },
  },
  plugins: [nexoChatLanOriginPlugin(), react(), dynamicXmlPlugin(), logoTransformPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
  optimizeDeps: {
    include: ["@tanstack/react-query", "react", "react-dom", "react-router-dom", "emoji-picker-react"],
  },
  build: {
    target: "chrome86",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ["@supabase/supabase-js"],
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          charts: ["recharts"],
          pdf: ["jspdf", "html2canvas-pro"],
          xlsx: ["xlsx"],
          hls: ["hls.js"],
          ffmpeg: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
          emoji: ["emoji-picker-react"],
          radix: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-toast",
          ],
        },
      },
    },
  },
}));
