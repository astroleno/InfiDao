import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import goldenQueries from "../tests/fixtures/search-golden-queries.json";
import oodQueries from "../tests/fixtures/search-ood-queries.json";
import { diagnoseSearchPassages } from "../src/lib/search/diagnostics";
import { clearSearchGraphCache } from "../src/lib/search/graph/store";
import { clearSearchIndexCache } from "../src/lib/search/index-store";

interface ArtifactReport {
  label: string;
  artifactPath: string;
  model: string;
  dimension: number;
  golden: Array<{
    query: string;
    passed: boolean;
    fullTop1Id?: string | undefined;
    fullTop3Ids: string[];
    vectorTop1Id?: string | undefined;
    vectorTop3Ids: string[];
    lexicalTop1Id?: string | undefined;
    lexicalTop3Ids: string[];
    fusionTop1Id?: string | undefined;
    fusionTop3Ids: string[];
  }>;
  goldenPassCount: number;
  oodReturnCounts: {
    full: number;
    vector: number;
    lexical: number;
    fusion: number;
  };
}

interface ArtifactReproducibilityReport {
  checked: boolean;
  passed: boolean;
  generatedArtifactPath?: string;
}

const shouldGenerateRemote = process.argv.includes("--remote");
const shouldRunGate = process.argv.includes("--gate");
const shouldCheckArtifact = shouldRunGate || process.argv.includes("--check-artifact");
const remoteArtifactArg = process.argv.find((arg) => arg.startsWith("--remote-artifact="));
const remoteArtifactPath =
  remoteArtifactArg?.split("=", 2)[1] ??
  path.join(os.tmpdir(), "infidao-remote-search-embeddings.json");
const localArtifactArg = process.argv.find((arg) => arg.startsWith("--local-artifact="));
const reproducibleArtifactPath =
  localArtifactArg?.split("=", 2)[1] ??
  path.join(os.tmpdir(), "infidao-local-search-embeddings.json");
const localArtifactPath = path.join(process.cwd(), "data", "embeddings.json");

function readArtifactHeader(artifactPath: string): { model: string; dimension: number } {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
    model: string;
    dimension: number;
  };

  return {
    model: artifact.model,
    dimension: artifact.dimension,
  };
}

function clearSearchCaches(): void {
  clearSearchGraphCache();
  clearSearchIndexCache();
}

function goldenQueryPassed(
  query: (typeof goldenQueries)[number],
  topIds: string[],
  resultCount: number,
): boolean {
  const top3Ids = topIds.slice(0, 3);

  return (
    resultCount >= query.minResults &&
    query.expectedTop1Ids.includes(topIds[0] ?? "") &&
    query.requiredTop3Ids.every((id) => top3Ids.includes(id)) &&
    query.bannedTop3Ids.every((id) => !top3Ids.includes(id))
  );
}

async function evaluateArtifact(label: string, artifactPath: string): Promise<ArtifactReport> {
  process.env.SEARCH_EMBEDDING_ARTIFACT_PATH = artifactPath;
  clearSearchCaches();

  const header = readArtifactHeader(artifactPath);
  const golden = [];

  for (const query of goldenQueries) {
    const diagnostics = await diagnoseSearchPassages({
      query: query.query,
      topK: 5,
      threshold: 0.25,
    });

    golden.push({
      query: query.query,
      passed: goldenQueryPassed(query, diagnostics.lanes.full.top3Ids, diagnostics.lanes.full.resultCount),
      fullTop1Id: diagnostics.lanes.full.top1Id,
      fullTop3Ids: diagnostics.lanes.full.top3Ids,
      vectorTop1Id: diagnostics.lanes.vector.top1Id,
      vectorTop3Ids: diagnostics.lanes.vector.top3Ids,
      lexicalTop1Id: diagnostics.lanes.lexical.top1Id,
      lexicalTop3Ids: diagnostics.lanes.lexical.top3Ids,
      fusionTop1Id: diagnostics.lanes.fusion.top1Id,
      fusionTop3Ids: diagnostics.lanes.fusion.top3Ids,
    });
  }

  const oodReturnCounts = {
    full: 0,
    vector: 0,
    lexical: 0,
    fusion: 0,
  };

  for (const query of oodQueries) {
    const diagnostics = await diagnoseSearchPassages({
      query,
      topK: 5,
      threshold: 0.25,
    });

    oodReturnCounts.full += diagnostics.lanes.full.resultCount;
    oodReturnCounts.vector += diagnostics.lanes.vector.resultCount;
    oodReturnCounts.lexical += diagnostics.lanes.lexical.resultCount;
    oodReturnCounts.fusion += diagnostics.lanes.fusion.resultCount;
  }

  return {
    label,
    artifactPath,
    ...header,
    golden,
    goldenPassCount: golden.filter((entry) => entry.passed).length,
    oodReturnCounts,
  };
}

