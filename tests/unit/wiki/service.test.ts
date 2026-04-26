import {
  createWikiRoot,
  currentWikiNode,
  popWikiStack,
  pushWikiNode,
  resetWikiStack,
} from "@/lib/wiki/service";
import type { AnnotationLink, AnnotationResult } from "@/types";

const rootAnnotation: AnnotationResult = {
  passageId: "lunyu-1-8",
  passageText: "君子不重则不威，学则不固。",
  sixToMe: "根节点注释",
  meToSix: "根节点反观",
  links: [],
};

const childAnnotation: AnnotationResult = {
  passageId: "lunyu-1-4",
  passageText: "吾日三省吾身。",
  sixToMe: "子节点注释",
  meToSix: "子节点反观",
  links: [],
};

const link: AnnotationLink = {
  passageId: "lunyu-1-4",
  label: "继续看自省",
  passageText: "吾日三省吾身。",
  source: "论语",
  chapter: "学而篇",
  section: 4,
};

describe("wiki exploration stack", () => {
  it("starts a root stack from a selected annotation", () => {
    const stack = createWikiRoot("如何面对困境", rootAnnotation);

    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({
      id: "lunyu-1-8",
      depth: 0,
      query: "如何面对困境",
      annotation: rootAnnotation,
    });
    expect(currentWikiNode(stack)?.annotation.passageId).toBe("lunyu-1-8");
  });

  it("pushes linked annotations without mutating prior stack entries", () => {
    const root = createWikiRoot("如何面对困境", rootAnnotation);
    const next = pushWikiNode(root, {
      query: "如何面对困境",
      annotation: childAnnotation,
      via: link,
    });

    expect(root).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({
      id: "lunyu-1-4",
      depth: 1,
      via: link,
      annotation: childAnnotation,
    });
    expect(currentWikiNode(next)?.annotation.passageId).toBe("lunyu-1-4");
  });

  it("pops to the previous node but keeps the root stable", () => {
    const stack = pushWikiNode(createWikiRoot("如何面对困境", rootAnnotation), {
      query: "如何面对困境",
      annotation: childAnnotation,
      via: link,
    });

    const popped = popWikiStack(stack);
    const rootOnly = popWikiStack(popped);

    expect(popped).toHaveLength(1);
    expect(currentWikiNode(popped)?.annotation.passageId).toBe("lunyu-1-8");
    expect(rootOnly).toBe(popped);
    expect(resetWikiStack()).toEqual([]);
  });
});
