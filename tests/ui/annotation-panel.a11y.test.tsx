import { fireEvent, render, screen } from "@testing-library/react";
import { AnnotationPanel } from "@/components/annotation/AnnotationPanel";
import type { AnnotationResult } from "@/types";

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

describe("AnnotationPanel accessibility polish", () => {
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

    expect(screen.getByRole("tablist", { name: "注释视角" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "六经注我" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "我注六经" }));

    expect(screen.getByRole("tab", { name: "我注六经" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "我注六经" })).toBeInTheDocument();
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
    expect(screen.queryByText(/JSON|SSE|\/api\/annotate/u)).not.toBeInTheDocument();
  });
});
