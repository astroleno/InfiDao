import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { aggregateEvaluation, renderEvaluationReport, type JudgeBatch } from "./aggregate";
import {
  artifactRunDir,
  readGenerationCheckpoint,
  readRawJson,
  writeGenerationCheckpoint,
  writeRawJson,
  writeTrackedSummary,
  writeTrackedText,
  type ArtifactIdentity,
} from "./artifacts";
import { buildBlindPacket, type BlindMapping } from "./blind-packet";
import {
  EvalFixtureSchema,
  GenerationSchema,
  assertDisjointPartitions,
  assertFixtureHash,
  type EvalFixture,
  type Generation,
} from "./contract";
import { generateAnnotation, type AnnotationProviderConfig } from "./provider";
import { getPromptVariant } from "./prompt-registry";

type Partition = "dev" | "holdout" | "golden";

export type CliCommand =
  | { command: "validate" }
  | { command: "generate"; partition: Partition; variant: string; rounds: number }
  | { command: "blind"; partition: Partition; candidates: string[]; rounds: number }
  | {
      command: "aggregate";
      partition: Partition;
      target: string;
      references: string[];
      rounds: number;
      knownGoldenRegression: number;
      select: boolean;
    };

export interface GenerationPolicyInput {
  partition: Partition;
  promptFrozen: boolean;
  fixtureSealed: boolean;
  existingRows: number;
  expectedRows: number;
  checkpointMatches: boolean;
}

const FIXTURE_FILES: Record<Partition, string> = {
  dev: "dev-v2.json",
  holdout: "holdout-v2.json",
  golden: "golden-v1.json",
};

function readOptions(argv: string[]): { positionals: string[]; options: Map<string, string | true> } {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const inline = argument.match(/^--([^=]+)=(.*)$/u);
    if (inline) {
      options.set(inline[1]!, inline[2]!);
      continue;
    }
    const name = argument.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options.set(name, true);
      continue;
    }
    options.set(name, next);
    index += 1;
  }
  return { positionals, options };
}

