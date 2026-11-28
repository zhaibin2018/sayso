import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { renderEntryBeta } from "./scripts/entry-beta.mjs";

function entryBeta() {
  let configPath;
  return {
    name: "sayso-entry-beta",
    configResolved(config) {
      configPath = resolve(config.publicDir, "site-config.json");
    },
    async transformIndexHtml(html) {
      const config = JSON.parse(await readFile(configPath, "utf8"));
      return renderEntryBeta(html, config);
    },
  };
}

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), entryBeta()],
});
