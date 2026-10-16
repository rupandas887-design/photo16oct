import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Check, ChevronDown } from 'lucide-react';

interface MultiSelectDropdownProps {
  id?: string;
  selected: string[];
  options: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  id,
  selected,
  options,
  onChange,
  placeholder = "Select Shoot Types"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleToggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const handleRemoveOption = (option: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter(item => item !== option));
  };

  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative w-full text-left" id={id}>
      {/* Search Input / Selector Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="min-h-[38px] w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus-within:border-cyan-500 rounded-lg p-1.5 flex flex-wrap gap-1.5 items-center justify-between cursor-pointer transition-all"
      >
        <div className="flex flex-wrap gap-1.5 items-center flex-1 min-w-0">
          {selected.length === 0 ? (
            <span className="text-xs text-slate-500 pl-1.5">{placeholder}</span>
          ) : (
            selected.map(val => (
              <span
                key={val}
                className="inline-flex items-center gap-1 bg-cyan-950/50 border border-cyan-800 text-cyan-300 text-[10px] md:text-xs font-semibold px-2 py-0.5 rounded-md hover:bg-cyan-900/30 transition-colors"
              >
                <span>{val}</span>
                <button
                  type="button"
                  onClick={(e) => handleRemoveOption(val, e)}
                  className="hover:text-rose-400 focus:outline-none p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex items-center pr-1.5 gap-1">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="text-slate-500 hover:text-slate-300 text-[10px] font-semibold"
            >
              Clear
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden animate-fade-in max-h-60 flex flex-col">
          {/* Search Bar */}
          <div className="flex items-center gap-2 border-b border-slate-900 px-3 py-2 bg-slate-950">
            <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search options..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options List */}
          <div className="overflow-y-auto py-1 max-h-44 scrollbar-thin scrollbar-thumb-slate-800">
            {filteredOptions.length === 0 ? (
              <p className="text-xs text-slate-600 px-3 py-2 text-center">No options found</p>
            ) : (
              filteredOptions.map(option => {
                const isSelected = selected.includes(option);
                return (
                  <div
                    key={option}
                    onClick={() => handleToggleOption(option)}
                    className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-cyan-950/40 text-cyan-400 font-bold'
                        : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${
                        isSelected ? 'border-cyan-500 bg-cyan-500' : 'border-slate-700 bg-transparent'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                      </div>
                      <span className="font-mono tracking-wider text-[11px] uppercase">{option}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
