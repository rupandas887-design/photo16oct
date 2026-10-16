import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { formatTime12Hour, formatDateDDMMYY } from '../utils';

interface EventDropdownCellProps {
  type: 'name' | 'date' | 'time';
  items: string[];
  events?: any[];
}

export const EventDropdownCell: React.FC<EventDropdownCellProps> = ({ type, items, events }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const desiredWidth = 240;
    const menuWidth = Math.min(desiredWidth, vw - 24);

    let left = rect.left;
    if (left + menuWidth > vw - 12) {
      left = Math.max(12, vw - menuWidth - 12);
    }
    if (left < 12) {
      left = 12;
    }

    const spaceBelow = vh - rect.bottom - 8;
    const spaceAbove = rect.top - 8;

    let top = rect.bottom + 4;
    let maxHeight = Math.max(100, Math.min(300, spaceBelow));

    if (spaceBelow < 160 && spaceAbove > spaceBelow) {
      maxHeight = Math.max(100, Math.min(300, spaceAbove));
      top = Math.max(12, rect.top - maxHeight - 4);
    }

    setCoords({
      top,
      left,
      width: menuWidth,
      maxHeight,
    });
  };

  useEffect(() => {
    const handleCloseOthers = (e: Event) => {
      const customEv = e as CustomEvent<{ id: string }>;
      if (customEv.detail?.id !== instanceId) {
        setIsOpen(false);
      }
    };
    window.addEventListener('close-all-event-dropdowns', handleCloseOthers);
    return () => {
      window.removeEventListener('close-all-event-dropdowns', handleCloseOthers);
    };
  }, [instanceId]);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target;
      if (!target || !(target instanceof Node)) return;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleScrollOrResize = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          setIsOpen(false);
          return;
        }
        updatePosition();
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  if (!items || items.length === 0) {
    return <span className="text-zinc-600 italic">—</span>;
  }

  // If only one event, display normally
  if (items.length === 1) {
    if (type === 'name') {
      return (
        <div className="text-xs truncate font-sans text-zinc-300" title={items[0]}>
          {items[0]}
        </div>
      );
    } else if (type === 'date') {
      return <span className="text-zinc-300 font-mono">{formatDateDDMMYY(items[0])}</span>;
    } else {
      return <span className="text-zinc-300 font-mono">{formatTime12Hour(items[0])}</span>;
    }
  }

  let part1 = '';
  if (type === 'name') {
    part1 = 'Multiple Events';
  } else if (type === 'date') {
    part1 = 'Multiple Dates';
  } else {
    part1 = 'Multiple Times';
  }
  const count = `(${items.length})`;

  return (
    <div className="relative inline-block text-left w-[125px] h-[38px]">
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          ref={buttonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!isOpen) {
              window.dispatchEvent(new CustomEvent('close-all-event-dropdowns', { detail: { id: instanceId } }));
              updatePosition();
              setIsOpen(true);
            } else {
              setIsOpen(false);
            }
          }}
          className="w-full min-h-[38px] h-auto py-1 px-2 flex items-center justify-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded transition-colors cursor-pointer select-none border border-indigo-500/20 font-mono leading-tight text-center relative z-10"
        >
          <span className="flex-shrink-0 text-[9px] translate-y-[0.5px]">{isOpen ? '▼' : '▶'}</span>
          <div className="flex flex-col items-center justify-center leading-none">
            <span className="whitespace-normal block">{part1}</span>
            <span className="text-[10px] font-bold block mt-1">{count}</span>
          </div>
        </button>
      </div>

      {isOpen && coords && typeof document !== 'undefined' && createPortal(
        <div 
          ref={menuRef}
          className="fixed rounded-xl bg-zinc-950 border border-zinc-800 shadow-2xl py-2 z-[99999] overflow-y-auto select-none animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.maxHeight}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {type === 'name' && events && events.length > 0 ? (
            events.map((ev, idx) => {
              const name = ev.event_name || '';
              const date = ev.event_date ? formatDateDDMMYY(ev.event_date) : '—';
              const time = ev.event_start_time ? formatTime12Hour(ev.event_start_time) : '—';
              return (
                <div
                  key={idx}
                  className="px-4 py-2 border-b border-zinc-900/60 last:border-0 hover:bg-zinc-900/50 transition-colors text-left"
                >
                  <div className="font-semibold text-xs text-indigo-300 flex items-start gap-1">
                    <span className="text-indigo-500 mt-0.5">•</span>
                    <span className="break-words">{name}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1 ml-3 font-mono">
                    Date: {date}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono ml-3">
                    Time: {time}
                  </div>
                </div>
              );
            })
          ) : (
            items.map((item, idx) => (
              <div
                key={idx}
                className="px-4 py-2 text-[11px] font-medium text-zinc-300 border-b border-zinc-900/60 last:border-0 hover:bg-zinc-900/50 transition-colors text-left font-mono"
              >
                {type === 'date' ? formatDateDDMMYY(item) : type === 'time' ? formatTime12Hour(item) : (item || '—')}
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
