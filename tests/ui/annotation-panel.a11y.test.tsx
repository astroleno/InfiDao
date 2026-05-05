import { fireEvent, render, screen } from "@testing-library/react";
import { AnnotationPanel } from "@/components/annotation/AnnotationPanel";
import type { AnnotationResult } from "@/types";

const defaultMatchMedia = window.matchMedia;

const annotation: AnnotationResult = {
  passageId: "lunyu-1-8",
  passageText: "君子不重则不威，学则不固。",
  sixToMe: "根层注释",
  meToSix: "根层反观",
  links: [
    {
      passageId: "lunyu-1-4",
      label: "继续看自省",
      passageText: "吾日三省吾身。",
      source: "论语",
      chapter: "学而篇",
      section: 4,
    },
  ],
};

const annotationWithoutLinks: AnnotationResult = {
  ...annotation,
  links: [],
};

describe("AnnotationPanel accessibility polish", () => {
  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: defaultMatchMedia,
    });
  });

  it("exposes annotation mode controls as tabs with selected state", () => {
    render(
      <AnnotationPanel
        query="如何面对困境"
        annotation={annotation}
        isLoading={false}
        error={null}
        onWikiNavigate={jest.fn()}
      />,
    );

    const sixToMeTab = screen.getByRole("tab", { name: "六经注我" });
    const meToSixTab = screen.getByRole("tab", { name: "我注六经" });

    expect(screen.getByRole("tablist", { name: "注释视角" })).toBeInTheDocument();
    expect(sixToMeTab).toHaveAttribute("aria-selected", "true");
    expect(sixToMeTab).toHaveAttribute("tabindex", "0");
    expect(meToSixTab).toHaveAttribute("tabindex", "-1");
    expect(document.getElementById(sixToMeTab.getAttribute("aria-controls") as string)).toBeInTheDocument();
    expect(document.getElementById(meToSixTab.getAttribute("aria-controls") as string)).toBeInTheDocument();

    fireEvent.keyDown(sixToMeTab, { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: "我注六经" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "我注六经" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tabpanel", { name: "我注六经" })).toBeInTheDocument();
    expect(screen.queryByText(/跨越时空|现代视角|智慧对话/u)).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("tab", { name: "我注六经" }), { key: "Home" });

    expect(screen.getByRole("tab", { name: "六经注我" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tab", { name: "六经注我" }), { key: "End" });

    expect(screen.getByRole("tab", { name: "我注六经" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tab", { name: "我注六经" }), { key: "ArrowLeft" });

    expect(screen.getByRole("tab", { name: "六经注我" })).toHaveAttribute("aria-selected", "true");
  });

  it("gives the link detail toggle an accessible name and expanded state", () => {
    render(
      <AnnotationPanel
        query="如何面对困境"
        annotation={annotation}
        isLoading={false}
        error={null}
        onWikiNavigate={jest.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: "展开延伸详情：继续看自省" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: "收起延伸详情：继续看自省" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("keeps loading copy user-facing without implementation terms", () => {
    render(
      <AnnotationPanel
        query="如何面对困境"
        annotation={null}
        isLoading={true}
        error={null}
        onWikiNavigate={jest.fn()}
      />,
    );

    expect(screen.getByRole("status", { name: "注释生成状态" })).toBeInTheDocument();
    expect(screen.getByText("取义中")).toBeInTheDocument();
    expect(screen.getByText("比照经文")).toBeInTheDocument();
    expect(screen.getByText("注语将成")).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "生成中的注释视角" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "生成中的注释视角" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "六经注我" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "我注六经" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "六经注我" }).className).toContain("min-h-11");
    expect(screen.queryByText("正在生成注释...")).not.toBeInTheDocument();
    expect(screen.queryByText(/JSON|SSE|\/api\/annotate/u)).not.toBeInTheDocument();
  });

  it("keeps mobile reader annotation chrome compact", () => {
    render(
      <AnnotationPanel
        query="如何面对困境"
        annotation={annotation}
        isLoading={false}
        error={null}
        onWikiNavigate={jest.fn()}
        placement="mobile"
      />,
    );

    expect(screen.getByText("注我卷轴")).toHaveClass("text-base");
    expect(screen.queryByText("可继续互注")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "注释视角" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "六经注我" }).className).toContain("min-h-11");
    const liveText = screen.getByRole("status", { name: "根层注释" });
    expect(liveText).toHaveTextContent("根层注释");
    expect(liveText).toHaveAttribute("aria-label", "根层注释");
  });

  it("uses mobile reader copy when no follow-up links remain", () => {
    render(
      <AnnotationPanel
        query="如何面对困境"
        annotation={annotationWithoutLinks}
        isLoading={false}
        error={null}
        onWikiNavigate={jest.fn()}
        placement="mobile"
      />,
    );

    expect(screen.getByText("返回回应列表，或另择一句再入。")).toBeInTheDocument();
    expect(screen.queryByText("从左侧搜索结果重新选择一段经典回应。")).not.toBeInTheDocument();
  });

  it("shows complete annotation text immediately when reduced motion is preferred", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });

    render(
      <AnnotationPanel
        query="如何面对困境"
        annotation={annotation}
        isLoading={false}
        error={null}
        onWikiNavigate={jest.fn()}
      />,
    );

    expect((await screen.findAllByText("根层注释")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\|/u)).not.toBeInTheDocument();
  });

  it("retries the current annotation without reloading the page", () => {
    const onRetry = jest.fn();

    render(
      <AnnotationPanel
        query="如何面对困境"
        annotation={null}
        isLoading={false}
        error={new Error("provider timeout")}
        onWikiNavigate={jest.fn()}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重试当前段落" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
