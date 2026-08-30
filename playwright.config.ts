import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL?.trim();
const baseURL = externalBaseUrl || "http://127.0.0.1:3100";
const isCI = Boolean(process.env.CI);

const deterministicServerEnv: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ),
  CUSTOM_API_KEY: "",
  DASHSCOPE_API_KEY: "",
  EMBEDDING_API_KEY: "",
  GLM_API_KEY: "",
  LLM_API_KEY: "",
  LLM_API_KEY_2: "",
  LLM_API_KEY_PRIMARY: "",
  LLM_API_KEY_SECONDARY: "",
  OPENAI_API_KEY: "",
  OPENAI_API_KEY_2: "",
  QWEN_API_KEY: "",
  SEARCH_EMBEDDING_API_KEY: "",
  SEARCH_EMBEDDING_BACKEND: "local",
  ZHIPU_API_KEY: "",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  ...(isCI ? { workers: 1 } : {}),
  timeout: 90_000,
  expect: {
    timeout: 30_000,
  },
  outputDir: "test-results",
  reporter: isCI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  use: {
    baseURL,
    contextOptions: {
      reducedMotion: "reduce",
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        browserName: "chromium",
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
          env: deterministicServerEnv,
          reuseExistingServer: false,
          timeout: 120_000,
          url: baseURL,
        },
      }),
});
