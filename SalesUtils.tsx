import React, { useState, useEffect, useRef } from 'react';
import { AddNoteModal } from "./AddNoteModal";
import { createPortal } from 'react-dom';
import { useRole, mapUserFieldsFromDb, INITIAL_PACKAGES, getStatusRank, isFollowUpDateTimeReached } from './RoleContext';
export { INITIAL_PACKAGES };
import { supabaseClient } from '../supabaseClient';
import { 
  FileText, Plus, Edit, CheckSquare, Search, Filter, Ban, X, Phone, Mail, MapPin, Calendar, DollarSign, Clock, Users, ArrowRight, ChevronDown, ChevronUp, Check, Package, Trash, Trash2, Eye, Loader2, CheckCircle2, RefreshCw
} from 'lucide-react';
import { Lead, CurrentStage, LeadPackage, EVENT_TYPES, PACKAGE_CATEGORIES, ACTIVE_STAGE_GROUPS, LeadEvent } from '../types';
import { StatusText } from './ui/StatusText';
import { EventDropdownCell } from './EventDropdownCell';
import { UnifiedEventDropdownCell } from './UnifiedEventDropdownCell';
import { MultiSelectDropdown } from './ui/MultiSelectDropdown';
import { CameraLensStatsCard, CameraLensTheme } from './CameraLensStatsCard';
import { ListSortFilter, SortOrder } from './ui/ListSortFilter';

export const SHOOT_TYPES = [
  "CANDID PHOTOGRAPHY",
  "CINEMATOGRAPHY",
  "TRADITIONAL PHOTOGRAPHY",
  "TRADITIONAL VIDEOGRAPHY",
  "DRONEGRAPHY",
  "LIVE STREAMING",
  "SEMI CANDID PHOTOGRAPHY",
  "SEMI CANDID VIDEOGRAPHY",
  "STANDARD PHOTOGRAPHY",
  "STANDARD VIDEOGRAPHY"
];

import { formatINR, formatIndianPhoneNumber, validateIndianMobile, formatTime12Hour, getCustomers, triggerAutoScrollAndFocus, normalizeCategory, parseTeamMembers, formatQtyItem, formatQtyArray, formatQtyList, formatDateDDMMYY } from '../utils';
import { SalesCalendar } from './SalesCalendar';
import { CustomPackageMaster } from './CustomPackageMaster';
import { AddressAutocomplete } from './AddressAutocomplete';
import { jsPDF } from 'jspdf';

interface LocalEditableInputProps {
  value: string;
  disabled?: boolean;
  onChange: (val: string) => void;
  className?: string;
  list?: string;
  placeholder?: string;
  options?: string[];
}

export const LocalEditableInput: React.FC<LocalEditableInputProps> = ({ value, disabled, onChange, className, list, placeholder, options }) => {
  const [localVal, setLocalVal] = React.useState(value);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const latestValueRef = React.useRef(value);
  const autoListId = React.useId();

  React.useEffect(() => {
    latestValueRef.current = value;
    setLocalVal(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const newVal = e.target.value;
    setLocalVal(newVal);
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    timeoutRef.current = setTimeout(() => {
      if (newVal !== latestValueRef.current) {
        onChange(newVal);
      }
    }, 600);
  };

  const handleBlur = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (localVal !== value) {
      onChange(localVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (localVal !== value) {
        onChange(localVal);
      }
      e.currentTarget.blur();
    }
  };

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const datalistId = list || (options && options.length > 0 ? `datalist-${autoListId}` : undefined);

  return (
    <div className="flex-1 flex items-center gap-2">
      <input
        type="text"
        value={localVal}
        disabled={disabled}
        list={datalistId}
        placeholder={placeholder}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={className}
      />
      {options && options.length > 0 && !list && (
        <datalist id={datalistId}>
          {options.map((opt, idx) => (
            <option key={idx} value={opt} />
          ))}
        </datalist>
      )}
    </div>
  );
};

/**
 * Safely parse date and time components of an event into a timezone-agnostic millisecond timestamp.
 * Supports:
 * - Date: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, DD-MM-YY, and ISO datetime strings.
 * - Time: 12-hour (e.g., 11:32 AM, 12:33 AM, 12:31 AM, 12:00 PM) and 24-hour formats (e.g., 00:31, 14:30).
 * Uses Date.UTC to guarantee strictly chronological sorting with zero timezone offset shifts.
 */
export function getEventChronologicalTimestamp(event: any): number {
  if (!event || typeof event !== 'object') return Number.MAX_SAFE_INTEGER;

  // 1. Extract raw date string from all possible event date fields
  const rawDate = String(
    event.event_start_date ||
    event.event_date ||
    event.start_date ||
    event.date ||
    event.reporting_date ||
    ''
  ).trim();

  // 2. Extract raw time string from all possible event time fields
  let rawTime = String(
    event.event_start_time ||
    event.event_time ||
    event.start_time ||
    event.time ||
    event.reporting_time ||
    ''
  ).trim();

  let year = 0;
  let month = 1; // 1-12
  let day = 1;   // 1-31
  let hasDate = false;

  if (rawDate) {
    // Check if ISO timestamp or contains datetime (e.g., "2026-09-03T11:32:00" or "2026-09-03 11:32:00")
    const isoMatch = rawDate.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (isoMatch) {
      hasDate = true;
      year = parseInt(isoMatch[1], 10);
      month = parseInt(isoMatch[2], 10);
      day = parseInt(isoMatch[3], 10);
      if (!rawTime && isoMatch[4] !== undefined) {
        rawTime = `${isoMatch[4]}:${isoMatch[5] || '00'}${isoMatch[6] ? `:${isoMatch[6]}` : ''}`;
      }
    } else {
      // Check for DD/MM/YYYY or DD-MM-YYYY (e.g. 03/09/2026, 20-08-2026)
      const ddmmyyyyMatch = rawDate.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
      if (ddmmyyyyMatch) {
        hasDate = true;
        const p1 = parseInt(ddmmyyyyMatch[1], 10);
        const p2 = parseInt(ddmmyyyyMatch[2], 10);
        const p3 = parseInt(ddmmyyyyMatch[3], 10);
        year = p3;
        if (p1 > 12) {
          day = p1;
          month = p2;
        } else if (p2 > 12) {
          month = p1;
          day = p2;
        } else {
          // Standard DD/MM/YYYY
          day = p1;
          month = p2;
        }
      } else {
        // Check for DD-MM-YY (e.g. 03-09-26)
        const ddmmyyMatch = rawDate.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
        if (ddmmyyMatch) {
          hasDate = true;
          day = parseInt(ddmmyyMatch[1], 10);
          month = parseInt(ddmmyyMatch[2], 10);
          year = 2000 + parseInt(ddmmyyMatch[3], 10);
        }
      }
    }
  }

  if (!hasDate) {
    return Number.MAX_SAFE_INTEGER;
  }

  // 3. Parse Time (12-hour AM/PM or 24-hour)
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (rawTime) {
    const timeMatch = rawTime.match(/(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?\s*(AM|PM)?/i);
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10) || 0;
      minutes = parseInt(timeMatch[2], 10) || 0;
      seconds = parseInt(timeMatch[3], 10) || 0;
      const ampm = timeMatch[4] ? timeMatch[4].toUpperCase() : null;

      if (ampm === 'PM') {
        if (hours < 12) hours += 12;
      } else if (ampm === 'AM') {
        if (hours === 12) hours = 0;
      }
    }
  }

  return Date.UTC(year, month - 1, day, hours, minutes, seconds);
}

export function sortEventsAscending<T = any>(events: T[]): T[] {
  if (!events || !Array.isArray(events)) return [];
  return events
    .map((event, index) => ({ event, index, ts: getEventChronologicalTimestamp(event) }))
    .sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      return a.index - b.index;
    })
    .map(item => item.event);
}

export function parseQtyAndText(raw: any): { qty: number; text: string } {
  if (raw === null || raw === undefined) return { qty: 1, text: "" };

  let qty = 1;
  let text = "";

  if (typeof raw === "object") {
    const q = Number(raw.qty || raw.quantity || raw.count || 1);
    qty = isNaN(q) || q < 1 ? 1 : q;
    text = String(raw.name || raw.text || raw.deliverable || raw.title || raw.role || raw.member_name || "").trim();
    return { qty, text };
  } else {
    text = String(raw).trim();
  }

  if (!text) return { qty: 1, text: "" };

  // 1. Check for explicit (Qty: X), (quantity: X), (count: X), (Qty X) pattern anywhere in the string
  const mQty = text.match(/[\(\[-]?\s*(?:qty|quantity|count)\s*[:=]?\s*(\d+)\s*[\)\]\-]?/i);
  if (mQty && mQty[1]) {
    const parsedQty = parseInt(mQty[1], 10);
    const cleanText = text.replace(/[\(\[-]?\s*(?:qty|quantity|count)\s*[:=]?\s*\d+\s*[\)\]\-]?/gi, "").trim();
    return { qty: !isNaN(parsedQty) && parsedQty >= 1 ? parsedQty : 1, text: cleanText };
  }

  // 2. Explicit multiplier prefix: e.g. "2 x 4K Video", "2 × 16x20 Frame", "3 * Album"
  const multiplierMatch = text.match(/^(\d+)\s*[xX×\*]\s+(.+)$/);
  if (multiplierMatch) {
    const parsedQty = parseInt(multiplierMatch[1], 10);
    return { qty: !isNaN(parsedQty) && parsedQty >= 1 ? parsedQty : 1, text: multiplierMatch[2].trim() };
  }

  // 3. Pure digits alone: e.g. "2"
  if (/^\d+$/.test(text)) {
    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= 1 && num <= 999) {
      return { qty: num, text: "" };
    }
  }

  // 4. Leading quantity followed by space and dimension: e.g. "2 16x20 Frame"
  const qtyDimensionMatch = text.match(/^(\d+)\s+(\d+\s*[\*xX×]\s*\d+.*)$/);
  if (qtyDimensionMatch) {
    const parsedQty = parseInt(qtyDimensionMatch[1], 10);
    return { qty: !isNaN(parsedQty) && parsedQty >= 1 ? parsedQty : 1, text: qtyDimensionMatch[2].trim() };
  }

  // 5. Dimension specification alone: e.g. "16x20 Frame"
  const isLeadingDimension = /^\d+\s*[\*xX×]\s*\d+/.test(text);
  if (isLeadingDimension) {
    return { qty: 1, text };
  }

  // 6. Leading quantity followed by space and tech spec: e.g. "2 4K Video", "2 50 Edited Photos", "2 15-20 Min Teaser"
  const qtySpecMatch = text.match(/^(\d+)\s+(\d+\s*(?:[kK]\b|min\b|mins\b|minute|minutes|sec\b|secs\b|second|seconds|hr\b|hrs\b|hour|hours|page|pages|sheet|sheets|photo|photos\b|image|images\b|pic|pics\b|picture|pictures\b|gb\b|mb\b|tb\b|day\b|days\b|edited\b).*)$/i);
  if (qtySpecMatch) {
    const parsedQty = parseInt(qtySpecMatch[1], 10);
    return { qty: !isNaN(parsedQty) && parsedQty >= 1 ? parsedQty : 1, text: qtySpecMatch[2].trim() };
  }

  const isUnitOrSpec = /^\d+\s*(?:[kK]\b|min\b|mins\b|minute|minutes|sec\b|secs\b|second|seconds|hr\b|hrs\b|hour|hours|page|pages|sheet|sheets|photo|photos\b|image|images\b|pic|pics\b|picture|pictures\b|gb\b|mb\b|tb\b|day\b|days\b|edited\b)/i.test(text);
  if (isUnitOrSpec) {
    return { qty: 1, text };
  }

  // 7. Leading quantity followed by space and text: e.g. "2 Traditional Photos", "2 Photographer"
  const wordMatch = text.match(/^(\d+)\s+(.+)$/);
  if (wordMatch) {
    const parsedQty = parseInt(wordMatch[1], 10);
    return { qty: !isNaN(parsedQty) && parsedQty >= 1 ? parsedQty : 1, text: wordMatch[2].trim() };
  }

  return { qty: 1, text };
}

export function combineQtyAndText(qty: number | string, text: string): string {
  const qNum = parseInt(String(qty), 10);
  const validQty = !isNaN(qNum) && qNum >= 1 ? qNum : 1;
  const cleanText = (text || "").replace(/^\(Qty:\s*\d+\)\s*/i, "").trim();

  if (!cleanText) {
    return validQty > 1 ? `(Qty: ${validQty})` : "";
  }
  if (validQty <= 1) {
    return cleanText;
  }
  return `(Qty: ${validQty}) ${cleanText}`.trim();
}

export function formatListToStructuredObjects(list: any[]): { name: string; qty: number }[] {
  if (!Array.isArray(list)) return [];
  const result: { name: string; qty: number }[] = [];
  list.forEach(item => {
    if (!item) return;
    if (typeof item === 'object') {
      const rawName = String(item.name || item.role || item.member_name || item.text || item.deliverable || item.title || '').trim();
      const parsed = parseQtyAndText(rawName);
      const q = Number(item.qty || item.quantity || item.count || parsed.qty || 1);
      const qty = isNaN(q) || q < 1 ? 1 : q;
      if (parsed.text) {
        result.push({ name: parsed.text, qty });
      }
    } else if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) return;
      const parsed = parseQtyAndText(trimmed);
      if (parsed.text) {
        result.push({ name: parsed.text, qty: parsed.qty });
      }
    }
  });
  return result;
}

