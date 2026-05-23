import { render } from "@testing-library/react";
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
});
