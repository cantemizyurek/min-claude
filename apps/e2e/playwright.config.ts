import { defineConfig } from "@playwright/test";

const API_PORT = 3001;
const WEB_PORT = 3000;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],

  webServer: [
    {
      command: `MOCK_AGENT=true bun run --hot src/index.ts`,
      cwd: "../api",
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      env: {
        MOCK_AGENT: "true",
        PORT: String(API_PORT),
      },
    },
    {
      command: "bun run dev",
      cwd: "../web",
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
