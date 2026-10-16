import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Check, ChevronDown, ArrowUpDown } from 'lucide-react';

export type SortOrder = 'latest' | 'oldest';

export interface ListSortFilterProps {
  value: SortOrder;
  onChange: (val: SortOrder) => void;
  label?: string;
  className?: string;
  buttonClassName?: string;
  align?: 'left' | 'right';
  id?: string;
}

/**
 * Parses any date string and optional time string into a millisecond timestamp.
 * Handles DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, ISO timestamps, and 12-hour/24-hour time formats.
 */
export function parseDateTimeToTimestamp(dStr?: string, tStr?: string): number {
  if (!dStr || typeof dStr !== 'string' || !dStr.trim()) return 0;
  const s = dStr.trim();
  let year = 1970, month = 0, day = 1;
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(s)) {
    const parts = s.split(/[-/]/);
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    year = parseInt(parts[2], 10);
  } else if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)) {
    const parts = s.split(/[-/]/);
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  } else {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      year = d.getFullYear();
      month = d.getMonth();
      day = d.getDate();
    }
  }

  let hours = 0, minutes = 0;
  if (tStr && typeof tStr === 'string' && tStr.trim()) {
    const t = tStr.trim().toUpperCase();
    const isPM = t.includes('PM');
    const isAM = t.includes('AM');
    const cleanTime = t.replace(/(AM|PM)/g, '').trim();
    const timeParts = cleanTime.split(':');
    if (timeParts.length >= 1) {
      let h = parseInt(timeParts[0], 10) || 0;
      const m = parseInt(timeParts[1] || '0', 10) || 0;
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      hours = h;
      minutes = m;
    }
  }

  const combined = new Date(year, month, day, hours, minutes);
  return isNaN(combined.getTime()) ? 0 : combined.getTime();
}

/**
 * Natural alphanumeric comparator for IDs (e.g. ORD-100 > ORD-99, LEAD-200 > LEAD-99).
 */
