import React from 'react';
import { Lead } from '../types';
import { getEventCategoryDateTimeTimestamp, cleanText } from './EventCategoryCell';
import { deserializeLeadEvents, formatTime12Hour, formatDateDDMMYY } from '../utils';

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

export const getSortedEventsForOrder = (lead: Lead, orders?: any[]): DetailedEventItem[] => {
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

  if (rawEventsList.length > 0) {
    const list: DetailedEventItem[] = rawEventsList.map((ev: any, idx: number) => {
      const evType = cleanText(ev?.event_type || ev?.event_category || ev?.eventType || lead?.event_type || 'Event') || 'Event';
      const evName = cleanText(ev?.event_name || ev?.custom_event_name || ev?.eventName || evType) || evType;
      const evDate = cleanText(ev?.event_date || ev?.Event_Date || ev?.date || '');
      const evTime = cleanText(ev?.event_start_time || ev?.event_time || ev?.Event_Start_Time || ev?.time || '');
      const timestamp = getEventCategoryDateTimeTimestamp(evDate, evTime);

      return {
        id: ev?.id || ev?.event_id || `evt-${idx}`,
        eventName: evName,
        eventType: evType,
        eventDate: evDate,
        eventTime: evTime,
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

  const fallbackDate = cleanText(lead.event_date || linkedOrder?.event_date || '');
  const fallbackTime = cleanText(lead.event_time || linkedOrder?.event_time || '');

  return [{
    id: 'evt-0',
    eventName: cleanText(lead.event_name || lead.custom_event_name || lead.event_type || linkedOrder?.event_type || 'Event') || 'Event',
    eventType: cleanText(lead.event_type || linkedOrder?.event_type || 'Event') || 'Event',
    eventDate: fallbackDate,
    eventTime: fallbackTime,
    timestamp: getEventCategoryDateTimeTimestamp(fallbackDate, fallbackTime)
  }];
};

export const EventCell: React.FC<EventCellProps> = ({ lead, orders }) => {
  const events = getSortedEventsForOrder(lead, orders);

  if (!events || events.length === 0) {
    return <span className="text-zinc-600 italic font-mono text-xs">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5 text-left select-text py-0.5 min-w-0">
      {events.map((ev, idx) => {
        const name = ev.eventName || ev.eventType || 'Event';
        const dateStr = ev.eventDate ? (formatDateDDMMYY(ev.eventDate) || ev.eventDate) : '';
        const timeStr = ev.eventTime ? (formatTime12Hour(ev.eventTime) || ev.eventTime) : '';

        return (
          <div
            key={ev.id || idx}
            className="text-xs leading-snug whitespace-nowrap min-h-[22px] flex items-center gap-1.5"
          >
            <span className="text-zinc-100 font-semibold">{name}</span>
            {dateStr && <span className="text-zinc-400 font-mono text-[11px]">{dateStr}</span>}
            {timeStr && <span className="text-amber-400 font-mono text-[11px]">{timeStr}</span>}
          </div>
        );
      })}
    </div>
  );
};
