import { render, screen } from "@testing-library/react";
import SimonRogersPage from "@/app/simon-rogers/page";

describe("SimonRogersPage", () => {
  it("renders six-classics context without console errors", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      render(<SimonRogersPage />);

      expect(screen.getAllByText("六经注我").length).toBeGreaterThan(0);
      expect(screen.getAllByText("大学：大学之道，在明明德，在亲民，在止于至善。").length).toBeGreaterThan(0);
      expect(screen.queryByText("The Egg")).not.toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