export function buildStep3EventPayloads(
  pkgId: string,
  currentEvents: any[],
  editableInclusions: Record<string, any[]>,
  editableDeliverables: Record<string, any[]>
) {
  const effectivePkgId = pkgId || 'Custom Package';
  const hasEvents = currentEvents && currentEvents.length > 0;
  const isMultiEvent = hasEvents && currentEvents.length > 1;
  const eventsList = hasEvents ? currentEvents : [null];

  const teamMembersJson = eventsList.map((event, idx) => {
    const evId = String(event ? (event.id || event.event_id || `EV-${idx + 1}`) : 'default');
    const evName = event?.event_name || event?.custom_event_name || event?.event_type || `Event ${idx + 1}`;

    const keysToTry: string[] = isMultiEvent
      ? [
          evId,
          `${effectivePkgId}_${evId}`,
          `Custom Package_${evId}`,
          `custom_package_${evId}`
        ]
      : [
          evId,
          `${effectivePkgId}_${evId}`,
          `Custom Package_${evId}`,
          `custom_package_${evId}`,
          effectivePkgId,
          'Custom Package',
          'custom_package'
        ];

    let list: any[] = [];
    for (const k of keysToTry) {
      if (editableInclusions && editableInclusions[k] !== undefined && Array.isArray(editableInclusions[k])) {
        list = editableInclusions[k];
        break;
      }
    }

    // Direct event fallback only for this exact event
    if (list.length === 0 && event) {
      if (Array.isArray(event.team_members) && event.team_members.length > 0) {
        list = event.team_members;
      } else if (Array.isArray(event.inclusions) && event.inclusions.length > 0) {
        list = event.inclusions;
      } else if (Array.isArray(event.members) && event.members.length > 0) {
        list = event.members;
      }
    }

    return {
      event_id: evId,
      event_name: evName,
      team_members: formatListToStructuredObjects(list)
    };
  });

  const deliverablesJson = eventsList.map((event, idx) => {
    const evId = String(event ? (event.id || event.event_id || `EV-${idx + 1}`) : 'default');
    const evName = event?.event_name || event?.custom_event_name || event?.event_type || `Event ${idx + 1}`;

    const keysToTry: string[] = isMultiEvent
      ? [
          evId,
          `${effectivePkgId}_${evId}`,
          `Custom Package_${evId}`,
          `custom_package_${evId}`
        ]
      : [
          evId,
          `${effectivePkgId}_${evId}`,
          `Custom Package_${evId}`,
          `custom_package_${evId}`,
          effectivePkgId,
          'Custom Package',
          'custom_package'
        ];

    let list: any[] = [];
    for (const k of keysToTry) {
      if (editableDeliverables && editableDeliverables[k] !== undefined && Array.isArray(editableDeliverables[k])) {
        list = editableDeliverables[k];
        break;
      }
    }

    // Direct event fallback only for this exact event
    if (list.length === 0 && event) {
      if (Array.isArray(event.deliverables) && event.deliverables.length > 0) {
        list = event.deliverables;
      } else if (Array.isArray(event.deliverables_list) && event.deliverables_list.length > 0) {
        list = event.deliverables_list;
      }
    }

    return {
      event_id: evId,
      event_name: evName,
      deliverables: formatListToStructuredObjects(list)
    };
  });

  let flatTeamMembers: { name: string; qty: number }[] = [];
  const eventTeamMembers = teamMembersJson.flatMap(e => e.team_members || []);
  if (eventTeamMembers.length > 0) {
    flatTeamMembers = eventTeamMembers;
  } else {
    const pkgList = editableInclusions[effectivePkgId] || editableInclusions['Custom Package'] || editableInclusions['custom_package'] || [];
    flatTeamMembers = formatListToStructuredObjects(pkgList);
  }

  let flatDeliverables: { name: string; qty: number }[] = [];
  const eventDeliverables = deliverablesJson.flatMap(e => e.deliverables || []);
  if (eventDeliverables.length > 0) {
    flatDeliverables = eventDeliverables;
  } else {
    const pkgList = editableDeliverables[effectivePkgId] || editableDeliverables['Custom Package'] || editableDeliverables['custom_package'] || [];
    flatDeliverables = formatListToStructuredObjects(pkgList);
  }

  // Ensure single event entries receive flat fallback items if event-level items were empty
  if (teamMembersJson.length === 1 && teamMembersJson[0].team_members.length === 0 && flatTeamMembers.length > 0) {
    teamMembersJson[0].team_members = [...flatTeamMembers];
  }
  if (deliverablesJson.length === 1 && deliverablesJson[0].deliverables.length === 0 && flatDeliverables.length > 0) {
    deliverablesJson[0].deliverables = [...flatDeliverables];
  }

  return {
    teamMembersJson,
    deliverablesJson,
    flatTeamMembers,
    flatDeliverables,
    teamMembersText: hasEvents ? JSON.stringify(teamMembersJson) : JSON.stringify(flatTeamMembers),
    deliverablesText: hasEvents ? JSON.stringify(deliverablesJson) : JSON.stringify(flatDeliverables)
  };
}

export interface VerifiedLeadPackagePayloadResult {
  payload: Record<string, any>;
  isValid: boolean;
  teamMembersValid: boolean;
  deliverablesValid: boolean;
  issues: string[];
}

/**
 * Validates, normalizes, and logs the payload being sent to the Supabase 'lead_packages' table.
 * Specifically verifies that:
 * 1. 'Team_Members_Included' is an Array of events, each with event_id, event_name, and an array of { name: string, qty: number }
 * 2. 'deliverables_descriptionn' is an Array of events, each with event_id, event_name, and an array of { name: string, qty: number }
 */
export function verifyAndFormatLeadPackagePayload(
  rawPayload: Record<string, any>,
  source: string = 'Sales Dashboard Package Save'
): VerifiedLeadPackagePayloadResult {
  const issues: string[] = [];
  const payload: Record<string, any> = { ...rawPayload };

  // 1. Verify and validate Team_Members_Included
  let rawTeamMembers = payload.Team_Members_Included;
  if (typeof rawTeamMembers === 'string') {
    try {
      rawTeamMembers = JSON.parse(rawTeamMembers);
    } catch {
      issues.push("Team_Members_Included was a serialized string that failed to JSON parse");
    }
  }

  let structuredTeamMembers: Array<{ event_id: string; event_name: string; team_members: Array<{ name: string; qty: number }> }> = [];
  let teamMembersValid = true;

  if (Array.isArray(rawTeamMembers)) {
    structuredTeamMembers = rawTeamMembers.map((item: any, idx: number) => {
      const evId = String(item?.event_id || item?.id || `EV-${idx + 1}`);
      const evName = String(item?.event_name || item?.custom_event_name || item?.event_type || `Event ${idx + 1}`);

      let list: any[] = [];
      if (Array.isArray(item?.team_members)) {
        list = item.team_members;
      } else if (Array.isArray(item?.members)) {
        list = item.members;
      } else if (item && typeof item === 'object' && !item.event_id && !item.event_name) {
        // Flat item { name, qty } passed accidentally inside array
        list = [item];
      }

      const formatted = formatListToStructuredObjects(list);
      if (list.length > 0 && formatted.length === 0) {
        teamMembersValid = false;
        issues.push(`Event '${evName}' (ID: ${evId}) contains invalid team_members: ${JSON.stringify(list)}`);
      }

      return {
        event_id: evId,
        event_name: evName,
        team_members: formatted
      };
    });
  } else if (rawTeamMembers && typeof rawTeamMembers === 'object') {
    // Record of keys -> array of members
    structuredTeamMembers = [{
      event_id: 'default',
      event_name: 'General',
      team_members: formatListToStructuredObjects(Object.values(rawTeamMembers).flat())
    }];
  } else {
    teamMembersValid = false;
    issues.push("Team_Members_Included is not an array or object");
    structuredTeamMembers = [];
  }

  // 2. Verify and validate deliverables_descriptionn
  let rawDeliverables = payload.deliverables_descriptionn;
  if (typeof rawDeliverables === 'string') {
    try {
      rawDeliverables = JSON.parse(rawDeliverables);
    } catch {
      issues.push("deliverables_descriptionn was a serialized string that failed to JSON parse");
    }
  }

  let structuredDeliverables: Array<{ event_id: string; event_name: string; deliverables: Array<{ name: string; qty: number }> }> = [];
  let deliverablesValid = true;

  if (Array.isArray(rawDeliverables)) {
    structuredDeliverables = rawDeliverables.map((item: any, idx: number) => {
      const evId = String(item?.event_id || item?.id || `EV-${idx + 1}`);
      const evName = String(item?.event_name || item?.custom_event_name || item?.event_type || `Event ${idx + 1}`);

      let list: any[] = [];
      if (Array.isArray(item?.deliverables)) {
        list = item.deliverables;
      } else if (Array.isArray(item?.deliverables_list)) {
        list = item.deliverables_list;
      } else if (item && typeof item === 'object' && !item.event_id && !item.event_name) {
        list = [item];
      }

      const formatted = formatListToStructuredObjects(list);
      if (list.length > 0 && formatted.length === 0) {
        deliverablesValid = false;
        issues.push(`Event '${evName}' (ID: ${evId}) contains invalid deliverables: ${JSON.stringify(list)}`);
      }

      return {
        event_id: evId,
        event_name: evName,
        deliverables: formatted
      };
    });
  } else if (rawDeliverables && typeof rawDeliverables === 'object') {
    structuredDeliverables = [{
      event_id: 'default',
      event_name: 'General',
      deliverables: formatListToStructuredObjects(Object.values(rawDeliverables).flat())
    }];
  } else {
    deliverablesValid = false;
    issues.push("deliverables_descriptionn is not an array or object");
    structuredDeliverables = [];
  }

  // Assign normalized and verified structures back to the payload
  payload.Team_Members_Included = structuredTeamMembers;
  payload.deliverables_descriptionn = structuredDeliverables;

  const isValid = issues.length === 0 && teamMembersValid && deliverablesValid;

  // 3. EXTENSIVE CONSOLE LOGGING
  try {
    console.group(`📦 [Supabase lead_packages Payload Inspection] - ${source}`);
    console.log('%cLead ID:', 'color: #38bdf8; font-weight: bold;', payload.lead_id);
    console.log('%cPackage ID:', 'color: #38bdf8; font-weight: bold;', payload.package_id);
    console.log('%cPackage Name:', 'color: #38bdf8; font-weight: bold;', payload.package_name);
    console.log('%cPricing Summary:', 'color: #38bdf8; font-weight: bold;', {
      package_cost: payload.package_cost,
      total_amount: payload.total_amount,
      discount: payload.discount,
      final_amount: payload.final_amount
    });
    console.log('%cComplete Payload destined for Supabase "lead_packages" table:', 'color: #c084fc; font-weight: bold;', payload);

    // Group 1: Team_Members_Included verification details
    console.group(`👥 Team_Members_Included [${structuredTeamMembers.length} event(s)]`);
    console.log('Is Array:', Array.isArray(payload.Team_Members_Included));
    console.log('Is Correctly Structured:', teamMembersValid);
    console.log('Total Events in Team_Members_Included:', structuredTeamMembers.length);
    structuredTeamMembers.forEach((ev, idx) => {
      console.log(`  Event ${idx + 1}: "${ev.event_name}" (${ev.event_id}) -> ${ev.team_members.length} member roles:`, ev.team_members);
    });
    console.log('Raw Structured Object:', payload.Team_Members_Included);
    console.groupEnd();

    // Group 2: deliverables_descriptionn verification details
    console.group(`🎁 deliverables_descriptionn [${structuredDeliverables.length} event(s)]`);
    console.log('Is Array:', Array.isArray(payload.deliverables_descriptionn));
    console.log('Is Correctly Structured:', deliverablesValid);
    console.log('Total Events in deliverables_descriptionn:', structuredDeliverables.length);
    structuredDeliverables.forEach((ev, idx) => {
      console.log(`  Event ${idx + 1}: "${ev.event_name}" (${ev.event_id}) -> ${ev.deliverables.length} deliverables:`, ev.deliverables);
    });
    console.log('Raw Structured Object:', payload.deliverables_descriptionn);
    console.groupEnd();

    // Group 3: Overall Validation Status
    if (!isValid || issues.length > 0) {
      console.warn('%c⚠️ Payload Structure Warnings Detected:', 'color: #f59e0b; font-weight: bold;', issues);
    } else {
      console.log('%c✅ Payload Structure Fully Verified: Team_Members_Included & deliverables_descriptionn conform exactly to the Supabase schema.', 'color: #10b981; font-weight: bold;');
    }
    console.groupEnd();
  } catch (logErr) {
    console.log('[lead_packages payload inspection]', payload);
  }

  return {
    payload,
    isValid,
    teamMembersValid,
    deliverablesValid,
    issues
  };
}

/**
 * Safely normalizes a CRM array field according to normalization rules:
 * - If already an array, return it directly.
 * - If null, undefined, or empty, return [].
 * - If a JSON string containing an array, parse it safely and return the parsed array.
 * - Do NOT convert arbitrary strings or objects into fake array items.
 * - Preserves actual CRM data exactly as stored.
 */
export function normalizeCrmArray<T = any>(val: any): T[] {
  if (Array.isArray(val)) {
    return val;
  }
  if (val === null || val === undefined || val === '') {
    return [];
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // invalid JSON, fall through
      }
    }
    return [];
  }
  return [];
}

