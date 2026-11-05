import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Check, ChevronDown } from 'lucide-react';
import { useDropdownAutoClose } from './useDropdownCoordinator';

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
  const [openUpward, setOpenUpward] = useState(false);
  const [maxMenuHeight, setMaxMenuHeight] = useState(260);

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Position calculation: prevent cutting off or overflowing viewport
  const updatePosition = useCallback(() => {
    if (!containerRef.current || typeof window === 'undefined') return;
    const rect = containerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;

    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;

    const shouldOpenUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    setOpenUpward(shouldOpenUpward);

    const availableSpace = shouldOpenUpward ? spaceAbove : spaceBelow;
    setMaxMenuHeight(Math.max(140, Math.min(280, availableSpace - 10)));
  }, []);

  // Use the auto-close hook for outside click/tap, Escape key, and other dropdown opens
  useDropdownAutoClose({
    isOpen,
    setIsOpen,
    triggerRef: containerRef,
    menuRef,
    instanceId: id,
    closeOnEscape: true,
    closeOnOutsideClick: true,
    closeOnOtherDropdownOpen: true,
    onClose: () => setSearchTerm(''),
  });

  // Calculate position and focus input on open
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearchTerm('');
    }
  }, [isOpen, updatePosition]);

  // Recalculate on window resize or scroll
  useEffect(() => {
    if (!isOpen) return;
    const handleScrollOrResize = () => {
      updatePosition();
    };
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

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
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          updatePosition();
          setIsOpen(!isOpen);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            updatePosition();
            setIsOpen(!isOpen);
          } else if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        className="min-h-[38px] w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus-within:border-cyan-500 rounded-lg p-1.5 flex flex-wrap gap-1.5 items-center justify-between cursor-pointer transition-all select-none"
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
                  className="hover:text-rose-400 focus:outline-none p-0.5 cursor-pointer"
                  title={`Remove ${val}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex items-center pr-1.5 gap-1 shrink-0">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="text-slate-500 hover:text-slate-300 text-[10px] font-semibold cursor-pointer px-1 py-0.5 rounded hover:bg-slate-900"
            >
              Clear
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${isOpen ? 'rotate-180 text-cyan-400' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div
          ref={menuRef}
          style={{ maxHeight: `${maxMenuHeight}px` }}
          className={`absolute left-0 right-0 z-50 ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } w-full bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col font-sans backdrop-blur-md`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Bar */}
          <div className="flex items-center gap-2 border-b border-slate-900 px-3 py-2 bg-slate-950 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search options..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
              className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  searchInputRef.current?.focus();
                }}
                className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Options List with Touch-Friendly Items & Proper Scrolling */}
          <div className="overflow-y-auto py-1 flex-1 scrollbar-thin scrollbar-thumb-slate-800 touch-pan-y">
            {filteredOptions.length === 0 ? (
              <p className="text-xs text-slate-600 px-3 py-3 text-center font-mono">No options found</p>
            ) : (
              filteredOptions.map(option => {
                const isSelected = selected.includes(option);
                return (
                  <div
                    key={option}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleToggleOption(option)}
                    className={`flex items-center justify-between px-3 py-2 sm:py-2 text-xs cursor-pointer transition-colors select-none ${
                      isSelected
                        ? 'bg-cyan-950/40 text-cyan-400 font-bold'
                        : 'text-slate-300 hover:bg-slate-900 active:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-4 h-4 border rounded flex items-center justify-center transition-colors shrink-0 ${
                        isSelected ? 'border-cyan-500 bg-cyan-500' : 'border-slate-700 bg-transparent'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                      </div>
                      <span className="font-mono tracking-wider text-[11px] uppercase truncate">{option}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Touch-Friendly Action Footer */}
          <div className="p-2 px-3 border-t border-slate-900 bg-slate-950/90 flex items-center justify-between text-[11px] font-mono text-slate-500 shrink-0">
            <span>{selected.length} selected</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded-lg font-bold text-xs transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
