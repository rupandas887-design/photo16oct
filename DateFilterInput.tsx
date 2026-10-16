import React, { useState, useEffect, useRef } from 'react';
import { Calendar, X } from 'lucide-react';
import { formatDateToDDMMYYYY, parseDateToYYYYMMDD } from '../../utils';

export interface DateFilterInputProps {
  value?: string; // Standard format: YYYY-MM-DD or empty
  onChange: (val: string) => void; // Emits standard format: YYYY-MM-DD or empty
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  title?: string;
  min?: string;
  max?: string;
  clearable?: boolean;
  'data-testid'?: string;
}

export const DateFilterInput: React.FC<DateFilterInputProps> = ({
  value = '',
  onChange,
  placeholder = 'DD/MM/YYYY',
  className = '',
  id,
  name,
  disabled = false,
  required = false,
  title,
  min,
  max,
  clearable = true,
  'data-testid': testId
}) => {
  const [displayText, setDisplayText] = useState<string>(() => formatDateToDDMMYYYY(value));
  const [isFocused, setIsFocused] = useState(false);
  const hiddenNativeInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync internal display text whenever the external value changes
  useEffect(() => {
    const formatted = formatDateToDDMMYYYY(value);
    setDisplayText(formatted);
  }, [value]);

  // Handle typing inside the display input
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // Filter to allow numbers, slashes, dashes, dots
    raw = raw.replace(/[^\d/.-]/g, '');

    // Auto-insert slash after 2 digits and 5 digits if user is typing forward
    if (raw.length === 2 && !raw.includes('/') && !raw.includes('-') && !raw.includes('.')) {
      raw = raw + '/';
    } else if (raw.length === 5 && (raw.match(/\//g) || []).length === 1) {
      raw = raw + '/';
    }

    // Limit to 10 characters (DD/MM/YYYY)
    if (raw.length > 10) {
      raw = raw.slice(0, 10);
    }

    setDisplayText(raw);

    if (!raw.trim()) {
      onChange('');
      return;
    }

    // If matches complete DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyyMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (ddmmyyyyMatch) {
      const day = parseInt(ddmmyyyyMatch[1], 10);
      const month = parseInt(ddmmyyyyMatch[2], 10);
      const year = parseInt(ddmmyyyyMatch[3], 10);

      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
        const iso = parseDateToYYYYMMDD(raw);
        if (iso) {
          onChange(iso);
        }
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!displayText.trim()) {
      if (value) onChange('');
      setDisplayText('');
      return;
    }

    // Normalize on blur
    const iso = parseDateToYYYYMMDD(displayText);
    if (iso && iso.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const formatted = formatDateToDDMMYYYY(iso);
      setDisplayText(formatted);
      onChange(iso);
    } else {
      // Revert to current external value if invalid
      setDisplayText(formatDateToDDMMYYYY(value));
    }
  };

  // Trigger browser date picker
  const handleCalendarClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    if (hiddenNativeInputRef.current) {
      try {
        if ('showPicker' in HTMLInputElement.prototype) {
          hiddenNativeInputRef.current.showPicker();
        } else {
          hiddenNativeInputRef.current.focus();
          hiddenNativeInputRef.current.click();
        }
      } catch (_) {
        hiddenNativeInputRef.current.focus();
        hiddenNativeInputRef.current.click();
      }
    }
  };

  // When user picks a date via browser picker
  const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pickedIso = e.target.value; // YYYY-MM-DD
    if (pickedIso) {
      const formatted = formatDateToDDMMYYYY(pickedIso);
      setDisplayText(formatted);
      onChange(pickedIso);
    } else {
      setDisplayText('');
      onChange('');
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDisplayText('');
    onChange('');
    if (hiddenNativeInputRef.current) {
      hiddenNativeInputRef.current.value = '';
    }
  };

  // Convert current ISO value to YYYY-MM-DD for native input
  const nativeValue = parseDateToYYYYMMDD(value) || '';

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center w-full min-w-0 ${className ? '' : 'bg-zinc-950 border border-zinc-800 rounded-xl'}`}
    >
      <input
        type="text"
        id={id}
        name={name}
        data-testid={testId}
        value={displayText}
        onChange={handleTextChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        title={title || 'Date format: DD/MM/YYYY'}
        maxLength={10}
        className={`w-full bg-transparent font-mono text-xs pr-7 focus:outline-none transition-colors ${className}`}
      />

      {/* Hidden native input for popup calendar picker */}
      <input
        ref={hiddenNativeInputRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={nativeValue}
        min={min}
        max={max}
        onChange={handleNativeDateChange}
        className="sr-only absolute opacity-0 pointer-events-none w-0 h-0"
      />

      {/* Action buttons (Clear and Calendar Icon) */}
      <div className="absolute right-2 flex items-center gap-1 shrink-0">
        {clearable && displayText && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer rounded"
            title="Clear date"
            tabIndex={-1}
          >
            <X className="w-3 h-3" />
          </button>
        )}
        <button
          type="button"
          onClick={handleCalendarClick}
          className="p-0.5 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer rounded"
          title="Pick date from calendar"
          tabIndex={-1}
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
