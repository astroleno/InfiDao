import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { AnnotationOutputSchema, type AnnotationOutput, type EvalFixture } from "./contract";
import {
  readRawJson,
  resolveRawArtifactPath,
  writeRawJson,
  type ArtifactIdentity,
} from "./artifacts";

const NonEmptyString = z.string().trim().min(1);
const NullableMetric = z.number().finite().nonnegative().nullable();

export const REFERENCE_CANDIDATES = Object.freeze([
  { id: "codex-luna-max", provider: "codex", model: "gpt-5.6-luna", effort: "max" },
  { id: "codex-terra-max", provider: "codex", model: "gpt-5.6-terra", effort: "max" },
  { id: "codex-sol-xhigh", provider: "codex", model: "gpt-5.6-sol", effort: "xhigh" },
  { id: "codex-sol-max", provider: "codex", model: "gpt-5.6-sol", effort: "max" },
  {
    id: "kimi-for-coding",
    provider: "Kimi For Coding",
    model: "kimi-for-coding",
    effort: "provider-default",
  },
  { id: "kimi-k3", provider: "Kimi For Coding", model: "k3", effort: "max" },
] as const);

export type ReferenceCandidate = (typeof REFERENCE_CANDIDATES)[number];

export const ReferenceMetricsSchema = z
  .object({
    totalMs: z.number().finite().nonnegative(),
    firstEventMs: NullableMetric.optional(),
    firstContentMs: NullableMetric.optional(),
    promptTokens: NullableMetric.optional(),
    completionTokens: NullableMetric.optional(),
    reasoningTokens: NullableMetric.optional(),
    totalTokens: NullableMetric.optional(),
  })
  .strict();

export const ReferenceGenerationSchema = z
  .object({
    partition: z.enum(["dev", "holdout", "golden"]),
    round: z.number().int().positive(),
    caseId: NonEmptyString,
    candidate: NonEmptyString,
    model: NonEmptyString,
    effort: NonEmptyString,
    valid: z.boolean(),
    attempt: z.number().int().min(1).max(3).default(1),
    output: AnnotationOutputSchema.optional(),
    metrics: ReferenceMetricsSchema.optional(),
    error: NonEmptyString.optional(),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.valid && (!row.output || !row.metrics)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "valid reference requires output and metrics",
      });
    }
    if (!row.valid && !row.error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "invalid reference requires error",
      });
    }
  });

export type ReferenceGeneration = z.infer<typeof ReferenceGenerationSchema>;

const ReferenceBatchSchema = z
  .object({
    outputs: z.array(
      z
        .object({
          caseId: NonEmptyString,
          sixToMe: NonEmptyString,
          meToSix: NonEmptyString,
        })
        .strict(),
    ),
  })
  .strict();

const GENERATOR_SYSTEM = [
  "你是古典文本双向注释生成器，只根据给定原文和现代问题作答。",
  "sixToMe 从原文可支持的最小义理出发，直接回应现代问题的张力，并给出相关、可观察的判断依据。",
  "meToSix 从现代处境返回原文，增加一个真正相关的机制、条件或边界，并解释它如何补充或限制对原文的理解；不得重复前向建议。",
  "忠于原文，不虚构史实、动机、因果、现代术语来源或无依据数值，不把有条件解释写成唯一原意。",
  "每个字段两到三句，简体中文，不输出 Markdown 或字段外说明。",
].join("\n");

function safeCases(fixture: EvalFixture) {
  return fixture.cases.map(testCase => ({
    caseId: testCase.id,
    scenario: testCase.scenario,
    query: testCase.query,
    source: testCase.source,
    passage: testCase.passage,
    style: testCase.style,
  }));
}

export function buildReferenceBatchPrompt(fixture: EvalFixture): string {
  return [
    GENERATOR_SYSTEM,
    '对下列每个案例分别生成答案。只返回一个 JSON 对象，格式为 {"outputs":[{"caseId":"...","sixToMe":"...","meToSix":"..."}]}。不得遗漏、增加或重复 caseId。',
    JSON.stringify(safeCases(fixture)),
  ].join("\n\n");
}

export function buildReferenceUserPrompt(fixture: EvalFixture, caseId: string): string {
  const testCase = safeCases(fixture).find(item => item.caseId === caseId);
  if (!testCase) throw new Error(`unknown reference case: ${caseId}`);
  return [
    JSON.stringify(testCase),
    "只返回一个 JSON 对象，且只含 sixToMe 与 meToSix 两个字符串字段。",
  ].join("\n\n");
}

