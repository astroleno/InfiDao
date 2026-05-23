import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SimonRogersPreviewPage from "@/app/simon-rogers-preview/page";

const defaultMatchMedia = window.matchMedia;

function createFetchResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  });
}

function mockDesktopMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 1024px"),
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

describe("HomeEntryExperience main path regression", () => {
  beforeEach(() => {
    mockDesktopMatchMedia();
    window.sessionStorage.clear();
    global.fetch = jest
      .fn()
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
  });

  afterEach(() => {
    jest.resetAllMocks();
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: defaultMatchMedia,
    });
  });

  it("keeps search, annotation, wiki explore, and back coherent on the preview route", async () => {
    const { container } = render(<SimonRogersPreviewPage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "用这一句回应我" }));
    fireEvent.click(screen.getByRole("button", { name: "继续入经" }));

    expect(await screen.findByText("根层注释")).toBeInTheDocument();
    expect(screen.getByText("继续看自省")).toBeInTheDocument();
    expect(screen.getByTestId("kinetic-text-field")).toHaveAttribute("aria-hidden", "true");
    expect(container.firstElementChild).toHaveAttribute("data-home-phase", "annotation");

    fireEvent.click(screen.getByRole("button", { name: /进入下一句/u }));

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

    expect(await screen.findByText("第二层注释")).toBeInTheDocument();
    expect(screen.getByText("由此进入：论语 学而篇")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("data-home-phase", "explore");

    fireEvent.click(screen.getByRole("button", { name: "返回上一层" }));

    expect(screen.getByText("根层注释")).toBeInTheDocument();
    expect(screen.getByText("继续看自省")).toBeInTheDocument();
    expect(screen.getByText("君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("data-home-phase", "annotation");
  });
});
