import type { FormEvent } from "react";

const RITUAL_PROMPTS = [
  "我最近总是急于证明自己",
  "和朋友渐行渐远怎么办",
  "我不确定该不该退一步",
  "我怎样安住眼前这件事",
  "我想把话说重又怕伤人",
  "我需要重新找回分寸",
];

const FEATURED_PROMPTS = RITUAL_PROMPTS.slice(0, 3);
const SECONDARY_PROMPTS = RITUAL_PROMPTS.slice(3);

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
            className={`w-full bg-transparent text-center text-paper placeholder:text-stone-600 border-b transition-colors duration-300 focus:outline-none focus:border-zen font-classic ${
              compact
                ? "border-stone-700 py-3 text-xl"
                : mode === "intro"
                ? "border-stone-800 py-5 text-3xl md:text-5xl"
                : "border-stone-700 py-4 text-2xl md:text-3xl"
            }`}
            disabled={isLoading || disabled}
          />
        </div>
        <div className="mt-6 flex flex-col items-center gap-5">
          <button
            type="submit"
            disabled={!value.trim() || isLoading || disabled}
            className="inline-flex min-w-40 items-center justify-center rounded-full border border-stone-700 px-6 py-3 text-sm tracking-[0.28em] text-stone-300 transition hover:border-zen hover:text-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-700 disabled:active:scale-100"
          >
            {isLoading ? "经典回应中" : "请经典回应"}
          </button>

          {showSuggestions && (
            <div className="flex flex-col items-center gap-3 md:block">
              <div className="flex flex-wrap justify-center gap-2 md:gap-3">
                {FEATURED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => commitQuery(prompt)}
                    disabled={isLoading || disabled}
                    className="min-h-11 rounded-sm border border-stone-800 px-4 py-2 text-[0.8rem] leading-snug tracking-[0.12em] text-stone-400 transition hover:border-zen/70 hover:text-zen active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 md:min-h-0 md:px-3 md:py-1.5 md:text-xs md:tracking-[0.16em]"
                  >
                    {prompt}
                  </button>
                ))}

              </div>

              <details className="w-full max-w-sm">
                <summary className="mx-auto flex min-h-11 max-w-32 cursor-pointer list-none items-center justify-center border-b border-stone-700 text-xs tracking-[0.18em] text-stone-400 transition hover:border-zen hover:text-paper focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink">
                  更多一念
                </summary>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {SECONDARY_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => commitQuery(prompt)}
                      disabled={isLoading || disabled}
                      className="min-h-11 rounded-sm border border-stone-800 px-4 py-2 text-[0.8rem] leading-snug tracking-[0.12em] text-stone-400 transition hover:border-zen/70 hover:text-zen active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0"
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
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
