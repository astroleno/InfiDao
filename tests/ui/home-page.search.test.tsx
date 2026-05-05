import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomePage from "@/app/page";

function createFetchResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  });
}

const defaultMatchMedia = window.matchMedia;
const defaultScrollIntoView = window.HTMLElement.prototype.scrollIntoView;

function mockMatchMedia({
  desktop = false,
  reducedMotion = false,
}: {
  desktop?: boolean;
  reducedMotion?: boolean;
} = {}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion")
        ? reducedMotion
        : query.includes("min-width: 1024px")
          ? desktop
          : false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

describe("HomePage search flow", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: defaultMatchMedia,
    });
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: defaultScrollIntoView,
    });
  });

  it("shows distinct loading and success states, and removes non-MVP affordances", async () => {
    let resolveSearch: ((value: unknown) => void) | undefined;

    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );

    render(<HomePage />);

    expect(screen.getByText("写下一念，按回车回应")).toBeInTheDocument();
    expect(screen.queryByText("按回车注入思想流")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "治理国家" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByRole("status", { name: "搜索进行中" })).toBeInTheDocument();
    expect(screen.getByText(/正在比对语义与原文/u)).toBeInTheDocument();
    expect(screen.queryByText("智能搜索")).not.toBeInTheDocument();

    resolveSearch?.(
      await createFetchResponse({
        success: true,
        data: [
          {
            id: "daxue-2-2",
            source: "大学",
            chapter: "传二章",
            section: 2,
            text: "身修而后家齐，家齐而后国治，国治而后天下平。",
            score: 0.9158,
          },
        ],
      }),
    );

    expect(await screen.findByText("身修而后家齐，家齐而后国治，国治而后天下平。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回到一念" }).className).toContain("min-h-11");
    expect(screen.getByText("改写这一念")).toHaveClass("min-h-11");
    expect(screen.getByText("连续探索")).toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "进入注我" })).toHaveAccessibleDescription(
      "大学 · 传二章 · 第 2 节",
    );
    expect(screen.queryByText("排序：")).not.toBeInTheDocument();
    expect(screen.queryByText("加载更多结果")).not.toBeInTheDocument();
    expect(screen.queryByText("知识图谱")).not.toBeInTheDocument();
  });

  it("shows a distinct empty state when search succeeds with no matches", async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      createFetchResponse({
        success: true,
        data: [],
      }),
    );

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "我需要重新找回分寸" }));

    expect(await screen.findByText("这一念暂未听见回响")).toBeInTheDocument();
    expect(screen.getByText("换一个更具体的处境，或回到一念重新发问。")).toBeInTheDocument();
    expect(screen.getByText("这一念暂未听见回响").closest("div")).not.toHaveClass("rounded-[2rem]");
    expect(screen.getByText("这一念暂未听见回响").closest("div")).toHaveClass("border-y");
  });

  it("shows a distinct error state when search fails and can retry the same query", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: false,
          error: {
            code: "SEARCH_FAILED",
            message: "search exploded",
          },
        }, false),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [
            {
              id: "lunyu-1-8",
              source: "论语",
              chapter: "学而篇",
              section: 8,
              text: "君子不重则不威，学则不固。",
              score: 0.6666,
            },
          ],
        }),
      );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "友谊的意义" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("经典暂时未能回应")).toBeInTheDocument();
    expect(screen.getByText("search exploded")).toBeInTheDocument();
    expect(screen.getByText("经典暂时未能回应").closest("div")).not.toHaveClass("rounded-[2rem]");
    expect(screen.getByText("经典暂时未能回应").closest("div")).toHaveClass("border-y");

    fireEvent.click(screen.getByRole("button", { name: "重新搜索" }));

    expect(await screen.findByText("君子不重则不威，学则不固。")).toBeInTheDocument();
  });

  it("opens the annotation panel from a selected search result", async () => {
    mockMatchMedia({ desktop: true });

    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [
            {
              id: "lunyu-1-8",
              source: "论语",
              chapter: "学而篇",
              section: 8,
              text: "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
              score: 0.6666,
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-8",
            passageText: "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
            sixToMe: "经典提醒你：如何面对困境，先稳住忠信与改过。",
            meToSix: "你的问题把这句读成一种自我整理的方法。",
            links: [
              {
                passageId: "lunyu-1-4",
                label: "继续看自省",
                passageText: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
                source: "论语",
                chapter: "学而篇",
                section: 4,
              },
            ],
          },
        }),
      );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "进入注我" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        "/api/annotate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            query: "如何面对困境",
            passageId: "lunyu-1-8",
            passageText: "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
            style: "modern",
            visitedPassageIds: ["lunyu-1-8"],
          }),
        }),
      );
    });

    expect(await screen.findByText("《论语·学而篇》第 8 节")).toBeInTheDocument();
    expect(screen.getByText("可继续互注")).toBeInTheDocument();
    expect(screen.getByText("继续看自省")).toBeInTheDocument();
    expect(screen.queryByText("取义中，此句暂不可重复进入")).not.toBeInTheDocument();
    expect(screen.queryByText(/注释面板将在 Phase 3 接入/)).not.toBeInTheDocument();
  });

  it("opens a mobile annotation reader and can return to the response list", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [
            {
              id: "lunyu-1-8",
              source: "论语",
              chapter: "学而篇",
              section: 8,
              text: "君子不重则不威，学则不固。",
              score: 0.6666,
            },
            {
              id: "daxue-2-2",
              source: "大学",
              chapter: "传二章",
              section: 2,
              text: "身修而后家齐。",
              score: 0.6,
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-8",
            passageText: "君子不重则不威，学则不固。",
            sixToMe: "根层注释",
            meToSix: "根层反观",
            links: [],
          },
        }),
      );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "进入注我" })[0] as HTMLElement);

    expect(await screen.findByText("注我卷轴")).toBeInTheDocument();
    expect(screen.getByText("签")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回到回应列表" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "展开全文" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("君子不重则不威，学则不固。")).toHaveClass("line-clamp-2");
    expect(screen.queryByText("经典回应")).not.toBeInTheDocument();
    expect(screen.queryByText("改写这一念")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开全文" }));

    expect(screen.getByRole("button", { name: "收起经文" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("君子不重则不威，学则不固。")).not.toHaveClass("line-clamp-2");

    fireEvent.click(screen.getByRole("button", { name: "回到回应列表" }));

    expect(screen.getByText("经典回应")).toBeInTheDocument();
    expect(screen.getByText("身修而后家齐。")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "回到注语" })).toHaveFocus();
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const reopenAnnotation = screen.getByRole("button", { name: "回到注语" });
    expect(reopenAnnotation).toHaveAccessibleDescription("论语 · 学而篇 · 第 8 节");
    fireEvent.click(reopenAnnotation);

    expect(await screen.findByText("注我卷轴")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("scrolls to the mobile annotation reader top and uses instant scroll for reduced motion", async () => {
    mockMatchMedia({ reducedMotion: true });
    const scrollIntoView = jest.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });

    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [
            {
              id: "lunyu-1-8",
              source: "论语",
              chapter: "学而篇",
              section: 8,
              text: "君子不重则不威，学则不固。",
              score: 0.6666,
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-8",
            passageText: "君子不重则不威，学则不固。",
            sixToMe: "根层注释",
            meToSix: "根层反观",
            links: [],
          },
        }),
      );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "进入注我" }));

    const reader = await screen.findByRole("region", { name: "注我阅读视图" });

    expect(reader.className).toContain("focus-visible:ring-1");
    expect(reader.className).not.toContain("focus:ring-2");
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "start",
        behavior: "auto",
      });
    });
    expect(scrollIntoView.mock.contexts[scrollIntoView.mock.contexts.length - 1]).toBe(reader);
    expect(reader).toHaveFocus();
  });

  it("keeps the mobile reading target in sync while a linked annotation is pending", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [
            {
              id: "lunyu-1-8",
              source: "论语",
              chapter: "学而篇",
              section: 8,
              text: "君子不重则不威，学则不固。",
              score: 0.6666,
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-8",
            passageText: "君子不重则不威，学则不固。",
            sixToMe: "根层注释",
            meToSix: "根层反观",
            links: [
              {
                passageId: "lunyu-1-4",
                label: "继续看自省",
                passageText: "吾日三省吾身。",
                source: "论语",
                chapter: "学而篇",
                section: 4,
              },
            ],
          },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise(() => {
            // Keep the linked annotation pending so the reader target is observable.
          }),
      );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "进入注我" }));
    expect(await screen.findByText("继续看自省")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /沿此句继续/u }));

    expect(await screen.findByText("《论语·学而篇》第 4 节")).toBeInTheDocument();
    expect(screen.getAllByText("吾日三省吾身。").length).toBeGreaterThan(0);
    expect(screen.queryByText("君子不重则不威，学则不固。")).not.toBeInTheDocument();
  });

  it("retries a failed annotation without losing the current search context", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [
            {
              id: "lunyu-1-8",
              source: "论语",
              chapter: "学而篇",
              section: 8,
              text: "君子不重则不威，学则不固。",
              score: 0.6666,
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: false,
          error: {
            code: "ANNOTATION_TIMEOUT",
            message: "provider timeout",
          },
        }, false),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-8",
            passageText: "君子不重则不威，学则不固。",
            sixToMe: "重试后的注语",
            meToSix: "重试后的反观",
            links: [],
          },
        }),
      );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "进入注我" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("未能为《论语·学而篇》第 8 节生成注语。provider timeout");
    expect(screen.getAllByText("君子不重则不威，学则不固。").length).toBeGreaterThan(0);
    expect(screen.getAllByText("如何面对困境").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "再取此义" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenNthCalledWith(
        3,
        "/api/annotate",
        expect.objectContaining({
          body: JSON.stringify({
            query: "如何面对困境",
            passageId: "lunyu-1-8",
            passageText: "君子不重则不威，学则不固。",
            style: "modern",
            visitedPassageIds: ["lunyu-1-8"],
          }),
        }),
      );
    });
    expect(await screen.findByRole("status", { name: "重试后的注语" })).toBeInTheDocument();
  });

  it("prevents concurrent root annotation clicks while the current request is pending", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });

    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [
            {
              id: "lunyu-1-8",
              source: "论语",
              chapter: "学而篇",
              section: 8,
              text: "君子不重则不威，学则不固。",
              score: 0.6666,
            },
            {
              id: "daxue-2-2",
              source: "大学",
              chapter: "传二章",
              section: 2,
              text: "身修而后家齐。",
              score: 0.6,
            },
          ],
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise(() => {
            // Keep the annotation pending so the button state is observable.
          }),
      );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "进入注我" })[0] as HTMLElement);

    expect(await screen.findByRole("button", { name: "注我中" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "请稍候" })).toBeDisabled();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("pushes linked annotations onto an exploration stack and can return to the previous layer", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [
            {
              id: "lunyu-1-8",
              source: "论语",
              chapter: "学而篇",
              section: 8,
              text: "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
              score: 0.6666,
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-8",
            passageText: "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
            sixToMe: "根层注释",
            meToSix: "根层反观",
            links: [
              {
                passageId: "lunyu-1-4",
                label: "继续看自省",
                passageText: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
                source: "论语",
                chapter: "学而篇",
                section: 4,
              },
            ],
          },
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-4",
            passageText: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
            sixToMe: "第二层注释",
            meToSix: "第二层反观",
            links: [],
          },
        }),
      );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "进入注我" }));

    expect(screen.queryByText("回响路径")).not.toBeInTheDocument();
    expect(await screen.findByText("继续看自省")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /沿此句继续/u }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenNthCalledWith(
        3,
        "/api/annotate",
        expect.objectContaining({
          body: JSON.stringify({
            query: "如何面对困境",
            passageId: "lunyu-1-4",
            passageText: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
            style: "modern",
            visitedPassageIds: ["lunyu-1-8", "lunyu-1-4"],
          }),
        }),
      );
    });

    expect(await screen.findByText("回响路径")).toBeInTheDocument();
    expect(screen.getByText("由此进入：论语 学而篇")).toBeInTheDocument();
    expect(screen.getByText("继续看自省")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "返回上一层" }));

    await waitFor(() => {
      expect(screen.queryByText("回响路径")).not.toBeInTheDocument();
    });
    expect(screen.getByText("继续看自省")).toBeInTheDocument();
  });

  it("resets the exploration stack when a different search result is selected", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [
            {
              id: "lunyu-1-8",
              source: "论语",
              chapter: "学而篇",
              section: 8,
              text: "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
              score: 0.6666,
            },
            {
              id: "daxue-2-2",
              source: "大学",
              chapter: "传二章",
              section: 2,
              text: "身修而后家齐，家齐而后国治，国治而后天下平。",
              score: 0.6,
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-8",
            passageText: "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
            sixToMe: "根层注释",
            meToSix: "根层反观",
            links: [
              {
                passageId: "lunyu-1-4",
                label: "继续看自省",
                passageText: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
                source: "论语",
                chapter: "学而篇",
                section: 4,
              },
            ],
          },
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-4",
            passageText: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
            sixToMe: "第二层注释",
            meToSix: "第二层反观",
            links: [],
          },
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "daxue-2-2",
            passageText: "身修而后家齐，家齐而后国治，国治而后天下平。",
            sixToMe: "新根层注释",
            meToSix: "新根层反观",
            links: [],
          },
        }),
      );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "进入注我" })[0] as HTMLElement);
    expect(await screen.findByText("继续看自省")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /沿此句继续/u }));
    expect(await screen.findByText("由此进入：论语 学而篇")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "回到回应列表" }));
    fireEvent.click(screen.getAllByRole("button", { name: "进入注我" })[1] as HTMLElement);

    expect(await screen.findByText("《大学·传二章》第 2 节")).toBeInTheDocument();
    expect(screen.getByText("签")).toBeInTheDocument();
    expect(screen.queryByText("由此进入：论语 学而篇")).not.toBeInTheDocument();
  });

  it("clears the prior exploration stack immediately when a different result is selected", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [
            {
              id: "lunyu-1-8",
              source: "论语",
              chapter: "学而篇",
              section: 8,
              text: "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
              score: 0.6666,
            },
            {
              id: "daxue-2-2",
              source: "大学",
              chapter: "传二章",
              section: 2,
              text: "身修而后家齐，家齐而后国治，国治而后天下平。",
              score: 0.6,
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-8",
            passageText: "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
            sixToMe: "根层注释",
            meToSix: "根层反观",
            links: [
              {
                passageId: "lunyu-1-4",
                label: "继续看自省",
                passageText: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
                source: "论语",
                chapter: "学而篇",
                section: 4,
              },
            ],
          },
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-4",
            passageText: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
            sixToMe: "第二层注释",
            meToSix: "第二层反观",
            links: [],
          },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise(() => {
            // Keep the second root annotation pending so the test can observe
            // the immediate click state before the response settles.
          }),
      );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "进入注我" })[0] as HTMLElement);
    expect(await screen.findByText("继续看自省")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /沿此句继续/u }));
    expect(await screen.findByText("由此进入：论语 学而篇")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "回到回应列表" }));
    fireEvent.click(screen.getAllByRole("button", { name: "进入注我" })[1] as HTMLElement);

    expect(screen.queryByText("由此进入：论语 学而篇")).not.toBeInTheDocument();
    expect(screen.queryByText("返回上一层")).not.toBeInTheDocument();
  });

  it("shows an explicit empty exploration state for a leaf annotation", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [
            {
              id: "lunyu-1-8",
              source: "论语",
              chapter: "学而篇",
              section: 8,
              text: "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
              score: 0.6666,
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-8",
            passageText: "君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。",
            sixToMe: "根层注释",
            meToSix: "根层反观",
            links: [
              {
                passageId: "lunyu-1-4",
                label: "继续看自省",
                passageText: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
                source: "论语",
                chapter: "学而篇",
                section: 4,
              },
            ],
          },
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: {
            passageId: "lunyu-1-4",
            passageText: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
            sixToMe: "第二层注释",
            meToSix: "第二层反观",
            links: [],
          },
        }),
      );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "进入注我" }));
    expect(await screen.findByText("继续看自省")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /沿此句继续/u }));

    expect(await screen.findByText("此处暂止，回到回应列表，或另择一句再入。")).toBeInTheDocument();
  });

  it("shows resonance levels without visible search percentages", async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      createFetchResponse({
        success: true,
        data: [
          {
            id: "lunyu-1-8",
            source: "论语",
            chapter: "学而篇",
            section: 8,
            text: "君子不重则不威，学则不固。",
            score: 0.6666,
          },
        ],
      }),
    );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("可深读")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: /可深读/u })).toBeInTheDocument();
    expect(screen.queryByText(/呼应度/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/67%/u)).not.toBeInTheDocument();
  });
});
