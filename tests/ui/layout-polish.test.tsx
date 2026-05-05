import { readFileSync } from "fs";
import { join } from "path";
import { act, render, screen, waitFor } from "@testing-library/react";
import { metadata, viewport } from "@/app/layout";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Header as ResponsiveHeader } from "@/components/layout/responsive/Header";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ThemeProvider } from "@/components/ui/ThemeProvider";

function ThrowingChild(): null {
  throw new Error("forced render failure");
}

describe("legacy layout polish", () => {
  afterEach(() => {
    document.documentElement.classList.remove("light", "dark");
    localStorage.clear();
  });

  it("does not expose unconnected navigation or graph controls", () => {
    const { container } = render(
      <>
        <Header />
        <Footer />
      </>,
    );

    expect(screen.queryByText("知识图谱")).not.toBeInTheDocument();
    expect(screen.queryByText("无限探索")).not.toBeInTheDocument();
    expect(screen.queryByText("我的笔记")).not.toBeInTheDocument();
    expect(container.querySelector('a[href="#"]')).not.toBeInTheDocument();
  });

  it("keeps the responsive shell aligned with the reader visual language", () => {
    const packageSource = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const eslintSource = readFileSync(join(process.cwd(), ".eslintrc.json"), "utf8");
    const tsconfigSource = readFileSync(join(process.cwd(), "tsconfig.json"), "utf8");
    const globalsSource = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const tailwindSource = readFileSync(join(process.cwd(), "tailwind.config.ts"), "utf8");
    const responsiveHeaderSource = readFileSync(
      join(process.cwd(), "src/components/layout/responsive/Header.tsx"),
      "utf8",
    );
    const mainLayoutSource = readFileSync(join(process.cwd(), "src/components/layout/MainLayout.tsx"), "utf8");
    const responsiveLayoutSource = readFileSync(
      join(process.cwd(), "src/components/layout/responsive/MainLayout.tsx"),
      "utf8",
    );
    const wikiExplorerSource = readFileSync(
      join(process.cwd(), "src/components/infinite-wiki/WikiExplorer.tsx"),
      "utf8",
    );

    render(<ResponsiveHeader onMenuToggle={jest.fn()} showMenuButton={true} />);

    expect(screen.getByText("以此刻一念入经")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("搜索经典智慧...")).not.toBeInTheDocument();
    expect(responsiveHeaderSource).not.toContain("bg-white");
    expect(responsiveHeaderSource).not.toContain("from-blue-500");
    expect(responsiveHeaderSource).not.toContain("purple");
    expect(mainLayoutSource).not.toContain("amber");
    expect(mainLayoutSource).not.toContain("bg-white");
    expect(mainLayoutSource).not.toContain("text-gray");
    expect(responsiveLayoutSource).not.toContain("amber");
    expect(responsiveLayoutSource).not.toContain("via-white");
    expect(responsiveLayoutSource).not.toContain("bg-white");
    expect(responsiveLayoutSource).not.toContain("border-gray");
    expect(wikiExplorerSource).toContain('aria-label="关闭无限经典探索"');
    expect(wikiExplorerSource).not.toContain("bg-white");
    expect(wikiExplorerSource).not.toContain("text-gray");
    expect(wikiExplorerSource).not.toContain("border-gray");
    expect(globalsSource).toContain(".dark");
    expect(globalsSource).toContain("--background: 24 18% 8%");
    expect(globalsSource).toContain("--paper:");
    expect(globalsSource).toContain("--reader-surface:");
    expect(globalsSource).toContain("--reader-border:");
    expect(globalsSource).toContain("--reader-muted:");
    expect(globalsSource).toContain("--reader-danger:");
    expect(globalsSource).not.toContain("--background: 0 0% 97%");
    expect(globalsSource).not.toContain("--foreground: 225 73% 57%");
    expect(tailwindSource).toContain('paper: "hsl(var(--paper))"');
    expect(tailwindSource).toContain("reader:");
    expect(tailwindSource).not.toContain('paper: "#ede7d8"');
    expect(tailwindSource).not.toContain('ink: "#14110f"');
    expect(tailwindSource).not.toContain('zen: "#c7b38b"');
    expect(tailwindSource).not.toContain('seal: "#9e4b3f"');
    expect(packageSource).not.toContain("web/iw-clone");
    expect(packageSource).not.toContain("dev:iw");
    expect(packageSource).not.toContain("mock:iw");
    expect(packageSource).not.toContain("postinstall");
    expect(eslintSource).not.toContain("src/app/simon-rogers/**");
    expect(eslintSource).not.toContain("src/components/content/**");
    expect(eslintSource).not.toContain("src/components/infinite-wiki/**");
    expect(eslintSource).not.toContain("src/components/layout/responsive/**");
    expect(tsconfigSource).not.toContain("src/app/simon-rogers/**");
    expect(tsconfigSource).not.toContain("src/components/content/**");
    expect(tsconfigSource).not.toContain("src/components/infinite-wiki/**");
    expect(tsconfigSource).not.toContain("src/components/layout/responsive/**");
  });

  it("uses Next 14 metadata exports without unfetched production assets", () => {
    const layoutSource = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(metadata.metadataBase?.toString()).toBe("http://localhost:3000/");
    expect(metadata).not.toHaveProperty("viewport");
    expect(metadata).not.toHaveProperty("themeColor");
    expect(viewport).toMatchObject({
      width: "device-width",
      initialScale: 1,
      themeColor: "#15110f",
    });
    expect(viewport).not.toHaveProperty("maximumScale");
    expect(metadata.title).toBe("六经注我 - 以此刻一念进入经典");
    expect(metadata.description).toBe("输入一念，读经典如何回应当下处境，再沿注语继续深入原文");
    expect(metadata.icons).toMatchObject({
      icon: "/favicon.svg",
    });
    expect(layoutSource).not.toContain("/manifest.json");
    expect(layoutSource).not.toContain("/analytics.js");
    expect(layoutSource).not.toContain("/sw.js");
    expect(layoutSource).not.toContain("/favicon.ico");
    expect(layoutSource).not.toContain("/og-image.png");
  });

  it("renders the root error fallback in the reader visual language", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      render(
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>,
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("回响中断")).toBeInTheDocument();
      expect(screen.getByText("此刻未能继续成卷。可以重试这一念，或刷新后重新进入。")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "刷新页面" })).toBeInTheDocument();
      expect(screen.queryByText(/应用程序|技术支持/u)).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps the html theme class synchronized with system theme changes", async () => {
    const originalMatchMedia = window.matchMedia;
    const listeners: Array<() => void> = [];
    let prefersDark = false;

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        get matches() {
          return query.includes("prefers-color-scheme") ? prefersDark : false;
        },
        media: query,
        onchange: null,
        addEventListener: (_event: string, listener: () => void) => listeners.push(listener),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    try {
      render(
        <ThemeProvider>
          <div>theme child</div>
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(document.documentElement).toHaveClass("light");
      });

      prefersDark = true;
      act(() => {
        listeners.forEach(listener => listener());
      });

      await waitFor(() => {
        expect(document.documentElement).toHaveClass("dark");
      });
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });
});
