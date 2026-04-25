import { DEFAULT_SEARCH_THRESHOLD, DEFAULT_SEARCH_TOP_K, type SearchRequest } from "@/types";

describe("tooling baseline", () => {
  it("resolves @ aliases into src files", () => {
    const request: SearchRequest = {
      query: "如何面对困境",
      topK: DEFAULT_SEARCH_TOP_K,
      threshold: DEFAULT_SEARCH_THRESHOLD,
    };

    expect(request).toEqual({
      query: "如何面对困境",
      topK: 5,
      threshold: 0.7,
    });
  });
});
