import React from 'react';
import { Lead } from '../types';
import { getEventCategoryDateTimeTimestamp, cleanText } from './EventCategoryCell';
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
        ''
      );

      const evTime = cleanText(
        ev?.event_start_time ||
        ev?.event_time ||
        ev?.Event_Start_Time ||
        ev?.time ||
        ''
      );

      const loc = cleanLocationString(
        ev?.event_location ||
        ev?.venue_address ||
        ev?.venue ||
        ev?.location ||
        ev?.address ||
        (rawEventsList.length === 1 ? fallbackLocation : '')
      );

      const timestamp = getEventCategoryDateTimeTimestamp(evDate, evTime);

      return {
        id: ev?.id || ev?.event_id || `evt-${idx}`,
        eventType: evType,
        eventName: evName,
        eventDate: evDate,
        eventTime: evTime,
        location: loc,
        timestamp
      };
    });

    list.sort((a, b) => {
      if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      if (a.timestamp && !b.timestamp) return -1;
      if (!a.timestamp && b.timestamp) return 1;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });

    return list;
  }

  return [{
    id: 'evt-0',
    eventType: cleanText(lead?.event_type || linkedOrder?.event_type || 'Event') || 'Event',
    eventName: cleanText(lead?.event_name || lead?.custom_event_name || lead?.event_type || linkedOrder?.event_type || 'Event') || 'Event',
    eventDate: '',
    eventTime: '',
    location: fallbackLocation,
    timestamp: 0
  }];
};

export const EventLocationCell: React.FC<EventLocationCellProps> = ({ lead, orders }) => {
  const events = getSortedEventsForLocation(lead, orders);

  if (!events || events.length === 0) {
    return <span className="text-zinc-600 italic font-mono text-xs">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5 text-left select-text py-0.5 min-w-0">
      {events.map((ev, idx) => {
        const loc = cleanLocationString(ev.location) || '—';
        return (
          <div
            key={ev.id || idx}
            className="font-mono text-xs leading-snug whitespace-nowrap text-zinc-300 min-h-[22px] flex items-center truncate max-w-[160px]"
            title={loc}
          >
            {loc}
          </div>
        );
      })}
    </div>
  );
};
