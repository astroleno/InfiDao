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

    expect(await screen.findByText("经典正在凝神回应")).toBeInTheDocument();
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

    expect(await screen.findByText("经典暂时未能回应")).toBeInTheDocument();
    expect(screen.getByText("search exploded")).toBeInTheDocument();
  });

  it("keeps enough result state to trigger the annotation entry action", async () => {
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
          success: false,
          error: {
            code: "ANNOTATE_NOT_READY",
            message: "Reboot annotation contract is active, but the annotation closure lands in phase 3.",
          },
        }, false),
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
          }),
        }),
      );
    });
  });
});
