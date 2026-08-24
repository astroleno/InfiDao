# Infinite Flow and Smart Auto-Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Repository rule: do not start a subagent without explicit user authorization; default to inline execution.

**Goal:** 在现有 InfiDao 首页上恢复“自动无限续写 + 自动滚屏”这一核心产品能力，同时完整保留手动探索模式，并记住用户上次选择的模式。

**Architecture:** 继续以现有 Next.js 首页、`/api/search`、`/api/annotate`、`AnnotationResult.links` 和 `WikiStack` 为生产骨架。新增一个客户端无限流控制器，负责自动选择首条结果、安排下一节点、暂停/恢复、分支和错误停机；新增独立智能滚屏控制器，负责跟随、脱离、回到当前与 reduced-motion 行为。服务端继续权威地产生搜索、注疏和候选链接，不恢复旧版浏览器直连 Gemini。

**Tech Stack:** Next.js 15 App Router、React 18、TypeScript、Tailwind CSS、Jest、Testing Library、现有 search/annotation/wiki 服务。

---

## 1. 已锁定的产品决策

本计划不再等待额外产品问题，按以下决策执行：

1. 首页提供 `自动流` 与 `手动探索` 两种平级模式。
2. 首次使用默认 `自动流`；之后通过 `localStorage` 记住上次模式。
3. 自动流输入后仍复用现有搜索桥接和 fallback；搜索成功后自动选择排名第一的结果作为起句。
4. 手动模式保留现有完整路径：搜索结果、选择经文、阅读停顿、注释、下一句、返回上一层。
5. 自动流不弹出逐节点阅读停顿；节点之间使用固定阅读驻留时间，默认 4 秒。
6. 下一节点从当前 `AnnotationResult.links` 中选择：排除完整客户端历史，再按接口顺序、关系说明、来源变化度和稳定扰动加权。
7. 同一会话、同一路径的自动选择必须可复现；不能使用 `Math.random()`。
8. 用户点击任意候选链接时，从点击节点处分叉，删除该节点之后的旧支流，再沿新支流继续；如果当前是自动模式，分叉完成后继续自动生成。
9. 自动滚屏是阅读跟随，不是粗暴跳底：正常模式使用低速 `requestAnimationFrame` 跟随；reduced motion 使用无动画定位。
10. 用户向上滚动、PageUp、Home、向上滚轮或触摸回看时，自动跟随和下一节点调度一起暂停；明确点击“回到当前并继续”后恢复。
11. 切到手动模式、显式暂停、页面隐藏、接口错误、没有可用链接时，必须清理定时器并停止新请求。
12. “无限”表示在用户主动停止前持续工作；底层始终保持单请求串行、无重叠、可取消和可恢复。

## 2. 当前实现基线

- `src/app/page.tsx` 和预览路由都渲染 `HomeEntryExperience`。
- `HomeEntryExperience.tsx` 已拥有搜索、注释、请求取消、移动阅读器、`WikiStack`、返回上一层和错误重试逻辑。
- `AnnotationResult.links` 已包含下一段的 `passageId`、原文、出处、章节、节号和可选 `relationHint`。
- `/api/annotate` 已支持 `visitedPassageIds`，但最大只接收 20 个 ID；当前 `buildVisitedPassageIds()` 未截断，路径超过 20 层会失败。
- `WikiStack` 已是一条线性阅读路径，适合作为自动流会话内的唯一节点真相。
- `src/app/ritual-scroll/page.tsx` 已验证 `requestAnimationFrame`、暂停、reduced motion 和清理边界，可复用机制但不能直接复制页面结构。
- `ref/infidao---six-classics-annotate-me/App.tsx` 保留旧版自动续写与自动滚屏产品语义，只作为行为参考，不进入生产构建。
- `/api/annotate` 当前限流为每客户端每分钟 20 次；4 秒驻留加请求耗时可将稳定自动流控制在每分钟 15 次以内。

## 3. 目标状态机

```text
idle
  ├─ submit(auto)   -> searching -> root-annotating -> dwelling
  └─ submit(manual) -> searching -> results -> manual-annotating

dwelling
  ├─ timer          -> next-annotating -> dwelling
  ├─ user branch    -> next-annotating -> dwelling
  ├─ review scroll  -> paused(review)
  ├─ explicit pause -> paused(user)
  ├─ mode manual    -> manual
  ├─ no links       -> exhausted
  └─ request error  -> error

paused(review|user|hidden)
  ├─ resume         -> dwelling
  └─ mode manual    -> manual

error
  ├─ retry          -> next-annotating
  └─ mode manual    -> manual

exhausted
  ├─ choose branch  -> next-annotating
  ├─ new thought    -> searching
  └─ mode manual    -> manual
```

约束：任意时刻最多存在一个 annotation 请求和一个 continuation timer；状态切换必须先取消旧资源，再创建新资源。

## 4. 文件职责图

