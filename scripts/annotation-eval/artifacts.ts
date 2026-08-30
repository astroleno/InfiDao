import fs from "node:fs";
import path from "node:path";
import { GenerationSchema, type Generation } from "./contract";

export interface ArtifactIdentity {
  partition: "dev" | "holdout" | "golden";
  variant: string;
  fixtureHash: string;
}

const SAFE_VARIANT = /^[a-z0-9][a-z0-9-]*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_FILENAME = /^[a-z0-9][a-z0-9._-]*$/u;

export function artifactRunDir(root: string, identity: ArtifactIdentity): string {
  if (!SAFE_VARIANT.test(identity.variant) || !SHA256.test(identity.fixtureHash)) {
    throw new Error("invalid artifact identity");
  }
  return path.join(
    path.resolve(root),
    "artifacts",
    "annotation-eval",
    `${identity.partition}-${identity.variant}-${identity.fixtureHash.slice(0, 12)}`,
  );
}

export function resolveRawArtifactPath(
  root: string,
  identity: ArtifactIdentity,
  filename: string,
): string {
  if (!SAFE_FILENAME.test(filename) || path.basename(filename) !== filename) {
    throw new Error("invalid artifact filename");
  }
  const runDir = artifactRunDir(root, identity);
  const resolved = path.resolve(runDir, filename);
  if (!resolved.startsWith(`${runDir}${path.sep}`)) throw new Error("raw artifact path escaped run directory");
  return resolved;
}

export function readRawJson(
  root: string,
  identity: ArtifactIdentity,
  filename: string,
): unknown {
  const artifactPath = resolveRawArtifactPath(root, identity, filename);
  if (!fs.existsSync(artifactPath)) throw new Error(`raw artifact not found: ${filename}`);
  return JSON.parse(fs.readFileSync(artifactPath, "utf8")) as unknown;
}

export function writeRawJson(
  root: string,
  identity: ArtifactIdentity,
  filename: string,
  value: unknown,
): void {
  const artifactPath = resolveRawArtifactPath(root, identity, filename);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(value, null, 2)}\n`);
}

export function readGenerationCheckpoint(
  root: string,
  identity: ArtifactIdentity,
): Generation[] {
  const checkpointPath = resolveRawArtifactPath(root, identity, "generations.json");
  if (!fs.existsSync(checkpointPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("generation checkpoint must be an array");
  return parsed.map(row => GenerationSchema.parse(row));
}

export function writeGenerationCheckpoint(
  root: string,
  identity: ArtifactIdentity,
  rows: Generation[],
): void {
  const checkpointPath = resolveRawArtifactPath(root, identity, "generations.json");
  const parsed = rows.map(row => GenerationSchema.parse(row));
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.writeFileSync(checkpointPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

export function writeTrackedSummary(
  root: string,
  relativePath: string,
  value: unknown,
  secrets: string[],
): void {
  const projectRoot = path.resolve(root);
  const allowedRoot = path.join(projectRoot, "docs", "qa", "annotation-eval");
  const resolved = path.resolve(projectRoot, relativePath);
  if (!resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("tracked summary path must be below docs/qa/annotation-eval");
  }
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (secrets.some(secret => secret && serialized.includes(secret))) {
    throw new Error("tracked summary contains a secret");
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, serialized);
}

export function writeTrackedText(
  root: string,
  relativePath: string,
  value: string,
  secrets: string[],
): void {
  const projectRoot = path.resolve(root);
  const allowedRoot = path.join(projectRoot, "docs", "qa", "annotation-eval");
  const resolved = path.resolve(projectRoot, relativePath);
  if (!resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("tracked report path must be below docs/qa/annotation-eval");
  }
  if (secrets.some(secret => secret && value.includes(secret))) {
    throw new Error("tracked report contains a secret");
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, value.endsWith("\n") ? value : `${value}\n`);
}
