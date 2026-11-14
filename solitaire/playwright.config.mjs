// Browser tests (e2e/*.spec.mjs) in headless Chromium, Firefox and a phone-sized touch Chromium.
// The page imports ../shared/cohesion.*, so the server's root is sketches/, one folder up.
// Run: npm run test:e2e   (logic tests: npm run test:unit; both: npm test)
import { defineConfig, devices } from "@playwright/test";

const PORT = 8979;
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}/solitaire/` },
  projects: [
    // muted: the game plays sound effects, and headless browsers still play them out loud
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1100, height: 800 }, launchOptions: { args: ["--mute-audio"] } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1100, height: 800 }, launchOptions: { firefoxUserPrefs: { "media.volume_scale": "0.0" } } } },
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, launchOptions: { args: ["--mute-audio"] } } },
  ],
  webServer: {
    command: `python3 e2e/serve.py ${PORT} ..`,
    url: `http://localhost:${PORT}/solitaire/index.html`,
    reuseExistingServer: false, // a stray server on this port would get tested instead
    stderr: "ignore",
  },
});
