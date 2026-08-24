import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 버전을 여러 파일에 손으로 적어두면 서로 어긋난다(과거 1.0.0 / 1.3.3 / 1.3.4 / v2.0로 4중 불일치).
// package.json 을 유일 출처로 삼아 빌드 시점에 __APP_VERSION__ 으로 주입한다.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf-8"),
);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    outDir: "dist",
    target: "esnext",
    // Use terser for better obfuscation
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,      // Remove console.log
        drop_debugger: true,     // Remove debugger statements
        pure_funcs: ["console.log", "console.info", "console.debug", "console.warn"],
        passes: 2,               // Multiple compression passes
      },
      mangle: {
        toplevel: true,          // Mangle top-level names
        properties: {
          regex: /^_/,           // Mangle properties starting with _
        },
      },
      format: {
        comments: false,         // Remove all comments
      },
    },
    // Disable source maps in production
    sourcemap: false,
    // Randomize chunk names
    rollupOptions: {
      output: {
        manualChunks: undefined,
        chunkFileNames: "assets/[hash].js",
        entryFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash].[ext]",
      },
    },
  },

  // Disable source maps for CSS as well
  css: {
    devSourcemap: false,
  },
});
