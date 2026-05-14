import { z } from "zod";

export const SEARCH_CONCEPT_SCHEMA_VERSION = 1;

const stableConceptIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

function splitPatternAlternatives(pattern: string): string[] {
  const alternatives: string[] = [];
  let current = "";
  let escaping = false;

  for (const character of pattern) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      current += character;
      escaping = true;
      continue;
    }

    if (character === "|") {
      alternatives.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  alternatives.push(current);
  return alternatives;
}

function normalizeAlternativeForBreadthCheck(alternative: string): string {
  return alternative
    .trim()
    .replace(/^\^/u, "")
    .replace(/\$$/u, "")
    .replace(/^\(\?:/u, "")
    .replace(/^\(/u, "")
    .replace(/\)$/u, "")
    .replace(/\\[bB]/gu, "")
    .trim();
}

function hasNakedSingleCharacterAlternative(pattern: string): boolean {
  return splitPatternAlternatives(pattern).some(alternative => {
    const normalized = normalizeAlternativeForBreadthCheck(alternative);
    return [...normalized].length === 1;
  });
}

export const searchConceptSchema = z
  .object({
    id: stableConceptIdSchema,
    label: z.string().min(1),
    conceptGroup: stableConceptIdSchema,
    keywords: z.array(z.string().min(1)).min(1),
    mentionPatterns: z.array(z.string().min(2)).min(1),
  })
  .strict();

export const searchConceptSeedSchema = z
  .object({
    schemaVersion: z.literal(SEARCH_CONCEPT_SCHEMA_VERSION),
    conceptSeedVersion: z.string().min(1),
    concepts: z.array(searchConceptSchema).min(1),
  })
  .strict()
  .superRefine((seed, context) => {
    const conceptIds = new Set<string>();

    for (const concept of seed.concepts) {
      if (conceptIds.has(concept.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["concepts"],
          message: `Duplicate concept id: ${concept.id}`,
        });
      }

      conceptIds.add(concept.id);

      for (const [patternIndex, pattern] of concept.mentionPatterns.entries()) {
        if (hasNakedSingleCharacterAlternative(pattern)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["concepts", seed.concepts.indexOf(concept), "mentionPatterns", patternIndex],
            message: `Mention pattern for ${concept.id} is too broad: ${pattern}`,
          });
          continue;
        }

        try {
          new RegExp(pattern, "u");
        } catch (error) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["concepts", seed.concepts.indexOf(concept), "mentionPatterns", patternIndex],
            message: `Mention pattern for ${concept.id} is not a valid regular expression: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }
      }
    }
  });

export type SearchConcept = z.infer<typeof searchConceptSchema>;
export type SearchConceptSeed = z.infer<typeof searchConceptSeedSchema>;
