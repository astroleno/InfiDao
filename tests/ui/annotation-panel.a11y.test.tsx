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

  it("keeps follow-up links as one clear primary action", () => {
    render(
      <AnnotationPanel
        query="如何面对困境"
        annotation={annotation}
        isLoading={false}
        error={null}
        onWikiNavigate={jest.fn()}
      />,
    );

    expect(screen.getByText("下一句")).toBeInTheDocument();
    expect(screen.getByText("下一句").parentElement?.querySelector(":scope > svg")).toBeNull();
    const continueButton = screen.getByRole("button", { name: "进入下一句：《论语·学而篇》第 4 节" });
    expect(continueButton.className).toContain("min-h-11");
    expect(screen.queryByRole("button", { name: /延伸详情/u })).not.toBeInTheDocument();
    expect(screen.queryByText("由此进入")).not.toBeInTheDocument();
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

    expect(screen.getByText("注我卷轴")).toHaveClass("sr-only");
    expect(screen.queryByText("可继续互注")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "注释视角" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "六经注我" })).not.toBeInTheDocument();
    expect(screen.getAllByText("六经注我").some(element => element.className.includes("sr-only"))).toBe(true);
    expect(screen.getByText("此句如何校准当下处境").closest(".hidden")).toBeInTheDocument();
    const viewSwitch = screen.getByRole("button", { name: "看我的回注" });
    expect(viewSwitch.className).toContain("min-h-11");
    expect(viewSwitch.className).toContain("tracking-[0.12em]");
    const liveText = screen.getByRole("status", { name: "根层注释" });
    expect(liveText).toHaveTextContent("根层注释");
    expect(liveText).toHaveAttribute("aria-label", "根层注释");

    fireEvent.click(viewSwitch);

    expect(screen.getByRole("button", { name: "看经典回应" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "根层反观" })).toHaveTextContent("根层反观");
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

    expect(screen.getByText("此处暂止，回到回应列表，或另择一句再入。")).toBeInTheDocument();
    expect(screen.queryByText("此处暂无后续探索")).not.toBeInTheDocument();
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

    expect(screen.getByRole("alert")).toHaveClass("border-y");
    expect(screen.getByRole("alert")).not.toHaveClass("bg-reader-danger/25");
    expect(screen.getByText("断")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "再取此义" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
