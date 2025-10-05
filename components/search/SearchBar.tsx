import { useState, useRef, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  isLoading: boolean;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  onSearch,
  isLoading,
  placeholder = "输入您的思考或问题..."
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedValue = useDebounce(value, 300);

  // Sample search suggestions
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
    if (value.trim() && !isLoading) {
      onSearch();
      setShowSuggestions(false);
    }
  };

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
            className="w-full pl-12 pr-32 py-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-0 bg-white shadow-sm transition-all duration-200 font-classic"
            disabled={isLoading}
          />

          {/* Search Button */}
          <button
            type="submit"
            disabled={!value.trim() || isLoading}
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