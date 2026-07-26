import embeddingSpec from "@/lib/search/local-embedding-spec.json";
import {
  buildLocalEmbedding,
  expandLocalQueryAliases,
  LOCAL_EMBEDDING_DIMENSION,
  LOCAL_EMBEDDING_MODEL,
  matchLocalQueryAliasLabels,
} from "@/lib/search/local-embedding";

describe("local embedding spec", () => {
  it("uses the shared spec model and dimension", () => {
    expect(LOCAL_EMBEDDING_MODEL).toBe(embeddingSpec.model);
    expect(LOCAL_EMBEDDING_DIMENSION).toBe(
      embeddingSpec.phraseAnchors.length +
        embeddingSpec.aliasAnchors.length +
        embeddingSpec.sourceAnchors.length +
        embeddingSpec.chapterBuckets +
        embeddingSpec.ngramBuckets,
    );
    expect(buildLocalEmbedding("治理国家")).toHaveLength(LOCAL_EMBEDDING_DIMENSION);
  });

  it("expands deterministic modern-language aliases", () => {
    expect(expandLocalQueryAliases("面对别人不理解")).toContain("人不知");
    expect(expandLocalQueryAliases("反省自己哪里做得不够")).toContain("三省");
    expect(expandLocalQueryAliases("学习之后要实践")).toContain("学而时习");
    expect(expandLocalQueryAliases("我怎样安住眼前这件事")).toContain("止于至善");
    expect(expandLocalQueryAliases("我怎样安住眼前这件事")).toContain("中和");
    expect(expandLocalQueryAliases("我被人误会了怎么不生气")).toContain("不愠");
    expect(expandLocalQueryAliases("朋友之间说话算数")).toContain("言而有信");
    expect(expandLocalQueryAliases("犯错了要不要马上改")).toContain("过则勿惮改");
    expect(expandLocalQueryAliases("温故知新")).toContain("温故而知新");
    expect(expandLocalQueryAliases("慎独是什么意思")).toContain("慎其独");
    expect(expandLocalQueryAliases("仁的根本是什么")).toContain("仁之本");
    expect(expandLocalQueryAliases("父母需要敬养")).toContain("能养");
    expect(expandLocalQueryAliases("诚信和义之间的关系")).toContain("言可复");
    expect(expandLocalQueryAliases("人不能只是一个工具")).toContain("君子不器");
    expect(expandLocalQueryAliases("知道就说知道不知道就承认")).toContain("知之为知之");
    expect(expandLocalQueryAliases("见到义却不去做")).toContain("见义不为");
    expect(expandLocalQueryAliases("见到义却不去做")).not.toContain("无勇");
    expect(expandLocalQueryAliases("文质彬彬")).not.toContain("君子");
    expect(expandLocalQueryAliases("时间像流水一样不停")).toContain("逝者如斯");
    expect(expandLocalQueryAliases("自己不想要的不要施加给别人")).toContain("己所不欲");
    expect(expandLocalQueryAliases("面对仁义不要谦让老师")).toContain("当仁不让");
    expect(expandLocalQueryAliases("面对仁义不要谦让老师")).not.toContain("于师");
    expect(expandLocalQueryAliases("把尊敬老人推广到别人老人")).toContain("老吾老");
    expect(expandLocalQueryAliases("民为贵社稷次之君为轻")).toContain("社稷次之");
    expect(matchLocalQueryAliasLabels("如何面对困境")).toContain("hardship");
    expect(expandLocalQueryAliases("如何面对困境")).toContain("君子固穷");
    expect(expandLocalQueryAliases("如何面对困境")).toContain("天将降大任");
    expect(expandLocalQueryAliases("如何面对困境")).not.toContain("中庸");
    expect(expandLocalQueryAliases("如何面对困境")).not.toContain("时中");
    expect(expandLocalQueryAliases("困境中才看出松柏")).toContain("岁寒");
    expect(expandLocalQueryAliases("困境中才看出松柏")).not.toContain("中庸");
    expect(expandLocalQueryAliases("名不正言不顺")).not.toContain("中庸");
    expect(matchLocalQueryAliasLabels("星际跃迁")).not.toContain("hardship");
  });

  it("normalizes broader modern intent phrases", () => {
    expect(expandLocalQueryAliases("不要把人当成机器零件")).toContain("君子不器");
    expect(expandLocalQueryAliases("外表和内容要配得上")).toContain("文质彬彬");
    expect(expandLocalQueryAliases("聪明人爱流动，仁厚者爱安定")).toContain("知者乐水");
    expect(expandLocalQueryAliases("聪明人爱流动，仁厚者爱安定")).not.toContain("中庸");
    expect(expandLocalQueryAliases("想快点成功反而坏事")).toContain("欲速则不达");
    expect(expandLocalQueryAliases("提问题要贴近眼前事情")).toContain("切问而近思");
    expect(expandLocalQueryAliases("提问题要贴近眼前事情")).not.toContain("止于至善");
    expect(expandLocalQueryAliases("条件再好不如人心齐")).toContain("地利不如人和");
  });
});
