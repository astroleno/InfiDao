import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomePage from "@/app/page";

function createFetchResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  });
}

describe("HomePage search flow", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
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
    expect(screen.getByRole("button", { name: "进入注我" })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "中庸之道" }));

    expect(await screen.findByText("这一念暂未听见回响")).toBeInTheDocument();
  });

  it("shows a distinct error state when search fails", async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      createFetchResponse({
        success: false,
        error: {
          code: "SEARCH_FAILED",
          message: "search exploded",
        },
      }, false),
    );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "友谊的意义" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("经典暂时未能回应")).toBeInTheDocument();
    expect(screen.getByText("search exploded")).toBeInTheDocument();
  });

  it("opens the annotation panel from a selected search result", async () => {
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

    expect(await screen.findByText("段落: lunyu-1-8")).toBeInTheDocument();
    expect(screen.getByText("延伸: 1")).toBeInTheDocument();
    expect(screen.getByText("继续看自省")).toBeInTheDocument();
    expect(screen.queryByText("当前正在为这一句请求注释")).not.toBeInTheDocument();
    expect(screen.getByText("当前注释已展开，可沿右侧继续探索")).toBeInTheDocument();
    expect(screen.queryByText(/注释面板将在 Phase 3 接入/)).not.toBeInTheDocument();
  });

  it("prevents concurrent root annotation clicks while the current request is pending", async () => {
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

    expect(await screen.findByText("探索路径")).toBeInTheDocument();
    expect(screen.getByText("第 1 层")).toBeInTheDocument();
    expect(screen.getAllByText("lunyu-1-8").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "探索此段落" }));

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

    expect(await screen.findByText("第 2 层")).toBeInTheDocument();
    expect(screen.getAllByText("lunyu-1-4").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "返回上一层" }));

    expect(await screen.findByText("第 1 层")).toBeInTheDocument();
    expect(screen.getAllByText("lunyu-1-8").length).toBeGreaterThan(0);
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
    expect(await screen.findByText("第 1 层")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "探索此段落" }));
    expect(await screen.findByText("第 2 层")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "进入注我" })[1] as HTMLElement);

    expect((await screen.findAllByText("daxue-2-2")).length).toBeGreaterThan(0);
    expect(screen.getByText("第 1 层")).toBeInTheDocument();
    expect(screen.queryByText("第 2 层")).not.toBeInTheDocument();
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
    expect(await screen.findByText("第 1 层")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "探索此段落" }));
    expect(await screen.findByText("第 2 层")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "进入注我" })[1] as HTMLElement);

    expect(screen.queryByText("第 2 层")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "探索此段落" }));

    expect(await screen.findByText("此处暂无后续探索")).toBeInTheDocument();
  });
});