export function parseReferenceBatch(
  value: unknown,
  fixture: EvalFixture,
): Array<{ caseId: string; output: AnnotationOutput }> {
  const batch = ReferenceBatchSchema.parse(value);
  const byId = new Map<string, AnnotationOutput>();
  for (const row of batch.outputs) {
    if (byId.has(row.caseId)) throw new Error(`duplicate reference case: ${row.caseId}`);
    byId.set(
      row.caseId,
      AnnotationOutputSchema.parse({ sixToMe: row.sixToMe, meToSix: row.meToSix }),
    );
  }
  const expectedIds = fixture.cases.map(testCase => testCase.id).sort();
  const actualIds = [...byId.keys()].sort();
  if (expectedIds.join("\n") !== actualIds.join("\n")) {
    throw new Error("reference batch case coverage mismatch");
  }
  return fixture.cases.map(testCase => ({ caseId: testCase.id, output: byId.get(testCase.id)! }));
}

function parseOutputText(value: string): unknown {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/u)?.[1]?.trim() ?? trimmed;
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("response contains no JSON object");
    return JSON.parse(fenced.slice(start, end + 1)) as unknown;
  }
}

function referenceIdentity(fixture: EvalFixture): ArtifactIdentity {
  assert(fixture.fixtureSha256, "reference fixture hash is required");
  return {
    partition: fixture.partition,
    variant: "references",
    fixtureHash: fixture.fixtureSha256,
  };
}

export function readReferenceCheckpoint(root: string, fixture: EvalFixture): ReferenceGeneration[] {
  const identity = referenceIdentity(fixture);
  const checkpoint = resolveRawArtifactPath(root, identity, "references.json");
  if (!fs.existsSync(checkpoint)) return [];
  const raw = readRawJson(root, identity, "references.json");
  if (!Array.isArray(raw)) throw new Error("reference checkpoint must be an array");
  return raw.map(row => ReferenceGenerationSchema.parse(row));
}

function writeReferenceCheckpoint(
  root: string,
  fixture: EvalFixture,
  rows: ReferenceGeneration[],
): void {
  const sorted = [...rows].sort(
    (left, right) =>
      left.round - right.round ||
      left.caseId.localeCompare(right.caseId) ||
      left.candidate.localeCompare(right.candidate),
  );
  writeRawJson(
    root,
    referenceIdentity(fixture),
    "references.json",
    sorted.map(row => ReferenceGenerationSchema.parse(row)),
  );
}

function rowKey(row: Pick<ReferenceGeneration, "round" | "caseId" | "candidate">): string {
  return `${row.round}:${row.caseId}:${row.candidate}`;
}

function redactedError(error: unknown, secret = ""): string {
  const message = String(error instanceof Error ? error.message : error);
  return (secret ? message.replaceAll(secret, "[REDACTED]") : message).slice(0, 800);
}

function execFileClosed(
  command: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, options, error => {
      if (error) reject(error);
      else resolve();
    });
    child.stdin?.end();
  });
}

async function generateCodexBatch(
  root: string,
  fixture: EvalFixture,
  candidate: ReferenceCandidate,
  round: number,
  caseIds: string[],
): Promise<ReferenceGeneration[]> {
  const selectedFixture: EvalFixture = {
    ...fixture,
    cases: fixture.cases.filter(testCase => caseIds.includes(testCase.id)),
  };
  assert.equal(selectedFixture.cases.length, caseIds.length, "codex batch case selection mismatch");
  const batchId = selectedFixture.cases.map(testCase => testCase.id.split("-").at(-1)).join("-");
  const identity = referenceIdentity(fixture);
  const outputPath = resolveRawArtifactPath(
    root,
    identity,
    `${candidate.id}-round${round}-${batchId}-last-message.json`,
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const schemaPath = path.join(root, "scripts", "annotation-eval", "reference-output-schema.json");
  const started = performance.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await execFileClosed(
        "codex",
        [
          "exec",
          "--ephemeral",
          "--ignore-user-config",
          "--ignore-rules",
          "--skip-git-repo-check",
          "--disable",
          "plugins",
          "--disable",
          "apps",
          "--disable",
          "remote_plugin",
          "--disable",
          "plugin_sharing",
          "--sandbox",
          "read-only",
          "--cd",
          root,
          "--model",
          candidate.model,
          "--config",
          `model_reasoning_effort=\"${candidate.effort}\"`,
          "--config",
          "skills.include_instructions=false",
          "--config",
          "skills.bundled.enabled=false",
          "--output-schema",
          schemaPath,
          "--output-last-message",
          outputPath,
          [
            "你是被派发来完成单一、封闭生成任务的子 agent；不要读取技能、文件或调用工具，直接生成最终 JSON。",
            buildReferenceBatchPrompt(selectedFixture),
          ].join("\n\n"),
        ],
        { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      );
      const parsed = parseReferenceBatch(
        parseOutputText(fs.readFileSync(outputPath, "utf8")),
        selectedFixture,
      );
      const totalMs = performance.now() - started;
      return parsed.map(row =>
        ReferenceGenerationSchema.parse({
          partition: fixture.partition,
          round,
          caseId: row.caseId,
          candidate: candidate.id,
          model: candidate.model,
          effort: candidate.effort,
          attempt,
          valid: true,
          output: row.output,
          metrics: { totalMs },
        }),
      );
    } catch (error) {
      lastError = error;
    }
  }
  return selectedFixture.cases.map(testCase =>
    ReferenceGenerationSchema.parse({
      partition: fixture.partition,
      round,
      caseId: testCase.id,
      candidate: candidate.id,
      model: candidate.model,
      effort: candidate.effort,
      attempt: 3,
      valid: false,
      error: redactedError(lastError),
    }),
  );
}

