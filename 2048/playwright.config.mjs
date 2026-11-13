// Browser tests (e2e/*.spec.mjs) in headless Chromium and Firefox. The page imports
// ../shared/cohesion.*, so the server's root is sketches/, one folder up.
// Run: npm run test:e2e   (logic tests: npm run test:unit; both: npm test)
import { defineConfig, devices } from "@playwright/test";

const PORT = 8977;
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}/2048/` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1100, height: 800 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1100, height: 800 } } },
  ],
  webServer: {
    command: `python3 e2e/serve.py ${PORT} ..`,
    url: `http://localhost:${PORT}/2048/index.html`,
    reuseExistingServer: false, // a stray server on this port would get tested instead
    stderr: "ignore",
  },
});