function generateRemoteArtifact(): boolean {
  const result = spawnSync("node", ["scripts/generate-search-artifacts.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SEARCH_EMBEDDING_BACKEND: "remote",
      SEARCH_EMBEDDING_ARTIFACT_PATH: remoteArtifactPath,
    },
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    return false;
  }

  console.error(result.stdout.trim());
  return true;
}

function generateLocalArtifact(outputPath: string): boolean {
  const result = spawnSync("node", ["scripts/generate-search-artifacts.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SEARCH_EMBEDDING_BACKEND: "local",
      SEARCH_EMBEDDING_ARTIFACT_PATH: outputPath,
    },
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    return false;
  }

  console.error(result.stdout.trim());
  return true;
}

function checkLocalArtifactReproducibility(): ArtifactReproducibilityReport {
  if (!shouldCheckArtifact) {
    return {
      checked: false,
      passed: false,
    };
  }

  if (!generateLocalArtifact(reproducibleArtifactPath)) {
    return {
      checked: true,
      passed: false,
      generatedArtifactPath: reproducibleArtifactPath,
    };
  }

  const currentArtifact = fs.readFileSync(localArtifactPath, "utf8");
  const regeneratedArtifact = fs.readFileSync(reproducibleArtifactPath, "utf8");

  return {
    checked: true,
    passed: currentArtifact === regeneratedArtifact,
    generatedArtifactPath: reproducibleArtifactPath,
  };
}

function qualityGateFailures(
  report: ArtifactReport,
  artifactReproducibility: ArtifactReproducibilityReport,
): string[] {
  const failures: string[] = [];

  if (report.goldenPassCount !== goldenQueries.length) {
    failures.push(`golden full pass ${report.goldenPassCount}/${goldenQueries.length}`);
  }

  if (report.oodReturnCounts.full !== 0) {
    failures.push(`OOD full returned ${report.oodReturnCounts.full} results`);
  }

  if (report.oodReturnCounts.fusion !== 0) {
    failures.push(`OOD fusion returned ${report.oodReturnCounts.fusion} results`);
  }

  if (!artifactReproducibility.checked || !artifactReproducibility.passed) {
    failures.push("local artifact is not reproducible");
  }

  return failures;
}

async function main(): Promise<void> {
  const reports: ArtifactReport[] = [await evaluateArtifact("local-v2", localArtifactPath)];
  const artifactReproducibility = checkLocalArtifactReproducibility();
  const skipped: string[] = [];
  const gateFailures = qualityGateFailures(reports[0]!, artifactReproducibility);

  if (shouldGenerateRemote) {
    if (generateRemoteArtifact()) {
      reports.push(await evaluateArtifact("remote", remoteArtifactPath));
    } else {
      skipped.push("remote generation failed; check SEARCH_EMBEDDING_* or OPENAI_* config");
    }
  } else if (!shouldRunGate && fs.existsSync(remoteArtifactPath)) {
    reports.push(await evaluateArtifact("remote-existing", remoteArtifactPath));
  } else if (shouldRunGate) {
    skipped.push("remote artifact skipped for quality gate");
  } else {
    skipped.push("remote artifact not generated; rerun with --remote to create one under /tmp");
  }

  delete process.env.SEARCH_EMBEDDING_ARTIFACT_PATH;
  clearSearchCaches();

  console.log(
    JSON.stringify(
      {
        reports,
        artifactReproducibility,
        gate: {
          enabled: shouldRunGate,
          passed: gateFailures.length === 0,
          failures: gateFailures,
        },
        skipped,
      },
      null,
      2,
    ),
  );

  if (shouldRunGate && gateFailures.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
