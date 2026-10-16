import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Calendar } from 'lucide-react';
import { formatDateDDMMYY, formatTime12Hour } from '../utils';

interface UnifiedEventDropdownCellProps {
  lead: any;
}

export const UnifiedEventDropdownCell: React.FC<UnifiedEventDropdownCellProps> = ({ lead }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUpward: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();

  // Extract events array for this lead or order
  let eventsList: Array<{
    event_name: string;
    event_date: string;
    event_start_time?: string;
    event_end_date?: string;
    event_end_time?: string;
    shoot_type?: string;
  }> = [];

  if (lead?.events && Array.isArray(lead.events) && lead.events.length > 0) {
    eventsList = lead.events.map((ev: any, idx: number) => ({
      event_name: ev.event_name || ev.event_type || ev.Event_Name || `Event ${idx + 1}`,
      event_date: ev.event_date || ev.Event_Date || '—',
      event_start_time: ev.event_start_time || ev.event_time || ev.Event_Start_Time || '',
      event_end_date: ev.event_end_date || ev.Event_End_Date || '',
      event_end_time: ev.event_end_time || '',
      shoot_type: ev.event_shoot_type || ev.shoot_type || lead?.shoot_type || '',
    }));
  } else if (lead?.event_name || lead?.Event_Name || lead?.event_date || lead?.Event_Date || lead?.event_type) {
    eventsList = [{
      event_name: lead.event_name || lead.Event_Name || lead.event_type || 'Event 1',
      event_date: lead.event_date || lead.Event_Date || '—',
      event_start_time: lead.event_start_time || lead.event_time || lead.Event_Start_Time || '',
      event_end_date: lead?.event_end_date || lead?.Event_End_Date || '',
      event_end_time: lead?.event_end_time || '',
      shoot_type: lead?.shoot_type || lead?.event_shoot_type || '',
    }];
  } else {
    eventsList = [{
      event_name: 'Event 1',
      event_date: '—',
      event_start_time: '',
      shoot_type: lead?.shoot_type || '',
    }];
  }

  // Function to calculate exact floating coordinates
  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Floating popup width
    const popupWidth = Math.min(230, vw - 24);

    // Horizontal placement: align near button, ensure clamped within viewport
    let left = rect.left;
    if (left + popupWidth > vw - 12) {
      left = Math.max(12, vw - popupWidth - 12);
    }
    if (left < 12) {
      left = 12;
    }

    // Vertical placement: calculate space above vs below
    const spaceBelow = vh - rect.bottom - 8;
    const spaceAbove = rect.top - 8;

    let openUpward = false;
    let top = rect.bottom + 6;
    let maxHeight = Math.max(140, Math.min(320, spaceBelow));

    if (spaceBelow < 180 && spaceAbove > spaceBelow) {
      openUpward = true;
      maxHeight = Math.max(140, Math.min(320, spaceAbove));
      top = Math.max(12, rect.top - maxHeight - 6);
    }

    setCoords({
      top,
      left,
      width: popupWidth,
      maxHeight,
      openUpward,
    });
  };

  // Ensure only one dropdown is open across the entire app
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

  // Handle outside clicks, resize, scroll repositioning
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
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

    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('touchstart', handleOutsideClick, true);
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
      document.removeEventListener('touchstart', handleOutsideClick, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, eventsList.length]);

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      window.dispatchEvent(new CustomEvent('close-all-event-dropdowns', { detail: { id: instanceId } }));
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Sort events by date descending (most recent first)
  const sortedEventsList = [...eventsList].sort((a, b) => {
    const timeA = a.event_date && a.event_date !== '—' ? new Date(a.event_date).getTime() : 0;
    const timeB = b.event_date && b.event_date !== '—' ? new Date(b.event_date).getTime() : 0;
    return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
  });

  const primaryEventName = sortedEventsList[0]?.event_name || 'Event';
  const displayLabel = sortedEventsList.length > 1 ? `${primaryEventName} +${sortedEventsList.length - 1}` : primaryEventName;

  return (
    <div className="inline-block text-left" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleDropdown}
        className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer shadow-xs whitespace-nowrap select-none ${
          isOpen
            ? 'bg-sky-500/25 text-sky-300 border border-sky-400/60 ring-2 ring-sky-500/20'
            : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/30 hover:border-sky-500/50'
        }`}
        title={`Event Details: ${displayLabel}`}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0 text-sky-400" />
        <span>{displayLabel}</span>
      </button>

      {isOpen && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="fixed rounded-xl bg-slate-900 border border-slate-750 shadow-2xl overflow-hidden z-[99999] animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.maxHeight}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="overflow-y-auto max-h-[inherit]">
            {eventsList.length <= 1 ? (
              // Single Event Display
              (() => {
                const ev = eventsList[0];
                const evFormattedDate = formatDateDDMMYY(ev.event_date);
                const evFormattedTime = formatTime12Hour(ev.event_start_time) || '—';
                return (
                  <div className="p-3.5 space-y-3 font-sans">
                    <div>
                      <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase block">
                        EVENT
                      </span>
                      <span className="text-xs font-bold text-white block mt-0.5">
                        {ev.event_name || 'Event 1'}
                      </span>
                    </div>

                    <div className="border-t border-slate-800/80 pt-2">
                      <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase block">
                        DATE
                      </span>
                      <span className="text-xs font-semibold text-slate-200 font-mono block mt-0.5">
                        {evFormattedDate}
                      </span>
                    </div>

                    <div className="border-t border-slate-800/80 pt-2">
                      <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase block">
                        TIME
                      </span>
                      <span className="text-xs font-semibold text-slate-200 font-mono block mt-0.5">
                        {evFormattedTime}
                      </span>
                    </div>

                    {ev.shoot_type && (
                      <div className="border-t border-slate-800/80 pt-2">
                        <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase block">
                          SHOOT TYPE
                        </span>
                        <span className="text-[11px] font-medium text-sky-400 block mt-0.5">
                          {ev.shoot_type}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              // Multiple Events Display
              <div className="p-2.5 space-y-2 font-sans">
                <div className="px-1 py-0.5 text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800/80 pb-1.5 flex items-center justify-between">
                  <span>Events</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                    {eventsList.length} Total
                  </span>
                </div>
                <div className="space-y-1.5">
                  {eventsList.map((ev, idx) => {
                    const evFormattedDate = formatDateDDMMYY(ev.event_date);
                    const evFormattedTime = formatTime12Hour(ev.event_start_time);
                    return (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-slate-800/60 border border-slate-750/70 hover:bg-slate-800 transition-colors"
                      >
                        <div className="text-xs font-bold text-white">
                          {ev.event_name || `Event ${idx + 1}`}
                        </div>
                        <div className="text-[11px] font-mono text-slate-300 mt-1 flex items-center gap-1.5 flex-wrap">
                          <span>{evFormattedDate}</span>
                          {evFormattedTime && (
                            <>
                              <span className="text-slate-500">·</span>
                              <span className="text-sky-300">{evFormattedTime}</span>
                            </>
                          )}
                        </div>
                        {ev.shoot_type && (
                          <div className="text-[10px] text-sky-400/90 font-medium mt-1">
                            {ev.shoot_type}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
