import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    tanstackStart({
      router: {
        quoteStyle: "double",
        importRoutesUsingAbsolutePaths: false,
        codeSplittingOptions: {
          defaultBehavior: [],
        },
      },
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    force: true,
  },
});
