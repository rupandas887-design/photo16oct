import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UnifiedEventDropdownCell } from '../UnifiedEventDropdownCell';
import { useRole } from '../RoleContext';
import { 
  Loader2, X, Users, Briefcase, Camera, Video, Compass, Clock, Clipboard, FileCheck, CheckCircle, Eye, Search, Calendar, MapPin, ExternalLink, ArrowUpDown, Layers, ChevronDown, AlertCircle
} from 'lucide-react';
import { Order, CurrentStage, Staff, Equipment, TaskAssignmentDetail } from '../../types';
import { AddNoteModal } from '../AddNoteModal';
import { StatusText } from '../ui/StatusText';
import { SafeProofImage } from '../ui/SafeProofImage';
import { ProjectDetailModal } from '../ProjectDetailModal';
import { ViewDetailsModal } from './ViewDetailsModal';
import { EquipmentSelectorDropdown, getCachedOrFetchEquipment } from './EquipmentSelectorDropdown';
import { ListSortFilter, SortOrder, compareRecordsByDate, parseDateTimeToTimestamp, compareAlphanumeric } from '../ui/ListSortFilter';
import { DateFilterInput } from '../ui/DateFilterInput';

import { CameraLensStatsCard, CameraLensTheme } from '../CameraLensStatsCard';
import { 
  convertTimeToDbFormat, 
  checkTimeOverlap, 
  triggerAutoScrollAndFocus, 
  ensureModalScrolledToTop,
  convertTo12Hour, 
  formatDateDDMMYY,
  formatTime12Hour,
  formatISTDate,
  formatISTTime12Hour,
  formatQtyItem, 
  parseQtyAndText, 
  generateWhatsAppAssignmentMessage,
  extractTeamMembersConfig,
  getEventRolesForEvent,
  getEventTeamMemberStaffMapping,
  calculateOrderAssignmentStats,
  isRoleMatch,
  parseEventDateTimeToTimestamp,
  EventTeamMemberConfig,
  deserializeLeadEvents
} from '../../utils';
import { supabaseClient } from '../../supabaseClient';
import { getCalculatedOrderStage, getStageRank } from '../../utils/orderStageCalculator';
import { 
  buildInitialEventAllocations, 
  generateDeterministicAssignmentId, getEventRolePadding,
  generateDeterministicTaskId,
  isSameAssignmentSlot,
  isOperationsAssignmentStarted,
  getEquipmentVerificationData, 
  getEventImagesData, 
  getRawFootageData 
} from '../../services/operationsAssignmentService';

const isPureUrlOrLocationLink = (str: any): boolean => {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim().toLowerCase();
  return (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('www.') ||
    s.startsWith('maps.google.') ||
    s.startsWith('goo.gl/') ||
    s.startsWith('maps.app.goo.gl')
  );
};

const getCleanVenueAddress = (val: any): string => {
  if (!val || typeof val !== 'string') return '';
  let text = val.trim();
  if (!text) return '';

  // If the entire value is just a URL or location link, return empty string (do not display link)
  if (isPureUrlOrLocationLink(text)) return '';

  // If an address has an appended URL/link, strip the URL portion to keep the plain venue address
  text = text
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/www\.[^\s]+/gi, '')
    .replace(/goo\.gl\/maps[^\s]*/gi, '')
    .replace(/maps\.app\.goo\.gl[^\s]*/gi, '')
    .replace(/maps\.google\.[^\s]*/gi, '')
    .trim();

  // Strip dangling punctuation left over from URL removal
  text = text.replace(/^[-–—,\s|]+|[-–—,\s|]+$/g, '').trim();

  return text;
};

