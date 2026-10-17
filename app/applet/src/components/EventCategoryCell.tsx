import React from 'react';
import { Lead } from '../types';
import { deserializeLeadEvents } from '../utils';

export interface EventCategoryCellProps {
  lead: Lead;
  orders?: any[];
  filterEventDateOption?: string;
}

export interface CategoryEventItem {
  id: string;
  eventType: string;
  secondaryValue: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  timestamp: number;
  createdAt: number;
}

export const isDateString = (val?: any): boolean => {
  if (!val) return false;
  const s = String(val).trim();
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) return true;
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(s)) return true;
  if (/^\d{1,2}\s+[a-zA-Z]{3,9}\s+\d{2,4}/.test(s)) return true;
  if (/^[a-zA-Z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{2,4})?$/i.test(s)) return true;
  return false;
};

export const cleanText = (str?: any): string => {
  if (str === null || str === undefined) return '';
  const s = String(str).trim();
  if (
    !s ||
    s.toLowerCase() === 'undefined' ||
    s.toLowerCase() === 'null' ||
    s.toLowerCase() === 'n/a' ||
    s.toLowerCase() === 'na' ||
    s.toLowerCase() === '—' ||
    s.toLowerCase() === '-' ||
    s.toLowerCase() === 'none'
  ) {
    return '';
  }
  const cleaned = s.replace(/\bundefined\b/gi, '').replace(/\bnull\b/gi, '').trim();
  if (
    !cleaned ||
    cleaned.toLowerCase() === 'n/a' ||
    cleaned.toLowerCase() === 'na' ||
    cleaned.toLowerCase() === '—' ||
    cleaned.toLowerCase() === '-' ||
    cleaned.toLowerCase() === 'none'
  ) {
    return '';
  }
  return cleaned;
};

export const getEventCategoryDateTimeTimestamp = (dateStr: string, timeStr?: string): number => {
  const cleanDate = cleanText(dateStr);
  if (!cleanDate) return 0;
  const s = cleanDate;
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
  const cleanTimeStr = cleanText(timeStr);
  if (cleanTimeStr) {
    const t = cleanTimeStr.toUpperCase();
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
};

export const formatCategoryDisplayDate = (dateStr?: any): string => {
  if (!dateStr) return '';
  const clean = cleanText(dateStr);
  if (!clean) return '';
  return cleanText(clean);
};

export const extractEventInfo = (ev: any, lead: Lead, idx: number, linkedOrder?: any): CategoryEventItem => {
  let rawType = ev?.event_type || ev?.event_category || ev?.eventType || ev?.custom_event_type;
  if (!rawType || isDateString(rawType)) {
    rawType = ev?.event_name || ev?.custom_event_name || ev?.eventName || ev?.Event_Name;
  }
  if (!rawType || isDateString(rawType)) {
    rawType = lead?.event_type || linkedOrder?.event_type || 'Event';
  }
  if (!rawType || isDateString(rawType)) {
    rawType = lead?.event_name || lead?.custom_event_name || linkedOrder?.custom_event_name || 'Event';
  }
  const cleanType = cleanText(rawType) || 'Event';

  const rawDate = ev?.event_date || ev?.Event_Date || ev?.date || lead?.event_date || linkedOrder?.event_date || '';
  const cleanDate = cleanText(rawDate);

  const rawTime = ev?.event_start_time || ev?.event_time || ev?.Event_Start_Time || ev?.time || lead?.event_time || linkedOrder?.event_time || '';
  const cleanTime = cleanText(rawTime);

  const timestamp = getEventCategoryDateTimeTimestamp(cleanDate, cleanTime);
  const createdAt = new Date(ev?.created_at || ev?.createdAt || ev?.created_date || lead?.created_date || 0).getTime() || 0;

  return {
    id: ev?.id || ev?.event_id || `evt-${idx}`,
    eventType: cleanType,
    secondaryValue: '',
    eventName: cleanType,
    eventDate: cleanDate,
    eventTime: cleanTime,
    timestamp,
    createdAt
  };
};

export const getSortedEventsForCategory = (lead: Lead, orders?: any[]): CategoryEventItem[] => {
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
  }

  if (rawEventsList.length === 0 && lead?.notes_special_customizations) {
    rawEventsList = deserializeLeadEvents(lead.notes_special_customizations).events;
  }
  if (rawEventsList.length === 0 && (linkedOrder as any)?.notes_special_customizations) {
    rawEventsList = deserializeLeadEvents((linkedOrder as any).notes_special_customizations).events;
  }

  if (rawEventsList.length > 0) {
    const list: CategoryEventItem[] = rawEventsList.map((ev: any, idx: number) => 
      extractEventInfo(ev, lead, idx, linkedOrder)
    );

    // Sort by MOST RECENT event date + time FIRST (descending timestamp: latest/newest first)
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

  return [extractEventInfo(null, lead, 0, linkedOrder)];
};

export const EventCategoryCell: React.FC<EventCategoryCellProps> = ({ lead, orders }) => {
  const events = getSortedEventsForCategory(lead, orders);

  if (!events || events.length === 0) {
    return <span className="text-zinc-600 italic font-mono text-xs">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5 text-left select-text py-0.5 min-w-0">
      {events.map((ev, idx) => {
        const type = cleanText(ev.eventType) || cleanText(ev.eventName) || 'Event';
        return (
          <div
            key={ev.id || idx}
            className="text-zinc-100 font-semibold text-xs leading-snug whitespace-nowrap min-h-[22px] flex items-center"
            title={type}
          >
            {type}
          </div>
        );
      })}
    </div>
  );
};
