import { render, screen } from "@testing-library/react";
import { AnnotationPanel } from "@/components/annotation/AnnotationPanel";
import { GrowthTrace } from "@/components/growth/GrowthTrace";
import type { AnnotationResult } from "@/types";

const annotation: AnnotationResult = {
  passageId: "lunyu-1-1",
  passageText: "学而时习之，不亦说乎？",
  sixToMe: "经典回应",
  meToSix: "当代反观",
  links: [],
  agentTrace: {
    workAgentId: "work:classic:lunyu-1-1:abcdef",
    relationTheme: "寻求指引",
    branchLabel: "求取分寸",
    growthSummary: "系统读到的倾向进入《论语》，形成一次可继续阅读的关系。",
  },
};

describe("GrowthTrace", () => {
  it("renders relation growth without internal ids", () => {
    render(<GrowthTrace trace={annotation.agentTrace} />);

    expect(screen.getByRole("region", { name: "关系枝条" })).toBeInTheDocument();
    expect(screen.getByText("求取分寸")).toBeInTheDocument();
    expect(screen.getByText("寻求指引")).toBeInTheDocument();
    expect(screen.getByText(/系统读到的倾向/u)).toBeInTheDocument();
    expect(screen.queryByText(/work:classic/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/confidence/u)).not.toBeInTheDocument();
  });

  it("renders a quiet empty state when no growth trace exists", () => {
    render(<GrowthTrace />);

    expect(screen.getByRole("region", { name: "关系枝条" })).toBeInTheDocument();
    expect(screen.getByText("此处暂未生枝。")).toBeInTheDocument();
  });

  it("uses compact spacing for mobile surfaces", () => {
    render(<GrowthTrace trace={annotation.agentTrace} compact />);

    expect(screen.getByRole("region", { name: "关系枝条" }).className).toContain("py-3");
  });

  it("appears inside the annotation panel between reading copy and next actions", () => {
    render(
      <AnnotationPanel
        query="如何面对困境"
        annotation={annotation}
        isLoading={false}
        error={null}
        onWikiNavigate={jest.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "关系枝条" })).toBeInTheDocument();
    expect(screen.getByText("求取分寸")).toBeInTheDocument();
    expect(screen.queryByText("work:classic:lunyu-1-1:abcdef")).not.toBeInTheDocument();
  });
});
