import fs from "node:fs";
import path from "node:path";
import { diagnoseSearchPassages } from "../src/lib/search/diagnostics";
import { loadSearchIndex } from "../src/lib/search/index-store";

type Expectation =
  | {
      type: "anyTop3Id";
      ids: string[];
    }
  | {
      type: "sourceTop3";
      sources: string[];
    }
  | {
      type: "empty";
    };

interface EvalCase {
  category: "golden" | "variant" | "ood";
  query: string;
  expectation: Expectation;
  note: string;
}

const cases: EvalCase[] = [
  {
    category: "golden",
    query: "治理国家",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-mengzi-2-12", "rysxguji-mozi-10-1"] },
    note: "治理/仁政相关结果应在 Top 3。",
  },
  {
    category: "golden",
    query: "朋友相处要诚信",
    expectation: { type: "anyTop3Id", ids: ["lunyu-1-4", "lunyu-1-7", "rysxguji-lunyu-1-3"] },
    note: "朋友、诚信相关结果应在 Top 3。",
  },
  {
    category: "golden",
    query: "面对别人不理解",
    expectation: {
      type: "anyTop3Id",
      ids: ["rysxguji-lunyu-1-12", "rysxguji-lunyu-14-32", "lunyu-1-1"],
    },
    note: "人不知而不愠相关结果应在 Top 3。",
  },
  {
    category: "golden",
    query: "修身齐家治国平天下",
    expectation: { type: "anyTop3Id", ids: ["daxue-2-2", "rysxguji-daxue-1-5", "daxue-2-1"] },
    note: "大学修齐治平相关结果应在 Top 3。",
  },
  {
    category: "golden",
    query: "中庸和谐",
    expectation: {
      type: "anyTop3Id",
      ids: ["zhongyong-1-4", "rysxguji-zhongyong-1-1", "rysxguji-liji-29-1"],
    },
    note: "中庸/中和相关结果应在 Top 3。",
  },
  {
    category: "golden",
    query: "反省自己哪里做得不够",
    expectation: { type: "anyTop3Id", ids: ["lunyu-1-4", "lunyu-1-8", "rysxguji-lunyu-1-1"] },
    note: "三省、改过相关结果应在 Top 3。",
  },
  {
    category: "golden",
    query: "学习之后要实践",
    expectation: { type: "anyTop3Id", ids: ["lunyu-1-1", "rysxguji-lunyu-1-1", "lunyu-1-6"] },
    note: "学而时习或学文相关结果应在 Top 3。",
  },
  {
    category: "golden",
    query: "什么是至善",
    expectation: { type: "anyTop3Id", ids: ["daxue-1-1", "rysxguji-daxue-1-1"] },
    note: "大学至善相关结果应在 Top 3。",
  },
  {
    category: "golden",
    query: "面对焦虑如何安定",
    expectation: {
      type: "anyTop3Id",
      ids: ["rysxguji-liji-29-1", "rysxguji-zhongyong-1-1", "zhongyong-1-2"],
    },
    note: "安定/中和相关结果应在 Top 3。",
  },
  {
    category: "golden",
    query: "我怎样安住眼前这件事",
    expectation: {
      type: "anyTop3Id",
      ids: ["rysxguji-zhongyong-1-1", "zhongyong-1-2", "zhongyong-1-3"],
    },
    note: "安住当下相关结果应在 Top 3。",
  },
  {
    category: "golden",
    query: "被别人误解怎么办",
    expectation: {
      type: "anyTop3Id",
      ids: ["rysxguji-lunyu-1-12", "rysxguji-lunyu-14-32", "lunyu-1-1"],
    },
    note: "误解场景应回到不己知/不愠。",
  },
  {
    category: "variant",
    query: "我被人误会了怎么不生气",
    expectation: {
      type: "anyTop3Id",
      ids: ["rysxguji-lunyu-1-12", "rysxguji-lunyu-14-32", "lunyu-1-1"],
    },
    note: "误会、不生气应映射到不愠。",
  },
  {
    category: "variant",
    query: "没人理解我还要坚持吗",
    expectation: {
      type: "anyTop3Id",
      ids: ["rysxguji-lunyu-1-12", "rysxguji-lunyu-14-32", "lunyu-1-1"],
    },
    note: "没人理解应映射到不己知。",
  },
  {
    category: "variant",
    query: "如何与朋友保持信任",
    expectation: { type: "anyTop3Id", ids: ["lunyu-1-4", "lunyu-1-7", "rysxguji-lunyu-1-3"] },
    note: "朋友信任相关结果应在 Top 3。",
  },
  {
    category: "variant",
    query: "朋友之间说话算数",
    expectation: { type: "anyTop3Id", ids: ["lunyu-1-4", "lunyu-1-7", "rysxguji-lunyu-1-3"] },
    note: "说话算数应映射到言而有信。",
  },
  {
    category: "variant",
    query: "诚信和义之间的关系",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-1-8"] },
    note: "信近于义应在 Top 3。",
  },
  {
    category: "variant",
    query: "每天反省自己",
    expectation: { type: "anyTop3Id", ids: ["lunyu-1-4", "rysxguji-lunyu-1-1"] },
    note: "每日三省应在 Top 3。",
  },
  {
    category: "variant",
    query: "犯错了要不要马上改",
    expectation: { type: "anyTop3Id", ids: ["lunyu-1-8", "rysxguji-lunyu-1-4"] },
    note: "过则勿惮改应在 Top 3。",
  },
  {
    category: "variant",
    query: "温故知新",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-2-8"] },
    note: "温故而知新应在 Top 3。",
  },
  {
    category: "variant",
    query: "学而不思思而不学",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-2-12"] },
    note: "学思关系应在 Top 3。",
  },
  {
    category: "variant",
    query: "学习要和行动结合",
    expectation: { type: "anyTop3Id", ids: ["lunyu-1-1", "rysxguji-lunyu-1-1", "lunyu-1-6"] },
    note: "学习实践相关结果应在 Top 3。",
  },
  {
    category: "variant",
    query: "仁的根本是什么",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-1-1", "lunyu-1-2"] },
    note: "孝弟为仁之本应在 Top 3。",
  },
  {
    category: "variant",
    query: "孝悌为什么是仁之本",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-1-1", "lunyu-1-2"] },
    note: "孝悌/仁之本应在 Top 3。",
  },
  {
    category: "variant",
    query: "父母需要敬养",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-2-7", "rysxguji-lunyu-2-6"] },
    note: "孝养与敬应在 Top 3。",
  },
  {
    category: "variant",
    query: "为政以德",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-2-1", "rysxguji-lunyu-2-2"] },
    note: "为政以德应在 Top 3。",
  },
  {
    category: "variant",
    query: "道千乘之国",
    expectation: { type: "anyTop3Id", ids: ["lunyu-1-5", "rysxguji-lunyu-1-1"] },
    note: "道千乘之国应在 Top 3。",
  },
  {
    category: "variant",
    query: "为政者怎样使民服",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-2-15"] },
    note: "举直错诸枉、民服应在 Top 3。",
  },
  {
    category: "variant",
    query: "举直错诸枉",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-2-15"] },
    note: "举直错诸枉应在 Top 3。",
  },
  {
    category: "variant",
    query: "礼之用和为贵",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-1-7"] },
    note: "礼之用、和为贵应在 Top 3。",
  },
  {
    category: "variant",
    query: "做事有分寸不过也不及",
    expectation: { type: "sourceTop3", sources: ["中庸"] },
    note: "分寸/过不及应回到中庸。",
  },
  {
    category: "variant",
    query: "知者过之愚者不及",
    expectation: { type: "sourceTop3", sources: ["中庸"] },
    note: "知者过之、愚者不及应回到中庸。",
  },
  {
    category: "variant",
    query: "情绪没发作前怎么保持中",
    expectation: { type: "anyTop3Id", ids: ["zhongyong-1-2", "rysxguji-zhongyong-1-1"] },
    note: "未发之中应在 Top 3。",
  },
  {
    category: "variant",
    query: "喜怒哀乐发而中节",
    expectation: { type: "anyTop3Id", ids: ["zhongyong-1-2", "rysxguji-zhongyong-1-1"] },
    note: "喜怒哀乐中节应在 Top 3。",
  },
  {
    category: "variant",
    query: "中和天地位万物育",
    expectation: { type: "anyTop3Id", ids: ["zhongyong-1-3", "rysxguji-zhongyong-1-1"] },
    note: "致中和、天地位焉应在 Top 3。",
  },
  {
    category: "variant",
    query: "什么是天命率性修道",
    expectation: { type: "anyTop3Id", ids: ["zhongyong-1-1", "rysxguji-zhongyong-1-1"] },
    note: "天命之谓性应在 Top 3。",
  },
  {
    category: "variant",
    query: "慎独是什么意思",
    expectation: { type: "sourceTop3", sources: ["大学"] },
    note: "慎独应回到大学系统。",
  },
  {
    category: "variant",
    query: "知止而后定",
    expectation: { type: "sourceTop3", sources: ["大学"] },
    note: "知止定静安虑得应回到大学。",
  },
  {
    category: "variant",
    query: "大学明明德亲民至善",
    expectation: { type: "anyTop3Id", ids: ["daxue-1-1", "rysxguji-daxue-1-1"] },
    note: "大学三纲领应在 Top 3。",
  },
  {
    category: "variant",
    query: "格物致知诚意正心",
    expectation: { type: "sourceTop3", sources: ["大学"] },
    note: "八条目应回到大学。",
  },
  {
    category: "variant",
    query: "身修家齐国治天下平",
    expectation: { type: "anyTop3Id", ids: ["daxue-2-2", "rysxguji-daxue-1-5"] },
    note: "修齐治平递进应在 Top 3。",
  },
  {
    category: "variant",
    query: "君子怀德小人怀土",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-4-10"] },
    note: "君子小人对比应在 Top 3。",
  },
  {
    category: "variant",
    query: "见贤思齐内自省",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-4-14"] },
    note: "见贤思齐应在 Top 3。",
  },
  {
    category: "variant",
    query: "君子欲讷于言敏于行",
    expectation: { type: "anyTop3Id", ids: ["rysxguji-lunyu-4-20"] },
    note: "讷言敏行应在 Top 3。",
  },
  {
    category: "ood",
    query: "星际跃迁",
    expectation: { type: "empty" },
    note: "无关查询应返回 0。",
  },
  {
    category: "ood",
    query: "今天北京天气",
    expectation: { type: "empty" },
    note: "天气查询应返回 0。",
  },
  {
    category: "ood",
    query: "怎么写React组件",
    expectation: { type: "empty" },
    note: "编程查询应返回 0。",
  },
  {
    category: "ood",
    query: "股票怎么买",
    expectation: { type: "empty" },
    note: "投资查询应返回 0。",
  },
  {
    category: "ood",
    query: "巴黎奥运会金牌榜",
    expectation: { type: "empty" },
    note: "时事体育查询应返回 0。",
  },
  {
    category: "ood",
    query: "量子计算入门",
    expectation: { type: "empty" },
    note: "技术泛问应返回 0。",
  },
  {
    category: "ood",
    query: "我想买咖啡机",
    expectation: { type: "empty" },
    note: "购物查询应返回 0。",
  },
];

