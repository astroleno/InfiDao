import { buildTextHash } from "@/lib/data/hash";

describe("buildTextHash", () => {
  it("returns a stable sha256 hash for normalized passage text", () => {
    expect(buildTextHash(" 学而时习之，不亦说乎？ ")).toBe(buildTextHash("学而时习之，不亦说乎？"));
    expect(buildTextHash("学而时习之，不亦说乎？")).toHaveLength(64);
  });

  it("changes when the passage text changes", () => {
    expect(buildTextHash("学而时习之")).not.toBe(buildTextHash("有朋自远方来"));
  });
});
