import React from 'react';
import { Lead } from '../types';
import { getSortedLeadEvents, cleanText, UnifiedLeadEventItem } from './EventCategoryCell';
import { formatDateDDMMYY } from '../utils';

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

export type DateEventItem = UnifiedLeadEventItem;

export const getSortedEventsForDate = (lead?: Lead | any, orders?: any[]): UnifiedLeadEventItem[] => {
  return getSortedLeadEvents(lead, orders);
};

export const EventDateCell: React.FC<EventDateCellProps> = ({ lead, orders }) => {
  const events = getSortedLeadEvents(lead, orders);

  if (!events || events.length === 0) {
    return <span className="text-zinc-600 italic font-mono text-xs">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5 text-left select-text py-0.5 min-w-0">
      {events.map((ev, idx) => {
        const primaryDate = formatDisplayDateStrict(ev.eventDate) || '—';
        return (
          <div
            key={ev.id || idx}
            className="font-mono text-xs leading-snug whitespace-nowrap min-h-[22px] flex items-center text-zinc-300"
            title={primaryDate}
          >
            {primaryDate}
          </div>
        );
      })}
    </div>
  );
};
