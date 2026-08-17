import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // amazon-cognito-identity-js が Node 由来の global を参照するため
  define: { global: "globalThis" },
  build: {
    outDir: "dist",
    // 管理画面用 CloudFront から配信する静的ファイル
    assetsDir: "assets",
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
