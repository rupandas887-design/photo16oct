export type DatePreset = 
  | 'Today'
  | 'Yesterday'
  | 'Last 7 Days'
  | 'Last 30 Days'
  | 'This Month'
  | 'Last Month'
  | 'This Year'
  | 'Custom Range';

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

// Current date in context is 2026-06-17
export const TODAY_REF = '2026-06-17';

export function getPresetDateRange(preset: DatePreset, customStart = '', customEnd = ''): DateRange {
  const refDate = new Date(TODAY_REF);
  
  const formatDate = (d: Date) => {
    return d.toISOString().split('T')[0];
  };

  switch (preset) {
    case 'Today':
      return { start: TODAY_REF, end: TODAY_REF };
    case 'Yesterday': {
      const yesterday = new Date(refDate);
      yesterday.setDate(refDate.getDate() - 1);
      const yStr = formatDate(yesterday);
      return { start: yStr, end: yStr };
    }
    case 'Last 7 Days': {
      const start = new Date(refDate);
      start.setDate(refDate.getDate() - 6);
      return { start: formatDate(start), end: TODAY_REF };
    }
    case 'Last 30 Days': {
      const start = new Date(refDate);
      start.setDate(refDate.getDate() - 29);
      return { start: formatDate(start), end: TODAY_REF };
    }
    case 'This Month': {
      return { start: '2026-06-01', end: '2026-06-30' };
    }
    case 'Last Month': {
      return { start: '2026-05-01', end: '2026-05-31' };
    }
    case 'This Year': {
      return { start: '2026-01-01', end: '2026-12-31' };
    }
    case 'Custom Range': {
      return {
        start: customStart || '2026-01-01',
        end: customEnd || TODAY_REF
      };
    }
    default:
      return { start: '2026-01-01', end: '2026-12-31' };
  }
}

export function isDateInRange(dateStr: string, range: DateRange): boolean {
  if (!dateStr || dateStr === '—' || dateStr.toLowerCase().includes('unassigned')) return false;
  // Handle ISO string format or standard date string
  const cleanDate = dateStr.split('T')[0];
  return cleanDate >= range.start && cleanDate <= range.end;
}
