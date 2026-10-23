import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Expose on the LAN so the second player can join from another device.
    host: true,
  },
});
