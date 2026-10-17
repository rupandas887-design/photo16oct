import React from 'react';
import { Lead } from '../types';
import { getSortedEventsForDate, formatDisplayDateStrict } from './EventDateCell';
import { cleanText } from './EventCategoryCell';
import { formatTime12Hour } from '../utils';

export interface EventTimeCellProps {
  lead?: Lead | any;
  orders?: any[];
  filterEventDateOption?: string;
}

export const EventTimeCell: React.FC<EventTimeCellProps> = ({ lead, orders }) => {
  const events = getSortedEventsForDate(lead, orders);

  if (!events || events.length === 0) {
    return <span className="text-zinc-600 italic font-mono text-xs">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5 text-left select-text py-0.5 min-w-0">
      {events.map((ev, idx) => {
        const rawTime = ev.eventTime;
        const timeFormatted = rawTime ? (formatTime12Hour(rawTime) || cleanText(rawTime)) : '—';

        return (
          <div
            key={ev.id || idx}
            className="font-mono text-xs leading-snug whitespace-nowrap min-h-[22px] flex items-center text-zinc-300"
            title={timeFormatted}
          >
            {timeFormatted}
          </div>
        );
      })}
    </div>
  );
};