| 文件 | 动作 | 单一职责 |
|---|---|---|
| `src/lib/infinite-flow/types.ts` | Create | 自动流模式、状态、暂停原因和选择上下文类型 |
| `src/lib/infinite-flow/preference.ts` | Create | 安全读取/写入模式偏好，首次默认自动流 |
| `src/lib/infinite-flow/policy.ts` | Create | 纯函数选择下一链接、维护服务端 20-ID 窗口 |
| `src/hooks/useInfiniteFlow.ts` | Create | 自动首节点、驻留、下一节点、暂停、恢复、隐藏页和清理 |
| `src/hooks/useSmartAutoScroll.ts` | Create | 低速跟随、回看脱离、回到当前、reduced motion 和 RAF 清理 |
| `src/components/flow/FlowModeSwitch.tsx` | Create | 可访问的自动/手动模式开关 |
| `src/components/flow/FlowControls.tsx` | Create | 暂停、继续、回到当前、状态与错误动作 |
| `src/components/flow/InfiniteFlowStream.tsx` | Create | 按 `WikiStack` 渲染整条思想流并暴露节点分支 |
| `src/components/flow/FlowNodeCard.tsx` | Create | 渲染单个经文、六经注我、我注六经、关系枝条和候选链接 |
| `src/lib/wiki/service.ts` | Modify | 支持从任意深度分叉，而不仅是尾部 push/pop |
| `src/components/home/HomeEntryExperience.tsx` | Modify | 组合现有手动路径与新增自动流，不继续堆入计时/滚屏细节 |
| `src/app/globals.css` | Modify | 自动流连接线、当前节点、跟随状态和 reduced-motion 样式 |
| `tests/unit/infinite-flow/*.test.ts` | Create | 偏好、策略、访问窗口和状态边界 |
| `tests/ui/infinite-flow*.test.tsx` | Create | 自动链、模式记忆、暂停、分支、滚屏和清理 |
| `tests/ui/home-main-path.regression.test.tsx` | Modify | 锁住原有手动主路径 |
| `docs/SUPERPOWERS_REBOOT_PLAN.md` | Modify | 删除“不继承自动续写/滚屏”的冲突结论 |
| `docs/qa/reboot-mvp-acceptance-checklist.md` | Modify | 增加无限流发布验收项 |

## 5. 验收标准

- 首次打开选择自动流；选择手动后刷新仍为手动。
- 自动模式输入一念后，完成 search → 第一名 annotate → link annotate，用户无需再点击结果或下一句。
- 手动模式现有 regression 流程全部通过，交互文案和可访问名称不退化。
- 连续生成 25 层不会因 `visitedPassageIds` 超过 20 而返回 400。
- 客户端完整历史仍能阻止第 1 层段落在第 21 层后重新进入。
- 用户从第 3 层回看并点击分支时，第 4 层及之后旧路径被截断，新节点成为第 4 层。
- 用户回看时不继续生成；点击“回到当前并继续”后恢复。
- 自动模式从不并发发起两个 annotate 请求。
- 切换手动、暂停、卸载或隐藏页面后，不再触发已排队的下一请求。
- reduced motion 下不执行连续 RAF 滚动，但自动续写仍工作并使用无动画定位。
- 没有链接时显示“此卷暂止”，不伪造下一节点。
- 429、网络错误和非成功 API payload 都进入可恢复错误态，不做无限重试。

---

### Task 1: 建立无限流领域类型与模式偏好

**Files:**
- Create: `src/lib/infinite-flow/types.ts`
- Create: `src/lib/infinite-flow/preference.ts`
- Test: `tests/unit/infinite-flow/preference.test.ts`

- [ ] **Step 1: 写模式偏好的失败测试**

```ts
import {
  FLOW_MODE_STORAGE_KEY,
  readFlowModePreference,
  writeFlowModePreference,
} from "@/lib/infinite-flow/preference";

describe("infinite-flow preference", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults first use to auto", () => {
    expect(readFlowModePreference(window.localStorage)).toBe("auto");
  });

  it("persists manual mode", () => {
    writeFlowModePreference(window.localStorage, "manual");
    expect(window.localStorage.getItem(FLOW_MODE_STORAGE_KEY)).toBe("manual");
    expect(readFlowModePreference(window.localStorage)).toBe("manual");
  });

  it("falls back to auto for corrupt or unavailable storage", () => {
    window.localStorage.setItem(FLOW_MODE_STORAGE_KEY, "broken");
    expect(readFlowModePreference(window.localStorage)).toBe("auto");
    expect(readFlowModePreference(null)).toBe("auto");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm test -- tests/unit/infinite-flow/preference.test.ts --runInBand
```

Expected: FAIL because `@/lib/infinite-flow/preference` does not exist.

- [ ] **Step 3: 创建领域类型**

```ts
// src/lib/infinite-flow/types.ts
import type { AnnotationLink } from "@/types";

export type FlowMode = "auto" | "manual";

export type FlowStatus =
  | "idle"
  | "searching"
  | "annotating"
  | "dwelling"
  | "paused"
  | "exhausted"
  | "error";

export type FlowPauseReason = "user" | "review" | "hidden" | "error" | null;
export type FlowTrigger = "root" | "automatic" | "manual-branch" | "retry";

export interface FlowRuntimeState {
  status: FlowStatus;
  pauseReason: FlowPauseReason;
  following: boolean;
  lastError: string | null;
}

export interface FlowSelectionContext {
  links: readonly AnnotationLink[];
  visitedPassageIds: ReadonlySet<string>;
  recentSources: readonly string[];
  sessionSeed: string;
  depth: number;
}
```

- [ ] **Step 4: 实现安全偏好读写**

```ts
// src/lib/infinite-flow/preference.ts
import type { FlowMode } from "@/lib/infinite-flow/types";

export const FLOW_MODE_STORAGE_KEY = "infidao:flow-mode:v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readFlowModePreference(storage: StorageLike | null): FlowMode {
  if (!storage) return "auto";

  try {
    return storage.getItem(FLOW_MODE_STORAGE_KEY) === "manual" ? "manual" : "auto";
  } catch {
    return "auto";
  }
}

export function writeFlowModePreference(
  storage: StorageLike | null,
  mode: FlowMode,
): void {
  if (!storage) return;

  try {
    storage.setItem(FLOW_MODE_STORAGE_KEY, mode);
  } catch {
    // The current session still uses the selected mode when storage is unavailable.
  }
}
```

- [ ] **Step 5: 运行测试与类型检查**

Run:

```bash
npm test -- tests/unit/infinite-flow/preference.test.ts --runInBand
npm run type-check:app
```

Expected: PASS; type-check exits 0.

- [ ] **Step 6: 提交**

```bash
git add src/lib/infinite-flow/types.ts src/lib/infinite-flow/preference.ts tests/unit/infinite-flow/preference.test.ts
git commit -m "feat(flow): add mode preference contract"
```