export function parseTeamMembersJsonToRecord(
  rawTeamData: any,
  pkgId: string,
  eventsList: any[] = []
): Record<string, string[]> {
  const safeEvents = normalizeCrmArray(eventsList);
  const result: Record<string, string[]> = {};
  const effectivePkgId = pkgId || 'Custom Package';
  const isMulti = safeEvents.length > 1;

  const setForEvent = (evId: string, members: string[]) => {
    if (!evId || !members || members.length === 0) return;
    const clean = members.map((m: any) => {
      const { qty, text } = parseQtyAndText(m);
      return text ? combineQtyAndText(qty, text) : '';
    }).filter(Boolean);
    if (clean.length === 0) return;
    result[evId] = clean;
    result[`${effectivePkgId}_${evId}`] = clean;
    result[`Custom Package_${evId}`] = clean;
    result[`custom_package_${evId}`] = clean;
  };

  // 1. Check if events have direct team_members / inclusions properties attached
  if (safeEvents.length > 0) {
    safeEvents.forEach((ev, idx) => {
      const evId = String(ev.id || ev.event_id || `EV-${idx + 1}`);
      const directTm = ev.team_members || ev.members || ev.inclusions;
      if (directTm) {
        let members: string[] = [];
        if (Array.isArray(directTm)) {
          members = directTm.map((m: any) => {
            const { qty, text } = parseQtyAndText(m);
            return text ? combineQtyAndText(qty, text) : '';
          }).filter(Boolean);
        } else if (typeof directTm === 'string' && directTm.trim() && directTm.trim() !== '[]') {
          try {
            const parsedTm = JSON.parse(directTm);
            if (Array.isArray(parsedTm)) {
              members = parsedTm.map((m: any) => {
                const { qty, text } = parseQtyAndText(m);
                return text ? combineQtyAndText(qty, text) : '';
              }).filter(Boolean);
            }
          } catch {}
        }
        if (members.length > 0) {
          setForEvent(evId, members);
        }
      }
    });
  }

  if (!rawTeamData) return result;

  let parsed: any = rawTeamData;
  if (typeof rawTeamData === 'string') {
    try {
      parsed = JSON.parse(rawTeamData);
    } catch {
      if (!isMulti) {
        const list = rawTeamData.split(/[,\n]/).map((s: string) => {
          const { qty, text } = parseQtyAndText(s);
          return text ? combineQtyAndText(qty, text) : '';
        }).filter(Boolean);
        if (list.length > 0) {
          result[effectivePkgId] = list;
          result['Custom Package'] = list;
          result['custom_package'] = list;
          if (safeEvents[0]) {
            const evId = String(safeEvents[0].id || safeEvents[0].event_id || 'EV-1');
            setForEvent(evId, list);
          }
        }
      }
      return result;
    }
  }

  if (Array.isArray(parsed)) {
    let generalList: string[] = [];
    parsed.forEach((item: any, idx: number) => {
      if (typeof item === 'string') {
        const { qty, text } = parseQtyAndText(item);
        if (text) generalList.push(combineQtyAndText(qty, text));
      } else if (item && typeof item === 'object') {
        const isEventStructure = (item.event_name || item.event_type || item.event_id) && (Array.isArray(item.team_members) || Array.isArray(item.members));
        if (isEventStructure) {
          const evId = item.event_id ? String(item.event_id) : '';
          const evName = item.event_name ? String(item.event_name).trim().toLowerCase() : '';
          const membersList = Array.isArray(item.team_members) ? item.team_members : (Array.isArray(item.members) ? item.members : []);
          const members = membersList.map((m: any) => {
            const { qty, text } = parseQtyAndText(m);
            return text ? combineQtyAndText(qty, text) : '';
          }).filter(Boolean);

          if (evName === 'General' || (!evName && !evId)) {
            generalList = [...generalList, ...members];
          } else {
            const matchedEv = safeEvents.find((e, eIdx) => {
              if (evId && (String(e.id) === evId || String(e.event_id) === evId)) return true;
              if (evName && e.event_name && String(e.event_name).trim().toLowerCase() === evName) return true;
              if (!evId && !evName && eIdx === idx) return true;
              return false;
            });

            const targetId = matchedEv ? String(matchedEv.id || matchedEv.event_id || evId) : (evId || `EV-${idx + 1}`);
            if (targetId) {
              setForEvent(targetId, members);
            }
          }
        } else {
          const rawName = item.role || item.member_name || item.name || item.text || item.title || '';
          const { qty: parsedQty, text: parsedText } = parseQtyAndText(rawName);
          const q = Number(item.qty || item.quantity || item.count || parsedQty || 1);
          const itemQty = isNaN(q) || q < 1 ? 1 : q;
          if (parsedText) {
            generalList.push(combineQtyAndText(itemQty, parsedText));
          }
        }
      }
    });

    if (generalList.length > 0 && !isMulti) {
      result[effectivePkgId] = generalList;
      result['Custom Package'] = generalList;
      result['custom_package'] = generalList;
      if (safeEvents[0]) {
        const evId = String(safeEvents[0].id || safeEvents[0].event_id || 'EV-1');
        setForEvent(evId, generalList);
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    Object.keys(parsed).forEach(k => {
      if (Array.isArray(parsed[k])) {
        const cleanArr = parsed[k].map((s: any) => {
          const { qty, text } = parseQtyAndText(s);
          return text ? combineQtyAndText(qty, text) : '';
        }).filter(Boolean);
        result[k] = cleanArr;
      }
    });
  }

  return result;
}

export function parseDeliverablesJsonToRecord(
  rawDelData: any,
  pkgId: string,
  eventsList: any[] = []
): Record<string, string[]> {
  const safeEvents = normalizeCrmArray(eventsList);
  const result: Record<string, string[]> = {};
  const effectivePkgId = pkgId || 'Custom Package';
  const isMulti = safeEvents.length > 1;

  const setForEvent = (evId: string, deliverables: string[]) => {
    if (!evId || !deliverables || deliverables.length === 0) return;
    const clean = deliverables.map((d: any) => {
      const { qty, text } = parseQtyAndText(d);
      return text ? combineQtyAndText(qty, text) : '';
    }).filter(Boolean);
    if (clean.length === 0) return;
    result[evId] = clean;
    result[`${effectivePkgId}_${evId}`] = clean;
    result[`Custom Package_${evId}`] = clean;
    result[`custom_package_${evId}`] = clean;
  };

  // 1. Check if events have direct deliverables properties attached
  if (safeEvents.length > 0) {
    safeEvents.forEach((ev, idx) => {
      const evId = String(ev.id || ev.event_id || `EV-${idx + 1}`);
      const directDel = ev.deliverables || ev.deliverables_list;
      if (directDel) {
        let deliverables: string[] = [];
        if (Array.isArray(directDel)) {
          deliverables = directDel.map((d: any) => {
            const { qty, text } = parseQtyAndText(d);
            return text ? combineQtyAndText(qty, text) : '';
          }).filter(Boolean);
        } else if (typeof directDel === 'string' && directDel.trim() && directDel.trim() !== '[]') {
          try {
            const parsedDel = JSON.parse(directDel);
            if (Array.isArray(parsedDel)) {
              deliverables = parsedDel.map((d: any) => {
                const { qty, text } = parseQtyAndText(d);
                return text ? combineQtyAndText(qty, text) : '';
              }).filter(Boolean);
            }
          } catch {}
        }
        if (deliverables.length > 0) {
          setForEvent(evId, deliverables);
        }
      }
    });
  }

  if (!rawDelData) return result;

  let parsed: any = rawDelData;
  if (typeof rawDelData === 'string') {
    try {
      parsed = JSON.parse(rawDelData);
    } catch {
      if (!isMulti) {
        const list = rawDelData.split(/[,\n]/).map((s: string) => {
          const { qty, text } = parseQtyAndText(s);
          return text ? combineQtyAndText(qty, text) : '';
        }).filter(Boolean);
        if (list.length > 0) {
          result[effectivePkgId] = list;
          result['Custom Package'] = list;
          result['custom_package'] = list;
          if (safeEvents[0]) {
            const evId = String(safeEvents[0].id || safeEvents[0].event_id || 'EV-1');
            setForEvent(evId, list);
          }
        }
      }
      return result;
    }
  }

  if (Array.isArray(parsed)) {
    let generalList: string[] = [];
    parsed.forEach((item: any, idx: number) => {
      if (typeof item === 'string') {
        const { qty, text } = parseQtyAndText(item);
        if (text) generalList.push(combineQtyAndText(qty, text));
      } else if (item && typeof item === 'object') {
        const isEventStructure = (item.event_name || item.event_type || item.event_id) && (Array.isArray(item.deliverables) || Array.isArray(item.deliverables_list));
        if (isEventStructure) {
          const evId = item.event_id ? String(item.event_id) : '';
          const evName = item.event_name ? String(item.event_name).trim().toLowerCase() : '';
          let deliverables: string[] = [];
          if (Array.isArray(item.deliverables)) {
            deliverables = item.deliverables.map((d: any) => {
              const { qty, text } = parseQtyAndText(d);
              return text ? combineQtyAndText(qty, text) : '';
            }).filter(Boolean);
          } else if (Array.isArray(item.deliverables_list)) {
            deliverables = item.deliverables_list.map((d: any) => {
              const { qty, text } = parseQtyAndText(d);
              return text ? combineQtyAndText(qty, text) : '';
            }).filter(Boolean);
          }

          if (evName === 'General' || (!evName && !evId) || (!evId && evName === 'Unnamed Event')) {
            generalList = [...generalList, ...deliverables];
          } else {
            const matchedEv = safeEvents.find((e, eIdx) => {
              if (evId && (String(e.id) === evId || String(e.event_id) === evId)) return true;
              if (evName && e.event_name && String(e.event_name).trim().toLowerCase() === evName) return true;
              if (!evId && !evName && eIdx === idx) return true;
              return false;
            });

            const targetId = matchedEv ? String(matchedEv.id || matchedEv.event_id || evId) : (evId || `EV-${idx + 1}`);
            if (targetId) {
              setForEvent(targetId, deliverables);
            }
          }
        } else {
          const rawName = item.name || item.deliverable || item.title || item.text || '';
          const { qty: parsedQty, text: parsedText } = parseQtyAndText(rawName);
          const q = Number(item.qty || item.quantity || item.count || parsedQty || 1);
          const itemQty = isNaN(q) || q < 1 ? 1 : q;
          if (parsedText) {
            generalList.push(combineQtyAndText(itemQty, parsedText));
          }
        }
      }
    });

    if (generalList.length > 0 && !isMulti) {
      result[effectivePkgId] = generalList;
      result['Custom Package'] = generalList;
      result['custom_package'] = generalList;
      if (safeEvents[0]) {
        const evId = String(safeEvents[0].id || safeEvents[0].event_id || 'EV-1');
        setForEvent(evId, generalList);
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    Object.keys(parsed).forEach(k => {
      if (Array.isArray(parsed[k])) {
        const cleanArr = parsed[k].map((s: any) => {
          const { qty, text } = parseQtyAndText(s);
          return text ? combineQtyAndText(qty, text) : '';
        }).filter(Boolean);
        result[k] = cleanArr;
      }
    });
  }

  return result;
}

export interface CompactQtyItemRowProps {
  value: string;
  options?: string[];
  placeholder: string;
  addLabel?: string;
  accentColor?: "indigo" | "emerald";
  disabled?: boolean;
  onChange: (newValue: string) => void;
  onAdd?: () => void;
  onDelete: () => void;
}

export const CompactQtyItemRow: React.FC<CompactQtyItemRowProps> = ({
  value,
  options,
  placeholder,
  disabled = false,
  onChange,
  onDelete,
}) => {
  const { qty, text } = React.useMemo(() => parseQtyAndText(value), [value]);
  const [localQty, setLocalQty] = React.useState<string | number>(qty);

  React.useEffect(() => {
    setLocalQty(qty);
  }, [qty]);

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const rawVal = e.target.value;
    setLocalQty(rawVal);

    if (rawVal === '') return;

    const newQty = parseInt(rawVal, 10);
    if (!isNaN(newQty) && newQty >= 1) {
      onChange(combineQtyAndText(newQty, text));
    }
  };

  const handleQtyBlur = () => {
    if (disabled) return;
    const parsed = parseInt(String(localQty), 10);
    if (isNaN(parsed) || parsed < 1) {
      setLocalQty(1);
      onChange(combineQtyAndText(1, text));
    } else {
      setLocalQty(parsed);
      onChange(combineQtyAndText(parsed, text));
    }
  };

  const handleTextChange = (newText: string) => {
    if (disabled) return;
    const currentQ = parseInt(String(localQty), 10);
    const validQ = !isNaN(currentQ) && currentQ >= 1 ? currentQ : qty;
    onChange(combineQtyAndText(validQ, newText));
  };

  return (
    <div className={`flex items-center gap-2 bg-slate-950/40 border border-slate-800/80 p-2 sm:p-2.5 rounded-lg transition-all ${disabled ? 'opacity-60 pointer-events-none' : 'hover:border-slate-700/80'}`}>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] font-bold text-slate-400 uppercase font-mono hidden sm:inline">Qty</span>
        <input
          type="number"
          min="1"
          disabled={disabled}
          value={localQty}
          onChange={handleQtyChange}
          onBlur={handleQtyBlur}
          className="w-12 sm:w-16 bg-slate-900 border border-slate-750 focus:border-indigo-500 focus:outline-none rounded-md py-1 px-1.5 text-xs font-mono font-bold text-center text-white shrink-0 disabled:opacity-50"
          placeholder="Qty"
          title="Quantity"
        />
      </div>

      <div className="flex-1 min-w-0">
        <LocalEditableInput
          value={text}
          options={options}
          placeholder={placeholder}
          disabled={disabled}
          onChange={handleTextChange}
          className="w-full bg-slate-900 border border-slate-750 focus:border-indigo-500 focus:outline-none rounded-md py-1 px-2.5 text-xs text-slate-100 font-medium disabled:opacity-50"
        />
      </div>

      <div className="shrink-0 flex items-center justify-center">
        <button
          type="button"
          disabled={disabled}
          onClick={onDelete}
          className={`w-10 h-10 sm:w-auto sm:h-auto sm:px-2.5 sm:py-1 text-[16px] sm:text-[11px] text-rose-400 hover:text-rose-300 font-bold font-mono bg-rose-500/10 hover:bg-rose-500/20 rounded-md transition-all flex items-center justify-center gap-1 border border-rose-500/20 ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span className="sm:hidden">🗑</span>
          <span className="hidden sm:inline">Delete</span>
        </button>
      </div>
    </div>
  );
};

export const validateAndFormatTime = (timeStr: any, fieldLabel: string): string | null => {
  if (timeStr === undefined || timeStr === null) return null;
  const str = String(timeStr).trim();
  if (str === '' || str === 'null' || str === 'undefined' || str === 'Invalid Date') {
    return null;
  }
  const normalized = str.replace(/\s+/g, ' ');
  const ampmMatch = normalized.toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  const hhmmMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  
  if (!ampmMatch && !hhmmMatch) {
    throw new Error(`${fieldLabel} is invalid.`);
  }

  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const period = ampmMatch[3];

    if (hours < 1 || hours > 12 || parseInt(minutes, 10) < 0 || parseInt(minutes, 10) > 59) {
      throw new Error(`${fieldLabel} is invalid.`);
    }

    if (period === 'PM' && hours < 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }

    const hh = String(hours).padStart(2, '0');
    return `${hh}:${minutes}:00`;
  }

  if (hhmmMatch) {
    const hours = parseInt(hhmmMatch[1], 10);
    const minutes = hhmmMatch[2];
    const seconds = hhmmMatch[3] || '00';

    if (hours < 0 || hours > 23 || parseInt(minutes, 10) < 0 || parseInt(minutes, 10) > 59 || parseInt(seconds, 10) < 0 || parseInt(seconds, 10) > 59) {
      throw new Error(`${fieldLabel} is invalid.`);
    }

    const hh = String(hours).padStart(2, '0');
    return `${hh}:${minutes}:${seconds}`;
  }

  throw new Error(`${fieldLabel} is invalid.`);
};

export const getLogoBase64FromUrl = (url: string): Promise<{ base64: string; aspect: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        try {
          const dataURL = canvas.toDataURL('image/png');
          const aspect = img.naturalWidth / img.naturalHeight;
          resolve({ base64: dataURL, aspect });
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error('Failed to get 2D context'));
      }
    };
    img.onerror = (e) => {
      reject(e);
    };
    img.src = url;
  });
};

export const generateQuotationPdfFileName = (leadObj: any): string => {
  const customerName = (leadObj?.customer_name || 'Customer').trim();
  const leadId = (leadObj?.lead_id || leadObj?.id || 'QUOTE').trim();

  // Sanitize customer name and lead ID for file system safety:
  // Replace invalid filename characters (/ \ : * ? " < > |) with underscores
  const sanitizedCustomer = customerName
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Customer';

  const sanitizedLeadId = leadId
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'QUOTE';

  return `${sanitizedCustomer}_${sanitizedLeadId}_quote.pdf`;
};

export const generateQuotationPDF = (
  lead: any,
  activePkgs: any[],
  quoteNum: string,
  termsText: string,
  logoBase64?: string,
  logoAspect = 1,
  editableInclusions?: Record<string, string[]>,
  editableDeliverables?: Record<string, string[]>,
  discountValue = 0,
  additionalCharges = 0,
  quoteServices: { id: string; name: string; qty: number; price: number; isAdditional?: boolean }[] = []
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Color Palette & Premium Theme Variables (Photography Studio Inspired)
  const slateDark = [15, 23, 42];      // #0f172a
  const slateGray = [100, 116, 139];   // #64748b
  const bgLightGrid = [248, 250, 252]; // #f8fafc
  const headerBgColor = [18, 18, 22];  // Luxury Carbon Black
  const goldColor = [212, 175, 55];   // #D4AF37 Classic Gold

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return formatDateDDMMYY(dateStr) || dateStr;
  };

  // Dynamic layout configuration options (Default vs Compact to optimize page count and avoid sparse pages)
  const defaultConfig = {
    secSpacing: 6,
    rowPadding: 2.5,
    rowTextHeight: 4.2,
    termsSpacing: 3.8,
    tableSpacing: 5,
    pricingCardHeight: 25.5,
    paymentCardHeight: 29,
    boxPadding: 16,
    textPadding: 4.2,
    notesPadding: 4.2
  };

  const compactConfig = {
    secSpacing: 4,
    rowPadding: 1.5,
    rowTextHeight: 3.8,
    termsSpacing: 3.2,
    tableSpacing: 3,
    pricingCardHeight: 21,
    paymentCardHeight: 24,
    boxPadding: 12,
    textPadding: 3.6,
    notesPadding: 3.6
  };

  // Pre-split fields to calculate wrap height accurately
  const wrapCustName = doc.splitTextToSize(lead.customer_name || '', 50);
  const wrapEmail = doc.splitTextToSize(lead.email || 'Not Provided', 50);
  const displayEventType = lead.event_type === 'Other' ? (lead.custom_event_name || lead.custom_event_type || 'Other') : (lead.event_type || 'N/A');
  const wrapEventType = doc.splitTextToSize(displayEventType, 50);
  const wrapLocation = doc.splitTextToSize(lead.event_location || 'N/A', 50);

  const shootTypeStr = lead.desired_event_shoot_type || lead.shoot_type || '';
  const shootTypes = shootTypeStr ? shootTypeStr.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
  const wrapShootType = shootTypes.length > 0 
    ? shootTypes.map((st: string) => `• ${st}`) 
    : ['N/A'];  // Resolve dynamic services
  // Helper to get latest saved Package Base Price directly without relying on stale cached line items
  const getPackageBasePrice = (): number => {
    if (lead?.package_price !== undefined && lead?.package_price !== null && !isNaN(Number(lead.package_price)) && Number(lead.package_price) > 0) {
      return Number(lead.package_price);
    }
    if (lead?.package_cost !== undefined && lead?.package_cost !== null && !isNaN(Number(lead.package_cost)) && Number(lead.package_cost) > 0) {
      return Number(lead.package_cost);
    }
    if (activePkgs && activePkgs.length > 0) {
      const primaryCost = Number(activePkgs[0].package_cost || activePkgs[0].price || 0);
      if (primaryCost > 0) return primaryCost;
    }
    if (lead?.Final_Quotation_Amount !== undefined && lead?.Final_Quotation_Amount !== null && Number(lead.Final_Quotation_Amount) > 0) {
      return Math.max(0, Number(lead.Final_Quotation_Amount) + Number(discountValue || 0) - Number(additionalCharges || 0));
    }
    if (lead?.budget !== undefined && lead?.budget !== null && Number(lead.budget) > 0) {
      return Number(lead.budget);
    }
    return 0;
  };

  const targetBasePrice = getPackageBasePrice();

  // Helper to determine whether the lead/order is confirmed
  const isConfirmed = Boolean(
    lead?.is_order_confirmed ||
    lead?.isOrderConfirmed ||
    lead?.order_status === 'Confirmed' ||
    lead?.order_status === 'Completed' ||
    lead?.order_status === 'Paid' ||
    lead?.order_status === 'Delivered' ||
    lead?.order_status === 'Project Completed' ||
    lead?.order_status === 'Closed' ||
    lead?.status === 'Order Confirmed' ||
    lead?.status === 'Booking Confirmed' ||
    lead?.current_stage === 'Order Confirmed' ||
    lead?.current_stage === 'Booking Confirmed' ||
    lead?.booking_status === 'Confirmed' ||
    lead?.booking_status === 'Order Confirmed' ||
    (lead?.order_id && !String(lead.order_id).startsWith('DRAFT') && !String(lead.order_id).startsWith('TRK-') && String(lead.order_id).trim() !== '')
  );

  // Helper to fetch actual saved advance payment amount for this exact lead/order
  const getAdvancePaymentAmount = (): number => {
    if (!isConfirmed) return 0;
    const candidates = [
      lead?.advance_received,
      lead?.advance_payment_received,
      lead?.advance_collected,
      lead?.advancePaid,
      lead?.advance_amount,
      lead?.advanceAmount,
      lead?.advancePayment,
      lead?.paid_advance
    ];
    for (const val of candidates) {
      if (val !== undefined && val !== null && val !== '') {
        const num = Number(val);
        if (!Number.isNaN(num) && num > 0) {
          return num;
        }
      }
    }
    return 0;
  };

  const advanceReceived = getAdvancePaymentAmount();

  const rawBreakdown: { label: string; amount: number }[] = Array.isArray(lead?.payments_breakdown)
    ? lead.payments_breakdown
    : [];

  const paymentRows: { label: string; amount: number }[] = [];
  if (rawBreakdown.length > 0) {
    rawBreakdown.forEach(p => {
      if (p && Number(p.amount) > 0) {
        paymentRows.push({
          label: String(p.label || 'Payment'),
          amount: Number(p.amount)
        });
      }
    });
  } else if (isConfirmed && advanceReceived > 0) {
    paymentRows.push({
      label: 'Advance Payment',
      amount: advanceReceived
    });
  } else if (isConfirmed && lead?.total_paid_amount && Number(lead.total_paid_amount) > 0) {
    paymentRows.push({
      label: 'Amount Paid',
      amount: Number(lead.total_paid_amount)
    });
  }

  // If order is confirmed and no payments recorded yet, show Amount Paid: 0 so Pending Amount is clearly visible
  if (paymentRows.length === 0 && isConfirmed) {
    paymentRows.push({
      label: 'Amount Paid',
      amount: 0
    });
  }

  const hasAdvance = paymentRows.length > 0;

  let services = [...quoteServices];

  if (!services || services.length === 0) {
    const baseSum = targetBasePrice > 0 ? targetBasePrice : activePkgs.reduce((sum, p) => sum + Number(p.package_cost || p.price || 0), 0);
    const defaultItems = [
      '2 Photographers',
      '1 Cinematographer',
      'Drone Coverage',
      'LED Wall',
      'Album (40 Sheets)',
      'Teaser Video',
      'Highlight Video',
      'Full Event Coverage'
    ];
    const defaultPrices = [20000, 15000, 10000, 10050, 8000, 7000, 5000, 5000];
    const sumDefault = defaultPrices.reduce((a, b) => a + b, 0);
    const ratio = baseSum ? (baseSum / sumDefault) : 1;

    defaultItems.forEach((name, idx) => {
      services.push({
        id: `fallback_base_${idx}`,
        name,
        qty: 1,
        price: Math.round((defaultPrices[idx] || 5000) * ratio),
        isAdditional: false
      });
    });
  }

  if (additionalCharges > 0) {
    services.push({
      id: 'extra_charges',
      name: 'Extra Charges',
      qty: 1,
      price: additionalCharges,
      isAdditional: true
    });
  }

  const baseServices = services.filter(s => !s.isAdditional);
  const additionalServices = services.filter(s => s.isAdditional);

  // Helper formatting and normalization routines for cleaning characters & detecting duplicate specifications
  const normalizeForComparison = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const cleanText = (text: string) => {
    if (!text) return '';
    let cleaned = text
      .replace(/þÿ/g, '')
      .replace(/ÿþ/g, '')
      .replace(/\uFEFF/g, '')
      .replace(/\uFFFE/g, '');
    cleaned = cleaned.replace(/^[\s•\-\*\u2022\u0095\x95\x96\u2013\u2014\s]+/g, '');
    cleaned = cleaned.replace(/[₹\u20B9\u20b9]/g, 'Rs.');
    return cleaned.trim();
  };

    // NEW PREP FOR TEAM MEMBERS (INCLUSIONS) AND DELIVERABLES
  const pkg = activePkgs[0];
  const pkgId = pkg ? (pkg.package_id || pkg.id || 'default') : 'default';
  const pkgName = pkg ? (pkg.package_name || pkg.name || 'Base Package') : 'Base Package';

  const inclusionsList = (editableInclusions?.[pkgId] || editableInclusions?.['Custom Package'] || editableInclusions?.['custom_package'] || []).filter(Boolean);

  let rawDelList: string[] = [];
  if (editableDeliverables?.[pkgId] && editableDeliverables[pkgId].filter(Boolean).length > 0) {
    rawDelList = editableDeliverables[pkgId].filter(Boolean);
  } else if (editableDeliverables?.['Custom Package'] && editableDeliverables['Custom Package'].filter(Boolean).length > 0) {
    rawDelList = editableDeliverables['Custom Package'].filter(Boolean);
  } else if (editableDeliverables?.['custom_package'] && editableDeliverables['custom_package'].filter(Boolean).length > 0) {
    rawDelList = editableDeliverables['custom_package'].filter(Boolean);
  } else if (editableDeliverables && Object.values(editableDeliverables).flat().filter(Boolean).length > 0) {
    rawDelList = Object.values(editableDeliverables).flat().filter(Boolean);
  } else {
    const delText = lead?.deliverables_description || pkg?.deliverables || pkg?.deliverables_description || lead?.deliverables || '';
    if (delText) {
      try {
        const parsed = JSON.parse(delText);
        if (Array.isArray(parsed)) {
          if (typeof parsed[0] === 'string') {
            rawDelList = parsed;
          } else if (parsed[0] && Array.isArray(parsed[0].deliverables)) {
            rawDelList = parsed.flatMap((item: any) => Array.isArray(item.deliverables) ? item.deliverables : []);
          }
        }
      } catch (e) {
        rawDelList = delText.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean);
      }
    }
  }

  const deliverablesList = rawDelList.filter(Boolean);

  const eventsToRender: {
    eventName: string;
    eventDate: string;
    eventTime: string;
    eventEndDate: string;
    eventEndTime: string;
    eventLocation: string;
    guestPax: string;
    members: string[];
    deliverables: string[];
  }[] = [];

  if (lead.events && lead.events.length > 0) {
    // Sort events in exact same sequence as Step 3 (chronological by date + time)
    const sortedEvents = sortEventsAscending(lead.events);
    const isMulti = sortedEvents.length > 1;
    sortedEvents.forEach((event: any, eventIdx: number) => {
      const evId = event.id || event.event_id || `EV-${eventIdx + 1}`;
      const eventKey = `${pkgId}_${evId}`;
      const altKey = `Custom Package_${evId}`;
      
      const directTm = event.team_members || event.members || (!isMulti ? (event.inclusions || event.Team_Members || event.team_members_included) : null);
      const parsedDirectTm = directTm ? (Array.isArray(directTm) ? directTm.map((m: any) => {
        const { qty, text } = parseQtyAndText(m);
        return text ? combineQtyAndText(qty, text) : '';
      }).filter(Boolean) : null) : null;

      const eventInclusions = editableInclusions?.[eventKey] !== undefined
        ? editableInclusions[eventKey]
        : (editableInclusions?.[evId] !== undefined
            ? editableInclusions[evId]
            : (editableInclusions?.[altKey] !== undefined
                ? editableInclusions[altKey]
                : (parsedDirectTm || (isMulti ? [] : inclusionsList))));

      const eventName = event.event_name || event.event_type || `Event ${eventIdx + 1}`;

      const directDel = event.deliverables || event.deliverables_list || (!isMulti ? (event.Add_Deliverable || event.deliverables_description) : null);
      const parsedDirectDel = directDel ? (Array.isArray(directDel) ? directDel.map((d: any) => {
        const { qty, text } = parseQtyAndText(d);
        return text ? combineQtyAndText(qty, text) : '';
      }).filter(Boolean) : null) : null;

      const eventDeliverables = editableDeliverables?.[eventKey] !== undefined
        ? editableDeliverables[eventKey]
        : (editableDeliverables?.[evId] !== undefined
            ? editableDeliverables[evId]
            : (editableDeliverables?.[altKey] !== undefined
                ? editableDeliverables[altKey]
                : (parsedDirectDel || (isMulti ? [] : deliverablesList))));

      const items = (eventDeliverables || []).filter(Boolean);

      eventsToRender.push({
        eventName,
        eventDate: event.event_start_date || event.event_date || "",
        eventTime: event.event_start_time || event.event_time || event.reporting_time || "",
        eventEndDate: event.event_end_date || (event as any).Event_End_Date || "",
        eventEndTime: event.event_end_time || "",
        eventLocation: event.event_location || "N/A",
        guestPax: event.guest_pax !== undefined && event.guest_pax !== null && event.guest_pax !== '' ? String(event.guest_pax) : (lead.guest_pax !== undefined && lead.guest_pax !== null && lead.guest_pax !== '' ? String(lead.guest_pax) : (lead.total_pax ? String(lead.total_pax) : 'N/A')),
        members: (eventInclusions || []).filter(Boolean),
        deliverables: items
      });
    });
  } else {
    eventsToRender.push({
      eventName: displayEventType,
      eventDate: lead.event_date || "",
      eventTime: lead.event_time || "",
      eventEndDate: lead.event_end_date || "",
      eventEndTime: lead.event_end_time || "",
      eventLocation: lead.event_location || "N/A",
      guestPax: lead.guest_pax !== undefined && lead.guest_pax !== null && lead.guest_pax !== '' ? String(lead.guest_pax) : (lead.total_pax ? String(lead.total_pax) : 'N/A'),
      members: (inclusionsList || []).filter(Boolean),
      deliverables: deliverablesList
    });
  }

  const custRemarks = lead.remarks_raw || lead.remarks || '';
  const teamRemarks = lead.notes || ''; 

  const defaultTerms = [
    'Payments are non-refundable.',
    'Crew food arrangements from client side.',
    '50% advance payment before the event.',
    'If duration exceeds 1 hour, additional charges of ₹1,500 per hour will be applicable.',
    '50% full payment on event day.',
    'Pendrive and Hard Disk are not included.',
    'Edited data will be shared via Google Drive link.'
  ];

  const termsToRender = termsText.split('\n').map(t => t.trim()).filter(Boolean).length > 0
    ? termsText.split('\n').map(t => t.trim()).filter(Boolean)
    : defaultTerms;

  // Layout simulation routine
  const simulate = (cfg: typeof defaultConfig) => {
    let simY = 49;
    let simPageCount = 1;

    const simTable = (itemsCount: number, hideHeader: boolean) => {
      let currentTableY = simY + (hideHeader ? 4 : (4 + 7.5));
      // Only force a page break if there is not enough room for the header and at least one row
      if (currentTableY + 15 > 275) {
        simY = 52;
        simPageCount++;
        currentTableY = simY + (hideHeader ? 4 : (4 + 7.5));
      }
      for (let i = 0; i < itemsCount; i++) {
        const rowH = Math.max(7.5, 1 * cfg.rowTextHeight + cfg.rowPadding);
        if (currentTableY + rowH > 275) {
          currentTableY = 52 + (hideHeader ? 0 : 7.5);
          simPageCount++;
        }
        currentTableY += rowH;
      }
      simY = currentTableY + cfg.tableSpacing;
    };

    // Customer details card height (26)
    if (simY + 26 > 275) {
      simY = 52;
      simPageCount++;
    }
    simY += 26 + cfg.secSpacing;

    eventsToRender.forEach((evObj) => {
      // Event Name / Title height (approx 10.5)
      if (simY + 10.5 > 275) {
        simY = 52;
        simPageCount++;
      }
      simY += 10.5;

      // Team members table (with header)
      if (evObj.members.length > 0) {
        simTable(evObj.members.length, false);
      }

      // Deliverables table (with header)
      if (evObj.deliverables.length > 0) {
        simTable(evObj.deliverables.length, false);
      }
    });

    if (additionalServices.length > 0) {
      simTable(additionalServices.length, false);
    }

    const hasPaymentSection = paymentRows.length > 0;
    const simNumRows = 3 + paymentRows.length + (hasPaymentSection ? 1 : 0);
    const simCardHeight = hasPaymentSection ? (cfg.pricingCardHeight / 3) * simNumRows : cfg.pricingCardHeight;
    const pricingH = 4.5 + simCardHeight;
    if (simY + pricingH > 275) {
      simY = 52;
      simPageCount++;
    }
    simY += pricingH + cfg.secSpacing;

    if (custRemarks || teamRemarks) {
      let simBoxH = 4;
      if (custRemarks) {
        const wrappedCustSim = doc.splitTextToSize(custRemarks, 170);
        simBoxH += 4.5 + (wrappedCustSim.length * cfg.notesPadding);
      }
      if (teamRemarks) {
        const wrappedTeamSim = doc.splitTextToSize(teamRemarks, 170);
        simBoxH += 4.5 + (wrappedTeamSim.length * cfg.notesPadding) + (custRemarks ? 4 : 0);
      }
      simBoxH += 2;

      const remarksH = 4.5 + simBoxH;
      if (simY + remarksH > 275) {
        simY = 52;
        simPageCount++;
      }
      simY += remarksH + cfg.secSpacing;
    }

    // 8. TERMS & CONDITIONS (Boxed)
    if (simY + 4.5 > 275) {
      simY = 52;
      simPageCount++;
    }
    simY += 4.5; // heading

    let simTermsIndex = 0;
    while (simTermsIndex < termsToRender.length) {
      let tempY = simY + 4; // top padding of box
      let collectedOnPage = 0;

      while (simTermsIndex < termsToRender.length) {
        const term = termsToRender[simTermsIndex];
        const cleanTerm = term.replace(/^\d+[\.\s\-)]+\s*/, '').replace(/[₹\u20B9\u20b9]/g, 'Rs.').replace(/\s+/g, ' ').trim();
        const wrapped = doc.splitTextToSize(cleanTerm, 163);
        const termH = (wrapped.length * cfg.termsSpacing) + 3; // spacing between terms

        if (tempY + termH > 271) {
          if (collectedOnPage === 0) {
            // Force break page
            simY = 52;
            simPageCount++;
            tempY = simY + 4;
            continue;
          }
          break; // Stop adding terms on this page, box will end here
        }
        collectedOnPage++;
        tempY += termH;
        simTermsIndex++;
      }

      if (collectedOnPage > 0) {
        const boxH = tempY - simY + 2; // including bottom padding
        simY = simY + boxH + 4; // ending of this box plus some margin
      }
    }

    // 9. PHOTOCREW PICTURES FOOTER (Always Last, at footerY = 255)
    if (simY > 245) {
      simY = 52;
      simPageCount++;
    }
    simY = 275;

    return { pageCount: simPageCount, lastPageY: simY };
  };

  // Run simulations to select the most appropriate page-budget configuration
  const defaultRes = simulate(defaultConfig);
  let cfg = defaultConfig;

  if (defaultRes.pageCount > 1) {
    const compactRes = simulate(compactConfig);
    if (compactRes.pageCount < defaultRes.pageCount) {
      cfg = compactConfig;
    } else if (compactRes.pageCount === defaultRes.pageCount && compactRes.lastPageY < defaultRes.lastPageY) {
      if (defaultRes.pageCount === 2 && defaultRes.lastPageY < 80) {
        cfg = compactConfig;
      }
    }
  }

  // Header drawing function
  const drawPageHeader = (pageDoc: typeof doc) => {
    // Premium Dark Carbon Header Bar
    pageDoc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]);
    pageDoc.rect(0, 0, 210, 42, 'F'); 

    // Gold Accent Line separating header from content
    pageDoc.setFillColor(goldColor[0], goldColor[1], goldColor[2]);
    pageDoc.rect(0, 41, 210, 1.2, 'F');

    let logoY = 6;
    let logoW = 18;
    let logoH = 18;
    let hasLogo = false;
    
    if (logoBase64 && logoBase64.startsWith('data:image')) {
      const maxLogoW = 24;
      const maxLogoH = 18;
      logoW = maxLogoH * logoAspect;
      logoH = maxLogoH;
      if (logoW > maxLogoW) {
        logoW = maxLogoW;
        logoH = maxLogoW / logoAspect;
      }
      logoY = (30 - logoH) / 2;
      try {
        pageDoc.addImage(logoBase64, 'PNG', 15, logoY, logoW, logoH);
        hasLogo = true;
      } catch (e) {
        console.warn('Failed to add logo image to PDF:', e);
      }
    }

    if (!hasLogo) {
      pageDoc.setDrawColor(goldColor[0], goldColor[1], goldColor[2]);
      pageDoc.setLineWidth(0.6);
      pageDoc.setFillColor(18, 18, 22);
      pageDoc.circle(24, logoY + 9, 9, 'FD');
      pageDoc.setFont('helvetica', 'bold');
      pageDoc.setFontSize(11);
      pageDoc.setTextColor(255, 255, 255);
      pageDoc.text('P', 22.2, logoY + 12.2);
      logoW = 18;
      logoY = 8;
    }

    const brandingX = 15 + logoW + 5;

    // Left block: Company Branding & Location Info
    pageDoc.setFont('helvetica', 'bold');
    pageDoc.setFontSize(13.5);
    pageDoc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
    pageDoc.text('PHOTOCREW PICTURES', brandingX, logoY + 3);

    pageDoc.setFont('helvetica', 'normal');
    pageDoc.setFontSize(7);
    pageDoc.setTextColor(185, 185, 185);
    pageDoc.text('PREMIUM PHOTOGRAPHY STUDIO & VISUAL PRODUCTION', brandingX, logoY + 7.5);
    
    pageDoc.setFontSize(7);
    pageDoc.setTextColor(150, 150, 150);
    pageDoc.text('No. 45, 1st Floor, 80 Feet Road, VijayNagar, Bangalore - 560040', brandingX, logoY + 12);
    pageDoc.text('GSTIN: 29AAFCP5894N1ZN (Registered Karnataka)', brandingX, logoY + 16.5);

    // Right block: Studio Contact Info
    pageDoc.setFont('helvetica', 'normal');
    pageDoc.setFontSize(7.5);
    pageDoc.setTextColor(230, 230, 230);
    pageDoc.text('www.photocrewpictures.com', 195, logoY + 4, { align: 'right' });
    pageDoc.text('info@photocrewpictures.com', 195, logoY + 8.5, { align: 'right' });
    const customerSupportMobile = '8618865134';
    if (customerSupportMobile) {
      pageDoc.text(`Customer Support: +91 ${customerSupportMobile}`, 195, logoY + 13, { align: 'right' });
    }

    // Header Meta Row: Quote Number, Quote Date, and Validity Date
    pageDoc.setFillColor(28, 28, 35);
    pageDoc.rect(15, 30, 180, 7.5, 'F');
    
    pageDoc.setFont('helvetica', 'bold');
    pageDoc.setFontSize(8);
    pageDoc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
    pageDoc.text('QUOTATION DOCUMENT', 19, 35);

    pageDoc.setFont('helvetica', 'normal');
    pageDoc.setFontSize(7.5);
    pageDoc.setTextColor(240, 240, 240);
    pageDoc.text(`Date: ${formatDate(lead.quotation_date || new Date().toISOString().split('T')[0])}`, 130, 35);
    pageDoc.text(`Validity: 15 Days`, 168, 35);
  };

  // Footer drawing function
  const drawPageFooter = (pageDoc: typeof doc, pageNum: number, totalPages: number) => {
    let footerY = 260;
    
    if (totalPages > 1) {
      pageDoc.setFont('helvetica', 'normal');
      pageDoc.setFontSize(7);
      pageDoc.setTextColor(148, 163, 184);
      pageDoc.text(`Page ${pageNum} of ${totalPages}`, 195, footerY + 14, { align: 'right' });
    }

    pageDoc.setFillColor(goldColor[0], goldColor[1], goldColor[2]);
    pageDoc.rect(0, 292, 210, 5, 'F');
  };

  const drawPhotoCrewFooter = (pageDoc: typeof doc, footerY: number) => {
    pageDoc.setDrawColor(226, 232, 240);
    pageDoc.setLineWidth(0.3);
    pageDoc.line(15, footerY, 195, footerY);

    pageDoc.setFont('helvetica', 'bold');
    pageDoc.setFontSize(8.5);
    pageDoc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    pageDoc.text('PHOTOCREW PICTURES', 15, footerY + 5);
    
    pageDoc.setFont('helvetica', 'normal');
    pageDoc.setFontSize(7.5);
    pageDoc.setTextColor(100, 116, 139);
    const customerSupportMobile = '8618865134';
    if (customerSupportMobile) {
      pageDoc.text(`Website : https://www.photocrewpictures.com/  |  Email: info@photocrewpictures.com  |  Customer Support: +91 ${customerSupportMobile}`, 15, footerY + 9);
    } else {
      pageDoc.text('Website : https://www.photocrewpictures.com/  |  Email: info@photocrewpictures.com', 15, footerY + 9);
    }

    pageDoc.setFont('helvetica', 'bold');
    pageDoc.setFontSize(8);
    pageDoc.setTextColor(goldColor[0], goldColor[1], goldColor[2]); 
    pageDoc.text('Thank You For Choosing Photocrew Pictures', 15, footerY + 14);

    pageDoc.setFont('helvetica', 'normal');
    pageDoc.setFontSize(7.5);
    pageDoc.setTextColor(100, 116, 139);
    pageDoc.text('For Photocrew Pictures', 195, footerY + 5, { align: 'right' });
    pageDoc.setFont('helvetica', 'bold');
    pageDoc.setFontSize(8);
    pageDoc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    pageDoc.text('Authorized Signatory', 195, footerY + 12, { align: 'right' });
  };

  const createNewPage = () => {
    doc.addPage();
    return 52; 
  };

  let currentY = 49;

  const parsePdfItem = (raw: any): { name: string; qty: number } => {
    if (raw === null || raw === undefined) return { name: '', qty: 1 };
    if (typeof raw === 'object') {
      const rawName = String(raw.name || raw.role || raw.member_name || raw.text || raw.deliverable || raw.title || '').trim();
      const parsed = parseQtyAndText(rawName);
      const q = Number(raw.qty || raw.quantity || raw.count || parsed.qty || 1);
      const qty = isNaN(q) || q < 1 ? 1 : q;
      let name = parsed.text || rawName;
      name = cleanText(name);
      name = name.replace(/^DELIVERABLES\s*[:-]?\s*/i, '');
      name = name.replace(/^TEAM MEMBERS?\s*(?:INCLUDED)?\s*[:-]?\s*/i, '');
      name = name.replace(/\s*[\(\[-]?\s*(?:qty|quantity|count)\s*[:=]?\s*\d+\s*[\)\]\-]?/gi, '').trim();
      return { name, qty };
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return { name: '', qty: 1 };
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsedObj = JSON.parse(trimmed);
          return parsePdfItem(parsedObj);
        } catch (e) {}
      }
      const parsed = parseQtyAndText(trimmed);
      let name = parsed.text || trimmed;
      name = cleanText(name);
      name = name.replace(/^DELIVERABLES\s*[:-]?\s*/i, '');
      name = name.replace(/^TEAM MEMBERS?\s*(?:INCLUDED)?\s*[:-]?\s*/i, '');
      name = name.replace(/\s*[\(\[-]?\s*(?:qty|quantity|count)\s*[:=]?\s*\d+\s*[\)\]\-]?/gi, '').trim();
      const qty = parsed.qty >= 1 ? parsed.qty : 1;
      return { name, qty };
    }
    return { name: cleanText(String(raw)), qty: 1 };
  };

  const drawTeamMembersTable = (title: string, members: any[]) => {
    if (!members || members.length === 0) return;

    const mapped = members.map(m => parsePdfItem(m)).filter(m => m.name.length > 0);
    if (mapped.length === 0) return;

    let tableH = 4 + 7.5; // Title spacing + Header row
    mapped.forEach((item) => {
      const wrappedName = doc.splitTextToSize(item.name, 154);
      tableH += Math.max(7.5, wrappedName.length * cfg.rowTextHeight + cfg.rowPadding);
    });

    // Only force a page break if there is not enough room for the title, header, and at least one row
    if (currentY + 4 + 7.5 + 15 > 275) {
      currentY = createNewPage();
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.text(title, 15, currentY);
    currentY += 4;

    if (currentY + 7.5 > 275) {
      currentY = createNewPage();
    }

    // Header Row (Slate-800)
    doc.setFillColor(30, 41, 59);
    doc.rect(15, currentY, 180, 7.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    // Narrow QTY column: from 15 to 35 (width 20mm), centered at 25
    doc.text('QTY', 25, currentY + 4.8, { align: 'center' });
    // Main column: from 35 to 195 (width 160mm), text start at 38
    doc.text('TEAM MEMBER', 38, currentY + 4.8);

    currentY += 7.5;

    doc.setDrawColor(203, 213, 225); 
    doc.setLineWidth(0.2);

    mapped.forEach((item, index) => {
      const wrappedName = doc.splitTextToSize(item.name, 154);
      const rowHeight = Math.max(7.5, wrappedName.length * cfg.rowTextHeight + cfg.rowPadding);

      if (currentY + rowHeight > 275) {
        doc.line(15, currentY, 195, currentY);
        currentY = createNewPage();

        doc.setFillColor(30, 41, 59);
        doc.rect(15, currentY, 180, 7.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('QTY', 25, currentY + 4.8, { align: 'center' });
        doc.text('TEAM MEMBER (CONTINUED)', 38, currentY + 4.8);
        currentY += 7.5;
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(15, currentY, 180, rowHeight, 'F');
      }

      // Vertical table border lines
      doc.line(15, currentY, 15, currentY + rowHeight);
      doc.line(35, currentY, 35, currentY + rowHeight);
      doc.line(195, currentY, 195, currentY + rowHeight);

      // Qty value (centered in 15..35)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(String(item.qty || 1), 25, currentY + 4.3, { align: 'center' });

      // Member Name in main column (at 38)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      wrappedName.forEach((line: string, i: number) => {
        doc.text(line, 38, currentY + 4.3 + (i * cfg.rowTextHeight));
      });

      // Horizontal row bottom line
      doc.line(15, currentY + rowHeight, 195, currentY + rowHeight);
      currentY += rowHeight;
    });

    currentY += cfg.tableSpacing; 
  };

  const drawEventDeliverablesTable = (title: string, deliverables: any[]) => {
    if (!deliverables || deliverables.length === 0) return;

    const mapped = deliverables.map(d => parsePdfItem(d)).filter(d => d.name.length > 0);
    if (mapped.length === 0) return;

    let tableH = 4 + 7.5; // Title spacing + Header row
    mapped.forEach((item) => {
      const wrappedName = doc.splitTextToSize(item.name, 154);
      tableH += Math.max(7.5, wrappedName.length * cfg.rowTextHeight + cfg.rowPadding);
    });

    // Only force a page break if there is not enough room for the title, header, and at least one row
    if (currentY + 4 + 7.5 + 15 > 275) {
      currentY = createNewPage();
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.text(title, 15, currentY);
    currentY += 4;

    if (currentY + 7.5 > 275) {
      currentY = createNewPage();
    }

    // Header Row (Slate-800)
    doc.setFillColor(30, 41, 59);
    doc.rect(15, currentY, 180, 7.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    // Narrow QTY column: from 15 to 35 (width 20mm), centered at 25
    doc.text('QTY', 25, currentY + 4.8, { align: 'center' });
    // Main column: from 35 to 195 (width 160mm), text start at 38
    doc.text('DELIVERABLE', 38, currentY + 4.8);

    currentY += 7.5;

    doc.setDrawColor(203, 213, 225); 
    doc.setLineWidth(0.2);

    mapped.forEach((item, index) => {
      const wrappedName = doc.splitTextToSize(item.name, 154);
      const rowHeight = Math.max(7.5, wrappedName.length * cfg.rowTextHeight + cfg.rowPadding);

      if (currentY + rowHeight > 275) {
        doc.line(15, currentY, 195, currentY);
        currentY = createNewPage();

        doc.setFillColor(30, 41, 59);
        doc.rect(15, currentY, 180, 7.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('QTY', 25, currentY + 4.8, { align: 'center' });
        doc.text('DELIVERABLE (CONTINUED)', 38, currentY + 4.8);
        currentY += 7.5;
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(15, currentY, 180, rowHeight, 'F');
      }

      // Vertical table border lines
      doc.line(15, currentY, 15, currentY + rowHeight);
      doc.line(35, currentY, 35, currentY + rowHeight);
      doc.line(195, currentY, 195, currentY + rowHeight);

      // Qty value (centered in 15..35)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(String(item.qty || 1), 25, currentY + 4.3, { align: 'center' });

      // Deliverable Name in main column (at 38)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      wrappedName.forEach((line: string, i: number) => {
        doc.text(line, 38, currentY + 4.3 + (i * cfg.rowTextHeight));
      });

      // Horizontal row bottom line
      doc.line(15, currentY + rowHeight, 195, currentY + rowHeight);
      currentY += rowHeight;
    });

    currentY += cfg.tableSpacing; 
  };

  const drawAdditionalTable = (title: string, items: { id: string; name: string; qty: number; price: number; isAdditional?: boolean }[]) => {
    let tableH = 4 + 7.5; 
    items.forEach((item) => {
      const cleanedItemName = cleanText(item.name || '');
      const wrappedName = doc.splitTextToSize(cleanedItemName, 166);
      tableH += Math.max(7.5, wrappedName.length * cfg.rowTextHeight + cfg.rowPadding);
    });

    // Only force a page break if there is not enough room for the title, header, and at least one row
    if (currentY + 4 + 7.5 + 15 > 275) {
      currentY = createNewPage();
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.text(title, 15, currentY);
    currentY += 4;

    if (currentY + 7.5 > 275) {
      currentY = createNewPage();
    }
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(15, currentY, 180, 7.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('SERVICE / DELIVERABLES', 19, currentY + 4.8);

    currentY += 7.5;

    doc.setDrawColor(203, 213, 225); 
    doc.setLineWidth(0.2);

    items.forEach((item, index) => {
      const cleanedItemName = cleanText(item.name || '');
      const wrappedName = doc.splitTextToSize(cleanedItemName, 166);
      const rowHeight = Math.max(7.5, wrappedName.length * cfg.rowTextHeight + cfg.rowPadding);

      if (currentY + rowHeight > 275) {
        doc.line(15, currentY, 195, currentY);
        currentY = createNewPage();

        doc.setFillColor(30, 41, 59);
        doc.rect(15, currentY, 180, 7.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('SERVICE / DELIVERABLES (CONTINUED)', 19, currentY + 4.8);
        currentY += 7.5;
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(15, currentY, 180, rowHeight, 'F');
      }

      doc.line(15, currentY, 15, currentY + rowHeight);
      doc.line(195, currentY, 195, currentY + rowHeight);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);

      doc.setFillColor(51, 65, 85);
      doc.circle(20, currentY + 4.3 - 0.9, 0.6, 'F');

      wrappedName.forEach((line: string, i: number) => {
        doc.text(line, 23, currentY + 4.3 + (i * cfg.rowTextHeight));
      });

      doc.line(15, currentY + rowHeight, 195, currentY + rowHeight);
      currentY += rowHeight;
    });

    currentY += cfg.tableSpacing; 
  };

  // Now, iterate through events and draw the specified blocks
  
  // CUSTOMER DETAILS CARD
  if (currentY + 26 > 275) {
    currentY = createNewPage();
  }

  doc.setFillColor(bgLightGrid[0], bgLightGrid[1], bgLightGrid[2]);
  doc.roundedRect(15, currentY, 180, 26, 1.5, 1.5, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.roundedRect(15, currentY, 180, 26, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
  doc.text('CUSTOMER DETAILS', 20, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);

  const col1 = [
    { label: 'Customer Name', val: lead.customer_name || 'N/A' },
    { label: 'Mobile Number', val: lead.mobile || 'N/A' },
    { label: 'Email Address', val: lead.email || 'N/A' },
    { label: 'Quotation Date', val: formatDate(lead.quotation_date || new Date().toISOString().split('T')[0]) }
  ];

  const col2 = [
    { label: 'Sales Staff Name', val: lead.sales_staff_name || 'N/A' },
    { label: 'Sales Staff Mobile', val: lead.sales_staff_mobile || 'N/A' },
    { label: 'Guest Pax', val: eventsToRender[0]?.guestPax || lead.total_pax || 'N/A' }
  ];

  col1.forEach((item, i) => {
    const itemY = currentY + 9.5 + (i * 4.5);
    doc.text(item.label, 20, itemY);
    doc.text(':', 45, itemY);
    doc.text(String(item.val), 47, itemY);
  });

  col2.forEach((item, i) => {
    const itemY = currentY + 9.5 + (i * 4.5);
    doc.text(item.label, 110, itemY);
    doc.text(':', 135, itemY);
    doc.text(String(item.val), 137, itemY);
  });

  currentY += 26 + cfg.secSpacing;

  eventsToRender.forEach((evObj, idx) => {
    // 1. EVENT NAME & META DETAILS
    if (currentY + 11 > 275) {
      currentY = createNewPage();
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
    const eventHeading = eventsToRender.length === 1
      ? `EVENT — ${evObj.eventName.toUpperCase()}`
      : `EVENT ${idx + 1} — ${evObj.eventName.toUpperCase()}`;
    doc.text(eventHeading, 15, currentY);
    currentY += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    
    const formattedEvDate = formatDate(evObj.eventDate);
    const formattedEvTime = evObj.eventTime ? formatTime12Hour(evObj.eventTime) : 'N/A';
    const formattedEndDate = formatDate(evObj.eventEndDate);
    const formattedEndTime = evObj.eventEndTime ? formatTime12Hour(evObj.eventEndTime) : 'N/A';
    
    const startStr = `Start: ${formattedEvDate} | ${formattedEvTime}`;
    const endStr = `End: ${formattedEndDate} | ${formattedEndTime}`;
    const locStr = `Location: ${evObj.eventLocation || 'N/A'}`;
    
    doc.text(`${startStr}`, 15, currentY);
    doc.text(`${endStr}`, 70, currentY);
    doc.text(`${locStr}`, 125, currentY);
    currentY += 6;

    // 3. TEAM MEMBERS INCLUDED
    if (evObj.members.length > 0) {
      drawTeamMembersTable('TEAM MEMBERS INCLUDED', evObj.members);
    }

    // 4. DELIVERABLES
    if (evObj.deliverables.length > 0) {
      drawEventDeliverablesTable('DELIVERABLES', evObj.deliverables);
    }
  });

  // 5. ADDITIONAL SPECIFICATIONS & SERVICE ADD-ONS (if any)
  if (additionalServices.length > 0) {
    drawAdditionalTable('ADDITIONAL SPECIFICATIONS & SERVICE ADD-ONS', additionalServices);
  }

  // 5. PRICING SUMMARY CARD
  const hasPaymentSection = paymentRows.length > 0;
  const numRows = 3 + paymentRows.length + (hasPaymentSection ? 1 : 0);
  const cardHeight = hasPaymentSection ? (cfg.pricingCardHeight / 3) * numRows : cfg.pricingCardHeight;
  const pricingCardTotalH = 4.5 + cardHeight;
  if (currentY + pricingCardTotalH > 275) {
    currentY = createNewPage();
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
  doc.text('PRICING SUMMARY & ESTIMATES', 15, currentY);
  currentY += 4.5;

  doc.setFillColor(248, 250, 252);
  doc.rect(15, currentY, 180, cardHeight, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.rect(15, currentY, 180, cardHeight, 'D');

  const pricingRowH = cardHeight / numRows;

  for (let r = 1; r < numRows; r++) {
    doc.line(15, currentY + (pricingRowH * r), 195, currentY + (pricingRowH * r));
  }
  doc.line(115, currentY, 115, currentY + cardHeight);

  // Fetch saved / entered Final Quotation Amount from Sales Dashboard Section 2 / lead record
  const getSavedFinalAmount = () => {
    if (!lead) return null;
    const candidates = [
      lead.Final_Quotation_Amount,
      lead.final_quotation_amount,
      lead.final_amount,
      lead.final_quoted_amount,
      lead.dynamicFinalAmt,
      lead.budget,
      lead.quotation_amount
    ];
    for (const val of candidates) {
      if (val !== undefined && val !== null && val !== '') {
        const num = Number(val);
        if (!Number.isNaN(num) && num > 0) {
          return num;
        }
      }
    }
    return null;
  };

  // Calculate pricing summary using verified latest Package Base Price as single source of truth
  const baseSumVal = targetBasePrice > 0 
    ? targetBasePrice 
    : (getSavedFinalAmount() || baseServices.reduce((sum, s) => sum + (Number(s.qty) * Number(s.price)), 0) || 0);
  const effectiveDiscount = Number(discountValue || lead?.Quotation_Discount || lead?.quotation_discount || 0);
  const effectiveAdditional = Number(additionalCharges || lead?.Additional_Services_Cost || lead?.additional_services_cost || 0);
  const finalAmountSum = Math.max(0, baseSumVal - effectiveDiscount + effectiveAdditional);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  
  doc.text('Package Base Price', 19, currentY + pricingRowH - 2);
  doc.text('Quotation Discount (Applied)', 19, currentY + (pricingRowH * 2) - 2);
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('FINAL ESTIMATED COMMERCIAL AMOUNT', 19, currentY + (pricingRowH * 3) - 2);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(baseSumVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 191, currentY + pricingRowH - 2, { align: 'right' });
  doc.text('- ' + effectiveDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 191, currentY + (pricingRowH * 2) - 2, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
  doc.text(finalAmountSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 191, currentY + (pricingRowH * 3) - 2, { align: 'right' });

  if (hasPaymentSection) {
    paymentRows.forEach((pRow, idx) => {
      const rNum = 4 + idx;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(pRow.label, 19, currentY + (pricingRowH * rNum) - 2);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129);
      doc.text(pRow.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 191, currentY + (pricingRowH * rNum) - 2, { align: 'right' });
    });

    const totalPaidSum = paymentRows.reduce((sum, p) => sum + p.amount, 0);
    const resolvedPaid = (lead?.total_paid_amount !== undefined && !isNaN(Number(lead.total_paid_amount)) && Number(lead.total_paid_amount) > 0)
      ? Number(lead.total_paid_amount)
      : totalPaidSum;

    const resolvedPending = Math.max(0, finalAmountSum - resolvedPaid);

    const pendingRowIdx = 4 + paymentRows.length;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Pending Amount', 19, currentY + (pricingRowH * pendingRowIdx) - 2);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(resolvedPending === 0 ? 16 : 225, resolvedPending === 0 ? 185 : 29, resolvedPending === 0 ? 129 : 72);
    doc.text(resolvedPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 191, currentY + (pricingRowH * pendingRowIdx) - 2, { align: 'right' });
  }

  currentY += cardHeight + cfg.secSpacing;

  // 6. PAYMENT DETAILS CARD (Completely hidden/removed as requested)
  // PAYMENT DETAILS section is hidden from the quotation PDF.
  // We do not increment currentY or draw the section.


  // 8. TERMS AND CONDITIONS
  if (currentY + 4.5 > 275) {
    currentY = createNewPage();
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
  doc.text('TERMS & CONDITIONS', 15, currentY);
  currentY += 4.5;

  let termsIndex = 0;
  while (termsIndex < termsToRender.length) {
    let boxStartY = currentY;
    let tempY = currentY + 4; // top padding of box
    let pageTerms = [];

    while (termsIndex < termsToRender.length) {
      const term = termsToRender[termsIndex];
      const cleanTerm = term.replace(/^\d+[\.\s\-)]+\s*/, '').replace(/[₹\u20B9\u20b9]/g, 'Rs.').replace(/\s+/g, ' ').trim();
      const prefix = `${termsIndex + 1}. `;
      const wrapped = doc.splitTextToSize(cleanTerm, 163); // fits beautifully inside 180mm box with margins and padding
      const termHeight = (wrapped.length * cfg.termsSpacing) + 3; // spacing between terms

      if (tempY + termHeight > 271) {
        if (pageTerms.length === 0) {
          // Force break page if not even one term fits
          currentY = createNewPage();
          boxStartY = currentY;
          tempY = currentY + 4;
          continue;
        }
        break; // Stop adding terms to this page, box will end here
      }
      pageTerms.push({ prefix, wrapped, termHeight });
      tempY += termHeight;
      termsIndex++;
    }

    if (pageTerms.length > 0) {
      const boxHeight = tempY - boxStartY + 2; // including bottom padding of box
      
      // Draw a dedicated bordered content box for the terms on this page
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240); // Light gray border
      doc.setLineWidth(0.25);
      doc.roundedRect(15, boxStartY, 180, boxHeight, 1.5, 1.5, 'FD'); // Rounded corners, filled with white, and bordered

      let textOffset = boxStartY + 5; // Start with top padding
      pageTerms.forEach((pt) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        doc.text(pt.prefix, 23, textOffset, { align: 'right' }); // Right-aligned prefix for vertical alignment

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        pt.wrapped.forEach((line: string, lineIdx: number) => {
          doc.text(line, 25, textOffset + (lineIdx * cfg.termsSpacing)); // Left-aligned wrapped text
        });
        textOffset += (pt.wrapped.length * cfg.termsSpacing) + 3; // Add spacing between terms
      });

      currentY = boxStartY + boxHeight + 4; // Spacing after the box
    }
  }

  // 9. PHOTOCREW PICTURES FOOTER (Always Last)
  // Check if we have enough space for the footer on the current final page.
  // If not, we create a new page for it.
  if (currentY > 245) {
    currentY = createNewPage();
  }

  // Draw the one-time brand company footer on the final page
  const finalPageNum = (doc as any).internal.getNumberOfPages();
  doc.setPage(finalPageNum);
  drawPhotoCrewFooter(doc, 255);

  // Apply Brand Headers and Page Number Footers to ALL pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i === 1) {
      drawPageHeader(doc);
    }
    drawPageFooter(doc, i, totalPages);
  }

  return doc;
};


export const highlightText = (text: string, search: string) => {
  if (!search.trim()) return <span>{text}</span>;
  const regex = new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-500/30 text-yellow-105 rounded px-0.5 font-bold">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
};

export const LEAD_SOURCES = [
  'Instagram Marketing',
  'Facebook Leads',
  'Google Ads / Search',
  'Website Inquiry',
  'WhatsApp / Direct',
  'Reference / Referral',
  'YouTube Channel',
  'Walk In Enquiry',
  'JustDial / Third Party',
  'Past Customer Repeat',
  'Other'
];

export interface SalesModuleProps {
  activeSubTab?: 'list' | 'create' | 'profiles' | 'packages' | 'calendar';
  setActiveSubTab?: (tab: 'list' | 'create' | 'profiles' | 'packages' | 'calendar') => void;
}

/**
 * Resolves the exact Step 3 Final Quotation Amount as the single source of truth
 * for the Booking Confirmation & Contract Form.
 * Strictly respects the requirement:
 * 1. Step 3 Final Quotation Amount is used directly without recalculation.
 * 2. Original Package Price, discount amount, or additional service amount are NOT used directly.
 * 3. The amount remains 100% consistent from Step 3 to Booking Confirmation.
 */
export function getStep3FinalQuotationAmount(
  targetLead?: any,
  options?: {
    dynamicFinalAmt?: number;
    wizardLeadData?: any;
    quotations?: any[];
    leads?: any[];
    orders?: any[];
    leadPackages?: any[];
    confirmFormQuotationAmount?: number | string;
  }
): number {
  const leadId = targetLead?.lead_id || options?.wizardLeadData?.lead_id;

  // 1. If currently in Step 3 / Active CRM Wizard for this lead, active Step 3 Final Quotation Amount takes top precedence
  if (options?.dynamicFinalAmt !== undefined && options?.dynamicFinalAmt !== null && !isNaN(Number(options.dynamicFinalAmt)) && Number(options.dynamicFinalAmt) > 0) {
    if (!targetLead || !options?.wizardLeadData?.lead_id || targetLead.lead_id === options.wizardLeadData.lead_id) {
      return Number(options.dynamicFinalAmt);
    }
  }

  if (options?.wizardLeadData?.final_amount !== undefined && options?.wizardLeadData?.final_amount !== null && options?.wizardLeadData?.final_amount !== '' && !isNaN(Number(options.wizardLeadData.final_amount)) && Number(options.wizardLeadData.final_amount) > 0) {
    if (!targetLead || !options?.wizardLeadData?.lead_id || targetLead.lead_id === options.wizardLeadData.lead_id) {
      return Number(options.wizardLeadData.final_amount);
    }
  }

  // 2. Saved Final Quotation Amount on targetLead object (Final_Quotation_Amount takes strict priority)
  if (targetLead) {
    const val = targetLead.Final_Quotation_Amount ?? targetLead.final_quotation_amount;
    if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
      return Number(val);
    }
  }

  // 3. Search in matching lead from leads array
  if (leadId && Array.isArray(options?.leads)) {
    const matched = options.leads.find((l: any) => l.lead_id === leadId);
    if (matched) {
      const val = matched.Final_Quotation_Amount ?? matched.final_quotation_amount;
      if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
        return Number(val);
      }
    }
  }

  // 4. Search in leadPackages array (matching lead_id - Step 3 calculated final_amount)
  if (leadId && Array.isArray(options?.leadPackages)) {
    const matchedLp = options.leadPackages.find((lp: any) => lp.lead_id === leadId);
    if (matchedLp) {
      const val = matchedLp.final_amount ?? matchedLp.Final_Amount;
      if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
        return Number(val);
      }
    }
  }

  // 5. Search in quotations array (final_quotation_amount or final_amount only)
  if (leadId && Array.isArray(options?.quotations) && options.quotations.length > 0) {
    const matchedQuotes = options.quotations.filter((q: any) => q.lead_id === leadId || q.leadId === leadId);
    if (matchedQuotes.length > 0) {
      const sorted = [...matchedQuotes].sort((a, b) => {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
        return timeB - timeA;
      });
      const latest = sorted[0];
      const val = latest.final_quotation_amount ?? latest.final_amount ?? latest.Final_Quotation_Amount;
      if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
        return Number(val);
      }
    }
  }

  // 6. Search in orders array
  if (leadId && Array.isArray(options?.orders)) {
    const matchedOrder = options.orders.find((o: any) => o.lead_id === leadId || o.order_id === targetLead?.order_id);
    if (matchedOrder) {
      const val = matchedOrder.quotation_amount ?? matchedOrder.finalPackageAmount;
      if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
        return Number(val);
      }
    }
  }

  // 7. Secondary fallback to Final_Package_Amount (only if Final_Quotation_Amount was not saved separately)
  if (targetLead) {
    const val = targetLead.Final_Package_Amount ?? targetLead.final_package_amount ?? targetLead.final_amount;
    if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
      return Number(val);
    }
  }
  if (leadId && Array.isArray(options?.leads)) {
    const matched = options.leads.find((l: any) => l.lead_id === leadId);
    if (matched) {
      const val = matched.Final_Package_Amount ?? matched.final_package_amount ?? matched.final_amount;
      if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
        return Number(val);
      }
    }
  }

  // 8. Check confirmForm quotation_amount if already set to a valid positive number
  if (options?.confirmFormQuotationAmount !== undefined && options?.confirmFormQuotationAmount !== null && options?.confirmFormQuotationAmount !== '' && !isNaN(Number(options.confirmFormQuotationAmount)) && Number(options.confirmFormQuotationAmount) > 0) {
    return Number(options.confirmFormQuotationAmount);
  }

  return 0;
}