const toCalendarDateString = (dateVal?: string | null | Date): string | null => {
  if (!dateVal && (dateVal as any) !== 0) return null;
  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return null;
    const y = dateVal.getFullYear();
    const m = String(dateVal.getMonth() + 1).padStart(2, '0');
    const d = String(dateVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  let str = String(dateVal).trim();
  if (!str || str === '—' || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined') return null;

  // Strip day of week prefix like "Sun, " or "Sunday, "
  str = str.replace(/^(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*[\s,]+/i, '');

  // 1. YYYY-MM-DD or YYYY/MM/DD (e.g. "2026-09-20" or "2026-09-20T...")
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY or MM/DD/YYYY etc.
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const n1 = parseInt(dmyMatch[1], 10);
    const n2 = parseInt(dmyMatch[2], 10);
    const y = dmyMatch[3];
    // If MM is clearly > 12, then it must be MM/DD
    if (n2 > 12 && n1 <= 12) {
      return `${y}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`;
    }
    // Assume DD/MM (default)
    return `${y}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
  }

  // 3. DD/MM/YY or DD-MM-YY
  const dmyShortMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (dmyShortMatch) {
    let y = parseInt(dmyShortMatch[3], 10);
    y = y < 100 ? 2000 + y : y;
    return `${y}-${dmyShortMatch[2].padStart(2, '0')}-${dmyShortMatch[1].padStart(2, '0')}`;
  }

  // 4. DD MMM YYYY or DD-MMM-YYYY or DD Month YYYY (e.g. "20 Sep 2026")
  const dMmmYMatch = str.match(/^(\d{1,2})[\s\-\/\.]*([a-zA-Z]{3,9})[\s\-\/\.,]*(\d{2,4})/);
  if (dMmmYMatch) {
    const d = dMmmYMatch[1].padStart(2, '0');
    const mStr = dMmmYMatch[2].toLowerCase().slice(0, 3);
    const mIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(mStr);
    if (mIdx !== -1) {
      const m = String(mIdx + 1).padStart(2, '0');
      let y = parseInt(dMmmYMatch[3], 10);
      if (y < 100) y += 2000;
      return `${y}-${m}-${d}`;
    }
  }

  // 5. MMM DD, YYYY or Month DD, YYYY (e.g. "Sep 20, 2026")
  const mmmDYMatch = str.match(/^([a-zA-Z]{3,9})[\s\-\/\.]*(\d{1,2})(?:st|nd|rd|th)?[\s\-\/\.,]*(\d{2,4})/);
  if (mmmDYMatch) {
    const mStr = mmmDYMatch[1].toLowerCase().slice(0, 3);
    const mIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(mStr);
    if (mIdx !== -1) {
      const m = String(mIdx + 1).padStart(2, '0');
      const d = mmmDYMatch[2].padStart(2, '0');
      let y = parseInt(mmmDYMatch[3], 10);
      if (y < 100) y += 2000;
      return `${y}-${m}-${d}`;
    }
  }

  // Fallback
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    const y = fallback.getFullYear();
    const m = String(fallback.getMonth() + 1).padStart(2, '0');
    const d = String(fallback.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
};

export const getEventDateSortKey = (dateVal?: string | null | Date): string => {
  const cal = toCalendarDateString(dateVal);
  if (cal) return cal;
  return '9999-99-99';
};

export const sortEventsByDateAsc = (events: any[]): any[] => {
  if (!Array.isArray(events)) return [];
  return [...events].sort((a, b) => {
    const keyA = getEventDateSortKey(a?.event_date);
    const keyB = getEventDateSortKey(b?.event_date);
    if (keyA !== keyB) {
      return keyA.localeCompare(keyB);
    }
    const nameA = String(a?.event_name || a?.id || '');
    const nameB = String(b?.event_name || b?.id || '');
    return nameA.localeCompare(nameB);
  });
};

export const sortEventsNewestFirst = (events: any[]): any[] => {
  if (!Array.isArray(events)) return [];
  return [...events].sort((a, b) => {
    const rawDateA = a?.event_date || a?.reporting_date || a?.Reporting_date || a?.Event_Date || a?.event_start_date || a?.date || '';
    const rawDateB = b?.event_date || b?.reporting_date || b?.Reporting_date || b?.Event_Date || b?.event_start_date || b?.date || '';
    const keyA = toCalendarDateString(rawDateA);
    const keyB = toCalendarDateString(rawDateB);

    if (keyA && keyB && keyA !== keyB) {
      return keyB.localeCompare(keyA); // Most recent / newest date first
    }
    if (keyA && !keyB) return -1;
    if (!keyA && keyB) return 1;

    // Secondary sort: creation timestamp, newest first
    const timeA = new Date(a?.created_at || a?.createdAt || a?.created_date || 0).getTime();
    const timeB = new Date(b?.created_at || b?.createdAt || b?.created_date || 0).getTime();
    if (timeA && timeB && timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) {
      return timeB - timeA;
    }

    const idA = String(a?.id || a?.event_id || '');
    const idB = String(b?.id || b?.event_id || '');
    return idB.localeCompare(idA);
  });
};

/**
 * Formats a date value into clean "12 Sep 2026" (or "5 Sep 2026") format.
 * Guarantees that null, undefined, "undefined", "null", "N/A", "—", or invalid dates
 * NEVER produce "undefined", "null", or invalid text.
 */
export const formatOperationsEventDate = (dateVal?: string | null | Date): string => {
  if (dateVal === null || dateVal === undefined) return '';
  const s = String(dateVal).trim();
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
  const formatted = formatDateDDMMYY(dateVal);
  if (formatted) return formatted;
  const cal = toCalendarDateString(dateVal);
  if (!cal) return '';
  const parts = cal.split('-');
  if (parts.length < 3) return '';
  const y = parts[0];
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthStr = months[m - 1] || 'Jan';
  const dayStr = String(d).padStart(2, '0');
  return `${dayStr} ${monthStr} ${y}`;
};

export const parseEquipmentKit = (kitString?: string): string[] => {
  if (!kitString || !kitString.trim()) return [];
  try {
    const parsed = JSON.parse(kitString);
    if (Array.isArray(parsed)) {
      const flat: string[] = [];
      parsed.forEach((k: any) => {
        if (Array.isArray(k.equipment)) {
          k.equipment.forEach((e: string) => { if (e) flat.push(e.trim()); });
        }
      });
      return Array.from(new Set(flat));
    }
  } catch (e) {
    // Fallback to CSV
  }
  return kitString.split(',').map(s => s.trim()).filter(Boolean);
};

export interface FormattedOrderEventDate {
  dateStr: string;
  calDate: string;
  formatted: string;
  timestamp: number;
}

export const getUniqueSortedOrderReportingDates = (orderEvents: any[], ord?: any, lead?: any): FormattedOrderEventDate[] => {
  const events = Array.isArray(orderEvents) && orderEvents.length > 0 ? orderEvents : [{}];
  const seenCalDates = new Set<string>();
  const validDates: FormattedOrderEventDate[] = [];

  for (const ev of events) {
    const raw = ev?.reporting_date || ev?.Reporting_date || ord?.Reporting_date || ord?.reporting_date || ev?.event_date || ord?.event_date || lead?.Reporting_date || lead?.event_date || '';
    const cal = toCalendarDateString(raw);
    if (!cal) continue;
    if (seenCalDates.has(cal)) continue;
    seenCalDates.add(cal);

    const formatted = formatOperationsEventDate(raw);
    if (!formatted) continue;

    const parts = cal.split('-').map(Number);
    const timestamp = new Date(parts[0], parts[1] - 1, parts[2]).getTime();

    validDates.push({
      dateStr: String(raw),
      calDate: cal,
      formatted,
      timestamp
    });
  }

  if (validDates.length === 0) return [];
  if (validDates.length === 1) return validDates;

  const todayCal = toCalendarDateString(new Date()) || '1970-01-01';
  const upcoming = validDates.filter(d => d.calDate >= todayCal);
  const past = validDates.filter(d => d.calDate < todayCal);

  upcoming.sort((a, b) => a.calDate.localeCompare(b.calDate));
  past.sort((a, b) => b.calDate.localeCompare(a.calDate));

  return [...upcoming, ...past];
};

/**
 * Extracts unique, valid event dates from an order's events,
 * eliminates duplicate dates, formats each as "12 Sep 2026",
 * and sorts them chronologically with the most relevant/current upcoming date first.
 */
export const getUniqueSortedOrderEventDates = (orderEvents: any[]): FormattedOrderEventDate[] => {
  if (!Array.isArray(orderEvents) || orderEvents.length === 0) return [];

  const seenCalDates = new Set<string>();
  const validDates: FormattedOrderEventDate[] = [];

  for (const ev of orderEvents) {
    const raw = ev?.event_date || ev?.eventDate || ev?.Event_Date || ev?.date || '';
    const cal = toCalendarDateString(raw);
    if (!cal) continue;
    if (seenCalDates.has(cal)) continue;
    seenCalDates.add(cal);

    const formatted = formatOperationsEventDate(raw);
    if (!formatted) continue;

    const parts = cal.split('-').map(Number);
    const timestamp = new Date(parts[0], parts[1] - 1, parts[2]).getTime();

    validDates.push({
      dateStr: String(raw),
      calDate: cal,
      formatted,
      timestamp
    });
  }

  if (validDates.length === 0) return [];
  if (validDates.length === 1) return validDates;

  const todayCal = toCalendarDateString(new Date()) || '1970-01-01';

  // Partition into upcoming (>= today) and past (< today)
  const upcoming = validDates.filter(d => d.calDate >= todayCal);
  const past = validDates.filter(d => d.calDate < todayCal);

  // Sort upcoming chronologically ascending (earliest upcoming first: e.g. 12 Sep 2026, then 18 Sep 2026)
  upcoming.sort((a, b) => a.calDate.localeCompare(b.calDate));

  // Sort past chronologically descending (most recent past first)
  past.sort((a, b) => b.calDate.localeCompare(a.calDate));

  // If there are upcoming dates, upcoming comes first (earliest upcoming first), followed by past
  // If no upcoming dates, most recent past comes first
  return [...upcoming, ...past];
};

const isEventWithinDateRange = (
  dateStr: string | null | undefined,
  filterType: string,
  customStart?: string,
  customEnd?: string
): boolean => {
  if (filterType === 'All') return true;
  if (!dateStr) return false;

  const calDate = toCalendarDateString(dateStr);
  if (!calDate) return false;

  const now = new Date();
  const todayCalStr = toCalendarDateString(now);

  if (filterType === 'Today') {
    return calDate === todayCalStr;
  }

  if (filterType === 'Tomorrow') {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowCalStr = toCalendarDateString(tomorrow);
    return calDate === tomorrowCalStr;
  }

  if (filterType === 'This Week') {
    const dayOfWeek = now.getDay(); // 0 is Sunday
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 6);
    const startOfWeekStr = toCalendarDateString(startOfWeek);
    const endOfWeekStr = toCalendarDateString(endOfWeek);
    if (!startOfWeekStr || !endOfWeekStr) return false;
    return calDate >= startOfWeekStr && calDate <= endOfWeekStr;
  }

  if (filterType === 'This Month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startOfMonthStr = toCalendarDateString(startOfMonth);
    const endOfMonthStr = toCalendarDateString(endOfMonth);
    if (!startOfMonthStr || !endOfMonthStr) return false;
    return calDate >= startOfMonthStr && calDate <= endOfMonthStr;
  }

  if (filterType === 'Custom') {
    const startStr = customStart ? toCalendarDateString(customStart) : null;
    const endStr = customEnd ? toCalendarDateString(customEnd) : null;
    if (startStr && endStr) {
      const minDate = startStr <= endStr ? startStr : endStr;
      const maxDate = startStr <= endStr ? endStr : startStr;
      return calDate >= minDate && calDate <= maxDate;
    }
    if (startStr) {
      return calDate >= startStr;
    }
    if (endStr) {
      return calDate <= endStr;
    }
    return true;
  }

  return true;
};

const findLeadForOrder = (ord: Order, leadsList: Lead[]) => {
  return (leadsList || []).find(l => 
    (ord.lead_id && (l.lead_id === ord.lead_id || (l as any).id === ord.lead_id)) || 
    (l.order_id && l.order_id === ord.order_id) || 
    (ord.quotation_id && l.quotation_id && l.quotation_id === ord.quotation_id) || 
    (ord.customer_name && ord.mobile && l.customer_name === ord.customer_name && l.mobile === ord.mobile)
  );
};

export const isLocationUrl = (val: any): boolean => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  return /^(https?:\/\/|www\.)/i.test(trimmed) || /^(maps\.google\.|goo\.gl\/maps)/i.test(trimmed);
};

export const getLocationUrlHref = (val: string): string => {
  const trimmed = val.trim();
  if (/^www\./i.test(trimmed) || /^maps\.google\./i.test(trimmed) || /^goo\.gl\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
};

const getOrderEventsList = (ord: Order, lead?: Lead) => {
  let rawList: any[] = [];
  if (lead?.events) {
    let evs = lead.events;
    if (typeof evs === 'string') {
      try { evs = JSON.parse(evs); } catch (e) {}
    }
    if (Array.isArray(evs) && evs.length > 0) {
      rawList = evs;
    }
  }
  if (rawList.length === 0 && (ord as any)?.events) {
    let evs = (ord as any).events;
    if (typeof evs === 'string') {
      try { evs = JSON.parse(evs); } catch (e) {}
    }
    if (Array.isArray(evs) && evs.length > 0) {
      rawList = evs;
    }
  }
  if (rawList.length === 0 && lead?.notes_special_customizations) {
    rawList = deserializeLeadEvents(lead.notes_special_customizations).events;
  }
  if (rawList.length === 0 && ord?.notes_special_customizations) {
    rawList = deserializeLeadEvents(ord.notes_special_customizations).events;
  }

  if (rawList.length > 0) {
    return rawList.map((ev: any, idx: number) => {
      // Get exact saved Sales venue address for this specific event AS-IS without altering or stripping
      const getExactRaw = (val: any) => {
        if (val === undefined || val === null) return '';
        const s = String(val);
        return s.trim() ? s : '';
      };

      const specificVenue = 
        getExactRaw(ev.event_location) ||
        getExactRaw(ev.venue_address) ||
        getExactRaw(ev.venue) ||
        getExactRaw(ev.address) ||
        getExactRaw(ev.location) ||
        (rawList.length === 1
          ? (getExactRaw(ord.event_location) || getExactRaw(lead?.event_location) || getExactRaw(lead?.address))
          : '');

      return {
        ...ev,
        id: ev.id || ev.event_id || (ord.order_id ? `${ord.order_id}_ev_${idx + 1}` : `EV-${idx + 1}`),
        event_name: ev.event_name || ev.event_type || ev.Event_Name || `Event ${idx + 1}`,
        event_date: ev.event_date || ev.eventDate || ev.event_start_date || ev.Event_Date || ev.date || ev.booking_date || (rawList.length === 1 ? (ord.event_date || lead?.event_date || '') : ''),
        event_location: specificVenue,
      };
    });
  }

  const getExactRaw = (val: any) => {
    if (val === undefined || val === null) return '';
    const s = String(val);
    return s.trim() ? s : '';
  };

  const singleVenue =
    getExactRaw(ord.event_location) ||
    getExactRaw(lead?.event_location) ||
    getExactRaw(lead?.address) ||
    '';

  return [{
    id: ord.order_id || 'ev_1',
    event_name: ord.custom_event_name || ord.event_name || ord.event_type || lead?.custom_event_name || lead?.event_name || lead?.event_type || 'Event',
    event_date: ord.event_date || lead?.event_date || '',
    event_location: singleVenue,
  }];
};

const OperationsActionColumn = ({ ord, actionItems, isOpen, setActiveMenuOrderId, setMenuCoords, setActiveMenuItems }: any) => {
  return (
    <div className="flex items-center justify-end actions-menu-container">
      <div className="inline-block text-left">
        <button
          type="button"
          onClick={(e) => {
            if (isOpen) {
              setActiveMenuOrderId(null);
            } else {
              const rect = e.currentTarget.getBoundingClientRect();
              const viewportWidth = window.innerWidth;
              const viewportHeight = window.innerHeight;

              const menuWidth = Math.min(220, viewportWidth - 24);
              const spaceBelow = viewportHeight - rect.bottom;
              const spaceAbove = rect.top;
              const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;

              const left = Math.min(
                Math.max(12, rect.right - menuWidth),
                viewportWidth - menuWidth - 12
              );
              const top = openUpward ? rect.top - 6 : rect.bottom + 6;
              const maxHeight = openUpward
                ? Math.min(280, rect.top - 16)
                : Math.min(280, viewportHeight - rect.bottom - 16);

              setMenuCoords({
                left,
                top,
                width: menuWidth,
                maxHeight,
                openUpward
              });
              setActiveMenuItems(actionItems);
              setActiveMenuOrderId(ord.order_id);
            }
          }}
          className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 focus:ring-2 focus:ring-indigo-500/40 active:scale-95 text-white rounded-xl text-xs font-sans font-black border border-indigo-500/25 shadow-lg shadow-indigo-500/20 cursor-pointer transition-all inline-flex items-center gap-1.5 outline-none action-button-trigger"
        >
          🎯 Actions <span className={`text-[9px] text-indigo-200 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : ''}`}>▼</span>
        </button>
      </div>
    </div>
  );
};

const EquipmentAssignedCell = ({ equipmentList, equipmentStatusText }: { equipmentList: string[], equipmentStatusText: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, openUpward: false });
  
  if (equipmentList.length === 0) {
    return <span className="text-zinc-500 font-semibold text-xs font-mono">No Equipment Assigned</span>;
  }

  if (equipmentList.length === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        {equipmentList[0]}
      </span>
    );
  }

  const handleToggle = (e: React.MouseEvent) => {
    if (!isOpen) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const popupWidth = 256; // 64 * 4
      const left = Math.min(
        Math.max(12, rect.left + rect.width / 2 - popupWidth / 2),
        window.innerWidth - popupWidth - 12
      );
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < 250 && spaceAbove > spaceBelow;
      
      setCoords({
        left,
        top: openUpward ? rect.top - 6 : rect.bottom + 6,
        openUpward
      });
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      <button 
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors font-bold text-xs font-mono whitespace-nowrap"
      >
        <span>{equipmentList.length} Equipment Assigned</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[1000000]" onClick={() => setIsOpen(false)}></div>
          <div 
            className="fixed z-[1000001] w-64 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-xl shadow-black/50 overflow-hidden"
            style={{ 
              left: coords.left, 
              ...(coords.openUpward ? { bottom: window.innerHeight - coords.top } : { top: coords.top }) 
            }}
          >
            <div className="px-3 py-2 bg-zinc-800/50 border-b border-zinc-700/60">
              <h4 className="text-xs font-bold text-zinc-300 text-left">Equipment Assigned — {equipmentList.length}</h4>
            </div>
            <div className="max-h-48 overflow-y-auto p-2 space-y-1">
              {equipmentList.map((gear, idx) => (
                <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded bg-zinc-800/30">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span className="text-xs font-mono text-zinc-300 whitespace-normal text-left leading-tight break-words">{gear}</span>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 bg-zinc-800/80 border-t border-zinc-700/60 text-left flex items-center gap-2">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold shrink-0">Status:</div>
              <div className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span> <span className="whitespace-normal break-words">{equipmentStatusText.replace('✅ ', '')}</span>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
};


export interface EquipmentConflictDetails {
  staffName: string;
  eventName: string;
  eventDate: string;
  startTime: string;
  endTime: string;
}

export interface EquipmentAvailability {
  isBusy: boolean;
  statusText?: string;
  conflicts: EquipmentConflictDetails[];
  schedule: EquipmentConflictDetails[];
}

export const OperationsLeads: React.FC = () => {

  const { 
    currentRole, 
    currentUserName,
    orders, 
    operations, 
    staff, 
    equipment, 
    assignOperations, 
    markEventCompleted, 
    confirmRawFootageReceived,
    updateOrderStage,
    rawFootage,
    staffAssignments,
    saveStaffAssignments,
    updateLead,
    payments,
    equipmentHandovers,
    addEquipmentHandovers,
    isDepartmentAllowedToEdit,
    leads,
    leadPackages,
    leadStaffAssignmentHistory,
    leadEquipmentHistory,
    updateEquipment,
    refreshData,
    addLeadEquipmentHistory,
    getLeadCurrentStatus,
    packages,
    quotations,
    pushUpdate,
    users
  } = useRole();

  useEffect(() => {
    refreshData();
  }, []);

  // Anchor date June 15, 2026
  const systemToday = new Date();
  
  const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const todayStr = getLocalDateStr(systemToday);

  // Helper to parse date and time into a single comparable Date object
  const parseDateTime = (dateStr: string, timeStr: string): Date | null => {
    if (!dateStr) return null;
    
    let hours = 0;
    let minutes = 0;
    const normalizedTime = (timeStr || '00:00').trim();
    
    const ampmMatch = normalizedTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    const hourMinMatch = normalizedTime.match(/(\d+):(\d+)/);
    
    if (ampmMatch) {
      hours = parseInt(ampmMatch[1], 10);
      minutes = parseInt(ampmMatch[2], 10);
      const ampm = ampmMatch[3].toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
    } else if (hourMinMatch) {
      hours = parseInt(hourMinMatch[1], 10);
      minutes = parseInt(hourMinMatch[2], 10);
    }
    
    const parsedDate = new Date(dateStr);
    if (isNaN(parsedDate.getTime())) return null;
    
    parsedDate.setHours(hours, minutes, 0, 0);
    return parsedDate;
  };

  // Search/Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileFiltersExpanded, setIsMobileFiltersExpanded] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>('All');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [showReportingDateFilterDropdown, setShowReportingDateFilterDropdown] = useState(false);

  // Track which order's action dropdown is open
  const [activeMenuOrderId, setActiveMenuOrderId] = useState<string | null>(null);
  const [selectedEquipmentStatus, setSelectedEquipmentStatus] = useState<{ 
    staffName: string; 
    assignedEquipment: string[];
    orderId?: string;
    eventId?: string;
    assignmentId?: string;
    eventName?: string;
    taskDetails?: TaskAssignmentDetail;
    eqReceived?: any; 
    eqHandover?: any;
    taskDetails?: TaskAssignmentDetail; 
  } | null>(null);
  const [selectedEventImages, setSelectedEventImages] = useState<{ 
    staffName: string; 
    orderId?: string;
    eventId?: string;
    assignmentId?: string;
    eventName?: string;
    taskDetails?: TaskAssignmentDetail;
    assetCollection: any; 
    evStart: any; 
    evEnd: any; 
  } | null>(null);
  const [imagePreviewModal, setImagePreviewModal] = useState<{ url: string, date: string, time: string, staffName: string, stage: string } | null>(null);
  const [viewingLocationsModal, setViewingLocationsModal] = useState<{ orderId: string; customerName?: string; events: any[] } | null>(null);
  const [viewingEventCategoriesModal, setViewingEventCategoriesModal] = useState<{ orderId: string; customerName?: string; events: any[] } | null>(null);
  const [viewingDatesModal, setViewingDatesModal] = useState<{ orderId: string; customerName?: string; events: any[] } | null>(null);
  const [expandedDateOrderIds, setExpandedDateOrderIds] = useState<Set<string>>(new Set());

  const toggleExpandDates = (orderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedDateOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (viewingLocationsModal || viewingDatesModal || viewingEventCategoriesModal) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [viewingLocationsModal, viewingDatesModal, viewingEventCategoriesModal]);
  const [activeMenuItems, setActiveMenuItems] = useState<{ label: string; onClick: () => void }[]>([]);
  const [menuCoords, setMenuCoords] = useState<{ left: number, top: number, width: number, maxHeight: number, openUpward: boolean }>({ left: 0, top: 0, width: 220, maxHeight: 280, openUpward: false });

  useEffect(() => {
    const handleStaffUpdate = () => {
      refreshData();
    };
    window.addEventListener('staff_status_updated', handleStaffUpdate);
    return () => window.removeEventListener('staff_status_updated', handleStaffUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeMenuOrderId) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.actions-menu-container') && !target.closest('.action-button-trigger')) {
        setActiveMenuOrderId(null);
      }
    };
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.closest && target.closest('.actions-menu-container')) {
        return;
      }
      setActiveMenuOrderId(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('wheel', handleScroll, { passive: true, capture: true });
    window.addEventListener('touchmove', handleScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('wheel', handleScroll, { capture: true });
      window.removeEventListener('touchmove', handleScroll, { capture: true });
    };
  }, [activeMenuOrderId]);

  // Multi-Select Searchable Equipment States
  const [selectedKits, setSelectedKits] = useState<string[]>([]);
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState('');
  const [isEquipmentDropdownOpen, setIsEquipmentDropdownOpen] = useState(false);
  const [equipmentSearchQueryByEvent, setEquipmentSearchQueryByEvent] = useState<Record<string, string>>({});
  const [isEquipmentDropdownOpenByEvent, setIsEquipmentDropdownOpenByEvent] = useState<Record<string, boolean>>({});

  // Equipment return handover state
  const [handoverStates, setHandoverStates] = useState<Record<string, {
    return_status: 'Returned' | 'Not Returned' | 'Damaged' | 'Missing';
    returned_by: string;
    return_date: string;
    notes: string;
  }>>({});

  // Sorting state
  const [sortBy, setSortBy] = useState<'event_date' | 'customer_name' | 'status' | 'assignment_date' | 'created_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [sortDateOrder, setSortDateOrder] = useState<SortOrder>('latest');

  // 2-State Column Header Sorting: Order ID, Reporting Date
  const [sortColumn, setSortColumn] = useState<'order_id' | 'reporting_date' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const parseReportingTimeToMinutes = (timeStr?: string): number => {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.trim()) return -1;
    const t = timeStr.trim().toUpperCase();
    const isPM = t.includes('PM');
    const isAM = t.includes('AM');
    const clean = t.replace(/(AM|PM)/g, '').trim();
    const parts = clean.split(':');
    if (parts.length >= 1) {
      let h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1] || '0', 10) || 0;
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return h * 60 + m;
    }
    return -1;
  };

  const getOrderReportingTimeDetails = (ord: Order, op?: any, lead?: any): { timeStr: string; minutes: number } => {
    const events = getOrderEventsList(ord, lead);
    const timeStr = (
      op?.reporting_time || 
      ord.reporting_time || 
      (ord as any).Reporting_time || 
      events[0]?.reporting_time || 
      events[0]?.event_start_time || 
      events[0]?.event_time || 
      ord.event_time || 
      ''
    ).trim();
    const minutes = parseReportingTimeToMinutes(timeStr);
    return { timeStr, minutes };
  };

  const getOrderPrimaryEventTimestamp = (ord: Order, lead?: any): number => {
    const events = getOrderEventsList(ord, lead);
    const sorted = sortEventsByDateAsc(events);
    const ev = sorted[0];
    const dateStr = ev?.event_date || ord.event_date || (lead as any)?.event_date || '';
    const timeStr = ev?.event_start_time || ev?.event_time || ord.event_time || (lead as any)?.event_time || '';
    return parseDateTimeToTimestamp(dateStr, timeStr);
  };

  const getOrderPrimaryReportingTimestamp = (ord: Order, lead?: any, op?: any): number => {
    const events = getOrderEventsList(ord, lead);
    const sorted = sortEventsByDateAsc(events);
    const ev = sorted[0];
    const dateStr = ev?.reporting_date || ev?.Reporting_date || ord?.Reporting_date || ord?.reporting_date || ev?.event_date || ord?.event_date || (lead as any)?.Reporting_date || (lead as any)?.event_date || '';
    const timeStr = ev?.reporting_time || ev?.event_start_time || ev?.event_time || ord.event_time || (lead as any)?.event_time || '';
    return parseDateTimeToTimestamp(dateStr, timeStr);
  };

  const handleColumnSort = (column: 'order_id' | 'reporting_date') => {
    if (sortColumn !== column) {
      // 1st CLICK: Ascending
      setSortColumn(column);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      // 2nd CLICK: Descending
      setSortDirection('desc');
    } else {
      // 3rd CLICK: Reset / Default Order
      setSortColumn(null);
      setSortDirection('asc');
    }
  };

  // Dual Dropdown and Multi-Staff Assign State
  const [activeAssignments, setActiveAssignments] = useState<{ staff_role: string; staff_id: string; staff_name: string }[]>([]);
  const [selectedRole, setSelectedRole] = useState('Lead Photographer');
  const [selectedStaffByEvent, setSelectedStaffByEvent] = useState<Record<string, string>>({});
  const [staffTypeByEvent, setStaffTypeByEvent] = useState<Record<string, 'In-House' | 'Freelancer'>>({});
  const [selectedStaff, setSelectedStaff] = useState('');
  
  const [assignForm, setAssignForm] = useState<any>({
    photographer_assigned: '',
    videographer_assigned: '',
    drone_operator_assigned: '',
    assistant_assigned: '',
    equipment_kit: '',
    reporting_time: '',
    remarks: '',
    event_date: '',
    event_time: ''
  });

  // Modals / Selection states
  const [activeModalOrderId, setActiveModalOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const canEdit = (currentRole === 'Operations Team' || currentRole === 'Business Owner');
  const [projectDossierId, setProjectDossierId] = useState<string | null>(null);
  
  // Inline edit state for assignment
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [fetchedEquipment, setFetchedEquipment] = useState<any[]>([]);

  const loadEquipment = async () => {
    if (fetchedEquipment && fetchedEquipment.length > 0) return;
    const cachedData = await getCachedOrFetchEquipment();
    if (cachedData && cachedData.length > 0) {
      setFetchedEquipment(cachedData);
      return;
    }

    const { data, error } = await supabaseClient
      .from('equipment')
      .select('equipment_id, equipment_name')
      .order('equipment_name', { ascending: true });

    if (error) {
      console.warn('[OperationsLeads] Load equipment error:', error.message || error);
      setFetchedEquipment([]);
      return;
    }

    setFetchedEquipment(data || []);
  };
  const [isSaving, setIsSaving] = useState(false);
  const whatsappModalRef = useRef<HTMLDivElement>(null);
  const whatsappScrollRef = useRef<HTMLDivElement>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteModalLeadId, setNoteModalLeadId] = useState("");
  const [noteModalOrderId, setNoteModalOrderId] = useState("");
  const [noteModalCustomerName, setNoteModalCustomerName] = useState("");
  const [eventAllocations, setEventAllocations] = useState<Record<string, {
    reporting_date: string;
    reporting_time: string;
    event_start_time: string;
    event_end_time: string;
    staff: { staff_role: string, staff_id: string, staff_name: string }[];
  }>>({});
  const [collapsedAssignEvents, setCollapsedAssignEvents] = useState<Record<string, boolean>>({});
  const [collapsedCustomerDetails, setCollapsedCustomerDetails] = useState<boolean>(false);
  const [assignValidationError, setAssignValidationError] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [busyRosterStaff, setBusyRosterStaff] = useState<string | null>(null);

  // Find order and lead for assigning modal
  const activeOrderInstance = useMemo(() => {
    return assigningOrderId ? orders.find((o) => o.order_id === assigningOrderId) : null;
  }, [assigningOrderId, orders]);

  const parentLeadInstance = useMemo(() => {
    return activeOrderInstance ? (leads || []).find((l) => l.lead_id === activeOrderInstance.lead_id) : null;
  }, [activeOrderInstance, leads]);

  const dossierSalesStaff = useMemo(() => {
    if (!activeOrderInstance && !parentLeadInstance) return { name: 'N/A', mobile: 'N/A' };

    const targetQuote = (quotations || []).find((q: any) => 
      (parentLeadInstance?.lead_id && q.lead_id === parentLeadInstance.lead_id) || 
      (activeOrderInstance?.lead_id && q.lead_id === activeOrderInstance.lead_id) ||
      (activeOrderInstance?.order_id && (q.order_id === activeOrderInstance.order_id || q.lead_id === activeOrderInstance.order_id))
    );

    const rawName = 
      parentLeadInstance?.sales_staff_name ||
      activeOrderInstance?.sales_staff_name ||
      (parentLeadInstance as any)?.Sales_Staff_Name ||
      (activeOrderInstance as any)?.Sales_Staff_Name ||
      targetQuote?.sales_staff_name ||
      parentLeadInstance?.sales_person ||
      activeOrderInstance?.sales_person ||
      (parentLeadInstance as any)?.Sales_Person_Name;

    const rawMobile = 
      parentLeadInstance?.sales_staff_mobile ||
      activeOrderInstance?.sales_staff_mobile ||
      (parentLeadInstance as any)?.Sales_Staff_Mobile ||
      (activeOrderInstance as any)?.Sales_Staff_Mobile ||
      targetQuote?.sales_staff_mobile;

    const staffId = 
      parentLeadInstance?.sales_staff_id ||
      activeOrderInstance?.sales_staff_id ||
      (parentLeadInstance as any)?.Sales_Staff_Id ||
      targetQuote?.sales_staff_id;

    let finalName = (rawName && String(rawName).trim() && String(rawName).trim() !== 'N/A' && String(rawName).trim() !== '-')
      ? String(rawName).trim()
      : '';

    let finalMobile = (rawMobile && String(rawMobile).trim() && String(rawMobile).trim() !== 'N/A' && String(rawMobile).trim() !== '-')
      ? String(rawMobile).trim()
      : '';

    // If mobile is missing or 'N/A', look up the specific sales staff record by ID or Name
    if ((!finalMobile || finalMobile === 'N/A' || finalMobile === '-') && (staffId || finalName)) {
      // 1. Check users list
      const matchedUser = (users || []).find((u: any) => 
        (staffId && (u.id === staffId || String(u.id) === String(staffId))) ||
        (finalName && (
          u.name?.trim().toLowerCase() === finalName.toLowerCase() ||
          u.full_name?.trim().toLowerCase() === finalName.toLowerCase()
        ))
      );
      if (matchedUser?.mobile && String(matchedUser.mobile).trim()) {
        finalMobile = String(matchedUser.mobile).trim();
        if (!finalName && matchedUser.name) {
          finalName = matchedUser.name;
        }
      }

      // 2. Check staff directory
      if (!finalMobile || finalMobile === 'N/A' || finalMobile === '-') {
        const matchedStaff = (staff || []).find((s: any) => 
          (staffId && (s.staff_id === staffId || String(s.staff_id) === String(staffId))) ||
          (finalName && s.name?.trim().toLowerCase() === finalName.toLowerCase())
        );
        if (matchedStaff?.mobile && String(matchedStaff.mobile).trim()) {
          finalMobile = String(matchedStaff.mobile).trim();
          if (!finalName && matchedStaff.name) {
            finalName = matchedStaff.name;
          }
        }
      }
    }

    return {
      name: finalName || 'N/A',
      mobile: finalMobile || 'N/A'
    };
  }, [activeOrderInstance, parentLeadInstance, quotations, users, staff]);

  const googleMapsLocationLink = useMemo(() => {
    if (parentLeadInstance?.google_maps_link) {
      return parentLeadInstance.google_maps_link;
    }
    if (parentLeadInstance?.events && parentLeadInstance.events.length > 0) {
      const eventWithLink = parentLeadInstance.events.find((ev: any) => ev.google_maps_link);
      if (eventWithLink) {
        return eventWithLink.google_maps_link;
      }
    }
    return null;
  }, [parentLeadInstance]);

  const selectedLeadPkgs = useMemo(() => {
    return activeOrderInstance && leadPackages 
      ? leadPackages.filter((lp) => lp.lead_id === (activeOrderInstance.lead_id || activeOrderInstance.order_id)) 
      : [];
  }, [activeOrderInstance, leadPackages]);

  const packageDetailsString = useMemo(() => {
    return selectedLeadPkgs.length > 0 
      ? selectedLeadPkgs.map((lp) => `${lp.package_name || 'Generic Package'} (Qty: ${lp.quantity || 1}, Cost: ₹${(lp.final_amount ?? lp.total_amount ?? 0).toLocaleString('en-IN')})`).join('\n')
      : 'No packages listed';
  }, [selectedLeadPkgs]);

  const teamMembersIncluded = useMemo(() => {
    if (!parentLeadInstance && !activeOrderInstance) return 'No team members specified.';
    const targetLeadPkgs = selectedLeadPkgs;
    const configs = extractTeamMembersConfig(parentLeadInstance, targetLeadPkgs);
    const events = parentLeadInstance?.events && Array.isArray(parentLeadInstance.events) && parentLeadInstance.events.length > 0
      ? parentLeadInstance.events
      : [{ id: 'default', event_name: activeOrderInstance?.event_name || 'Main Event' }];

    const lines: string[] = [];
    events.forEach((ev: any, idx: number) => {
      const roles = getEventRolesForEvent(ev, idx, configs, events.length);
      const evLabel = ev.event_name || ev.event_type || `Event ${idx + 1}`;
      if (roles && roles.length > 0) {
        const formatted = roles.map((r: any) => formatQtyItem(r));
        if (events.length > 1) {
          lines.push(`${evLabel}: ${formatted.join(', ')}`);
        } else {
          lines.push(...formatted);
        }
      }
    });

    if (lines.length > 0) {
      return lines.join('\n');
    }

    return 'No team members finalized in quotation.';
  }, [parentLeadInstance, activeOrderInstance, selectedLeadPkgs]);

  // State for completing shoot
  const [closingOrderId, setClosingOrderId] = useState<string | null>(null);
  const [serverPath, setServerPath] = useState('');

  // Event Scheduling Modal State (Step 2)
  const [schedulingOrderId, setSchedulingOrderId] = useState<string | null>(null);
  const [scheduleEventForm, setScheduleEventForm] = useState({
    event_date: '',
    event_time: '',
    reporting_time: '',
    remarks: ''
  });

  // Raw Footage Modal State
  const [receivingFootageOrderId, setReceivingFootageOrderId] = useState<string | null>(null);
  const [consolidatedDriveLink, setConsolidatedDriveLink] = useState('');
  const [verifiedCrewMap, setVerifiedCrewMap] = useState<Record<string, boolean>>({});
  const [footageForm, setFootageForm] = useState({
    footage_link: '',
    storage_type: 'Google Drive',
    upload_notes: ''
  });
  const [hardDiskReceived, setHardDiskReceived] = useState(false);
  const [memoryCardReceived, setMemoryCardReceived] = useState(false);
  const [footageHandoverStates, setFootageHandoverStates] = useState<Record<string, {
    return_status: 'Returned' | 'Not Returned' | 'Damaged' | 'Missing';
    returned_by: string;
    return_date: string;
    notes: string;
  }>>({});

  const [paymentCollectionStatus, setPaymentCollectionStatus] = useState<'Full Payment Received' | 'Partial Payment Received' | 'Payment Pending'>('Payment Pending');
  const [additionalReceived, setAdditionalReceived] = useState<number>(0);
  const [transactionId, setTransactionId] = useState('');

  const [isFetchingModalData, setIsFetchingModalData] = useState(false);

  const openEquipmentVerification = async (member: any, ord: any, memberEvId: string, assetCollection: any, eqHandover: any) => {
    setIsFetchingModalData(true);
    try {
      let taskDetails = undefined;
      if (member.assignment_id) {
        const { data, error } = await supabaseClient
          .from('v_task_assignment_details')
          .select('*')
          .eq('assignment_id', member.assignment_id)
          .single();
        if (!error && data) {
          taskDetails = data;
        }
      }
      if (!taskDetails && member.assignment_id && staffAssignments) {
        taskDetails = staffAssignments.find(sa => sa.assignment_id === member.assignment_id);
      }
      setSelectedEquipmentStatus({ 
        staffName: member.staff_name, 
        assignedEquipment: member.effectiveAssignedEq || (member.assigned_equipment || []),
        orderId: ord.order_id,
        eventId: memberEvId,
        assignmentId: member.assignment_id,
        eventName: member.event_name,
        eqReceived: assetCollection, 
        eqHandover,
        taskDetails
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingModalData(false);
    }
  };

  const openEventImages = async (member: any, ord: any, memberEvId: string, assetCollection: any, evStart: any, evEnd: any, eqHandover: any) => {
    setIsFetchingModalData(true);
    try {
      let taskDetails = undefined;
      if (member.assignment_id) {
        const { data, error } = await supabaseClient
          .from('v_task_assignment_details')
          .select('*')
          .eq('assignment_id', member.assignment_id)
          .single();
        if (!error && data) {
          taskDetails = data;
        }
      }
      setSelectedEventImages({ 
        staffName: member.staff_name, 
        orderId: ord.order_id,
        eventId: memberEvId,
        assignmentId: member.assignment_id,
        eventName: member.event_name,
        assetCollection, 
        evStart, 
        evEnd, 
        eqHandover,
        taskDetails
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingModalData(false);
    }
  };


  useEffect(() => {
    if (receivingFootageOrderId) {
      const existingPayment = payments.find((p) => p.order_id === receivingFootageOrderId);
      setTransactionId(existingPayment?.transaction_id || '');
    } else {
      setTransactionId('');
    }
  }, [receivingFootageOrderId, payments]);

  // Staff Assignment Success Popup State
  const [successModalData, setSuccessModalData] = useState<{
    orderId: string;
    customerName: string;
    order: Order;
    assignments: { staff_role: string; staff_name: string }[];
  } | null>(null);

  // Multi-Staff WhatsApp Share Modal State
  const [whatsappShareModalData, setWhatsappShareModalData] = useState<{
    orderId: string;
    order: Order;
    staffNames: string[];
    eventAllocations?: any;
    lead?: any;
    finalAssignments?: any[];
  } | null>(null);

  const [viewingStaffOrderId, setViewingStaffOrderId] = useState<string | null>(null);
  const [viewingStaffEventId, setViewingStaffEventId] = useState<string | null>(null);
  const [openEquipmentDropdownKey, setOpenEquipmentDropdownKey] = useState<string | null>(null);

  // Fast O(1) indexed lookup maps for maximum performance and instant modal/popup response
  const orderMap = useMemo(() => new Map((orders || []).map(o => [o.order_id, o])), [orders]);
  const leadMap = useMemo(() => new Map((leads || []).map(l => [l.lead_id, l])), [leads]);
  const opMap = useMemo(() => new Map((operations || []).map(o => [o.order_id, o])), [operations]);

  useEffect(() => {
    if (assigningOrderId) {
      setCollapsedCustomerDetails(false);
      setCollapsedAssignEvents({});
    }
  }, [assigningOrderId]);

  useEffect(() => {
    if (assigningOrderId || viewingStaffOrderId) {
      const prevBodyOverflow = document.body.style.overflow;
      const prevHtmlOverflow = document.documentElement.style.overflow;
      const prevTouchAction = document.body.style.touchAction;

      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';

      const handleTouchMove = (e: TouchEvent) => {
        const target = e.target as HTMLElement | null;
        if (target && target.closest('.overflow-y-auto, .overflow-x-auto')) {
          return;
        }
        if (e.cancelable) {
          e.preventDefault();
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (assigningOrderId) setAssigningOrderId(null);
          if (viewingStaffOrderId) {
            setViewingStaffOrderId(null);
            setViewingStaffEventId(null);
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });

      return () => {
        document.body.style.overflow = prevBodyOverflow;
        document.documentElement.style.overflow = prevHtmlOverflow;
        document.body.style.touchAction = prevTouchAction;
        window.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('touchmove', handleTouchMove);
      };
    }
  }, [assigningOrderId, viewingStaffOrderId]);

  const handleVerifyFootage = async (ord: Order, staffName: string, eventId: string | undefined, status: 'Verified' | 'Not Verified') => {
    try {
      if (!currentUserName || !ord) return;
      
      const res = await addLeadEquipmentHistory({
        lead_id: ord.lead_id || ord.order_id,
        order_id: ord.order_id,
        equipment_name: 'Raw Footage Verification',
        equipment_status: status,
        returned_by: staffName,
        returned_at: new Date().toISOString(),
        remarks: JSON.stringify({
          event_id: eventId,
          verified_by: currentUserName,
          verified_at: new Date().toISOString()
        })
      });

      refreshData();
    } catch (e) {
      console.error("Failed to update verification status:", e);
      alert("Failed to update verification status.");
    }
  };

  const getRecordMeta = (record: any) => {
    if (!record) return { url: null, date: '-', time: '-' };

    let parsed: any = null;
    let url = record.photo_url || null;
    if (record.remarks) {
      try {
        parsed = typeof record.remarks === 'string' ? JSON.parse(record.remarks) : record.remarks;
        if (!url) {
          url = parsed.photo_url || parsed.url || null;
        }
      } catch (e) {}
    }

    let date = '-';
    let time = '-';
    let timestamp = parsed?.uploaded_at || record.returned_at || record.created_at;
    if (!timestamp && url) {
      const match = url.match(/_(\d{12,14})\./);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > 1000000000000 && num < 4000000000000) {
          timestamp = new Date(num).toISOString();
        }
      }
    }

    if (timestamp) {
      const dt = new Date(timestamp);
      if (!isNaN(dt.getTime())) {
        const day = String(dt.getDate()).padStart(2, '0');
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const year = dt.getFullYear();
        date = `${day}-${month}-${year}`;

        time = dt.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata'
        }).toUpperCase();
      }
    }

    return { url, date, time };
  };
  const [editedMessages, setEditedMessages] = useState<Record<string, string>>({});
  const [selectedStaffForShare, setSelectedStaffForShare] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (whatsappShareModalData) {
      const initialMsgs: Record<string, string> = {};
      const initialSelected: Record<string, boolean> = {};
      const currentLeadId = whatsappShareModalData.order?.lead_id || (whatsappShareModalData.lead as any)?.lead_id;
      const latestLead = leads.find(l => l.lead_id === currentLeadId) || whatsappShareModalData.lead;
      const latestOrder = orders.find(o => o.order_id === whatsappShareModalData.orderId) || whatsappShareModalData.order;

      whatsappShareModalData.staffNames.forEach(name => {
        initialMsgs[name] = generateWhatsAppMessageForStaff(
          latestOrder, 
          name, 
          whatsappShareModalData.eventAllocations,
          latestLead,
          whatsappShareModalData.finalAssignments
        );
        initialSelected[name] = true;
      });
      setEditedMessages(initialMsgs);
      setSelectedStaffForShare(initialSelected);

      // Automatically ensure Personalized WhatsApp Share modal is centered and internal scroll reset to top
      setTimeout(() => {
        if (whatsappModalRef.current) {
          ensureModalScrolledToTop(whatsappModalRef.current);
        }
        if (whatsappScrollRef.current) {
          whatsappScrollRef.current.scrollTop = 0;
        }
      }, 30);
    } else {
      setEditedMessages({});
      setSelectedStaffForShare({});
    }
  }, [whatsappShareModalData, leads, orders]);

  // Helper to get assigned staff names for an order
  const getAssignedStaffNamesForOrder = (ord: Order): string[] => {
    // 1. From staffAssignments
    const orderAssigns = staffAssignments ? staffAssignments.filter(sa => (sa.order_id === ord.order_id || sa.order_id === ord.lead_id || (ord.lead_id && sa.lead_id === ord.lead_id)) && sa.assignment_status !== 'Cancelled') : [];
    const fromAssigns = orderAssigns.map(sa => sa.staff_name).filter(n => n && n.toLowerCase() !== 'unassigned' && n.toLowerCase() !== 'none');

    // 2. From lead.events assigned_staff_names
    const targetLead = leads?.find(l => (ord.lead_id && l.lead_id === ord.lead_id) || l.order_id === ord.order_id);
    const fromEvents: string[] = [];
    if (targetLead?.events && Array.isArray(targetLead.events)) {
      targetLead.events.forEach((ev: any) => {
        if (ev.assigned_staff_names && typeof ev.assigned_staff_names === 'string') {
          ev.assigned_staff_names.split(',').forEach((n: string) => {
            const trimmed = n.trim();
            if (trimmed && trimmed.toLowerCase() !== 'unassigned' && trimmed.toLowerCase() !== 'none') {
              fromEvents.push(trimmed);
            }
          });
        }
      });
    }

    // 3. From operations record
    const op = operations?.find(o => o.order_id === ord.order_id);
    const fromOp: string[] = [];
    if (op) {
      if (op.photographer_assigned && op.photographer_assigned !== 'Unassigned') fromOp.push(op.photographer_assigned);
      if (op.videographer_assigned && op.videographer_assigned !== 'Unassigned') fromOp.push(op.videographer_assigned);
      if (op.drone_operator_assigned && op.drone_operator_assigned !== 'Unassigned') fromOp.push(op.drone_operator_assigned);
      if (op.assistant_assigned && op.assistant_assigned !== 'Unassigned') fromOp.push(op.assistant_assigned);
      if (op.assigned_staff) {
        op.assigned_staff.split(',').forEach((s: string) => {
          const trimmed = s.trim();
          if (trimmed && trimmed.toLowerCase() !== 'unassigned' && trimmed.toLowerCase() !== 'none') {
            fromOp.push(trimmed);
          }
        });
      }
    }

    // 4. From getAssignedStaffDetailsForOrder
    const details = getAssignedStaffDetailsForOrder(ord);
    const fromDetails = details.map(d => d.staff_name).filter(n => n && n.toLowerCase() !== 'unassigned' && n.toLowerCase() !== 'none');

    return Array.from(new Set([...fromAssigns, ...fromEvents, ...fromOp, ...fromDetails]));
  };

  interface AssignedStaffDetails {
    staff_name: string;
    staff_role: string;
    assigned_task: string;
    staff_type: 'In-House' | 'Freelancer';
    mobile: string;
    event_name: string;
    event_id?: string;
    assignment_id?: string;
    task_id?: string;
    staff_id?: string;
    slot_number?: number;
    event_date: string;
    reporting_date: string;
    reporting_time: string;
    status: 'Available' | 'Busy';
    staff_status: string;
    google_maps_link?: string;
    assigned_equipment?: string[];
    event_time?: string;
  }

  const getStaffTaskStatus = (orderId: string, eventId: string | undefined, eventIndex: number, staffName: string, ord: Order, assignmentId?: string, staffRole?: string): string => {
    if (!staffName) return 'Pending';
    const nameLower = staffName.trim().toLowerCase();
    
    // 1. Direct assignment match by assignment_id if available
    let sa = assignmentId ? staffAssignments?.find(s => s.assignment_id === assignmentId) : undefined;
    
    // 2. Match by order_id + staff_name + event_id + staff_role
    if (!sa) {
      sa = staffAssignments?.find(s => 
        (s.order_id === orderId || s.order_id === ord.lead_id) && 
        s.staff_name?.trim().toLowerCase() === nameLower &&
        (eventId && s.event_id ? (s.event_id === eventId || (s.event_id === `ev_${eventIndex}`)) : (!eventId || eventId === 'gen' || !s.event_id)) &&
        (!staffRole || s.staff_role?.trim().toLowerCase() === staffRole.trim().toLowerCase())
      );
    }

    // 3. Fallback match strictly if eventId is not specified or general
    if (!sa && (!eventId || eventId === 'gen')) {
      sa = staffAssignments?.find(s => 
        (s.order_id === orderId || s.order_id === ord.lead_id) && 
        s.staff_name?.trim().toLowerCase() === nameLower
      );
    }

    // 4. Check leadEquipmentHistory for live status proof/handover strictly isolated to this event
    const matchingHist = leadEquipmentHistory?.filter(h => {
      if (h.order_id !== orderId && (!ord.lead_id || h.lead_id !== ord.lead_id)) return false;
      const retBy = (h.returned_by || '').trim().toLowerCase();
      let parsed: any = {};
      try { parsed = JSON.parse(h.remarks || '{}'); } catch(e) {}
      const parsedName = (parsed.staff_name || parsed.uploaded_by || '').trim().toLowerCase();
      if (retBy !== nameLower && parsedName !== nameLower) return false;

      const hAssignId = h.assignment_id || parsed.assignment_id;
      if (assignmentId && hAssignId) {
        return hAssignId === assignmentId;
      }

      const hEventId = parsed.event_id || h.event_id;
      if (eventId && eventId !== 'gen' && hEventId && hEventId !== 'gen' && hEventId !== eventId && hEventId !== `ev_${eventIndex}`) {
        return false;
      }
      return true;
    }).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

    if (matchingHist) {
      let histStatus = matchingHist.equipment_status;
      try {
        const parsed = JSON.parse(matchingHist.remarks || '{}');
        if (parsed.current_status) histStatus = parsed.current_status;
      } catch(e) {}
      if (histStatus && ['Completed', 'Event Completed', 'Event Ended', 'Event Started', 'Footage Handover', 'Verified Footage'].includes(histStatus)) {
        return histStatus;
      }
    }

    if (sa) {
      if (sa.task_status) {
        return sa.task_status;
      }
      if (sa.assignment_status && !['Assigned', 'Unassigned'].includes(sa.assignment_status)) {
        return sa.assignment_status;
      }
    }

    return 'Pending';
  };

  const isCompletedEvent = (o: Order) => {
    const completedStages = [
      'Event Completed',
      'Raw Footage Received',
      'Editor Assigned',
      'Editing Started',
      'Editing In Progress',
      'Internal QC Review',
      'Client Review Sent',
      'Revision Required',
      'Revision In Progress',
      'Final Approval',
      'Project Delivered',
      'Project Closed',
      'Customer Review',
      'Approved',
      'Delivered',
      'Payment Pending',
      'Closed'
    ];
    const op = operations.find(x => x.order_id === o.order_id);
    return completedStages.includes(o.current_stage) || op?.event_status === 'Completed';
  };

  const busyStaffMap = useMemo(() => {
    // normDate -> Map<staffNameLower, Set<orderId>>
    const map = new Map<string, Map<string, Set<string>>>();
    if (!staffAssignments) return map;
    staffAssignments.forEach(sa => {
      const assignmentStatus = (sa.assignment_status || '').toLowerCase();
      const taskStatus = ((sa as any).task_status || '').toLowerCase();
      const completedStatuses = [
        'cancelled', 'canceled', 'completed', 'event completed', 
        'project completed', 'closed', 'order closed', 'project closed', 'delivered'
      ];
      if (completedStatuses.includes(assignmentStatus) || completedStatuses.includes(taskStatus)) return;

      const relatedOrder = orderMap.get(sa.order_id);
      if (!relatedOrder || isCompletedEvent(relatedOrder)) return;

      const op = opMap.get(relatedOrder.order_id);
      const eventStatus = op?.event_status || 'Assigned';
      if (['completed', 'event completed', 'cancelled'].includes(eventStatus.toLowerCase())) return;

      const relatedLead = leadMap.get(relatedOrder.lead_id);
      if (!relatedLead || relatedLead.status === 'Lost Lead') return;

      const staffName = (sa.staff_name || '').trim().toLowerCase();
      if (!staffName) return;

      const addDate = (d?: string) => {
        const normD = formatDateDDMMYY(d);
        if (!normD) return;
        if (!map.has(normD)) map.set(normD, new Map());
        const staffMap = map.get(normD)!;
        if (!staffMap.has(staffName)) staffMap.set(staffName, new Set());
        staffMap.get(staffName)!.add(sa.order_id);
      };

      if (relatedLead.events && relatedLead.events.length > 0) {
        relatedLead.events.forEach((ev: any) => {
          const assignedNames = ev.assigned_staff_names
            ? ev.assigned_staff_names.split(',').map((s: string) => s.trim().toLowerCase())
            : [];
          if (assignedNames.includes(staffName)) {
            addDate(ev.event_date);
          }
        });
      } else {
        addDate(relatedLead.event_date || relatedOrder.event_date);
      }
    });
    return map;
  }, [staffAssignments, orderMap, leadMap, opMap]);

  const isStaffBusyOnDate = useCallback((staffName: string, targetDate: string, currentOrderId?: string) => {
    if (!targetDate || !staffName) return false;
    const targetNormDate = formatDateDDMMYY(targetDate);
    if (!targetNormDate) return false;
    const staffLower = staffName.trim().toLowerCase();

    const staffMap = busyStaffMap.get(targetNormDate);
    if (!staffMap) return false;

    const orderSet = staffMap.get(staffLower);
    if (!orderSet || orderSet.size === 0) return false;

    if (currentOrderId && orderSet.has(currentOrderId)) {
      return orderSet.size > 1;
    }
    return true;
  }, [busyStaffMap]);

  // Pre-filtered operations staff by type for instant dropdown population
  const inHouseOperationsStaff = useMemo(() => {
    return (staff || []).filter(s => {
      if (s.status !== 'Active') return false;
      if (s.department !== 'Operations') return false;
      const sType = (s.staff_type || s.Staff_Type || 'In-House').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      return sType === 'inhouse' || sType === 'in-house' || sType === 'in house';
    });
  }, [staff]);

  const freelancerOperationsStaff = useMemo(() => {
    return (staff || []).filter(s => {
      if (s.status !== 'Active') return false;
      if (s.department !== 'Operations') return false;
      const sType = (s.staff_type || s.Staff_Type || 'In-House').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      return sType !== 'inhouse' && sType !== 'in-house' && sType !== 'in house';
    });
  }, [staff]);

  // 1. Map of equipment maintenance/damaged status for O(1) checks
  const equipmentMaintenanceMap = useMemo(() => {
    const map = new Map<string, string>();
    (equipment || []).forEach((e: any) => {
      const eName = String(e.equipment_name || e.name || e.Equipment_Name || '').trim().toLowerCase();
      const eId = String(e.equipment_id || e.id || '').trim().toLowerCase();
      const status = e.status || e.Equipment_Status || '';
      if (status === 'Under Maintenance' || status === 'Damaged' || status === 'Inactive' || status === 'Retired') {
        if (eName) map.set(eName, status);
        if (eId) map.set(eId, status);
      }
    });
    return map;
  }, [equipment]);

  // 2. Pre-indexed equipment schedules from staffAssignments and operations
  const equipmentScheduleIndex = useMemo(() => {
    const index = new Map<string, {
      orderId: string;
      leadId?: string;
      staffName: string;
      eventName: string;
      eventDate: string;
      startTime: string;
      endTime: string;
    }[]>();

    const completedStages = [
      'cancelled', 'canceled', 'completed', 'event completed', 
      'project completed', 'closed', 'order closed', 'project closed', 'delivered', 'project delivered',
      'footage handover', 'equipment handover completed', 'returned'
    ];

    const isReturnedForOrder = (ordId?: string, ldId?: string, cleanEqName?: string) => {
      if (!ordId && !ldId) return false;
      const hasHistoryReturn = (leadEquipmentHistory || []).some(h => {
        const orderMatch = (ordId && h.order_id === ordId) || (ldId && h.lead_id === ldId);
        if (!orderMatch) return false;
        const nameMatch = cleanEqName ? (
          h.equipment_name?.toLowerCase() === cleanEqName || 
          h.equipment_name?.toLowerCase().includes(cleanEqName) ||
          h.equipment_name === 'Equipment Handover Photo Proof' ||
          h.equipment_name === 'Asset Return Photo Proof'
        ) : true;
        const isRet = h.equipment_status === 'Equipment Handover Completed' || 
                      h.equipment_status === 'Returned' || 
                      Boolean(h.returned_at && h.equipment_status?.toLowerCase().includes('handover'));
        return nameMatch && isRet;
      });
      if (hasHistoryReturn) return true;

      const hasHandoverReturn = (equipmentHandovers || []).some(eh => {
        const orderMatch = (ordId && eh.order_id === ordId) || (ldId && eh.order_id === ldId);
        return orderMatch && eh.return_status === 'Returned' && 
          (!cleanEqName || (eh.equipment_name?.toLowerCase() === cleanEqName || eh.equipment_name?.toLowerCase().includes(cleanEqName)));
      });
      return hasHandoverReturn;
    };

    const addSchedule = (eqName: string, item: {
      orderId: string;
      leadId?: string;
      staffName: string;
      eventName: string;
      eventDate: string;
      startTime: string;
      endTime: string;
    }) => {
      const clean = eqName.trim().toLowerCase();
      if (!clean) return;
      if (!index.has(clean)) index.set(clean, []);
      index.get(clean)!.push(item);
    };

    // 1. Staff Assignments
    (staffAssignments || []).forEach(sa => {
      const assignStatus = (sa.assignment_status || '').toLowerCase();
      const taskStatus = ((sa as any).task_status || '').toLowerCase();
      if (completedStages.includes(assignStatus) || completedStages.includes(taskStatus)) return;

      const relatedOrder = orderMap.get(sa.order_id);
      if (!relatedOrder || isCompletedEvent(relatedOrder)) return;

      const op = opMap.get(relatedOrder.order_id);
      if (op && ['completed', 'event completed', 'cancelled'].includes((op.event_status || '').toLowerCase())) return;

      const relatedLead = leadMap.get(relatedOrder.lead_id);
      if (!relatedLead || relatedLead.status === 'Lost Lead') return;

      let saEqList: string[] = [];
      if (Array.isArray(sa.equipment)) {
        saEqList = sa.equipment;
      } else if (typeof sa.equipment === 'string') {
        try {
          const parsed = JSON.parse(sa.equipment);
          saEqList = Array.isArray(parsed) ? parsed : [sa.equipment];
        } catch {
          saEqList = (sa.equipment as string).split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }

      if (saEqList.length === 0) return;

      let evDate = relatedOrder.event_date || relatedLead.event_date;
      let evStart = relatedOrder.reporting_time || '';
      let evEnd = relatedOrder.event_end_time || '';
      let evName = relatedOrder.event_type || 'Event';
      
      if (sa.event_id && relatedLead.events && Array.isArray(relatedLead.events)) {
        const ev = relatedLead.events.find(e => e.id === sa.event_id);
        if (ev) {
          evDate = ev.event_date || evDate;
          evStart = ev.event_start_time || ev.reporting_time || evStart;
          evEnd = ev.event_end_time || evEnd;
          evName = ev.event_name || ev.event_type || evName;
        }
      } else if (sa.event_name && relatedLead.events && Array.isArray(relatedLead.events)) {
        const ev = relatedLead.events.find(e => (e.event_name || e.event_type || '').toLowerCase() === sa.event_name?.toLowerCase());
        if (ev) {
          evDate = ev.event_date || evDate;
          evStart = ev.event_start_time || ev.reporting_time || evStart;
          evEnd = ev.event_end_time || evEnd;
          evName = ev.event_name || ev.event_type || evName;
        }
      }

      saEqList.forEach(rawEq => {
        const cleanEq = rawEq.trim().toLowerCase();
        if (!cleanEq) return;
        if (isReturnedForOrder(sa.order_id, relatedOrder.lead_id, cleanEq)) return;

        addSchedule(cleanEq, {
          orderId: sa.order_id,
          leadId: relatedOrder.lead_id,
          staffName: sa.staff_name || 'Assigned Crew',
          eventName: evName,
          eventDate: evDate || '',
          startTime: evStart,
          endTime: evEnd
        });
      });
    });

    // 2. Operations equipment kit
    (operations || []).forEach(op => {
      if (!op.equipment_kit || !op.equipment_kit.trim()) return;
      if (['completed', 'event completed', 'cancelled'].includes((op.event_status || '').toLowerCase())) return;
      if (['equipment handover completed', 'returned', 'equipment returned'].includes((op.equipment_status || '').toLowerCase())) return;

      const relatedOrder = orderMap.get(op.order_id);
      if (!relatedOrder || isCompletedEvent(relatedOrder)) return;

      const relatedLead = leadMap.get(relatedOrder.lead_id);
      if (!relatedLead || relatedLead.status === 'Lost Lead') return;

      const opKits = parseEquipmentKit(op.equipment_kit);
      if (opKits.length === 0) return;

      let evDate = relatedOrder.event_date || relatedLead.event_date;
      let evStart = relatedOrder.reporting_time || '';
      let evEnd = relatedOrder.event_end_time || '';
      let evName = relatedOrder.event_type || 'Event';

      opKits.forEach(rawEq => {
        const cleanEq = rawEq.trim().toLowerCase();
        if (!cleanEq) return;
        if (isReturnedForOrder(op.order_id, relatedOrder?.lead_id, cleanEq)) return;

        if (relatedLead.events && relatedLead.events.length > 0) {
          relatedLead.events.forEach((ev: any) => {
            addSchedule(cleanEq, {
              orderId: op.order_id,
              leadId: relatedOrder.lead_id,
              staffName: 'Crew',
              eventName: ev.event_name || ev.event_type || evName,
              eventDate: ev.event_date || evDate || '',
              startTime: ev.event_start_time || ev.reporting_time || evStart,
              endTime: ev.event_end_time || evEnd
            });
          });
        } else {
          addSchedule(cleanEq, {
            orderId: op.order_id,
            leadId: relatedOrder.lead_id,
            staffName: 'Crew',
            eventName: evName,
            eventDate: evDate || '',
            startTime: evStart,
            endTime: evEnd
          });
        }
      });
    });

    return index;
  }, [staffAssignments, operations, leadEquipmentHistory, equipmentHandovers, orderMap, leadMap, opMap]);

  const checkEquipmentAvailability = useCallback((
    equipmentName: string, 
    currentOrderId?: string, 
    targetDate?: string,
    targetStartTime?: string,
    targetEndTime?: string
  ): EquipmentAvailability => {
    const result: EquipmentAvailability = {
      isBusy: false,
      conflicts: [],
      schedule: []
    };
    if (!equipmentName) return result;
    const cleanEqName = equipmentName.trim().toLowerCase();

    // 1. Maintenance / Damaged check
    const maintenanceStatus = equipmentMaintenanceMap.get(cleanEqName);
    if (maintenanceStatus) {
      result.isBusy = true;
      result.statusText = maintenanceStatus;
      return result;
    }

    // 2. Lookup pre-indexed active schedules
    const rawSchedules = equipmentScheduleIndex.get(cleanEqName);
    if (!rawSchedules || rawSchedules.length === 0) {
      return result;
    }

    // Filter out current order
    const isCurrentOrderMatch = (targetOrdId?: string) => {
      if (!targetOrdId || !currentOrderId) return false;
      if (targetOrdId === currentOrderId) return true;
      const currOrd = orderMap.get(currentOrderId);
      const currLead = leadMap.get(currentOrderId) || (currOrd ? leadMap.get(currOrd.lead_id) : undefined);
      return targetOrdId === currOrd?.order_id || 
             targetOrdId === currOrd?.lead_id || 
             targetOrdId === currLead?.lead_id || 
             targetOrdId === (currLead as any)?.order_id;
    };

    const activeSchedules = rawSchedules.filter(s => 
      !isCurrentOrderMatch(s.orderId) && !isCurrentOrderMatch(s.leadId)
    );

    if (activeSchedules.length === 0) {
      return result;
    }

    if (targetDate) {
      const targetNormDate = formatDateDDMMYY(targetDate);
      const sameDaySchedules = activeSchedules.filter(s => {
        const sNormDate = s.eventDate ? formatDateDDMMYY(s.eventDate) : '';
        return sNormDate && sNormDate === targetNormDate;
      });

      const conflictsList: EquipmentConflictDetails[] = [];
      const nonConflictsList: EquipmentConflictDetails[] = [];

      for (const s of sameDaySchedules) {
        const isOverlap = checkTimeOverlap(targetStartTime, targetEndTime, s.startTime, s.endTime);
        const item: EquipmentConflictDetails = {
          staffName: s.staffName,
          eventName: s.eventName,
          eventDate: s.eventDate,
          startTime: s.startTime,
          endTime: s.endTime
        };
        if (isOverlap) {
          conflictsList.push(item);
        } else {
          nonConflictsList.push(item);
        }
      }

      result.conflicts = conflictsList;
      result.schedule = nonConflictsList;
      result.isBusy = conflictsList.length > 0;
      if (result.isBusy) {
        result.statusText = "Busy / In Use";
      }
    } else {
      result.isBusy = true;
      result.statusText = "Assigned to another active event";
      result.schedule = activeSchedules.map(s => ({
        staffName: s.staffName,
        eventName: s.eventName,
        eventDate: s.eventDate,
        startTime: s.startTime,
        endTime: s.endTime
      }));
    }

    return result;
  }, [equipmentMaintenanceMap, equipmentScheduleIndex, orderMap, leadMap]);

  const isEquipmentBusy = (equipmentName: string, currentOrderId?: string, targetDate?: string): boolean => {
    return checkEquipmentAvailability(equipmentName, currentOrderId, targetDate).isBusy;
  };


  // Robust helper to resolve assigned equipment for a staff member across all possible sources
  // STRICT RULE: Equipment is individual per Order + Event + Assignment. NEVER share across events.
  const resolveStaffEquipment = (staffName: string, ord?: Order, sa?: any, ev?: any, nameIdx?: number): string[] => {
    const normName = (staffName || '').trim().toLowerCase();
    if (!normName) return [];
    const eqList: string[] = [];
    const lead = ord ? leads.find(l => (ord.lead_id && l.lead_id === ord.lead_id) || l.order_id === ord.order_id) : undefined;
    const op = ord ? getOpDetails(ord.order_id) : undefined;

    // 1. Check direct equipment on the specific StaffAssignment for this exact staff & event
    if (sa) {
      const hasEquipmentArray = Array.isArray(sa.equipment) && sa.equipment.length > 0;
      const rawEq = hasEquipmentArray ? sa.equipment : (sa.assigned_equipment || sa.equipment);
      if (rawEq !== undefined && rawEq !== null) {
        if (Array.isArray(rawEq)) {
          rawEq.forEach((item: any) => {
            if (typeof item === 'string' && item.trim()) {
              eqList.push(item.trim());
            } else if (item && typeof item === 'object' && (item.name || item.equipment_name)) {
              eqList.push((item.name || item.equipment_name).trim());
            }
          });
          const cleanList = eqList.filter(item => item && item.trim() && item.trim().toLowerCase() !== 'none' && item.trim().toLowerCase() !== 'not assigned' && item.trim().toLowerCase() !== 'null' && item.trim().toLowerCase() !== 'undefined');
          if (cleanList.length > 0) {
            return Array.from(new Set(cleanList));
          }
        } else if (typeof rawEq === 'string') {
          const trimmedStr = rawEq.trim();
          if (trimmedStr) {
            try {
              const parsed = JSON.parse(trimmedStr);
              if (Array.isArray(parsed)) {
                parsed.forEach((item: any) => {
                  if (typeof item === 'string' && item.trim()) eqList.push(item.trim());
                  else if (item && typeof item === 'object' && (item.name || item.equipment_name)) eqList.push((item.name || item.equipment_name).trim());
                });
              } else if (typeof parsed === 'string' && parsed.trim()) {
                eqList.push(parsed.trim());
              }
            } catch(e) {
              trimmedStr.split(',').forEach((s: string) => { if (s.trim()) eqList.push(s.trim()); });
            }
            const cleanList = eqList.filter(item => item && item.trim() && item.trim().toLowerCase() !== 'none' && item.trim().toLowerCase() !== 'not assigned' && item.trim().toLowerCase() !== 'null' && item.trim().toLowerCase() !== 'undefined');
            if (cleanList.length > 0) {
              return Array.from(new Set(cleanList));
            }
          }
        }
      }
    }

    // 2. Check ev.assigned_staff_mobiles (encoded equipment JSON per staff slot) ONLY for THIS specific event
    if (eqList.length === 0 && ev && ev.assigned_staff_mobiles) {
      const mobilesRaw = ev.assigned_staff_mobiles || '';
      const assignedNames = ev.assigned_staff_names ? ev.assigned_staff_names.split(',').map((n: string) => n.trim().toLowerCase()) : [];
      let resolvedIdx = -1;
      
      // If nameIdx is provided and the name at that index matches, use it to avoid duplicate name collisions
      if (nameIdx !== undefined && nameIdx >= 0 && nameIdx < assignedNames.length) {
        const nAtIdx = assignedNames[nameIdx];
        if (nAtIdx === normName || nAtIdx.includes(normName) || normName.includes(nAtIdx)) {
          resolvedIdx = nameIdx;
        }
      }
      
      // Fallback to searching if nameIdx wasn't helpful
      if (resolvedIdx === -1) {
        resolvedIdx = assignedNames.findIndex((n: string) => n === normName || n.includes(normName) || normName.includes(n));
      }

      if (mobilesRaw.includes(' || EQUIPMENT: JSON:')) {
        try {
          const parts = mobilesRaw.split(' || EQUIPMENT: JSON:');
          const staffEquipments = JSON.parse(parts[1]);
          if (Array.isArray(staffEquipments)) {
            if (resolvedIdx >= 0 && Array.isArray(staffEquipments[resolvedIdx]) && staffEquipments[resolvedIdx].length > 0) {
              staffEquipments[resolvedIdx].forEach((eq: string) => { if (eq && eq.trim()) eqList.push(eq.trim()); });
              const cleanList = eqList.filter(item => item && item.trim() && item.trim().toLowerCase() !== 'none' && item.trim().toLowerCase() !== 'not assigned' && item.trim().toLowerCase() !== 'null' && item.trim().toLowerCase() !== 'undefined');
              if (cleanList.length > 0) {
                return Array.from(new Set(cleanList));
              }
            }
          }
        } catch (e) {}
      } else if (mobilesRaw.includes(' || EQUIPMENT: ')) {
        if (resolvedIdx >= 0) {
          const parts = mobilesRaw.split(' || EQUIPMENT: ');
          if (parts[1]) {
            parts[1].split(',').forEach((s: string) => { if (s.trim()) eqList.push(s.trim()); });
            const cleanList = eqList.filter(item => item && item.trim() && item.trim().toLowerCase() !== 'none' && item.trim().toLowerCase() !== 'not assigned' && item.trim().toLowerCase() !== 'null' && item.trim().toLowerCase() !== 'undefined');
            if (cleanList.length > 0) {
              return Array.from(new Set(cleanList));
            }
          }
        }
      }
    }

    // 3. Check operations.equipment_kit fallback - ONLY if explicitly matched to this event
    if (eqList.length === 0 && ord) {
      const orderOp = getOpDetails(ord.order_id);
      if (orderOp?.equipment_kit && typeof orderOp.equipment_kit === 'string' && orderOp.equipment_kit.trim()) {
        try {
          const parsedKits = JSON.parse(orderOp.equipment_kit);
          if (Array.isArray(parsedKits)) {
            const taskMatch = parsedKits.find((k: any) => {
               if ((k.staff_name || '').toLowerCase() !== normName) return false;
               if (ev && k.event_id && k.event_id !== ev.id) return false;
               if (sa?.assignment_id && k.assignment_id && sa.assignment_id !== k.assignment_id) return false;
               if (!sa?.assignment_id && sa?.staff_role && k.staff_role && sa.staff_role !== k.staff_role) return false;
               return true;
            });
            if (taskMatch && Array.isArray(taskMatch.equipment)) {
               taskMatch.equipment.forEach((e: string) => eqList.push(e));
            }
          }
        } catch (e) {
          // Ignore legacy non-JSON formats as they cannot be mapped to specific events securely
        }
      }
    }

    const cleanList = eqList.filter(item => item && item.trim() && item.trim().toLowerCase() !== 'none' && item.trim().toLowerCase() !== 'not assigned' && item.trim().toLowerCase() !== 'null' && item.trim().toLowerCase() !== 'undefined');
    return Array.from(new Set(cleanList));
  };

  const getAssignedStaffDetailsForOrder = (ord: Order): AssignedStaffDetails[] => {
    const lead = findLeadForOrder(ord, leads || []);
    const orderAssignments = staffAssignments ? staffAssignments.filter(sa => (sa.order_id === ord.order_id || sa.order_id === ord.lead_id || (ord.lead_id && sa.lead_id === ord.lead_id)) && sa.assignment_status !== 'Cancelled') : [];

    const resolvedEvents = getOrderEventsList(ord, lead);
    const hasEventsAssignments = resolvedEvents.some((ev: any) => ev.assigned_staff_names && ev.assigned_staff_names.trim());

    if (orderAssignments.length === 0 && !hasEventsAssignments) {
      return [];
    }

    const staffDetailsList: AssignedStaffDetails[] = [];
    const op = getOpDetails(ord.order_id);
    const targetLeadPkgs = leadPackages?.filter(lp => lp.lead_id === (lead?.lead_id || ord.lead_id)) || [];
    const teamMembersConfig = extractTeamMembersConfig(lead, targetLeadPkgs);
    const totalEvents = resolvedEvents.length;

    resolvedEvents.forEach((ev: any, evIdx: number) => {
      const evId = String(ev.id || ev.event_id || `ev_${evIdx}`).trim();
      const rawId = ev.id ? String(ev.id).trim() : '';
      const rawEvId = ev.event_id ? String(ev.event_id).trim() : '';

      // Collect IDs of all other events to strictly prevent cross-event assignment leakage
      const otherEventIds = new Set(
        resolvedEvents
          .filter((_, oIdx) => oIdx !== evIdx)
          .flatMap((oe, oIdx) => [
            String(oe.id || oe.event_id || `ev_${oIdx}`).trim(),
            oe.id ? String(oe.id).trim() : '',
            oe.event_id ? String(oe.event_id).trim() : '',
            `ev_${oIdx}`
          ])
          .filter(Boolean)
      );

      // Strict assignment query for this specific event
      const evOrderAssignments = orderAssignments.filter(sa => {
        const saEvId = sa.event_id ? String(sa.event_id).trim() : '';

        if (saEvId) {
          if (otherEventIds.has(saEvId)) return false;
          if (saEvId === evId || (rawId && saEvId === rawId) || (rawEvId && saEvId === rawEvId) || saEvId === `ev_${evIdx}`) {
            return true;
          }
        }

        // Check canonical IDs
        if (sa.assignment_id && ((evId && sa.assignment_id.includes(`-${evId}-`)) || (rawId && sa.assignment_id.includes(`-${rawId}-`)))) {
          return true;
        }
        if (sa.task_id && ((evId && sa.task_id.includes(`_${evId}_`)) || (rawId && sa.task_id.includes(`_${rawId}_`)))) {
          return true;
        }

        // Single event order fallback
        if (totalEvents === 1) return true;

        return false;
      });

      const includedRoles = getEventRolesForEvent(ev, evIdx, teamMembersConfig, totalEvents);

      if (evOrderAssignments.length > 0) {
        const taskSlotRoles: { roleName: string; slotNumber: number; taskId: string; assignId: string }[] = [];
        includedRoles.forEach((roleStr: string) => {
          const { qty, text } = parseQtyAndText(roleStr);
          const roleName = (text || roleStr).trim();
          const targetQty = qty || 1;
          for (let q = 1; q <= targetQty; q++) {
            taskSlotRoles.push({
              roleName,
              slotNumber: q,
              taskId: generateDeterministicTaskId(ord.order_id, evId, roleName, q),
              assignId: generateDeterministicAssignmentId(ord.order_id, evId, roleName, q)
            });
          }
        });

        const usedSaIds = new Set<string>();

        // 1. Match each sales slot to an assignment
        taskSlotRoles.forEach(slot => {
          let matchedSa = evOrderAssignments.find(sa => {
            const saId = sa.assignment_id || sa.id;
            if (usedSaIds.has(saId)) return false;
            return (
              sa.task_id === slot.taskId ||
              sa.assignment_id === slot.assignId ||
              ((sa.staff_role || '').trim().toLowerCase() === slot.roleName.toLowerCase() && Number(sa.slot_number || 1) === slot.slotNumber)
            );
          });

          if (!matchedSa && slot.slotNumber === 1) {
            matchedSa = evOrderAssignments.find(sa => {
              const saId = sa.assignment_id || sa.id;
              if (usedSaIds.has(saId)) return false;
              return (
                (sa.staff_role || '').trim().toLowerCase() === slot.roleName.toLowerCase() &&
                (sa.slot_number === undefined || sa.slot_number === null || Number(sa.slot_number) === 1)
              );
            });
          }

          if (matchedSa) {
            usedSaIds.add(matchedSa.assignment_id || matchedSa.id);
            const st = staff?.find(s => s.name?.toLowerCase() === matchedSa!.staff_name?.toLowerCase() || s.staff_id === matchedSa!.staff_id);
            const staffTaskStatus = getStaffTaskStatus(ord.order_id, evId, evIdx, matchedSa.staff_name, ord, matchedSa.assignment_id, slot.roleName);
            const saEq = resolveStaffEquipment(matchedSa.staff_name, ord, matchedSa, ev, 0);

            staffDetailsList.push({
              staff_name: matchedSa.staff_name,
              staff_role: slot.roleName,
              assigned_task: slot.roleName,
              staff_type: matchedSa.staff_type || st?.staff_type || 'In-House',
              mobile: matchedSa.mobile || st?.mobile || '',
              event_name: ev.event_name || ev.event_type || ord.event_type || 'Event',
              event_id: evId,
              assignment_id: matchedSa.assignment_id,
              task_id: matchedSa.task_id,
              staff_id: matchedSa.staff_id,
              slot_number: matchedSa.slot_number,
              event_date: ev.event_date || ord.event_date || '',
              reporting_date: ev.reporting_date || lead?.Reporting_date || ev.event_date || ord.event_date || '',
              reporting_time: ev.reporting_time || ord.reporting_time || op?.reporting_time || '',
              status: isStaffBusyOnDate(matchedSa.staff_name, ev.event_date || ord.event_date || '', ord.order_id) ? 'Busy' : 'Available',
              staff_status: staffTaskStatus,
              google_maps_link: ev.google_maps_link || lead?.google_maps_link || '',
              assigned_equipment: saEq,
              event_time: ev.event_start_time || ord.event_time || ''
            });
          }
        });
      } else if (ev.assigned_staff_names && ev.assigned_staff_names.trim()) {
        const names = ev.assigned_staff_names.split(',').map((n: string) => n.trim()).filter(Boolean);
        
        const cleanMobilesRaw = (ev.assigned_staff_mobiles || '').split(' || EQUIPMENT:')[0] || '';
        const mobilesList = cleanMobilesRaw.split(',').map((m: string) => m.trim()).filter(Boolean);

        const taskSlotRoles: string[] = [];
        includedRoles.forEach((roleStr: string) => {
          const { qty, text } = parseQtyAndText(roleStr);
          const roleName = (text || roleStr).trim();
          const targetQty = qty || 1;
          for (let q = 0; q < targetQty; q++) {
            taskSlotRoles.push(roleName);
          }
        });

        names.forEach((name, nameIdx) => {
          const st = staff?.find(s => s.name?.toLowerCase() === name.toLowerCase());
          const assignedTask = taskSlotRoles[nameIdx] || st?.role || 'Staff';

          // Strictly match assignment belonging to this event
          const saMatch = orderAssignments.find(sa => 
            sa.staff_name?.toLowerCase() === name.toLowerCase() && 
            (sa.event_id === evId || (ev.id && sa.event_id === String(ev.id)) || sa.event_id === `ev_${evIdx}`)
          );

          const rawTask = taskSlotRoles[nameIdx] || saMatch?.staff_role || st?.role || 'Staff';
          const parsedRole = parseQtyAndText(rawTask);
          const roleClean = (parsedRole.text || rawTask).trim();

          const mobileNum = mobilesList[nameIdx] || st?.mobile || '';
          const staffTaskStatus = getStaffTaskStatus(ord.order_id, evId, evIdx, name, ord, saMatch?.assignment_id, roleClean);
          const memberEquipment = resolveStaffEquipment(name, ord, saMatch, ev, nameIdx);

          staffDetailsList.push({
            staff_name: name,
            staff_role: roleClean,
            assigned_task: roleClean,
            staff_type: st?.staff_type || 'In-House',
            mobile: mobileNum,
            event_name: ev.event_name || ev.event_type || ord.event_type || 'Event',
            event_id: evId,
            assignment_id: saMatch?.assignment_id,
            task_id: saMatch?.task_id,
            staff_id: saMatch?.staff_id,
            slot_number: saMatch?.slot_number,
            event_date: ev.event_date || ord.event_date || '',
            reporting_date: ev.reporting_date || lead?.Reporting_date || ev.event_date || ord.event_date || '',
            reporting_time: ev.reporting_time || ord.reporting_time || op?.reporting_time || '',
            status: isStaffBusyOnDate(name, ev.event_date || ord.event_date || '', ord.order_id) ? 'Busy' : 'Available',
            staff_status: staffTaskStatus,
            google_maps_link: ev.google_maps_link || lead?.google_maps_link || '',
            assigned_equipment: memberEquipment,
            event_time: ev.event_start_time || ord.event_time || ''
          });
        });
      }
    });

    // Collect any leftover orderAssignments that were not included in staffDetailsList
    if (orderAssignments.length > 0) {
      orderAssignments.forEach((sa, saIdx) => {
        const alreadyAdded = staffDetailsList.some(sd => 
          (sd.assignment_id && sa.assignment_id && sd.assignment_id === sa.assignment_id) || 
          (sd.staff_name.toLowerCase() === sa.staff_name.toLowerCase() && sd.event_id === sa.event_id)
        );
        if (!alreadyAdded && sa.staff_name && sa.staff_name.toLowerCase() !== 'unassigned' && sa.staff_name.toLowerCase() !== 'none') {
          const name = sa.staff_name;
          const st = staff?.find(s => s.name?.toLowerCase() === name.toLowerCase() || s.staff_id === sa.staff_id);
          const matchedEv = resolvedEvents.find((e: any, eIdx: number) => {
            const eEvId = String(e.id || e.event_id || `ev_${eIdx}`).trim();
            const eRawId = e.id ? String(e.id).trim() : '';
            const eRawEvId = e.event_id ? String(e.event_id).trim() : '';
            const saEvId = String(sa.event_id || '').trim();
            return saEvId && (saEvId === eEvId || saEvId === eRawId || saEvId === eRawEvId);
          });
          if (totalEvents > 1 && !matchedEv) {
            return;
          }
          const assignedEquipment = resolveStaffEquipment(name, ord, sa, matchedEv, saIdx);
          const assignedTask = sa.staff_role || st?.role || 'Staff';
          const staffTaskStatus = getStaffTaskStatus(ord.order_id, sa.event_id, saIdx, name, ord, sa.assignment_id, assignedTask);

          staffDetailsList.push({
            staff_name: name,
            staff_role: assignedTask,
            assigned_task: assignedTask,
            staff_type: sa.staff_type || st?.staff_type || 'In-House',
            mobile: sa.mobile || st?.mobile || '',
            event_name: sa.event_name || matchedEv?.event_name || ord.event_type || 'Main Event',
            event_id: sa.event_id || matchedEv?.id || (totalEvents === 1 ? 'ev_0' : ''),
            assignment_id: sa.assignment_id,
            task_id: sa.task_id,
            staff_id: sa.staff_id,
            slot_number: sa.slot_number,
            event_date: matchedEv?.event_date || ord.event_date || '',
            reporting_date: matchedEv?.reporting_date || ord.Reporting_date || lead?.Reporting_date || ord.event_date || '',
            reporting_time: matchedEv?.reporting_time || ord.reporting_time || op?.reporting_time || '',
            status: isStaffBusyOnDate(name, matchedEv?.event_date || ord.event_date || '', ord.order_id) ? 'Busy' : 'Available',
            staff_status: staffTaskStatus,
            google_maps_link: matchedEv?.google_maps_link || lead?.google_maps_link || '',
            assigned_equipment: assignedEquipment,
            event_time: matchedEv?.event_start_time || ord.event_time || ''
          });
        }
      });
    }

    return staffDetailsList;
  };

  // Helper to get assigned staff names strictly for a specific event within an order
  const getStaffMembersForEvent = (ord: Order, ev: any, evIdx: number, allOrderEvents: any[]): string[] => {
    const evId = String(ev.id || ev.event_id || `ev_${evIdx}`).trim();
    const rawId = ev.id ? String(ev.id).trim() : '';
    const rawEvId = ev.event_id ? String(ev.event_id).trim() : '';

    const otherEventIds = new Set(
      allOrderEvents
        .filter((_, idx) => idx !== evIdx)
        .flatMap((oe, idx) => [
          String(oe.id || '').trim(),
          String(oe.event_id || '').trim(),
          `ev_${idx}`
        ])
        .filter(Boolean)
    );

    const thisEventIds = new Set([
      evId,
      rawId,
      rawEvId,
      `ev_${evIdx}`
    ].filter(Boolean));

    // 1. Check from getAssignedStaffDetailsForOrder
    const staffDetails = getAssignedStaffDetailsForOrder(ord);
    const matchingDetails = staffDetails.filter(sd => {
      const sdEvId = String(sd.event_id || '').trim();
      if (!sdEvId) {
        return allOrderEvents.length === 1;
      }
      if (otherEventIds.has(sdEvId)) return false;
      return thisEventIds.has(sdEvId) || (allOrderEvents.length === 1);
    });

    if (matchingDetails.length > 0) {
      const names = Array.from(new Set(matchingDetails.map(d => d.staff_name?.trim()).filter(Boolean)));
      if (names.length > 0) return names;
    }

    // 2. Direct lookup from staffAssignments
    const orderAssigns = (staffAssignments || []).filter(sa => 
      (sa.order_id === ord.order_id || sa.order_id === ord.lead_id || (ord.lead_id && sa.lead_id === ord.lead_id)) &&
      sa.assignment_status !== 'Cancelled'
    );

    const matchingAssigns = orderAssigns.filter(sa => {
      const saEvId = String(sa.event_id || '').trim();
      if (!saEvId) {
        return allOrderEvents.length === 1;
      }
      if (otherEventIds.has(saEvId)) return false;
      return (
        thisEventIds.has(saEvId) ||
        (sa.assignment_id && evId && sa.assignment_id.includes(`-${evId}-`)) ||
        (sa.task_id && evId && sa.task_id.includes(`_${evId}_`)) ||
        (allOrderEvents.length === 1)
      );
    });

    const assignNames = Array.from(new Set(
      matchingAssigns
        .map(sa => sa.staff_name?.trim())
        .filter(n => n && n.toLowerCase() !== 'unassigned' && n.toLowerCase() !== 'none')
    ));

    if (assignNames.length > 0) return assignNames;

    // 3. Check ev.assigned_staff_names on the event object itself
    if (ev.assigned_staff_names && typeof ev.assigned_staff_names === 'string') {
      const evNames = ev.assigned_staff_names
        .split(',')
        .map((n: string) => n.trim())
        .filter((n: string) => n && n.toLowerCase() !== 'unassigned' && n.toLowerCase() !== 'none');
      if (evNames.length > 0) {
        return Array.from(new Set(evNames));
      }
    }

    return [];
  };

  // Helper to generate personalized WhatsApp message for a staff member
  const generateWhatsAppMessageForStaff = (ord: Order, staffName: string, modalEventAllocations?: any, modalLead?: any, finalAssignments?: any[]) => {
    const lead = (ord?.lead_id ? leads.find(l => l.lead_id === ord.lead_id) : null) || (modalLead?.lead_id ? leads.find(l => l.lead_id === modalLead.lead_id) : null) || modalLead || leads.find(l => l.lead_id === ord.lead_id);
    const op = operations.find(o => o.order_id === ord.order_id);
    const targetLeadPkgs = leadPackages?.filter(lp => lp.lead_id === (lead?.lead_id || ord.lead_id)) || [];

    return generateWhatsAppAssignmentMessage({
      order: ord,
      lead: lead,
      leadPkgs: targetLeadPkgs,
      staffAssignments: staffAssignments,
      operationsRecord: op,
      staffList: staff,
      modalEventAllocations: modalEventAllocations,
      finalAssignments: finalAssignments,
      targetStaffName: staffName
    });
  };

  // Helper to check if an order/lead has reached Verified Footage
  const isVerifiedFootageOrder = (o: Order) => {
    const postOpStages = [
      'Verified Footage', 'Footage Handover Verified',
      'Raw Footage Received', 'Editor Assigned', 'Editing Started', 'Editing In Progress',
      'Internal QC Review', 'Client Review Sent', 'Internal Review', 'Client Review',
      'Revision Required', 'Revision In Progress', 'Revision', 'Final Approval',
      'Ready for Delivery', 'Project Delivered', 'Delivered', 'Project Completed', 'Completed', 'Order Closed'
    ];
    
    const stage = (o.current_stage || o.order_status || '').trim();
    if (postOpStages.includes(stage)) return true;

    const lead = leads?.find(l => l.lead_id === o.lead_id || l.lead_id === o.order_id);
    if (lead) {
      const leadStatus = (lead.current_status || lead.status || '').trim();
      if (postOpStages.includes(leadStatus)) return true;
    }

    const op = operations?.find(op => op.order_id === o.order_id);
    if (op) {
      const opStatus = (op.event_status || '').trim();
      if (postOpStages.includes(opStatus)) return true;
    }
    return false;
  };

  // Filter orders to show confirmed ones for Operations (active workflow stages only)
  const allowedStages = [
    'Confirm Order', 'Order Confirmed', 'New Order Received', 'Operations Assigned',
    'Assigned Crew', 'Staff Assigned', 'Event Scheduled',
    'Event Started', 'Event Start',
    'Event Ended', 'Event End', 'Event Completed', 'Event Complete',
    'Footage Handover', 'Equipment Handover',
    'Event Cancelled'
  ];
  const operationsOrders = orders.filter(o => {
    if (!allowedStages.includes(o.current_stage)) return false;
    if (isVerifiedFootageOrder(o)) return false;
    if (currentRole === 'Operation Staff') {
      const staffName = currentUserName || '';
      const orderAssigns = staffAssignments ? staffAssignments.filter(sa => sa.order_id === o.order_id && sa.assignment_status !== 'Cancelled') : [];
      const isAssigned = orderAssigns.some(sa => sa.staff_name?.toLowerCase() === staffName.toLowerCase());
      if (!isAssigned) return false;
    }
    return true;
  });

  // Unique staff lists for individual filters
  const photographersList = useMemo(() => {
    return staff ? Array.from(new Set(staff.filter(s => s.role.toLowerCase().includes('photo')).map(s => s.name))) : [];
  }, [staff]);

  const videographersList = useMemo(() => {
    return staff ? Array.from(new Set(staff.filter(s => s.role.toLowerCase().includes('video')).map(s => s.name))) : [];
  }, [staff]);

  const droneOperatorsList = useMemo(() => {
    return staff ? Array.from(new Set(staff.filter(s => s.role.toLowerCase().includes('drone') || s.role.toLowerCase().includes('aerial')).map(s => s.name))) : [];
  }, [staff]);

  const assistantsList = useMemo(() => {
    return staff ? Array.from(new Set(staff.filter(s => s.role.toLowerCase().includes('assist') || s.role.toLowerCase().includes('production')).map(s => s.name))) : [];
  }, [staff]);

  // Search filtered orders
  const isWithinDateRange = (dateStr: string, filterType: string, customStart?: string, customEnd?: string) => {
    return isEventWithinDateRange(dateStr, filterType, customStart, customEnd);
  };

  const getOpDetails = (orderId: string) => {
    return operations.find(o => o.order_id === orderId);
  };

  const filteredOrders = useMemo(() => {
    const baseSource = operationsOrders;

    return baseSource.filter(o => {
      // Automatically remove orders that reached Verified Footage or moved to Production
      if (isVerifiedFootageOrder(o)) return false;

      // Search term validation (Search by Customer Name, Order ID, Mobile Number)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
          o.order_id.toLowerCase().includes(term) ||
          o.customer_name.toLowerCase().includes(term) ||
          (o.mobile && o.mobile.toLowerCase().includes(term));
        if (!matchesSearch) return false;
      }

      // 1. Status Dropdown filter
      if (statusFilter === 'All') {
        // Automatically remove orders that reached Verified Footage or moved to Production
        if (isVerifiedFootageOrder(o)) return false;
      } else {
        const isStaffAssigned = staffAssignments ? staffAssignments.some(x => x.order_id === o.order_id) : false;
        const assignedStaffDetails = getAssignedStaffDetailsForOrder(o);
        const staffStatuses = assignedStaffDetails.map(s => s.staff_status);
        const calculatedStage = getCalculatedOrderStage(o.current_stage, staffStatuses);
        const stageNorm = (calculatedStage || o.current_stage || '').trim();
        
        if (statusFilter === 'Order Confirmed' && !['Order Confirmed', 'Confirm Order', 'New Order Received'].includes(stageNorm)) return false;
        if (statusFilter === 'Operations Assigned' && stageNorm !== 'Operations Assigned') return false;
        if (statusFilter === 'Assigned Crew' && !['Assigned Crew', 'Staff Assigned', 'Event Scheduled'].includes(stageNorm)) return false;
        if (statusFilter === 'Staff Assigned' && !isStaffAssigned) return false;
        if (statusFilter === 'Event Scheduled' && stageNorm !== 'Event Scheduled') return false;
        if (statusFilter === 'Event Cancelled' && stageNorm !== 'Event Cancelled') return false;
        if (statusFilter === 'Event Started' && !['Event Started', 'Event Start'].includes(stageNorm)) return false;
        if (statusFilter === 'Event Ended' && !['Event Ended', 'Event End', 'Event Completed', 'Event Complete'].includes(stageNorm)) return false;
        if (statusFilter === 'Footage Handover' && !['Footage Handover', 'Equipment Handover'].includes(stageNorm)) return false;
        if (statusFilter === 'Verified Footage' && !(stageNorm === 'Verified Footage' || stageNorm === 'Footage Handover Verified' || isVerifiedFootageOrder(o))) return false;
        if (statusFilter === 'Event Completed' && !['Event Completed', 'Event Complete', 'Event Ended', 'Event End'].includes(stageNorm)) return false;
        if (statusFilter === 'Raw Footage Received' && !['Raw Footage Received', 'Verified Footage', 'Footage Handover Verified'].includes(stageNorm)) return false;

        // Custom stats click metrics
        if (statusFilter === 'New Orders') {
          if (o.current_stage !== 'Order Confirmed' && o.current_stage !== 'New Order Received') return false;
        }
        if (statusFilter === "Today's Events") {
          const lead = findLeadForOrder(o, leads || []);
          const orderEvents = getOrderEventsList(o, lead);
          const hasTodayEvent = orderEvents.some((ev) => isEventWithinDateRange(ev.event_date, 'Today'));
          if (!hasTodayEvent) return false;
        }
        if (statusFilter === 'Scheduled Events' && o.current_stage !== 'Event Scheduled') return false;
        if (statusFilter === 'Pending Assignments') {
          if (o.current_stage !== 'Operations Assigned' && !(o.current_stage === 'Order Confirmed' && !isStaffAssigned)) return false;
        }
        if (statusFilter === 'Completed' && !isCompletedEvent(o)) return false;
        
        if (statusFilter === 'Pending' && (o.current_stage !== 'Order Confirmed' && o.current_stage !== 'Operations Assigned')) return false;
        if (statusFilter === 'Raw Footage Pending') {
          const rf = rawFootage ? rawFootage.find(f => f.order_id === o.order_id) : null;
          const isMatch = o.current_stage === 'Event Completed' && (!rf || !rf.raw_received || rf.ingest_status === 'Pending');
          if (!isMatch) return false;
        }
        if (statusFilter === 'Ready for Production') {
          const isMatch = ['Raw Footage Received', 'Editor Assigned', 'Editing Started'].includes(o.current_stage);
          if (!isMatch) return false;
        }
      }

      // 2. Date Filter based on actual Event Date
      if (dateFilter !== 'All') {
        const lead = findLeadForOrder(o, leads || []);
        const orderEvents = getOrderEventsList(o, lead);
        const hasMatchingEvent = orderEvents.some((ev) =>
          isEventWithinDateRange(ev.event_date, dateFilter, customStartDate, customEndDate)
        );
        if (!hasMatchingEvent) {
          return false;
        }
      }

      return true;
    });
  }, [
    orders,
    operationsOrders,
    searchTerm,
    statusFilter,
    dateFilter,
    customStartDate,
    customEndDate,
    staffAssignments,
    rawFootage,
    operations,
    leads
  ]);

  // Sorted list implementation with 3-state column sorting (Order ID, Event Date, Reporting Time)
  const sortedOrders = useMemo(() => {
    const list = [...filteredOrders];

    if (!sortColumn) {
      return list.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA; // Newest first
      });
    }

    return list.sort((a, b) => {
      // 1. ORDER ID: Click 1 -> Ascending, Click 2 -> Descending, Click 3 -> Reset
      if (sortColumn === 'order_id') {
        const idA = String(a.order_id || '').trim();
        const idB = String(b.order_id || '').trim();
        if (idA && idB) {
          const comp = compareAlphanumeric(idA, idB);
          if (comp !== 0) {
            return sortDirection === 'asc' ? comp : -comp;
          }
        } else if (idA) {
          return sortDirection === 'asc' ? -1 : 1;
        } else if (idB) {
          return sortDirection === 'asc' ? 1 : -1;
        }
        return compareRecordsByDate(a, b, sortDateOrder);
      }

      // 2. REPORTING DATE: Click 1 -> Oldest to Newest, Click 2 -> Newest to Oldest, Click 3 -> Reset
      if (sortColumn === 'reporting_date') {
        const leadA = findLeadForOrder(a, leads || []);
        const leadB = findLeadForOrder(b, leads || []);
        const opA = getOpDetails(a.order_id);
        const opB = getOpDetails(b.order_id);
        const tsA = getOrderPrimaryReportingTimestamp(a, leadA, opA);
        const tsB = getOrderPrimaryReportingTimestamp(b, leadB, opB);

        if (tsA > 0 && tsB > 0 && tsA !== tsB) {
          return sortDirection === 'asc' ? tsA - tsB : tsB - tsA;
        }
        if (tsA > 0) return -1;
        if (tsB > 0) return 1;
        return compareRecordsByDate(a, b, sortDateOrder);
      }



      return compareRecordsByDate(a, b, sortDateOrder);
    });
  }, [filteredOrders, sortColumn, sortDirection, sortDateOrder, staffAssignments, leads, operations]);

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.role === 'operations') {
        const targetId = e.detail.orderId || e.detail.leadId;
        let order = orders.find(o => 
          (targetId && (o.order_id === targetId || o.lead_id === targetId)) ||
          (e.detail.orderId && (o.order_id === e.detail.orderId || o.lead_id === e.detail.orderId)) ||
          (e.detail.leadId && (o.order_id === e.detail.leadId || o.lead_id === e.detail.leadId))
        );
        if (!order && targetId) {
          const lead = leads?.find(l => l.lead_id === targetId || l.order_id === targetId);
          if (lead) {
            order = {
              order_id: lead.order_id || targetId,
              lead_id: lead.lead_id,
              customer_name: lead.customer_name || '',
              mobile: lead.mobile || lead.whatsapp_number || '',
              event_type: lead.custom_event_name || lead.event_type || 'Event Shoot',
              event_date: lead.event_date || lead.Reporting_date || '',
              event_time: lead.event_start_time || '',
              current_stage: (lead.status as any) || 'Order Confirmed',
              quotation_amount: lead.quotation_amount || 0,
              advance_received: lead.advance_received || 0,
              balance_amount: (lead.quotation_amount || 0) - (lead.advance_received || 0),
              created_at: lead.created_at || new Date().toISOString()
            };
          }
        }
        if (order) {
          startAssigning(order);
        }
      }
    };
    window.addEventListener('calendar-action-click', handler);
    window.addEventListener('calendar-action-click-deferred', handler);
    return () => {
      window.removeEventListener('calendar-action-click', handler);
      window.removeEventListener('calendar-action-click-deferred', handler);
    };
  }, [orders, leads, rawFootage, staffAssignments, operations, staff, leadPackages]);
  
  const startAssigning = (order: Order) => {
    setAssignValidationError(null);
    const op = getOpDetails(order.order_id);
    const rf = rawFootage ? rawFootage.find(f => f.order_id === order.order_id) : null;
    
    // Check if this is a brand new assignment (Order Confirmed stage means it has not been assigned yet)
    const isNewAssignment = order.current_stage === 'Order Confirmed';

    // REQUIRED FIX: Do NOT pre-select any staff. Staff selection must always be blank.
    setActiveAssignments([]);

    const targetLead = leads?.find(l => l.lead_id === order.lead_id);
    const targetLeadPkgs = leadPackages?.filter(lp => lp.lead_id === order.lead_id) || [];
    
    // Calculate expected roles for loading
    const teamMembersConfig = extractTeamMembersConfig(targetLead, targetLeadPkgs);

    const initialAllocations = buildInitialEventAllocations({
      lead: targetLead,
      targetLead,
      leadPkgs: targetLeadPkgs,
      targetLeadPkgs,
      order,
      existingStaffAssignments: staffAssignments || [],
      staffAssignments: staffAssignments || [],
      staffList: staff || [],
      operationsRecord: op
    });

    setEventAllocations(initialAllocations);
    setEquipmentSearchQueryByEvent({});
    setIsEquipmentDropdownOpenByEvent({});
    setSelectedStaffByEvent({});

    setAssignForm({
      photographer_assigned: '',
      videographer_assigned: '',
      drone_operator_assigned: '',
      assistant_assigned: '',
      equipment_kit: isNewAssignment ? '' : (op?.equipment_kit || ''),
      reporting_time: order.reporting_time || op?.reporting_time || '08:00',
      remarks: isNewAssignment ? '' : (op?.remarks || ''),
      event_status: 'Event Scheduled',
      current_stage: order.current_stage || 'Event Scheduled',
      raw_footage_link: isNewAssignment ? '' : (rf?.server_path || ''),
      event_date: order.event_date || op?.event_date || '',
      event_time: order.event_time || op?.event_time || ''
    });
    setAssigningOrderId(order.order_id);
    loadEquipment();
    
    // Initialize selectedKits
    const kits = isNewAssignment ? [] : parseEquipmentKit(op?.equipment_kit);
    setSelectedKits(kits);
    setEquipmentSearchQuery('');
    setIsEquipmentDropdownOpen(false);
    
    // Default selected values
    setSelectedRole('Lead Photographer');
    setSelectedStaff('');
  };

  useEffect(() => {
    if (assigningOrderId) {
      triggerAutoScrollAndFocus('#assign_staff_modal', 150);
    }
  }, [assigningOrderId]);

  useEffect(() => {
    if (receivingFootageOrderId) {
      triggerAutoScrollAndFocus('#raw_footage_modal', 150);
    }
  }, [receivingFootageOrderId]);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningOrderId || isSaving) return;
    
    setIsSaving(true);

    try {
      // Validate required fields
    const hasAnyAllocations = Object.values(eventAllocations).some((alloc: any) => alloc.staff && alloc.staff.length > 0);
    if (activeAssignments.length === 0 && !hasAnyAllocations) {
      alert("Please assign at least one staff member.");
      setIsSaving(false);
      return;
    }
    if (!assignForm.event_date) {
      alert("Please select an event date.");
      setIsSaving(false);
      return;
    }
    if (!assignForm.reporting_time) {
      alert("Please select a reporting time.");
      setIsSaving(false);
      return;
    }

    // Equipment Availability Validation for the current assignment
    for (const [evId, alloc] of Object.entries(eventAllocations)) {
      const staffList = (alloc as any).staff || [];
      for (const st of staffList) {
        const eqList = st.equipment || [];
        for (const kitName of eqList) {
          if (!kitName || !kitName.trim()) continue;
          const cleanKit = kitName.trim().toLowerCase();

          const found = (equipment || []).find((eq: any) => {
            const eqName = String(eq.equipment_name || eq.name || eq.Equipment_Name || '').trim().toLowerCase();
            const eqId = String(eq.equipment_id || eq.id || '').trim().toLowerCase();
            return eqName === cleanKit || eqId === cleanKit;
          });
          if (found && (found.status === 'Under Maintenance' || found.status === 'Damaged' || found.status === 'Inactive' || found.status === 'Retired')) {
            alert(`Equipment "${kitName}" is currently ${found.status} in inventory.`);
            setIsSaving(false);
            return;
          }
          
          // Find the exact event to get its time
          const ev = parentLeadInstance?.events?.find((e: any) => e.id === evId);
          const tDate = ev?.event_date || assignForm.event_date;
          const tStart = ev?.event_start_time || ev?.reporting_time;
          const tEnd = ev?.event_end_time;
          
          const availability = checkEquipmentAvailability(kitName, assigningOrderId, tDate, tStart, tEnd);
          if (availability.isBusy) {
            let conflictMsg = `⚠️ Cannot Assign "${kitName}"\n\nIt is currently busy / assigned to another active order during the requested time:\n${tDate || 'Unknown Date'} ${tStart || '?'} - ${tEnd || '?'}\n\n`;
            if (availability.conflicts && availability.conflicts.length > 0) {
              conflictMsg += "Conflicts:\n";
              availability.conflicts.forEach((c: any) => {
                conflictMsg += `- Staff: ${c.staffName}, Event: ${c.eventName}, Time: ${c.startTime || '?'} - ${c.endTime || '?'}\n`;
              });
            }
            alert(conflictMsg);
            setIsSaving(false);
            return;
          }
        }
      }
    }
    const allAssignedEquipment = Array.from(
      new Set(
        Object.values(eventAllocations).flatMap((alloc: any) =>
          alloc.staff?.flatMap((st: any) => st.equipment || []) || []
        )
      )
    ) as string[];

    setAssignValidationError(null);
    setValidationAttempted(false);
    let overallMissingStaff = false;
    if (parentLeadInstance?.events) {
       const targetLeadPkgs = leadPackages?.filter(lp => lp.lead_id === parentLeadInstance?.lead_id) || [];
       const teamMembersConfig = extractTeamMembersConfig(parentLeadInstance, targetLeadPkgs);
       const totalEvents = parentLeadInstance.events.length;

       for (let index = 0; index < parentLeadInstance.events.length; index++) {
          const ev = parentLeadInstance.events[index];
          const evId = ev.id || '';
          if (!evId) continue;
          
          const allocStaff = eventAllocations[evId]?.staff || [];
          const validAllocStaff = allocStaff.filter((s: any) => s.staff_name && s.staff_name.trim() !== '');
          
          const includedRoles = getEventRolesForEvent(ev, index, teamMembersConfig, totalEvents);
          
          if (includedRoles.length > 0) {
            const tasksMap = new Map<string, { roleName: string; targetQty: number }>();
            includedRoles.forEach((roleStr: string) => {
              const { qty, text } = parseQtyAndText(roleStr);
              const roleName = (text || roleStr).trim();
              if (!roleName) return;
              if (tasksMap.has(roleName)) {
                tasksMap.get(roleName)!.targetQty += (qty || 1);
              } else {
                tasksMap.set(roleName, { roleName, targetQty: qty || 1 });
              }
            });

            let isMissingStaff = false;
            for (const task of Array.from(tasksMap.values())) {
              const assignedCount = validAllocStaff.filter((s: any) => 
                (s.staff_role || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase() === task.roleName.trim().toLowerCase()
              ).length;
              if (assignedCount < task.targetQty) {
                isMissingStaff = true;
                break;
              }
            }

            if (isMissingStaff) {
                overallMissingStaff = true;
            }
          }

          // Validate staff uniqueness within this event: The same staff member can be assigned ONLY ONCE per event
          const staffNamesInEvent = validAllocStaff.map((s: any) => (s.staff_name || '').trim().toLowerCase()).filter(Boolean);
          const duplicateStaffInEvent = staffNamesInEvent.filter((name, idx) => staffNamesInEvent.indexOf(name) !== idx);
          if (duplicateStaffInEvent.length > 0) {
            setValidationAttempted(true);
            const dupName = validAllocStaff.find((s: any) => (s.staff_name || '').trim().toLowerCase() === duplicateStaffInEvent[0])?.staff_name || duplicateStaffInEvent[0];
            setAssignValidationError(`Staff member "${dupName}" is assigned more than once for this event. Within one event, a staff member can be assigned only once.`);
            setCollapsedAssignEvents(prev => ({ ...prev, [evId]: false }));
            setTimeout(() => {
              const el = document.getElementById(`assign-event-${evId}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-2', 'ring-red-500', 'ring-offset-2', 'ring-offset-zinc-950');
                setTimeout(() => el.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2', 'ring-offset-zinc-950'), 3000);
              }
            }, 100);
            return;
          }

          // NEW: Validate duplicate equipment per event
          const allocStaffForEq = eventAllocations[evId]?.staff || [];
          const equipmentCounts: Record<string, number> = {};
          allocStaffForEq.forEach((s: any) => {
             (s.equipment || []).forEach((eq: string) => {
                equipmentCounts[eq] = (equipmentCounts[eq] || 0) + 1;
             });
          });
          const duplicates = Object.keys(equipmentCounts).filter(eq => equipmentCounts[eq] > 1);
          if (duplicates.length > 0) {
              setValidationAttempted(true);
              setAssignValidationError(`This equipment is already assigned to another staff member for this event: ${duplicates.join(', ')}`);
              
              setCollapsedAssignEvents(prev => ({ ...prev, [evId]: false }));
              
              setTimeout(() => {
                const el = document.getElementById(`assign-event-${evId}`);
                if (el) {
                   el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                   el.classList.add('ring-2', 'ring-red-500', 'ring-offset-2', 'ring-offset-zinc-950');
                   setTimeout(() => el.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2', 'ring-offset-zinc-950'), 3000);
                }
              }, 100);
              return;
          }
       }
    }

     // Collect ALL assigned staff across all events into activeAssignments so they are recorded correctly per event
      const allAssignedStaff: { 
        assignment_id?: string;
        staff_role: string; 
        staff_id: string; 
        staff_name: string; 
        mobile?: string;
        staff_type?: string;
        equipment?: string[]; 
        task_id?: string;
        slot_number?: number;
        event_id?: string; 
        event_name?: string;
        task_status?: string;
        assignment_status?: string;
      }[] = [];
      Object.entries(eventAllocations).forEach(([evId, alloc]: [string, any]) => {
        const evMatch = parentLeadInstance?.events?.find((e: any) => e.id === evId);
        const evName = evMatch?.event_name || evMatch?.event_type || '';

        if (alloc.staff && alloc.staff.length > 0) {
          alloc.staff.forEach((st: any, stIdx: number) => {
            if (st.staff_name && st.staff_name.trim() !== '') {
               const stSlotNum = Number(st.slot_number || (stIdx + 1));
               const evIdx = parentLeadInstance?.events?.findIndex((e: any) => e.id === evId) || 0;
               const cleanRole = (st.staff_role || 'Staff').replace(/[\uFEFF]+/g, '').trim();
               const stRole = cleanRole + getEventRolePadding(evIdx, stSlotNum);
               const stAssignId = st.assignment_id || (st.id && !st.id.startsWith('slot_') ? st.id : generateDeterministicAssignmentId(assigningOrderId, evId, cleanRole, stSlotNum));
               const stTaskId = st.task_id || generateDeterministicTaskId(assigningOrderId, evId, cleanRole, stSlotNum);
               allAssignedStaff.push({
                 assignment_id: stAssignId,
                 task_id: stTaskId,
                 slot_number: stSlotNum,
                 staff_role: stRole,
                 staff_id: st.staff_id,
                 staff_name: st.staff_name,
                 mobile: st.mobile || '',
                 staff_type: st.staff_type || 'In-House',
                 equipment: st.equipment || [],
                 event_id: evId,
                 event_name: evName || st.event_name || '',
                 task_status: st.task_status || 'Pending',
                 assignment_status: st.assignment_status || 'Assigned'
               });
            }
          });
        }
      });

      // Gather all selected equipment across all events into a JSON string to preserve exact task-to-equipment mappings
      const kitMapping = allAssignedStaff.map(st => ({
        event_id: st.event_id,
        assignment_id: st.assignment_id,
        staff_name: st.staff_name,
        staff_role: st.staff_role,
        equipment: st.equipment || []
      }));
      const consolidatedEquipKit = JSON.stringify(kitMapping);
      
      // Update lead events with assigned staff AND event-specific equipment
      const baseMatchedOrder = orders.find(o => o.order_id === assigningOrderId);
      let updatedEvents: any[] | undefined = undefined;
      if (baseMatchedOrder?.lead_id && parentLeadInstance) {
        updatedEvents = (parentLeadInstance.events || []).map((ev: any, evIndex: number) => {
          const evId = String(ev.id || ev.event_id || `ev_${evIndex}`);
          const alloc = eventAllocations[evId] || eventAllocations[ev.id || ''] || Object.values(eventAllocations)[evIndex];
          if (alloc && alloc.staff) {
            const validStaff = alloc.staff.filter((s: any) => s.staff_name && s.staff_name.trim() !== '');
            const staffNames = validStaff.map((s: any) => s.staff_name).join(', ');
            const staffMobiles = validStaff.map((s: any) => s.mobile || '').join(', ');

            const staffEquipments = validStaff.map((s: any) => s.equipment || []);
            const finalStaffMobiles = staffMobiles + ' || EQUIPMENT: JSON:' + JSON.stringify(staffEquipments);

            return {
              ...ev,
              assigned_staff_names: staffNames,
              assigned_staff_mobiles: finalStaffMobiles
            };
          }
          return ev;
        });
      }

      // Save the multi-staff role assignments to Supabase & Context state!
      const finalAssignments = allAssignedStaff.length > 0 ? allAssignedStaff : activeAssignments;

      // RULE: ONCE A TASK HAS STARTED, ITS ASSIGNMENT MUST BE LOCKED.
      // Re-verify against latest DB state and active memory assignments
      let currentAssignmentsInDb = (staffAssignments || []).filter(sa => sa.order_id === assigningOrderId);
      if (supabaseClient) {
        try {
          const { data: dbData } = await supabaseClient
            .from('staff_assignments')
            .select('*')
            .eq('order_id', assigningOrderId);
          if (dbData && Array.isArray(dbData)) {
            currentAssignmentsInDb = dbData;
          }
        } catch (fetchErr) {
          console.warn('[OperationsLeads] Could not re-fetch staff assignments from DB for lock validation:', fetchErr);
        }
      }

      const startedDbAssignments = currentAssignmentsInDb.filter(isOperationsAssignmentStarted);
      for (const started of startedDbAssignments) {
        const matchingNew = finalAssignments.find(fa => isSameAssignmentSlot(fa, started));
        if (!matchingNew) {
          alert("This task has already started and cannot be reassigned.");
          setIsSaving(false);
          return;
        }
        const origName = (started.staff_name || '').trim().toLowerCase();
        const newName = (matchingNew.staff_name || '').trim().toLowerCase();
        if (origName && newName && origName !== newName) {
          alert("This task has already started and cannot be reassigned.");
          setIsSaving(false);
          return;
        }
      }

      const matchedOrder = orders.find(o => o.order_id === assigningOrderId);
      const targetLeadPkgs = leadPackages?.filter(lp => lp.lead_id === parentLeadInstance?.lead_id) || [];

      // Calculate assignment completion using strict requirements logic:
      // Status changes to "Assigned Crew" ONLY when ALL required tasks/slots are assigned.
      const assignmentStats = calculateOrderAssignmentStats({
        lead: parentLeadInstance,
        order: matchedOrder,
        leadPkgs: targetLeadPkgs,
        eventAllocations: eventAllocations
      });

      const currentOrderStage = matchedOrder?.current_stage || 'Order Confirmed';
      const advancedStages = [
        'Event Started', 'Event Completed', 'Event Ended', 'Footage Handover',
        'Verified Footage', 'Footage Handover Verified', 'Raw Footage Received',
        'Editor Assigned', 'Editing Started', 'Editing In Progress',
        'Internal QC Review', 'Client Review Sent', 'Internal Review',
        'Client Review', 'Revision Required', 'Revision In Progress',
        'Revision', 'Final Approval', 'Ready for Delivery',
        'Delivered', 'Completed', 'Closed', 'Project Closed', 'Project Delivered'
      ];

      let targetStage: CurrentStage;
      if (advancedStages.includes(currentOrderStage)) {
        targetStage = currentOrderStage as CurrentStage;
      } else if (assignmentStats.isFullyAssigned) {
        targetStage = 'Assigned Crew';
      } else {
        targetStage = 'Order Confirmed';
      }

      // Collect equipment updates & equipment history inserts
      const equipmentUpdates: { equipmentId: string; status: string }[] = [];
      const equipmentHistoryInserts: any[] = [];

      if (equipment) {
        const op = getOpDetails(assigningOrderId);
        let previousKitsFromOp: string[] = [];
        if (op?.equipment_kit) {
           try {
              const parsed = JSON.parse(op.equipment_kit);
              if (Array.isArray(parsed)) {
                 parsed.forEach((k: any) => {
                    if (Array.isArray(k.equipment)) {
                       k.equipment.forEach((e: string) => previousKitsFromOp.push(e));
                    }
                 });
              }
           } catch (e) {
              previousKitsFromOp = op.equipment_kit.split(',').map((s: string) => s.trim()).filter(Boolean);
           }
        }
        const previousKitsFromAssignments = (staffAssignments || [])
          .filter(sa => sa.order_id === assigningOrderId)
          .flatMap(sa => Array.isArray(sa.equipment) ? sa.equipment : (typeof sa.equipment === 'string' ? [sa.equipment] : []));
        const previousKitsFromHistory = (leadEquipmentHistory || [])
          .filter(h => h.order_id === assigningOrderId && !h.returned_at && h.equipment_status !== 'Returned')
          .map(h => h.equipment_name);
        
        const allPreviousKits = Array.from(new Set([...previousKitsFromOp, ...previousKitsFromAssignments, ...previousKitsFromHistory]));
        const removedKits = allPreviousKits.filter(pk => !allAssignedEquipment.some(a => a.toLowerCase() === pk.toLowerCase()));
        
        for (const kitStr of removedKits) {
          const found = equipment.find(eq => eq.equipment_name.toLowerCase() === kitStr.toLowerCase());
          if (found) {
            const stillUsedElsewhere = isEquipmentBusy(kitStr, assigningOrderId);
            if (!stillUsedElsewhere) {
              equipmentUpdates.push({ equipmentId: found.equipment_id, status: 'Available' });
            }
            
            // Record Return in lead_equipment_history
            const matchedOrd = orders.find(o => o.order_id === assigningOrderId);
            equipmentHistoryInserts.push({
              lead_id: matchedOrd?.lead_id || 'UNKNOWN',
              order_id: assigningOrderId,
              equipment_name: found.equipment_name,
              equipment_status: 'Returned',
              returned_by: currentUserName || 'Operations Team',
              returned_at: new Date().toISOString(),
              remarks: `Released from order ${assigningOrderId} by ${currentUserName || 'Operations Team'}`
            });
          }
        }

        for (const kitStr of allAssignedEquipment) {
          const found = equipment.find(eq => eq.equipment_name.toLowerCase() === kitStr.toLowerCase());
          if (found) {
            equipmentUpdates.push({ equipmentId: found.equipment_id, status: 'Assigned' });
            
            // Record Assignment History if not already recorded as active for this order
            const matchedOrd = orders.find(o => o.order_id === assigningOrderId);
            const alreadyActiveHistory = (leadEquipmentHistory || []).some(h => 
              h.order_id === assigningOrderId && 
              h.equipment_name.toLowerCase() === kitStr.toLowerCase() && 
              !h.returned_at && 
              h.equipment_status !== 'Returned'
            );
            if (!alreadyActiveHistory) {
              equipmentHistoryInserts.push({
                lead_id: matchedOrd?.lead_id || 'UNKNOWN',
                order_id: assigningOrderId,
                equipment_name: found.equipment_name,
                equipment_status: 'Assigned',
                remarks: `Assigned to order ${assigningOrderId} by ${currentUserName || 'Operations Team'}`
              });
            }
          }
        }
      }

      console.log("Saving assignment for order:", assigningOrderId, {
        equipment: consolidatedEquipKit,
        reporting_time: convertTimeToDbFormat(assignForm.reporting_time),
        assignmentStats,
        targetStage
      });

      // Save assignments, lead updates, operations updates, equipment and history in one parallel operation
      await saveStaffAssignments(assigningOrderId, finalAssignments, targetStage, {
        updatedEvents,
        equipmentKit: consolidatedEquipKit,
        reportingTime: convertTimeToDbFormat(assignForm.reporting_time),
        eventDate: assignForm.event_date,
        eventTime: convertTimeToDbFormat(assignForm.event_time),
        remarks: assignForm.remarks,
        equipmentUpdates,
        equipmentHistoryInserts
      });

      if (typeof refreshData === 'function') {
        refreshData();
      }

      if (matchedOrder) {
        setWhatsappShareModalData({
          orderId: assigningOrderId,
          order: { ...matchedOrder, current_stage: targetStage },
          staffNames: Array.from(new Set(finalAssignments.map(a => a.staff_name))),
          eventAllocations: eventAllocations,
          lead: parentLeadInstance,
          finalAssignments: finalAssignments
        });
      }

      setAssigningOrderId(null);
      
    } catch (e: any) {
      console.error("Failed to save assignment:", e);
      if (e.message && (
        e.message.includes('Invalid event status being sent to database') ||
        e.message.includes('operations_event_status_check') ||
        e.message.includes('violates check constraint') ||
        e.message.includes('status_check')
      )) {
        alert("Invalid event status being sent to database.");
      } else {
        alert("Unable to save assignment. Error: " + (e.message || "Please try again."));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const getStaffForRole = (role: string) => {
    const filtered = staff ? staff.filter(s => {
      const sRole = s.role.toLowerCase();
      const isActive = s.status === 'Active';
      if (!isActive) return false;
      
      if (role === 'Lead Photographer') return sRole.includes('lead') && sRole.includes('photo');
      if (role === 'Associate Photographer') return sRole.includes('associate') && sRole.includes('photo');
      if (role === 'Lead Videographer') return sRole.includes('lead') && sRole.includes('video');
      if (role === 'Drone & Aerial Operator') return sRole.includes('drone') || sRole.includes('aerial') || sRole.includes('operator');
      if (role === 'Production Assistant') return sRole.includes('assist') || sRole.includes('production');
      if (role === 'Post-Production Editor') return sRole.includes('editor') || sRole.includes('post');
      return false;
    }) : [];

    return filtered;
  };

  const triggerCompletionModal = (orderId: string) => {
    setServerPath(`s3://photocrew-vault-production/2026/${orderId}-shoot/raw/`);
    setClosingOrderId(orderId);

    // Initialize handoverStates for each assigned equipment item
    const op = getOpDetails(orderId);
    const kits = parseEquipmentKit(op?.equipment_kit);
    
    const initialHandovers: Record<string, {
      return_status: 'Returned' | 'Not Returned' | 'Damaged' | 'Missing';
      returned_by: string;
      return_date: string;
      notes: string;
    }> = {};
    
    kits.forEach((k: string) => {
      initialHandovers[k] = {
        return_status: 'Returned',
        returned_by: currentUserName || 'Operations Team',
        return_date: new Date().toISOString().split('T')[0],
        notes: ''
      };
    });
    setHandoverStates(initialHandovers);
  };

  const handleConfirmCompletion = () => {
    if (!closingOrderId) return;

    markEventCompleted(closingOrderId, serverPath);
    setClosingOrderId(null);
    alert(`Shoot marked completed for [${closingOrderId}]!`);
  };

  const stats = useMemo(() => {
    let newProjectArrived = 0;
    let assignedCrew = 0;
    let eventStarted = 0;
    let eventEnded = 0;
    let footageHandover = 0;
    let verifiedFootage = 0;

    orders.forEach(o => {
      // 1. If order or lead has reached Verified Footage (or downstream production stage), count ONLY in verifiedFootage
      if (isVerifiedFootageOrder(o)) {
        verifiedFootage++;
        return;
      }

      const lead = findLeadForOrder(o, leads || []);
      const assignedStaffDetails = getAssignedStaffDetailsForOrder(o);
      const staffStatuses = assignedStaffDetails.map(s => s.staff_status);
      const baseStage = (o.current_stage || (lead ? getLeadCurrentStatus(lead) : 'Order Confirmed')).trim();
      const calculatedStage = getCalculatedOrderStage(baseStage, staffStatuses).trim();
      const normStage = calculatedStage.toLowerCase();

      // 2. Exactly one mutually exclusive current status card per order
      if (
        normStage === 'verified footage' ||
        normStage === 'footage handover verified' ||
        normStage === 'raw footage received' ||
        getStageRank(calculatedStage) >= 4
      ) {
        verifiedFootage++;
      } else if (
        normStage === 'footage handover' ||
        normStage === 'equipment handover' ||
        normStage === 'equipment received' ||
        normStage === 'raw footage uploaded'
      ) {
        footageHandover++;
      } else if (
        normStage === 'event ended' ||
        normStage === 'event end' ||
        normStage === 'event completed' ||
        normStage === 'event complete'
      ) {
        eventEnded++;
      } else if (
        normStage === 'event started' ||
        normStage === 'event start' ||
        normStage === 'event starting'
      ) {
        eventStarted++;
      } else if (
        normStage === 'assigned crew' ||
        normStage === 'crew assigned' ||
        normStage === 'staff assigned' ||
        normStage === 'event scheduled' ||
        normStage === 'operations assigned'
      ) {
        assignedCrew++;
      } else {
        // Order Confirmed / Confirm Order / New Project Arrived / default new order stage
        newProjectArrived++;
      }
    });

    return {
      newProjectArrived,
      assignedCrew,
      eventStarted,
      eventEnded,
      footageHandover,
      verifiedFootage
    };
  }, [orders, operations, staffAssignments, leads]);

  const availableGearOptions = useMemo(() => {
    if (!equipment) return [];
    return equipment.map(eq => eq.equipment_name);
  }, [equipment]);

  const toggleSort = (field: 'event_date' | 'customer_name' | 'status' | 'assignment_date') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const renderSortIndicator = (field: 'event_date' | 'customer_name' | 'status' | 'assignment_date') => {
    if (sortBy !== field) return <span className="text-zinc-500 ml-1 select-none">↕</span>;
    return sortOrder === 'asc' 
      ? <span className="text-amber-500 ml-1 select-none">▲</span> 
      : <span className="text-amber-500 ml-1 select-none">▼</span>;
  };

  const getCompletionDate = (o: Order) => {
    const rf = rawFootage ? rawFootage.find(f => f.order_id === o.order_id) : null;
    if (rf && rf.created_at) {
      return rf.created_at.split('T')[0];
    }
    return o.updated_at ? o.updated_at.split('T')[0] : o.event_date || '—';
  };

  return (
    <div className="space-y-6">
      <AddNoteModal
        isOpen={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        leadId={noteModalLeadId}
        orderId={noteModalOrderId}
        customerName={noteModalCustomerName}
      />

      {/* 1. Results Summary Row - Operations Statuses (Verified Footage card visually hidden) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: "New Project Arrived", val: stats.newProjectArrived, theme: 'cyan' as CameraLensTheme, filterValue: 'Order Confirmed', trendText: 'New', chartPoints: [5, 12, 8, 15, 10, 20, 25] },
          { label: "Assigned Crew", val: stats.assignedCrew, theme: 'purple' as CameraLensTheme, filterValue: 'Assigned Crew', trendText: 'Rostered', chartPoints: [10, 18, 14, 25, 20, 31, 35] },
          { label: "Event Started", val: stats.eventStarted, theme: 'cyan' as CameraLensTheme, filterValue: "Event Started", trendText: 'Live On-Site', chartPoints: [5, 9, 7, 14, 11, 16, 15] },
          { label: "Event Ended", val: stats.eventEnded, theme: 'purple' as CameraLensTheme, filterValue: 'Event Ended', trendText: 'Wrapped', chartPoints: [8, 15, 12, 20, 16, 25, 24] },
          { label: "Footage Handover", val: stats.footageHandover, theme: 'red' as CameraLensTheme, filterValue: 'Footage Handover', trendText: 'Drive Upload', chartPoints: [2, 4, 1, 5, 3, 6, 2] },
          { label: "Verified Footage", val: stats.verifiedFootage, theme: 'green' as CameraLensTheme, filterValue: 'Verified Footage', trendText: 'Verified', chartPoints: [12, 19, 22, 28, 30, 35, 40], hidden: true },
        ].filter(card => !card.hidden).map((card, idx) => (
          <CameraLensStatsCard
            key={idx}
            label={card.label}
            val={card.val}
            theme={card.theme}
            trendText={card.trendText}
            subText="OPS MONITOR"
            chartPoints={card.chartPoints}
            activeFilterValue={statusFilter}
            currentFilterValue={card.filterValue}
            onClick={() => {
              setStatusFilter(statusFilter === card.filterValue ? 'All' : card.filterValue);
            }}
            lensLabel={card.label.toUpperCase()}
          />
        ))}
      </div>

      {/* Search & Simplified Filters Bar */}
      <div className="bg-zinc-950/40 rounded-2xl border border-zinc-850">
        {/* Mobile Toggle Button */}
        <div 
          className="md:hidden p-4 flex justify-between items-center cursor-pointer border-b border-zinc-800/50"
          onClick={() => setIsMobileFiltersExpanded(!isMobileFiltersExpanded)}
        >
          <span className="text-xs font-bold text-zinc-300 flex items-center gap-2">📁 LEADS DIRECTORY</span>
          <button className="text-[10px] uppercase font-mono font-bold text-zinc-400 hover:text-zinc-200 transition-colors">
            {isMobileFiltersExpanded ? '▲ Hide Filters' : '▼ Show Filters'}
          </button>
        </div>

        <div 
          className={`grid transition-all duration-300 ease-in-out ${
            isMobileFiltersExpanded 
              ? 'grid-rows-[1fr] opacity-100' 
              : 'grid-rows-[0fr] opacity-0 md:grid-rows-[1fr] md:opacity-100'
          }`}
        >
          <div className="overflow-hidden">
            <div className="p-4 pt-0 md:pt-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                {/* Search Box */}
                <div className="relative md:col-span-4 w-full">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    placeholder="Search by Customer Name, Order ID, Mobile Number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-550 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                {/* Date Filter Dropdown */}
                <div className="md:col-span-3 w-full">
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500/50 font-mono cursor-pointer"
                  >
                    <option value="All">All Dates (Reporting Date)</option>
                    <option value="Today">Today</option>
                    <option value="Tomorrow">Tomorrow</option>
                    <option value="This Week">This Week</option>
                    <option value="This Month">This Month</option>
                    <option value="Custom">Custom Date Range</option>
                  </select>
                </div>

                {/* Status Dropdown */}
                <div className="md:col-span-3 w-full">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500/50 font-mono cursor-pointer"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Order Confirmed">Order Confirmed</option>
                    <option value="Assigned Crew">Assigned Crew</option>
                    <option value="Event Started">Event Started</option>
                    <option value="Event Ended">Event Ended</option>
                    <option value="Footage Handover">Footage Handover</option>
                    <option value="Verified Footage">Verified Footage</option>
                    <option value="Event Cancelled">Event Cancelled</option>
                  </select>
                </div>

                {/* Sort Filter Button */}
                <div className="md:col-span-2 flex items-center justify-start md:justify-end">
                  <ListSortFilter value={sortDateOrder} onChange={setSortDateOrder} />
                </div>
              </div>

        {/* Custom Date Range pickers if custom is selected */}
        {dateFilter === 'Custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-900/30 text-xs animate-in slide-in-from-top-1 duration-150">
            <span className="text-[10px] uppercase font-mono font-bold text-zinc-500">Custom Range:</span>
            <div className="flex items-center gap-2">
              <div className="w-36">
                <DateFilterInput
                  value={customStartDate}
                  onChange={setCustomStartDate}
                  className="bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 px-2.5 py-1.5 rounded-lg font-mono focus:border-amber-500/40"
                />
              </div>
              <span className="text-zinc-650">—</span>
              <div className="w-36">
                <DateFilterInput
                  value={customEndDate}
                  onChange={setCustomEndDate}
                  className="bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 px-2.5 py-1.5 rounded-lg font-mono focus:border-amber-500/40"
                />
              </div>
            </div>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className="text-rose-450 hover:text-rose-400 font-mono text-[10px] uppercase font-bold cursor-pointer"
              >
                Clear Dates
              </button>
            )}
          </div>
        )}
            </div>
          </div>
        </div>
            {/* Main Board Table */}
      <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl overflow-x-auto shadow-xl">
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="border-b border-zinc-850 text-[10px] font-mono tracking-widest uppercase text-zinc-400 bg-zinc-950/70 select-none">
              <th className="p-4">
                <button
                  type="button"
                  onClick={() => handleColumnSort('order_id')}
                  className="inline-flex items-center gap-1.5 uppercase font-mono tracking-wider text-[10px] font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer select-none group"
                  title={
                    sortColumn === 'order_id'
                      ? sortDirection === 'asc'
                        ? 'Order ID: Ascending (Click for Descending)'
                        : 'Order ID: Descending (Click for Reset / Default)'
                      : 'Order ID: Click for Ascending'
                  }
                >
                  <span>Order ID</span>
                  <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'order_id' ? (sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400') : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                  {sortColumn === 'order_id' && (
                    <span className={`text-[10px] font-bold font-mono ${sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400'}`}>
                      {sortDirection === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </button>
              </th>
              <th className="p-4 font-bold">
                Customer Name
              </th>
              <th className="p-4 font-bold">Mobile Number</th>
              <th className="p-4 font-bold">Event Category</th>
              <th className="p-4 font-bold">Event Location</th>
              <th className="p-4 relative">
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('reporting_date')}
                    className="inline-flex items-center gap-1.5 uppercase font-mono tracking-wider text-[10px] font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer select-none group"
                    title={
                      sortColumn === 'reporting_date'
                        ? sortDirection === 'asc'
                          ? 'Reporting Date: Earliest to Latest (Click for Latest to Earliest)'
                          : 'Reporting Date: Latest to Earliest (Click for Reset / Default)'
                        : 'Reporting Date: Click for Earliest to Latest'
                    }
                  >
                    <span>Reporting Date</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'reporting_date' ? (sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400') : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                    {sortColumn === 'reporting_date' && (
                      <span className={`text-[10px] font-bold font-mono ${sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400'}`}>
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowReportingDateFilterDropdown(!showReportingDateFilterDropdown);
                    }}
                    className={`p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer ${dateFilter !== 'All' ? 'text-amber-400 bg-zinc-800/80' : 'text-zinc-400 hover:text-white'}`}
                    title="Filter by Reporting Date"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {showReportingDateFilterDropdown && (
                  <div className="absolute left-4 top-14 z-50 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-2.5 min-w-[180px] text-xs font-sans">
                    <div className="text-[10px] uppercase font-mono text-zinc-400 px-2 py-1 mb-1 border-b border-zinc-850">
                      Filter Reporting Date
                    </div>
                    <div className="space-y-1">
                      {[
                        { label: 'All Dates', value: 'All' },
                        { label: 'Today', value: 'Today' },
                        { label: 'Tomorrow', value: 'Tomorrow' },
                        { label: 'This Week', value: 'This Week' },
                        { label: 'This Month', value: 'This Month' },
                        { label: 'Custom Range', value: 'Custom' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setDateFilter(opt.value);
                            setShowReportingDateFilterDropdown(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg font-mono text-xs transition-colors flex items-center justify-between cursor-pointer ${
                            dateFilter === opt.value
                              ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                              : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {dateFilter === opt.value && <span className="text-amber-400">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </th>
              <th className="p-4 uppercase font-mono tracking-wider text-[10px] font-bold text-zinc-400">
                Reporting Time
              </th>
              <th className="p-4 font-bold">Assigned Team</th>
              <th className="p-4 font-bold">Current Stage</th>
              <th className="p-4 font-bold text-right text-zinc-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-850/60 text-xs">
            {(() => {
              const mainBoardList = sortedOrders;

              if (mainBoardList.length === 0) {
                return (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-zinc-500 italic">
                      No matching operations leads found.
                    </td>
                  </tr>
                );
              }

              return mainBoardList.map((ord) => {
                const op = getOpDetails(ord.order_id);
                const orderAssignments = staffAssignments ? staffAssignments.filter(sa => sa.order_id === ord.order_id) : [];

                // 1. Get current lead_id or order_id
                let assignmentsHistory = leadStaffAssignmentHistory ? leadStaffAssignmentHistory.filter(h => h.lead_id === ord.lead_id) : [];
                if (assignmentsHistory.length === 0) {
                  assignmentsHistory = leadStaffAssignmentHistory ? leadStaffAssignmentHistory.filter(h => h.order_id === ord.order_id) : [];
                }

                // 2. Load all current assignments for each role
                // A staff is considered assigned to a role if their latest history entry for that role is an assignment (not "unassigned" or empty)
                // However, the user wants "Display all assigned staff names".
                // If the history has multiple people for the same role, we should show them.
                const roleStaffMap = new Map<string, Set<string>>();
                
                // Sort history by date to process in order
                const sortedAssignments = [...assignmentsHistory].sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime());
                
                sortedAssignments.forEach(h => {
                  const role = h.assigned_role;
                  const staffName = h.assigned_staff?.trim();
                  
                  if (!roleStaffMap.has(role)) {
                    roleStaffMap.set(role, new Set());
                  }
                  
                  const staffSet = roleStaffMap.get(role)!;
                  
                  if (staffName && staffName.toLowerCase() !== 'unassigned' && staffName.toLowerCase() !== 'none' && staffName !== '') {
                    // Check if it's a comma-separated list of names
                    if (staffName.includes(',')) {
                      staffName.split(',').forEach(name => {
                        const trimmedName = name.trim();
                        if (trimmedName) staffSet.add(trimmedName);
                      });
                    } else {
                      staffSet.add(staffName);
                    }
                  } else {
                    // If "unassigned" or empty, we clear the set for this role? 
                    // Usually "unassigned" means removing staff. 
                    // But if we want to "Display all", maybe we just want the latest set.
                    // Let's assume "unassigned" clears the role.
                    staffSet.clear();
                  }
                });

                const crewNames: string[] = [];
                roleStaffMap.forEach((staffSet, role) => {
                  staffSet.forEach(name => {
                    crewNames.push(`${name} (${role})`);
                  });
                });

                const lead = findLeadForOrder(ord, leads || []);
                const assignedStaffDetails = getAssignedStaffDetailsForOrder(ord);
                const staffStatuses = assignedStaffDetails.map(s => s.staff_status);
                const isOrdVerified = ord.current_stage === 'Verified Footage' ||
                  lead?.status === 'Verified Footage' ||
                  lead?.current_status === 'Verified Footage' ||
                  getOpDetails(ord.order_id)?.event_status === 'Verified Footage';
                const baseStage = isOrdVerified ? 'Verified Footage' : (ord.current_stage || (lead ? getLeadCurrentStatus(lead) : 'Order Confirmed'));
                const currentStage = isOrdVerified ? 'Verified Footage' : getCalculatedOrderStage(baseStage, staffStatuses);
                const isLocked = currentStage === 'Raw Footage Received';

                // Extract exact event list for this specific order/lead, filtering by dateFilter if active
                const allOrderEvents = getOrderEventsList(ord, lead);
                const orderEvents = dateFilter === 'All'
                  ? allOrderEvents
                  : allOrderEvents.filter(ev => isEventWithinDateRange(ev.event_date, dateFilter, customStartDate, customEndDate));

                const clientMobile = ord.mobile || lead?.mobile || ord.whatsapp_number || lead?.whatsapp_number || '';

                return (
                  <tr key={ord.order_id} className={`hover:bg-zinc-900/20 transition-all ${isLocked ? 'opacity-85' : ''}`}>
                    <td className="p-4">
                      <span className="font-mono text-indigo-400 font-bold bg-slate-900/80 px-2 py-0.5 border border-slate-800 rounded">
                        {ord.order_id}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-zinc-100">
                      <div>{ord.customer_name}</div>
                    </td>
                    <td className="p-4 font-mono text-zinc-300 whitespace-nowrap text-xs">
                      {clientMobile ? (
                        <span>{clientMobile}</span>
                      ) : (
                        <span className="text-zinc-600 italic">—</span>
                      )}
                    </td>
                    <td className="p-4 text-zinc-300 font-sans">
                      {(() => {
                        const sorted = sortEventsNewestFirst(orderEvents);
                        if (sorted.length === 0) return <span className="text-zinc-600 italic">—</span>;

                        return (
                          <div className="flex flex-col gap-1 items-start">
                            {sorted.map((ev, evIdx) => {
                              const typeName = ev.event_type || ev.event_name || `Event ${evIdx + 1}`;
                              return (
                                <span key={ev.id || evIdx} className="font-semibold text-white">
                                  {typeName}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4 font-mono text-zinc-300 text-xs">
                      {(() => {
                        const sorted = sortEventsNewestFirst(orderEvents);
                        if (sorted.length === 0) return <span className="text-zinc-600 italic">—</span>;

                        return (
                          <div className="flex flex-col gap-1 items-start">
                            {sorted.map((ev, evIdx) => {
                              const loc = (ev.event_location || '').trim();
                              if (!loc) return <span key={ev.id || evIdx} className="text-zinc-600 italic">—</span>;
                              const isLink = isLocationUrl(loc);
                              return (
                                <div key={ev.id || evIdx} className="truncate max-w-[180px]">
                                  {isLink ? (
                                    <a
                                      href={getLocationUrlHref(loc)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-indigo-400 hover:text-indigo-300 underline font-sans text-xs block font-medium transition-colors"
                                      title={loc}
                                    >
                                      [Open Location Link]
                                    </a>
                                  ) : (
                                    <span className="text-zinc-200">
                                      {loc}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4 font-mono text-zinc-300 text-xs">
                      {(() => {
                        const sorted = sortEventsNewestFirst(orderEvents);
                        if (sorted.length === 0) return <span className="text-zinc-600 italic">—</span>;

                        return (
                          <div className="flex flex-col gap-1 items-start">
                            {sorted.map((ev, evIdx) => {
                              const rawDate = ev.reporting_date || ev.Reporting_date || ev.event_date || ord.event_date || ord.Reporting_date;
                              const formattedDate = formatOperationsEventDate(rawDate) || formatDateDDMMYY(rawDate) || rawDate || '—';
                              return (
                                <span key={ev.id || evIdx} className="font-semibold text-zinc-100">
                                  {formattedDate}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4 font-mono text-zinc-300 text-xs">
                      {(() => {
                        const sorted = sortEventsNewestFirst(orderEvents);
                        if (sorted.length === 0) return <span className="text-zinc-600 italic">—</span>;

                        return (
                          <div className="flex flex-col gap-1 items-start">
                            {sorted.map((ev, evIdx) => {
                              const rawTime = ev.reporting_time || ev.Reporting_time || ev.event_time || ev.event_start_time || ord.reporting_time || ord.event_time;
                              const formattedTime = rawTime ? formatTime12Hour(rawTime) : '—';
                              return (
                                <span key={ev.id || evIdx} className="font-semibold text-zinc-100">
                                  {formattedTime}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4 text-xs font-mono text-zinc-300">
                      {(() => {
                        const sorted = sortEventsNewestFirst(orderEvents);
                        if (sorted.length === 0) {
                          const assignedStaffNames = getAssignedStaffNamesForOrder(ord);
                          const count = assignedStaffNames.length;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setViewingStaffOrderId(ord.order_id);
                                setViewingStaffEventId(null);
                              }}
                              className={`px-2.5 py-1 rounded-lg font-bold font-mono text-xs transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer border ${
                                count > 0
                                  ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 border-indigo-500/25 hover:border-indigo-500/50'
                                  : 'bg-zinc-900/60 hover:bg-zinc-800/80 text-red-500 hover:text-red-400 border-zinc-800 hover:border-zinc-700'
                              }`}
                              title={count > 0 ? `Assigned Team: ${count}` : 'Unassigned'}
                            >
                              {count > 0 ? (
                                <>
                                  <span>👥</span>
                                  <span>{count}</span>
                                </>
                              ) : (
                                <span className="text-red-500 font-bold">Unassigned</span>
                              )}
                            </button>
                          );
                        }

                        return (
                          <div className="flex flex-col gap-1 items-start">
                            {sorted.map((ev, evIdx) => {
                              const evId = String(ev.id || ev.event_id || `ev_${evIdx}`);
                              const staffList = getStaffMembersForEvent(ord, ev, evIdx, sorted);
                              const count = staffList.length;

                              return (
                                <button
                                  key={ev.id || evIdx}
                                  type="button"
                                  onClick={() => {
                                    setViewingStaffOrderId(ord.order_id);
                                    setViewingStaffEventId(evId);
                                  }}
                                  className={`px-2.5 py-1 rounded-lg font-bold font-mono text-xs transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer border ${
                                    count > 0
                                      ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 border-indigo-500/25 hover:border-indigo-500/50'
                                      : 'bg-zinc-900/60 hover:bg-zinc-800/80 text-red-500 hover:text-red-400 border-zinc-800 hover:border-zinc-700'
                                  }`}
                                  title={count > 0 ? `Click to view team for ${ev.event_name || ev.event_type || `Event ${evIdx + 1}`} (${count} assigned)` : `Click to view team for ${ev.event_name || ev.event_type || `Event ${evIdx + 1}`} (Unassigned)`}
                                >
                                  {count > 0 ? (
                                    <>
                                      <span>👥</span>
                                      <span>{count}</span>
                                    </>
                                  ) : (
                                    <span className="text-red-500 font-bold">Unassigned</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4">
                      <StatusText status={currentStage} />
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {false && canEdit && !isLocked && (currentStage !== 'Order Confirmed' && currentStage !== 'New Order Received') && (
                          <select
                            value=""
                            disabled={isSaving}
                            onChange={async (e) => {
                              const newStatus = e.target.value;
                              if (!newStatus) return;
                              if (newStatus === 'Event Completed') {
                                try {
                                  setIsSaving(true);
                                  await markEventCompleted(ord.order_id, '');
                                  alert("Status Updated Successfully");
                                } catch (error) {
                                  alert(`Failed to update status: ${error}`);
                                } finally {
                                  setIsSaving(false);
                                }
                              } else if (newStatus === 'Footage Handover Verified' || newStatus === 'Raw Footage Received') {
                                const staffAssignmentsForOrder = staffAssignments?.filter(sa => sa.order_id === ord.order_id && sa.assignment_status !== 'Cancelled') || [];
                                const allCompleted = staffAssignmentsForOrder.length > 0 && staffAssignmentsForOrder.every(sa => sa.assignment_status === 'Event Completed' || (sa as any).task_status === 'Event Completed');
                                if (!allCompleted) {
                                  alert('Operation staff have not completed the event yet.');
                                  e.target.value = '';
                                  return;
                                }
                                setReceivingFootageOrderId(ord.order_id);
                                const existingRf = rawFootage?.find(f => f.order_id === ord.order_id);
                                const op = getOpDetails(ord.order_id);
                                setFootageForm({
                                  footage_link: op?.Raw_Footage_Drive_Link || op?.raw_footage_drive_link || ((existingRf && (existingRf.raw_received || existingRf.status === 'Received')) ? (existingRf.server_path || '') : ''),
                                  storage_type: 'Google Drive',
                                  upload_notes: ''
                                });
                                // Initialize footageHandoverStates for each assigned equipment item
                                const kits = parseEquipmentKit(op?.equipment_kit);
                                const initialHandovers: any = {};
                                kits.forEach((k: string) => {
                                  initialHandovers[k] = {
                                    return_status: 'Returned',
                                    returned_by: currentUserName,
                                    return_date: new Date().toISOString().split('T')[0],
                                    notes: ''
                                  };
                                });
                                setFootageHandoverStates(initialHandovers);
                              } else {
                                try {
                                  setIsSaving(true);
                                  await updateOrderStage(ord.order_id, newStatus as any);
                                  alert("Status Updated Successfully");
                                } catch (error: any) {
                                  alert(`Failed to update status: ${error.message}`);
                                } finally {
                                  setIsSaving(false);
                                }
                              }
                            }}
                            className="px-2 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-full text-[10px] font-mono font-bold cursor-pointer transition-all uppercase"
                          >
                            <option value="">▼ UPDATE STATUS</option>
                            <option value="Event Scheduled">Event Scheduled</option>
                            {/* Staff updates status automatically, but if admin needs override */}
                            <option value="Event Cancelled">Event Cancelled</option>
                            
                            {/* Footage Handover requires Event Completed stage first */}
                            {currentStage === 'Event Completed' && (
                              <option value="Footage Handover Verified">Verify Footage Handover</option>
                            )}
                          </select>
                        )}
                        {(() => {
                          const actionItems: { label: string; onClick: () => void }[] = [];
                          const assignedStaffNames = getAssignedStaffNamesForOrder(ord);

                          const hasWorkStarted = staffAssignments?.some(sa => sa.order_id === ord.order_id && sa.task_status && !['Assigned', 'Assigned Crew', 'Pending'].includes(sa.task_status)) || leadEquipmentHistory?.some(leh => leh.order_id === ord.order_id);

                          const stageNorm = (currentStage || '').toLowerCase().trim();

                          const isConfirmOrder = ['confirm order', 'order confirmed', 'new order received'].includes(stageNorm);
                          const isAssignedCrew = ['assigned crew', 'staff assigned', 'operations assigned', 'event scheduled'].includes(stageNorm);
                          const isEventStarted = ['event started', 'event start'].includes(stageNorm);
                          const isEventEnded = ['event ended', 'event end', 'event completed', 'event complete'].includes(stageNorm);
                          const isFootageHandover = ['footage handover', 'equipment handover'].includes(stageNorm);
                          const isVerifiedFootage = ['verified footage', 'footage handover verified', 'raw footage received', 'production handover', 'delivered', 'completed'].includes(stageNorm);

                          // Check if all assigned staff have uploaded raw footage links
                          const orderStaffAssignments = (staffAssignments || []).filter(sa => sa.order_id === ord.order_id && sa.assignment_status !== 'Cancelled');
                          let allStaffHaveFootage = false;
                          if (orderStaffAssignments.length > 0) {
                            allStaffHaveFootage = orderStaffAssignments.every(sa => {
                              let link = sa.raw_footage_link || '';
                              if (!link) {
                                const hist = (leadEquipmentHistory || []).find(h => 
                                  ((h.order_id && h.order_id === ord.order_id) || (ord.lead_id && h.lead_id === ord.lead_id)) &&
                                  h.returned_by?.toLowerCase() === sa.staff_name.toLowerCase() &&
                                  h.remarks
                                );
                                if (hist?.remarks) {
                                  try {
                                    const parsed = typeof hist.remarks === 'string' ? JSON.parse(hist.remarks) : hist.remarks;
                                    link = parsed.raw_footage_link || link;
                                  } catch (e) {}
                                }
                              }
                              return !!(link && link.trim());
                            });
                          }

                          // Common Handlers
                          const handleAssignCrew = () => {
                            startAssigning(ord);
                            setActiveMenuOrderId(null);
                          };

                          const handleViewDetails = () => {
                            setProjectDossierId(ord.order_id);
                            setActiveMenuOrderId(null);
                          };

                          const handleFootageModal = () => {
                            setReceivingFootageOrderId(ord.order_id);
                            const op = getOpDetails(ord.order_id);
                            const existingRf = rawFootage?.find(f => f.order_id === ord.order_id);
                            setFootageForm({
                              footage_link: op?.Raw_Footage_Drive_Link || op?.raw_footage_drive_link || ((existingRf && (existingRf.raw_received || existingRf.status === 'Received')) ? (existingRf.server_path || '') : ''),
                              storage_type: 'Google Drive',
                              upload_notes: ''
                            });

                            const kits = parseEquipmentKit(op?.equipment_kit);
                            const initialHandovers: Record<string, {
                              return_status: 'Returned' | 'Not Returned' | 'Damaged' | 'Missing';
                              returned_by: string;
                              return_date: string;
                              notes: string;
                            }> = {};
                            kits.forEach((k: string) => {
                              initialHandovers[k] = {
                                return_status: 'Returned',
                                returned_by: currentUserName || 'Operations Team',
                                return_date: new Date().toISOString().split('T')[0],
                                notes: ''
                              };
                            });
                            setFootageHandoverStates(initialHandovers);

                            setHardDiskReceived(false);
                            setMemoryCardReceived(false);

                            const existingPay = payments?.find(p => p.order_id === ord.order_id);
                            if (existingPay) {
                              if (existingPay.payment_collection_status) {
                                setPaymentCollectionStatus(existingPay.payment_collection_status as any);
                              } else {
                                if (existingPay.payment_status === 'Fully Paid') {
                                  setPaymentCollectionStatus('Full Payment Received');
                                } else if (existingPay.payment_status === 'Partially Paid') {
                                  setPaymentCollectionStatus('Partial Payment Received');
                                } else {
                                  setPaymentCollectionStatus('Payment Pending');
                                }
                              }
                              setAdditionalReceived(existingPay.additional_received || existingPay.final_payment_received || 0);
                            } else {
                              setPaymentCollectionStatus('Payment Pending');
                              setAdditionalReceived(0);
                            }

                            setActiveMenuOrderId(null);
                          };

                          const isFinishedOrClosed = isEventEnded || isFootageHandover || isVerifiedFootage || currentStage === 'Event Cancelled' || isLocked;

                          // 1. Crew Assignment / Reassignment
                          // Evaluated purely by this order's current assignment and stage
                          if (!isFinishedOrClosed) {
                            if (assignedStaffNames.length > 0 || isAssignedCrew) {
                              actionItems.push({
                                label: 'Reassign Crew',
                                onClick: handleAssignCrew
                              });
                            } else {
                              actionItems.push({
                                label: 'Assign Crew',
                                onClick: handleAssignCrew
                              });
                            }
                          }

                          // 2. When Current Status = Footage Handover or Event Completed
                          // 3. View/Add Note
                          if (!actionItems.some(i => i.label === 'VIEW/ADD NOTE' || i.label === 'Add Note')) {
                            actionItems.push({
                              label: 'VIEW/ADD NOTE',
                              onClick: () => {
                                setNoteModalLeadId(ord.lead_id);
                                setNoteModalOrderId(ord.order_id);
                                setNoteModalCustomerName(ord.customer_name || '');
                                setNoteModalOpen(true);
                                setActiveMenuOrderId(null);
                              }
                            });
                          }
                          
                          if (isFootageHandover || currentStage === 'Event Completed') {
                            actionItems.push({
                              label: 'Upload Final Footage',
                              onClick: handleFootageModal
                            });
                          }

                          // Extra utilities if applicable
                          if (assignedStaffNames.length > 0 && !actionItems.some(i => i.label === 'Share via WhatsApp')) {
                            actionItems.push({
                              label: 'Share via WhatsApp',
                              onClick: () => {
                                const leadForOrd = leads.find(l => l.lead_id === ord.lead_id);
                                setWhatsappShareModalData({
                                  orderId: ord.order_id,
                                  order: ord,
                                  staffNames: assignedStaffNames,
                                  lead: leadForOrd
                                });
                                setActiveMenuOrderId(null);
                              }
                            });
                          }

                          if (canEdit && !isLocked && currentStage !== 'Event Cancelled' && !actionItems.some(i => i.label === 'Cancel Event')) {
                            actionItems.push({
                              label: 'Cancel Event',
                              onClick: async () => {
                                if (confirm("Are you sure you want to cancel this event?")) {
                                  try {
                                    setIsSaving(true);
                                    await updateOrderStage(ord.order_id, 'Event Cancelled');
                                    alert("Event Cancelled successfully");
                                  } catch (error: any) {
                                    alert(`Failed to cancel event: ${error.message}`);
                                  } finally {
                                    setIsSaving(false);
                                    refreshData();
                                  }
                                }
                                setActiveMenuOrderId(null);
                              }
                            });
                          }

                          const isOpen = activeMenuOrderId === ord.order_id;
                          return (
                            <OperationsActionColumn
                              ord={ord}
                              actionItems={actionItems}
                              isOpen={isOpen}
                              setActiveMenuOrderId={setActiveMenuOrderId}
                              setMenuCoords={setMenuCoords}
                              setActiveMenuItems={setActiveMenuItems}
                            />
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })
            })()}
          </tbody>
        </table>
      </div>    </div>

      {/* Slide-over or Inline modal for Crew and Equipment Assignment */}
      {assigningOrderId && createPortal(
        <div 
          className="fixed inset-0 bg-zinc-950 z-[150] flex flex-col w-full h-[100dvh] overflow-hidden overscroll-none animate-in slide-in-from-bottom-4 fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAssigningOrderId(null);
          }}
        >
          <div id="assign_staff_modal" className="bg-zinc-900 w-full h-full flex-1 flex flex-col min-h-0 max-h-full shadow-2xl relative overflow-hidden text-left max-w-full min-w-0">
            <div className="p-4 sm:px-6 sm:py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/95 backdrop-blur-md shrink-0 z-30 max-w-full min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span className="p-1 px-2.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-500 text-xs font-bold font-mono shrink-0">Operations</span>
                <h3 className="text-sm sm:text-base font-sans font-black text-white truncate">
                  Project Staffing & Handover Dossier ~ {assigningOrderId}
                </h3>
              </div>
              <button 
                onClick={() => setAssigningOrderId(null)}
                className="text-zinc-400 hover:text-white font-bold cursor-pointer transition-colors p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-sm ml-2 shrink-0 flex items-center justify-center w-8 h-8"
                type="button"
                title="Close Modal"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAssignSubmit} className="flex-1 flex flex-col min-h-0 max-h-full overflow-hidden max-w-full min-w-0">
              <div className="w-full flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 scrollbar-thin overscroll-contain touch-pan-y" style={{ touchAction: 'pan-y' }}>
                <div className="w-full space-y-6 pb-20">

                {/* Sales Staff Details */}
                <div className="bg-zinc-950/45 border border-zinc-850 rounded-2xl p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] text-zinc-500 block uppercase font-mono">Sales Staff Name</span>
                      <span id="dossier_sales_staff_name" className="font-bold text-white font-sans text-xs block">
                        {dossierSalesStaff.name}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block uppercase font-mono">Sales Staff Mobile Number</span>
                      <span id="dossier_sales_staff_mobile" className="font-mono text-zinc-200 font-medium block">
                        {dossierSalesStaff.mobile}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* 1. Customer Information */}
                <div className="bg-zinc-950/45 border border-zinc-850 rounded-2xl overflow-hidden transition-all duration-300">
                  <button
                    type="button"
                    onClick={() => setCollapsedCustomerDetails(!collapsedCustomerDetails)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-900/20 transition-colors focus:outline-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">👤</span>
                      <h4 className="text-[11px] sm:text-xs font-mono font-bold uppercase text-amber-500 tracking-wider">
                        Customer Details
                      </h4>
                    </div>
                    <span className={`text-zinc-500 text-xs transition-transform duration-300 ${collapsedCustomerDetails ? '' : 'rotate-180'}`}>
                      ▼
                    </span>
                  </button>

                  {!collapsedCustomerDetails && (
                    <div className="p-4 pt-1 border-t border-zinc-900/50 space-y-3 relative overflow-hidden">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div>
                          <span className="text-[10px] text-zinc-500 block uppercase font-mono">Customer Name</span>
                          <span className="font-bold text-white font-sans text-xs block">
                            {activeOrderInstance?.customer_name || parentLeadInstance?.customer_name || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block uppercase font-mono">Mobile Number</span>
                          <span className="font-mono text-zinc-200 font-medium block">
                            {activeOrderInstance?.mobile || parentLeadInstance?.mobile || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-505 block uppercase font-mono">Alt / WhatsApp</span>
                          <span className="font-mono text-zinc-200 font-medium flex items-center gap-1">
                            {parentLeadInstance?.whatsapp_number || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-505 block uppercase font-mono">Email</span>
                          <span className="font-sans text-zinc-200 font-medium block">
                            {parentLeadInstance?.email || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Multiple Events Iteration */}
                {(() => {
                  const targetLeadPkgs = leadPackages?.filter(lp => lp.lead_id === parentLeadInstance?.lead_id) || [];
                  const teamMembersConfig = extractTeamMembersConfig(parentLeadInstance, targetLeadPkgs);
                  const totalEvents = parentLeadInstance?.events?.length || 1;

                  const rawEvents = parentLeadInstance?.events || [];
                  const sortedEventsWithMeta = rawEvents.map((ev, originalIndex) => ({ ev, originalIndex }))
                    .sort((a, b) => {
                      const tA = parseEventDateTimeToTimestamp(
                        a.ev.event_date || a.ev.start_date || a.ev.eventDate || a.ev.date,
                        a.ev.event_start_time || a.ev.event_time || a.ev.start_time || a.ev.eventStartTime || a.ev.time
                      );
                      const tB = parseEventDateTimeToTimestamp(
                        b.ev.event_date || b.ev.start_date || b.ev.eventDate || b.ev.date,
                        b.ev.event_start_time || b.ev.event_time || b.ev.start_time || b.ev.eventStartTime || b.ev.time
                      );
                      if (tA !== tB) return tB - tA; // Newest first
                      return a.originalIndex - b.originalIndex;
                    });

                  return sortedEventsWithMeta.map(({ ev, originalIndex }, displayIndex) => {
                    const evId = String(ev.id || ev.event_id || `ev_${originalIndex}`);
                    const allocation = eventAllocations[evId] || eventAllocations[ev.id || ''] || eventAllocations[`ev-${originalIndex + 1}`] || Object.values(eventAllocations)[originalIndex] || { staff: [] };
                    const allocStaff = allocation.staff || [];
                    
                    const evName = ev.event_name || ev.event_type || 'Unnamed Event';
                    const includedRoles = getEventRolesForEvent(ev, originalIndex, teamMembersConfig, totalEvents);
                    let loadError = null;
                    if (includedRoles.length === 0) {
                      loadError = `No Team Members specified for event "${evName}". You can manually add staff roles below.`;
                    }

                    let evTotalRequired = 0;
                    let evTotalAssigned = 0;
                    let isEvFullyAssigned = true;
                    
                    if (includedRoles.length > 0) {
                      const tasksMap = new Map<string, { roleName: string; targetQty: number }>();
                      includedRoles.forEach((roleStr: string) => {
                        const { qty, text } = parseQtyAndText(roleStr);
                        const roleName = (text || roleStr).trim();
                        if (!roleName) return;
                        if (tasksMap.has(roleName)) {
                          tasksMap.get(roleName)!.targetQty += (qty || 1);
                        } else {
                          tasksMap.set(roleName, { roleName, targetQty: qty || 1 });
                        }
                      });
                      const validEvAllocStaff = allocStaff.filter((s: any) => s.staff_name && s.staff_name.trim() !== '');
                      for (const task of Array.from(tasksMap.values())) {
                        evTotalRequired += task.targetQty;
                        const assignedCount = validEvAllocStaff.filter((s: any) => 
                          (s.staff_role || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase() === task.roleName.trim().toLowerCase()
                        ).length;
                        evTotalAssigned += Math.min(assignedCount, task.targetQty);
                        if (assignedCount < task.targetQty) {
                          isEvFullyAssigned = false;
                        }
                      }
                    } else {
                       evTotalAssigned = allocStaff.filter((s: any) => s.staff_name && s.staff_name.trim() !== '').length;
                    }

                    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                    const isCollapsed = collapsedAssignEvents[evId] === undefined ? false : collapsedAssignEvents[evId];
                    const eventNameDisplay = ev.event_name || ev.event_type || 'N/A';

                    return (
                      <div key={evId} id={`assign-event-${evId}`} className="bg-zinc-950/60 border border-zinc-850 rounded-2xl relative overflow-visible transition-all duration-300">
                        {/* Collapsible Header */}
                        <div 
                          className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-900/40 transition-colors"
                          onClick={() => setCollapsedAssignEvents(prev => ({ ...prev, [evId]: !isCollapsed }))}
                        > 
                           <div className="flex items-center gap-3">
                              <span className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-500 select-none uppercase font-bold font-mono">
                                🎥 EVENT {displayIndex + 1}
                              </span>
                              <h4 className="text-sm font-sans font-bold text-white uppercase tracking-wide">
                                {eventNameDisplay}
                              </h4>
                           </div>
                           <div className="flex items-center gap-4">
                              {includedRoles.length > 0 ? (
                                <span className={`text-[10px] font-mono px-2 py-1 border rounded-md ${isEvFullyAssigned ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                                  {evTotalAssigned} / {evTotalRequired} Assigned → {isEvFullyAssigned ? 'Assigned' : 'Pending'}
                                </span>
                              ) : allocStaff.length > 0 ? (
                                <span className="text-[10px] font-mono px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
                                  {allocStaff.length} Staff Assigned
                                </span>
                              ) : null}
                              <span className={`text-zinc-500 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}>▼</span>
                           </div>
                        </div>

                        {/* Collapsible Content */}
                        {!isCollapsed && (
                           <div className="p-5 pt-4 border-t border-zinc-800/50 space-y-6">
                              {/* 2. Event & Package Coordinates */}
                              <div className="space-y-3">
                                 <h4 className="text-[11px] font-mono font-bold uppercase text-amber-500 tracking-wider">
                                   Event Details
                                 </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/80">
                          <div>
                            <span className="text-[10px] text-zinc-505 block uppercase font-mono mb-1">Event Type</span>
                            <span className="font-semibold text-white uppercase text-[11px] block">
                              {ev.event_type || 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-505 block uppercase font-mono mb-1">Event Name</span>
                            <span className="font-semibold text-white uppercase text-[11px] block">
                              {ev.event_name || 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-505 block uppercase font-mono mb-1">Reporting Date</span>
                            <span className="text-zinc-200 text-[11px] font-mono block">{formatDateDDMMYY(allocation.reporting_date || ev.reporting_date || ev.event_date) || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-505 block uppercase font-mono mb-1">Reporting Time</span>
                            <span className="text-zinc-200 text-[11px] font-mono block">{formatTime12Hour(allocation.reporting_time || ev.reporting_time) || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-505 block uppercase font-mono mb-1">Guest Pax</span>
                            <span className="text-zinc-200 text-[11px] font-mono block">{ev.guest_pax || 'N/A'}</span>
                          </div>
                          <div className="col-span-1 sm:col-span-2 lg:col-span-4">
                            <span className="text-[10px] text-zinc-505 block uppercase font-mono mb-1">Event Address</span>
                            <span className="text-zinc-200 text-[11px] font-sans block leading-tight">
                              {ev.event_location || ev.event_address || parentLeadInstance?.event_location || parentLeadInstance?.address || activeOrderInstance?.event_location || 'N/A'}
                            </span>
                          </div>
                          {(() => {
                            const evMapLink = ev.google_maps_link || ev.map_location_link || ev.google_maps_location_link || googleMapsLocationLink || parentLeadInstance?.google_maps_link;
                            return (
                              <div className="col-span-1 sm:col-span-2 lg:col-span-4">
                                <span className="text-[10px] text-zinc-505 block uppercase font-mono mb-1">Google Maps Location Link</span>
                                {evMapLink ? (
                                  <a 
                                    href={evMapLink} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 font-sans text-[11px] break-all block underline mt-0.5"
                                  >
                                    {evMapLink}
                                  </a>
                                ) : (
                                  <span className="text-zinc-500 font-sans text-[11px] block mt-0.5">
                                    No Google Maps Location Available.
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      {/* 3. Team Members Included & Staff Assignment */}
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-800">
                          <h4 className="text-[11px] font-mono font-bold uppercase text-sky-400 tracking-wider">
                            Team Members Included & Staff Allocation
                          </h4>
                        </div>

                        <div className="space-y-4">
                          {(() => {
                            // Group roles into tasks
                            const tasksMap = new Map<string, { roleName: string; targetQty: number }>();
                            includedRoles.forEach((roleStr: string) => {
                              const { qty, text } = parseQtyAndText(roleStr);
                              const roleName = (text || roleStr).trim();
                              if (!roleName) return;
                              if (tasksMap.has(roleName)) {
                                tasksMap.get(roleName)!.targetQty += (qty || 1);
                              } else {
                                tasksMap.set(roleName, { roleName, targetQty: qty || 1 });
                              }
                            });

                            // Only if NO roles were specified by Sales at all, fallback to existing allocStaff
                            if (tasksMap.size === 0) {
                              allocStaff.forEach((s: any) => {
                                if (s.staff_role && !tasksMap.has(s.staff_role)) {
                                  tasksMap.set(s.staff_role, { roleName: s.staff_role, targetQty: 1 });
                                }
                              });
                            }

                            const taskGroups = Array.from(tasksMap.values());

                            if (taskGroups.length === 0 && includedRoles.length === 0) {
                              return (
                                <div className="text-center py-6 text-zinc-500 text-xs italic font-mono bg-zinc-900/10 border border-zinc-900 rounded-xl">
                                  {loadError ? (
                                    <div className="text-red-400 space-y-1 p-4">
                                      <div>❌ Failed to load Team Members Included.</div>
                                      <div className="text-[10px]">Reason: {loadError}</div>
                                    </div>
                                  ) : (
                                    "No Team Members Included found for this event."
                                  )}
                                </div>
                              );
                            }

                            return taskGroups.map((task, groupIdx) => {
                              const targetQty = task.targetQty || 1;
                              const taskSlots = allocStaff.filter((s: any) => {
                                const sr = (s.staff_role || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase();
                                const tr = (task.roleName || '').trim().toLowerCase();
                                return sr === tr;
                              });
                              
                              const slotsToRender: any[] = [];
                              for (let sNum = 1; sNum <= targetQty; sNum++) {
                                const canonicalSlotAssignId = generateDeterministicAssignmentId(assigningOrderId, evId, task.roleName, sNum);
                                const canonicalSlotTaskId = generateDeterministicTaskId(assigningOrderId, evId, task.roleName, sNum);
                                const cleanRole = (task.roleName || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase();
                                const canonicalSlotKey = `${evId}__${cleanRole}__s${sNum}`;

                                // 1. Match by exact slot_key
                                let matchedSlot = taskSlots.find((s: any) => s.slot_key === canonicalSlotKey);

                                // 2. Match by exact slot_number
                                if (!matchedSlot) {
                                  matchedSlot = taskSlots.find((s: any) => Number(s.slot_number || 1) === sNum);
                                }

                                // 3. Match by exact assignment_id or task_id
                                if (!matchedSlot) {
                                  matchedSlot = taskSlots.find((s: any) => 
                                    s.assignment_id === canonicalSlotAssignId ||
                                    s.id === canonicalSlotAssignId ||
                                    s.task_id === canonicalSlotTaskId
                                  );
                                }

                                // 4. Positional fallback if available and not already used
                                if (!matchedSlot) {
                                  const unusedSlot = taskSlots.find((s: any) => !slotsToRender.some(sr => isSameAssignmentSlot(sr, s)));
                                  if (unusedSlot && sNum <= taskSlots.length) {
                                    matchedSlot = unusedSlot;
                                  }
                                }

                                if (matchedSlot) {
                                  slotsToRender.push({
                                    ...matchedSlot,
                                    _original_ref: matchedSlot._original_ref || matchedSlot,
                                    id: matchedSlot.assignment_id || matchedSlot.id || canonicalSlotAssignId,
                                    assignment_id: matchedSlot.assignment_id || canonicalSlotAssignId,
                                    task_id: matchedSlot.task_id || canonicalSlotTaskId,
                                    order_id: assigningOrderId,
                                    event_id: evId,
                                    staff_role: task.roleName,
                                    slot_number: sNum,
                                    slot_key: matchedSlot.slot_key || canonicalSlotKey
                                  });
                                } else {
                                  slotsToRender.push({
                                    id: canonicalSlotAssignId,
                                    assignment_id: canonicalSlotAssignId,
                                    task_id: canonicalSlotTaskId,
                                    order_id: assigningOrderId,
                                    event_id: evId,
                                    staff_role: task.roleName,
                                    slot_number: sNum,
                                    slot_key: canonicalSlotKey,
                                    staff_id: '',
                                    staff_name: '',
                                    mobile: '',
                                    staff_type: 'In-House' as const,
                                    equipment: []
                                  });
                                }
                              }

                              // Check if any extra slots were manually added beyond targetQty
                              taskSlots.forEach((s: any) => {
                                if (Number(s.slot_number || 0) > targetQty && !slotsToRender.some(sr => isSameAssignmentSlot(sr, s))) {
                                  slotsToRender.push({
                                    ...s,
                                    _original_ref: s._original_ref || s,
                                    order_id: assigningOrderId,
                                    event_id: evId,
                                    staff_role: task.roleName
                                  });
                                }
                              });

                              const assignedCount = slotsToRender.filter((s: any) => s.staff_name && s.staff_name.trim() !== '').length;

                              return (
                                <div key={`task_${groupIdx}_${task.roleName}`} className="border border-zinc-800/80 rounded-xl overflow-visible bg-zinc-950/80 shadow-md">
                                  {/* Task Header */}
                                  <div className="bg-zinc-900/80 px-3.5 py-2.5 border-b border-zinc-800/80 flex items-center justify-between flex-wrap gap-2 rounded-t-xl">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sky-400 text-xs">✔</span>
                                      <span className="text-xs font-bold text-zinc-100 font-sans uppercase tracking-wide">
                                        {task.roleName}
                                      </span>
                                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                        Required: {task.targetQty}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Staff Rows under Task */}
                                  <div className="p-3 space-y-3 divide-y divide-zinc-900/60">
                                    {slotsToRender.map((slot: any, slotIdx: number) => {
                                      const isEmpty = !slot.staff_name || slot.staff_name.trim() === '';
                                      const currentStaffType = slot.staff_type || 'In-House';
                                      const slotKey = slot.slot_key || slot.assignment_id || slot.id || `slot_${evId}_${task.roleName}_${slot.slot_number || (slotIdx + 1)}`;
                                      const isTaskStarted = isOperationsAssignmentStarted(slot) || ((staffAssignments || []).some(sa => sa.order_id === assigningOrderId && isSameAssignmentSlot(sa, slot) && isOperationsAssignmentStarted(sa)));

                                      return (
                                        <div key={slotKey} className={`pt-2.5 first:pt-0 space-y-2.5 ${validationAttempted && isEmpty ? 'bg-rose-950/10 p-2 rounded-lg' : ''}`}>
                                          <div className="flex items-center gap-2 pb-0.5 flex-wrap">
                                            {targetQty > 1 && (
                                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-sky-400 font-bold border border-zinc-700/60 shrink-0">
                                                Task/Slot {slot.slot_number || (slotIdx + 1)}
                                              </span>
                                            )}
                                            {isTaskStarted && (
                                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20 shrink-0 flex items-center gap-1">
                                                🔒 Started - Assignment Locked
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                            {/* Staff Type Select */}
                                            <div className="w-full sm:w-32 shrink-0">
                                              <select
                                                disabled={isTaskStarted}
                                                title={isTaskStarted ? "This task has already started and cannot be reassigned." : undefined}
                                                value={currentStaffType}
                                                onChange={(e) => {
                                                  if (isTaskStarted) return;
                                                  const newType = e.target.value as 'In-House' | 'Freelancer';
                                                  setEventAllocations((prev: any) => {
                                                    const existingAlloc = prev[evId] || { staff: [] };
                                                    let found = false;
                                                    const updatedStaff = (existingAlloc.staff || []).map((s: any) => {
                                                      if (isSameAssignmentSlot(s, slot) && !found) {
                                                        found = true;
                                                        return { ...s, ...slot, staff_type: newType, staff_name: '', staff_id: '', mobile: '' };
                                                      }
                                                      return s;
                                                    });
                                                    if (!found) {
                                                      updatedStaff.push({ ...slot, staff_type: newType, staff_name: '', staff_id: '', mobile: '' });
                                                    }
                                                    return { ...prev, [evId]: { ...existingAlloc, staff: updatedStaff } };
                                                  });
                                                }}
                                                className={`w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 rounded-lg px-2.5 py-1.5 font-sans focus:outline-none focus:border-amber-500 h-8 ${
                                                  isTaskStarted ? 'opacity-60 cursor-not-allowed bg-zinc-950/80' : 'hover:border-zinc-700 cursor-pointer'
                                                }`}
                                              >
                                                <option value="In-House">In-House</option>
                                                <option value="Freelancer">Freelancer</option>
                                              </select>
                                            </div>

                                            {/* Staff Name Select */}
                                            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2">
                                              <select
                                                disabled={isTaskStarted}
                                                title={isTaskStarted ? "This task has already started and cannot be reassigned." : undefined}
                                                value={slot.staff_name || ''}
                                                onChange={(e) => {
                                                  if (isTaskStarted) return;
                                                  const selectedName = e.target.value;
                                                  const memberInfo = staff?.find(st => st.name === selectedName);
                                                  const staffId = memberInfo?.staff_id || '';

                                                  setEventAllocations((prev: any) => {
                                                    const existingAlloc = prev[evId] || { staff: [] };
                                                    let found = false;
                                                    const updatedStaff = (existingAlloc.staff || []).map((s: any) => {
                                                      if (isSameAssignmentSlot(s, slot) && !found) {
                                                        found = true;
                                                        return {
                                                          ...s,
                                                          ...slot,
                                                          staff_name: selectedName,
                                                          staff_id: staffId,
                                                          mobile: memberInfo?.mobile || ''
                                                        };
                                                      }
                                                      return s;
                                                    });
                                                    if (!found) {
                                                      updatedStaff.push({
                                                        ...slot,
                                                        staff_name: selectedName,
                                                        staff_id: staffId,
                                                        mobile: memberInfo?.mobile || ''
                                                      });
                                                    }
                                                    return { ...prev, [evId]: { ...existingAlloc, staff: updatedStaff } };
                                                  });
                                                }}
                                                className={`w-full bg-zinc-900 border border-zinc-800 text-xs rounded-lg px-2.5 py-1.5 font-sans focus:outline-none focus:border-amber-500 h-8 ${
                                                  isTaskStarted 
                                                    ? 'opacity-60 cursor-not-allowed bg-zinc-950/80 text-zinc-400 font-medium' 
                                                    : slot.staff_name ? 'hover:border-zinc-700 text-emerald-400 font-bold cursor-pointer' : 'hover:border-zinc-700 text-zinc-400 font-normal cursor-pointer'
                                                }`}
                                              >
                                                {(() => {
                                                  const filteredStaff = currentStaffType === 'Freelancer' ? freelancerOperationsStaff : inHouseOperationsStaff;

                                                  const assignedInOtherSlots = (eventAllocations[evId]?.staff || []).filter((s: any) => {
                                                    return !isSameAssignmentSlot(s, slot) && s.staff_name && s.staff_name.trim() !== '';
                                                  }).map((s: any) => s.staff_name.trim().toLowerCase());

                                                  const currentAssignedNameLower = (slot.staff_name || '').trim().toLowerCase();

                                                  const availableStaff = filteredStaff.filter(s => {
                                                    const nameLower = (s.name || '').trim().toLowerCase();
                                                    if (nameLower === currentAssignedNameLower) return true;
                                                    return !assignedInOtherSlots.includes(nameLower);
                                                  });

                                                  if (currentAssignedNameLower) {
                                                    const matchedInStaff = (staff || []).find(s => (s.name || '').trim().toLowerCase() === currentAssignedNameLower);
                                                    if (matchedInStaff && !availableStaff.some(s => (s.name || '').trim().toLowerCase() === currentAssignedNameLower)) {
                                                      availableStaff.push(matchedInStaff);
                                                    }
                                                  }

                                                  if (availableStaff.length === 0 && !slot.staff_name) {
                                                    return <option value="" disabled>No staff available.</option>;
                                                  }

                                                  return (
                                                    <>
                                                      <option value="">▼ Select Staff</option>
                                                      {slot.staff_name && !availableStaff.some(s => (s.name || '').trim().toLowerCase() === currentAssignedNameLower) && (
                                                        <option value={slot.staff_name}>
                                                          {slot.staff_name} (Assigned)
                                                        </option>
                                                      )}
                                                      {availableStaff.map(st => {
                                                        const isBusy = isStaffBusyOnDate(st.name, ev.event_date || '', activeOrderInstance?.order_id || '');
                                                        return (
                                                          <option key={st.staff_id} value={st.name}>
                                                            {st.name} {isBusy ? '🔴 Busy' : '🟢 Available'}
                                                          </option>
                                                        );
                                                      })}
                                                    </>
                                                  );
                                                })()}
                                              </select>

                                              {/* Availability badge & Remove Row Button */}
                                              <div className="flex items-center justify-between sm:justify-start gap-2 shrink-0">
                                                {slot.staff_name && (
                                                  isStaffBusyOnDate(slot.staff_name, ev.event_date || '', activeOrderInstance?.order_id || '') ? (
                                                    <button
                                                      type="button"
                                                      onClick={() => setBusyRosterStaff(slot.staff_name)}
                                                      className="text-[9px] px-2 py-1 rounded bg-red-500/10 text-red-400 font-mono uppercase border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors shrink-0"
                                                    >
                                                      🔴 Busy
                                                    </button>
                                                  ) : (
                                                    <span className="text-[9px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 font-mono uppercase border border-emerald-500/20 shrink-0">
                                                      🟢 Available
                                                    </span>
                                                  )
                                                )}

                                                {/* Remove Staff Slot Button */}
                                                {!isTaskStarted && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setEventAllocations((prev: any) => {
                                                        const existingAlloc = prev[evId] || { staff: [] };
                                                        const updatedStaff = (existingAlloc.staff || []).map((s: any) => {
                                                          if (isSameAssignmentSlot(s, slot)) {
                                                            return {
                                                              ...s,
                                                              staff_name: '',
                                                              staff_id: '',
                                                              mobile: '',
                                                              equipment: []
                                                            };
                                                          }
                                                          return s;
                                                        }).filter((s: any) => {
                                                          if (isSameAssignmentSlot(s, slot) && Number(s.slot_number || 1) > targetQty) {
                                                            return false;
                                                          }
                                                          return true;
                                                        });
                                                        return {
                                                          ...prev,
                                                          [evId]: {
                                                            ...existingAlloc,
                                                            staff: updatedStaff
                                                          }
                                                        };
                                                      });
                                                    }}
                                                    className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 rounded border border-rose-500/20 transition-colors cursor-pointer font-medium ml-auto sm:ml-0"
                                                    title="Remove this staff assignment slot"
                                                  >
                                                    ✕ <span className="hidden sm:inline">Remove</span>
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Equipment Section per Staff */}
                                           <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1.5 border-t border-zinc-900/50">
                                             <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider pt-1.5 shrink-0 sm:w-28 hidden sm:block">
                                               Equipment
                                             </div>

                                             <div className="flex-1 min-w-0 w-full">
                                               <EquipmentSelectorDropdown
                                                 equipment={fetchedEquipment}
                                                 selectedEquipmentNames={slot?.equipment || []}
                                                 otherStaffEquipments={allocStaff
                                                   .filter((s: any) => s && !isSameAssignmentSlot(s, slot))
                                                   .map((s: any) => ({
                                                     staffName: s?.name || s?.staff_name || "",
                                                     equipmentNames: s?.equipment || []
                                                   }))}
                                                 onToggleEquipment={(eqName) => {
                                                   setEventAllocations((prev: any) => {
                                                     const existingAlloc = prev[evId] || { staff: [] };
                                                     let found = false;
                                                     const updatedStaff = (existingAlloc.staff || []).map((s: any) => {
                                                       if (isSameAssignmentSlot(s, slot) && !found) {
                                                         found = true;
                                                         const currentEq = s.equipment || [];
                                                         const isSelected = currentEq.includes(eqName);
                                                         return {
                                                           ...s,
                                                           ...slot,
                                                           equipment: isSelected
                                                             ? currentEq.filter((name: string) => name !== eqName)
                                                             : [...currentEq, eqName]
                                                         };
                                                       }
                                                       return s;
                                                     });
                                                     if (!found) {
                                                       updatedStaff.push({
                                                         ...slot,
                                                         equipment: [eqName]
                                                       });
                                                     }
                                                     return { ...prev, [evId]: { ...existingAlloc, staff: updatedStaff } };
                                                   });
                                                 }}
                                                 onRemoveEquipment={(eqName) => {
                                                   setEventAllocations((prev: any) => {
                                                     const existingAlloc = prev[evId] || { staff: [] };
                                                     const updatedStaff = (existingAlloc.staff || []).map((s: any) => {
                                                       if (isSameAssignmentSlot(s, slot)) {
                                                         return {
                                                           ...s,
                                                           ...slot,
                                                           equipment: (s.equipment || []).filter((name: string) => name !== eqName)
                                                         };
                                                       }
                                                       return s;
                                                     });
                                                     return { ...prev, [evId]: { ...existingAlloc, staff: updatedStaff } };
                                                   });
                                                 }}
                                                 checkEquipmentAvailability={checkEquipmentAvailability}
                                                 currentOrderId={assigningOrderId}
                                                 targetEventDate={parentLeadInstance?.events?.find((e: any) => e.id === evId)?.event_date || assignForm.event_date || activeOrderInstance?.event_date}
                                                 targetStartTime={parentLeadInstance?.events?.find((e: any) => e.id === evId)?.event_start_time || parentLeadInstance?.events?.find((e: any) => e.id === evId)?.reporting_time}
                                                 targetEndTime={parentLeadInstance?.events?.find((e: any) => e.id === evId)?.event_end_time}
                                                 targetStaffName={slot.name || slot.staff_name}
                                               />
                                             </div>
                                           </div>
                                         </div>
                                       );
                                     })}

                                     {/* Add Staff Button under Task */}
                                    <div className="pt-2 border-t border-zinc-900 flex items-center justify-between">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEventAllocations((prev: any) => {
                                            const existingAlloc = prev[evId] || { staff: [] };
                                            const roleStaff = (existingAlloc.staff || []).filter((s: any) => 
                                              (s.staff_role || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase() === task.roleName.trim().toLowerCase()
                                            );
                                            const nextSlotNum = Math.max(targetQty, ...roleStaff.map((s: any) => Number(s.slot_number || 0))) + 1;
                                            const cleanRole = (task.roleName || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase();
                                            const newSlotKey = `${evId}__${cleanRole}__s${nextSlotNum}`;
                                            const newAssignId = generateDeterministicAssignmentId(assigningOrderId, evId, task.roleName, nextSlotNum);
                                            const newTaskId = generateDeterministicTaskId(assigningOrderId, evId, task.roleName, nextSlotNum);
                                            const newSlot = {
                                              id: newAssignId,
                                              assignment_id: newAssignId,
                                              task_id: newTaskId,
                                              order_id: assigningOrderId,
                                              event_id: evId,
                                              slot_number: nextSlotNum,
                                              slot_key: newSlotKey,
                                              staff_role: task.roleName,
                                              staff_id: '',
                                              staff_name: '',
                                              mobile: '',
                                              staff_type: 'In-House' as const,
                                              equipment: []
                                            };
                                            return {
                                              ...prev,
                                              [evId]: {
                                                ...existingAlloc,
                                                staff: [...existingAlloc.staff, newSlot]
                                              }
                                            };
                                          });
                                        }}
                                        className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-1.5 rounded-lg border border-sky-500/20 transition-all cursor-pointer"
                                      >
                                        + Add Staff
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                      {false && (
                        
                        <div className="border border-zinc-900 rounded-xl overflow-hidden bg-zinc-950">
                          <div className="w-full text-left">
                            {/* Header row - only visible on desktop */}
                            <div className="hidden sm:grid grid-cols-12 bg-zinc-900/50 border-b border-zinc-900 font-mono text-[9px] text-zinc-500 uppercase tracking-wider py-2 px-3.5">
                              <div className="col-span-4 font-bold">Team Member</div>
                              <div className="col-span-8 font-bold">Assignments (Staff Type & Assigned Staff)</div>
                            </div>
                            <div className="divide-y divide-zinc-900">
                                 {includedRoles.length === 0 && (
                                   <div className="text-center py-6 text-zinc-500 text-xs italic font-mono bg-zinc-900/10">
                                     {loadError ? (
                                       <div className="text-red-400 space-y-1 p-4">
                                         <div>❌ Failed to load Team Members Included.</div>
                                         <div className="text-[10px]">Reason: {loadError}</div>
                                       </div>
                                     ) : (
                                       "No Team Members Included found for this event."
                                     )}
                                   </div>
                                 )}
                                 {includedRoles.map((roleStr, roleIdx) => {
                                   const assignedStaff = allocStaff.find((s: any) => s.role_index === roleIdx) || allocStaff[roleIdx] || { role_index: roleIdx, staff_role: roleStr, staff_name: '', staff_id: '', mobile: '', staff_type: 'In-House', equipment: [] };
                                   const isEmpty = !assignedStaff.staff_name || assignedStaff.staff_name.trim() === '';
                                   const currentStaffType = assignedStaff.staff_type || 'In-House';

                                   return (
                                     <div 
                                       key={`${evId}_${roleIdx}`}
                                       id={`role-row-${evId}-${roleIdx}`}
                                       className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-0 transition-colors p-3.5 sm:py-2.5 sm:px-3.5 items-start ${
                                         validationAttempted && isEmpty
                                           ? 'bg-rose-950/5 hover:bg-rose-950/10'
                                           : 'hover:bg-zinc-900/10'
                                       }`}
                                     >
                                       {/* Left Column: Team Member Name */}
                                       <div className="col-span-1 sm:col-span-4 font-sans sm:border-r sm:border-zinc-900/50 sm:pr-4 flex items-center h-full min-h-[1.5rem]">
                                         <div className="flex items-center justify-between gap-2 w-full">
                                           <div 
                                             className="text-xs font-bold text-zinc-200 truncate pr-2 select-none"
                                             title={roleStr as string}
                                           >
                                             ✔ {formatQtyItem(roleStr as string)}
                                           </div>
                                         </div>
                                       </div>

                                       {/* Right Column: Multi-staff assignments */}
                                       <div className="col-span-1 sm:col-span-8 sm:pl-4">
                                        <div className="space-y-2">
                                          <div className="flex flex-col gap-1.5 bg-zinc-950/40 p-2 rounded-lg border border-zinc-900">
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                {/* Staff Type Select */}
                                                <div className="w-full sm:w-28 shrink-0">
                                                  <select
                                                    value={currentStaffType}
                                                    onChange={(e) => {
                                                      const newType = e.target.value as 'In-House' | 'Freelancer';
                                                      
                                                      setEventAllocations((prev: any) => {
                                                        const existingAlloc = prev[evId] || { staff: [] };
                                                        
                                                        const updatedStaff = existingAlloc.staff.map((s: any, idx: number) => {
                                                          const isTarget = s.role_index !== undefined ? s.role_index === roleIdx : idx === roleIdx;
                                                          if (isTarget) {
                                                            return {
                                                              ...s,
                                                              role_index: roleIdx,
                                                              staff_type: newType,
                                                              staff_name: '',
                                                              staff_id: '',
                                                              mobile: ''
                                                            };
                                                          }
                                                          return s;
                                                        });
                                                        
                                                        return {
                                                          ...prev,
                                                          [evId]: {
                                                            ...existingAlloc,
                                                            staff: updatedStaff
                                                          }
                                                        };
                                                      });
                                                    }}
                                                    className="w-full bg-zinc-950 border border-zinc-900 hover:border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-300 rounded-lg px-2 py-1 font-sans focus:outline-none focus:border-amber-500 cursor-pointer h-7"
                                                  >
                                                    <option value="In-House">In-House</option>
                                                    <option value="Freelancer">Freelancer</option>
                                                  </select>
                                                </div>

                                                {/* Staff Name Select */}
                                                <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2">
                                                  <select
                                                    value={assignedStaff.staff_name || ''}
                                                    onChange={(e) => {
                                                      const selectedName = e.target.value;
                                                      const memberInfo = staff?.find(st => st.name === selectedName);
                                                      const staffId = memberInfo?.staff_id || '';
                                                      
                                                      setEventAllocations((prev: any) => {
                                                        const existingAlloc = prev[evId] || { staff: [] };
                                                        
                                                        const updatedStaff = existingAlloc.staff.map((s: any, idx: number) => {
                                                          const isTarget = s.role_index !== undefined ? s.role_index === roleIdx : idx === roleIdx;
                                                          if (isTarget) {
                                                            return {
                                                              ...s,
                                                              role_index: roleIdx,
                                                              staff_name: selectedName,
                                                              staff_id: staffId,
                                                              mobile: memberInfo?.mobile || ''
                                                            };
                                                          }
                                                          return s;
                                                        });
                                                        
                                                        return {
                                                          ...prev,
                                                          [evId]: {
                                                            ...existingAlloc,
                                                            staff: updatedStaff
                                                          }
                                                        };
                                                      });
                                                    }}
                                                    className={`w-full bg-zinc-950 border border-zinc-900 hover:border-zinc-800 text-[11px] rounded-lg px-2 py-1 font-sans focus:outline-none focus:border-amber-500 cursor-pointer h-7 ${
                                                      assignedStaff.staff_name ? 'text-emerald-400 font-bold' : 'text-zinc-400 font-normal'
                                                    }`}
                                                  >
                                                    {(() => {
                                                      const normType = (type: string | undefined): string => {
                                                        const clean = (type || 'In-House').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                                                        return (clean === 'inhouse' || clean === 'in-house' || clean === 'in house') ? 'in-house' : 'freelancer';
                                                      };
                                                      
                                                      const filteredStaff = (staff || []).filter(s => {
                                                        if (s.status !== 'Active') return false;
                                                        if (s.department !== 'Operations') return false;
                                                        const sType = s.staff_type || s.Staff_Type;
                                                        return normType(sType) === normType(currentStaffType);
                                                      });
                                                      
                                                      // Staff names assigned to ANY OTHER slot in THIS event
                                                      const assignedInOtherSlots = (eventAllocations[evId]?.staff || []).filter((s: any, idx: number) => {
                                                        const isOther = s.role_index !== undefined ? s.role_index !== roleIdx : idx !== roleIdx;
                                                        return isOther && s.staff_name && s.staff_name.trim() !== '';
                                                      }).map((s: any) => s.staff_name.trim().toLowerCase());

                                                      const currentAssignedNameLower = (assignedStaff.staff_name || '').trim().toLowerCase();

                                                      const availableStaff = filteredStaff.filter(s => {
                                                        const nameLower = (s.name || '').trim().toLowerCase();
                                                        if (nameLower === currentAssignedNameLower) return true;
                                                        return !assignedInOtherSlots.includes(nameLower);
                                                      });
                                                      
                                                      if (availableStaff.length === 0) {
                                                        return <option value="" disabled>No staff available.</option>;
                                                      }
                                                      
                                                      return (
                                                        <>
                                                          <option value="">▼ Select Staff</option>
                                                          {availableStaff.map(st => {
                                                            const isBusy = isStaffBusyOnDate(st.name, ev.event_date || '', activeOrderInstance?.order_id || '');
                                                            return (
                                                              <option key={st.staff_id} value={st.name}>
                                                                {st.name} {isBusy ? '🔴 Busy' : '🟢 Available'}
                                                              </option>
                                                            );
                                                          })}
                                                        </>
                                                      );
                                                    })()}
                                                  </select>
                                                  <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto shrink-0 mt-1 sm:mt-0">
                                                    {assignedStaff.staff_name && (
                                                      isStaffBusyOnDate(assignedStaff.staff_name, ev.event_date || '', activeOrderInstance?.order_id || '') ? (
                                                        <button
                                                           type="button"
                                                           onClick={() => setBusyRosterStaff(assignedStaff.staff_name)}
                                                           className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-mono uppercase border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors shrink-0"
                                                        >
                                                          🔴 Busy
                                                        </button>
                                                      ) : (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono uppercase border border-emerald-500/20 shrink-0">
                                                          🟢 Available
                                                        </span>
                                                      )
                                                    )}
                                                    {/* Remove Row Button */}
                                                    <button
                                                      type="button"
                                                    onClick={() => {
                                                      setEventAllocations((prev: any) => {
                                                        const existingAlloc = prev[evId] || { staff: [] };
                                                        
                                                        const updatedStaff = existingAlloc.staff.map((s: any, idx: number) => {
                                                          const isTarget = s.role_index !== undefined ? s.role_index === roleIdx : idx === roleIdx;
                                                          if (isTarget) {
                                                            return {
                                                              ...s,
                                                              role_index: roleIdx,
                                                              staff_name: '',
                                                              staff_id: '',
                                                              mobile: '',
                                                              equipment: []
                                                            };
                                                          }
                                                          return s;
                                                        });
                                                        
                                                        return {
                                                          ...prev,
                                                          [evId]: {
                                                            ...existingAlloc,
                                                            staff: updatedStaff
                                                          }
                                                        };
                                                      });
                                                    }}
                                                    className="text-zinc-600 hover:text-rose-400 transition-colors p-1 cursor-pointer text-xs font-bold shrink-0 ml-auto sm:ml-0"
                                                    title="Remove staff assignment row"
                                                  >
                                                    ✕
                                                  </button>
                                                  </div>
                                                </div>
                                              </div>
                                                                                            {/* Assigned Equipment Section for Individual Staff */}
                                              <div className="flex flex-col sm:flex-row sm:items-start gap-2 mt-1 pt-2 border-t border-zinc-900/50">
                                                <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider pt-1.5 shrink-0 sm:w-28 hidden sm:block">
                                                  Equipment
                                                </div>

                                                <div className="flex-1 min-w-0 w-full">
                                                  <EquipmentSelectorDropdown
                                                    equipment={equipment}
                                                    selectedEquipmentNames={assignedStaff?.equipment || []}
                                                    otherStaffEquipments={allocStaff
                                                      .filter((s: any, idx: number) => {
                                                        if (!s) return false;
                                                        return s.role_index !== undefined ? s.role_index !== roleIdx : idx !== roleIdx;
                                                      })
                                                      .map((s: any) => ({
                                                        staffName: s?.name || s?.staff_name || "",
                                                        equipmentNames: s?.equipment || []
                                                      }))}
                                                    onToggleEquipment={(eqName) => {
                                                      setEventAllocations((prev: any) => {
                                                        const existingAlloc = prev[evId] || { staff: [] };
                                                        const updatedStaff = existingAlloc.staff.map((s: any, idx: number) => {
                                                          const isTarget = s.role_index !== undefined ? s.role_index === roleIdx : idx === roleIdx;
                                                          if (isTarget) {
                                                            const currentEq = s.equipment || [];
                                                            const isSelected = currentEq.includes(eqName);
                                                            return {
                                                              ...s,
                                                              equipment: isSelected 
                                                                ? currentEq.filter((name: string) => name !== eqName)
                                                                : [...currentEq, eqName]
                                                            };
                                                          }
                                                          return s;
                                                        });
                                                        return { ...prev, [evId]: { ...existingAlloc, staff: updatedStaff } };
                                                      });
                                                    }}
                                                    onRemoveEquipment={(eqName) => {
                                                      setEventAllocations((prev: any) => {
                                                        const existingAlloc = prev[evId] || { staff: [] };
                                                        const updatedStaff = existingAlloc.staff.map((s: any, idx: number) => {
                                                          const isTarget = s.role_index !== undefined ? s.role_index === roleIdx : idx === roleIdx;
                                                          if (isTarget) {
                                                            return {
                                                              ...s,
                                                              equipment: (s.equipment || []).filter((name: string) => name !== eqName)
                                                            };
                                                          }
                                                          return s;
                                                        });
                                                        return { ...prev, [evId]: { ...existingAlloc, staff: updatedStaff } };
                                                      });
                                                    }}
                                                    checkEquipmentAvailability={checkEquipmentAvailability}
                                                 currentOrderId={assigningOrderId}
                                                 targetEventDate={parentLeadInstance?.events?.find((e: any) => e.id === evId)?.event_date || assignForm.event_date || activeOrderInstance?.event_date}
                                                 targetStartTime={parentLeadInstance?.events?.find((e: any) => e.id === evId)?.event_start_time || parentLeadInstance?.events?.find((e: any) => e.id === evId)?.reporting_time}
                                                 targetEndTime={parentLeadInstance?.events?.find((e: any) => e.id === evId)?.event_end_time}
                                                 targetStaffName={assignedStaff.name || assignedStaff.staff_name}
                                                  />
                                                </div>
                                              </div>
                                            </div>

                                              {/* Validation message if missing */}
                                              {validationAttempted && isEmpty && (
                                                <div className="pt-0.5">
                                                  <span className="text-[10px] text-rose-500 font-mono italic">
                                                    ⚠️ Required: Assign at least one staff
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                      </div>
                                    );
                                  })}
                            </div>
                          </div>
                        </div>
                      )}


                        {/* Staff Schedule Card (Hidden as requested) */}
                        {false && (() => {
                           const staffNamesToCheck: string[] = [];
                           
                           // Check all dropdowns for this event
                           Object.keys(selectedStaffByEvent).forEach(key => {
                             if (key.startsWith(`${evId}_`) && selectedStaffByEvent[key]) {
                               staffNamesToCheck.push(selectedStaffByEvent[key]);
                             }
                           });

                           allocStaff.forEach((s: any) => {
                             if (s.staff_name && !staffNamesToCheck.includes(s.staff_name)) {
                               staffNamesToCheck.push(s.staff_name);
                             }
                           });

                           if (staffNamesToCheck.length === 0) return null;

                           return (
                             <div className="space-y-4">
                               {staffNamesToCheck.map((staffName, sIdx) => {
                                 const memberInfo = staff?.find(st => st.name === staffName);
                                 if (!memberInfo) return null;

                                 // Find all active and upcoming events assigned to this staff member
                                 const staffEvents: any[] = [];
                                 leads?.forEach(otherLead => {
                                   otherLead.events?.forEach(otherEv => {
                                     if (otherEv.id === evId) return;
                                     const otherOrder = orders.find(o => o.lead_id === otherLead.lead_id || o.order_id === otherLead.lead_id);
                                     const orderIdToCheck = otherOrder?.order_id || otherLead.lead_id;
                                     const hasSavedAssignment = staffAssignments?.some(sa => 
                                       sa.staff_name.toLowerCase() === staffName.toLowerCase() &&
                                       sa.assignment_status !== 'Cancelled' &&
                                       sa.order_id === orderIdToCheck
                                     );
                                     if (hasSavedAssignment) {
                                       const isCompleted = otherOrder ? isCompletedEvent(otherOrder) : false;
                                       const op = otherOrder ? operations?.find(o => o.order_id === otherOrder.order_id) : null;
                                       const eventStatus = op?.event_status || 'Assigned';
                                       const isEventActive = !['completed', 'event completed', 'cancelled'].includes(eventStatus.toLowerCase());
                                       if (!isCompleted && otherLead.status !== 'Lost Lead' && isEventActive) {
                                         staffEvents.push({
                                           lead: otherLead,
                                           event: otherEv,
                                           order: otherOrder,
                                           dateValue: otherEv.event_date || otherLead.Reporting_date || ''
                                         });
                                       }
                                     }
                                   });
                                 });
                                 // Sort chronologically by date
                                 staffEvents.sort((a, b) => {
                                   const dateA = new Date(a.dateValue).getTime();
                                   const dateB = new Date(b.dateValue).getTime();
                                   if (isNaN(dateA)) return 1;
                                   if (isNaN(dateB)) return -1;
                                   return dateA - dateB;
                                 });

                                 // Compare current scheduling event's time coordinates with existing assignments
                                 const currentEvDate = allocation.reporting_date || ev.event_date;
                                 const currentEvRepTime = allocation.reporting_time || ev.reporting_time;
                                 const currentEvStartTime = allocation.event_start_time || ev.event_start_time;
                                 const currentEvEndTime = allocation.event_end_time || ev.event_end_time;

                                 const evStart = parseDateTime(currentEvDate, currentEvRepTime || currentEvStartTime || '08:00');
                                 const evEnd = parseDateTime(currentEvDate, currentEvEndTime || currentEvStartTime || '17:00');

                                 const conflictingEvents: any[] = [];
                                 staffEvents.forEach(se => {
                                   const seRepDate = se.lead.Reporting_date || se.event.event_date;
                                   const seRepTime = se.event.reporting_time || se.lead.reporting_time || se.event.event_start_time || '08:00';
                                   const seEndTime = se.event.event_end_time || se.event.event_start_time || '17:00';

                                   const otherStart = parseDateTime(seRepDate, seRepTime);
                                   const otherEnd = parseDateTime(se.event.event_date || seRepDate, seEndTime);

                                   let isOverlap = false;
                                   if (evStart && evEnd && otherStart && otherEnd) {
                                     isOverlap = evStart < otherEnd && otherStart < evEnd;
                                   } else {
                                     if (currentEvDate && se.event.event_date && currentEvDate === se.event.event_date) {
                                       isOverlap = true;
                                     }
                                   }

                                   if (isOverlap) {
                                     conflictingEvents.push(se);
                                   }
                                 });

                                 const hasConflict = conflictingEvents.length > 0;

                                 return (
                                   <div key={`${staffName}_${sIdx}`} className="mt-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4 text-left shadow-md">
                                     {/* Header */}
                                     <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                                       <div>
                                         <span className="text-[10px] text-zinc-500 uppercase font-mono block">👤 Staff Name</span>
                                         <span className="text-sm font-bold text-white font-sans">{staffName}</span>
                                         <span className="text-[10px] text-zinc-400 font-mono block mt-0.5">{memberInfo.role}</span>
                                       </div>
                                       <div className="flex flex-col items-start sm:items-end">
                                         <span className="text-[10px] text-zinc-500 uppercase font-mono block">Status</span>
                                         {hasConflict ? (
                                           <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                                             🔴 Busy
                                           </span>
                                         ) : (
                                           <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                             🟢 Available
                                           </span>
                                         )}
                                       </div>
                                     </div>
                                   </div>
                                 );
                               })}
                             </div>
                           );
                        })()}
                        
                      {/* 4. WhatsApp Sharing (Hidden as requested) */}
                      {false && allocStaff.length > 0 && (
                        <div className="pt-3 mt-4 border-t border-zinc-800">
                          <button
                            type="button"
                            onClick={() => {
                              if (activeOrderInstance) {
                                const assignedStaffNames = getAssignedStaffNamesForOrder(activeOrderInstance);
                                if (assignedStaffNames.length === 1) {
                                  const msgText = generateWhatsAppMessageForStaff(activeOrderInstance, assignedStaffNames[0]);
                                  const url = `https://wa.me/?text=${encodeURIComponent(msgText)}`;
                                  window.open(url, '_blank');
                                } else {
                                  setWhatsappShareModalData({
                                    orderId: activeOrderInstance.order_id,
                                    order: activeOrderInstance,
                                    staffNames: assignedStaffNames
                                  });
                                }
                              }
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-[10px] font-mono font-bold rounded cursor-pointer transition-all uppercase"
                          >
                            <span>📱</span> Share via WhatsApp
                          </button>
                        </div>
                      )}
                           </div>
                        )}
                    </div>
                  );
                })
                })()}
                
                </div>
              </div>
              
              {assignValidationError && (
                 <div className="p-4 mx-4 sm:mx-6 my-2 bg-red-500/10 border border-red-500/50 rounded-xl flex items-start gap-3 shadow-[0_0_15px_rgba(239,68,68,0.1)] shrink-0">
                    <span className="text-red-400 font-bold text-lg leading-none mt-0.5">❌</span>
                    <div className="text-[13px] text-red-200 font-sans whitespace-pre-wrap flex-1 leading-relaxed">
                       {assignValidationError}
                    </div>
                 </div>
              )}

              <div className="z-30 p-4 sm:px-6 sm:py-4 border-t border-zinc-800 flex flex-col sm:flex-row justify-end gap-3 bg-zinc-950/95 backdrop-blur-md shrink-0 max-w-full min-w-0">
                <button
                  type="button"
                  onClick={() => setAssigningOrderId(null)}
                  className="px-5 py-2.5 text-xs font-mono font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 rounded-xl border border-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-black text-xs font-mono font-bold uppercase rounded-xl transition-colors cursor-pointer disabled:opacity-50 w-full sm:w-auto flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>SAVING ASSIGNMENTS...</span>
                    </>
                  ) : (
                    'SAVE ASSIGNMENTS'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}


      {/* Equipment Status Modal */}
      {selectedEquipmentStatus && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000000] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl relative p-5">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-indigo-400 font-mono uppercase">
                  Equipment Verification • {selectedEquipmentStatus.staffName}
                </h3>
                {selectedEquipmentStatus.assignedEquipment && selectedEquipmentStatus.assignedEquipment.length > 0 && (
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    Assigned: <span className="text-zinc-200 font-medium">{selectedEquipmentStatus.assignedEquipment.join(', ')}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedEquipmentStatus(null)}
                className="text-zinc-400 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/60 mb-4">
              <table className="w-full text-left text-xs min-w-max">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 font-mono uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3 font-bold">Verification Stage</th>
                    <th className="py-2.5 px-3 font-bold text-center">Image</th>
                    <th className="py-2.5 px-3 font-bold text-center">Upload Date</th>
                    <th className="py-2.5 px-3 font-bold text-right">Upload Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {(() => {
                    const matchingSA = staffAssignments?.find(sa => sa.assignment_id === selectedEquipmentStatus.assignmentId);
                    const eqData = getEquipmentVerificationData({
                      assignmentId: selectedEquipmentStatus.assignmentId,
                      staffAssignment: selectedEquipmentStatus.taskDetails || matchingSA,
                      staffAssignments,
                      leadEquipmentHistory,
                      staffName: selectedEquipmentStatus.staffName,
                      orderId: selectedEquipmentStatus.orderId,
                      eventId: selectedEquipmentStatus.eventId
                    });
                    const recUrl = eqData?.equipmentReceivedPhoto || (eqData as any)?.received?.url || null;
                    const recDate = eqData?.equipmentReceivedDate || (eqData as any)?.received?.date || '-';
                    const recTime = eqData?.equipmentReceivedTime || (eqData as any)?.received?.time || '-';
                    const handUrl = eqData?.equipmentHandoverPhoto || (eqData as any)?.handover?.url || null;
                    const handDate = eqData?.equipmentHandoverDate || (eqData as any)?.handover?.date || '-';
                    const handTime = eqData?.equipmentHandoverTime || (eqData as any)?.handover?.time || '-';

                    return (
                      <>
                        <tr className="hover:bg-zinc-800/20">
                          <td className="py-3 px-3 text-white font-bold">Equipment Received</td>
                          <td className="py-3 px-3 text-center">
                            {recUrl ? (
                              <button
                                onClick={() => setImagePreviewModal({ url: recUrl, date: recDate || '-', time: recTime || '-', staffName: selectedEquipmentStatus.staffName, stage: 'Equipment Received' })}
                                className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              >
                                View Image
                              </button>
                            ) : (
                              <span className="text-zinc-600 italic text-[11px]">Pending</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-zinc-300">{recDate && recDate !== '-' ? (formatDateDDMMYY(recDate) || recDate) : '-'}</td>
                          <td className="py-3 px-3 text-right font-mono text-zinc-300">{recTime || '-'}</td>
                        </tr>
                        <tr className="hover:bg-zinc-800/20">
                          <td className="py-3 px-3 text-white font-bold">Equipment Handover</td>
                          <td className="py-3 px-3 text-center">
                            {handUrl ? (
                              <button
                                onClick={() => setImagePreviewModal({ url: handUrl, date: handDate && handDate !== '-' ? (formatDateDDMMYY(handDate) || handDate) : '-', time: handTime || '-', staffName: selectedEquipmentStatus.staffName, stage: 'Equipment Handover' })}
                                className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              >
                                View Image
                              </button>
                            ) : (
                              <span className="text-zinc-600 italic text-[11px]">Pending</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-zinc-300">{handDate && handDate !== '-' ? (formatDateDDMMYY(handDate) || handDate) : '-'}</td>
                          <td className="py-3 px-3 text-right font-mono text-zinc-300">{handTime || '-'}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-800">
              <button
                onClick={() => setSelectedEquipmentStatus(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Event Images Modal */}
      {selectedEventImages && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000000] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full w-full max-w-lg shadow-2xl relative p-5">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-indigo-400 font-mono uppercase">
                Event Images • {selectedEventImages.staffName}
              </h3>
              <button
                onClick={() => setSelectedEventImages(null)}
                className="text-zinc-400 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/60 mb-4">
              <table className="w-full text-left text-xs min-w-max">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 font-mono uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3 font-bold">Event Stage</th>
                    <th className="py-2.5 px-3 font-bold text-center">Image</th>
                    <th className="py-2.5 px-3 font-bold text-center">Upload Date</th>
                    <th className="py-2.5 px-3 font-bold text-right">Upload Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {(() => {
                    const matchingSA = staffAssignments?.find(sa => sa.assignment_id === selectedEventImages.assignmentId);
                    const evData = getEventImagesData({
                      assignmentId: selectedEventImages.assignmentId,
                      staffAssignment: selectedEventImages.taskDetails || matchingSA,
                      staffAssignments,
                      leadEquipmentHistory,
                      staffName: selectedEventImages.staffName,
                      orderId: selectedEventImages.orderId,
                      eventId: selectedEventImages.eventId
                    });
                    const startMeta = {
                      url: evData?.eventStartPhoto || (evData as any)?.eventStart?.url || null,
                      date: evData?.eventStartDate || (evData as any)?.eventStart?.date || '-',
                      time: evData?.eventStartTime || (evData as any)?.eventStart?.time || '-'
                    };
                    const endMeta = {
                      url: evData?.eventEndPhoto || (evData as any)?.eventEnd?.url || null,
                      date: evData?.eventEndDate || (evData as any)?.eventEnd?.date || '-',
                      time: evData?.eventEndTime || (evData as any)?.eventEnd?.time || '-'
                    };
                    return (
                      <>
                        <tr className="hover:bg-zinc-800/20">
                          <td className="py-3 px-3 text-white font-bold">Event Start</td>
                          <td className="py-3 px-3 text-center">
                            {startMeta.url ? (
                              <button
                                onClick={() => setImagePreviewModal({ url: startMeta.url, date: startMeta.date || '-', time: startMeta.time || '-', staffName: selectedEventImages.staffName, stage: 'Event Start' })}
                                className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              >
                                View Image
                              </button>
                            ) : (
                              <span className="text-zinc-600 italic text-[11px]">Pending</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-zinc-300">{startMeta.date && startMeta.date !== '-' ? (formatDateDDMMYY(startMeta.date) || startMeta.date) : '-'}</td>
                          <td className="py-3 px-3 text-right font-mono text-zinc-300">{startMeta.time || '-'}</td>
                        </tr>
                        <tr className="hover:bg-zinc-800/20">
                          <td className="py-3 px-3 text-white font-bold">Event Complete</td>
                          <td className="py-3 px-3 text-center">
                            {endMeta.url ? (
                              <button
                                onClick={() => setImagePreviewModal({ url: endMeta.url, date: endMeta.date && endMeta.date !== '-' ? (formatDateDDMMYY(endMeta.date) || endMeta.date) : '-', time: endMeta.time || '-', staffName: selectedEventImages.staffName, stage: 'Event Complete' })}
                                className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              >
                                View Image
                              </button>
                            ) : (
                              <span className="text-zinc-600 italic text-[11px]">Pending</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-zinc-300">{endMeta.date && endMeta.date !== '-' ? (formatDateDDMMYY(endMeta.date) || endMeta.date) : '-'}</td>
                          <td className="py-3 px-3 text-right font-mono text-zinc-300">{endMeta.time || '-'}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-800">
              <button
                onClick={() => setSelectedEventImages(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Verify Raw Footage Modal */}
      {receivingFootageOrderId && (() => {
        const currentOp = operations?.find(o => o.order_id === receivingFootageOrderId);
        const currentOrder = orders?.find(o => o.order_id === receivingFootageOrderId);
        const currentLead = leads?.find(l => l.lead_id === currentOrder?.lead_id);

        // Filter history records for this order/lead
        const orderHistory = (leadEquipmentHistory || []).filter(h => 
          (h.order_id && h.order_id === receivingFootageOrderId) ||
          (currentOrder?.lead_id && h.lead_id === currentOrder.lead_id)
        );

        // Helper to extract photo & info from history items
        const parseProof = (item: any) => {
          let photoUrl = '';
          let rawLink = '';
          let proofType = item?.equipment_status || '';
          if (item?.remarks) {
            try {
              const parsed = typeof item.remarks === 'string' ? JSON.parse(item.remarks) : item.remarks;
              photoUrl = parsed.photo_url || photoUrl;
              rawLink = parsed.raw_footage_link || rawLink;
              proofType = parsed.proof_type || proofType;
            } catch (e) {}
          }
          return { photoUrl, rawLink, proofType, status: item?.equipment_status, returnedBy: item?.returned_by, returnedAt: item?.returned_at };
        };

        // Find proofs
        const assetCollectionRecord = orderHistory.find(h => h.equipment_name === 'Asset Collection Photo Proof' || h.equipment_name === 'Asset Collection');
        const assetCollectionProof = parseProof(assetCollectionRecord);

        const eventStartRecord = orderHistory.find(h => h.equipment_name === 'Event Start Photo Proof' || h.equipment_name === 'Event Start');
        const eventStartProof = parseProof(eventStartRecord);

        const eventCompletionRecord = orderHistory.find(h => h.equipment_name === 'Event Completion Photo Proof' || h.equipment_name === 'Event Completion' || h.equipment_name === 'Event Complete');
        const eventCompletionProof = parseProof(eventCompletionRecord);

        const equipmentHandoverRecord = orderHistory.find(h => h.equipment_name === 'Equipment Handover Photo Proof' || h.equipment_name === 'Asset Return Photo Proof' || h.equipment_status === 'Equipment Handover Completed');
        const equipmentHandoverProof = parseProof(equipmentHandoverRecord);

        const rawFootageLink = currentOp?.raw_footage_drive_link || footageForm.footage_link || assetCollectionProof.rawLink || eventStartProof.rawLink || eventCompletionProof.rawLink || equipmentHandoverProof.rawLink;

        // Construct assigned crew list
        const staffDetails = currentOrder ? getAssignedStaffDetailsForOrder(currentOrder) : [];
        let assignedCrewList: Array<{ staff_name: string; staff_role: string; raw_footage_link?: string; event_name?: string }> = [];

        if (staffDetails.length > 0) {
          assignedCrewList = staffDetails.map(member => {
            const matchingSA = staffAssignments?.find(sa => sa.assignment_id === member.assignment_id);
            const rfResult = getRawFootageData({
              assignmentId: member.assignment_id,
              staffAssignment: matchingSA,
              staffAssignments,
              rawFootage,
              leadEquipmentHistory,
              staffName: member.staff_name,
              orderId: receivingFootageOrderId,
              eventId: member.event_id
            });

            return {
              staff_name: member.staff_name,
              staff_role: member.staff_role || 'Operations Staff',
              event_name: member.event_name,
              raw_footage_link: rfResult.rawFootageLink || rfResult.link || ''
            };
          });
        }
        
        // Fallbacks if no staffDetails (should be rare)
        if (assignedCrewList.length === 0 && currentOp?.assigned_staff) {
          const names = currentOp.assigned_staff.split(',').map((s: string) => s.trim());
          names.forEach(name => {
            if (name && !assignedCrewList.some(c => c.staff_name.toLowerCase() === name.toLowerCase())) {
              assignedCrewList.push({
                staff_name: name,
                staff_role: 'Operations Staff',
                raw_footage_link: ''
              });
            }
          });
        }

        const allCrewVerified = assignedCrewList.length > 0 
          ? assignedCrewList.every(c => !!(c.raw_footage_link && c.raw_footage_link.trim())) 
          : true;

        return createPortal(
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
            <div id="raw_footage_modal" className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl relative p-6 max-h-[92vh] overflow-y-auto space-y-5 scrollbar-thin my-auto">
              
              {/* Header */}
              <div className="border-b border-zinc-800 pb-3 flex justify-between items-start">
                <div>
                  <h3 className="text-base font-bold text-purple-400 font-mono uppercase flex items-center gap-2">
                    <span>🎬</span> Final Consolidated Raw Footage
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Order ID: <strong className="text-zinc-200">{receivingFootageOrderId}</strong> | Customer: <strong className="text-zinc-200">{currentOrder?.customer_name || currentLead?.customer_name || 'N/A'}</strong>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setReceivingFootageOrderId(null);
                    setConsolidatedDriveLink('');
                  }}
                  className="text-zinc-400 hover:text-white p-1 rounded-lg bg-zinc-800 text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Review description banner - Hidden per UI requirement */}
              {false && (
                <div className="text-xs text-zinc-400 leading-relaxed bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                  Review each assigned crew member's Raw Footage link below. Enter the <strong>Final Consolidated Raw Footage Drive Link</strong> to complete verification and transfer the order to Production.
                </div>
              )}

              {/* ASSIGNED TEAM MEMBERS VERIFICATION SECTION */}
              <div className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <h4 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>👥</span> Assigned Team Members & Raw Footage Links
                  </h4>
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    Uploaded: {assignedCrewList.filter(c => c.raw_footage_link).length} / {assignedCrewList.length}
                  </span>
                </div>

                {assignedCrewList.length === 0 ? (
                  <div className="text-xs text-zinc-500 italic py-2">No assigned crew members found for this order.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse min-w-max">
                      <thead>
                        <tr className="bg-zinc-900 border-b border-zinc-800 text-[10px] font-mono uppercase text-zinc-400">
                          <th className="py-2.5 px-3">Staff Name</th>
                          <th className="py-2.5 px-3">Assigned Role</th>
                          <th className="py-2.5 px-3">Raw Footage Link</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {assignedCrewList.map((c, cIdx) => {
                          const hasLink = !!(c.raw_footage_link && c.raw_footage_link.trim());
                          return (
                            <tr key={c.assignment_id || `${c.staff_name}_${cIdx}`} className="hover:bg-zinc-900/50">
                              <td className="py-2.5 px-3 font-bold text-white">{c.staff_name}</td>
                              <td className="py-2.5 px-3 text-zinc-300 font-mono text-[11px]">{c.staff_role}</td>
                              <td className="py-2.5 px-3">
                                {hasLink ? (
                                  <a
                                    href={c.raw_footage_link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 underline font-mono text-[11px]"
                                  >
                                    Open Drive Link ↗
                                  </a>
                                ) : (
                                  <span className="text-amber-500/80 italic text-[11px]">Not Uploaded Yet</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {hasLink ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                                    ✅ Uploaded
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold">
                                    ❌ Missing
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* PROOF REVIEWS SECTION - Hidden per UI requirement */}
              {false && (
                <div className="space-y-4">
                  <h4 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-800 pb-1">
                    📷 Staff Uploaded Proofs & Link Review
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    
                    {/* 1. Asset Collection Photo Proof */}
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-2">
                      <div className="text-[11px] font-bold text-zinc-300 flex justify-between items-center">
                        <span>Asset Collection Photo Proof</span>
                        {assetCollectionProof.photoUrl ? (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono">Uploaded</span>
                        ) : (
                          <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono">Not Uploaded</span>
                        )}
                      </div>
                      {assetCollectionProof.photoUrl ? (
                        <SafeProofImage url={assetCollectionProof.photoUrl} alt="Asset Collection" label="View Full Photo ↗" />
                      ) : (
                        <div className="h-20 bg-zinc-900/50 border border-dashed border-zinc-800 rounded-lg flex items-center justify-center text-[11px] text-zinc-500 italic">
                          No proof photo found
                        </div>
                      )}
                    </div>

                    {/* 2. Event Start Photo Proof */}
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-2">
                      <div className="text-[11px] font-bold text-zinc-300 flex justify-between items-center">
                        <span>Event Start Photo Proof</span>
                        {eventStartProof.photoUrl ? (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono">Uploaded</span>
                        ) : (
                          <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono">Not Uploaded</span>
                        )}
                      </div>
                      {eventStartProof.photoUrl ? (
                        <SafeProofImage url={eventStartProof.photoUrl} alt="Event Start" label="View Full Photo ↗" />
                      ) : (
                        <div className="h-20 bg-zinc-900/50 border border-dashed border-zinc-800 rounded-lg flex items-center justify-center text-[11px] text-zinc-500 italic">
                          No proof photo found
                        </div>
                      )}
                    </div>

                    {/* 3. Event Completion Photo Proof */}
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-2">
                      <div className="text-[11px] font-bold text-zinc-300 flex justify-between items-center">
                        <span>Event Completion Photo Proof</span>
                        {eventCompletionProof.photoUrl ? (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono">Uploaded</span>
                        ) : (
                          <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono">Not Uploaded</span>
                        )}
                      </div>
                      {eventCompletionProof.photoUrl ? (
                        <SafeProofImage url={eventCompletionProof.photoUrl} alt="Event Completion" label="View Full Photo ↗" />
                      ) : (
                        <div className="h-20 bg-zinc-900/50 border border-dashed border-zinc-800 rounded-lg flex items-center justify-center text-[11px] text-zinc-500 italic">
                          No proof photo found
                        </div>
                      )}
                    </div>

                    {/* 4. Equipment Handover Photo Proof (Optional) */}
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-2">
                      <div className="text-[11px] font-bold text-zinc-300 flex justify-between items-center">
                        <span>Equipment Handover Photo <span className="text-zinc-500 font-normal">(Optional)</span></span>
                        {equipmentHandoverProof.photoUrl ? (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono">Handover Completed</span>
                        ) : (
                          <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono">Equipment Not Handover</span>
                        )}
                      </div>
                      {equipmentHandoverProof.photoUrl ? (
                        <SafeProofImage url={equipmentHandoverProof.photoUrl} alt="Equipment Handover" label="View Full Photo ↗" />
                      ) : (
                        <div className="h-20 bg-zinc-900/50 border border-dashed border-zinc-800 rounded-lg flex flex-col items-center justify-center text-[11px] text-zinc-500 p-2 text-center">
                          <span>Equipment Not Handover</span>
                          <span className="text-[9px] text-zinc-600 mt-0.5">(Optional for verification)</span>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* UPLOAD FINAL CONSOLIDATED RAW FOOTAGE STEP */}
              {!allCrewVerified ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-300 text-xs flex items-center gap-2">
                  <span>⚠️</span> Please verify each assigned crew member's Raw Footage link before uploading the final raw footage.
                </div>
              ) : (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (isSaving) return;

                  if (!consolidatedDriveLink || !consolidatedDriveLink.trim()) {
                    alert("Please provide the Consolidated Drive Link before verifying.");
                    return;
                  }

                  try {
                    setIsSaving(true);
                    const timestamp = new Date().toISOString();

                    // Call confirmRawFootageReceived to move to Verified Footage and Production
                    await confirmRawFootageReceived(
                      receivingFootageOrderId,
                      consolidatedDriveLink,
                      'Google Drive',
                      `Verified Footage with Consolidated Link: ${consolidatedDriveLink}`,
                      undefined,
                      undefined,
                      undefined
                    );

                    setReceivingFootageOrderId(null);
                    setConsolidatedDriveLink('');
                    setFootageForm({ footage_link: '', storage_type: 'Google Drive', upload_notes: '' });
                    
                    await refreshData();
                    alert("✅ Raw Footage Verified Successfully! Order transferred to Production Dashboard.");
                  } catch (err: any) {
                    console.error("Failed to verify raw footage:", err);
                    alert("Failed to verify raw footage: " + (err.message || "Please try again."));
                  } finally {
                    setIsSaving(false);
                  }
                }} className="space-y-4 pt-3 border-t border-zinc-800">

                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                      <span>🎬</span> Upload Final Consolidated Raw Footage
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-300 uppercase font-mono mb-1.5 flex items-center justify-between">
                        <span>Final Consolidated Drive Link <span className="text-rose-400">*</span></span>
                        <span className="text-[10px] text-zinc-500 font-sans font-normal">Required for Production Team</span>
                      </label>
                      <input
                        type="url"
                        required
                        value={consolidatedDriveLink}
                        onChange={(e) => setConsolidatedDriveLink(e.target.value)}
                        placeholder="https://drive.google.com/drive/folders/..."
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/80">
                      <button
                        type="button"
                        onClick={() => {
                          setReceivingFootageOrderId(null);
                          setConsolidatedDriveLink('');
                        }}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving || !consolidatedDriveLink.trim()}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer shadow-lg shadow-purple-600/20 flex items-center gap-2"
                      >
                        {isSaving ? 'Saving & Transferring...' : 'Upload Final Raw Footage & Move to Production 🚀'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

            </div>
          </div>
        , document.body);
      })()}

      {/* Staff Assignment Success Modal */}
      {successModalData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full w-full max-w-md shadow-2xl p-6 relative animate-in zoom-in duration-200">
            <button 
              onClick={() => setSuccessModalData(null)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white font-bold cursor-pointer transition-colors p-1"
              type="button"
            >
              ✕
            </button>
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/25 rounded-full flex items-center justify-center mx-auto text-emerald-400 text-xl font-bold">
                ✓
              </div>
              <h3 className="text-base font-bold text-white">
                ✅ Staff assigned successfully.
              </h3>
              <p className="text-xs text-zinc-400">
                Roster updated for order <span className="font-mono text-indigo-400 font-bold">{successModalData.orderId}</span>.
              </p>

              {/* Share via WhatsApp section */}
              <div className="bg-zinc-950/50 border border-zinc-850 rounded-2xl p-4 text-left space-y-3">
                <h4 className="text-[10px] font-mono font-bold uppercase text-emerald-400 tracking-wider">
                  📱 Share via WhatsApp
                </h4>
                
                {(() => {
                  const assignedStaffNames = getAssignedStaffNamesForOrder(successModalData.order);

                  if (assignedStaffNames.length === 0) {
                    return (
                      <div className="text-xs text-zinc-500 italic">No staff assigned yet.</div>
                    );
                  }

                  return (
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {assignedStaffNames.map((name, idx) => {
                        const stObj = staff?.find(s => s.name === name);
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 bg-zinc-900/50 rounded-xl border border-zinc-800/60">
                            <div>
                              <div className="text-xs font-bold text-white">{name}</div>
                              {stObj?.role && <div className="text-[9.5px] text-zinc-500 font-mono">{stObj.role}</div>}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const leadForOrd = leads.find(l => l.lead_id === successModalData.order.lead_id);
                                const msgText = generateWhatsAppMessageForStaff(successModalData.order, name, undefined, leadForOrd);
                                const url = `https://wa.me/?text=${encodeURIComponent(msgText)}`;
                                window.open(url, '_blank');
                              }}
                              className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-colors"
                            >
                              Share
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setSuccessModalData(null)}
                  className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Staff WhatsApp Share picker */}
      {whatsappShareModalData && createPortal(
        <div id="personalized-whatsapp-share-modal-overlay" className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div ref={whatsappModalRef} id="personalized-whatsapp-share-modal-card" className="bg-zinc-900 border border-zinc-800 rounded-2xl sm:rounded-3xl w-full max-w-2xl shadow-2xl p-4 sm:p-6 relative animate-in zoom-in duration-200 flex flex-col max-h-[92dvh] sm:max-h-[90vh] my-auto">
            <button 
              onClick={() => setWhatsappShareModalData(null)}
              className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white font-bold cursor-pointer transition-colors rounded-lg hover:bg-zinc-800"
              type="button"
              aria-label="Close modal"
            >
              ✕
            </button>
            
            <div className="flex items-center gap-2.5 mb-3 sm:mb-4 border-b border-zinc-800 pb-3 pr-8 sm:pr-0">
              <span className="text-xl shrink-0">📱</span>
              <div className="text-left min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  Personalized WhatsApp Share
                </h3>
                <p className="text-[10px] sm:text-[11px] text-zinc-400 truncate">
                  Review and share work assignments for Order <span className="font-mono text-indigo-400 font-bold">{whatsappShareModalData.orderId}</span>
                </p>
              </div>
            </div>

            <div ref={whatsappScrollRef} className="overflow-y-auto space-y-4 sm:space-y-5 flex-1 pr-1 text-left">
              {whatsappShareModalData.staffNames.filter(name => {
                const st = staff?.find(s => s.name === name);
                return st?.department === 'Operations';
              }).length === 0 ? (
                <div className="text-center py-8 text-zinc-500 italic text-xs font-mono">
                  No staff assigned yet.
                </div>
              ) : (
                whatsappShareModalData.staffNames.filter(name => {
                  const st = staff?.find(s => s.name === name);
                  return st?.department === 'Operations';
                }).map((name, idx) => {
                  const stObj = staff?.find(s => s.name === name);
                  const isSelected = !!selectedStaffForShare[name];
                  const msgText = editedMessages[name] || '';

                  return (
                    <div 
                      key={idx} 
                      className={`border rounded-xl sm:rounded-2xl p-3.5 sm:p-4 transition-all duration-200 ${
                        isSelected 
                          ? 'bg-zinc-950/65 border-zinc-800/80 shadow-md' 
                          : 'bg-zinc-900/30 border-zinc-850/40 opacity-60'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStaffForShare(prev => ({
                                ...prev,
                                [name]: !prev[name]
                              }));
                            }}
                            className="text-lg text-indigo-400 hover:text-indigo-300 transition-all active:scale-90 cursor-pointer pt-0.5 shrink-0"
                          >
                            {isSelected ? '☑️' : '⬛'}
                          </button>
                          
                          <div className="min-w-0">
                            <div className="flex items-center flex-wrap gap-1.5">
                              <span className="text-xs font-black text-white">{name}</span>
                              {stObj?.role && (
                                <span className="text-[9.5px] font-mono text-zinc-400 bg-zinc-850 px-1.5 py-0.5 rounded border border-zinc-800">
                                  {stObj.role}
                                </span>
                              )}
                            </div>
                            {stObj?.mobile && (
                              <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1 mt-0.5">
                                📱 {stObj.mobile}
                              </div>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <button
                            type="button"
                            onClick={() => {
                              const cleanPhone = stObj?.mobile ? stObj.mobile.replace(/\D/g, '') : '';
                              const shareUrl = cleanPhone 
                                ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msgText)}`
                                : `https://wa.me/?text=${encodeURIComponent(msgText)}`;
                              window.open(shareUrl, '_blank');
                            }}
                            className="w-full sm:w-auto px-4 py-2 sm:py-1.5 bg-[#25D366] hover:bg-[#20ba5a] active:scale-95 text-black font-extrabold text-xs sm:text-[11px] rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-[#25D366]/10 hover:shadow-[#25D366]/25 transition-all cursor-pointer shrink-0"
                          >
                            <span className="text-xs">📲</span> Share on WhatsApp
                          </button>
                        )}
                      </div>

                      {isSelected && (
                        <div className="space-y-1.5">
                          <label className="text-[9.5px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                            📝 Edit Message Preview:
                          </label>
                          <textarea
                            value={msgText}
                            onChange={(e) => {
                              setEditedMessages(prev => ({
                                ...prev,
                                [name]: e.target.value
                              }));
                            }}
                            rows={6}
                            className="w-full bg-zinc-950 border border-zinc-850 text-zinc-300 text-xs font-mono p-3 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-y leading-relaxed"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 sm:pt-4 border-t border-zinc-800 mt-3 sm:mt-4 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setWhatsappShareModalData(null)}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-zinc-800 hover:bg-zinc-700 active:scale-98 text-zinc-300 text-xs font-mono font-bold rounded-xl transition-all cursor-pointer text-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Assigned Staff Popup (Triggered by Team Count click) */}
      {viewingStaffOrderId && (() => {
        try {
          const ord = orders.find(o => o.order_id === viewingStaffOrderId);
          if (!ord) return null;
          const ordLead = leads?.find(l => (ord.lead_id && l.lead_id === ord.lead_id) || l.order_id === ord.order_id);
          const staffDetails = getAssignedStaffDetailsForOrder(ord);

          const closeStaffModal = () => {
            setViewingStaffOrderId(null);
            setViewingStaffEventId(null);
          };

          // Resolve events strictly per order/lead
          const allOrderEvs = getOrderEventsList(ord, ordLead);
          const resolvedEvents = sortEventsNewestFirst(allOrderEvs);

          // Strictly filter to the selected event if an event count was clicked
          const isMatchEvent = (ev: any, evIdx: number) => {
            if (!viewingStaffEventId) return true;
            const target = viewingStaffEventId.trim();
            const evId = String(ev.id || ev.event_id || `ev_${evIdx}`).trim();
            const rawId = ev.id ? String(ev.id).trim() : '';
            const rawEvId = ev.event_id ? String(ev.event_id).trim() : '';
            return (
              evId === target ||
              rawId === target ||
              rawEvId === target ||
              `ev_${evIdx}` === target ||
              evId.toLowerCase() === target.toLowerCase() ||
              rawId.toLowerCase() === target.toLowerCase() ||
              rawEvId.toLowerCase() === target.toLowerCase()
            );
          };

          const matchedEvents = viewingStaffEventId
            ? resolvedEvents.filter((ev: any, idx: number) => isMatchEvent(ev, idx))
            : resolvedEvents;

          const eventsToDisplay = (viewingStaffEventId && matchedEvents.length > 0)
            ? matchedEvents
            : (viewingStaffEventId ? [] : resolvedEvents);

          // Strictly build event groups mapped by event ID
          const eventGroups = eventsToDisplay.map((ev: any, displayIdx: number) => {
            const originalEvIdx = resolvedEvents.indexOf(ev) >= 0 ? resolvedEvents.indexOf(ev) : displayIdx;
            const evId = String(ev.id || ev.event_id || `ev_${originalEvIdx}`).trim();
            const eventName = ev.event_name || ev.event_type || ord.event_type || `Event ${originalEvIdx + 1}`;
            const eventDate = ev.event_date || ord.event_date || '';

            // Collect IDs of other events to strictly prevent cross-event staff leakage
            const otherEventIds = new Set(
              resolvedEvents
                .filter((_, oIdx) => oIdx !== originalEvIdx)
                .flatMap((oe, oIdx) => [
                  String(oe.id || '').trim(),
                  String(oe.event_id || '').trim(),
                  `ev_${oIdx}`
                ])
                .filter(Boolean)
            );

            const thisEventIds = new Set([
              evId,
              ev.id ? String(ev.id).trim() : '',
              ev.event_id ? String(ev.event_id).trim() : '',
              `ev_${originalEvIdx}`
            ].filter(Boolean));

            // Filter assigned staff strictly matching this specific event ID
            const members = staffDetails.filter(sd => {
              const sdEvId = String(sd.event_id || '').trim();
              if (sdEvId) {
                if (otherEventIds.has(sdEvId)) return false;
                return (
                  thisEventIds.has(sdEvId) ||
                  (resolvedEvents.length === 1)
                );
              }
              if (resolvedEvents.length === 1) return true;
              return false;
            });

            return {
              eventId: evId,
              eventName,
              eventDate,
              rawEvent: ev,
              members
            };
          });

          return createPortal(
            <div 
              className="fixed inset-0 z-[999999] w-screen h-screen h-[100dvh] max-h-[100dvh] max-w-[100vw] bg-black/90 backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-150 overscroll-none"
              style={{ width: '100vw', height: '100vh', maxHeight: '100dvh' }}
              onClick={(e) => {
                if (e.target === e.currentTarget) closeStaffModal();
              }}
            >
              <div className="bg-zinc-900 w-full h-full flex-1 flex flex-col min-h-0 min-w-0 max-h-full max-w-full relative overflow-hidden text-left shadow-2xl">
                {/* Pinned Responsive Header */}
                <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/95 backdrop-blur-md shrink-0 z-30 w-full min-w-0">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 mr-3">
                    <span className="text-lg sm:text-xl shrink-0">👥</span>
                    <div className="text-left min-w-0 flex-1">
                      <h3 className="text-sm sm:text-base md:text-lg font-bold text-white font-sans truncate">
                        Assigned Team Members
                      </h3>
                      <p className="text-[10px] sm:text-xs text-zinc-400 truncate">
                        Order <span className="font-mono text-indigo-400 font-bold">{ord.order_id}</span> • {ord.customer_name}
                        {eventsToDisplay.length === 1 && (
                          <> • <span className="text-indigo-400 font-bold">{eventsToDisplay[0].event_name || eventsToDisplay[0].event_type || 'Event'}</span>{eventsToDisplay[0].event_date ? ` (${formatDateDDMMYY(eventsToDisplay[0].event_date)})` : ''}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={closeStaffModal}
                    className="text-zinc-400 hover:text-white font-bold cursor-pointer transition-colors p-1.5 sm:p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-sm shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 active:scale-95"
                    type="button"
                    title="Close Modal"
                  >
                    ✕
                  </button>
                </div>

              {/* Full-Screen Scrollable Content Area */}
              <div 
                className="w-full flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8 text-left scrollbar-thin overscroll-contain touch-pan-y" 
                style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
              >
                <div className="w-full space-y-4 sm:space-y-6 pb-6">
                {eventGroups.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 italic text-xs font-mono">
                    No staff assigned yet.
                  </div>
                ) : (
                  eventGroups.map((group, evIdx) => {
                    const members = group.members;
                    return (
                      <div key={evIdx} className="bg-zinc-950/40 border border-zinc-850/60 rounded-2xl p-3 sm:p-4 md:p-5 space-y-3 w-full min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800/80 pb-2.5 gap-2">
                          <h4 className="text-xs sm:text-sm font-bold text-indigo-400 font-sans flex items-center gap-1.5 truncate">
                            🎬 {group.eventName}
                          </h4>
                          <div className="flex flex-wrap items-center gap-3 text-[10px] sm:text-xs font-mono text-zinc-400">
                            {group.eventDate && <span>📅 Event: {formatDateDDMMYY(group.eventDate)}</span>}
                            {group.rawEvent?.reporting_date && <span>⏱️ Rep. Date: {formatDateDDMMYY(group.rawEvent.reporting_date)}</span>}
                            {group.rawEvent?.reporting_time && <span>⏰ Rep. Time: {formatTime12Hour(group.rawEvent.reporting_time)}</span>}
                          </div>
                        </div>
                        {(group.rawEvent?.event_location || group.rawEvent?.event_address) && (
                          <div className="text-[11px] text-zinc-300 font-sans">
                            📍 <span className="text-zinc-400">Location:</span> {group.rawEvent.event_location || group.rawEvent.event_address}
                          </div>
                        )}

                        {members.length === 0 ? (
                          <div className="text-center py-6 text-zinc-500 italic text-xs font-mono">
                            No staff assigned for this event yet.
                          </div>
                        ) : (
                          <div 
                            className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/60 mt-2 scrollbar-thin w-full max-w-full"
                            style={{ WebkitOverflowScrolling: 'touch' }}
                          >
                            <table className="w-full text-left border-collapse min-w-max">
                              <thead>
                                <tr className="bg-zinc-950/80 border-b border-zinc-800 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                                  <th className="py-2.5 px-3.5 font-bold whitespace-nowrap">Staff Name</th>
                                  <th className="py-2.5 px-3.5 font-bold whitespace-nowrap">Assigned Task</th>
                                  <th className="py-2.5 px-3.5 font-bold text-center whitespace-nowrap">Task Status</th>
                                  <th className="py-2.5 px-3.5 font-bold text-center whitespace-nowrap">Equipment</th>
                                  <th className="py-2.5 px-3.5 font-bold text-center whitespace-nowrap">Equipment Status</th>
                                  <th className="py-2.5 px-3.5 font-bold text-center whitespace-nowrap">Event Images</th>
                                  <th className="py-2.5 px-3.5 font-bold text-center whitespace-nowrap">Raw Footage</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800/60 text-xs">
                                {members.map((member, mIdx) => {
                                  const saRecord = staffAssignments?.find(sa => sa.assignment_id === member.assignment_id);
                                  const normStaffName = (member.staff_name || '').trim().toLowerCase();
                                  const normEvName = (group.eventName || '').trim().toLowerCase();
                                  const memberEvId = group.eventId;

                                  const rowEqKey = `${ord.order_id}-${memberEvId}-${member.staff_name}-${mIdx}`;
                                  const isEqOpen = openEquipmentDropdownKey === rowEqKey;

                                  const getRecordForStage = (stages: string[], equipName?: string) => {
                                    if (!leadEquipmentHistory || leadEquipmentHistory.length === 0) return null;
                                    const matches = leadEquipmentHistory.filter(h => {
                                      if (h.order_id && h.order_id !== ord.order_id && (!ord.lead_id || h.lead_id !== ord.lead_id)) return false;
                                      if (!h.order_id && h.lead_id && ord.lead_id && h.lead_id !== ord.lead_id) return false;
                                      
                                      let parsed: any = {};
                                      if (h.remarks) {
                                        try { parsed = JSON.parse(h.remarks); } catch(e) {}
                                      }

                                      const hAssignmentId = h.assignment_id || parsed.assignment_id;
                                      if (member.assignment_id && hAssignmentId) {
                                        if (member.assignment_id !== hAssignmentId) return false;
                                      } else {
                                        const hEventId = parsed.event_id || h.event_id;
                                        if (memberEvId && memberEvId !== 'gen' && hEventId && hEventId !== 'gen' && hEventId !== memberEvId && hEventId !== `ev_${evIdx}`) return false;
                                        const hRole = parsed.staff_role || h.staff_role;
                                        if (hRole && member.staff_role && hRole.trim().toLowerCase() !== member.staff_role.trim().toLowerCase()) return false;
                                      }

                                      const retBy = (h.returned_by || parsed.staff_name || parsed.uploaded_by || '').trim().toLowerCase();
                                      if (!retBy || !normStaffName || (retBy !== normStaffName && !normStaffName.includes(retBy) && !retBy.includes(normStaffName))) {
                                        return false;
                                      }

                                      const hEventId = parsed.event_id || h.event_id;
                                      const hEventName = parsed.event_name || h.event_name;
                                      const hProofType = (parsed.proof_type || h.proof_type || '').toLowerCase().trim();
                                      const eqName = (h.equipment_name || '').toLowerCase().trim();
                                      const eqStatus = (h.equipment_status || '').toLowerCase().trim();
                                      
                                      const isSearchingReceived = stages.some(s => s.toLowerCase().includes('received') || s.toLowerCase().includes('asset collection'));
                                      const isSearchingHandover = stages.some(s => s.toLowerCase().includes('handover') || s.toLowerCase().includes('return'));
                                      const isSearchingStart = stages.some(s => s.toLowerCase().includes('start'));
                                      const isSearchingEnd = stages.some(s => s.toLowerCase().includes('complete') || s.toLowerCase().includes('end'));

                                      const isRecordHandover = eqName.includes('handover') || eqName.includes('asset return') || eqStatus.includes('handover') || eqStatus.includes('return') || hProofType.includes('handover') || hProofType.includes('return');
                                      const isRecordReceived = eqName.includes('asset collection') || eqName.includes('equipment received') || eqStatus.includes('asset collected') || eqStatus.includes('received') || hProofType.includes('asset collection') || hProofType.includes('received');
                                      const isRecordStart = eqName.includes('event start') || eqStatus.includes('event start') || hProofType.includes('event start');
                                      const isRecordEnd = eqName.includes('event completion') || eqName.includes('event end') || eqStatus.includes('event complete') || eqStatus.includes('event ended') || hProofType.includes('event end') || hProofType.includes('event complete');

                                      if (isSearchingReceived && (isRecordHandover || isRecordEnd || isRecordStart)) return false;
                                      if (isSearchingHandover && (isRecordReceived || isRecordStart || isRecordEnd)) return false;
                                      if (isSearchingStart && (isRecordHandover || isRecordEnd || isRecordReceived)) return false;
                                      if (isSearchingEnd && (isRecordReceived || isRecordStart || isRecordHandover)) return false;
                                      
                                      // Match event Id strictly if both exist and neither is 'gen'
                                      if (memberEvId && hEventId && memberEvId !== 'gen' && hEventId !== 'gen' && hEventId !== memberEvId && hEventId !== `ev_${evIdx}`) {
                                        return false;
                                      }

                                      if (equipName && eqName.includes(equipName.toLowerCase())) {
                                        return true; 
                                      }

                                      const stageMatch = stages.some(s => {
                                        const sNorm = s.toLowerCase();
                                        return eqStatus === sNorm || eqStatus.includes(sNorm) || eqName.includes(sNorm) || hProofType.includes(sNorm);
                                      });

                                      return stageMatch;
                                    });

                                    if (matches.length === 0) return null;
                                    // Prioritize most recent upload with uploaded photo
                                    const sorted = [...matches].sort((a, b) => {
                                      const getTs = (rec: any) => {
                                        let p: any = {};
                                        if (rec.remarks) { try { p = typeof rec.remarks === 'string' ? JSON.parse(rec.remarks) : rec.remarks; } catch (e) {} }
                                        const ts = p?.uploaded_at || rec.returned_at || rec.created_at;
                                        return ts ? new Date(ts).getTime() : 0;
                                      };
                                      return getTs(b) - getTs(a);
                                    });
                                    const withPhoto = sorted.find(m => {
                                      const meta = getRecordMeta(m);
                                      return !!meta.url;
                                    });
                                    return withPhoto || sorted[0];
                                  };

                                  const assetCollection = getRecordForStage(['Equipment Received', 'Asset Collection Photo Proof', 'Asset Collection', 'Received', 'Equipment Received / Asset Picture'], 'Asset Collection');
                                  const evStart = getRecordForStage(['Event Start', 'Event Started', 'Event Start Photo Proof'], 'Event Start');
                                  const evEnd = getRecordForStage(['Event Complete', 'Event Completed', 'Event End', 'Event Ended', 'Event Completion Photo Proof', 'Event End Photo Proof'], 'Event End');
                                  const eqHandover = getRecordForStage(['Equipment Handover', 'Equipment Handover Photo Proof', 'Equipment Handover Completed', 'Footage Handover', 'Asset Return Photo Proof', 'Handover', 'Returned'], 'Equipment Handover');

                                  // 1. Real-time individual staff status for this event (Event Workflow)
                                  const rawTaskStatus = getStaffTaskStatus(ord.order_id, memberEvId, evIdx, member.staff_name, ord, member.assignment_id, member.staff_role);
                                  const staffStatusText = rawTaskStatus && rawTaskStatus !== 'Pending' ? rawTaskStatus : 'Assigned Crew';

                                let statusBadge = (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-[11px]">
                                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                                    {staffStatusText}
                                  </span>
                                );
                                if (staffStatusText.toLowerCase().includes('complete') || staffStatusText.toLowerCase().includes('ended')) {
                                  statusBadge = (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[11px]">
                                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                                      {staffStatusText}
                                    </span>
                                  );
                                } else if (staffStatusText.toLowerCase().includes('start') || staffStatusText.toLowerCase().includes('progress')) {
                                  statusBadge = (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold text-[11px]">
                                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                                      {staffStatusText}
                                    </span>
                                  );
                                } else if (staffStatusText.toLowerCase().includes('handover') || staffStatusText.toLowerCase().includes('verified')) {
                                  statusBadge = (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold text-[11px]">
                                      <span className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
                                      {staffStatusText}
                                    </span>
                                  );
                                }

                                // 2. Equipment Resolution & Status
                                let effectiveAssignedEq = member.assigned_equipment && Array.isArray(member.assigned_equipment) ? [...member.assigned_equipment] : [];

                                // Filter out invalid/empty placeholder names
                                effectiveAssignedEq = effectiveAssignedEq.filter(item => item && item.trim() && item.trim().toLowerCase() !== 'none' && item.trim().toLowerCase() !== 'not assigned' && item.trim().toLowerCase() !== 'null' && item.trim().toLowerCase() !== 'undefined');

                                if (effectiveAssignedEq.length === 0 && member.staff_name && ord) {
                                  effectiveAssignedEq = resolveStaffEquipment(member.staff_name, ord, member, group.rawEvent, mIdx);
                                }

                                const hasEqAssigned = effectiveAssignedEq.length > 0;

                                let equipmentStatusText = hasEqAssigned ? 'Assigned' : 'No Equipment Assigned';
                                if (hasEqAssigned) {
                                  const receivedPhotoUrl = saRecord?.equipment_received_photo;
                                  const handoverPhotoUrl = saRecord?.equipment_handover_photo;

                                  const hasHandoverPhoto = (eqHandover && getRecordMeta(eqHandover).url) || handoverPhotoUrl;
                                  const isHandoverDone = (eqHandover && (
                                    hasHandoverPhoto || 
                                    eqHandover.equipment_status?.toLowerCase().includes('handover') || 
                                    eqHandover.equipment_status?.toLowerCase().includes('returned') ||
                                    eqHandover.equipment_status === 'Equipment Handover Completed'
                                  )) || !!handoverPhotoUrl;

                                  const hasReceivedPhoto = (assetCollection && getRecordMeta(assetCollection).url) || receivedPhotoUrl;
                                  const isReceivedDone = (assetCollection && (
                                    hasReceivedPhoto || 
                                    assetCollection.equipment_status?.toLowerCase().includes('received') ||
                                    assetCollection.equipment_status === 'Equipment Received'
                                  )) || !!receivedPhotoUrl;

                                  if (isHandoverDone) {
                                    equipmentStatusText = hasHandoverPhoto ? '✅ Handed Over' : 'Assigned / Handed Over';
                                  } else if (isReceivedDone) {
                                    equipmentStatusText = hasReceivedPhoto ? '✅ Received' : 'Assigned / Received';
                                  } else {
                                    equipmentStatusText = 'Assigned';
                                  }
                                }

                                // 3. Event Image Status Text
                                const evStartPhotoUrl = saRecord?.event_start_photo;
                                const evEndPhotoUrl = saRecord?.event_end_photo;

                                let eventImageStatusText = '❌ Pending';
                                if ((evEnd && getRecordMeta(evEnd).url) || evEndPhotoUrl) eventImageStatusText = '✅ Event End';
                                else if ((evStart && getRecordMeta(evStart).url) || evStartPhotoUrl) eventImageStatusText = '✅ Event Start';

                                // 4. Raw Footage Link
                                 let rawFootageLink: string | null = null;
                                if (rawFootage && rawFootage.length > 0) {
                                  const rfMatch = rawFootage.find(rf => {
                                    if (rf.order_id !== ord.order_id) return false;
                                    if (member.assignment_id && rf.assignment_id && rf.assignment_id === member.assignment_id) return true;
                                    if (memberEvId && memberEvId !== 'ev' && memberEvId !== 'gen' && rf.event_id && rf.event_id === memberEvId) {
                                      const rfStaff = (rf.staff_name || rf.uploaded_by || '').trim().toLowerCase();
                                      if (!rfStaff || rfStaff === normStaffName || rfStaff.includes(normStaffName) || normStaffName.includes(rfStaff)) return true;
                                    }
                                    return false;
                                  });
                                  if (rfMatch) {
                                    rawFootageLink = rfMatch.server_path || rfMatch.drive_link || null;
                                  }
                                }
                                if (!rawFootageLink && staffAssignments && staffAssignments.length > 0) {
                                  const saMatch = staffAssignments.find(sa => {
                                    if (sa.order_id !== ord.order_id) return false;
                                    const saLink = sa.raw_footage_link || (sa as any).drive_link || (sa as any).raw_footage_location;
                                    if (!saLink || !saLink.trim() || saLink.trim() === 'Pending') return false;
                                    if (member.assignment_id && sa.assignment_id && sa.assignment_id === member.assignment_id) return true;
                                    if (memberEvId && memberEvId !== 'ev' && memberEvId !== 'gen' && sa.event_id && sa.event_id === memberEvId) {
                                      const stName = (sa.staff_name || "").trim().toLowerCase();
                                      if (stName === normStaffName) return true;
                                    }
                                    return false;
                                  });
                                  if (saMatch) {
                                    const saLink = saMatch.raw_footage_link || (saMatch as any).drive_link || (saMatch as any).raw_footage_location;
                                    if (saLink && saLink.trim() && saLink.trim() !== 'Pending') {
                                      rawFootageLink = saLink.trim();
                                    }
                                  }
                                }

                                if (!rawFootageLink && leadEquipmentHistory && leadEquipmentHistory.length > 0) {
                                  const hMatch = leadEquipmentHistory.find(h => {
                                    if (h.order_id !== ord.order_id) return false;
                                    let parsed: any = {};
                                    if (h.remarks) {
                                      try { parsed = JSON.parse(h.remarks); } catch(e) {}
                                    }
                                    const rfLink = parsed.raw_footage_link || parsed.drive_link;
                                    if (!rfLink) return false;
                                    const hAssignmentId = parsed.assignment_id || h.assignment_id;
                                    if (member.assignment_id && hAssignmentId && hAssignmentId === member.assignment_id) return true;
                                    const hEventId = parsed.event_id || h.event_id;
                                    if (memberEvId && memberEvId !== 'ev' && memberEvId !== 'gen' && hEventId === memberEvId) {
                                      const retBy = (h.returned_by || parsed.staff_name || "").trim().toLowerCase();
                                      if (!retBy || retBy === normStaffName) return true;
                                    }
                                    return false;
                                  });
                                  if (hMatch && hMatch.remarks) {
                                    try {
                                      const parsed = JSON.parse(hMatch.remarks);
                                      rawFootageLink = parsed.raw_footage_link || parsed.drive_link || null;
                                    } catch (e) {}
                                  }
                                }

                                const rfVerification = leadEquipmentHistory?.find(h =>
                                  h.order_id === ord.order_id &&
                                  h.equipment_name === "Raw Footage Verification" &&
                                  (h.returned_by || "").trim().toLowerCase() === normStaffName &&
                                  (!member.assignment_id || (() => { try { return JSON.parse(h.remarks || "{}").assignment_id === member.assignment_id; } catch(e) { return false; } })()) &&
                                  (!memberEvId || (() => { try { return JSON.parse(h.remarks || "{}").event_id === memberEvId; } catch(e) { return false; } })())
                                );
                                const verificationStatus = rfVerification?.equipment_status || 'Pending Verification';

                                return (
                                  <tr key={member.assignment_id || `${group.eventId}_${member.staff_name}_${mIdx}`} className="hover:bg-zinc-800/30 transition-colors">
                                    {/* 1. Staff Name */}
                                    <td className="py-3 px-3.5 font-bold text-white font-sans whitespace-nowrap">
                                      {member.staff_name}
                                    </td>

                                    {/* 2. Assigned Task */}
                                    <td className="py-3 px-3.5 font-sans whitespace-nowrap">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-bold text-xs">
                                        {formatQtyItem(member.assigned_task || member.staff_role)}
                                      </span>
                                    </td>

                                    {/* 3. Task Status */}
                                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                      {statusBadge}
                                    </td>

                                    {/* 4. Equipment Column (Showing assigned equipment) */}
                                    <td className="py-3 px-3.5 text-center whitespace-nowrap relative">
                                      <EquipmentAssignedCell 
                                        equipmentList={effectiveAssignedEq} 
                                        equipmentStatusText={equipmentStatusText} 
                                      />
                                    </td>

                                    {/* 5. Equipment Status */}
                                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                      {hasEqAssigned ? (
                                        <button 
                                          type="button"
                                          onClick={() => {
                                            const eqToPass = effectiveAssignedEq.length > 0 ? effectiveAssignedEq : (member.assigned_equipment || []);
                                            member.effectiveAssignedEq = eqToPass;
                                            openEquipmentVerification(member, ord, memberEvId, assetCollection, eqHandover);
                                          }}
                                          className="cursor-pointer text-indigo-400 hover:text-indigo-300 underline font-bold text-xs"
                                          title="Click to view equipment verification images"
                                        >
                                          {equipmentStatusText}
                                        </button>
                                      ) : (
                                        <span className="text-zinc-500 font-semibold text-xs font-mono">
                                          No Equipment Assigned
                                        </span>
                                      )}
                                    </td>

                                    {/* 6. Event Images */}
                                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                      <button 
                                        type="button"
                                        onClick={() => setSelectedEventImages({ 
                                          staffName: member.staff_name, 
                                          orderId: ord.order_id,
                                          eventId: memberEvId,
                                          assignmentId: member.assignment_id,
                                          eventName: member.event_name,
                                          assetCollection, 
                                          evStart, 
                                          evEnd 
                                        })}
                                        className="cursor-pointer text-indigo-400 hover:text-indigo-300 underline font-bold text-xs"
                                      >
                                        {eventImageStatusText}
                                      </button>
                                    </td>

                                    {/* 7. Raw Footage */}
                                    <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                      {rawFootageLink ? (
                                        <div className="flex flex-col items-center gap-1.5">
                                          <a
                                            href={rawFootageLink.startsWith('http') ? rawFootageLink : `https://${rawFootageLink}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 underline font-bold text-xs font-mono"
                                          >
                                            ✅ Uploaded ↗
                                          </a>
                                          <div className="flex items-center gap-2">
                                             {verificationStatus === "Verified" && (
                                               <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">✅ Verified</span>
                                             )}
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-zinc-600 font-bold text-[11px]">❌ Pending</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        )}
                      </div>
                    );
                  })
                )}
                </div>
              </div>

              {/* Pinned Responsive Footer */}
              <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md shrink-0 z-30 flex items-center justify-end w-full min-w-0">
                <button
                  type="button"
                  onClick={closeStaffModal}
                  className="w-full sm:w-auto px-6 py-2 bg-zinc-800 hover:bg-zinc-700 active:scale-98 text-zinc-200 text-xs font-mono font-bold rounded-xl transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        , document.body);
        } catch (modalErr) {
          console.error("Error rendering Assigned Team modal:", modalErr);
          return createPortal(
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999999] flex items-center justify-center p-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full text-center space-y-4">
                <h3 className="text-base font-bold text-white">Assigned Team Details</h3>
                <p className="text-xs text-zinc-400">Unable to load team assignment details for this order.</p>
                <button 
                  onClick={() => {
                    setViewingStaffOrderId(null);
                    setViewingStaffEventId(null);
                  }}
                  className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl"
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>
          , document.body);
        }
      })()}

      {/* Busy Staff Roster Popup */}
      {busyRosterStaff && (() => {
        // Collect all assignments for this staff member (using same logic as Staff Directory)
        const roster: Array<{ orderId: string; eventName: string; date: string; time: string; }> = [];
        
        const staffSavedAssignments = (staffAssignments || []).filter(sa => 
          sa.staff_name.toLowerCase() === busyRosterStaff.toLowerCase() &&
          sa.assignment_status !== 'Cancelled'
        );
        
        staffSavedAssignments.forEach(sa => {
          const order = orderMap.get(sa.order_id);
          const lead = leadMap.get(order?.lead_id || sa.order_id);
          
          if (!order && !lead) return;
          
          const op = opMap.get(sa.order_id);
          const bookingStage = order?.current_stage || lead?.status || '';
          const eventStatus = op?.event_status || 'Assigned';
          
          const isCompletedOrCancelled = [
            'completed', 'event completed', 'raw footage received', 'event cancelled', 'closed', 'delivered', 'cancelled', 'lost lead'
          ].includes(bookingStage.toLowerCase()) || [
            'completed', 'event completed', 'cancelled'
          ].includes(eventStatus.toLowerCase());
          
          if (isCompletedOrCancelled) return;
          
          if (lead?.events && lead.events.length > 0) {
            lead.events.forEach((ev: any) => {
              roster.push({
                orderId: order?.order_id || lead.lead_id,
                eventName: ev.event_name || ev.event_type || 'N/A',
                date: ev.event_date || 'N/A',
                time: ev.reporting_time || ev.event_start_time || 'N/A'
              });
            });
          } else {
            roster.push({
              orderId: order?.order_id || lead?.lead_id || sa.order_id,
              eventName: lead?.custom_event_name || order?.event_type || lead?.event_type || 'N/A',
              date: lead?.event_date || order?.event_date || 'N/A',
              time: lead?.reporting_time || op?.reporting_time || 'N/A'
            });
          }
        });
        
        // Fast Deduplicate
        const seenKeys = new Set<string>();
        const uniqueRoster = roster.filter(r => {
          const key = `${r.orderId}_${r.eventName}_${r.date}_${r.time}`;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });
        roster.length = 0;
        uniqueRoster.forEach(r => roster.push(r));
        return createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-300">
                    {busyRosterStaff.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-0.5">Staff Member Assignments</span>
                    <h3 className="text-sm font-bold text-white tracking-wider flex items-center gap-2">
                      {busyRosterStaff}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBusyRosterStaff(null)}
                  className="text-zinc-500 hover:text-white font-bold cursor-pointer transition-colors p-1"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
                {roster.length === 0 ? (
                  <div className="text-xs text-zinc-500 italic text-center py-4">No assignments found for {busyRosterStaff}.</div>
                ) : (
                  roster.map((r, idx) => (
                    <div key={idx} className="bg-zinc-900/50 border border-zinc-800/80 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-700/80 transition-colors">
                      <div className="space-y-1">
                        <div className="text-[10px] text-zinc-500 font-mono tracking-wider">ORDER: <span className="text-zinc-300 font-bold">{r.orderId}</span></div>
                        <div className="text-xs text-zinc-100 font-bold">{r.eventName}</div>
                      </div>
                      <div className="flex items-center gap-3 bg-zinc-950 p-2 rounded-lg border border-zinc-800/80">
                        <div className="flex flex-col">
                           <span className="text-[9px] text-zinc-500 font-mono">DATE</span>
                           <span className="text-[11px] text-zinc-300 font-mono font-bold">{r.date ? (formatDateDDMMYY(r.date) || r.date) : '—'}</span>
                        </div>
                        <div className="w-px h-6 bg-zinc-800" />
                        <div className="flex flex-col">
                           <span className="text-[9px] text-zinc-500 font-mono">TIME</span>
                           <span className="text-[11px] text-zinc-300 font-mono font-bold">{r.time !== 'N/A' ? formatTime12Hour(r.time) : 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* View Details Modal */}
      <ViewDetailsModal
        isOpen={!!projectDossierId}
        onClose={() => setProjectDossierId(null)}
        orderId={projectDossierId}
      />

      {/* Floating Action Menu */}
      {activeMenuOrderId && createPortal(
        <div 
          className="fixed z-[9999] bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl p-2 text-left animate-in fade-in zoom-in-95 duration-150 flex flex-col overflow-hidden actions-menu-container"
          style={{
            left: `${menuCoords.left}px`,
            top: `${menuCoords.top}px`,
            width: `${menuCoords.width}px`,
            maxHeight: `${menuCoords.maxHeight}px`,
            transform: menuCoords.openUpward ? 'translateY(-100%)' : 'none',
          }}
        >
          <div className="px-3 py-1.5 border-b border-zinc-800/60 mb-1.5 flex justify-between items-center flex-shrink-0">
            <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-extrabold flex items-center gap-1.5">
              <span>🎯</span> Available Actions
            </span>
            <button
              onClick={() => setActiveMenuOrderId(null)}
              className="text-zinc-500 hover:text-white text-xs p-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto space-y-1 pr-0.5" style={{ maxHeight: `${(menuCoords.maxHeight || 280) - 40}px` }}>
            {activeMenuItems.map((act, aIdx) => (
              <button
                key={aIdx}
                type="button"
                onClick={act.onClick}
                className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-zinc-200 hover:bg-indigo-600/20 hover:text-indigo-300 active:bg-indigo-600/30 border border-transparent hover:border-indigo-500/30 transition-all cursor-pointer block whitespace-nowrap rounded-xl shadow-sm"
              >
                {act.label}
              </button>
            ))}
            {activeMenuItems.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500 italic font-mono text-center">
                No actions available
              </div>
            )}
          </div>
        </div>
      , document.body)}

      {/* Image Preview Modal */}
      {imagePreviewModal && createPortal(
        <div className="fixed inset-0 bg-black/95 backdrop-blur-lg z-[2147483647] flex flex-col items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl 2xl:max-w-6xl min-[1920px]:max-w-[1400px] min-[2560px]:max-w-[1800px] min-[3840px]:max-w-[2400px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in duration-200">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">{imagePreviewModal.stage}</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Uploaded by <strong className="text-indigo-400">{imagePreviewModal.staffName}</strong> • {imagePreviewModal.date} {imagePreviewModal.time}
                </p>
              </div>
              <button 
                onClick={() => setImagePreviewModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-zinc-950 overflow-hidden relative min-h-[300px] flex items-center justify-center">
              {imagePreviewModal.url ? (
                <img 
                  src={imagePreviewModal.url} 
                  alt={imagePreviewModal.stage} 
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                    const errDiv = document.createElement('div');
                    errDiv.className = 'text-center p-8';
                    errDiv.innerHTML = '<span class="text-3xl mb-2 block">⚠️</span><p class="text-zinc-400 font-mono text-sm">Image not found. Please verify the uploaded image URL.</p>';
                    target.parentElement?.appendChild(errDiv);
                  }}
                />
              ) : (
                <div className="text-center p-8">
                  <span className="text-3xl mb-2 block">⚠️</span>
                  <p className="text-zinc-400 font-mono text-sm">Image not found. Please verify the uploaded image URL.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* Event Categories / Types Modal */}
      {viewingEventCategoriesModal && createPortal(
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2147483647] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setViewingEventCategoriesModal(null)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/70">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white font-sans flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" /> Event Types
                </h3>
                <div className="text-xs text-zinc-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-indigo-400 font-bold bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
                    {viewingEventCategoriesModal.orderId}
                  </span>
                  {viewingEventCategoriesModal.customerName && (
                    <span className="text-zinc-300">• {viewingEventCategoriesModal.customerName}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingEventCategoriesModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-2.5 max-h-[60vh]">
              {sortEventsNewestFirst(viewingEventCategoriesModal.events).map((ev: any, idx: number) => {
                const typeName = (ev.event_type || ev.event_name || `Event ${idx + 1}`).trim();
                return (
                  <div 
                    key={ev.id || `${viewingEventCategoriesModal.orderId}_ev_${idx + 1}`}
                    className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                      <span className="text-xs font-bold text-zinc-100 font-sans truncate">
                        {typeName}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 sm:p-4 border-t border-zinc-800 bg-zinc-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingEventCategoriesModal(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Event Locations Modal */}
      {viewingLocationsModal && createPortal(
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2147483647] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setViewingLocationsModal(null)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/70">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white font-sans flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-400" /> Event Location
                </h3>
                <div className="text-xs text-zinc-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-indigo-400 font-bold bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
                    {viewingLocationsModal.orderId}
                  </span>
                  {viewingLocationsModal.customerName && (
                    <span className="text-zinc-300">• {viewingLocationsModal.customerName}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingLocationsModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 max-h-[60vh]">
              {sortEventsNewestFirst(viewingLocationsModal.events).map((ev: any, idx: number) => {
                const rawName = (ev.event_name || '').trim();
                let eventLabel = `Event ${idx + 1}`;
                if (rawName) {
                  if (/^Event\s*\d+/i.test(rawName)) {
                    eventLabel = rawName;
                  } else {
                    eventLabel = `Event ${idx + 1}: ${rawName}`;
                  }
                }
                const locValue = ev.event_location || '';
                return (
                  <div 
                    key={ev.id || `${viewingLocationsModal.orderId}_ev_${idx + 1}`}
                    className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-indigo-300 font-sans">
                        {eventLabel}
                      </span>
                    </div>
                    <div className="text-xs font-sans pt-0.5">
                      {(() => {
                        if (!locValue || !locValue.trim()) {
                          return <span className="text-zinc-600 italic">No location specified</span>;
                        }
                        if (isLocationUrl(locValue)) {
                          return (
                            <a
                              href={getLocationUrlHref(locValue)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 underline font-medium break-all"
                              title={locValue}
                            >
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" /> [Open Location Link]
                            </a>
                          );
                        }
                        return (
                          <div className="whitespace-pre-wrap break-words text-zinc-100">
                            {locValue}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 sm:p-4 border-t border-zinc-800 bg-zinc-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingLocationsModal(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Event Dates Modal */}
      {viewingDatesModal && createPortal(
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2147483647] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setViewingDatesModal(null)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/70">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white font-sans flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-400" /> Event Dates
                </h3>
                <div className="text-xs text-zinc-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-indigo-400 font-bold bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
                    {viewingDatesModal.orderId}
                  </span>
                  {viewingDatesModal.customerName && (
                    <span className="text-zinc-300">• {viewingDatesModal.customerName}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingDatesModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 max-h-[60vh]">
              {sortEventsNewestFirst(viewingDatesModal.events).map((ev: any, idx: number) => {
                const rawName = (ev.event_name || '').trim();
                let eventLabel = `Event ${idx + 1}`;
                if (rawName) {
                  if (/^Event\s*\d+/i.test(rawName)) {
                    eventLabel = rawName;
                  } else {
                    eventLabel = `Event ${idx + 1}: ${rawName}`;
                  }
                }
                const formattedDate = ev.event_date ? (formatOperationsEventDate(ev.event_date) || formatDateDDMMYY(ev.event_date) || ev.event_date) : '';
                return (
                  <div 
                    key={ev.id || `${viewingDatesModal.orderId}_ev_${idx + 1}`}
                    className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-bold text-indigo-300 font-sans">
                        {eventLabel}
                      </div>
                    </div>
                    <div className="font-mono text-xs font-bold text-zinc-100 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800 whitespace-nowrap">
                      {formattedDate || <span className="text-zinc-600 italic font-normal">—</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 sm:p-4 border-t border-zinc-800 bg-zinc-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingDatesModal(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