interface CaseOutput {
  index: number;
  category: EvalCase["category"];
  query: string;
  passed: boolean;
  note: string;
  expectation: Expectation;
  resultCount: number;
  top3Ids: string[];
  top5: Array<{
    rank: number;
    id: string;
    source: string;
    chapter: string;
    section: number;
    score: number;
    vectorScore: number;
    lexicalScore: number;
    evidenceScore: number;
    matchedTerms: string[];
    text: string;
  }>;
  lanes: {
    vectorTop3Ids: string[];
    lexicalTop3Ids: string[];
    fusionTop3Ids: string[];
  };
  evidence: {
    aliasLabels: string[];
    sourceTerms: string[];
    coreTerms: string[];
    trustedMatchedTerms: string[];
    hasQueryEvidence: boolean;
    hasTrustedResultEvidence: boolean;
  };
}

function evaluate(expectation: Expectation, top3Ids: string[], top3Sources: string[], resultCount: number): boolean {
  if (expectation.type === "empty") {
    return resultCount === 0;
  }

  if (expectation.type === "sourceTop3") {
    return top3Sources.some((source) => expectation.sources.includes(source));
  }

  return top3Ids.some((id) => expectation.ids.includes(id));
}

function formatExpectation(expectation: Expectation): string {
  if (expectation.type === "empty") {
    return "return 0 results";
  }

  if (expectation.type === "sourceTop3") {
    return `Top 3 source includes ${expectation.sources.join(" / ")}`;
  }

  return `Top 3 includes ${expectation.ids.join(" / ")}`;
}

