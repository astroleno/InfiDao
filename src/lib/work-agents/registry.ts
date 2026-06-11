import { buildTextHash } from "@/lib/data/hash";
import { loadSearchIndex } from "@/lib/search/index-store";
import { createClassicPassageWorkAgent } from "@/lib/work-agents/classic-passage-adapter";
import type { WorkAgentManifest } from "@/lib/work-agents/types";

export interface ResolveWorkAgentOptions {
  passageText?: string;
}

export async function resolveClassicPassageWorkAgent(
  passageId: string,
  options: ResolveWorkAgentOptions = {},
): Promise<WorkAgentManifest | null> {
  try {
    const index = await loadSearchIndex();
    const passage = index.corpus.find(candidate => candidate.id === passageId);

    if (!passage) {
      return null;
    }

    return createClassicPassageWorkAgent(passage, {
      ...(options.passageText !== undefined
        ? { expectedTextHash: buildTextHash(options.passageText) }
        : {}),
    });
  } catch {
    return null;
  }
}

export async function resolveWorkAgentByPassageId(
  passageId: string,
  options: ResolveWorkAgentOptions = {},
): Promise<WorkAgentManifest | null> {
  return resolveClassicPassageWorkAgent(passageId, options);
}
