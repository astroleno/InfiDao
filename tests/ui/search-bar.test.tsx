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

    fireEvent.click(screen.getByRole("button", { name: "如何面对困境" }));

    expect(onChange).toHaveBeenCalledWith("如何面对困境");
    expect(onSearch).toHaveBeenCalledWith("如何面对困境");
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

    fireEvent.click(screen.getByRole("button", { name: "随机入念" }));

    expect(onChange).toHaveBeenCalledWith("什么是君子之道");
    expect(onSearch).toHaveBeenCalledWith("什么是君子之道");

    randomSpy.mockRestore();
  });
});
