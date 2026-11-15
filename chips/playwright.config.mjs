// Browser tests (e2e/*.spec.mjs). Every page in a test shares one browser context and talks over a
// BroadcastChannel (?net=local) instead of WebRTC, with ?ns= keeping each "device"'s storage apart.
// The page imports ../shared/cohesion.*, so the server's root is sketches/, one folder up.
// Run: npm run test:e2e   (rules: npm run test:unit; both: npm test)
import { defineConfig, devices } from "@playwright/test";

const PORT = 8982;
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}/chips/` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1100, height: 800 } } },
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: `python3 e2e/serve.py ${PORT} ..`,
    url: `http://localhost:${PORT}/chips/index.html`,
    reuseExistingServer: false,
    stderr: "ignore",
  },
});
