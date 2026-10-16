import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, ExternalLink, X, Calendar, Clock } from 'lucide-react';
import { Lead } from '../types';
import { getEventCategoryDateTimeTimestamp, formatCategoryDisplayDate, cleanText } from './EventCategoryCell';
import { deserializeLeadEvents } from '../utils';

export interface EventLocationCellProps {
  lead?: Lead | any;
  orders?: any[];
  filterEventDateOption?: string;
  currentLocation?: string;
}

export interface LocationEventItem {
  id: string;
  eventType: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  location: string;
  timestamp: number;
}

export const cleanLocationString = (raw?: any): string => {
  if (!raw) return '';
  if (typeof raw === 'object') {
    const loc = raw.event_location || raw.venue_address || raw.venue || raw.location || raw.address || '';
    return cleanLocationString(loc);
  }
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null' || s.toLowerCase() === 'none' || s === '—' || s === '-') return '';
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      const parsed = JSON.parse(s);
      return cleanLocationString(parsed);
    } catch (_) {}
  }
  return cleanText(s);
};

const isLocationUrl = (locStr?: string): boolean => {
  if (!locStr) return false;
  const s = locStr.trim().toLowerCase();
  return (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('maps.google.') ||
    s.startsWith('goo.gl/') ||
    s.includes('google.com/maps')
  );
};

export const getSortedEventsForLocation = (lead?: Lead | any, orders?: any[]): LocationEventItem[] => {
  if (!lead) return [];

  const linkedOrder = orders?.find((o: any) => 
    o.lead_id === lead.lead_id || 
    o.order_id === lead.lead_id || 
    (lead.order_id && (o.order_id === lead.order_id || o.lead_id === lead.order_id)) ||
    ((lead as any).orders && (o.order_id === (lead as any).orders || o.lead_id === (lead as any).orders))
  );

  let rawEventsList: any[] = [];
  if (lead?.events && Array.isArray(lead.events) && lead.events.length > 0) {
    rawEventsList = lead.events;
  } else if (linkedOrder?.events && Array.isArray(linkedOrder.events) && linkedOrder.events.length > 0) {
    rawEventsList = linkedOrder.events;
  } else if (typeof lead?.events === 'string') {
    try {
      const parsed = JSON.parse(lead.events);
      if (Array.isArray(parsed)) rawEventsList = parsed;
    } catch (e) {}
  } else if (typeof linkedOrder?.events === 'string') {
    try {
      const parsed = JSON.parse(linkedOrder.events);
      if (Array.isArray(parsed)) rawEventsList = parsed;
    } catch (e) {}
  }

  if (rawEventsList.length === 0 && lead?.notes_special_customizations) {
    rawEventsList = deserializeLeadEvents(lead.notes_special_customizations).events;
  }
  if (rawEventsList.length === 0 && (linkedOrder as any)?.notes_special_customizations) {
    rawEventsList = deserializeLeadEvents((linkedOrder as any).notes_special_customizations).events;
  }

  const fallbackLocation = cleanLocationString(
    lead.event_location ||
    (lead as any).venue_address ||
    (lead as any).venue ||
    lead.address ||
    lead.city ||
    linkedOrder?.event_location ||
    (linkedOrder as any)?.venue_address ||
    (linkedOrder as any)?.address ||
    ''
  );

  if (rawEventsList.length > 0) {
    const list: LocationEventItem[] = rawEventsList.map((ev: any, idx: number) => {
      const evType = cleanText(
        ev?.event_type ||
        ev?.event_category ||
        ev?.eventType ||
        ev?.custom_event_type ||
        lead?.event_type ||
        linkedOrder?.event_type ||
        `Event ${idx + 1}`
      ) || `Event ${idx + 1}`;

      const evName = cleanText(
        ev?.event_name ||
        ev?.custom_event_name ||
        ev?.eventName ||
        ev?.Event_Name ||
        evType
      ) || evType;

      const evDate = cleanText(
        ev?.event_date ||
        ev?.Event_Date ||
        ev?.date ||
        lead?.event_date ||
        linkedOrder?.event_date ||
        ''
      );

      const evTime = cleanText(
        ev?.event_start_time ||
        ev?.event_time ||
        ev?.Event_Start_Time ||
        ev?.time ||
        lead?.event_time ||
        linkedOrder?.event_time ||
        ''
      );

      const evLoc = cleanLocationString(
        ev?.event_location ||
        ev?.venue_address ||
        ev?.venue ||
        ev?.address ||
        ev?.location ||
        ev?.eventLocation ||
        (rawEventsList.length === 1 ? fallbackLocation : '')
      );

      const timestamp = getEventCategoryDateTimeTimestamp(evDate, evTime);

      return {
        id: ev?.id || ev?.event_id || `evt-${idx}`,
        eventType: evType,
        eventName: evName,
        eventDate: evDate,
        eventTime: evTime,
        location: evLoc || (fallbackLocation && rawEventsList.length === 1 ? fallbackLocation : (evLoc || fallbackLocation)),
        timestamp
      };
    });

    // Sort descending by most recent event date + time (timestamp)
    list.sort((a, b) => {
      if (a.timestamp && b.timestamp) return b.timestamp - a.timestamp;
      if (a.timestamp) return -1;
      if (b.timestamp) return 1;
      return 0;
    });

    return list;
  }

  // Fallback single event
  return [{
    id: 'evt-0',
    eventType: cleanText(lead.event_type || linkedOrder?.event_type || 'Event') || 'Event',
    eventName: cleanText(lead.event_name || lead.custom_event_name || lead.event_type || linkedOrder?.event_type || 'Event') || 'Event',
    eventDate: cleanText(lead.event_date || linkedOrder?.event_date || ''),
    eventTime: cleanText(lead.event_time || linkedOrder?.event_time || ''),
    location: fallbackLocation,
    timestamp: getEventCategoryDateTimeTimestamp(lead.event_date || linkedOrder?.event_date || '', lead.event_time || linkedOrder?.event_time || '')
  }];
};

