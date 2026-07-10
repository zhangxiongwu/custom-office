import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@": resolve("src"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    // Dev 模式下 Vite 提供 SDK 静态文件
    publicDir: resolve(
      "src/components/onlyoffice-web-comp/public"
    ),
    resolve: {
      alias: [
        // @/components/onlyoffice-web-comp -> index.ts
        {
          find: "@/components/onlyoffice-web-comp",
          replacement: resolve(
            "src/components/onlyoffice-web-comp/src/components/onlyoffice-web-comp/index.ts"
          ),
        },
        // @ -> src/
        {
          find: "@",
          replacement: resolve("src"),
        },
      ],
    },
    build: {
      target: "esnext",
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    worker: {
      format: "es",
    },
  },
});