/**
 * Synchronously retrieves the exact saved Final Quotation Amount for a specific lead / order.
 * Strictly checks the quotation records and lead records matching the exact target ID.
 * Returns null if no quotation data exists for this specific ID.
 */
export const getSyncSavedQuotationAmount = (
  targetLead?: any,
  targetLeadId?: string | null,
  targetOrderId?: string | null,
  allQuotations?: any[],
  allLeads?: any[],
  allOrders?: any[],
  allLeadPackages?: any[]
): number | null => {
  const leadId = targetLeadId || targetLead?.lead_id;
  const orderId = targetOrderId || targetLead?.order_id;
  if (!leadId && !orderId) return null;

  // 1. From targetLead object directly (Final Quotation Amount first!)
  if (targetLead && (leadId && targetLead.lead_id === leadId)) {
    const val = targetLead.Final_Quotation_Amount ?? targetLead.final_quotation_amount;
    if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
      return Number(val);
    }
  }

  // 2. From leads array strictly matching leadId
  if (leadId && Array.isArray(allLeads)) {
    const matchedLead = allLeads.find((l: any) => l.lead_id === leadId);
    if (matchedLead) {
      const val = matchedLead.Final_Quotation_Amount ?? matchedLead.final_quotation_amount;
      if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
        return Number(val);
      }
    }
  }

  // 3. From lead_packages array matching leadId (final_amount is Step 3 final amount)
  if (leadId && Array.isArray(allLeadPackages)) {
    const matchedLp = allLeadPackages.find((lp: any) => lp.lead_id === leadId);
    if (matchedLp) {
      const val = matchedLp.final_amount ?? matchedLp.Final_Amount;
      if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
        return Number(val);
      }
    }
  }

  // 4. From quotations store matching this exact lead_id or order_id (latest updated first, ONLY final_quotation_amount or final_amount!)
  if (Array.isArray(allQuotations) && allQuotations.length > 0) {
    const matchedQuotes = allQuotations.filter((q: any) => 
      (leadId && (q.lead_id === leadId || q.leadId === leadId)) || 
      (orderId && (q.order_id === orderId || q.orderId === orderId))
    );
    if (matchedQuotes.length > 0) {
      const sorted = [...matchedQuotes].sort((a, b) => {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
        return timeB - timeA;
      });
      const latest = sorted[0];
      const val = latest.final_quotation_amount ?? latest.final_amount ?? latest.Final_Quotation_Amount;
      if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
        return Number(val);
      }
    }
  }

  // 5. From orders array strictly matching orderId or leadId
  if (Array.isArray(allOrders)) {
    const matchedOrder = allOrders.find((o: any) => (leadId && o.lead_id === leadId) || (orderId && o.order_id === orderId));
    if (matchedOrder) {
      const val = matchedOrder.quotation_amount ?? matchedOrder.finalPackageAmount;
      if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
        return Number(val);
      }
    }
  }

  // 6. Secondary fallback to Final_Package_Amount
  if (targetLead) {
    const val = targetLead.Final_Package_Amount ?? targetLead.final_package_amount ?? targetLead.final_amount;
    if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
      return Number(val);
    }
  }
  if (leadId && Array.isArray(allLeads)) {
    const matchedLead = allLeads.find((l: any) => l.lead_id === leadId);
    if (matchedLead) {
      const val = matchedLead.Final_Package_Amount ?? matchedLead.final_package_amount ?? matchedLead.final_amount;
      if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
        return Number(val);
      }
    }
  }

  return null;
};

