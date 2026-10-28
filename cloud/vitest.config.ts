import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "lib/**/*.test.ts"],
    alias: {
      "cloudflare:workers": fileURLToPath(
        new URL("./lib/test-cloudflare.ts", import.meta.url),
      ),
    },
  },
});
