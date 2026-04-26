import { render, screen } from "@testing-library/react";
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
});