/**
 * Asynchronously fetches and verifies the exact latest saved Final Quotation Amount from Supabase & memory.
 * Guarantees that any recently updated quotation or database value is accurately resolved.
 */
export const resolveSavedQuotationAmount = async (
  targetLeadId?: string | null,
  targetOrderId?: string | null,
  allQuotations?: any[],
  allLeads?: any[],
  allOrders?: any[],
  allLeadPackages?: any[]
): Promise<number | null> => {
  if (!targetLeadId && !targetOrderId) return null;

  // 1. Query Supabase leads table directly for Final_Quotation_Amount
  if (supabaseClient) {
    if (targetLeadId && targetLeadId !== 'DRAFT-LEAD') {
      try {
        const { data: dbLead, error: leadErr } = await supabaseClient
          .from('leads')
          .select('Final_Quotation_Amount, final_quotation_amount')
          .eq('lead_id', targetLeadId)
          .maybeSingle();
        if (!leadErr && dbLead) {
          const val = dbLead.Final_Quotation_Amount ?? dbLead.final_quotation_amount;
          if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
            return Number(val);
          }
        }
      } catch (err) {
        console.warn('[resolveSavedQuotationAmount] Supabase leads fetch error:', err);
      }
    }

    // 2. Query Supabase lead_packages table directly for final_amount (Step 3 calculated final amount)
    if (targetLeadId && targetLeadId !== 'DRAFT-LEAD') {
      try {
        const { data: dbLp, error: lpErr } = await supabaseClient
          .from('lead_packages')
          .select('final_amount, total_amount')
          .eq('lead_id', targetLeadId)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (!lpErr && Array.isArray(dbLp) && dbLp.length > 0) {
          const val = dbLp[0].final_amount;
          if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
            return Number(val);
          }
        }
      } catch (err) {
        console.warn('[resolveSavedQuotationAmount] Supabase lead_packages fetch error:', err);
      }
    }

    // 3. Query Supabase quotations table directly for final_quotation_amount / final_amount
    try {
      let query = supabaseClient
        .from('quotations')
        .select('final_quotation_amount, final_amount, created_at, updated_at');
      
      if (targetLeadId && targetLeadId !== 'DRAFT-LEAD') {
        query = query.eq('lead_id', targetLeadId);
      } else if (targetOrderId) {
        query = query.eq('order_id', targetOrderId);
      }

      const { data: dbQuotes, error } = await query;
      if (!error && Array.isArray(dbQuotes) && dbQuotes.length > 0) {
        const sorted = [...dbQuotes].sort((a, b) => {
          const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
          const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
          return timeB - timeA;
        });
        const latest = sorted[0];
        const val = latest.final_quotation_amount ?? latest.final_amount;
        if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
          return Number(val);
        }
      }
    } catch (err) {
      console.warn('[resolveSavedQuotationAmount] Supabase quotations fetch error:', err);
    }

    // 4. Query Supabase orders table for quotation_amount
    try {
      let oQuery = supabaseClient
        .from('orders')
        .select('quotation_amount, final_package_amount');
      if (targetLeadId && targetLeadId !== 'DRAFT-LEAD') {
        oQuery = oQuery.eq('lead_id', targetLeadId);
      } else if (targetOrderId) {
        oQuery = oQuery.eq('order_id', targetOrderId);
      }
      const { data: dbOrders, error: oErr } = await oQuery;
      if (!oErr && Array.isArray(dbOrders) && dbOrders.length > 0) {
        const val = dbOrders[0].quotation_amount ?? dbOrders[0].final_package_amount;
        if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
          return Number(val);
        }
      }
    } catch (err) {
      console.warn('[resolveSavedQuotationAmount] Supabase orders fetch error:', err);
    }

    // 5. Query Final_Package_Amount from leads as secondary fallback
    if (targetLeadId && targetLeadId !== 'DRAFT-LEAD') {
      try {
        const { data: dbLead2, error: leadErr2 } = await supabaseClient
          .from('leads')
          .select('Final_Package_Amount, final_package_amount, final_amount')
          .eq('lead_id', targetLeadId)
          .maybeSingle();
        if (!leadErr2 && dbLead2) {
          const val = dbLead2.Final_Package_Amount ?? dbLead2.final_package_amount ?? dbLead2.final_amount;
          if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
            return Number(val);
          }
        }
      } catch (err) {
        console.warn('[resolveSavedQuotationAmount] Supabase leads fallback fetch error:', err);
      }
    }
  }

  // 6. Fallback to synchronous in-memory store
  return getSyncSavedQuotationAmount(null, targetLeadId, targetOrderId, allQuotations, allLeads, allOrders, allLeadPackages);
};

