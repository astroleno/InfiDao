import type { FormEvent } from "react";

const RITUAL_PROMPTS = [
  "什么是君子之道",
  "如何修身养性",
  "如何面对困境",
  "友谊的意义",
  "治理国家的原则",
  "中庸之道",
];

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (queryOverride?: string) => void | Promise<void>;
  isLoading: boolean;
  placeholder?: string;
  disabled?: boolean;
  mode?: "intro" | "inline";
}

export function SearchBar({
  value,
  onChange,
  onSearch,
  isLoading,
  placeholder = "输入此刻的一念...",
  disabled = false,
  mode = "intro",
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
        <label htmlFor="thought-query" className="sr-only">
          输入此刻的一念
        </label>
        <div className="relative">
          <input
            id="thought-query"
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full bg-transparent text-center text-paper placeholder:text-stone-600 border-b transition-colors duration-300 focus:outline-none focus:border-zen font-classic ${
              mode === "intro"
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
            className="inline-flex min-w-40 items-center justify-center rounded-full border border-stone-700 px-6 py-3 text-sm tracking-[0.28em] text-stone-300 transition hover:border-zen hover:text-paper focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-700"
          >
            {isLoading ? "经典回应中" : "请经典回应"}
          </button>

          <div className="flex flex-wrap justify-center gap-2 md:gap-3">
            {RITUAL_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => commitQuery(prompt)}
                disabled={isLoading || disabled}
                className="rounded-full border border-stone-800 px-3 py-1.5 text-xs tracking-[0.2em] text-stone-400 transition hover:border-zen/70 hover:text-zen focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
            <button
              type="button"
              onClick={handleRandom}
              disabled={isLoading || disabled}
              className="rounded-full border border-stone-700 px-3 py-1.5 text-xs tracking-[0.2em] text-stone-300 transition hover:border-zen hover:text-paper focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              随机入念
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
