import {
  ANNOTATE_BODY_LIMIT_BYTES,
  checkAnnotateRequestBudget,
  resetAnnotateAbuseGuard,
} from "@/lib/annotation/abuse-guard";

describe("annotate abuse guard", () => {
  afterEach(() => {
    resetAnnotateAbuseGuard();
  });

  it("rejects oversized request bodies", () => {
    let error: unknown;

    try {
      checkAnnotateRequestBudget({
        clientKey: "local",
        bodyBytes: ANNOTATE_BODY_LIMIT_BYTES + 1,
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
    for (let index = 0; index < 20; index += 1) {
      expect(
        checkAnnotateRequestBudget({
          clientKey: "client-a",
          bodyBytes: 100,
          now: 1000,
        }),
      ).toBeUndefined();
    }

    let error: unknown;

    try {
      checkAnnotateRequestBudget({
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