export interface ResolvedPaymentData {
  exactOrderId: string;
  advanceAmount: number;
  totalPaidAmount: number;
  pendingAmount: number;
  quotationAmount?: number;
  paymentsBreakdown: { label: string; amount: number }[];
  hasAdvance: boolean;
}

/**
 * Robustly fetches and resolves latest verified payment data for an exact Order ID / Lead ID.
 * Follows payment rules: filters out rejected payments, recognizes 'Advance Payment' type,
 * and maintains proper payment breakdowns without combining distinct payment types.
 */
export const fetchAndResolveLatestPaymentData = async (
  targetLeadId?: string | null,
  targetOrderId?: string | null,
  contextPaymentHistory?: any[],
  allOrders?: any[],
  allPayments?: any[],
  allLeads?: any[]
): Promise<ResolvedPaymentData> => {
  let exactOrderId = (targetOrderId && String(targetOrderId).trim() !== '' && !String(targetOrderId).startsWith('DRAFT'))
    ? String(targetOrderId).trim()
    : '';

  const cleanLeadId = (targetLeadId && String(targetLeadId).trim() !== '' && !String(targetLeadId).startsWith('DRAFT'))
    ? String(targetLeadId).trim()
    : '';

  // 1. Resolve exact Order ID from Orders (Supabase + Context)
  if (!exactOrderId && cleanLeadId) {
    const memOrder = (allOrders || []).find((o: any) => o.lead_id === cleanLeadId || o.order_id === cleanLeadId);
    if (memOrder?.order_id) {
      exactOrderId = String(memOrder.order_id).trim();
    }
  }

  if (supabaseClient) {
    try {
      if (!exactOrderId && cleanLeadId) {
        const { data: dbOrders } = await supabaseClient
          .from('orders')
          .select('order_id, lead_id, status, advance_received, advance_payment')
          .or(`lead_id.eq.${cleanLeadId},order_id.eq.${cleanLeadId}`);
        if (dbOrders && Array.isArray(dbOrders) && dbOrders.length > 0) {
          const activeOrder = dbOrders.find((o: any) => o.status !== 'Cancelled') || dbOrders[0];
          if (activeOrder?.order_id) {
            exactOrderId = String(activeOrder.order_id).trim();
          }
        }
      }
    } catch (err) {
      console.warn('[fetchAndResolveLatestPaymentData] Error resolving order_id:', err);
    }
  }

  // 2. Fetch latest payment_history directly from Supabase for this exact Order ID / Lead ID
  const allPossibleIds = getAllMatchingOrderIds(exactOrderId || targetOrderId, cleanLeadId);
  let dbHistories: any[] = [];
  if (supabaseClient && allPossibleIds.length > 0) {
    try {
      const orClauses = allPossibleIds.map(id => `order_id.eq.${id}`);
      const { data, error } = await supabaseClient
        .from('payment_history')
        .select('*')
        .or(orClauses.join(','));
      if (!error && Array.isArray(data)) {
        dbHistories = data;
      }
    } catch (err) {
      console.warn('[fetchAndResolveLatestPaymentData] Error fetching payment_history:', err);
    }
  }

  // 3. LocalStorage pending approvals & status sets
  let localPending: any[] = [];
  try {
    const saved = localStorage.getItem('pending_payment_approvals');
    if (saved) {
      const parsed = JSON.parse(saved) || [];
      localPending = parsed.filter((h: any) => {
        const hid = String(h.order_id || '').trim();
        return allPossibleIds.includes(hid);
      });
    }
    if (exactOrderId) {
      const ordSaved = localStorage.getItem(`payment_history_${exactOrderId}`);
      if (ordSaved) {
        const parsed = JSON.parse(ordSaved) || [];
        if (Array.isArray(parsed)) {
          parsed.forEach((h: any) => {
            const hid = String(h.order_id || '').trim();
            if (allPossibleIds.includes(hid)) {
              localPending.push(h);
            }
          });
        }
      }
    }
    if (cleanLeadId) {
      const leadSaved = localStorage.getItem(`payment_history_${cleanLeadId}`);
      if (leadSaved) {
        const parsed = JSON.parse(leadSaved) || [];
        if (Array.isArray(parsed)) {
          parsed.forEach((h: any) => {
            const hid = String(h.order_id || '').trim();
            if (allPossibleIds.includes(hid)) {
              localPending.push(h);
            }
          });
        }
      }
    }
  } catch (_) {}

  let approvedIds = new Set<string>();
  try {
    const approvedSaved = localStorage.getItem('approved_payment_history_ids');
    if (approvedSaved) approvedIds = new Set(JSON.parse(approvedSaved));
  } catch (_) {}

  let rejectedIds = new Set<string>();
  try {
    const rejectedSaved = localStorage.getItem('rejected_payment_history_ids');
    if (rejectedSaved) rejectedIds = new Set(JSON.parse(rejectedSaved));
  } catch (_) {}

  // 4. Merge payment history sources into single deduplicated map
  const combinedMap = new Map<string, any>();
  dbHistories.forEach(item => {
    const key = String(item.id || item.payment_history_id || '');
    if (key) combinedMap.set(key, item);
  });
  (contextPaymentHistory || []).forEach(item => {
    const key = String(item.id || item.payment_history_id || '');
    if (key) combinedMap.set(key, { ...combinedMap.get(key), ...item });
  });
  localPending.forEach(item => {
    const key = String(item.id || item.payment_history_id || '');
    if (key && !combinedMap.has(key)) combinedMap.set(key, item);
  });

  // 5. Filter out rejected payments and ensure association with exact Order ID
  const validHistories = Array.from(combinedMap.values()).filter(h => {
    const hid = String(h.order_id || '').trim();
    if (!hid) return false;
    const isMatch = allPossibleIds.includes(hid);
    if (!isMatch) return false;

    const histId = String(h.id || h.payment_history_id || '');
    const isExplicitlyRejected = h.approval_status === 'Rejected' ||
      rejectedIds.has(histId) ||
      (typeof h.notes === 'string' && (
        h.notes.includes('Rejected') ||
        h.notes.includes('[REJECTED]') ||
        h.notes.endsWith('- Rejected') ||
        h.notes.toLowerCase().includes('rejected by business owner')
      ));

    return !isExplicitlyRejected;
  });

  // 6. Identify payments by Payment Type
  const advanceTransactions = validHistories.filter(h => {
    const type = String(h.payment_type || h.Payment_type || '').trim().toLowerCase();
    if (type === 'advance payment' || type === 'advance') return true;
    if (!type && typeof h.notes === 'string' && h.notes.toLowerCase().includes('advance')) return true;
    return false;
  });

  let advanceAmount = advanceTransactions.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);

  // Fallback to order or payment record if no payment_history rows exist
  if (advanceAmount === 0) {
    const targetOrder = (allOrders || []).find((o: any) =>
      (exactOrderId && o.order_id === exactOrderId) ||
      (cleanLeadId && o.lead_id === cleanLeadId)
    );
    const targetPayment = (allPayments || []).find((p: any) =>
      (exactOrderId && p.order_id === exactOrderId) ||
      (cleanLeadId && p.lead_id === cleanLeadId)
    );

    if (targetOrder?.advance_received !== undefined && Number(targetOrder.advance_received) > 0) {
      advanceAmount = Number(targetOrder.advance_received);
    } else if (targetOrder?.advance_payment !== undefined && Number(targetOrder.advance_payment) > 0) {
      advanceAmount = Number(targetOrder.advance_payment);
    } else if (targetPayment?.advance_received !== undefined && Number(targetPayment.advance_received) > 0 && targetPayment.payment_status !== 'Rejected' && targetPayment.payment_status !== 'Cancelled') {
      advanceAmount = Number(targetPayment.advance_received);
    }
  }

  // 7. Group other non-advance payments (e.g. Shoot Time / Event Date Payment, Final Payment)
  const otherTransactions = validHistories.filter(h => !advanceTransactions.includes(h));
  const otherGroups = new Map<string, number>();

  otherTransactions.forEach(h => {
    const rawType = String(h.payment_type || h.Payment_type || '').trim() || 'Payment';
    let label = rawType;
    if (rawType.toLowerCase().includes('shoot') || rawType.toLowerCase().includes('event')) {
      label = 'Event Date Payment';
    } else if (rawType.toLowerCase().includes('final')) {
      label = 'Final Payment';
    }
    const amt = Number(h.amount) || 0;
    if (amt > 0) {
      otherGroups.set(label, (otherGroups.get(label) || 0) + amt);
    }
  });

  const paymentsBreakdown: { label: string; amount: number }[] = [];
  if (advanceAmount > 0) {
    paymentsBreakdown.push({ label: 'Advance Payment', amount: advanceAmount });
  }
  otherGroups.forEach((amount, label) => {
    paymentsBreakdown.push({ label, amount });
  });

  // 8. Calculate total paid amount (Approved + Waiting for Approval, excluding Rejected)
  const approvedHistories = validHistories.filter(h => h.approval_status === 'Approved');
  const pendingApprovalHistories = validHistories.filter(h => h.approval_status === 'Waiting for Approval');

  let approvedAmount = approvedHistories.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);
  let pendingApprovalAmount = pendingApprovalHistories.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);

  let totalPaidAmount = approvedAmount + pendingApprovalAmount;

  // Fallback if no payment_history rows exist
  if (validHistories.length === 0) {
    const targetOrder = (allOrders || []).find((o: any) =>
      (exactOrderId && o.order_id === exactOrderId) ||
      (cleanLeadId && o.lead_id === cleanLeadId)
    );
    const targetPayment = (allPayments || []).find((p: any) =>
      (exactOrderId && p.order_id === exactOrderId) ||
      (cleanLeadId && p.lead_id === cleanLeadId)
    );

    if (targetPayment) {
      if (targetPayment.payment_status === 'Waiting for Approval') {
        pendingApprovalAmount = (Number(targetPayment.advance_received) || 0) + (Number(targetPayment.final_payment_received) || 0) + (Number(targetPayment.additional_received) || 0);
      } else if (targetPayment.payment_status !== 'Rejected' && targetPayment.payment_status !== 'Cancelled') {
        approvedAmount = (Number(targetPayment.advance_received) || 0) + (Number(targetPayment.final_payment_received) || 0) + (Number(targetPayment.additional_received) || 0);
      }
      totalPaidAmount = approvedAmount + pendingApprovalAmount;
    }

    if (totalPaidAmount === 0 && targetOrder) {
      const adv = Number(targetOrder.advance_received || targetOrder.advance_payment || 0);
      if (adv > 0) {
        totalPaidAmount = adv;
      }
    }
  }

  if (advanceAmount > totalPaidAmount) {
    totalPaidAmount = advanceAmount;
  }

  // Resolve latest quotation amount
  let quotationAmount = 0;
  try {
    const qAmt = await resolveSavedQuotationAmount(cleanLeadId, exactOrderId, undefined, allLeads, allOrders);
    if (qAmt && qAmt > 0) {
      quotationAmount = qAmt;
    }
  } catch (_) {}

  if (quotationAmount === 0) {
    const targetLead = (allLeads || []).find((l: any) => l.lead_id === cleanLeadId);
    const targetOrder = (allOrders || []).find((o: any) => (exactOrderId && o.order_id === exactOrderId) || (cleanLeadId && o.lead_id === cleanLeadId));
    quotationAmount = Number(targetOrder?.quotation_amount || targetLead?.Final_Quotation_Amount || targetLead?.final_quotation_amount || targetLead?.final_amount || targetLead?.budget || 0);
  }

  const pendingAmount = Math.max(0, quotationAmount - totalPaidAmount);

  return {
    exactOrderId,
    advanceAmount,
    totalPaidAmount,
    pendingAmount,
    quotationAmount,
    paymentsBreakdown,
    hasAdvance: totalPaidAmount > 0 || advanceAmount > 0
  };
};

