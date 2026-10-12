import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React app lives in client/ and builds into dist/, which the Node server serves.
export default defineConfig({
  root: "client",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
});
