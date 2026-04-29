import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import { metadata, viewport } from "@/app/layout";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

describe("legacy layout polish", () => {
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

  it("uses Next 14 metadata exports without unfetched production assets", () => {
    const layoutSource = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(metadata.metadataBase?.toString()).toBe("http://localhost:3000/");
    expect(metadata).not.toHaveProperty("viewport");
    expect(metadata).not.toHaveProperty("themeColor");
    expect(viewport).toMatchObject({
      width: "device-width",
      initialScale: 1,
      maximumScale: 1,
    });
    expect(metadata.icons).toMatchObject({
      icon: "/favicon.svg",
    });
    expect(layoutSource).not.toContain("/manifest.json");
    expect(layoutSource).not.toContain("/analytics.js");
    expect(layoutSource).not.toContain("/sw.js");
    expect(layoutSource).not.toContain("/favicon.ico");
    expect(layoutSource).not.toContain("/og-image.png");
  });
});
