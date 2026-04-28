import { checkSearchRequestBudget, resetSearchAbuseGuard, SEARCH_BODY_LIMIT_BYTES } from "@/lib/search/abuse-guard";

describe("search abuse guard", () => {
  afterEach(() => {
    resetSearchAbuseGuard();
  });

  it("rejects oversized request bodies", () => {
    let error: unknown;

    try {
      checkSearchRequestBudget({
        clientKey: "local",
        bodyBytes: SEARCH_BODY_LIMIT_BYTES + 1,
        now: 1000,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "REQUEST_TOO_LARGE",
      status: 413,
    });
  });

  it("rate limits repeated requests from the same client", () => {
    for (let index = 0; index < 30; index += 1) {
      expect(
        checkSearchRequestBudget({
          clientKey: "client-a",
          bodyBytes: 100,
          now: 1000,
        }),
      ).toBeUndefined();
    }

    let error: unknown;

    try {
      checkSearchRequestBudget({
        clientKey: "client-a",
        bodyBytes: 100,
        now: 1000,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });
});