### Task 2: 实现稳定分支策略与 20-ID 服务端窗口

**Files:**
- Create: `src/lib/infinite-flow/policy.ts`
- Test: `tests/unit/infinite-flow/policy.test.ts`
- Modify: `src/components/home/HomeEntryExperience.tsx:489-491`

- [ ] **Step 1: 写分支与访问窗口失败测试**

```ts
import {
  buildVisitedPassageWindow,
  selectNextFlowLink,
} from "@/lib/infinite-flow/policy";
import type { AnnotationLink } from "@/types";
import type { WikiStack } from "@/lib/wiki/service";

const links: AnnotationLink[] = [
  {
    passageId: "same-source",
    label: "同源",
    relationHint: "相互呼应",
    passageText: "同源原文",
    source: "论语",
    chapter: "学而",
    section: 2,
  },
  {
    passageId: "new-source",
    label: "异源",
    relationHint: "形成对照",
    passageText: "异源原文",
    source: "孟子",
    chapter: "梁惠王",
    section: 1,
  },
];

describe("infinite-flow policy", () => {
  it("excludes every client-visited passage", () => {
    const selected = selectNextFlowLink({
      links,
      visitedPassageIds: new Set(["same-source"]),
      recentSources: ["论语"],
      sessionSeed: "此刻一念",
      depth: 4,
    });

    expect(selected?.passageId).toBe("new-source");
  });

  it("is stable for the same session and depth", () => {
    const context = {
      links,
      visitedPassageIds: new Set<string>(),
      recentSources: ["论语"],
      sessionSeed: "此刻一念",
      depth: 4,
    };

    expect(selectNextFlowLink(context)).toEqual(selectNextFlowLink(context));
  });

  it("returns null when every candidate was visited", () => {
    expect(
      selectNextFlowLink({
        links,
        visitedPassageIds: new Set(["same-source", "new-source"]),
        recentSources: [],
        sessionSeed: "此刻一念",
        depth: 4,
      }),
    ).toBeNull();
  });

  it("sends only the latest 20 unique ids to annotate", () => {
    const stack = Array.from({ length: 25 }, (_, index) => ({
      id: `p-${index}`,
      depth: index,
      query: "此刻一念",
      annotation: {
        passageId: `p-${index}`,
        passageText: `原文 ${index}`,
        sixToMe: "注我",
        meToSix: "回注",
        links: [],
      },
    })) as WikiStack;

    const window = buildVisitedPassageWindow(stack, "p-25");

    expect(window).toHaveLength(20);
    expect(window[0]).toBe("p-6");
    expect(window.at(-1)).toBe("p-25");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm test -- tests/unit/infinite-flow/policy.test.ts --runInBand
```

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: 实现纯函数策略**

```ts
// src/lib/infinite-flow/policy.ts
import type { FlowSelectionContext } from "@/lib/infinite-flow/types";
import type { AnnotationLink } from "@/types";
import type { WikiStack } from "@/lib/wiki/service";

export const ANNOTATE_VISITED_WINDOW_SIZE = 20;

function stableFraction(value: string): number {
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 0xffffffff;
}

function scoreLink(
  link: AnnotationLink,
  index: number,
  linkCount: number,
  context: FlowSelectionContext,
): number {
  const rankScore = ((linkCount - index) / linkCount) * 0.6;
  const relationScore = link.relationHint ? 0.15 : 0;
  const sourceNovelty = context.recentSources.includes(link.source) ? 0 : 0.15;
  const jitter =
    stableFraction(`${context.sessionSeed}:${context.depth}:${link.passageId}`) * 0.1;

  return rankScore + relationScore + sourceNovelty + jitter;
}

export function selectNextFlowLink(
  context: FlowSelectionContext,
): AnnotationLink | null {
  const candidates = context.links
    .filter(link => !context.visitedPassageIds.has(link.passageId))
    .map((link, index, available) => ({
      link,
      score: scoreLink(link, index, available.length, context),
    }))
    .sort((left, right) =>
      right.score !== left.score
        ? right.score - left.score
        : left.link.passageId.localeCompare(right.link.passageId),
    );

  return candidates[0]?.link ?? null;
}

export function buildVisitedPassageWindow(
  stack: WikiStack,
  nextPassageId: string,
): string[] {
  const ids = [
    ...new Set([...stack.map(node => node.annotation.passageId), nextPassageId]),
  ];

  return ids.slice(-ANNOTATE_VISITED_WINDOW_SIZE);
}
```

- [ ] **Step 4: 替换首页内未截断的访问 ID helper**

删除 `HomeEntryExperience.tsx` 内的本地 `buildVisitedPassageIds()`，导入并调用：

```ts
import { buildVisitedPassageWindow } from "@/lib/infinite-flow/policy";
```

在 annotate body 中使用：

```ts
visitedPassageIds: buildVisitedPassageWindow(branchBaseStack, link.passageId),
```

- [ ] **Step 5: 运行策略、annotate route 与主路径测试**

Run:

```bash
npm test -- tests/unit/infinite-flow/policy.test.ts tests/integration/api/annotate.route.test.ts tests/ui/home-main-path.regression.test.tsx --runInBand
```

Expected: all suites PASS.

- [ ] **Step 6: 提交**

```bash
git add src/lib/infinite-flow/policy.ts src/components/home/HomeEntryExperience.tsx tests/unit/infinite-flow/policy.test.ts
git commit -m "fix(flow): bound visited annotation context"
```

### Task 3: 为 WikiStack 增加从任意深度分叉

**Files:**
- Modify: `src/lib/wiki/service.ts`
- Modify: `tests/unit/wiki/service.test.ts`

- [ ] **Step 1: 写分叉失败测试**

