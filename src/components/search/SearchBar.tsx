import type { FormEvent } from "react";

const RITUAL_PROMPTS = [
  "我最近总是急于证明自己",
  "和朋友渐行渐远怎么办",
  "我不确定该不该退一步",
  "我怎样安住眼前这件事",
  "我想把话说重又怕伤人",
  "我需要重新找回分寸",
];

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (queryOverride?: string) => void | Promise<void>;
  isLoading: boolean;
  placeholder?: string;
  disabled?: boolean;
  mode?: "intro" | "inline";
  showSuggestions?: boolean;
  compact?: boolean;
  inputId?: string;
}

export function SearchBar({
  value,
  onChange,
  onSearch,
  isLoading,
  placeholder = "输入此刻的一念...",
  disabled = false,
  mode = "intro",
  showSuggestions = true,
  compact = false,
  inputId = "thought-query",
}: SearchBarProps) {
  const hasQuery = value.trim().length > 0;
  const canSubmit = hasQuery && !isLoading && !disabled;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const nextQuery = value.trim();

    if (nextQuery && !isLoading && !disabled) {
      void onSearch(nextQuery);
    }
  };

  const commitQuery = (nextQuery: string) => {
    const trimmed = nextQuery.trim();
    if (!trimmed || isLoading || disabled) {
      return;
    }

    onChange(trimmed);
    void onSearch(trimmed);
  };

  const handleRandom = () => {
    const nextQuery = RITUAL_PROMPTS[Math.floor(Math.random() * RITUAL_PROMPTS.length)];

    if (!nextQuery) {
      return;
    }

    commitQuery(nextQuery);
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="w-full">
        <label htmlFor={inputId} className="sr-only">
          输入此刻的一念
        </label>
        <div className="relative">
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full border-b bg-transparent text-center text-paper placeholder:text-stone-400/80 transition-[border-color,box-shadow,color] duration-500 focus:border-zen focus:outline-none focus:shadow-[0_16px_38px_-32px_rgba(199,179,139,0.9)] font-classic ${
              compact
                ? "border-stone-700 py-3 text-xl"
                : mode === "intro"
                ? "border-stone-700/90 py-5 text-3xl md:text-5xl"
                : "border-stone-700 py-4 text-2xl md:text-3xl"
            }`}
            disabled={isLoading || disabled}
          />
        </div>
        <div className="mt-6 flex flex-col items-center gap-5">
          <button
            type="submit"
            disabled={!canSubmit}
            className={`inline-flex min-w-40 items-center justify-center rounded-full border px-6 py-3 text-sm tracking-[0.28em] transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:border-stone-800 disabled:bg-transparent disabled:text-stone-700 disabled:shadow-none disabled:active:scale-100 ${
              hasQuery
                ? "border-zen bg-zen text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] hover:border-paper hover:bg-paper"
                : "border-stone-700 text-stone-300 hover:border-zen hover:text-paper"
            }`}
          >
            {isLoading ? "经典回应中" : "请经典回应"}
          </button>

          {showSuggestions && (
            <details className="mx-auto w-full max-w-lg text-center">
              <summary className="mx-auto inline-flex min-h-11 cursor-pointer list-none items-center justify-center border-b border-stone-800 px-2 text-xs tracking-[0.18em] text-stone-400 transition hover:border-zen/70 hover:text-stone-200 focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink [&::-webkit-details-marker]:hidden">
                借一句开头
              </summary>

              <div className="mt-4 flex flex-wrap justify-center gap-2 md:gap-3">
                {RITUAL_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => commitQuery(prompt)}
                    disabled={isLoading || disabled}
                    className="min-h-11 rounded-sm border border-stone-800 px-4 py-2 text-[0.8rem] leading-snug tracking-[0.12em] text-stone-300 transition hover:border-zen/70 hover:text-zen active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 md:min-h-0 md:px-3 md:py-1.5 md:text-xs md:tracking-[0.16em]"
                  >
                    {prompt}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleRandom}
                  disabled={isLoading || disabled}
                  className="min-h-11 rounded-sm border border-stone-700 px-4 py-2 text-[0.8rem] leading-snug tracking-[0.12em] text-stone-300 transition hover:border-zen hover:text-paper active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0"
                >
                  另起一念
                </button>
              </div>
            </details>
          )}
        </div>
      </form>
    </div>
  );
}
