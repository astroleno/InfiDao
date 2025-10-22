import { useState, useRef, useEffect, useCallback } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  onRandom: () => void;
  isLoading: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function SearchBar({
  value,
  onChange,
  onSearch,
  onRandom,
  isLoading,
  placeholder = "输入您的思考或问题...",
  disabled = false
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedValue = useDebounce(value, 300);

  // Sample search suggestions and random words
  const sampleSuggestions = [
    "什么是君子之道",
    "如何修身养性",
    "学习和实践的关系",
    "仁义的真正含义",
    "中庸的智慧",
    "知行合一的理解",
    "礼的本质和作用",
    "如何面对困境",
    "友谊的真正意义",
    "治理国家的原则"
  ];

  const randomWords = [
    "仁", "义", "礼", "智", "信", "诚", "孝", "悌", "忠", "恕",
    "道", "德", "善", "美", "和", "中", "正", "直", "廉", "耻",
    "学", "思", "行", "知", "言", "听", "观", "察", "问", "辨"
  ];

  // Update suggestions based on input
  useEffect(() => {
    if (debouncedValue.length > 0) {
      const filtered = sampleSuggestions.filter(suggestion =>
        suggestion.includes(debouncedValue)
      ).slice(0, 5);
      setSuggestions(filtered);
    } else {
      setSuggestions(sampleSuggestions.slice(0, 5));
    }
  }, [debouncedValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !isLoading && !disabled) {
      onSearch();
      setShowSuggestions(false);
    }
  };

  const handleRandom = useCallback(() => {
    if (isLoading || disabled) return;

    const randomWord = randomWords[Math.floor(Math.random() * randomWords.length)];
    onChange(randomWord);
    setShowSuggestions(false);
    setTimeout(() => onRandom(), 100);
  }, [isLoading, disabled, onChange, onRandom]);

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
    setTimeout(() => onSearch(), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="search-bar relative">
      <form onSubmit={handleSubmit} className="relative">
        <div className={`relative flex items-center transition-all duration-200 ${
          isFocused ? 'ring-2 ring-primary-500 ring-opacity-50' : ''
        }`}>
          {/* Search Icon */}
          <div className="absolute left-4 z-10">
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
            ) : (
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>

          {/* Input Field */}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              setIsFocused(true);
              setShowSuggestions(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              // Delay hiding suggestions to allow click events
              setTimeout(() => setShowSuggestions(false), 200);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full pl-12 pr-40 py-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-0 bg-white shadow-sm transition-all duration-200 font-classic"
            disabled={isLoading || disabled}
          />

          {/* Random Button */}
          <button
            type="button"
            onClick={handleRandom}
            disabled={isLoading || disabled}
            className="absolute right-20 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200 font-medium text-sm"
            title="随机选择一个词汇"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
            ) : (
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                随机
              </span>
            )}
          </button>

          {/* Search Button */}
          <button
            type="submit"
            disabled={!value.trim() || isLoading || disabled}
            className="absolute right-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 font-medium"
          >
            {isLoading ? (
              <span className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                搜索中
              </span>
            ) : (
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                搜索经典
              </span>
            )}
          </button>
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && !isLoading && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="p-2">
              <div className="text-xs text-gray-500 px-3 py-2 font-medium">搜索建议</div>
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors duration-150 flex items-center group"
                >
                  <svg className="w-4 h-4 text-gray-400 mr-3 group-hover:text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="text-gray-900 group-hover:text-primary-600 font-classic">{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {/* Quick Search Tips */}
      {value.length === 0 && !isFocused && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-sm text-gray-500">热门搜索：</span>
          {sampleSuggestions.slice(0, 3).map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="text-sm text-primary-600 hover:text-primary-800 hover:bg-primary-50 px-2 py-1 rounded transition-colors duration-150"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}