import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import RitualScrollPage from "@/app/ritual-scroll/page";

const defaultMatchMedia = window.matchMedia;

describe("RitualScrollPage", () => {
  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: defaultMatchMedia,
    });
  });

  it("renders six-classics context without console errors", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      render(<RitualScrollPage />);

      expect(screen.getAllByText("六经注我").length).toBeGreaterThan(0);
      expect(screen.getAllByText("大学：大学之道，在明明德，在亲民，在止于至善。").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "暂停滚动" })).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(screen.getByRole("button", { name: "暂停滚动" }));

      expect(screen.getByRole("button", { name: "继续滚动" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByText("The Egg")).not.toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("uses product color tokens and reduced-motion classes", () => {
    const source = readFileSync(join(process.cwd(), "src/app/ritual-scroll/page.tsx"), "utf8");

    expect(existsSync(join(process.cwd(), "src/app/simon-rogers"))).toBe(false);
    expect(source).not.toContain("#5968ff");
    expect(source).toContain("text-zen");
    expect(source).toContain("animationPlayState");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("motion-safe:animate-scroll-up");
    expect(source).toContain("nearViewport.forEach");
    expect(source).toContain("if (!isPaused && nearViewport.size > 0)");
    expect(source).toContain("}, [isPaused, shouldRenderStatic])");
    expect(source).toContain("useState<boolean | null>(null)");
    expect(source).toContain("shouldRenderStatic");
    expect(source).toContain("prefers-reduced-motion");
    expect(source).toContain("RitualScrollPage");
    expect(source).not.toContain("SimonRogersPage");
  });

  it("renders a static scrollable reading list when reduced motion is preferred", async () => {
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

    const { container } = render(<RitualScrollPage />);

    await waitFor(() => {
      expect(container.firstElementChild).toHaveClass("overflow-y-auto");
    });
    expect(screen.queryByRole("button", { name: "暂停滚动" })).not.toBeInTheDocument();
    expect(screen.getByText("易经：天行健，君子以自强不息。")).toBeInTheDocument();
  });
});