function truncate(value: string, maxLength = 80): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function buildMarkdown(outputs: CaseOutput[]): string {
  const passedCount = outputs.filter((output) => output.passed).length;
  const byCategory = ["golden", "variant", "ood"].map((category) => {
    const categoryOutputs = outputs.filter((output) => output.category === category);
    const categoryPassed = categoryOutputs.filter((output) => output.passed).length;

    return `- ${category}: ${categoryPassed}/${categoryOutputs.length}`;
  });
  const failures = outputs.filter((output) => !output.passed);
  const rows = outputs
    .map((output) => {
      const top3 = output.top5
        .slice(0, 3)
        .map((result) => `${result.id}(${result.source}, ${result.score})`)
        .join("<br>");

      return `| ${output.index} | ${output.category} | ${output.passed ? "PASS" : "FAIL"} | ${output.query} | ${output.resultCount} | ${top3 || "-"} | ${formatExpectation(output.expectation)} |`;
    })
    .join("\n");
  const detail = outputs
    .map((output) => {
      const top5 = output.top5
        .map(
          (result) =>
            `  ${result.rank}. ${result.id} | ${result.source} ${result.chapter}#${result.section} | score=${result.score} | lexical=${result.lexicalScore} | terms=${result.matchedTerms.join(", ") || "-"} | ${truncate(result.text)}`,
        )
        .join("\n");

      return [
        `### ${output.index}. ${output.query}`,
        "",
        `- Status: ${output.passed ? "PASS" : "FAIL"}`,
        `- Expectation: ${formatExpectation(output.expectation)}`,
        `- Note: ${output.note}`,
        `- Evidence: aliases=${output.evidence.aliasLabels.join(", ") || "-"}; core=${output.evidence.coreTerms.join(", ") || "-"}; trusted=${output.evidence.trustedMatchedTerms.join(", ") || "-"}`,
        "- Top 5:",
        top5 || "  -",
      ].join("\n");
    })
    .join("\n\n");

  return [
    "# Search 50 Query Iteration Report",
    "",
    "Generated by `npm exec tsx scripts/run-search-50-iteration.ts`.",
    "",
    "## Summary",
    "",
    `- Total: ${passedCount}/${outputs.length}`,
    ...byCategory,
    "",
    "## Failures",
    "",
    failures.length === 0
      ? "- None"
      : failures
          .map(
            (failure) =>
              `- #${failure.index} ${failure.query}: expected ${formatExpectation(failure.expectation)}, got ${failure.top3Ids.join(", ") || "0 results"}`,
          )
          .join("\n"),
    "",
    "## Results Table",
    "",
    "| # | Category | Status | Query | Count | Top 3 | Expectation |",
    "| - | - | - | - | -: | - | - |",
    rows,
    "",
    "## Detailed Outputs",
    "",
    detail,
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const index = await loadSearchIndex();
  const passagesById = new Map(index.corpus.map((passage) => [passage.id, passage]));
  const outputs: CaseOutput[] = [];

  for (const [caseIndex, testCase] of cases.entries()) {
    const diagnostics = await diagnoseSearchPassages({
      query: testCase.query,
      topK: 5,
      threshold: 0.25,
    });
    const top5 = diagnostics.results.slice(0, 5).map((result) => {
      const passage = passagesById.get(result.id);

      return {
        rank: result.rank,
        id: result.id,
        source: passage?.source ?? "",
        chapter: passage?.chapter ?? "",
        section: passage?.section ?? 0,
        score: result.score,
        vectorScore: result.vectorScore,
        lexicalScore: result.lexicalScore,
        evidenceScore: result.evidenceScore,
        matchedTerms: result.matchedTerms,
        text: passage?.text ?? "",
      };
    });
    const top3Ids = top5.slice(0, 3).map((result) => result.id);
    const top3Sources = top5.slice(0, 3).map((result) => result.source);

    outputs.push({
      index: caseIndex + 1,
      category: testCase.category,
      query: testCase.query,
      passed: evaluate(testCase.expectation, top3Ids, top3Sources, diagnostics.lanes.full.resultCount),
      note: testCase.note,
      expectation: testCase.expectation,
      resultCount: diagnostics.lanes.full.resultCount,
      top3Ids,
      top5,
      lanes: {
        vectorTop3Ids: diagnostics.lanes.vector.top3Ids,
        lexicalTop3Ids: diagnostics.lanes.lexical.top3Ids,
        fusionTop3Ids: diagnostics.lanes.fusion.top3Ids,
      },
      evidence: diagnostics.evidence,
    });
  }

  const outputDir = path.join(process.cwd(), "docs", "qa");
  const jsonPath = path.join(outputDir, "search-50-query-iteration-results.json");
  const markdownPath = path.join(outputDir, "search-50-query-iteration-report.md");

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: outputs.length,
        passed: outputs.filter((output) => output.passed).length,
        outputs,
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(markdownPath, buildMarkdown(outputs));

  console.log(
    JSON.stringify(
      {
        total: outputs.length,
        passed: outputs.filter((output) => output.passed).length,
        failed: outputs.filter((output) => !output.passed).map((output) => ({
          index: output.index,
          query: output.query,
          top3Ids: output.top3Ids,
          expectation: output.expectation,
        })),
        jsonPath,
        markdownPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