```ts
import {
  branchWikiStack,
  createWikiRoot,
  pushWikiNode,
} from "@/lib/wiki/service";
import type { AnnotationLink, AnnotationResult } from "@/types";

function annotation(id: string): AnnotationResult {
  return {
    passageId: id,
    passageText: `原文 ${id}`,
    sixToMe: `注我 ${id}`,
    meToSix: `回注 ${id}`,
    links: [],
  };
}

const branch: AnnotationLink = {
  passageId: "new-3",
  label: "新支流",
  passageText: "新原文",
  source: "孟子",
  chapter: "梁惠王",
  section: 1,
};

it("truncates descendants before appending a branch", () => {
  const root = createWikiRoot("一念", annotation("p-0"));
  const depth1 = pushWikiNode(root, { query: "一念", annotation: annotation("p-1") });
  const depth2 = pushWikiNode(depth1, { query: "一念", annotation: annotation("p-2") });
  const oldDepth3 = pushWikiNode(depth2, { query: "一念", annotation: annotation("old-3") });

  const next = branchWikiStack(oldDepth3, 2, {
    query: "一念",
    annotation: annotation("new-3"),
    via: branch,
  });

  expect(next.map(node => node.id)).toEqual(["p-0", "p-1", "p-2", "new-3"]);
  expect(next[3]?.depth).toBe(3);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm test -- tests/unit/wiki/service.test.ts --runInBand
```

Expected: FAIL because `branchWikiStack` is not exported.

- [ ] **Step 3: 实现分叉 helper**

```ts
export function branchWikiStack(
  stack: WikiStack,
  fromDepth: number,
  options: PushWikiNodeOptions,
): WikiStack {
  const safeDepth = Math.min(Math.max(0, fromDepth), Math.max(0, stack.length - 1));
  const branchBase = stack.slice(0, safeDepth + 1);

  return [...branchBase, buildWikiNode(options, branchBase.length)];
}
```

- [ ] **Step 4: 运行 wiki 与首页回归测试**

Run:

```bash
npm test -- tests/unit/wiki/service.test.ts tests/ui/home-main-path.regression.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 5: 提交**

```bash
git add src/lib/wiki/service.ts tests/unit/wiki/service.test.ts
git commit -m "feat(wiki): support branching from prior depth"
```

### Task 4: 实现自动流控制器

**Files:**
- Create: `src/hooks/useInfiniteFlow.ts`
- Test: `tests/ui/infinite-flow-controller.test.tsx`

- [ ] **Step 1: 写控制器行为测试 harness**

测试必须覆盖以下真实时序，不用只断言 class name：

```tsx
function Harness({ mode = "auto" }: { mode?: FlowMode }) {
  const [stack, setStack] = useState<WikiStack>([]);
  const startRoot = jest.fn();
  const continueFrom = jest.fn();
  const controller = useInfiniteFlow({
    mode,
    enabled: true,
    query: "如何安住",
    hasSearched: true,
    isSearching: false,
    isAnnotating: false,
    searchResults: [rootResult],
    stack,
    error: null,
    dwellMs: 4000,
    onStartRoot: startRoot,
    onContinue: continueFrom,
    onCancelPending: jest.fn(),
  });

  return (
    <div>
      <span data-testid="flow-status">{controller.state.status}</span>
      <button onClick={controller.pause}>pause</button>
      <button onClick={controller.resume}>resume</button>
      <button onClick={() => setStack(rootStack)}>append-root</button>
    </div>
  );
}
```

添加断言：

1. 自动模式在 search 完成且 stack 为空时只调用一次 `onStartRoot(rootResult)`。
2. root 进入 stack 后等待 4000ms，再调用一次 `onContinue(selectedLink, 0, "automatic")`。
3. 3999ms 时不调用。
4. pause、切 manual、unmount、`document.hidden` 清理 timer。
5. resume 会重新安排当前深度，但不会重复已完成节点。
6. stack 当前节点无 links 时进入 `exhausted`。
7. error 时进入 `error`，不自动重试。

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm test -- tests/ui/infinite-flow-controller.test.tsx --runInBand
```

Expected: FAIL because `useInfiniteFlow` does not exist.

- [ ] **Step 3: 实现 hook 的稳定接口**

```ts
// src/hooks/useInfiniteFlow.ts
export const DEFAULT_FLOW_DWELL_MS = 4_000;

export interface UseInfiniteFlowOptions {
  mode: FlowMode;
  enabled: boolean;
  query: string;
  hasSearched: boolean;
  isSearching: boolean;
  isAnnotating: boolean;
  searchResults: readonly SearchResult[];
  stack: WikiStack;
  error: string | Error | null;
  dwellMs?: number;
  onStartRoot(result: SearchResult): void;
  onContinue(link: AnnotationLink, fromDepth: number, trigger: FlowTrigger): void;
  onCancelPending(): void;
}

export interface InfiniteFlowController {
  state: FlowRuntimeState;
  pause(reason?: Exclude<FlowPauseReason, null>): void;
  resume(): void;
  retry(): void;
  setFollowing(following: boolean): void;
}
```

实现必须使用 `useRef` 保存 timer、已启动 query key、已消费 depth 和最新 callbacks；effect 只依据稳定值触发。核心调度顺序固定为：

```ts
const currentNode = currentWikiNode(stack);
const visitedPassageIds = new Set(stack.map(node => node.annotation.passageId));
const recentSources = stack
  .slice(-3)
  .map(node => node.via?.source)
  .filter((source): source is string => Boolean(source));
const link = currentNode
  ? selectNextFlowLink({
      links: currentNode.annotation.links,
      visitedPassageIds,
      recentSources,
      sessionSeed: query,
      depth: currentNode.depth,
    })
  : null;
```

Timer 回调必须先将当前 depth 标记为 consumed，再调用：

```ts
onContinueRef.current(link, currentNode.depth, "automatic");
```

cleanup 必须执行：

```ts
window.clearTimeout(timerRef.current ?? undefined);
timerRef.current = null;
onCancelPendingRef.current();
```