interface CcSwitchProvider {
  baseUrl: string;
  token: string;
}

function loadCcSwitchProvider(name: string): CcSwitchProvider {
  const databasePath =
    process.env.CC_SWITCH_DB_PATH ?? path.join(os.homedir(), ".cc-switch", "cc-switch.db");
  const query = `
    SELECT
      json_extract(settings_config, '$.env.ANTHROPIC_BASE_URL') AS baseUrl,
      json_extract(settings_config, '$.env.ANTHROPIC_AUTH_TOKEN') AS token
    FROM providers
    WHERE app_type = 'claude' AND name = ${JSON.stringify(name)}
    LIMIT 1;
  `;
  const rows = JSON.parse(
    execFileSync("sqlite3", ["-json", databasePath, query], { encoding: "utf8" }),
  ) as Array<{ baseUrl?: unknown; token?: unknown }>;
  const row = rows[0];
  if (!row || typeof row.baseUrl !== "string" || typeof row.token !== "string") {
    throw new Error(`cc-switch provider unavailable: ${name}`);
  }
  return { baseUrl: row.baseUrl, token: row.token };
}

function endpoint(baseUrl: string, relative: string): string {
  return new URL(relative, `${baseUrl.replace(/\/?$/u, "/")}`).href;
}

async function invokeKimi(
  candidate: ReferenceCandidate,
  prompt: string,
  provider: CcSwitchProvider,
): Promise<{ output: AnnotationOutput; metrics: z.infer<typeof ReferenceMetricsSchema> }> {
  const started = performance.now();
  const isK3 = candidate.model === "k3";
  const response = await fetch(
    endpoint(provider.baseUrl, isK3 ? "v1/chat/completions" : "v1/messages"),
    {
      method: "POST",
      headers: isK3
        ? { "content-type": "application/json", authorization: `Bearer ${provider.token}` }
        : {
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": provider.token,
          },
      body: JSON.stringify(
        isK3
          ? {
              model: candidate.model,
              max_tokens: 4096,
              reasoning_effort: "max",
              stream: true,
              stream_options: { include_usage: true },
              messages: [
                { role: "system", content: GENERATOR_SYSTEM },
                { role: "user", content: prompt },
              ],
            }
          : {
              model: candidate.model,
              max_tokens: 1400,
              stream: true,
              system: GENERATOR_SYSTEM,
              messages: [{ role: "user", content: prompt }],
            },
      ),
      signal: AbortSignal.timeout(180_000),
    },
  );
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 600)}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let firstEventMs: number | null = null;
  let firstContentMs: number | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let reasoningTokens: number | null = null;
  let totalTokens: number | null = null;
  const handle = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const raw = trimmed.slice(5).trim();
    if (!raw || raw === "[DONE]") return;
    const event = JSON.parse(raw) as Record<string, any>;
    firstEventMs ??= performance.now() - started;
    if (isK3) {
      const delta = event.choices?.[0]?.delta?.content ?? "";
      if (delta) firstContentMs ??= performance.now() - started;
      content += delta;
      promptTokens = event.usage?.prompt_tokens ?? promptTokens;
      completionTokens = event.usage?.completion_tokens ?? completionTokens;
      reasoningTokens = event.usage?.completion_tokens_details?.reasoning_tokens ?? reasoningTokens;
      totalTokens = event.usage?.total_tokens ?? totalTokens;
    } else {
      const delta = event.type === "content_block_delta" ? (event.delta?.text ?? "") : "";
      if (delta) firstContentMs ??= performance.now() - started;
      content += delta;
      promptTokens = event.message?.usage?.input_tokens ?? promptTokens;
      completionTokens = event.usage?.output_tokens ?? completionTokens;
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  buffer += decoder.decode();
  if (buffer) buffer.split(/\r?\n/u).forEach(handle);
  const output = AnnotationOutputSchema.parse(parseOutputText(content));
  return {
    output,
    metrics: ReferenceMetricsSchema.parse({
      totalMs: performance.now() - started,
      firstEventMs,
      firstContentMs,
      promptTokens,
      completionTokens,
      reasoningTokens,
      totalTokens:
        totalTokens ??
        (promptTokens === null || completionTokens === null
          ? null
          : promptTokens + completionTokens),
    }),
  };
}

