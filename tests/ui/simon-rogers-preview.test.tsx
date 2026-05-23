import { render, screen } from "@testing-library/react";
import SimonRogersPreviewPage from "@/app/simon-rogers-preview/page";

const defaultMatchMedia = window.matchMedia;

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

describe("SimonRogersPreviewPage", () => {
  beforeEach(() => {
    mockMatchMedia();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: defaultMatchMedia,
    });
  });

  it("renders the entry experience without calling product APIs on initial render", () => {
    render(<SimonRogersPreviewPage />);

    expect(screen.getByRole("textbox", { name: "输入此刻的一念" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "请经典回应" })).toBeInTheDocument();
    expect(screen.getByText("写下一念，按回车回应")).toBeInTheDocument();

    const kineticField = screen.getByTestId("kinetic-text-field");
    expect(kineticField).toHaveAttribute("aria-hidden", "true");
    expect(kineticField.querySelectorAll("a,button,input,textarea,select,[tabindex]:not([tabindex='-1'])")).toHaveLength(0);

    const pauseControl = screen.getByRole("button", { name: "暂停文字场" });
    pauseControl.focus();
    expect(pauseControl).toHaveFocus();
    expect(pauseControl).toHaveAttribute("aria-pressed", "false");

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