注意：mode 切换或 review pause 可以取消自动请求；不得取消用户在手动模式显式发起的请求。为此 `HomeEntryExperience` 需要区分 request trigger，并只把 automatic request controller 传给 `onCancelPending`。

- [ ] **Step 4: 运行 controller、timer cleanup 和类型测试**

Run:

```bash
npm test -- tests/ui/infinite-flow-controller.test.tsx tests/ui/home-page.animation-cleanup.test.tsx --runInBand
npm run type-check:app
```

Expected: PASS; no open-handle warning.

- [ ] **Step 5: 提交**

```bash
git add src/hooks/useInfiniteFlow.ts tests/ui/infinite-flow-controller.test.tsx
git commit -m "feat(flow): add serial continuation controller"
```

### Task 5: 实现智能自动滚屏

**Files:**
- Create: `src/hooks/useSmartAutoScroll.ts`
- Test: `tests/ui/infinite-flow-autoscroll.test.tsx`

- [ ] **Step 1: 写滚屏失败测试**

测试使用 fake RAF/clock 和可控 document 高度，覆盖：

```tsx
const { result, unmount } = renderHook(() =>
  useSmartAutoScroll({
    active: true,
    itemCount: 2,
    reducedMotion: false,
    onReviewStart,
  }),
);

act(() => result.current.endRef.current?.dispatchEvent(new Event("flow-node-appended")));
expect(requestAnimationFrame).toHaveBeenCalled();

fireEvent.wheel(window, { deltaY: -40 });
expect(onReviewStart).toHaveBeenCalledTimes(1);
expect(result.current.following).toBe(false);

unmount();
expect(cancelAnimationFrame).toHaveBeenCalled();
```

另测 reduced motion：不启动连续 RAF；itemCount 增加时调用 `scrollIntoView({ behavior: "auto", block: "end" })`。

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm test -- tests/ui/infinite-flow-autoscroll.test.tsx --runInBand
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: 实现滚屏接口与行为**

```ts
// src/hooks/useSmartAutoScroll.ts
export interface UseSmartAutoScrollOptions {
  active: boolean;
  itemCount: number;
  reducedMotion: boolean;
  onReviewStart(): void;
}

export interface SmartAutoScrollController {
  endRef: RefObject<HTMLDivElement | null>;
  following: boolean;
  returnToCurrent(): void;
}
```

实现规则：

- 基础速度 8 px/s；距离底部超过一屏时最高 28 px/s。
- 使用 RAF timestamp 计算 delta，不允许 `setInterval(16)`。
- `wheel.deltaY < 0`、PageUp、Home、ArrowUp、触摸后距离底部超过 120px时 detach。
- 程序自身改变 scrollTop 时设置 `programmaticScrollRef`，不得把自己的滚动误判为用户回看。
- `returnToCurrent()` 先 `endRef.current?.scrollIntoView(...)`，再恢复 following。
- cleanup 移除 `wheel`、`keydown`、`touchstart`、`scroll` 监听并 cancel RAF。
- 页面隐藏时 RAF 停止；恢复由无限流 controller 决定。

- [ ] **Step 4: 运行滚屏与 ritual-scroll 回归测试**

Run:

```bash
npm test -- tests/ui/infinite-flow-autoscroll.test.tsx tests/ui/ritual-scroll-page.test.tsx --runInBand
```

Expected: PASS; no open handles.

- [ ] **Step 5: 提交**

```bash
git add src/hooks/useSmartAutoScroll.ts tests/ui/infinite-flow-autoscroll.test.tsx
git commit -m "feat(flow): add smart reading follow"
```

### Task 6: 构建模式开关、流节点和控制条

**Files:**
- Create: `src/components/flow/FlowModeSwitch.tsx`
- Create: `src/components/flow/FlowControls.tsx`
- Create: `src/components/flow/FlowNodeCard.tsx`
- Create: `src/components/flow/InfiniteFlowStream.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/ui/infinite-flow-components.test.tsx`

- [ ] **Step 1: 写组件失败测试**

覆盖以下断言：

```tsx
render(<FlowModeSwitch mode="auto" onChange={onChange} />);
expect(screen.getByRole("radiogroup", { name: "探索模式" })).toBeInTheDocument();
expect(screen.getByRole("radio", { name: "自动流" })).toHaveAttribute("aria-checked", "true");
fireEvent.click(screen.getByRole("radio", { name: "手动探索" }));
expect(onChange).toHaveBeenCalledWith("manual");
```

```tsx
render(
  <InfiniteFlowStream
    stack={stackWithTwoNodes}
    activeDepth={1}
    isAnnotating={false}
    endRef={endRef}
    onBranch={onBranch}
  />,
);
expect(screen.getAllByRole("article")).toHaveLength(2);
fireEvent.click(screen.getByRole("button", { name: /进入下一句/u }));
expect(onBranch).toHaveBeenCalledWith(1, expect.objectContaining({ passageId: "next" }));
```

