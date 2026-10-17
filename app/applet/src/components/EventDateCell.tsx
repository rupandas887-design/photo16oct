import React from 'react';
import { Lead } from '../types';
import { getEventCategoryDateTimeTimestamp, cleanText } from './EventCategoryCell';
import { deserializeLeadEvents, formatDateDDMMYY, formatTime12Hour } from '../utils';

export interface EventDateCellProps {
  lead?: Lead | any;
  orders?: any[];
  filterEventDateOption?: string;
}

export const formatDisplayDateStrict = (dateStr?: any): string => {
  if (!dateStr) return '';
  const clean = cleanText(dateStr);
  if (!clean) return '';
  const formatted = formatDateDDMMYY(clean);
  if (formatted) return formatted;
  return cleanText(clean);
};

export interface DateEventItem {
  id: string;
  eventType: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  timestamp: number;
  createdAt: number;
}

export const getSortedEventsForDate = (lead?: Lead | any, orders?: any[]): DateEventItem[] => {
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

  const fallbackDate = cleanText(
    lead.event_date ||
    (lead as any).Event_Date ||
    lead.date ||
    linkedOrder?.event_date ||
    ''
  );

  const fallbackTime = cleanText(
    lead.event_time ||
    (lead as any).event_start_time ||
    linkedOrder?.event_time ||
    ''
  );

  if (rawEventsList.length > 0) {
    const list: DateEventItem[] = rawEventsList.map((ev: any, idx: number) => {
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
        (rawEventsList.length === 1 ? fallbackDate : '')
      );

      const evTime = cleanText(
        ev?.event_start_time ||
        ev?.event_time ||
        ev?.Event_Start_Time ||
        ev?.time ||
        (rawEventsList.length === 1 ? fallbackTime : '')
      );

      const timestamp = getEventCategoryDateTimeTimestamp(evDate, evTime);
      const createdAt = new Date(ev?.created_at || ev?.createdAt || ev?.created_date || lead?.created_date || 0).getTime() || 0;

      return {
        id: ev?.id || ev?.event_id || `evt-${idx}`,
        eventType: evType,
        eventName: evName,
        eventDate: evDate,
        eventTime: evTime,
        timestamp,
        createdAt
      };
    });

    // Sort descending by most recent date + time (timestamp), secondary creation time
    list.sort((a, b) => {
      if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      if (a.timestamp && !b.timestamp) return -1;
      if (!a.timestamp && b.timestamp) return 1;
      if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
        return b.createdAt - a.createdAt;
      }
      return String(b.id || '').localeCompare(String(a.id || ''));
    });

    return list;
  }

  const fallbackCreated = new Date(lead?.created_at || lead?.created_date || 0).getTime() || 0;
  return [{
    id: 'evt-0',
    eventType: cleanText(lead?.event_type || linkedOrder?.event_type || 'Event') || 'Event',
    eventName: cleanText(lead?.event_name || lead?.custom_event_name || lead?.event_type || linkedOrder?.event_type || 'Event') || 'Event',
    eventDate: fallbackDate,
    eventTime: fallbackTime,
    timestamp: getEventCategoryDateTimeTimestamp(fallbackDate, fallbackTime),
    createdAt: fallbackCreated
  }];
};

export const EventDateCell: React.FC<EventDateCellProps> = ({ lead, orders }) => {
  const events = getSortedEventsForDate(lead, orders);

  if (!events || events.length === 0) {
    return <span className="text-zinc-600 italic font-mono text-xs">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5 text-left select-text py-0.5 min-w-0">
      {events.map((ev, idx) => {
        const dateFormatted = formatDisplayDateStrict(ev.eventDate) || '—';
        const rawTime = ev.eventTime;
        const timeFormatted = rawTime ? (formatTime12Hour(rawTime) || cleanText(rawTime)) : '';

        return (
          <div
            key={ev.id || idx}
            className="font-mono text-xs leading-snug whitespace-nowrap min-h-[22px] flex items-center gap-1.5"
            title={timeFormatted ? `${dateFormatted} • ${timeFormatted}` : dateFormatted}
          >
            <span className="text-zinc-300 font-semibold">{dateFormatted}</span>
            {timeFormatted ? (
              <span className="text-amber-400 font-semibold text-[11px] bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded">
                {timeFormatted}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