async function generateKimiRow(
  fixture: EvalFixture,
  candidate: ReferenceCandidate,
  round: number,
  caseId: string,
  provider: CcSwitchProvider,
): Promise<ReferenceGeneration> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await invokeKimi(
        candidate,
        buildReferenceUserPrompt(fixture, caseId),
        provider,
      );
      return ReferenceGenerationSchema.parse({
        partition: fixture.partition,
        round,
        caseId,
        candidate: candidate.id,
        model: candidate.model,
        effort: candidate.effort,
        attempt,
        valid: true,
        ...result,
      });
    } catch (error) {
      lastError = error;
    }
  }
  return ReferenceGenerationSchema.parse({
    partition: fixture.partition,
    round,
    caseId,
    candidate: candidate.id,
    model: candidate.model,
    effort: candidate.effort,
    attempt: 3,
    valid: false,
    error: redactedError(lastError, provider.token),
  });
}

async function concurrentMap<T>(items: T[], limit: number, mapper: (item: T) => Promise<void>) {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor]!;
      cursor += 1;
      await mapper(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

export async function generateReferences(
  root: string,
  fixture: EvalFixture,
  rounds: number,
  candidates: readonly ReferenceCandidate[] = REFERENCE_CANDIDATES,
): Promise<ReferenceGeneration[]> {
  if (!fixture.sealed) throw new Error("reference generation requires a sealed fixture");
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error("reference rounds must be positive");
  const rows = readReferenceCheckpoint(root, fixture);
  const byKey = new Map(rows.map(row => [rowKey(row), row]));
  const candidateIds = new Set(candidates.map(candidate => candidate.id));
  if (candidateIds.size !== candidates.length) {
    throw new Error("reference candidates must be unique");
  }
  const codexCandidates = candidates.filter(candidate => candidate.provider === "codex");
  const caseBatches = fixture.cases.map(testCase => [testCase.id]);
  const codexJobs = Array.from({ length: rounds }, (_, index) => index + 1).flatMap(round =>
    codexCandidates.flatMap(candidate =>
      caseBatches
        .filter(caseIds =>
          caseIds.some(caseId => !byKey.get(`${round}:${caseId}:${candidate.id}`)?.valid),
        )
        .map(caseIds => ({ round, candidate, caseIds })),
    ),
  );
  await concurrentMap(codexJobs, 3, async job => {
    const batch = await generateCodexBatch(root, fixture, job.candidate, job.round, job.caseIds);
    for (const row of batch) byKey.set(rowKey(row), row);
    writeReferenceCheckpoint(root, fixture, [...byKey.values()]);
  });

  const kimiCandidates = candidates.filter(candidate => candidate.provider !== "codex");
  const providers = new Map<string, CcSwitchProvider>();
  const kimiJobs = Array.from({ length: rounds }, (_, index) => index + 1).flatMap(round =>
    fixture.cases.flatMap(testCase =>
      kimiCandidates
        .filter(candidate => !byKey.get(`${round}:${testCase.id}:${candidate.id}`)?.valid)
        .map(candidate => ({ round, caseId: testCase.id, candidate })),
    ),
  );
  await concurrentMap(kimiJobs, 2, async job => {
    let provider = providers.get(job.candidate.provider);
    if (!provider) {
      provider = loadCcSwitchProvider(job.candidate.provider);
      providers.set(job.candidate.provider, provider);
    }
    const row = await generateKimiRow(fixture, job.candidate, job.round, job.caseId, provider);
    byKey.set(rowKey(row), row);
    writeReferenceCheckpoint(root, fixture, [...byKey.values()]);
  });
  const finalRows = [...byKey.values()];
  writeReferenceCheckpoint(root, fixture, finalRows);
  return finalRows;
}
