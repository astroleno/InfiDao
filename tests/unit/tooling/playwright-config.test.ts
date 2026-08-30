/** @jest-environment node */

describe("Playwright local server contract", () => {
  const originalBaseUrl = process.env.E2E_BASE_URL;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.E2E_BASE_URL;
    } else {
      process.env.E2E_BASE_URL = originalBaseUrl;
    }
    jest.resetModules();
  });

  it("never reuses an existing local server", async () => {
    delete process.env.E2E_BASE_URL;
    jest.resetModules();

    const { default: config } = await import("../../../playwright.config");

    expect(config.webServer).toEqual(
      expect.objectContaining({
        reuseExistingServer: false,
      }),
    );
  });
});
