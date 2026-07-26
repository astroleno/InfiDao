import { act, fireEvent, render, screen } from "@testing-library/react";
import SimonRogersPreviewPage from "@/app/simon-rogers-preview/page";
import { DesirableFrictionGate } from "@/components/home/DesirableFrictionGate";

const defaultMatchMedia = window.matchMedia;

describe("HomeEntryExperience animation cleanup boundaries", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: defaultMatchMedia,
    });
  });

  it("removes the reduced-motion media listener on unmount", () => {
    const removeEventListener = jest.fn();

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    const { unmount } = render(<SimonRogersPreviewPage />);

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("clears the reading gate dwell timer on unmount", () => {
    jest.useFakeTimers();
    const onContinue = jest.fn();

    const { unmount } = render(
      <DesirableFrictionGate
        mode="reading"
        gateId="lunyu-1-8"
        targetLabel="《论语·学而篇》第 8 节"
        passageText="君子不重则不威，学则不固。"
        resonanceLabel="可深读"
        reducedMotion={false}
        onContinue={onContinue}
        onSkip={jest.fn()}
      />,
    );

    unmount();
    jest.advanceTimersByTime(1200);

    expect(onContinue).not.toHaveBeenCalled();
  });

  it("does not restart the dwell when an unrelated parent rerender changes callbacks", () => {
    jest.useFakeTimers();
    const initialContinue = jest.fn();
    const latestContinue = jest.fn();

    const { rerender } = render(
      <DesirableFrictionGate
        mode="reading"
        gateId="lunyu-1-8"
        targetLabel="《论语·学而篇》第 8 节"
        passageText="君子不重则不威，学则不固。"
        resonanceLabel="可深读"
        dwellMs={600}
        reducedMotion={false}
        onContinue={initialContinue}
        onSkip={jest.fn()}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    rerender(
      <DesirableFrictionGate
        mode="reading"
        gateId="lunyu-1-8"
        targetLabel="《论语·学而篇》第 8 节"
        passageText="君子不重则不威，学则不固。"
        resonanceLabel="可深读"
        dwellMs={600}
        reducedMotion={false}
        onContinue={latestContinue}
        onSkip={jest.fn()}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(initialContinue).not.toHaveBeenCalled();
    expect(latestContinue).toHaveBeenCalledTimes(1);
  });

  it("completes only once when a manual continue or Escape races the dwell timer", () => {
    jest.useFakeTimers();
    const onContinue = jest.fn();
    const onSkip = jest.fn();

    render(
      <DesirableFrictionGate
        mode="reading"
        gateId="lunyu-1-8"
        targetLabel="《论语·学而篇》第 8 节"
        passageText="君子不重则不威，学则不固。"
        resonanceLabel="可深读"
        dwellMs={600}
        reducedMotion={false}
        onContinue={onContinue}
        onSkip={onSkip}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "继续入经" }));
    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("region", { name: "入经前停顿" }), {
      key: "Escape",
    });

    expect(onSkip).not.toHaveBeenCalled();
  });

  it("does not auto-continue after Escape completes the gate", () => {
    jest.useFakeTimers();
    const onContinue = jest.fn();
    const onSkip = jest.fn();

    render(
      <DesirableFrictionGate
        mode="reading"
        gateId="lunyu-1-8"
        targetLabel="《论语·学而篇》第 8 节"
        passageText="君子不重则不威，学则不固。"
        resonanceLabel="可深读"
        dwellMs={600}
        reducedMotion={false}
        onContinue={onContinue}
        onSkip={onSkip}
      />,
    );

    fireEvent.keyDown(screen.getByRole("region", { name: "入经前停顿" }), {
      key: "Escape",
    });
    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