所有模式、暂停、继续和回到当前按钮必须至少 `min-h-11`，并具有可读名称和 `aria-pressed`/`aria-checked`。

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm test -- tests/ui/infinite-flow-components.test.tsx --runInBand
```

Expected: FAIL because the flow components do not exist.

- [ ] **Step 3: 实现 FlowModeSwitch**

组件使用 `role="radiogroup"` 和两个 `role="radio"` 按钮。文案固定为：

- 自动流：`经文自行续写并缓慢前行`
- 手动探索：`由你选择每一次转向`

点击仅调用 `onChange(mode)`；持久化由首页负责，组件不访问 storage。

- [ ] **Step 4: 实现 FlowNodeCard**

每个节点必须显示：

1. `第 N 念` 与出处；根节点出处从 `rootResult` 映射，后续从 `node.via` 获取。
2. `annotation.passageText`。
3. `六经注我` 与 `annotation.sixToMe`。
4. `我注六经` 与 `annotation.meToSix`。
5. 可选 `GrowthTrace`。
6. 当前节点才显示 `AnnotationLinks`；历史节点显示“从此处分叉”，展开后再显示链接，防止按钮墙。
7. 分支回调固定为 `onBranch(node.depth, link)`。

历史节点正文静态显示；当前新节点可以复用 `SixToMeView`/`MeToSixView` 渐显，但 reduced motion 必须立即完整显示。

- [ ] **Step 5: 实现 InfiniteFlowStream 与 FlowControls**

`InfiniteFlowStream` 使用中心单栏 `max-w-3xl`，节点间用竖向纸墨连接线；末尾放置：

```tsx
<div ref={endRef} data-testid="infinite-flow-end" aria-hidden="true" />
```

`FlowControls` 状态文案固定映射：

```ts
const STATUS_COPY: Record<FlowStatus, string> = {
  idle: "等待一念",
  searching: "正在寻经",
  annotating: "下一念正在成形",
  dwelling: "念念相续",
  paused: "思想流已停驻",
  exhausted: "此卷暂止",
  error: "续写暂时中断",
};
```

- [ ] **Step 6: 增加样式与 reduced-motion 降级**

在 `globals.css` 增加 `.infinite-flow-line`、`.infinite-flow-node--active`、`.infinite-flow-following`。不要创建第二套颜色变量；只使用 `paper`、`ink`、`zen`、`seal` 和 `reader-*` tokens。`prefers-reduced-motion` 下禁用节点位移与平滑过渡。

- [ ] **Step 7: 运行组件、a11y 和类型测试**

Run:

```bash
npm test -- tests/ui/infinite-flow-components.test.tsx tests/ui/annotation-panel.a11y.test.tsx --runInBand
npm run type-check:app
```

Expected: PASS.

- [ ] **Step 8: 提交**

```bash
git add src/components/flow src/app/globals.css tests/ui/infinite-flow-components.test.tsx
git commit -m "feat(flow): add infinite reading stream UI"
```

### Task 7: 将自动流接入现有 HomeEntryExperience

**Files:**
- Modify: `src/components/home/HomeEntryExperience.tsx:755-1591`
- Modify: `src/components/annotation/AnnotationPanel.tsx`
- Test: `tests/ui/infinite-flow-home.test.tsx`
- Modify: `tests/ui/home-main-path.regression.test.tsx`

- [ ] **Step 1: 写完整自动链失败测试**

mock 三次请求：search、root annotate、next annotate。测试流程：

```tsx
render(<HomeEntryExperience />);
fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
  target: { value: "如何安住眼前" },
});
fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
expect(screen.getByText("根层注释")).toBeInTheDocument();

act(() => jest.advanceTimersByTime(4_000));
await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
expect(await screen.findByText("第二层注释")).toBeInTheDocument();
expect(screen.getAllByRole("article")).toHaveLength(2);
```

验证第二次 annotate body 包含 root ID；第 21 层后的 body 仍最多 20 个 IDs。

- [ ] **Step 2: 写模式切换与记忆失败测试**

1. localStorage 空：自动流 radio checked。
2. 选择手动后重新 mount：手动 radio checked。
3. 手动模式 search 后不自动 annotate。
4. 手动模式现有“用这一句回应我”路径继续通过。
5. 自动切手动会清理 continuation timer。

- [ ] **Step 3: 初始化模式并组合两个 hooks**

首页新增状态：

```ts
const [flowMode, setFlowMode] = useState<FlowMode>("auto");
const [flowPreferenceReady, setFlowPreferenceReady] = useState(false);
```

mount 后读取 localStorage，避免 hydration 阶段访问浏览器对象：

```ts
useEffect(() => {
  setFlowMode(readFlowModePreference(window.localStorage));
  setFlowPreferenceReady(true);
}, []);
```

切换时写入偏好并保留 query、search results、annotation、stack：

```ts
const handleFlowModeChange = (mode: FlowMode) => {
  setFlowMode(mode);
  writeFlowModePreference(window.localStorage, mode);
};
```

- [ ] **Step 4: 区分自动与手动 annotate trigger**

将 root 与 link 请求收敛为两个内部函数：

```ts
performRootAnnotation(result: SearchResult, trigger: FlowTrigger): Promise<void>
performLinkAnnotation(
  link: AnnotationLink,
  fromDepth: number,
  trigger: FlowTrigger,
): Promise<void>
```

request ref 记录 trigger：

```ts
const annotationRequestRef = useRef<{
  id: number;
  controller: AbortController | null;
  trigger: FlowTrigger | null;
}>({ id: 0, controller: null, trigger: null });
```

自动 controller 的 `onCancelPending` 只 abort `trigger === "root" || trigger === "automatic"` 的请求；手动点击不受自动 mode effect 误伤。

- [ ] **Step 5: 接入自动起句与续写**

```ts
const infiniteFlow = useInfiniteFlow({
  mode: flowMode,
  enabled: flowPreferenceReady && !hasActiveFrictionGate,
  query: searchQuery,
  hasSearched,
  isSearching,
  isAnnotating,
  searchResults,
  stack: wikiStack,
  error: searchError ?? annotationError,
  onStartRoot: result => void performRootAnnotation(result, "root"),
  onContinue: (link, depth, trigger) =>
    void performLinkAnnotation(link, depth, trigger),
  onCancelPending: cancelAutomaticAnnotationRequest,
});
```

自动模式仍保留短问方向 gate；gate 完成 search 后 controller 接管。自动模式跳过每节点 reading gate；手动模式保留 reading gate。

- [ ] **Step 6: 正确提交分叉结果**

`performLinkAnnotation()` 请求前计算：

```ts
const branchBaseStack = wikiStack.slice(0, fromDepth + 1);
```

成功后更新：

```ts
setWikiStack(currentStack =>
  branchWikiStack(currentStack, fromDepth, {
    query: searchQuery.trim(),
    annotation: payload.data,
    via: link,
  }),
);
```

`AnnotationPanel` 当前节点手动链接传入当前 depth；`InfiniteFlowStream` 历史分支传入节点 depth。

- [ ] **Step 7: 按模式渲染而不复制首页**

- 搜索前：在输入框上方或下方渲染 `FlowModeSwitch`。
- 自动模式 search 完成后：隐藏结果列表选择步骤，显示 `InfiniteFlowStream`、`FlowControls`。
- 手动模式：保留现有 SearchResults + AnnotationPanel 布局。
- 自动模式切手动：显示当前节点的 AnnotationPanel 和卷路，stack 不清空。
- 手动切自动：如果已有当前 annotation，从当前节点继续；如果只有结果，从第一名起句。

- [ ] **Step 8: 将回看信号连接到 flow pause**

```ts
const smartScroll = useSmartAutoScroll({
  active: flowMode === "auto" && infiniteFlow.state.status !== "paused",
  itemCount: wikiStack.length,
  reducedMotion: prefersReducedMotion,
  onReviewStart: () => infiniteFlow.pause("review"),
});
```

“回到当前并继续”依次调用：

```ts
smartScroll.returnToCurrent();
infiniteFlow.setFollowing(true);
infiniteFlow.resume();
```

- [ ] **Step 9: 运行自动、手动、移动端和 cleanup 测试**

Run:

```bash
npm test -- tests/ui/infinite-flow-home.test.tsx tests/ui/home-main-path.regression.test.tsx tests/ui/home-page.search.test.tsx tests/ui/home-page.animation-cleanup.test.tsx tests/ui/home-page.reduced-motion.test.tsx --runInBand
```

Expected: all suites PASS; no timer/RAF/open-handle warning.

- [ ] **Step 10: 提交**

```bash
git add src/components/home/HomeEntryExperience.tsx src/components/annotation/AnnotationPanel.tsx tests/ui/infinite-flow-home.test.tsx tests/ui/home-main-path.regression.test.tsx
git commit -m "feat(flow): restore automatic infinite reading"
```

### Task 8: 处理错误、限流、无链接和页面可见性

**Files:**
- Modify: `src/hooks/useInfiniteFlow.ts`
- Modify: `src/components/flow/FlowControls.tsx`
- Modify: `src/components/home/HomeEntryExperience.tsx`
- Test: `tests/ui/infinite-flow-recovery.test.tsx`

- [ ] **Step 1: 写恢复路径失败测试**

覆盖：

1. annotation 返回 429：状态为 error，只出现一次请求，显示“稍后继续”和“切换手动探索”。
2. 网络失败：不自动 retry；点击“重试当前节点”只请求一次。
3. links 为空：状态 exhausted，timer 未创建。
4. `visibilitychange` hidden：暂停并取消 timer；visible 只恢复 hidden pause，不覆盖 user/review pause。
5. resetHome：清理 stack、timer、RAF 和 request，但保留模式偏好。
6. 新 query：创建新流 session，旧 query timer 不得触发。

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm test -- tests/ui/infinite-flow-recovery.test.tsx --runInBand
```

