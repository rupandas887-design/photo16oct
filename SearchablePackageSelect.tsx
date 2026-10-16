import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown, Check, Package as PackageIcon } from 'lucide-react';
import { Package } from '../../types';

export interface SearchablePackageSelectProps {
  id?: string;
  value: string;
  onChange: (packageId: string) => void;
  packages: Package[];
  isLocked?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  hasError?: boolean;
}

export const SearchablePackageSelect: React.FC<SearchablePackageSelectProps> = ({
  id = 'select_package_option',
  value,
  onChange,
  packages = [],
  isLocked = false,
  disabled = false,
  placeholder = 'Select Package Option...',
  className = '',
  hasError = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      // Small timeout ensures element is mounted and visible
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      // Reset search term when closed
      setSearchTerm('');
    }
  }, [isOpen]);

  // Filter active packages (excluding 'Custom Package', 'legacy', ₹0 placeholders)
  const activePkgs = useMemo(() => {
    const list = (packages || []).filter((p) => {
      if (p.status && p.status.toLowerCase() !== 'active') return false;
      const pId = String(p.package_id || '');
      const pName = String(p.package_name || '');
      if (pId === 'Custom Package' || pId === 'custom_package' || pName === 'Custom Package') return false;
      if (pName.toLowerCase().includes('legacy') || pName.toLowerCase().includes('₹0')) return false;
      return true;
    });

    // If current value is a valid package not already in active list, prepend it
    if (
      value &&
      value !== 'Custom Package' &&
      value !== 'custom_package' &&
      !list.some((p) => String(p.package_id) === String(value))
    ) {
      const matched = (packages || []).find((p) => String(p.package_id) === String(value));
      if (matched && !String(matched.package_name || '').toLowerCase().includes('legacy')) {
        list.unshift(matched);
      }
    }

    return list;
  }, [packages, value]);

  // Case-insensitive, partial-match search across package name, id, category
  const filteredPkgs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return activePkgs;

    return activePkgs.filter((pkg) => {
      const name = String(pkg.package_name || '').toLowerCase();
      const pkgId = String(pkg.package_id || '').toLowerCase();
      const category = String(pkg.category || '').toLowerCase();
      return name.includes(term) || pkgId.includes(term) || category.includes(term);
    });
  }, [activePkgs, searchTerm]);

  // Check if Custom Package matches search
  const showCustomPackageOption = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return 'custom package'.includes(term) || 'custom'.includes(term);
  }, [searchTerm]);

  // Find currently selected package for display label
  const selectedPkg = useMemo(() => {
    if (!value || value === 'Custom Package' || value === 'custom_package') {
      return null;
    }
    return (packages || []).find(
      (p) => String(p.package_id) === String(value) || String(p.package_name) === String(value)
    );
  }, [packages, value]);

  const displayLabel = useMemo(() => {
    if (value === 'Custom Package' || value === 'custom_package') {
      return 'Custom Package';
    }
    if (selectedPkg) {
      return `${selectedPkg.package_name} (₹${Number(selectedPkg.price).toLocaleString('en-IN')})`;
    }
    if (value) {
      return value;
    }
    return placeholder;
  }, [value, selectedPkg, placeholder]);

  const handleSelect = (pkgId: string) => {
    if (isLocked || disabled) return;
    onChange(pkgId);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden native select for form serialization, accessibility, and automation scripts */}
      <select
        id={id}
        name={id}
        value={value || 'Custom Package'}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      >
        <option value="Custom Package">Custom Package</option>
        {activePkgs.map((pkg) => (
          <option key={pkg.package_id} value={pkg.package_id}>
            {pkg.package_name} (₹{Number(pkg.price).toLocaleString('en-IN')})
          </option>
        ))}
      </select>

      {/* Visible Interactive Dropdown Trigger */}
      <div
        id={`${id}_trigger`}
        data-testid="select_package_option_trigger"
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (disabled || isLocked) return;
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled && !isLocked) setIsOpen((prev) => !prev);
          } else if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        className={`w-full bg-slate-955 border focus:outline-none rounded-lg py-1.5 px-3 text-xs cursor-pointer flex items-center justify-between gap-2 transition-colors select-none ${
          hasError
            ? 'border-rose-500/40 focus:border-rose-500 text-rose-200'
            : isOpen
            ? 'border-indigo-500 ring-1 ring-indigo-500/30 text-white'
            : 'border-slate-800 hover:border-slate-700 text-white'
        } ${disabled || isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className="truncate font-medium">{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-indigo-400' : ''
          }`}
        />
      </div>

      {/* Searchable Dropdown Menu Popover */}
      {isOpen && (
        <div
          data-testid="package_dropdown_menu"
          className="absolute left-0 right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-750 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 font-sans"
        >
          {/* Search Input Box */}
          <div className="p-2 border-b border-slate-800 bg-slate-950/80 sticky top-0 z-10">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                id="search_package_option_input"
                data-testid="search_package_option_input"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                  }
                }}
                placeholder="Search package by name..."
                className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 text-white text-xs rounded-lg pl-8 pr-7 py-1.5 focus:outline-none placeholder:text-slate-500 font-sans"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2 p-0.5 text-slate-400 hover:text-white rounded transition cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Match Counter Header */}
            <div className="flex items-center justify-between px-1 pt-1.5 text-[10px] text-slate-400 font-mono">
              <span>
                {searchTerm
                  ? `Found ${filteredPkgs.length + (showCustomPackageOption ? 1 : 0)} matches`
                  : `All ${activePkgs.length + 1} packages available`}
              </span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>

          {/* Package Options List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/40 p-1">
            {/* Custom Package Option */}
            {showCustomPackageOption && (
              <div
                role="option"
                aria-selected={value === 'Custom Package' || value === 'custom_package'}
                onClick={() => handleSelect('Custom Package')}
                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                  value === 'Custom Package' || value === 'custom_package'
                    ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                    : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                  <span className="font-semibold">Custom Package</span>
                </div>
                {(value === 'Custom Package' || value === 'custom_package') && (
                  <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                )}
              </div>
            )}

            {/* Filtered Packages */}
            {filteredPkgs.map((pkg) => {
              const isSelected = String(value) === String(pkg.package_id);
              return (
                <div
                  key={pkg.package_id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(pkg.package_id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                    isSelected
                      ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                      : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-medium truncate text-slate-100">{pkg.package_name}</span>
                    {pkg.category && (
                      <span className="text-[10px] text-slate-400 font-mono">{pkg.category}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono font-bold text-amber-300">
                      ₹{Number(pkg.price).toLocaleString('en-IN')}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  </div>
                </div>
              );
            })}

            {/* No Matching Packages Found */}
            {filteredPkgs.length === 0 && !showCustomPackageOption && (
              <div className="py-6 px-4 text-center">
                <PackageIcon className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-300 font-medium">
                  No packages found matching &ldquo;{searchTerm}&rdquo;
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Try searching with different keywords
                </p>
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="mt-2.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium underline cursor-pointer"
                >
                  Show all packages
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
