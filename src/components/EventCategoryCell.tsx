import React from 'react';
import { Lead } from '../types';
import { deserializeLeadEvents, formatDateDDMMYY } from '../utils';

export interface EventCategoryCellProps {
  lead?: Lead | any;
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
  location?: string;
  timestamp: number;
  createdAt: number;
}

export type UnifiedLeadEventItem = CategoryEventItem;

export const isDateString = (val?: any): boolean => {
  if (!val) return false;
  const s = String(val).trim();
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) return true;
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(s)) return true;
  if (/^\d{1,2}\s+[a-zA-Z]{3,9}\s+\d{2,4}/.test(s)) return true;
  if (/^[a-zA-Z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{2,4})?$/i.test(s)) return true;
  return false;
};

/**
 * Strips null, undefined, "undefined", "null", "N/A", "—" and cleans string.
 * Guarantees that the literal text "undefined" is NEVER returned.
 */
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

  if (/^\d{1,2}[-/.]\d{1,2}[-/.](\d{2}|\d{4})$/.test(s)) {
    const parts = s.split(/[-/.]/);
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
  } else if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s)) {
    const parts = s.split(/[-/.]/);
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

  const combinedDate = new Date(year, month, day, hours, minutes);
  return isNaN(combinedDate.getTime()) ? 0 : combinedDate.getTime();
};

export const formatCategoryDisplayDate = (dateStr?: any): string => {
  if (dateStr === null || dateStr === undefined) return '';
  const clean = cleanText(dateStr);
  if (!clean) return '';
  const formatted = formatDateDDMMYY(clean);
  if (formatted) return formatted;
  return cleanText(clean);
};

export const getSortedLeadEvents = (lead?: Lead | any, orders?: any[]): UnifiedLeadEventItem[] => {
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
    rawEventsList = deserializeLeadEvents(lead.notes_special_customizations).events || [];
  }
  if (rawEventsList.length === 0 && (linkedOrder as any)?.notes_special_customizations) {
    rawEventsList = deserializeLeadEvents((linkedOrder as any).notes_special_customizations).events || [];
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
  const fallbackType = cleanText(
    lead.event_type ||
    lead.custom_event_type ||
    lead.event_name ||
    linkedOrder?.event_type ||
    ''
  );
  const fallbackLocation = cleanText(
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
    const list: UnifiedLeadEventItem[] = rawEventsList.map((ev: any, idx: number) => {
      let rawType = ev?.event_type || ev?.event_category || ev?.eventType || ev?.custom_event_type || '';
      if (!rawType || isDateString(rawType)) {
        rawType = ev?.event_name || ev?.custom_event_name || ev?.eventName || ev?.Event_Name || '';
      }
      if ((!rawType || isDateString(rawType)) && rawEventsList.length === 1) {
        rawType = fallbackType || 'Event';
      }
      const cleanType = cleanText(rawType) || cleanText(ev?.event_name) || 'Event';

      const rawDate = ev?.event_date || ev?.Event_Date || ev?.event_start_date || ev?.date || '';
      let cleanDate = cleanText(rawDate);
      if (!cleanDate && rawEventsList.length === 1) {
        cleanDate = fallbackDate;
      }

      const rawTime = ev?.event_start_time || ev?.event_time || ev?.Event_Start_Time || ev?.time || '';
      let cleanTime = cleanText(rawTime);
      if (!cleanTime && rawEventsList.length === 1) {
        cleanTime = fallbackTime;
      }

      const rawLocation = ev?.event_location || ev?.venue_address || ev?.venue || ev?.address || ev?.location || ev?.eventLocation || '';
      let cleanLoc = cleanText(rawLocation);
      if (!cleanLoc && rawEventsList.length === 1) {
        cleanLoc = fallbackLocation;
      }

      const timestamp = getEventCategoryDateTimeTimestamp(cleanDate, cleanTime);
      const createdAt = new Date(ev?.created_at || ev?.createdAt || ev?.created_date || lead?.created_date || 0).getTime() || 0;
      const evName = cleanText(ev?.event_name || ev?.custom_event_name || ev?.eventName || ev?.Event_Name || cleanType) || cleanType;

      return {
        id: String(ev?.id || ev?.event_id || `evt-${idx}`),
        eventType: cleanType,
        secondaryValue: '',
        eventName: evName,
        eventDate: cleanDate,
        eventTime: cleanTime,
        location: cleanLoc,
        timestamp,
        createdAt
      };
    });

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

  if (fallbackDate || fallbackTime || fallbackType || fallbackLocation) {
    const timestamp = getEventCategoryDateTimeTimestamp(fallbackDate, fallbackTime);
    const createdAt = new Date(lead?.created_at || lead?.created_date || 0).getTime() || 0;
    const resolvedType = fallbackType || 'Event';
    return [{
      id: String(lead?.event_id || linkedOrder?.event_id || 'evt-0'),
      eventType: resolvedType,
      secondaryValue: '',
      eventName: cleanText(lead?.event_name || resolvedType) || resolvedType,
      eventDate: fallbackDate,
      eventTime: fallbackTime,
      location: fallbackLocation,
      timestamp,
      createdAt
    }];
  }

  return [];
};

export const getSortedEventsForCategory = (lead: Lead, orders?: any[]): CategoryEventItem[] => {
  return getSortedLeadEvents(lead, orders);
};

export const EventCategoryCell: React.FC<EventCategoryCellProps> = ({ lead, orders }) => {
  const events = getSortedLeadEvents(lead, orders);

  if (!events || events.length === 0) {
    return <span className="text-zinc-600 italic font-mono text-xs">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5 text-left select-text py-0.5 min-w-0">
      {events.map((ev, idx) => {
        const cat = cleanText(ev.eventType) || cleanText(ev.eventName) || 'Event';
        return (
          <div
            key={ev.id || idx}
            className="font-semibold text-zinc-100 text-xs leading-snug whitespace-nowrap min-h-[22px] flex items-center"
            title={cat}
          >
            {cat}
          </div>
        );
      })}
    </div>
  );
};
