import React from 'react';
import { Lead } from '../types';
import { getSortedLeadEvents, cleanText, UnifiedLeadEventItem } from './EventCategoryCell';

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

export const getSortedEventsForLocation = (lead?: Lead | any, orders?: any[]): LocationEventItem[] => {
  const events = getSortedLeadEvents(lead, orders);
  return events.map(ev => ({
    id: ev.id,
    eventType: ev.eventType,
    eventName: ev.eventName,
    eventDate: ev.eventDate,
    eventTime: ev.eventTime,
    location: cleanLocationString(ev.location),
    timestamp: ev.timestamp
  }));
};

export const EventLocationCell: React.FC<EventLocationCellProps> = ({ lead, orders, currentLocation }) => {
  const events = getSortedLeadEvents(lead, orders);

  if (!events || events.length === 0) {
    const fallback = cleanLocationString(currentLocation);
    if (fallback) {
      return (
        <div className="flex flex-col items-start gap-1.5 text-left select-text py-0.5 min-w-0">
          <div
            className="font-mono text-xs leading-snug whitespace-nowrap min-h-[22px] flex items-center text-zinc-300 max-w-[160px] truncate"
            title={fallback}
          >
            {fallback}
          </div>
        </div>
      );
    }
    return <span className="text-zinc-600 italic font-mono text-xs">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5 text-left select-text py-0.5 min-w-0">
      {events.map((ev, idx) => {
        let loc = cleanLocationString(ev.location);
        if (!loc && events.length === 1 && currentLocation) {
          loc = cleanLocationString(currentLocation);
        }

        if (!loc) {
          return (
            <div
              key={ev.id || idx}
              className="font-mono text-xs leading-snug whitespace-nowrap min-h-[22px] flex items-center text-zinc-600 italic"
              title="Location not specified"
            >
              —
            </div>
          );
        }

        return (
          <div
            key={ev.id || idx}
            className="font-mono text-xs leading-snug whitespace-nowrap min-h-[22px] flex items-center text-zinc-300 max-w-[160px] truncate"
            title={loc}
          >
            {loc}
          </div>
        );
      })}
    </div>
  );
};
