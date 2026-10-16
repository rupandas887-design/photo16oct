import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, X, Layers } from 'lucide-react';
import { Lead } from '../types';

export interface EventCellProps {
  lead: Lead;
  orders?: any[];
  filterEventDateOption?: string;
}

export interface DetailedEventItem {
  id: string;
  eventName: string;
  eventType: string;
  eventDate: string;
  eventTime: string;
  timestamp: number;
}

export const getEventDateTimeTimestamp = (dateStr: string, timeStr?: string): number => {
  if (!dateStr || !dateStr.trim()) return 0;
  const s = dateStr.trim();
  let year = 1970;
  let month = 0;
  let day = 1;

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

  let hours = 0;
  let minutes = 0;
  if (timeStr && timeStr.trim()) {
    const t = timeStr.trim().toUpperCase();
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

  const combinedDate = new Date(year, month, day, hours, minutes);
  return isNaN(combinedDate.getTime()) ? 0 : combinedDate.getTime();
};

export const formatEventDisplayDate = (dateStr: string): string => {
  if (!dateStr || !dateStr.trim() || dateStr === '—') return '—';
  const s = dateStr.trim();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  let year: number, month: number, day: number;
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
    if (isNaN(d.getTime())) return dateStr;
    year = d.getFullYear();
    month = d.getMonth();
    day = d.getDate();
  }

  const dayStr = day < 10 ? `0${day}` : `${day}`;
  const monthStr = months[month] || '';
  return `${dayStr} ${monthStr} ${year}`;
};

export const formatEventDisplayTime = (timeStr?: string): string => {
  if (!timeStr || !timeStr.trim()) return '';
  const t = timeStr.trim();
  if (t.toUpperCase().includes('AM') || t.toUpperCase().includes('PM')) {
    return t;
  }
  const parts = t.split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const mins = parts[1].padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = hours < 10 ? `0${hours}` : `${hours}`;
    return `${hoursStr}:${mins} ${ampm}`;
  }
  return t;
};

export const getSortedEventsForOrder = (lead: Lead, orders?: any[]): DetailedEventItem[] => {
  const linkedOrder = orders?.find((o: any) => 
    o.lead_id === lead.lead_id || 
    o.order_id === lead.lead_id || 
    (lead.order_id && (o.order_id === lead.order_id || o.lead_id === lead.order_id)) ||
    ((lead as any).orders && (o.order_id === (lead as any).orders || o.lead_id === (lead as any).orders))
  );

  const rawEventsList = (lead?.events && Array.isArray(lead.events) && lead.events.length > 0)
    ? lead.events
    : (linkedOrder?.events && Array.isArray(linkedOrder.events) && linkedOrder.events.length > 0)
      ? linkedOrder.events
      : [];

  if (rawEventsList.length > 0) {
    const list: DetailedEventItem[] = rawEventsList.map((ev: any, idx: number) => {
      const name = (
        ev.event_name || 
        ev.custom_event_name || 
        ev.event_type || 
        ev.Event_Name || 
        lead.custom_event_name || 
        lead.event_name || 
        lead.event_type || 
        `Event ${idx + 1}`
      ).trim();

      const type = (ev.event_type || ev.event_category || ev.eventType || lead.event_type || 'Event').trim();
      const dateStr = (ev.event_date || ev.Event_Date || ev.date || lead.event_date || '').trim();
      const timeStr = (ev.event_start_time || ev.event_time || ev.Event_Start_Time || ev.time || lead.event_time || '').trim();
      const timestamp = getEventDateTimeTimestamp(dateStr, timeStr);

      return {
        id: ev.id || ev.event_id || `evt-${idx}`,
        eventName: name || 'Event',
        eventType: type || 'Event',
        eventDate: dateStr,
        eventTime: timeStr,
        timestamp
      };
    });

    // Sort by MOST RECENT event date + time FIRST (descending timestamp: latest/furthest first)
    list.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      if (a.timestamp) return -1;
      if (b.timestamp) return 1;
      return 0;
    });

    return list;
  }

  // Single fallback event
  const singleName = (
    lead.custom_event_name || 
    lead.event_name || 
    lead.event_type || 
    linkedOrder?.custom_event_name || 
    linkedOrder?.event_name || 
    linkedOrder?.event_type || 
    'Event'
  ).trim();

  const singleType = (lead.event_type || linkedOrder?.event_type || 'Event').trim();
  const singleDate = (lead.event_date || linkedOrder?.event_date || '').trim();
  const singleTime = (lead.event_time || linkedOrder?.event_time || '').trim();
  const timestamp = getEventDateTimeTimestamp(singleDate, singleTime);

  return [{
    id: lead.event_id || lead.lead_id || 'evt-0',
    eventName: singleName || 'Event',
    eventType: singleType || 'Event',
    eventDate: singleDate,
    eventTime: singleTime,
    timestamp
  }];
};

