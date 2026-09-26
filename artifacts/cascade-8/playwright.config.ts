import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const chromiumPath = "/repl/tools/bin/chromium";
const hasWorkspaceChromium = fs.existsSync(chromiumPath);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "PORT=4173 BASE_PATH=/ pnpm run dev",
    url: "http://127.0.0.1:4173/roulette",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "android-chrome",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 915, height: 412 },
        screen: { width: 915, height: 412 },
        ...(hasWorkspaceChromium ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    {
      name: "android-portrait",
      testMatch: /cadi-kazan\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 412, height: 915 },
        screen: { width: 412, height: 915 },
        ...(hasWorkspaceChromium ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    {
      name: "android-small-portrait",
      testMatch: /cadi-kazan\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 640 },
        screen: { width: 360, height: 640 },
        ...(hasWorkspaceChromium ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    {
      name: "android-medium-portrait",
      testMatch: /cadi-kazan\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        ...(hasWorkspaceChromium ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    {
      name: "android-large-portrait",
      testMatch: /cadi-kazan\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 430, height: 932 },
        screen: { width: 430, height: 932 },
        ...(hasWorkspaceChromium ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    {
      name: "android-narrow-portrait",
      testMatch: /cadi-kazan\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 320, height: 568 },
        screen: { width: 320, height: 568 },
        ...(hasWorkspaceChromium ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    {
      name: "desktop-chromium",
      testMatch: /cadi-kazan\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        ...(hasWorkspaceChromium ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    ...(process.env.ROULETTE_IOS === "1"
      ? [{
          name: "ios-safari",
          use: { ...devices["iPhone 13"] },
        }]
      : []),
  ],
  outputDir: path.join("test-results", "mobile"),
});