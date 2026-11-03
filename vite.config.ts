import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Hosts allowed to load the dev server (cloud preview). Comma separated, e.g.
//   __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=abc.style.dev npm run dev
const allowedHosts = (process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts,
  },
});
