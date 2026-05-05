import { fireEvent, render, screen } from "@testing-library/react";
import { SearchBar } from "@/components/search/SearchBar";

describe("SearchBar", () => {
  it("submits the explicit current query on Enter", () => {
    const onSearch = jest.fn();

    render(
      <SearchBar
        value="如何面对困境"
        onChange={jest.fn()}
        onSearch={onSearch}
        isLoading={false}
      />,
    );

    fireEvent.submit(screen.getByRole("button", { name: "请经典回应" }).closest("form") as HTMLFormElement);
    expect(onSearch).toHaveBeenCalledWith("如何面对困境");
  });

  it("uses the clicked hot prompt directly instead of waiting for state to settle", () => {
    const onChange = jest.fn();
    const onSearch = jest.fn();

    render(
      <SearchBar
        value=""
        onChange={onChange}
        onSearch={onSearch}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "我不确定该不该退一步" }));

    expect(onChange).toHaveBeenCalledWith("我不确定该不该退一步");
    expect(onSearch).toHaveBeenCalledWith("我不确定该不该退一步");
  });

  it("uses the generated random prompt directly instead of relying on stale input state", () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);
    const onChange = jest.fn();
    const onSearch = jest.fn();

    render(
      <SearchBar
        value=""
        onChange={onChange}
        onSearch={onSearch}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByText("更多一念"));
    fireEvent.click(screen.getByRole("button", { name: "另起一念" }));

    expect(onChange).toHaveBeenCalledWith("我最近总是急于证明自己");
    expect(onSearch).toHaveBeenCalledWith("我最近总是急于证明自己");

    randomSpy.mockRestore();
  });

  it("keeps prompt shortcuts large enough for mobile touch", () => {
    render(
      <SearchBar
        value=""
        onChange={jest.fn()}
        onSearch={jest.fn()}
        isLoading={false}
      />,
    );

    expect(screen.getByRole("button", { name: "我最近总是急于证明自己" }).className).toContain("min-h-11");
    expect(screen.getByText("更多一念")).toHaveClass("min-h-11");
    fireEvent.click(screen.getByText("更多一念"));
    expect(screen.getByRole("button", { name: "另起一念" }).className).toContain("min-h-11");
  });
});