function requiredOption(options: Map<string, string | true>, name: string): string {
  const value = options.get(name);
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing --${name}`);
  return value.trim();
}

function parsePartition(options: Map<string, string | true>): Partition {
  const value = requiredOption(options, "partition");
  if (value !== "dev" && value !== "holdout" && value !== "golden") {
    throw new Error(`invalid --partition: ${value}`);
  }
  return value;
}

function parsePositiveInteger(options: Map<string, string | true>, name: string, fallback: number): number {
  const value = options.get(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`invalid --${name}`);
  return parsed;
}

function parseList(options: Map<string, string | true>, name: string): string[] {
  const values = requiredOption(options, name)
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  if (values.length === 0 || new Set(values).size !== values.length) {
    throw new Error(`invalid --${name}`);
  }
  return values;
}

export function parseCliArgs(argv: string[]): CliCommand {
  const { positionals, options } = readOptions(argv);
  const command = positionals[0];
  if (!command) throw new Error("missing command");
  if (positionals.length > 1) throw new Error(`unexpected argument: ${positionals[1]}`);
  if (command === "validate") return { command };
  if (command === "generate") {
    return {
      command,
      partition: parsePartition(options),
      variant: requiredOption(options, "variant"),
      rounds: parsePositiveInteger(options, "rounds", 1),
    };
  }
  if (command === "blind") {
    const candidates = parseList(options, "candidates");
    if (candidates.length < 2) throw new Error("--candidates requires at least two variants");
    return {
      command,
      partition: parsePartition(options),
      candidates,
      rounds: parsePositiveInteger(options, "rounds", 1),
    };
  }
  if (command === "aggregate") {
    const regressionValue = options.get("known-golden-regression") ?? "0";
    const knownGoldenRegression = Number(regressionValue);
    if (!Number.isFinite(knownGoldenRegression)) {
      throw new Error("invalid --known-golden-regression");
    }
    return {
      command,
      partition: parsePartition(options),
      target: requiredOption(options, "target"),
      references: parseList(options, "references"),
      rounds: parsePositiveInteger(options, "rounds", 1),
      knownGoldenRegression,
      select: options.get("select") === true,
    };
  }
  throw new Error(`unknown command: ${command}`);
}

export function assertGenerationPolicy(input: GenerationPolicyInput): void {
  if (input.partition !== "holdout") return;
  if (!input.promptFrozen || !input.fixtureSealed) {
    throw new Error("holdout requires a frozen prompt and sealed fixture");
  }
  if (input.existingRows >= input.expectedRows) {
    throw new Error("holdout result already exists for this prompt hash");
  }
  if (input.existingRows > 0 && !input.checkpointMatches) {
    throw new Error("holdout checkpoint does not match the frozen run contract");
  }
}

function readFixture(root: string, partition: Partition): EvalFixture {
  const fixturePath = path.join(root, "tests", "fixtures", "annotation-eval", FIXTURE_FILES[partition]);
  const fixture = EvalFixtureSchema.parse(JSON.parse(fs.readFileSync(fixturePath, "utf8")) as unknown);
  assertFixtureHash(fixture);
  return fixture;
}

function loadProviderConfig(root: string): AnnotationProviderConfig {
  loadEnvConfig(root);
  const config = {
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "",
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    model: process.env.DEEPSEEK_MODEL ?? "",
  };
  if (!config.baseUrl.trim()) throw new Error("DEEPSEEK_BASE_URL is required");
  if (!config.apiKey.trim()) throw new Error("DEEPSEEK_API_KEY is required");
  if (config.model !== "deepseek-v4-flash") {
    throw new Error("DEEPSEEK_MODEL must equal deepseek-v4-flash");
  }
  return config;
}

function resolveVariant(root: string, requested: string) {
  if (requested !== "selected") return getPromptVariant(requested);
  const summariesRoot = path.join(root, "docs", "qa", "annotation-eval");
  if (!fs.existsSync(summariesRoot)) throw new Error("selected prompt summary not found");
  const selections = fs
    .readdirSync(summariesRoot)
    .filter(filename => filename.endsWith("-summary.json"))
    .flatMap(filename => {
      const value = JSON.parse(fs.readFileSync(path.join(summariesRoot, filename), "utf8")) as {
        partition?: unknown;
        selectedPrompt?: { id?: unknown; sha256?: unknown };
      };
      if (value.partition !== "dev" || !value.selectedPrompt) return [];
      return [value.selectedPrompt];
    });
  const unique = new Map(selections.map(selection => [`${selection.id}:${selection.sha256}`, selection]));
  if (unique.size !== 1) throw new Error("selected alias requires exactly one tracked dev selection");
  const selection = [...unique.values()][0]!;
  if (typeof selection.id !== "string" || typeof selection.sha256 !== "string") {
    throw new Error("selected prompt summary is invalid");
  }
  const prompt = getPromptVariant(selection.id);
  if (!prompt.frozen || prompt.sha256 !== selection.sha256) {
    throw new Error("selected prompt hash does not match the frozen registry");
  }
  return prompt;
}

function generationKey(row: Pick<Generation, "partition" | "variant" | "round" | "caseId">): string {
  return `${row.partition}:${row.variant}:${row.round}:${row.caseId}`;
}

function checkpointMatches(rows: Generation[], promptHash: string): boolean {
  return rows.every(
    row =>
      row.promptHash === promptHash &&
      row.model === "deepseek-v4-flash" &&
      row.thinking === "disabled" &&
      row.temperature === 0.35 &&
      row.maxTokens === 240,
  );
}

function sortGenerations(rows: Generation[]): Generation[] {
  return [...rows].sort((left, right) => generationKey(left).localeCompare(generationKey(right)));
}

async function mapConcurrent<T>(items: T[], concurrency: number, run: (item: T) => Promise<void>) {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor]!;
      cursor += 1;
      await run(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

async function runValidate(root: string): Promise<Record<string, unknown>> {
  const fixtures = (["dev", "holdout", "golden"] as const).map(partition =>
    readFixture(root, partition),
  );
  assertDisjointPartitions(fixtures);
  const config = loadProviderConfig(root);
  return {
    modelMatches: config.model === "deepseek-v4-flash",
    apiKeyPresent: Boolean(config.apiKey),
    baseUrlPresent: Boolean(config.baseUrl),
    fixtures: Object.fromEntries(
      fixtures.map(fixture => [fixture.evalId, fixture.fixtureSha256]),
    ),
  };
}

async function runGenerate(
  root: string,
  command: Extract<CliCommand, { command: "generate" }>,
): Promise<Record<string, unknown>> {
  const fixture = readFixture(root, command.partition);
  const prompt = resolveVariant(root, command.variant);
  const fixtureHash = fixture.fixtureSha256!;
  const identity: ArtifactIdentity = {
    partition: command.partition,
    variant: prompt.id,
    fixtureHash,
  };
  const rows = readGenerationCheckpoint(root, identity);
  const expectedRows = fixture.cases.length * command.rounds;
  assertGenerationPolicy({
    partition: command.partition,
    promptFrozen: prompt.frozen,
    fixtureSealed: fixture.sealed,
    existingRows: rows.length,
    expectedRows,
    checkpointMatches: checkpointMatches(rows, prompt.sha256),
  });
  if (!checkpointMatches(rows, prompt.sha256)) {
    throw new Error("generation checkpoint does not match the requested run contract");
  }
  const existingKeys = new Set(rows.map(generationKey));
  if (existingKeys.size !== rows.length) throw new Error("generation checkpoint has duplicate keys");
  const tasks = Array.from({ length: command.rounds }, (_, index) => index + 1).flatMap(round =>
    fixture.cases
      .filter(testCase => !existingKeys.has(`${command.partition}:${prompt.id}:${round}:${testCase.id}`))
      .map(testCase => ({ round, testCase })),
  );
  const config = loadProviderConfig(root);
  await mapConcurrent(tasks, 3, async task => {
    let generation: Generation;
    try {
      generation = await generateAnnotation({
        partition: command.partition,
        round: task.round,
        testCase: task.testCase,
        prompt,
        config,
      });
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).replaceAll(
        config.apiKey,
        "[REDACTED]",
      );
      generation = GenerationSchema.parse({
        partition: command.partition,
        round: task.round,
        caseId: task.testCase.id,
        variant: prompt.id,
        promptHash: prompt.sha256,
        model: config.model,
        thinking: "disabled",
        temperature: 0.35,
        maxTokens: 240,
        attempt: 3,
        valid: false,
        error: message.slice(0, 600),
      });
    }
    rows.push(generation);
    writeGenerationCheckpoint(root, identity, sortGenerations(rows));
  });
  const valid = rows.filter(row => row.valid).length;
  return {
    partition: command.partition,
    variant: prompt.id,
    promptHash: prompt.sha256,
    fixtureHash,
    expectedRows,
    totalRows: rows.length,
    validRows: valid,
    invalidRows: rows.length - valid,
    resumedRows: expectedRows - tasks.length,
    runDirectory: path.relative(root, artifactRunDir(root, identity)),
  };
}

function comparisonIdentity(
  partition: Partition,
  candidates: string[],
  fixtureHash: string,
): ArtifactIdentity {
  return { partition, variant: [...candidates].sort().join("-"), fixtureHash };
}

function runBlind(
  root: string,
  command: Extract<CliCommand, { command: "blind" }>,
): Record<string, unknown> {
  const fixture = readFixture(root, command.partition);
  const fixtureHash = fixture.fixtureSha256!;
  const candidates = command.candidates.map(candidate => resolveVariant(root, candidate).id);
  const candidateRows = Object.fromEntries(
    candidates.map(candidate => [
      candidate,
      readGenerationCheckpoint(root, { partition: command.partition, variant: candidate, fixtureHash }),
    ]),
  );
  const identity = comparisonIdentity(command.partition, candidates, fixtureHash);
  const allMappings: BlindMapping[] = [];
  for (let round = 1; round <= command.rounds; round += 1) {
    const candidateOutputs = Object.fromEntries(
      candidates.map(candidate => {
        const rows = candidateRows[candidate]!.filter(row => row.round === round);
        if (rows.length !== fixture.cases.length || rows.some(row => !row.valid || !row.output)) {
          throw new Error(`candidate round is incomplete or invalid: ${candidate}/round${round}`);
        }
        return [candidate, Object.fromEntries(rows.map(row => [row.caseId, row.output!]))];
      }),
    );
    const result = buildBlindPacket({ fixture, round, candidateOutputs });
    writeRawJson(root, identity, `blind-round${round}.json`, result.packet);
    allMappings.push(...result.mapping);
  }
  writeRawJson(root, identity, "mapping.json", allMappings);
  return {
    partition: command.partition,
    candidates,
    rounds: command.rounds,
    casesPerRound: fixture.cases.length,
    runDirectory: path.relative(root, artifactRunDir(root, identity)),
  };
}

function readJudgeBatches(root: string, identity: ArtifactIdentity, rounds: number): JudgeBatch[] {
  const runDir = artifactRunDir(root, identity);
  const files = fs.existsSync(runDir) ? fs.readdirSync(runDir) : [];
  const batches = files.flatMap(filename => {
    const match = filename.match(/^judge-([a-z0-9-]+)-round([1-9][0-9]*)\.json$/u);
    if (!match) return [];
    const round = Number(match[2]);
    if (round > rounds) return [];
    const raw = readRawJson(root, identity, filename);
    const wrapped = raw as { rows?: unknown; judgments?: unknown };
    return [{ judge: match[1]!, round, rows: Array.isArray(raw) ? raw : wrapped.rows ?? wrapped.judgments }];
  });
  if (batches.length === 0) throw new Error("no judge artifacts found for aggregation");
  return batches;
}

function runAggregate(
  root: string,
  command: Extract<CliCommand, { command: "aggregate" }>,
): Record<string, unknown> {
  const fixture = readFixture(root, command.partition);
  const fixtureHash = fixture.fixtureSha256!;
  const target = resolveVariant(root, command.target);
  const references = command.references.map(reference => resolveVariant(root, reference).id);
  const candidates = [...new Set([...references, target.id])];
  const identity = comparisonIdentity(command.partition, candidates, fixtureHash);
  const mappings = readRawJson(root, identity, "mapping.json") as BlindMapping[];
  const generations = candidates.flatMap(candidate =>
    readGenerationCheckpoint(root, { partition: command.partition, variant: candidate, fixtureHash }),
  );
  const result = aggregateEvaluation({
    evalId: fixture.evalId,
    partition: command.partition,
    promptHash: target.sha256,
    targetCandidate: target.id,
    referenceCandidates: references,
    generations,
    mappings,
    judgeBatches: readJudgeBatches(root, identity, command.rounds),
    knownGoldenRegression: command.knownGoldenRegression,
  });
  writeRawJson(root, identity, "aggregate.json", result);
  const summary = command.select
    ? { ...result, selectedPrompt: { id: target.id, sha256: target.sha256 } }
    : result;
  const baseName = `deepseek-v4-flash-${target.id}`;
  const config = loadProviderConfig(root);
  writeTrackedSummary(
    root,
    `docs/qa/annotation-eval/${baseName}-summary.json`,
    summary,
    [config.apiKey],
  );
  writeTrackedText(
    root,
    `docs/qa/annotation-eval/${baseName}-report.md`,
    renderEvaluationReport(result),
    [config.apiKey],
  );
  return {
    partition: command.partition,
    target: target.id,
    promptHash: target.sha256,
    promotionPassed: result.promotionPassed,
    summary: `docs/qa/annotation-eval/${baseName}-summary.json`,
    report: `docs/qa/annotation-eval/${baseName}-report.md`,
  };
}

async function main(): Promise<void> {
  const root = process.cwd();
  const command = parseCliArgs(process.argv.slice(2));
  const result =
    command.command === "validate"
      ? await runValidate(root)
      : command.command === "generate"
        ? await runGenerate(root, command)
        : command.command === "blind"
          ? runBlind(root, command)
          : runAggregate(root, command);
  console.log(JSON.stringify(result, null, 2));
  if (command.command === "generate" && Number(result.invalidRows) > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
