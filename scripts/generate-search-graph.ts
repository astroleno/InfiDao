import {
  generateSearchGraphArtifact,
  writeSearchGraphArtifact,
} from "../src/lib/search/graph/generator";

async function main(): Promise<void> {
  const artifact = await generateSearchGraphArtifact();
  const writtenArtifact = await writeSearchGraphArtifact(artifact);

  console.log(
    `Generated search graph: ${writtenArtifact.nodes.length} nodes, ${writtenArtifact.edges.length} edges, ${writtenArtifact.artifactSignature}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
