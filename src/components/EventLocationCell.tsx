import React from 'react';
import { Lead } from '../types';
import { getSortedLeadEvents, cleanText, UnifiedLeadEventItem } from './EventCategoryCell';
import { deserializeLeadEvents, extractEventsList } from '../utils';

export interface EventLocationCellProps {
  lead?: Lead | any;
  orders?: any[];
  filterEventDateOption?: string;
  currentLocation?: string;
  eventId?: string;
  event?: any;
  order?: any;
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

/**
 * Extracts and cleans all location strings strictly belonging to a single event record.
 * Supports strings, arrays, JSON arrays, and multiline strings without breaking addresses containing commas.
 */
export const parseEventLocations = (raw?: any): string[] => {
  if (!raw) return [];
  const results: string[] = [];

  const add = (val: any) => {
    if (!val) return;
    if (typeof val === 'string') {
      const s = val.trim();
      if (!s) return;
      const lower = s.toLowerCase();
      if (
        lower === 'undefined' ||
        lower === 'null' ||
        lower === 'none' ||
        lower === '—' ||
        lower === '-' ||
        lower === 'n/a' ||
        lower === 'na'
      ) {
        return;
      }
      // Check JSON string representation of array or object
      if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
        try {
          const parsed = JSON.parse(s);
          add(parsed);
          return;
        } catch (_) {}
      }
      // Check newline separated locations
      if (s.includes('\n')) {
        s.split('\n').forEach(line => add(line));
        return;
      }
      const cleaned = cleanText(s);
      if (cleaned && !results.includes(cleaned)) {
        results.push(cleaned);
      }
    } else if (Array.isArray(val)) {
      val.forEach(item => add(item));
    } else if (typeof val === 'object') {
      const inner =
        val.event_location ??
        val.venue_address ??
        val.venue ??
        val.location ??
        val.address ??
        val.name ??
        val.eventLocation ??
        val.place;
      if (inner) add(inner);
    }
  };

  add(raw);
  return results;
};

export const cleanLocationString = (raw?: any): string => {
  const locs = parseEventLocations(raw);
  if (locs.length === 0) return '';
  return locs.join(', ');
};

/**
 * Retrieves the specific event record using the unique Event ID.
 * Searches in order/lead events lists, notes_special_customizations, or the provided event object.
 */
export const findEventRecordById = (
  eventId?: string,
  lead?: any,
  order?: any,
  fallbackEvent?: any
): any => {
  if (!eventId && !fallbackEvent) return null;
  const targetId = eventId ? String(eventId).trim() : '';

  // 1. Direct match on fallbackEvent if provided
  if (fallbackEvent) {
    const fId = String(fallbackEvent.id || fallbackEvent.event_id || '').trim();
    if (!targetId || !fId || fId === targetId) return fallbackEvent;
  }

  // 2. Search in events list from order and lead
  const allEvents = extractEventsList(order, lead);
  if (targetId && allEvents.length > 0) {
    const found = allEvents.find((item: any, idx: number) => {
      const itemId = String(item.id || item.event_id || `ev_${idx + 1}`).trim();
      return itemId === targetId || String(item.id || '').trim() === targetId || String(item.event_id || '').trim() === targetId;
    });
    if (found) return found;
  }

  // 3. Fallback to fallbackEvent if provided
  if (fallbackEvent) return fallbackEvent;

  // 4. If exactly one event exists in the order/lead, return it
  if (allEvents.length === 1) return allEvents[0];

  return null;
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

export const EventLocationCell: React.FC<EventLocationCellProps> = ({
  lead,
  orders,
  filterEventDateOption,
  currentLocation,
  eventId,
  event,
  order
}) => {
  // Mode 1: Single specific event row (e.g., Sales Calendar Event Details popup row)
  if (eventId !== undefined || event !== undefined) {
    const targetEvent = findEventRecordById(eventId, lead, order, event);
    const allEvents = extractEventsList(order, lead);
    const hasMultipleEvents = 
      allEvents.length > 1 || 
      (Array.isArray(order?.events) && order.events.length > 1) ||
      (Array.isArray(lead?.events) && lead.events.length > 1);

    let locationValues: string[] = [];
    if (targetEvent) {
      const rawLoc =
        targetEvent.event_location ??
        targetEvent.venue_address ??
        targetEvent.venue ??
        targetEvent.location ??
        targetEvent.address ??
        targetEvent.eventLocation ??
        targetEvent.event_venue ??
        targetEvent.venue_name ??
        targetEvent.locations ??
        targetEvent.places;
      locationValues = parseEventLocations(rawLoc);
    }

    // Fallback logic adhering to strict scope and rules 5, 6, 7, 8, 9:
    // If an event has no location saved and multiple events exist, show '—'
    // ONLY fall back to order-level location if the entire order/lead has exactly 0 or 1 event total!
    if (locationValues.length === 0 && !hasMultipleEvents) {
      const orderLoc =
        currentLocation ||
        order?.event_location ||
        order?.address ||
        lead?.event_location ||
        lead?.address ||
        lead?.city;
      locationValues = parseEventLocations(orderLoc);
    }

    if (locationValues.length === 0) {
      return <span className="text-zinc-600 italic font-mono text-xs">—</span>;
    }

    return (
      <div className="flex flex-col items-start gap-1.5 text-left select-text py-0.5 min-w-0">
        {locationValues.map((loc, idx) => (
          <div
            key={idx}
            className="font-mono text-xs leading-snug whitespace-nowrap min-h-[22px] flex items-center text-zinc-300 max-w-[160px] truncate"
            title={loc}
          >
            {loc}
          </div>
        ))}
      </div>
    );
  }

  // Mode 2: Multi-event Leads Directory Table display: list all events vertically
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