/**
 * Safely parses date string into { year, month, day }
 */
export const parseEventDateParts = (dStr: string | undefined | null): { year: number; month: number; day: number } | null => {
  if (!dStr) return null;
  const clean = String(dStr).trim();
  if (!clean) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (year > 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (year > 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate()
    };
  }

  return null;
};

/**
 * Safely parses time string into { hours, minutes } in 24-hour format
 */
export const parseEventTimeParts = (tStr: string | undefined | null): { hours: number; minutes: number } | null => {
  if (!tStr) return null;
  const clean = String(tStr).trim().toUpperCase();
  if (!clean) return null;

  // 12-hour AM/PM format (e.g., "08:00 AM", "8:30 PM", "12:00 PM")
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3];
    if (period === 'PM' && hours < 12) hours += 12;
    else if (period === 'AM' && hours === 12) hours = 0;
    return { hours, minutes };
  }

  // 24-hour format (e.g., "14:30", "08:00")
  const h24Match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24Match) {
    const hours = parseInt(h24Match[1], 10);
    const minutes = parseInt(h24Match[2], 10);
    if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }

  return null;
};

/**
 * Detects if an individual event has completed/ended based on exact Event End Date and Event End Time.
 * Uses exact event record data without hardcoding.
 */
export const checkIsEventEnded = (event: any): boolean => {
  if (!event) return false;

  // Exact Event End Date from saved event data
  const rawEndDate = 
    event.event_end_date || 
    event.Event_End_Date || 
    event.Event_end_date ||
    event.event_date || 
    event.event_start_date ||
    event.booking_date;

  if (!rawEndDate || typeof rawEndDate !== 'string' || !rawEndDate.trim()) {
    return false;
  }

  // Exact Event End Time from saved event data
  const rawEndTime = 
    event.event_end_time || 
    event.Event_End_Time || 
    event.Event_end_time ||
    event.event_time || 
    event.event_start_time ||
    event.booking_time;

  const dParts = parseEventDateParts(rawEndDate);
  if (!dParts) return false;

  // If end time is provided, parse it. If omitted, default to 23:59:59 of that date
  // so it does not lock prematurely during the day.
  const tParts = parseEventTimeParts(rawEndTime) || { hours: 23, minutes: 59 };

  const eventEndDateTime = new Date(
    dParts.year,
    dParts.month - 1,
    dParts.day,
    tParts.hours,
    tParts.minutes,
    59,
    999
  );

  return Date.now() > eventEndDateTime.getTime();
};

