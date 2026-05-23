import { fireEvent, render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

const defaultMatchMedia = window.matchMedia;

function createFetchResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  });
}

function mockMatchMedia() {
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

describe("HomePage Simon Rogers-style entry", () => {
  beforeEach(() => {
    mockMatchMedia();
    window.sessionStorage.clear();
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

  it("renders the kinetic entry while preserving the search handler boundary", async () => {
    render(<HomePage />);

    expect(screen.getByRole("textbox", { name: "输入此刻的一念" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "请经典回应" })).toBeInTheDocument();
    expect(screen.getByTestId("kinetic-text-field")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("kinetic-text-field").querySelectorAll("button,input,[tabindex]:not([tabindex='-1'])")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "暂停文字场" })).toHaveAttribute("aria-pressed", "false");
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("输入此刻的一念"), {
      target: { value: "如何面对困境" },
    });
    fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));

    expect(await screen.findByText("君子不重则不威，学则不固。")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          query: "如何面对困境",
          topK: 5,
          threshold: 0.35,
        }),
      }),
    );
  });
});