export const EventLocationCell: React.FC<EventLocationCellProps> = ({ lead, orders, filterEventDateOption, currentLocation }) => {
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

  const events = getSortedEventsForLocation(lead, orders);

  // Target event: index 0 (latest/most recent event) or index 1 if last_event filter
  const targetIndex = (filterEventDateOption === 'last_event' && events.length >= 2) ? 1 : 0;
  const targetEvent = events[targetIndex] || events[0];

  const primaryLocation = cleanLocationString(currentLocation) || cleanLocationString(targetEvent?.location) || '';
  const additionalCount = events.length > 1 ? events.length - 1 : 0;

  const linkedOrder = orders?.find((o: any) => 
    o.lead_id === lead?.lead_id || 
    o.order_id === lead?.lead_id || 
    (lead?.order_id && (o.order_id === lead.order_id || o.lead_id === lead.order_id)) ||
    ((lead as any)?.orders && (o.order_id === (lead as any).orders || o.lead_id === (lead as any).orders))
  );
  const displayOrderId = cleanText(linkedOrder?.order_id || lead?.order_id || (lead as any)?.orders || lead?.lead_id) || 'N/A';

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const popupWidth = Math.min(320, vw - 24);
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

  // If there's only one event/location, display the location normally without a + indicator
  if (additionalCount === 0) {
    if (!primaryLocation || primaryLocation === '—' || primaryLocation === '-' || primaryLocation.toLowerCase() === 'n/a') {
      return <span className="text-zinc-600 italic font-mono text-xs">—</span>;
    }

    return (
      <span
        className="text-zinc-300 font-mono text-xs truncate max-w-[130px] block"
        title={primaryLocation}
      >
        {primaryLocation}
      </span>
    );
  }

  // Multiple event locations: display compact "[Location] +N" (e.g. Bangalore +1 or Location 1 +2)
  return (
    <div className="flex items-center gap-1.5 select-text min-w-0">
      <span
        className="text-zinc-200 font-mono text-xs leading-snug truncate max-w-[100px] sm:max-w-[115px]"
        title={primaryLocation || '—'}
      >
        {primaryLocation || '—'}
      </span>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono font-bold border rounded-md transition-all shrink-0 cursor-pointer shadow-sm ${
          isOpen
            ? 'bg-amber-500 text-zinc-950 border-amber-400 ring-1 ring-amber-400/50'
            : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500 hover:text-zinc-950 hover:border-amber-400'
        }`}
        title={`Click +${additionalCount} to view all ${events.length} event locations for Order ${displayOrderId}`}
      >
        +{additionalCount}
      </button>

      {isOpen && coords && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label={`Event Locations for Order ${displayOrderId}`}
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
              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] font-mono font-bold text-amber-400 truncate">
                {displayOrderId} • Event Locations
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

          {/* List of all event locations belonging to this order */}
          <div className="p-2 space-y-2 overflow-y-auto max-h-[260px]">
            {events.map((ev, idx) => {
              const evDate = formatCategoryDisplayDate(ev.eventDate);
              const isUrl = isLocationUrl(ev.location);

              return (
                <div
                  key={ev.id || idx}
                  className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-850 hover:border-zinc-750 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-4 h-4 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[9px] font-mono font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <p className="text-xs font-bold text-white truncate">
                        {ev.eventType || ev.eventName || `Event ${idx + 1}`}
                      </p>
                    </div>
                    {evDate && (
                      <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 shrink-0">
                        <Calendar className="w-2.5 h-2.5 text-amber-400/80" />
                        <span>{evDate}</span>
                      </div>
                    )}
                  </div>

                  {/* Location display */}
                  <div className="pl-5.5">
                    {ev.location ? (
                      <div className="space-y-1">
                        <div className="flex items-start gap-1.5 text-xs text-zinc-200 font-mono">
                          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span className="break-words select-text leading-snug">
                            {ev.location}
                          </span>
                        </div>
                        {isUrl && (
                          <a
                            href={ev.location.startsWith('http') ? ev.location : `https://${ev.location}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 font-mono hover:underline pl-5"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Open in Google Maps</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-zinc-500 italic font-mono">
                        Location not specified
                      </span>
                    )}

                    {ev.eventTime && (
                      <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 mt-1 pl-5">
                        <Clock className="w-2.5 h-2.5 text-zinc-500" />
                        <span>{ev.eventTime}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 bg-zinc-950/40 border-t border-zinc-850/60 text-[10px] text-zinc-500 font-mono text-center">
            {events.length} Event Location{events.length > 1 ? 's' : ''} (Latest First)
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
