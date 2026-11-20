import { defineConfig } from "vite";
// يُبنى داخل تطبيق المهندس إسلام: ملف JS واحد بدون استيراد ديناميكي، بمسارات نسبية
export default defineConfig({
  base: "./",
  build: {
    outDir: process.env.AIA_OUT || "../app/src/main/assets/ai-architect",
    emptyOutDir: true,
    target: "es2019",
    assetsInlineLimit: 0,
    rollupOptions: { output: { entryFileNames: "app.js", assetFileNames: "app.[ext]", inlineDynamicImports: true } }
  },
  test: { globals: true, include: ["tests/**/*.test.ts"], testTimeout: 60000 }
});
