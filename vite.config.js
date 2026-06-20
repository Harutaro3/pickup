import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // /api/* → localhost:3001 に転送（React側はAPIキーを持たない）
    proxy: {
      "/api": {
        target:       "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