export function compareAlphanumeric(valA: any, valB: any): number {
  const strA = String(valA || '').trim();
  const strB = String(valB || '').trim();
  return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Extracts a high-accuracy numerical timestamp from any record across dashboards.
 * Prioritizes event dates, target delivery dates, reporting dates, then created timestamps, then ID numerical values.
 */
export function getRecordDateTimestamp(item: any): number {
  if (!item) return 0;

  // 0. Explicit production entry / transfer timestamp (most recent transfer into Production)
  if (item.production_entry_timestamp && typeof item.production_entry_timestamp === 'number' && item.production_entry_timestamp > 0) {
    return item.production_entry_timestamp;
  }

  // 1. Direct or nested event_date + event_time
  const eventDateStr = item.event_date || item.eventDate || item.orderObj?.event_date || item.leadObj?.event_date || item.date;
  const eventTimeStr = item.event_time || item.eventStartTime || item.event_start_time || item.start_time || item.time || item.orderObj?.event_time || item.leadObj?.event_time;
  if (eventDateStr) {
    const t = parseDateTimeToTimestamp(String(eventDateStr), eventTimeStr ? String(eventTimeStr) : undefined);
    if (t > 0) return t;
  }

  // 2. Direct or nested Target Delivery Date / Expected Delivery Date
  const targetDelivDateStr = item.targetDeliveryDate || item.target_delivery_date || item.expected_delivery_date || item.targetFinishDate || item.delivery_date;
  if (targetDelivDateStr) {
    const t = parseDateTimeToTimestamp(String(targetDelivDateStr));
    if (t > 0) return t;
  }

  // 3. Direct or nested Reporting Date + Reporting Time
  const reportingDateStr = item.reporting_date || item.reportingDate || item.Reporting_date;
  const reportingTimeStr = item.reporting_time || item.reportingTime;
  if (reportingDateStr) {
    const t = parseDateTimeToTimestamp(String(reportingDateStr), reportingTimeStr ? String(reportingTimeStr) : undefined);
    if (t > 0) return t;
  }

  // 4. Direct created_at or created_date
  if (item.created_at) {
    const t = new Date(item.created_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (item.created_date) {
    const t = new Date(item.created_date).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  // 5. Nested orderObj or leadObj or prodObj timestamps
  if (item.orderObj?.created_at) {
    const t = new Date(item.orderObj.created_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (item.leadObj?.created_at) {
    const t = new Date(item.leadObj.created_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (item.orderObj?.created_date) {
    const t = new Date(item.orderObj.created_date).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  // 6. updated_at or modified_at
  if (item.updated_at) {
    const t = new Date(item.updated_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  // 7. Specific dates like request_date, requested_at, assignment_date
  if (item.request_date || item.requested_at) {
    const t = new Date(item.request_date || item.requested_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (item.assignment_date || item.assigned_at) {
    const t = new Date(item.assignment_date || item.assigned_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  return 0;
}

/**
 * Universal comparator function for sorting any array of records by date
 */
export function compareRecordsByDate(a: any, b: any, order: SortOrder = 'latest'): number {
  const timeA = getRecordDateTimestamp(a);
  const timeB = getRecordDateTimestamp(b);

  if (timeA !== timeB && timeA > 0 && timeB > 0) {
    return order === 'latest' ? timeB - timeA : timeA - timeB;
  }

  // Tiebreaker by natural alphanumeric ID (so ORD-100 appears before ORD-99 when latest/descending)
  const idA = String(a.order_id || a.orderId || a.lead_id || a.leadId || a.id || '');
  const idB = String(b.order_id || b.orderId || b.lead_id || b.leadId || b.id || '');
  if (idA && idB) {
    const comp = compareAlphanumeric(idA, idB);
    if (comp !== 0) {
      return order === 'latest' ? -comp : comp;
    }
  }

  return 0;
}

export const ListSortFilter: React.FC<ListSortFilterProps> = ({
  value,
  onChange,
  label = 'Sort Records',
  className = '',
  buttonClassName = '',
  align = 'right',
  id = 'list_sort_filter'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openUpward: boolean;
  } | null>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const dropdownWidth = 180;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < 120 && spaceAbove > spaceBelow;

    let left = align === 'right' ? rect.right - dropdownWidth : rect.left;
    left = Math.max(12, Math.min(left, viewportWidth - dropdownWidth - 12));

    const top = openUpward ? rect.top - 6 : rect.bottom + 6;

    setCoords({
      top,
      left,
      width: dropdownWidth,
      openUpward
    });
  }, [align]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target;
      if (!target || !(target instanceof Node)) return;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  const handleSelect = (newVal: SortOrder) => {
    onChange(newVal);
    setIsOpen(false);
  };

  return (
    <div className={`relative inline-block text-left ${className}`}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer select-none active:scale-95 ${
          isOpen
            ? 'bg-zinc-800 text-white border-zinc-600 shadow-md ring-1 ring-zinc-500/30'
            : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border-zinc-750 hover:border-zinc-600 shadow-sm'
        } ${buttonClassName}`}
        title={`Sort Records (${value === 'latest' ? 'Latest Event Date on Top' : 'Oldest Event Date on Top'})`}
      >
        <Filter className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="font-mono text-xs">{label}</span>
        <span className="text-[10px] text-zinc-400">▾</span>
      </button>

      {isOpen && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: coords.openUpward ? undefined : `${coords.top}px`,
            bottom: coords.openUpward ? `${window.innerHeight - coords.top}px` : undefined,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 999999
          }}
          className="bg-zinc-950/98 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-150 font-sans"
        >
          <div className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-850/80 flex items-center justify-between">
            <span>Sort Records</span>
            <ArrowUpDown className="w-3 h-3 text-zinc-400" />
          </div>

          <div className="p-1 space-y-0.5">
            <button
              type="button"
              onClick={() => handleSelect('latest')}
              className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer text-left ${
                value === 'latest'
                  ? 'bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30'
                  : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
              }`}
            >
              <span>Latest Event Date on Top</span>
              {value === 'latest' && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1.5" />}
            </button>

            <button
              type="button"
              onClick={() => handleSelect('oldest')}
              className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer text-left ${
                value === 'oldest'
                  ? 'bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30'
                  : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
              }`}
            >
              <span>Oldest Event Date on Top</span>
              {value === 'oldest' && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1.5" />}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