export const EventCell: React.FC<EventCellProps> = ({ lead, orders, filterEventDateOption }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUpward: boolean;
  } | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();

  const events = getSortedEventsForOrder(lead, orders);

  // Identify the target event to display:
  // - "most_recent" or default: index 0 (latest event)
  // - "last_event": index 1 (event immediately before latest event) if >= 2 events exist, else index 0
  const targetIndex = (filterEventDateOption === 'last_event' && events.length >= 2) ? 1 : 0;
  const targetEvent = events[targetIndex] || events[0];

  const displayedName = targetEvent?.eventName || 'Event';
  const displayedTime = targetEvent?.eventTime || '';
  const additionalCount = events.length > 1 ? events.length - 1 : 0;

  const linkedOrder = orders?.find((o: any) => 
    o.lead_id === lead.lead_id || 
    o.order_id === lead.lead_id || 
    (lead.order_id && (o.order_id === lead.order_id || o.lead_id === lead.order_id)) ||
    ((lead as any).orders && (o.order_id === (lead as any).orders || o.lead_id === (lead as any).orders))
  );
  const displayOrderId = linkedOrder?.order_id || lead.order_id || (lead as any).orders || lead.lead_id || 'N/A';

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const popupWidth = Math.min(280, vw - 24);
    let left = rect.left;
    if (left + popupWidth > vw - 12) {
      left = Math.max(12, vw - popupWidth - 12);
    }
    if (left < 12) {
      left = 12;
    }

    const spaceBelow = vh - rect.bottom - 8;
    const spaceAbove = rect.top - 8;

    let openUpward = false;
    let top = rect.bottom + 6;
    let maxHeight = Math.max(160, Math.min(340, spaceBelow));

    if (spaceBelow < 180 && spaceAbove > spaceBelow) {
      openUpward = true;
      maxHeight = Math.max(160, Math.min(340, spaceAbove));
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

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target;
      if (!target || !(target instanceof Node)) return;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (additionalCount === 0) {
    return (
      <div className="flex flex-col items-start gap-0.5 text-left select-text">
        <span 
          className="text-zinc-100 font-semibold text-xs leading-snug truncate max-w-[140px]"
          title={displayedName}
        >
          {displayedName}
        </span>
        <span className="text-amber-300 font-mono text-[11px] leading-tight">
          {formatEventDisplayTime(displayedTime) || '—'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-start">
      <button
        ref={buttonRef}
        type="button"
        id={`btn_event_name_${lead.lead_id}`}
        onClick={handleToggle}
        className={`group flex flex-col items-start gap-0.5 p-1.5 px-2 rounded-lg border text-left transition-all cursor-pointer select-none ${
          isOpen
            ? 'bg-sky-500/20 text-sky-200 border-sky-500/50 ring-1 ring-sky-500/30'
            : 'bg-zinc-900/40 hover:bg-zinc-850 text-zinc-200 border-zinc-800 hover:border-sky-500/40'
        }`}
        title={`Click to view all ${events.length} events for Order ${displayOrderId}`}
      >
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-xs text-white group-hover:text-sky-300 transition-colors leading-snug truncate max-w-[130px]">
            {displayedName}
          </span>
          <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-full group-hover:bg-sky-500 group-hover:text-zinc-950 transition-colors shrink-0">
            +{additionalCount}
          </span>
        </div>
        <span className="text-amber-300 font-mono text-[11px] leading-tight">
          {formatEventDisplayTime(displayedTime) || '—'}
        </span>
      </button>

      {isOpen && coords && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label={`Events for Order ${displayOrderId}`}
          className="fixed bg-zinc-900/95 backdrop-blur-md border border-zinc-750 rounded-xl shadow-2xl z-[99999] overflow-hidden text-zinc-200 animate-in fade-in zoom-in-95 duration-100 select-text"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.maxHeight}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-950/80 border-b border-zinc-800">
            <div className="flex items-center gap-1.5 min-w-0">
              <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-[11px] font-mono font-bold text-sky-400 truncate">
                {displayOrderId} • Event Timeline
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* List of events sorted by MOST RECENT FIRST */}
          <div className="p-2 space-y-2 overflow-y-auto max-h-[260px]">
            {events.map((ev, idx) => {
              const formattedDate = formatEventDisplayDate(ev.eventDate);
              const formattedTime = formatEventDisplayTime(ev.eventTime);
              const hasDateTime = formattedDate !== '—' || Boolean(formattedTime);

              return (
                <div
                  key={ev.id || idx}
                  className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-850 hover:border-zinc-750 transition-colors space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30 text-[9px] font-mono font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <p className="text-xs font-bold text-white leading-snug">
                      {ev.eventName}
                    </p>
                  </div>

                  {hasDateTime && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-300 pl-6">
                      <Calendar className="w-3 h-3 text-sky-400/80 shrink-0" />
                      <span>{formattedDate}</span>
                      {formattedTime && (
                        <>
                          <span className="text-zinc-600 font-bold">•</span>
                          <span className="text-amber-300 font-medium">{formattedTime}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 bg-zinc-950/40 border-t border-zinc-850/60 text-[10px] text-zinc-500 font-mono text-center">
            {events.length} Event{events.length > 1 ? 's' : ''} (Latest First)
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
