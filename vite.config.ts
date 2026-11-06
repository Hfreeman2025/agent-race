import { defineConfig } from "vite";

export default defineConfig({
  // Same-origin fonts need one cache variant: WebKit omits Origin on CSS font requests.
  preview: { cors: false },
});