/**
 * Checks if the entire lead/order CRM is locked because all of its events have completed/ended.
 * If lead has multiple events, it only locks the whole CRM if ALL events have ended.
 */
export const checkIsLeadCrmLocked = (lead: any, eventsList?: any[]): boolean => {
  if (!lead) return false;

  const events = (eventsList && eventsList.length > 0)
    ? eventsList
    : ((lead.events && lead.events.length > 0) ? lead.events : [lead]);

  if (!events || events.length === 0) return false;

  const validEvents = events.filter((ev: any) => {
    const hasDate = ev.event_end_date || ev.Event_End_Date || ev.Event_end_date || ev.event_date || ev.event_start_date || ev.booking_date;
    return !!hasDate;
  });

  if (validEvents.length === 0) return false;

  return validEvents.every((ev: any) => checkIsEventEnded(ev));
};

/**
 * Resolves all canonical and formatted variations of Order ID and Lead ID
 * to ensure bulletproof relational querying and payment association.
 */
export const getAllMatchingOrderIds = (
  orderId?: string | null,
  leadId?: string | null,
  orders: any[] = [],
  leads: any[] = []
): string[] => {
  const set = new Set<string>();
  const addVariant = (id?: any) => {
    if (!id || typeof id !== 'string') return;
    const clean = id.trim();
    if (!clean) return;
    set.add(clean);
    set.add(clean.toUpperCase());
    set.add(clean.toLowerCase());

    const noOrd = clean.replace(/^ORD-?/i, '');
    const noOr = clean.replace(/^OR-?/i, '');
    const noLd = clean.replace(/^LD-?/i, '');
    const noPrefix = clean.replace(/^(?:ORD|OR|LD)-?/i, '');

    if (noOrd) {
      set.add(noOrd);
      set.add(`ORD-${noOrd}`);
      set.add(`ORD${noOrd}`);
    }
    if (noOr) {
      set.add(noOr);
      set.add(`OR-${noOr}`);
      set.add(`OR${noOr}`);
      set.add(`ORD-${noOr}`);
    }
    if (noLd) {
      set.add(noLd);
      set.add(`LD-${noLd}`);
      set.add(`LD${noLd}`);
      set.add(`ORD-${noLd}`);
    }
    if (noPrefix) {
      set.add(noPrefix);
      set.add(`OR-${noPrefix}`);
      set.add(`OR${noPrefix}`);
      set.add(`ORD-${noPrefix}`);
    }

    // Number extraction for zero-padding variations (e.g. 64 -> OR064, OR0064, ORD-0064)
    const numMatch = clean.match(/\d+/);
    if (numMatch) {
      const num = parseInt(numMatch[0], 10);
      if (!isNaN(num)) {
        const p2 = String(num).padStart(2, '0');
        const p3 = String(num).padStart(3, '0');
        const p4 = String(num).padStart(4, '0');
        const isLead = clean.toUpperCase().includes('LD');
        
        if (!isLead) {
          set.add(`OR${num}`);
          set.add(`OR${p2}`);
          set.add(`OR${p3}`);
          set.add(`OR${p4}`);
          set.add(`OR-${num}`);
          set.add(`OR-${p2}`);
          set.add(`OR-${p3}`);
          set.add(`OR-${p4}`);
          set.add(`ORD-${num}`);
          set.add(`ORD-${p2}`);
          set.add(`ORD-${p3}`);
          set.add(`ORD-${p4}`);
          set.add(`ORD-OR${p3}`);
          set.add(`ORD-OR${p4}`);
          set.add(`ORDER-${num}`);
          set.add(`ORDER-${p3}`);
          set.add(`ORDER-${p4}`);
        } else {
          set.add(`LD${num}`);
          set.add(`LD${p2}`);
          set.add(`LD${p3}`);
          set.add(`LD${p4}`);
          set.add(`LD-${num}`);
          set.add(`LD-${p2}`);
          set.add(`LD-${p3}`);
          set.add(`LD-${p4}`);
          set.add(`ORD-LD${p3}`);
          set.add(`ORD-LD${p4}`);
          set.add(`ORD-${p3}`);
        }
      }
    }
  };

  addVariant(orderId);
  addVariant(leadId);

  // Look up matching order in orders array
  const cleanO = String(orderId || '').trim();
  const cleanL = String(leadId || '').trim();
  const linkedOrder = (orders || []).find((o: any) => {
    if (!o) return false;
    if (cleanO && (o.order_id === cleanO || o.lead_id === cleanO)) return true;
    if (cleanL && (o.lead_id === cleanL || o.order_id === cleanL)) return true;
    const oId = String(o.order_id || '');
    const lId = String(o.lead_id || '');
    if (set.has(oId) || set.has(lId)) return true;
    return false;
  });

  if (linkedOrder) {
    addVariant(linkedOrder.order_id);
    addVariant(linkedOrder.lead_id);
  }

  // Look up matching lead in leads array
  const linkedLead = (leads || []).find((l: any) => {
    if (!l) return false;
    if (cleanL && l.lead_id === cleanL) return true;
    if (cleanO && (l.lead_id === cleanO || (l as any).order_id === cleanO)) return true;
    const lId = String(l.lead_id || '');
    const loId = String((l as any).order_id || '');
    if (set.has(lId) || (loId && set.has(loId))) return true;
    return false;
  });

  if (linkedLead) {
    addVariant(linkedLead.lead_id);
    addVariant((linkedLead as any).order_id);
  }

  return Array.from(set).filter(Boolean);
};

