import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SimonRogersPreviewPage from "@/app/simon-rogers-preview/page";

const defaultMatchMedia = window.matchMedia;

function createFetchResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  });
}

function mockMatchMedia({ desktop = true, reducedMotion = false } = {}) {
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

const searchResult = {
  id: "lunyu-1-8",
  source: "论语",
  chapter: "学而篇",
  section: 8,
  text: "君子不重则不威，学则不固。",
  score: 0.6666,
};

const annotationResult = {
  passageId: "lunyu-1-8",
  passageText: "君子不重则不威，学则不固。",
  sixToMe: "根层注释",
  meToSix: "根层反观",
  links: [],
};

describe("HomeEntryExperience friction gates", () => {
  beforeEach(() => {
    mockMatchMedia();
    global.fetch = jest.fn();
    window.sessionStorage.clear();
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

  it("asks for direction on a short query without rewriting the submitted query", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [searchResult],
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [searchResult],
        }),
      );

    render(<SimonRogersPreviewPage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "道" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(screen.getByRole("region", { name: "短问入经方向" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /修身/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /处世/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /观变/u })).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /修身/u }));

    expect(await screen.findByText("君子不重则不威，学则不固。")).toBeInTheDocument();
    expect(screen.getByTestId("selected-direction-frame")).toHaveTextContent("以「修身」方向入经，原问不改。");
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/search",
      expect.objectContaining({
        body: JSON.stringify({
          query: "道",
          topK: 5,
          threshold: 0.35,
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "回到一念" }));
    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "道" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(screen.queryByRole("region", { name: "短问入经方向" })).not.toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it("can continue a short query without choosing a direction", async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      createFetchResponse({
        success: true,
        data: [searchResult],
      }),
    );

    render(<SimonRogersPreviewPage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "仁" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));
    fireEvent.click(screen.getByRole("button", { name: "不选方向，直接入经" }));

    expect(await screen.findByText("君子不重则不威，学则不固。")).toBeInTheDocument();
    expect(screen.queryByTestId("selected-direction-frame")).not.toBeInTheDocument();
  });

  it("pauses before opening annotation and does not repeat for the same result", async () => {
    (global.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: [searchResult],
        }),
      )
      .mockImplementationOnce(() =>
        createFetchResponse({
          success: true,
          data: annotationResult,
        }),
      );

    render(<SimonRogersPreviewPage />);

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "用这一句回应我" }));

    expect(screen.getByRole("region", { name: "入经前停顿" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "略过停顿" }));

    expect(await screen.findByText("根层注释")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "沿这句继续" }));

    expect(screen.queryByRole("region", { name: "入经前停顿" })).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
