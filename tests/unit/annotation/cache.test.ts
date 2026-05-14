import {
  buildAnnotationCacheKey,
  getAnnotationCacheSize,
  getCachedAnnotation,
  resetAnnotationCache,
  setCachedAnnotation,
} from "@/lib/annotation/cache";
import type { CachedAnnotationCopy } from "@/lib/annotation/cache";

describe("annotation cache", () => {
  const originalEnv = { ...process.env };

  const annotation: CachedAnnotationCopy = {
    passageId: "lunyu-1-1",
    passageText: "学而时习之，不亦说乎？",
    sixToMe: "经典回应",
    meToSix: "当代反观",
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ANNOTATION_CACHE_TTL_MS;
    delete process.env.ANNOTATION_CACHE_MAX_ENTRIES;
    resetAnnotationCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetAnnotationCache();
  });

  it("keys entries by query, passage, style, and mode", () => {
    const fastKey = buildAnnotationCacheKey({
      query: " 如何面对困境 ",
      passageId: "lunyu-1-1",
      passageText: "学而时习之，不亦说乎？",
      style: "modern",
      mode: "fast",
    });
    const qualityKey = buildAnnotationCacheKey({
      query: "如何面对困境",
      passageId: "lunyu-1-1",
      passageText: "学而时习之，不亦说乎？",
      style: "modern",
      mode: "quality",
    });

    expect(fastKey).toContain("如何面对困境");
    expect(fastKey).toContain("lunyu-1-1");
    expect(fastKey).toContain("modern");
    expect(fastKey).toContain("fast");
    expect(qualityKey).toContain("quality");
    expect(qualityKey).not.toBe(fastKey);
  });

  it("keys cached copy independently from visited link paths", () => {
    const noVisitedKey = buildAnnotationCacheKey({
      query: "如何面对困境",
      passageId: "lunyu-1-1",
      passageText: "学而时习之，不亦说乎？",
      style: "modern",
      mode: "fast",
    });
    const visitedKey = buildAnnotationCacheKey({
      query: "如何面对困境",
      passageId: "lunyu-1-1",
      passageText: "学而时习之，不亦说乎？",
      style: "modern",
      mode: "fast",
      visitedPassageIds: [" lunyu-1-2 ", "lunyu-1-8", "lunyu-1-2"],
    });
    const reorderedVisitedKey = buildAnnotationCacheKey({
      query: "如何面对困境",
      passageId: "lunyu-1-1",
      passageText: "学而时习之，不亦说乎？",
      style: "modern",
      mode: "fast",
      visitedPassageIds: ["lunyu-1-8", "lunyu-1-2"],
    });

    expect(visitedKey).toBe(noVisitedKey);
    expect(visitedKey).toBe(reorderedVisitedKey);
    expect(visitedKey).not.toContain("lunyu-1-8");
  });

  it("returns defensive copies and expires old entries", () => {
    const key = "annotation:test";

    process.env.ANNOTATION_CACHE_TTL_MS = "100";
    setCachedAnnotation(key, annotation, 1000);

    const cached = getCachedAnnotation(key, 1050);
    expect(cached).toEqual(annotation);

    if (!cached) {
      throw new Error("Expected cached annotation.");
    }

    cached.sixToMe = "mutated";
    expect(getCachedAnnotation(key, 1060)?.sixToMe).toBe("经典回应");
    expect(getCachedAnnotation(key, 1200)).toBeNull();
  });

  it("evicts the least recently used entry when full", () => {
    process.env.ANNOTATION_CACHE_MAX_ENTRIES = "1";

    setCachedAnnotation("first", annotation, 1000);
    setCachedAnnotation("second", { ...annotation, passageId: "lunyu-1-2" }, 1000);

    expect(getAnnotationCacheSize()).toBe(1);
    expect(getCachedAnnotation("first", 1000)).toBeNull();
    expect(getCachedAnnotation("second", 1000)?.passageId).toBe("lunyu-1-2");
  });
});
