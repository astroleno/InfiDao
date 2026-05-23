import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SimonRogersPreviewPage from "@/app/simon-rogers-preview/page";

const defaultMatchMedia = window.matchMedia;

function createFetchResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  });
}

function mockReducedMotion() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
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

describe("HomeEntryExperience reduced motion", () => {
  beforeEach(() => {
    mockReducedMotion();
    global.fetch = jest.fn().mockImplementation(() =>
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

  it("uses a static kinetic field while keeping search usable", async () => {
    render(<SimonRogersPreviewPage />);

    await waitFor(() => {
      expect(screen.getByTestId("kinetic-text-field")).toHaveAttribute("data-reduced-motion", "true");
    });
    expect(screen.queryByRole("button", { name: "暂停文字场" })).not.toBeInTheDocument();
    expect(screen.getByText("静态文字场")).toBeInTheDocument();
    expect(screen.getByTestId("kinetic-text-field")).toHaveAttribute("aria-hidden", "true");

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/search",
      expect.objectContaining({
        body: JSON.stringify({
          query: "如何面对困境",
          topK: 5,
          threshold: 0.35,
        }),
      }),
    );
  });
});
