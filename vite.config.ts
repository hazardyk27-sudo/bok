import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: 5000,
    allowedHosts: true,
  },
  build: {
    target: "es2020",
  },
});