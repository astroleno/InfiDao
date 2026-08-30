import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  artifactRunDir,
  readGenerationCheckpoint,
  resolveRawArtifactPath,
  writeGenerationCheckpoint,
  writeTrackedSummary,
} from "../../../scripts/annotation-eval/artifacts";

describe("annotation eval artifacts", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "infidao-annotation-eval-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("derives raw run directories from validated identity fields", () => {
    expect(
      artifactRunDir(root, {
        partition: "dev",
        variant: "v4",
        fixtureHash: "a".repeat(64),
      }),
    ).toBe(path.join(root, "artifacts/annotation-eval/dev-v4-aaaaaaaaaaaa"));
  });

  it("rejects traversal in identity and filenames", () => {
    expect(() =>
      artifactRunDir(root, {
        partition: "dev",
        variant: "../v4",
        fixtureHash: "a".repeat(64),
      }),
    ).toThrow("invalid artifact identity");
    expect(() =>
      resolveRawArtifactPath(
        root,
        { partition: "dev", variant: "v4", fixtureHash: "a".repeat(64) },
        "../mapping.json",
      ),
    ).toThrow("invalid artifact filename");
  });

  it("writes tracked summaries only below docs/qa/annotation-eval", () => {
    expect(() =>
      writeTrackedSummary(root, "docs/other/result.json", { safe: true }, []),
    ).toThrow("tracked summary path");

    writeTrackedSummary(
      root,
      "docs/qa/annotation-eval/result.json",
      { safe: true },
      [],
    );
    expect(
      JSON.parse(
        fs.readFileSync(path.join(root, "docs/qa/annotation-eval/result.json"), "utf8"),
      ),
    ).toEqual({ safe: true });
  });

  it("refuses to persist a tracked summary containing a loaded secret", () => {
    expect(() =>
      writeTrackedSummary(
        root,
        "docs/qa/annotation-eval/result.json",
        { error: "leaked secret-test-key" },
        ["secret-test-key"],
      ),
    ).toThrow("tracked summary contains a secret");
  });

  it("round-trips validated generation checkpoints", () => {
    const identity = { partition: "dev" as const, variant: "v4", fixtureHash: "a".repeat(64) };
    const generation = {
      partition: "dev" as const,
      round: 1,
      caseId: "dev-1",
      variant: "v4",
      promptHash: "b".repeat(64),
      model: "deepseek-v4-flash",
      thinking: "disabled" as const,
      temperature: 0.35,
      maxTokens: 240,
      attempt: 1,
      valid: true,
      output: { sixToMe: "前向", meToSix: "反向" },
      metrics: {
        headersMs: 10,
        firstEventMs: 11,
        firstReasoningMs: null,
        firstContentMs: 20,
        totalMs: 100,
        finishReason: "stop",
        reasoningCharacters: 0,
        promptTokens: 100,
        completionTokens: 50,
        reasoningTokens: 0,
        totalTokens: 150,
        cachedPromptTokens: 0,
        cost: null,
      },
    };

    expect(readGenerationCheckpoint(root, identity)).toEqual([]);
    writeGenerationCheckpoint(root, identity, [generation]);
    expect(readGenerationCheckpoint(root, identity)).toEqual([generation]);
  });
});
