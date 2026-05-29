import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import monacoEditor from "vite-plugin-monaco-editor";

const monacoEditorPlugin = monacoEditor({
  languageWorkers: ["editorWorkerService", "typescript", "json", "html", "css"],
  customDistPath: (root: string) => `${root}/dist/monaco`,
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), monacoEditorPlugin],
  root: ".",
  base: mode === "web" ? "/" : "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer"),
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [".."],
    },
  },
}));