Expected: at least the 429, visibility, or no-link assertion fails before hardening.

- [ ] **Step 3: 增加明确错误动作**

错误态不使用指数自动重试。固定动作：

- `重试当前节点`：复用 `retryTargetRef`，trigger 为 `retry`。
- `切换手动探索`：保留当前 stack 和 query。
- `换一念重新开始`：调用现有 `resetHome`。

429 文案：`续写速度触及当前上限，停一息后可以继续。`
网络错误文案：`思想流暂时中断，已经生成的卷路仍在。`

- [ ] **Step 4: 增加 visibility cleanup**

hidden 时只在当前不是 user/review pause 时记录 `hidden`；visible 时只有 `pauseReason === "hidden"` 才恢复。不得在 visibility handler 内直接发请求，由 controller 正常 effect 调度。

- [ ] **Step 5: 运行恢复、abuse guard 和 cleanup 测试**

Run:

```bash
npm test -- tests/ui/infinite-flow-recovery.test.tsx tests/unit/annotation/abuse-guard.test.ts tests/ui/home-page.animation-cleanup.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 6: 提交**

```bash
git add src/hooks/useInfiniteFlow.ts src/components/flow/FlowControls.tsx src/components/home/HomeEntryExperience.tsx tests/ui/infinite-flow-recovery.test.tsx
git commit -m "fix(flow): make infinite sessions recoverable"
```

### Task 9: 更新产品文档与发布验收

**Files:**
- Modify: `docs/SUPERPOWERS_REBOOT_PLAN.md:242-264,479-507,689-700,838-840`
- Modify: `docs/qa/reboot-mvp-acceptance-checklist.md`
- Modify: `README.md`
- Modify: `tests/unit/docs/acceptance-checklist.test.ts`

- [ ] **Step 1: 更新冲突架构结论**

把“自动无限续写、自动滚屏”从 8.1.3、10.2、10.3、Stage 2 视觉说明和风险结论中的“不继承/非 MVP”表述全部删除，替换为：

```markdown
必须恢复的产品机制：

- 自动无限续写是默认探索模式，手动探索是平级可切换模式。
- 自动滚屏只在用户保持跟随时工作；用户回看后暂停，明确恢复后继续。
- 续写由当前 search/annotation 服务端契约驱动，前端不直连模型。
- 自动请求始终串行、可取消、可恢复，并遵守现有限流与 reduced-motion 约束。
```

- [ ] **Step 2: 更新 README 用户路径**

增加：模式默认规则、暂停/继续、回看暂停、从历史节点分叉、错误恢复；明确 `ref/` 旧版不参与生产构建。

- [ ] **Step 3: 更新 release contract**

在 `tests/unit/docs/acceptance-checklist.test.ts` 中断言文档包含：

```ts
expect(checklist).toContain("自动流与手动探索均可用");
expect(checklist).toContain("连续 25 层不触发 visitedPassageIds 校验失败");
expect(checklist).toContain("回看时停止续写，明确恢复后继续");
expect(checklist).toContain("reduced motion 不执行连续滚屏");
```

- [ ] **Step 4: 运行文档 contract 测试**

Run:

```bash
npm test -- tests/unit/docs/acceptance-checklist.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: 提交**

```bash
git add docs/SUPERPOWERS_REBOOT_PLAN.md docs/qa/reboot-mvp-acceptance-checklist.md README.md tests/unit/docs/acceptance-checklist.test.ts
git commit -m "docs(flow): restore infinite stream product contract"
```

### Task 10: 完整验证与发布收口

**Files:**
- Modify only if a verification failure proves a source defect in files already listed above.

- [ ] **Step 1: 运行 focused flow suites**

```bash
npm test -- tests/unit/infinite-flow tests/unit/wiki/service.test.ts tests/ui/infinite-flow-controller.test.tsx tests/ui/infinite-flow-autoscroll.test.tsx tests/ui/infinite-flow-components.test.tsx tests/ui/infinite-flow-home.test.tsx tests/ui/infinite-flow-recovery.test.tsx --runInBand
```

Expected: all suites PASS; no open handles.

- [ ] **Step 2: 运行原首页回归套件**

```bash
npm test -- tests/ui/home-main-path.regression.test.tsx tests/ui/home-page.search.test.tsx tests/ui/home-friction-gate.test.tsx tests/ui/home-page.animation-cleanup.test.tsx tests/ui/home-page.reduced-motion.test.tsx tests/ui/annotation-panel.a11y.test.tsx tests/ui/layout-polish.test.tsx --runInBand
```

Expected: all suites PASS.

- [ ] **Step 3: 运行 API、annotation 和 wiki 相关套件**

```bash
npm test -- tests/integration/api/search.route.test.ts tests/integration/api/annotate.route.test.ts tests/unit/annotation tests/unit/wiki/service.test.ts --runInBand
```

Expected: all suites PASS.

- [ ] **Step 4: 运行静态质量门**

```bash
npm run type-check
npm run lint
npm run format:check
```

Expected: all commands exit 0; lint has zero warnings.

- [ ] **Step 5: 运行完整测试、构建与 release smoke**

```bash
npm test -- --runInBand --no-cache
npm run build
npm run smoke:release
```

Expected: full suite PASS; production build succeeds; standalone smoke exits 0.

- [ ] **Step 6: 手工验收，不使用 Playwright 作为默认实现工具**

在桌面和移动浏览器手工验证：

1. 首次自动流、刷新后模式记忆。
2. 自动连续 5 层，速度稳定、无并发。
3. 向上回看停止续写，回到当前恢复。
4. 从第 2 层点击另一候选，旧后续路径被替换。
5. 切手动后完整手动主路径可用。
6. reduced motion 下续写继续、滚屏无连续动画。
7. 断网后错误态保留已生成路径，恢复网络可重试。

- [ ] **Step 7: 记录验证证据并提交最终修复**

若验证没有产生源修复，不创建空提交。若产生修复：

```bash
git add src/lib/infinite-flow/types.ts src/lib/infinite-flow/preference.ts src/lib/infinite-flow/policy.ts src/lib/wiki/service.ts src/hooks/useInfiniteFlow.ts src/hooks/useSmartAutoScroll.ts src/components/flow/FlowModeSwitch.tsx src/components/flow/FlowControls.tsx src/components/flow/FlowNodeCard.tsx src/components/flow/InfiniteFlowStream.tsx src/components/home/HomeEntryExperience.tsx src/components/annotation/AnnotationPanel.tsx src/app/globals.css tests/unit/infinite-flow/preference.test.ts tests/unit/infinite-flow/policy.test.ts tests/unit/wiki/service.test.ts tests/ui/infinite-flow-controller.test.tsx tests/ui/infinite-flow-autoscroll.test.tsx tests/ui/infinite-flow-components.test.tsx tests/ui/infinite-flow-home.test.tsx tests/ui/infinite-flow-recovery.test.tsx tests/ui/home-main-path.regression.test.tsx docs/SUPERPOWERS_REBOOT_PLAN.md docs/qa/reboot-mvp-acceptance-checklist.md README.md tests/unit/docs/acceptance-checklist.test.ts
git commit -m "fix(flow): close infinite stream release gaps"
```

## 6. 明确不在本计划内

- 不恢复浏览器直连 Gemini 或在客户端保存模型 API key。
- 不引入 SSE/WebSocket 长连接；当前单节点 JSON 请求足以实现串行无限流。
- 不新增跨设备账号同步或永久思想流存档。
- 不引入 Canvas、WebGL 或新的动画运行时。
- 不重写 search ranking、annotation prompt、graph artifact 或 A2A growth 算法。
- 不删除现有手动模式、预览路由或 ritual-scroll 验证页。

## 7. 风险与控制

| 风险 | 控制 |
|---|---|
| 自动请求触及 20/min 限流 | 4 秒最小驻留、单请求串行、429 停机不自动重试 |
| 20 层后 visited payload 被拒 | 服务端窗口固定最后 20 个；客户端完整 stack 继续去重 |
| 回看时后台继续堆节点 | 回看信号同时暂停跟随和 continuation scheduling |
| 自动分支反复绕圈 | 完整 session visited set + 稳定候选策略 |
| mode/effect 竞态导致重复请求 | request id、trigger、consumed depth、timer ref 四重约束 |
| 长页面动画影响可访问性 | reduced motion 禁 RAF 连续滚屏；控制条始终可达 |
| 首页继续膨胀 | policy、controller、scroll、UI 分文件；Home 只组合状态与请求 |
| 手动体验被自动模式破坏 | 独立 mode branch + 现有 main-path regression 强制保留 |
