import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AddNoteModal } from "./AddNoteModal";
import { createPortal } from 'react-dom';
import { useRole, mapUserFieldsFromDb, INITIAL_PACKAGES, getStatusRank, isFollowUpDateTimeReached } from './RoleContext';
import { supabaseClient } from '../supabaseClient';
import { AnimatedSalesGreeting } from './sales/AnimatedSalesGreeting';
import { DashboardGreetingHeader } from './DashboardGreetingHeader';
import { 
  FileText, Plus, Edit, CheckSquare, Search, Filter, Ban, X, Phone, Mail, MapPin, Calendar, DollarSign, Clock, Users, ArrowRight, ChevronDown, ChevronUp, Check, Package, Trash, Trash2, Eye, Loader2, CheckCircle2, RefreshCw, ArrowUpDown
} from 'lucide-react';
import { Lead, CurrentStage, LeadPackage, EVENT_TYPES, PACKAGE_CATEGORIES, ACTIVE_STAGE_GROUPS, LeadEvent } from '../types';
import { StatusText } from './ui/StatusText';
import { EventDropdownCell } from './EventDropdownCell';
import { UnifiedEventDropdownCell } from './UnifiedEventDropdownCell';
import { EventCategoryCell } from './EventCategoryCell';
import { EventLocationCell } from './EventLocationCell';
import { EventDateCell } from './EventDateCell';
import { EventCell } from './EventCell';
import { MultiSelectDropdown } from './ui/MultiSelectDropdown';
import { CameraLensStatsCard, CameraLensTheme } from './CameraLensStatsCard';
import { ListSortFilter, SortOrder } from './ui/ListSortFilter';
import { DateFilterInput } from './ui/DateFilterInput';

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
import { formatINR, formatIndianPhoneNumber, validateIndianMobile, formatTime12Hour, getCustomers, triggerAutoScrollAndFocus, normalizeCategory, parseTeamMembers, formatQtyItem, formatQtyArray, formatQtyList, formatDateDDMMYY, getStoredCustomCategories, saveCustomCategoryToStorage, parsePackageDeliverables, ParsedDeliverableItem } from '../utils';
import { SalesCalendar } from './SalesCalendar';
import { CustomPackageMaster } from './CustomPackageMaster';
import { AddressAutocomplete } from './AddressAutocomplete';
import { TimePicker12Hour } from './TimePicker12Hour';
import { jsPDF } from 'jspdf';
import { SearchablePackageSelect } from './sales/SearchablePackageSelect';
import { fetchAndResolveLatestPaymentData, verifyAndFormatLeadPackagePayload } from './SalesUtils';

interface LocalEditableInputProps {
  value: string;
  disabled?: boolean;
  onChange: (val: string) => void;
  className?: string;
  list?: string;
  placeholder?: string;
  options?: string[];
}

const LocalEditableInput: React.FC<LocalEditableInputProps> = ({ value, disabled, onChange, className, list, placeholder, options }) => {
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

function parseQtyAndText(raw: any): { qty: number; text: string } {
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

  // 1. Check for explicit (Qty: X), (quantity: X), (count: X), (Qty X) anywhere in the string
  let foundQtyFromPattern: number | null = null;
  const qtyPatterns = /\s*[\(\[-]?\s*(?:qty|quantity|count)\s*[:=]?\s*(\d+)\s*[\)\]\-]?/gi;
  let match;
  while ((match = qtyPatterns.exec(text)) !== null) {
    if (match[1]) {
      const parsedQty = parseInt(match[1], 10);
      if (!isNaN(parsedQty) && parsedQty >= 1) {
        if (foundQtyFromPattern === null) {
          foundQtyFromPattern = parsedQty;
        }
      }
    }
  }

  if (foundQtyFromPattern !== null) {
    text = text.replace(/\s*[\(\[-]?\s*(?:qty|quantity|count)\s*[:=]?\s*\d+\s*[\)\]\-]?/gi, "").trim();
    return { qty: foundQtyFromPattern, text };
  }

  // 2. Check for dimension / size specifications at the start of the string:
  // e.g. "16×6", "16x6", "12×8 Album", "16×6 Frame", "16 × 6", "12 x 18", "8x24", "8*12", "12×36"
  // If the string starts with a dimension (digits x/× digits), it is deliverable text, NOT a leading quantity!
  const isLeadingDimension = /^\d+\s*[\*xX×]\s*\d+/.test(text);
  if (isLeadingDimension) {
    return { qty: 1, text };
  }

  // 3. Check for technical specifications / units starting with numbers:
  // e.g. "4K Cinematic Video", "8K Video", "20 Pages × 2", "400 Edited Candid Photos", "50 Photos", "3 Hours", "10 Sheets"
  const isUnitOrSpec = /^\d+\s*(?:[kK]\b|min\b|mins\b|minute|minutes|sec\b|secs\b|second|seconds|hr\b|hrs\b|hour|hours|page|pages|sheet|sheets|photo|photos|image|images|pic|pics|picture|pictures|gb\b|mb\b|tb\b|day\b|days\b|edited\b)/i.test(text);
  if (isUnitOrSpec) {
    return { qty: 1, text };
  }

  // 4. Check for leading quantity with explicit multiplier:
  // e.g. "2 x Traditional Photos", "2 × Cinematic Video", "2 * Album", "2 x 16×6 Frame", "2 × 16×6"
  const multiplierMatch = text.match(/^(\d+)\s*[xX×\*]\s+(.+)$/);
  if (multiplierMatch) {
    const parsedQty = parseInt(multiplierMatch[1], 10);
    if (!isNaN(parsedQty) && parsedQty >= 1) {
      return { qty: parsedQty, text: multiplierMatch[2].trim() };
    }
  }

  // 5. Check for leading quantity followed by dimension:
  // e.g. "2 16×6", "3 12×8 Album", "2 16×6 Frame"
  const qtyDimensionMatch = text.match(/^(\d+)\s+(\d+\s*[\*xX×]\s*\d+.*)$/);
  if (qtyDimensionMatch) {
    const parsedQty = parseInt(qtyDimensionMatch[1], 10);
    if (!isNaN(parsedQty) && parsedQty >= 1) {
      return { qty: parsedQty, text: qtyDimensionMatch[2].trim() };
    }
  }

  // 6. Check for leading quantity with space followed by item name:
  // e.g. "2 Lead Photographer", "1 Drone Operator", "2 Albums", "2 Frames (12×18)"
  const wordMatch = text.match(/^(\d+)\s+([a-zA-Z\(\[\{].+)$/);
  if (wordMatch) {
    const parsedQty = parseInt(wordMatch[1], 10);
    if (!isNaN(parsedQty) && parsedQty >= 1) {
      return { qty: parsedQty, text: wordMatch[2].trim() };
    }
  }

  return { qty: 1, text };
}

function combineQtyAndText(qty: number | string, text: string): string {
  const qNum = parseInt(String(qty), 10);
  const validQty = !isNaN(qNum) && qNum >= 1 ? qNum : 1;
  const cleanText = (text || "").trim();
  if (!cleanText) return validQty > 1 ? `${validQty}` : "";
  if (validQty <= 1) {
    return cleanText;
  }
  return `${validQty} ${cleanText}`.trim();
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
    const evId = event?.id || event?.event_id || `event_${idx + 1}`;
    const evName = event?.event_name || event?.event_type || 'Unnamed Event';

    const keysToTry = isMultiEvent
      ? [
          `${effectivePkgId}_${evId}`,
          `${effectivePkgId}_${evName}`,
          `Custom Package_${evId}`,
          `Custom Package_${evName}`,
          `custom_package_${evId}`,
          `custom_package_${evName}`
        ]
      : [
          `${effectivePkgId}_${evId}`,
          `${effectivePkgId}_${evName}`,
          `Custom Package_${evId}`,
          `Custom Package_${evName}`,
          `custom_package_${evId}`,
          `custom_package_${evName}`,
          effectivePkgId,
          'Custom Package',
          'custom_package'
        ];

    let list: any[] = [];
    for (const k of keysToTry) {
      if (editableInclusions[k] !== undefined && Array.isArray(editableInclusions[k]) && editableInclusions[k].length > 0) {
        list = editableInclusions[k];
        break;
      }
    }

    return {
      event_id: evId,
      event_name: evName,
      team_members: formatListToStructuredObjects(list)
    };
  });

  const deliverablesJson = eventsList.map((event, idx) => {
    const evId = event?.id || event?.event_id || `event_${idx + 1}`;
    const evName = event?.event_name || event?.event_type || 'Unnamed Event';

    const keysToTry = isMultiEvent
      ? [
          `${effectivePkgId}_${evId}`,
          `${effectivePkgId}_${evName}`,
          `Custom Package_${evId}`,
          `Custom Package_${evName}`,
          `custom_package_${evId}`,
          `custom_package_${evName}`
        ]
      : [
          `${effectivePkgId}_${evId}`,
          `${effectivePkgId}_${evName}`,
          `Custom Package_${evId}`,
          `Custom Package_${evName}`,
          `custom_package_${evId}`,
          `custom_package_${evName}`,
          effectivePkgId,
          'Custom Package',
          'custom_package'
        ];

    let list: any[] = [];
    for (const k of keysToTry) {
      if (editableDeliverables[k] !== undefined && Array.isArray(editableDeliverables[k]) && editableDeliverables[k].length > 0) {
        list = editableDeliverables[k];
        break;
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

  return {
    teamMembersJson,
    deliverablesJson,
    flatTeamMembers,
    flatDeliverables,
    teamMembersText: teamMembersJson.length > 1 ? JSON.stringify(teamMembersJson) : JSON.stringify(flatTeamMembers),
    deliverablesText: deliverablesJson.length > 1 ? JSON.stringify(deliverablesJson) : JSON.stringify(flatDeliverables)
  };
}

export { parseTeamMembersJsonToRecord, parseDeliverablesJsonToRecord } from './SalesUtils';

interface CompactQtyItemRowProps {
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

const CompactQtyItemRow: React.FC<CompactQtyItemRowProps> = ({
  value,
  options,
  placeholder,
  disabled = false,
  onChange,
  onDelete,
}) => {
  const { qty, text } = React.useMemo(() => parseQtyAndText(value), [value]);

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const rawVal = e.target.value;
    const newQty = parseInt(rawVal, 10);
    const validQty = isNaN(newQty) || newQty < 1 ? 1 : newQty;
    onChange(combineQtyAndText(validQty, text));
  };

  const handleTextChange = (newText: string) => {
    if (disabled) return;
    onChange(combineQtyAndText(qty, newText));
  };

  return (
    <div className={`flex items-center gap-2 bg-slate-950/40 border border-slate-800/80 p-2 sm:p-2.5 rounded-lg transition-all ${disabled ? 'opacity-60 pointer-events-none' : 'hover:border-slate-700/80'}`}>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] font-bold text-slate-400 uppercase font-mono hidden sm:inline">Qty</span>
        <input
          type="number"
          min="1"
          disabled={disabled}
          value={qty}
          onChange={handleQtyChange}
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

const validateAndFormatTime = (timeStr: any, fieldLabel: string): string | null => {
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

const getLogoBase64FromUrl = (url: string): Promise<{ base64: string; aspect: number }> => {
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

const generateQuotationPdfFileName = (leadObj: any): string => {
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

const generateQuotationPDF = (
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
    const baseSum = activePkgs.reduce((sum, p) => sum + Number(p.package_cost || p.price || 0), 0);
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
    // 1. First, create the array of events
    const unsortedEvents: any[] = [];
    lead.events.forEach((event: any) => {
      const eventKey = `${pkgId}_${event.id}`;
      const nameKey = `${pkgId}_${event.event_name || event.event_type || 'Unnamed Event'}`;
      
      const isMulti = lead.events.length > 1;
      const eventInclusions = editableInclusions?.[eventKey] !== undefined
        ? editableInclusions[eventKey]
        : (isMulti ? [] : (editableInclusions?.[nameKey] !== undefined ? editableInclusions[nameKey] : inclusionsList));

      const eventName = event.event_name || event.event_type || 'Unnamed Event';

      const eventDeliverables = editableDeliverables?.[eventKey] !== undefined
        ? editableDeliverables[eventKey]
        : (isMulti ? [] : (editableDeliverables?.[nameKey] !== undefined ? editableDeliverables[nameKey] : null));

      const items = eventDeliverables !== null
        ? eventDeliverables.filter(Boolean)
        : (isMulti ? [] : deliverablesList);

      unsortedEvents.push({
        eventName,
        eventDate: event.event_start_date || event.event_date || "",
        eventTime: event.event_time || event.event_start_time || "",
        eventEndDate: event.event_end_date || "",
        eventEndTime: event.event_end_time || "",
        eventLocation: event.event_location || "N/A",
        guestPax: event.guest_pax !== undefined && event.guest_pax !== null && event.guest_pax !== '' ? String(event.guest_pax) : (lead.guest_pax !== undefined && lead.guest_pax !== null && lead.guest_pax !== '' ? String(lead.guest_pax) : (lead.total_pax ? String(lead.total_pax) : 'N/A')),
        members: (eventInclusions || []).filter(Boolean),
        deliverables: items
      });
    });

    // 2. Sort by event date ascending
    unsortedEvents.sort((a, b) => {
      const dateA = new Date(a.eventDate || "9999-12-31").getTime();
      const dateB = new Date(b.eventDate || "9999-12-31").getTime();
      return dateA - dateB;
    });

    // 3. Push to eventsToRender
    eventsToRender.push(...unsortedEvents);
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

    eventsToRender.forEach((evObj) => {
      // Event Name / Title height (approx 10.5)
      if (simY + 10.5 > 275) {
        simY = 52;
        simPageCount++;
      }
      simY += 10.5;

      // Customer details card height (26)
      if (simY + 26 > 275) {
        simY = 52;
        simPageCount++;
      }
      simY += 26 + cfg.secSpacing;

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

    // 2. CUSTOMER DETAILS CARD
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
      { label: 'Guest Pax', val: evObj.guestPax || 'N/A' }
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

  const savedFinalAmt = getSavedFinalAmount();
  const baseSumValRaw = baseServices.reduce((sum, s) => sum + (Number(s.qty) * Number(s.price)), 0);
  const addlSumVal = additionalServices.reduce((sum, s) => sum + (Number(s.qty) * Number(s.price)), 0);

  // Use the saved Final Quotation Amount from Section 2 if available, otherwise calculate
  const finalAmountSum = savedFinalAmt !== null ? savedFinalAmt : Math.max(0, baseSumValRaw + addlSumVal - discountValue);

  // Ensure baseSumVal matches when displayed if baseSumValRaw was 0
  const baseSumVal = (baseSumValRaw > 0) 
    ? baseSumValRaw 
    : Math.max(0, finalAmountSum + discountValue - addlSumVal);

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
  doc.text('- ' + discountValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 191, currentY + (pricingRowH * 2) - 2, { align: 'right' });

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

  // NOTE: Add Customer Support note where the user's red annotation is shown
  const customerSupportMobile = '8618865134';
  if (customerSupportMobile) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(239, 68, 68); // Red color for visibility as requested
    doc.text(`Customer Support: +91 ${customerSupportMobile}`, 15, currentY);
    currentY += 6;
  }

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


const highlightText = (text: string, search: string) => {
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

interface SalesModuleProps {
  activeSubTab?: 'list' | 'create' | 'profiles' | 'packages' | 'calendar';
  setActiveSubTab?: (tab: 'list' | 'create' | 'profiles' | 'packages' | 'calendar') => void;
}

export const SalesModule: React.FC<SalesModuleProps> = ({ activeSubTab: externalActiveTab, setActiveSubTab: externalSetActiveTab }) => {
  const { 
    currentUser,
    currentUserName,
    currentRole, 
    leads: allLeads, 
    leadPackages, 
    orders: allOrders, 
    payments: allPayments, 
    production, 
    addLead, 
    updateLeadFollowUp, 
    confirmOrder,
    packages,
    addPackage,
    updatePackage,
    deletePackage,
    quotations: allQuotations,
    addQuotation,
    updateQuotation,
    updateLead,
    saveLeadPackages,
    unlockedRecords,
    unlockRecord,
    lockRecord,
    isRecordLocked,
    isDepartmentAllowedToEdit,
    deleteLead,
    deleteOrder,
    statusHistory,
    getLeadCurrentStatus,
    getLeadCurrentStage,
    addNotification,
    users,
    staff,
    refreshData,
    paymentHistory
  } = useRole();

  // Logged-in Sales Person name computation
  const salesPersonName = useMemo(() => {
    if (currentUser?.name) return currentUser.name;
    if ((currentUser as any)?.full_name) return (currentUser as any).full_name;
    if (currentUserName && currentUserName !== 'Sales Team') return currentUserName;

    const userMatch = (users || []).find((u: any) =>
      (currentUser?.id && (u.id === currentUser.id || (u as any).auth_user_id === currentUser.id)) ||
      (currentUser?.email && u.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (currentUser?.mobile && u.mobile && u.mobile === currentUser.mobile)
    );
    if (userMatch?.name) return userMatch.name;
    if (userMatch?.full_name) return userMatch.full_name;

    const staffMatch = (staff || []).find((s: any) =>
      (currentUser?.id && s.staff_id === currentUser.id) ||
      (currentUser?.email && s.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (currentUser?.mobile && s.mobile && s.mobile === currentUser.mobile)
    );
    if (staffMatch?.name) return staffMatch.name;

    return currentUser?.name || currentUserName || 'Sales Team';
  }, [currentUser, currentUserName, users, staff]);

  // Logged-in Sales Person mobile computation
  const loggedInSalesMobile = useMemo(() => {
    if (currentUser?.mobile) return currentUser.mobile;
    if ((currentUser as any)?.phone) return (currentUser as any).phone;

    const staffMatch = (staff || []).find((s: any) =>
      (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) ||
      (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (s.name && currentUser?.name && s.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
    );
    if (staffMatch?.mobile) return staffMatch.mobile;

    const userMatch = (users || []).find((u: any) =>
      (u.mobile && currentUser?.mobile && u.mobile === currentUser.mobile) ||
      (u.email && currentUser?.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (u.name && currentUser?.name && u.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
    );
    if (userMatch?.mobile) return userMatch.mobile;
    if ((userMatch as any)?.phone) return (userMatch as any).phone;

    if (salesPersonName && salesPersonName !== 'Sales Team') {
      const matchByName = (users || []).find((u: any) => 
        (u.name && u.name.trim().toLowerCase() === salesPersonName.trim().toLowerCase()) ||
        (u.full_name && u.full_name.trim().toLowerCase() === salesPersonName.trim().toLowerCase())
      );
      if (matchByName?.mobile) return matchByName.mobile;
      if ((matchByName as any)?.phone) return (matchByName as any).phone;

      const staffByName = (staff || []).find((s: any) => 
        s.name && s.name.trim().toLowerCase() === salesPersonName.trim().toLowerCase()
      );
      if (staffByName?.mobile) return staffByName.mobile;
    }

    return '';
  }, [currentUser, staff, users, salesPersonName]);

  const leads = currentRole === 'Sales Team' 
    ? allLeads.filter(l => l.sales_staff_id === currentUser?.id || l.sales_person === currentUser?.name) 
    : allLeads;
  const orders = currentRole === 'Sales Team' 
    ? allOrders.filter(o => leads.some(l => l.lead_id === o.lead_id)) 
    : allOrders;
  const payments = currentRole === 'Sales Team' 
    ? allPayments.filter(p => leads.some(l => l.lead_id === p.lead_id)) 
    : allPayments;
  const quotations = currentRole === 'Sales Team' 
    ? (allQuotations || []).filter((q: any) => leads.some(l => l.lead_id === q.lead_id)) 
    : (allQuotations || []);

  const [logoBase64, setLogoBase64] = useState<string>('');
  const [logoAspectRatio, setLogoAspectRatio] = useState<number>(1);
  const [unlockRequests, setUnlockRequests] = useState<any[]>([]);

  // Fetch unlock requests
  useEffect(() => {
    if (!supabaseClient) return;

    const fetchUnlockRequests = async () => {
      const { data, error } = await supabaseClient
        .from('unlock_requests')
        .select('*');
      
      if (!error && data) {
        const normalized = data.map((r: any) => {
          const isApproved = r.request_status === 'Approved' || r.status === 'Approved';
          const isCompleted = r.request_status === 'Completed' || r.status === 'Completed';
          const isRejected = r.request_status === 'Rejected' || r.status === 'Rejected';
          const effectiveStatus = isApproved ? 'Approved' : isCompleted ? 'Completed' : isRejected ? 'Rejected' : (r.request_status || r.status || 'Pending');
          return {
            ...r,
            request_status: effectiveStatus,
            status: effectiveStatus,
            reason: r.request_reason || r.reason || '',
            sales_staff_name: r.requested_by_name || r.sales_staff_name || '',
            sales_staff_id: r.requested_by_user_id || r.sales_staff_id || ''
          };
        });
        setUnlockRequests(normalized);
      }
    };

    fetchUnlockRequests();

    const channel = supabaseClient
      .channel('rt-unlock_requests-sales')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unlock_requests' }, () => {
        fetchUnlockRequests();
      })
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, []);

  // Dynamic active master roles and deliverables loaded from Supabase master tables
  const [activeMasterRoles, setActiveMasterRoles] = useState<string[]>([]);
  const [activeMasterDeliverables, setActiveMasterDeliverables] = useState<string[]>([]);

  const loadActiveMasterItems = React.useCallback(async () => {
    try {
      let rList: string[] = [];
      let dList: string[] = [];

      if (supabaseClient) {
        const { data: rData } = await supabaseClient
          .from('custom_roles')
          .select('role_name')
          .eq('status', 'Active');
        if (rData && rData.length > 0) {
          rList = rData.map((r: any) => r.role_name);
        }

        const { data: dData } = await supabaseClient
          .from('custom_deliverables')
          .select('deliverable_name')
          .eq('status', 'Active');
        if (dData && dData.length > 0) {
          dList = dData.map((d: any) => d.deliverable_name);
        }
      }

      if (rList.length === 0) {
        const saved = localStorage.getItem('erp_custom_roles_data');
        if (saved) {
          const parsed = JSON.parse(saved);
          rList = parsed.filter((r: any) => r.status === 'Active').map((r: any) => r.role_name);
        }
      }

      if (dList.length === 0) {
        const saved = localStorage.getItem('erp_custom_deliverables_data');
        if (saved) {
          const parsed = JSON.parse(saved);
          dList = parsed.filter((d: any) => d.status === 'Active').map((d: any) => d.deliverable_name);
        }
      }

      if (rList.length > 0) setActiveMasterRoles(rList);
      if (dList.length > 0) setActiveMasterDeliverables(dList);
    } catch (err) {
      console.warn("Error fetching active custom master items in SalesModule:", err);
    }
  }, []);

  React.useEffect(() => {
    loadActiveMasterItems();
  }, [loadActiveMasterItems]);

  React.useEffect(() => {
    const preloadLogo = async () => {
      try {
        const logoUrl = 'https://aqifyxsimhqayfjwzzwj.supabase.co/storage/v1/object/public/img/logo%20(4)%20(1).png';
        const result = await getLogoBase64FromUrl(logoUrl);
        setLogoBase64(result.base64);
        setLogoAspectRatio(result.aspect);
      } catch (e) {
        console.warn('Failed to pre-load logo image:', e);
      }
    };
    preloadLogo();
  }, []);

  // Role permissions gate
  const canEdit = (currentRole === 'Sales Team' || currentRole === 'Business Owner') && 
                  (isDepartmentAllowedToEdit(currentRole, 'Quote Sent') || isDepartmentAllowedToEdit(currentRole, 'New Lead'));

  // Toggle modes
  const [internalTab, setInternalTab] = useState<'list' | 'create' | 'profiles' | 'packages' | 'calendar'>('list');
  const activeTab = externalActiveTab || internalTab;
  const setActiveTab = externalSetActiveTab || setInternalTab;

  // Leads export report handlers
  const handleDownloadCSV = () => {
    const headers = ["Lead ID", "Order ID", "Customer Name", "Mobile Number", "Event Type", "Event Date", "Current Stage", "Current Status", "Payment Status", "Created Date"];
    const rows = filteredLeads.map(l => {
      const ord = orders.find(o => o.lead_id === l.lead_id);
      const pay = ord ? payments?.find(p => p.order_id === ord.order_id) : null;
      return [
        l.lead_id,
        ord?.order_id || 'N/A',
        l.customer_name === 'Inbound Prospect' ? '' : l.customer_name,
        l.mobile,
        l.event_type,
        l.event_date ? (formatDateDDMMYY(l.event_date) || l.event_date) : 'N/A',
        getLeadCurrentStatus(l),
        l.remarks.slice(0, 50).replace(/["\n\r]/g, ' '),
        pay ? pay.payment_status : 'Pending',
        l.created_date ? (formatDateDDMMYY(l.created_date) || l.created_date) : 'N/A'
      ];
    });
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Leads_Report_${appliedStartDate || 'all'}_to_${appliedEndDate || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadExcel = () => {
    const headers = ["Lead ID", "Order ID", "Customer Name", "Mobile Number", "Event Type", "Event Date", "Current Stage", "Current Status", "Payment Status", "Created Date"];
    const rows = filteredLeads.map(l => {
      const ord = orders.find(o => o.lead_id === l.lead_id);
      const pay = ord ? payments?.find(p => p.order_id === ord.order_id) : null;
      return [
        l.lead_id,
        ord?.order_id || 'N/A',
        l.customer_name === 'Inbound Prospect' ? '' : l.customer_name,
        l.mobile,
        l.event_type,
        l.event_date ? (formatDateDDMMYY(l.event_date) || l.event_date) : 'N/A',
        getLeadCurrentStatus(l),
        l.remarks.slice(0, 50).replace(/["\t\n\r]/g, ' '),
        pay ? pay.payment_status : 'Pending',
        l.created_date ? (formatDateDDMMYY(l.created_date) || l.created_date) : 'N/A'
      ];
    });
    
    // Generate standard TSV structure compatible with native Excel import
    const content = [headers.join("\t"), ...rows.map(e => e.join("\t"))].join("\n");
    const blob = new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Leads_Report_${appliedStartDate || 'all'}_to_${appliedEndDate || 'all'}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const rowsHtml = filteredLeads.map(l => {
      const ord = orders.find(o => o.lead_id === l.lead_id);
      const pay = ord ? payments?.find(p => p.order_id === ord.order_id) : null;
      return `
        <tr>
          <td>${l.lead_id}</td>
          <td>${ord?.order_id || 'N/A'}</td>
          <td>${l.customer_name === 'Inbound Prospect' ? '' : l.customer_name}</td>
          <td>${l.mobile}</td>
          <td>${l.event_type}</td>
          <td>${l.event_date ? (formatDateDDMMYY(l.event_date) || l.event_date) : 'N/A'}</td>
          <td>${getLeadCurrentStatus(l)}</td>
          <td>${l.created_date ? (formatDateDDMMYY(l.created_date) || l.created_date) : 'N/A'}</td>
          <td>${pay ? pay.payment_status : 'Pending'}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Leads Directory Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #333; }
            h1 { font-size: 20px; margin-bottom: 5px; color: #111; text-transform: uppercase; letter-spacing: 1px; }
            p { font-size: 11px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            .footer { margin-top: 30px; font-size: 10px; color: #999; text-align: right; border-top: 1px solid #eee; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>LEADS DIRECTORY REPORT</h1>
          <p>Generated on ${formatDateDDMMYY(new Date())} | Date Range: ${appliedStartDate || 'All'} to ${appliedEndDate || 'All'} | Records Count: ${filteredLeads.length}</p>
          <div className="overflow-x-auto w-full max-w-full">
<table>
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Order ID</th>
                <th>Customer Name</th>
                <th>Mobile Number</th>
                <th>Event Type</th>
                <th>Event Date</th>
                <th>Current Status</th>
                <th>Created Date</th>
                <th>Payment Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
</div>
          <div class="footer">Confidential Systems Report | ERP Sales Desk</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // Package Management States
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [deletingPackageId, setDeletingPackageId] = useState<string | null>(null);
  const [isDeletingPackage, setIsDeletingPackage] = useState(false);
  const [deletePackageError, setDeletePackageError] = useState<string | null>(null);
  const [packageSuccessMsg, setPackageSuccessMsg] = useState<string | null>(null);
  const [editingPackage, setEditingPackage] = useState<any | null>(null);
  const [viewingPkgDetails, setViewingPkgDetails] = useState<any | null>(null);
  const [catSearchQuery, setCatSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [pkgForm, setPkgForm] = useState({
    package_name: '',
    category: 'Weddings',
    price: 0,
    status: 'Active' as 'Active' | 'Inactive',
    deliverables: '',
    team_members: '',
    seasonal_offer: '',
    terms_conditions: '',
    event_type: '',
    duration: '',
    package_includes: ''
  });
  const [pkgTeamMembers, setPkgTeamMembers] = useState<{qty: number, name: string}[]>([{ qty: 1, name: '' }]);
  const [pkgDeliverablesList, setPkgDeliverablesList] = useState<{qty: number, name: string}[]>([]);
  const [pkgDeliverableInput, setPkgDeliverableInput] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [isComparingPkgs, setIsComparingPkgs] = useState(false);
  const [dbCategoryError, setDbCategoryError] = useState<string | null>(null);

  React.useEffect(() => {
    const checkCategoryColumn = async () => {
      if (!supabaseClient) return;
      try {
        const { error } = await supabaseClient.from('packages').select('category').limit(0);
        if (error && (error.code === '42703' || error.message?.toLowerCase().includes('column') || error.message?.toLowerCase().includes('does not exist'))) {
          setDbCategoryError(
            `❌ Database Schema Alert: The 'category' column is missing from the 'packages' table in Supabase. Although the app is safely resolving categories using automated description serialization, categories are not stored as a dedicated column at the database level.`
          );
        }
      } catch (e) {
        console.warn('Failed to check category column:', e);
      }
    };
    checkCategoryColumn();
  }, [packages]);

  React.useEffect(() => {
    const handleClose = () => {
      setIsAddFormOpen(false);
      setEditingPackage(null);
      setViewingPkgDetails(null);
      setShowStep2Popup(false);
      setShowLostModal(false);
      setShowEventForm(false);
      setShowConfirmModal(false);
      setShowFinalReportingModal(false);
      setShowStep3Popup(false);
    };
    window.addEventListener('close-all-popups', handleClose);
    return () => window.removeEventListener('close-all-popups', handleClose);
  }, []);

  // Group active packages directly loaded from Supabase!
  const [customCategoryUpdateCounter, setCustomCategoryUpdateCounter] = useState(0);

  useEffect(() => {
    const handleCategoryUpdate = () => {
      setCustomCategoryUpdateCounter(prev => prev + 1);
    };
    window.addEventListener('custom-category-updated', handleCategoryUpdate);
    window.addEventListener('package-saved', handleCategoryUpdate);
    return () => {
      window.removeEventListener('custom-category-updated', handleCategoryUpdate);
      window.removeEventListener('package-saved', handleCategoryUpdate);
    };
  }, []);

  const categoriesList = React.useMemo(() => {
    const dbCats = Array.from(new Set((packages || []).map((p) => p.category))).filter(Boolean) as string[];
    const storedCats = getStoredCustomCategories();
    const allDbCats = Array.from(new Set([...dbCats, ...storedCats]));

    const normalizedDbCats = allDbCats.map(normalizeCategory);
    const normalizedPkgCats = PACKAGE_CATEGORIES.map(normalizeCategory);
    const customCats = normalizedDbCats.filter(c => !normalizedPkgCats.some(pc => pc.toLowerCase() === c.toLowerCase())).sort();
    return Array.from(new Set([...normalizedPkgCats, ...customCats]));
  }, [packages, customCategoryUpdateCounter]);

  // Synchronized Event Types: base types + any custom package categories + 'Other'
  const synchronizedEventTypes = React.useMemo(() => {
    const baseEventTypes = EVENT_TYPES.filter(t => t !== 'Other');
    const seenLower = new Set(baseEventTypes.map(t => t.toLowerCase()));

    const candidates: string[] = [];

    if (Array.isArray(categoriesList)) {
      categoriesList.forEach(c => {
        if (c && c !== 'CUSTOM_CATEGORY') candidates.push(c);
      });
    }

    (packages || []).forEach(p => {
      if (p.category && p.category !== 'CUSTOM_CATEGORY') candidates.push(p.category);
      if (p.event_type && p.event_type !== 'CUSTOM_CATEGORY') candidates.push(p.event_type);
    });

    getStoredCustomCategories().forEach(c => candidates.push(c));

    (leads || []).forEach(l => {
      if (l.event_type && l.event_type !== 'Other') candidates.push(l.event_type);
      if (Array.isArray(l.events)) {
        l.events.forEach((ev: any) => {
          if (ev.event_type && ev.event_type !== 'Other') candidates.push(ev.event_type);
        });
      }
    });

    const uniqueCustomTypes: string[] = [];
    candidates.forEach(cand => {
      const trimmed = (cand || '').trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (lower === 'other' || lower === 'custom_category') return;
      if (!seenLower.has(lower)) {
        seenLower.add(lower);
        uniqueCustomTypes.push(trimmed);
      }
    });

    uniqueCustomTypes.sort((a, b) => a.localeCompare(b));

    return [...baseEventTypes, ...uniqueCustomTypes, 'Other'];
  }, [packages, categoriesList, leads, customCategoryUpdateCounter]);

  const PACKAGES_LIST = React.useMemo(() => {
    return categoriesList.map((cat) => ({
      categoryName: cat,
      items: (packages || [])
        .filter((p) => normalizeCategory(p.category) === cat && p.status === 'Active')
        .map((p) => ({
          id: p.package_id,
          name: p.package_name,
          cost: p.price,
          deliverables: p.deliverables || 'N/A',
          team_members: p.team_members || 'N/A',
          seasonal_offer: p.seasonal_offer || 'None'
        }))
    }));
  }, [categoriesList, packages]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [createEvents, setCreateEvents] = useState<LeadEvent[]>([]);
  const [crmEvents, setCrmEvents] = useState<LeadEvent[]>([]);
  const [crmWizardStep, setCrmWizardStep] = useState<number>(1);
  const [crmHighestStep, setCrmHighestStep] = useState<number>(1);
  const [saveErrorPopup, setSaveErrorPopup] = useState<{ title: string; message: string } | null>(null);

  const appendCompletedStep = (existingRemarks: string | undefined, step: number) => {
    const cleanRemarks = (existingRemarks || '').replace(/\[CRM_COMPLETED_STEP:\s*\d+\]/g, '').trim();
    return `${cleanRemarks}\n[CRM_COMPLETED_STEP: ${step}]`.trim();
  };

  const [wizardLeadData, setWizardLeadData] = useState({
    customer_name: '',
    mobile: '',
    whatsapp_number: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    Specify_Custom_Lead_Source_Name: '',
    client_residence_address: '',
    desired_event_shoot_type: '',
    // Step 2
    event_type: '',
    custom_event_name: '',
    event_name: '',
    event_shoot_type: '',
    event_date: '',
    event_start_date: '',
    event_end_date: '',
    event_time: '',
    reporting_time: '',
    event_location: '',
    guest_pax: "" as any,
    staff_pax: "" as any,
    lead_source: '',
    shoot_type: '',
    // Step 3
    selected_package_id: '',
    package_cost: 0,
    deliverables: '',
    notes: '',
    // Step 4
    budget: 0,
    final_quoted_amount: 0,
    remarks: '',
    next_follow_up_date: '',
      // Step 5
    status: '' as CurrentStage,
    // Order Confirmed Rule fields
    confirmed_event_date: '',
    confirmed_event_time: '',
    final_amount: 0,
    advance_received: 0,
    package_price: 0,
    deliverables_description: '',
    notes_special_customizations: '',
    quotation_discount: 0,
    additional_services_cost: 0,
    total_pax: 0,
    reference_source: '',
    lead_value: 0,
    lead_score: 0,
    booking_status: 'Pending',
  });

  const [crmToast, setCrmToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showValidationError = (fieldId: string, msg: string) => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.classList.add('!border-red-500', 'ring-1', '!ring-red-500');
      let msgEl = el.nextElementSibling as HTMLElement;
      if (!msgEl || !msgEl.classList.contains('validation-error-msg')) {
        msgEl = document.createElement('div');
        msgEl.className = 'validation-error-msg text-red-550 text-[10px] mt-1 font-bold animate-fade-in';
        el.parentNode?.insertBefore(msgEl, el.nextSibling);
      }
      msgEl.textContent = msg;
      
      const removeHighlight = () => {
        el.classList.remove('!border-red-500', 'ring-1', '!ring-red-500');
        if (msgEl && msgEl.parentNode) msgEl.parentNode.removeChild(msgEl);
        el.removeEventListener('input', removeHighlight);
        el.removeEventListener('change', removeHighlight);
      };
      el.addEventListener('input', removeHighlight);
      el.addEventListener('change', removeHighlight);
    } else {
      showToastMsg(msg, "error");
    }
  };

  const showToastMsg = (message: string, type: 'success' | 'error' = 'success') => {
    setCrmToast({ message, type });
    setTimeout(() => setCrmToast(null), 3000);
  };

  React.useEffect(() => {
    if (crmToast) {
      const timer = setTimeout(() => {
        const el = document.getElementById('crm-toast-container') || document.getElementById('crm-create-toast-container');
        if (el) {
          const rect = el.getBoundingClientRect();
          const isInViewport = (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
          );
          if (!isInViewport) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [crmToast]);

  const logStatusUpdateError = (params: {
    leadId: string | null;
    orderId: string | null;
    oldStatus: string | null;
    newStatus: string | null;
    updatePayload: any;
    insertPayload: any;
    dbResponse: any;
    fullError: any;
  }) => {
    console.group("%c CRM STATUS UPDATE ERROR LOG ", "background: #f43f5e; color: white; font-weight: bold; padding: 4px;");
    console.log("Lead ID:", params.leadId);
    console.log("Order ID:", params.orderId);
    console.log("Old Status:", params.oldStatus);
    console.log("New Status:", params.newStatus);
    console.log("Supabase UPDATE payload:", params.updatePayload);
    console.log("Supabase INSERT payload:", params.insertPayload);
    console.log("Database response:", params.dbResponse);
    console.log("Full error message:", params.fullError);
    console.groupEnd();
  };

  const parseStatusUpdateError = (errorMsg: string): { reason: string; suggestedFix: string } => {
    const msg = errorMsg.toLowerCase();
    
    let reason = errorMsg;
    let suggestedFix = "Please contact support or review the database connections and tables.";

    if (msg.includes("relation \"leads\" does not exist") || msg.includes("table name: leads\nmissing")) {
      reason = "Table 'leads' does not exist in the database schema.";
      suggestedFix = "Please ensure the 'leads' table is created in your Supabase database using the SQL editor.";
    } else if (msg.includes("relation \"lead_status_history\" does not exist") || msg.includes("relation \"public.lead_status_history\" does not exist")) {
      reason = "Table 'lead_status_history' does not exist in the database schema.";
      suggestedFix = "Create the 'lead_status_history' table in your Supabase database using: \n\nCREATE TABLE lead_status_history (\n  id SERIAL PRIMARY KEY,\n  lead_id TEXT,\n  order_id TEXT,\n  old_status TEXT,\n  new_status TEXT,\n  changed_by TEXT,\n  changed_by_role TEXT,\n  remarks TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);";
    } else if (msg.includes("column \"current_status\"") || msg.includes("column leads.current_status") || msg.includes("missing column name: current_status")) {
      reason = "Missing column \"current_status\" in table \"leads\".";
      suggestedFix = "Create the \"current_status\" column or update the database mapping using: \n\nALTER TABLE leads ADD COLUMN current_status TEXT;";
    } else if (msg.includes("column \"new_status\"") || msg.includes("column lead_status_history.new_status")) {
      reason = "Missing column \"new_status\" in table \"lead_status_history\".";
      suggestedFix = "Add the missing 'new_status' column to 'lead_status_history' table using: \n\nALTER TABLE lead_status_history ADD COLUMN new_status TEXT;";
    } else if (msg.includes("rls policy denied") || msg.includes("row-level security") || msg.includes("violates row-level security")) {
      reason = `RLS policy denied UPDATE on table "leads".`;
      suggestedFix = "Update the RLS policy to allow authenticated users to update lead records.";
    } else if (msg.includes("permission denied") || msg.includes("insufficient privilege")) {
      reason = `Permission denied by database. Details: ${errorMsg}`;
      suggestedFix = "Ensure the API client role has correct permissions (SELECT/INSERT/UPDATE) granted on the table.";
    } else if (msg.includes("not found") && msg.includes("leads")) {
      reason = `Lead ID invalid or lead record not found. Details: ${errorMsg}`;
      suggestedFix = "Verify that the Lead ID exists in the 'leads' table and has not been deleted.";
    } else if (msg.includes("lead_status_history insert failed because \"lead_id\" is null") || msg.includes("lead_id is null") || msg.includes("lead_id\" is null")) {
      reason = `"lead_status_history" insert failed because "lead_id" is NULL.`;
      suggestedFix = "Pass a valid \"lead_id\" before inserting the status history.";
    } else if (msg.includes("foreign key constraint")) {
      reason = `Foreign key constraint failed. Details: ${errorMsg}`;
      suggestedFix = "Check if the referenced records (e.g. lead_id, order_id) exist in their parent tables first.";
    } else if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
      reason = `Unique constraint violation. Details: ${errorMsg}`;
      suggestedFix = "Ensure that the record ID being inserted is unique and does not already exist.";
    } else if (msg.includes("network error") || msg.includes("failed to fetch") || msg.includes("database connection failed")) {
      reason = `Network error or failed to reach the database connection.`;
      suggestedFix = "Please check your internet connection or verify if your server/Supabase instances are active.";
    } else if (msg.includes("required field") || msg.includes("null value in column")) {
      reason = `Required database field is missing. Details: ${errorMsg}`;
      suggestedFix = "Ensure all required fields are filled and not null before submitting.";
    } else {
      const tableMatch = errorMsg.match(/table "([^"]+)"|relation "([^"]+)"/);
      const colMatch = errorMsg.match(/column "([^"]+)"/);
      if (tableMatch || colMatch) {
        const tableName = tableMatch ? (tableMatch[1] || tableMatch[2]) : "unknown table";
        const colName = colMatch ? colMatch[1] : "";
        reason = `Database operation failed on table "${tableName}"` + (colName ? ` for column "${colName}".` : ".");
        suggestedFix = `Verify the schema of "${tableName}" table. If "${colName}" column is missing, add it using ALTER TABLE ${tableName} ADD COLUMN ${colName} TEXT;`;
      }
    }

    return { reason, suggestedFix };
  };


  const [statusError, setStatusError] = useState<{ title: string; reason: string; suggestedFix: string } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteModalLeadId, setNoteModalLeadId] = useState("");
  const [noteModalOrderId, setNoteModalOrderId] = useState("");
  const [noteModalCustomerName, setNoteModalCustomerName] = useState("");

  const [unlockingRecordId, setUnlockingRecordId] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState('Data Correction');
  const [unlockCustomReason, setUnlockCustomReason] = useState('');

  // Step 2 and Step 3 Follow-up states
  const [showStep2Popup, setShowStep2Popup] = useState(false);
  const [step2FollowUpDate, setStep2FollowUpDate] = useState('');
  const [step2FollowUpNotes, setStep2FollowUpNotes] = useState('');

  const [step3FollowUpDate, setStep3FollowUpDate] = useState('');
  const [step3FollowUpTime, setStep3FollowUpTime] = useState('');
  const [step3FollowUpNotes, setStep3FollowUpNotes] = useState('');

  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('Price too high');
  const [lostNotes, setLostNotes] = useState('');
  const [otherLostReason, setOtherLostReason] = useState('');
  
  // Unlock Request State
  const [showUnlockRequestModal, setShowUnlockRequestModal] = useState(false);
  const [unlockRequestReason, setUnlockRequestReason] = useState('Customer requested additional discount');
  const [unlockRequestCustomReason, setUnlockRequestCustomReason] = useState('');
  const [selectedUnlockLead, setSelectedUnlockLead] = useState<Lead | null>(null);

  // Helper function to resolve Lost Reason and Notes strictly and cleanly from fields
  const getStrictLostReasonAndNotes = (lead: Lead | null) => {
    if (!lead) return { reason: '', notes: '' };

    let rawReason = (lead.Lost_Reason || (lead as any).lost_reason || (lead as any).LostReason || (lead as any).lostReason || '').trim();
    let rawNotes = (lead.Lost_Notes || (lead as any).lost_notes || (lead as any).LostNotes || (lead as any).lostNotes || '').trim();

    // Clean any prefix like "Lost Reason:" or "Notes:" if user/system stored with label
    if (rawReason.toLowerCase().startsWith('lost reason:')) {
      rawReason = rawReason.replace(/^lost reason:\s*/i, '').trim();
    }
    if (rawNotes.toLowerCase().startsWith('lost notes:')) {
      rawNotes = rawNotes.replace(/^lost notes:\s*/i, '').trim();
    } else if (rawNotes.toLowerCase().startsWith('notes:')) {
      rawNotes = rawNotes.replace(/^notes:\s*/i, '').trim();
    }

    let cleanReason = rawReason;
    let cleanNotes = rawNotes;

    // Only if reason or notes is missing, parse from remarks
    if ((!cleanReason || !cleanNotes) && lead.remarks) {
      const text = lead.remarks;

      // Pattern 1: "Lost Reason: <reason>. Notes: <notes>"
      const explicitMatch = text.match(/Lost Reason:\s*([^.\n]+?)(?:\.\s*Notes:\s*([\s\S]*?))?(?=\n\[Update|\n\[Time|\[CRM_COMPLETED_STEP|$)/i);
      if (explicitMatch) {
        if (!cleanReason && explicitMatch[1]) cleanReason = explicitMatch[1].trim();
        if (!cleanNotes && explicitMatch[2]) cleanNotes = explicitMatch[2].trim();
      }

      // Pattern 2: Inspect [Update ...] entries in reverse order (most recent update first)
      if (!cleanReason || !cleanNotes) {
        const updateRegex = /\[Update[^\]]*\]:\s*([^\n]+)/gi;
        const matches = Array.from(text.matchAll(updateRegex));
        for (let i = matches.length - 1; i >= 0; i--) {
          const updateLine = matches[i][1];
          // Skip automated status updates or time tags that aren't lost lead details
          if (/^\[Time:|^Auto updated:/i.test(updateLine.trim())) continue;

          // Parse "<reason>. Neg Notes: <notes>. Next follow-up:"
          const parts = updateLine.match(/^([^.]+?)(?:\.\s*(?:Neg Notes|Notes):\s*([\s\S]*?))?(?:\.\s*Next follow-up:.*|$)/i);
          if (parts) {
            if (!cleanReason && parts[1]) cleanReason = parts[1].trim();
            if (!cleanNotes && parts[2]) cleanNotes = parts[2].trim();
            if (cleanReason) break;
          }
        }
      }
    }

    // Clean up trailing artifacts without destroying custom user notes
    if (cleanReason) {
      cleanReason = cleanReason
        .replace(/^WhatsApp:\s*\d+\s*/i, '')
        .replace(/^\[Update[^\]]*\]:\s*/i, '')
        .replace(/\.?\s*Neg Notes:.*$/i, '')
        .replace(/\.?\s*Next follow-up:.*$/i, '')
        .replace(/[,;]+$/, '')
        .trim();
    }

    if (cleanNotes) {
      cleanNotes = cleanNotes
        .replace(/\.?\s*Next follow-up:.*$/i, '')
        .replace(/[,;]+$/, '')
        .trim();
    }

    return {
      reason: cleanReason,
      notes: cleanNotes
    };
  };

  // Helper function to resolve Lost Reason and Notes
  const getLostReasonAndNotes = (lead: Lead | null, _historyList?: any[]) => {
    return getStrictLostReasonAndNotes(lead);
  };

  const [showCancelConfirmPopup, setShowCancelConfirmPopup] = useState(false);
  const [errorDetails, setErrorDetails] = useState<{
    title: string;
    reason: string;
    source?: string;
    failedFunction?: string;
    database?: string;
    leadId?: string;
    suggestedFix?: string;
    stack?: string;
  } | null>(null);

  const showErrorHelper = (title: string, reason: string, failedFunction: string, leadId: string, suggestedFix: string, err?: any) => {
    console.error(`❌ ${title}\nReason: ${reason}\nFunction: ${failedFunction}\n`, err);
    setErrorDetails({
      title,
      reason: err?.message || reason,
      source: 'SalesModule.tsx',
      failedFunction,
      database: 'quotations / leads',
      leadId,
      suggestedFix,
      stack: err?.stack || ''
    });
  };

  const isLeadConfirmed = selectedLead
    ? (['Confirm Order', 'Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed'].includes(selectedLead.status || '') ||
       (selectedLead as any).current_status === 'Order Confirmed' ||
       (selectedLead as any).booking_status === 'Confirmed' ||
       getLeadCurrentStatus(selectedLead) === 'Order Confirmed' ||
       ['Operations', 'Production', 'Post-Production', 'Completed'].includes(getLeadCurrentStage(selectedLead)) ||
       (orders && orders.some(o => o.lead_id === selectedLead.lead_id && o.status !== 'Cancelled')))
    : false;

  const isApprovedUnlocked = selectedLead
    ? (selectedLead.quotation_locked === false ||
       unlockRequests.some(r => {
         const matchesLead = r.lead_id === selectedLead.lead_id || r.order_id === selectedLead.lead_id || r.project_id === selectedLead.lead_id;
         const matchesOrder = orders && orders.some(o => o.lead_id === selectedLead.lead_id && (o.order_id === r.order_id || o.order_id === r.lead_id));
         const matchesLeadOrderId = (selectedLead as any).order_id && (r.order_id === (selectedLead as any).order_id || r.lead_id === (selectedLead as any).order_id);
         const isApproved = r.status === 'Approved' || r.request_status === 'Approved';
         return (matchesLead || matchesOrder || matchesLeadOrderId) && isApproved;
       })) && selectedLead.quotation_locked !== true
    : false;

  // Event completion CRM lock logic
  const leadEventsForLockCheck = (crmEvents && crmEvents.length > 0)
    ? crmEvents
    : ((selectedLead?.events && selectedLead.events.length > 0)
        ? selectedLead.events
        : (selectedLead?.event_date ? [selectedLead] : []));

  const isMultiEventLead = Boolean(leadEventsForLockCheck && leadEventsForLockCheck.length > 1);
  const isCrmLocked = Boolean(selectedLead && checkIsLeadCrmLocked(selectedLead, leadEventsForLockCheck));
  const isLeadLocked = isCrmLocked;
  const isLeadLost = Boolean(
    selectedLead && ['Lost Lead', 'Lead Lost', 'Lost'].includes(
      selectedLead.status || (selectedLead as any).current_status || wizardLeadData.status || ''
    )
  );

  const isStep1Locked = isCrmLocked;
  const isStep2Locked = isCrmLocked;
  const isStep3Locked = isCrmLocked;

  const [openDropdownLeadId, setOpenDropdownLeadId] = useState<string | null>(null);
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number | string, right: number | string, bottom: number | string }>({ top: 0, right: 0, bottom: 'auto' });

  React.useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.actions-dropdown-container') && !target.closest('.actions-dropdown-menu')) {
        setOpenDropdownLeadId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  // Repeat Customer / Reorder System states
  const [detectedCustomer, setDetectedCustomer] = useState<any>(null);
  const [showDetectionPopup, setShowDetectionPopup] = useState(false);
  const [isQuickReorderView, setIsQuickReorderView] = useState(false);
  
  // Custom states for configuring quick reorder
  const [reorderForm, setReorderForm] = useState({
    event_type: '',
    custom_event_name: '',
    custom_event_type: '',
    event_date: '',
    event_time: '12:00',
    event_location: '',
    package_name: '',
    quotation_amount: 0,
    advance_received: 0,
  });

  // Customer Profiles sub-tab states
  const [selectedCustomerProfileId, setSelectedCustomerProfileId] = useState<string | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Filter & Collapse States
  const [filterQuery, setFilterQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [isDownloadReportsExpanded, setIsDownloadReportsExpanded] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSalesPerson, setFilterSalesPerson] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  // Extra state for "Other" lead source name input
  const [otherSource, setOtherSource] = useState('');

  // Screen 2 Form State (Wizard support)
  const [createForm, setCreateForm] = useState<{
    customer_name: string;
    mobile: string;
    alternate_mobile: string;
    email: string;
    lead_source: string;
    event_type: string;
    custom_event_name: string;
    event_name: string;
    event_shoot_type: string;
    event_date: string;
    event_start_date: string;
    event_end_date: string;
    event_time: string;
    event_location: string;
    guest_pax: number | '';
    staff_pax: number | '';
    budget: number | '';
    remarks: string;
    whatsapp_number: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    client_residence_address: string;
    desired_event_shoot_type: string;
    Select_Package_Option: string;
    total_pax: number | '';
    reference_source: string;
    lead_value: number | '';
    lead_score: number | '';
    booking_status: string;
  }>({
    customer_name: '',
    mobile: '',
    alternate_mobile: '',
    email: '',
    lead_source: '',
    event_type: '',
    custom_event_name: '',
    event_name: '',
    event_shoot_type: '',
    event_date: '',
    event_start_date: '',
    event_end_date: '',
    event_time: '',
    event_location: '',
    guest_pax: "" as any,
    staff_pax: "" as any,
    budget: '',
    remarks: '',
    whatsapp_number: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    Specify_Custom_Lead_Source_Name: '',
    client_residence_address: '',
    desired_event_shoot_type: '',
    Select_Package_Option: '',
    total_pax: '',
    reference_source: '',
    lead_score: '',
    booking_status: '',
  });

  const [collapsedEventIds, setCollapsedEventIds] = useState<Record<string, boolean>>({});
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState<Omit<LeadEvent, 'id'>>({
    event_type: '',
    event_name: '',
    event_shoot_type: '',
    event_date: '',
    event_start_time: '',
    event_end_time: '',
    event_location: '',
    google_maps_link: '',
    guest_pax: "" as any,
    staff_pax: "" as any,
    event_start_date: '',
    event_end_date: ''
  });

  const [wizardStep, setWizardStep] = useState(1);
  const [createdLeadId, setCreatedLeadId] = useState<string | null>(null);

  // Package customizations
  const [pkgPrices, setPkgPrices] = useState<Record<string, number>>({});
  const [pkgDeliverables, setPkgDeliverables] = useState<Record<string, string>>({});
  const [pkgNotes, setPkgNotes] = useState<Record<string, string>>({});

  // Additional form fields for Steps 4 & 5
  const [reportingTime, setReportingTime] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [salesStatus, setSalesStatus] = useState<string>('');

  // Order Confirmed Additional mandatory fields
  const [confirmedEventDate, setConfirmedEventDate] = useState('');
  const [confirmedEventTime, setConfirmedEventTime] = useState('');
  const [finalPackageAmount, setFinalPackageAmount] = useState<number | ''>('');
  const [advanceReceived, setAdvanceReceived] = useState<number | ''>('');

  const resetForm = () => {
    setCreateForm({
      customer_name: '',
      mobile: '',
      alternate_mobile: '',
      email: '',
      lead_source: '',
      event_type: '',
      custom_event_name: '',
      event_name: '',
      event_shoot_type: '',
      event_date: '',
      event_start_date: '',
      event_end_date: '',
      event_time: '',
      event_location: '',
      guest_pax: "" as any,
      staff_pax: "" as any,
      budget: '',
      remarks: '',
      whatsapp_number: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
    Specify_Custom_Lead_Source_Name: '',
      client_residence_address: '',
      desired_event_shoot_type: '',
      Select_Package_Option: '',
      total_pax: '',
      reference_source: '',
      lead_value: '',
      lead_score: '',
      booking_status: '',
    });
    setCreateEvents([]);
    setWizardLeadData({
      customer_name: '',
      mobile: '',
      whatsapp_number: '',
      email: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
    Specify_Custom_Lead_Source_Name: '',
      client_residence_address: '',
      desired_event_shoot_type: '',
      event_type: '',
      custom_event_name: '',
      event_name: '',
      event_shoot_type: '',
      event_date: '',
      event_start_date: '',
      event_end_date: '',
      event_time: '',
      reporting_time: '',
      event_location: '',
      guest_pax: "" as any,
      staff_pax: "" as any,
      lead_source: '',
      shoot_type: '',
      selected_package_id: '',
      package_cost: 0,
      deliverables: '',
      notes: '',
      budget: 0,
      final_quoted_amount: 0,
      remarks: '',
      next_follow_up_date: '',
      status: '' as CurrentStage,
      confirmed_event_date: '',
      confirmed_event_time: '',
      final_amount: 0,
      advance_received: 0,
      package_price: 0,
      deliverables_description: '',
      notes_special_customizations: '',
      quotation_discount: 0,
      additional_services_cost: 0,
      total_pax: 0,
      reference_source: '',
      lead_value: 0,
      lead_score: 0,
      booking_status: 'Pending',
    });
    setOtherSource('');
    setSelectedPkgIds([]);
    setLeadDiscount('');
    setIsPkgDropdownOpen(false);
    
    // Reset wizard fields
    setWizardStep(1);
    setCrmWizardStep(1);
    setCreatedLeadId(null);
    setPkgPrices({});
    setPkgDeliverables({});
    setPkgNotes({});
    setReportingTime('');
    setInternalNotes('');
    setFollowUpDate('');
    setSalesStatus('');
    setConfirmedEventDate('');
    setConfirmedEventTime('');
    setFinalPackageAmount('');
    setAdvanceReceived('');
    setQuoteDiscount('');
    setQuoteAdditional('');
    
    setFollowUpForm({
      status: '',
      quotation_amount: '',
      advance_received: '',
      call_notes: ''
    });
    setConfirmForm({
      package_name: '',
      quotation_amount: '',
      advance_received: '',
      event_date: '',
      event_time: ''
    });
    setEventForm({
      event_type: '',
      event_name: '',
      event_shoot_type: '',
      event_date: '',
      event_start_time: '',
      event_end_time: '',
      event_location: '',
      google_maps_link: '',
      guest_pax: "" as any,
      staff_pax: "" as any,
      event_start_date: '',
      event_end_date: ''
    });
    setShowEventForm(false);
    setEditingEventId(null);
    setCollapsedEventIds({});
    setShowConfirmModal(false);
    setGeneratedPDFBlobUrl('');
    setActiveQuoteNum('');
    setEditableInclusions({});
    setEditableDeliverables({});
    setQuoteServices([]);
    setEditingServiceId(null);
    setNewServiceName('');
    setNewServiceQty(1);
    setNewServicePrice(0);
    setIsAddingInline(false);
    setStatusError(null);
    setUnlockingRecordId(null);
    setPkgSearchQuery('');

    // Clear cached quote services
    localStorage.removeItem('erp_quote_services_create');
  };

  // Action hook to reset state, auto-scroll and auto-focus when transitioning to 'create' tab
  React.useEffect(() => {
    if (activeTab === 'create') {
      resetForm();

      setTimeout(() => {
        const titleEl = document.getElementById('create_lead_form_heading');
        if (titleEl) {
          titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          const formEl = document.querySelector('form');
          if (formEl) {
            formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        const firstInput = document.querySelector('input[placeholder*="Enter customer name"]') as HTMLInputElement;
        if (firstInput) {
          firstInput.focus();
        }
      }, 150);
    }
  }, [activeTab]);

  // Packages creation hooks
  const [selectedPkgIds, setSelectedPkgIds] = useState<string[]>([]);
  const [leadDiscount, setLeadDiscount] = useState<number>(0);
  const [isPkgDropdownOpen, setIsPkgDropdownOpen] = useState(false);
  const [pkgSearchQuery, setPkgSearchQuery] = useState('');

  // Auto calculate and sync with createForm.budget
  const selectedPkgs = PACKAGES_LIST.flatMap(cat => cat.items).filter(item => selectedPkgIds.includes(item.id));
  
  // Package Selection Price is editable, so subtotal sums the edited prices
  const subtotal = selectedPkgs.reduce((sum, item) => sum + (pkgPrices[item.id] !== undefined ? pkgPrices[item.id] : item.cost), 0);
  const finalTotal = Math.max(0, subtotal - leadDiscount);

  // Sync package configurations on changes
  React.useEffect(() => {
    const allPkgs = PACKAGES_LIST.flatMap(cat => cat.items);
    const newPrices = { ...pkgPrices };
    const newDeliverables = { ...pkgDeliverables };
    const newNotes = { ...pkgNotes };
    let changed = false;

    selectedPkgIds.forEach(id => {
      const p = allPkgs.find(item => item.id === id);
      if (p) {
        if (newPrices[id] === undefined) {
          newPrices[id] = p.cost;
          changed = true;
        }
        if (newDeliverables[id] === undefined) {
          newDeliverables[id] = p.deliverables || 'N/A';
          changed = true;
        }
        if (newNotes[id] === undefined) {
          newNotes[id] = p.seasonal_offer !== 'None' ? `Offers: ${p.seasonal_offer}` : '';
          changed = true;
        }
      }
    });

    // Remove unselected package keys
    Object.keys(newPrices).forEach(id => {
      if (!selectedPkgIds.includes(id)) {
        delete newPrices[id];
        delete newDeliverables[id];
        delete newNotes[id];
        changed = true;
      }
    });

    if (changed) {
      setPkgPrices(newPrices);
      setPkgDeliverables(newDeliverables);
      setPkgNotes(newNotes);
    }
  }, [selectedPkgIds, PACKAGES_LIST]);

  React.useEffect(() => {
    // Only auto-override if packages are actively selected
    if (selectedPkgIds.length > 0) {
      setCreateForm(prev => ({
        ...prev,
        budget: finalTotal,
        Select_Package_Option: selectedPkgIds[0] || ''
      }));
    } else {
      setCreateForm(prev => ({
        ...prev,
        Select_Package_Option: ''
      }));
    }
  }, [finalTotal, selectedPkgIds]);

  // Body scroll lock effect when Create Lead modal is open (REMOVED to allow scrolling on smaller screens)
  React.useEffect(() => {
    // Body scroll lock removed to fix scrolling issues on smaller screens.
  }, [activeTab]);

  // Screen 3 Follow-Up Form State
  const [followUpForm, setFollowUpForm] = useState({
    call_notes: '',
    next_follow_up_date: '',
    status: 'Quote Follow-up' as CurrentStage,
    quotation_amount: 3500,
    negotiation_notes: '',
    event_date: '',
    event_time: '',
    reporting_time: '08:00',
    advance_received: 0,
    payment_mode: 'UPI',
    transaction_id: '',
  });

  // Confirm Order Form State & Auto-scroll Ref
  const confirmBookingModalRef = useRef<HTMLDivElement | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCustomerInfoExpanded, setIsCustomerInfoExpanded] = useState(true);

  // Manage scroll locking when Booking Confirmation modal is active
  useEffect(() => {
    if (showConfirmModal) {
      // Prevent background dashboard scrolling while modal is active
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [showConfirmModal]);
  const [confirmForm, setConfirmForm] = useState<{
    package_name: string;
    quotation_amount: number;
    advance_received: number | string;
    event_date: string;
    event_time: string;
    payment_mode: string;
    notes: string;
    transaction_id: string;
  }>({
    package_name: '',
    quotation_amount: 0,
    advance_received: 0,
    event_date: '',
    event_time: '',
    payment_mode: 'UPI',
    notes: '',
    transaction_id: '',
  });

  // Final Reporting Details State per event
  const [eventsReporting, setEventsReporting] = useState<Record<string, { reporting_date: string, reporting_time: string }>>({});

  const initEventsReporting = (lead: Lead | null | undefined) => {
    if (!lead) return;
    const initialMap: Record<string, { reporting_date: string, reporting_time: string }> = {};
    if (lead.events && Array.isArray(lead.events) && lead.events.length > 0) {
      lead.events.forEach((ev, idx) => {
        const key = ev.id || `ev_${idx}`;
        initialMap[key] = {
          reporting_date: ev.reporting_date || (ev as any).Reporting_date || ev.event_date || ev.event_start_date || lead.Reporting_date || (lead as any).reporting_date || lead.event_date || '',
          reporting_time: ev.reporting_time || lead.reporting_time || ''
        };
      });
    } else {
      initialMap['default'] = {
        reporting_date: lead.Reporting_date || (lead as any).reporting_date || lead.event_date || '',
        reporting_time: lead.reporting_time || ''
      };
    }
    setEventsReporting(initialMap);
  };

  const [showFinalReportingModal, setShowFinalReportingModal] = useState(false);
  const [finalReportingForm, setFinalReportingForm] = useState<Record<string, { reporting_date: string, reporting_time: string }>>({});

  const areReportingDetailsComplete = (lead: Lead | null | undefined): boolean => {
    if (!lead) return false;

    if (lead.events && Array.isArray(lead.events) && lead.events.length > 0) {
      return lead.events.every((ev) => {
        const rDate = ev.reporting_date || (ev as any).Reporting_date;
        const rTime = ev.reporting_time;
        return typeof rDate === 'string' && rDate.trim() !== '' && typeof rTime === 'string' && rTime.trim() !== '';
      });
    }

    const leadRDate = lead.Reporting_date || (lead as any).reporting_date;
    const leadRTime = lead.reporting_time;
    return typeof leadRDate === 'string' && leadRDate.trim() !== '' && typeof leadRTime === 'string' && leadRTime.trim() !== '';
  };

  const openReportingDetailsModal = (lead: Lead, customMsg?: string) => {
    setSelectedLead(lead);
    const crmEvents = lead.events || [];
    const initialFormState: Record<string, { reporting_date: string, reporting_time: string }> = {};

    if (crmEvents.length > 0) {
      crmEvents.forEach((ev) => {
        initialFormState[ev.id] = {
          reporting_date: ev.reporting_date || ev.event_date || lead.Reporting_date || lead.event_date || '',
          reporting_time: ev.reporting_time || lead.reporting_time || ''
        };
      });
    } else {
      initialFormState['default'] = {
        reporting_date: lead.Reporting_date || (lead as any).reporting_date || lead.event_date || '',
        reporting_time: lead.reporting_time || ''
      };
    }

    setFinalReportingForm(initialFormState);
    setShowFinalReportingModal(true);
    showToastMsg(customMsg || "Please complete and save the Reporting Details before confirming the order.", "error");
  };

  // Quotation System State
  const [quotationTerms, setQuotationTerms] = useState(
    "1. Payments are non-refundable.\n" +
    "2. Crew food arrangements from client side.\n" +
    "3. 50% advance payment before the event.\n" +
    "4. If duration exceeds 1 hour, additional charges of ₹1,500 per hour will be applicable.\n" +
    "5. 50% full payment on event day.\n" +
    "6. Pendrive and Hard Disk are not included.\n" +
    "7. Edited data will be shared via Google Drive link."
  );
  const [generatedPDFBlobUrl, setGeneratedPDFBlobUrl] = useState<string>('');
  const [activeQuoteNum, setActiveQuoteNum] = useState<string>('');
  const [showStep3Popup, setShowStep3Popup] = useState<boolean>(false);
  const [step3Option, setStep3Option] = useState<'negotiation' | 'quotation_send'>('negotiation');

  // Customizable inclusions, deliverables, discount, and additional charges states
  const [editableInclusions, setEditableInclusions] = useState<Record<string, string[]>>({});
  const [editableDeliverables, setEditableDeliverables] = useState<Record<string, string[]>>({});
  
  const [step3AutoSaveStatus, setStep3AutoSaveStatus] = useState<'saving' | 'saved' | 'error' | null>(null);

  const step3SaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveStep3DataRealtime = async (
    updatedInclusions: Record<string, string[]>,
    updatedDeliverables: Record<string, string[]>,
    activePkgId?: string,
    packageCostOverride?: number | null,
    discountOverride?: number | null,
    additionalOverride?: number | null
  ) => {
    if (isStep3Locked) return;
    const pkgId = activePkgId || wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || selectedPkgIds[0] || 'Custom Package';
    const leadId = selectedLead?.lead_id || createdLeadId;
    if (!leadId || leadId === 'DRAFT-LEAD' || !pkgId || !supabaseClient) return;

    setStep3AutoSaveStatus('saving');

    const activeEventsList = (activeTab === 'create' && createEvents.length > 0) ? createEvents : (crmEvents && crmEvents.length > 0 ? crmEvents : []);
    const { teamMembersJson, deliverablesJson, flatTeamMembers, teamMembersText, deliverablesText } = buildStep3EventPayloads(
      pkgId,
      activeEventsList,
      updatedInclusions,
      updatedDeliverables
    );

    const safeTeamMembersText = teamMembersText;
    const safeDeliverablesText = deliverablesText;

    console.log('TEAM MEMBERS SAVE', { leadId, teamMembers: flatTeamMembers, serialized: safeTeamMembersText });

    const cleanPkgCost = packageCostOverride !== undefined ? packageCostOverride : (
      wizardLeadData.package_cost !== "" && wizardLeadData.package_cost != null && !isNaN(Number(wizardLeadData.package_cost))
      ? Number(wizardLeadData.package_cost)
      : (wizardLeadData.package_price !== "" && wizardLeadData.package_price != null && !isNaN(Number(wizardLeadData.package_price))
        ? Number(wizardLeadData.package_price)
        : (wizardLeadData.budget ? Number(wizardLeadData.budget) : null))
    );

    const cleanDiscount = discountOverride !== undefined ? (discountOverride || 0) : (
      quoteDiscount === "" || quoteDiscount == null || isNaN(Number(quoteDiscount)) ? 0 : Number(quoteDiscount)
    );
    const cleanAdditional = additionalOverride !== undefined ? (additionalOverride || 0) : (
      quoteAdditional === "" || quoteAdditional == null || isNaN(Number(quoteAdditional)) ? 0 : Number(quoteAdditional)
    );
    const cleanFinalAmt = Math.max(0, (cleanPkgCost || 0) + cleanAdditional - cleanDiscount);

    const updatePayload: any = {
      Team_Members: safeTeamMembersText,
      Add_Deliverable: safeDeliverablesText,
      Select_Package_Option: pkgId,
      Quotation_Discount: cleanDiscount,
      Additional_Services_Cost: cleanAdditional,
      Final_Quotation_Amount: cleanFinalAmt,
      Final_Package_Amount: cleanFinalAmt,
      final_package_amount: cleanFinalAmt,
      _explicit_step3_save: true
    };

    if (cleanPkgCost !== null && cleanPkgCost !== undefined) {
      updatePayload.package_price = cleanPkgCost;
      updatePayload.budget = cleanPkgCost;
    }

    if (step3SaveTimeoutRef.current) {
      clearTimeout(step3SaveTimeoutRef.current);
    }

    step3SaveTimeoutRef.current = setTimeout(async () => {
      try {
        // Direct Supabase update to ensure public.leads.Team_Members and Final_Package_Amount are immediately saved
        // 1. Direct Supabase update to ensure public.leads has latest Package Base Price and Final Amounts
        const { error: dbError } = await supabaseClient
          .from('leads')
          .update({
            Team_Members: safeTeamMembersText,
            Add_Deliverable: safeDeliverablesText,
            Select_Package_Option: pkgId,
            Quotation_Discount: cleanDiscount,
            Additional_Services_Cost: cleanAdditional,
            Final_Quotation_Amount: cleanFinalAmt,
            Final_Package_Amount: cleanFinalAmt,
            final_package_amount: cleanFinalAmt,
            package_price: cleanPkgCost,
            budget: cleanPkgCost,
            updated_at: new Date().toISOString()
          })
          .eq('lead_id', leadId);

        if (dbError) {
          console.error("Direct Supabase update error on leads:", dbError);
          setStep3AutoSaveStatus('error');
          return;
        }

        // 2. Also save / update lead_packages record in Supabase
        try {
          const rawPackagePayload = {
            lead_id: leadId,
            package_id: pkgId,
            package_name: wizardLeadData.package_name || (pkgId === 'Custom Package' || pkgId === 'custom_package' ? 'Custom Package' : `Package ${pkgId}`),
            quantity: 1,
            package_cost: cleanPkgCost || 0,
            total_amount: cleanPkgCost || 0,
            discount: cleanDiscount || 0,
            additional_services_cost: cleanAdditional || 0,
            final_amount: cleanFinalAmt,
            Team_Members_Included: teamMembersJson,
            editable_inclusions: updatedInclusions,
            deliverables_descriptionn: deliverablesJson,
            deliverables_description: deliverablesText,
            editable_deliverables: updatedDeliverables,
            updated_at: new Date().toISOString()
          };

          const { payload: packagePayload, isValid, teamMembersValid, deliverablesValid, issues } = verifyAndFormatLeadPackagePayload(
            rawPackagePayload,
            'SalesModule saveStep3DataRealtime [Realtime Step 3 Auto-Save]'
          );

          const { data: existingLps, error: fetchLpErr } = await supabaseClient
            .from('lead_packages')
            .select('*')
            .eq('lead_id', leadId);

          if (fetchLpErr) {
            console.warn("[lead_packages realtime SalesModule] Error querying existing lead_packages:", fetchLpErr);
          }
          
          let targetLpId = `LP-${leadId}-${pkgId}`;
          
          if (existingLps && existingLps.length > 0) {
            const matched = existingLps.find(lp => String(lp.package_id) === String(pkgId)) || existingLps[0];
            targetLpId = matched.lead_package_id || matched.id || targetLpId;
            console.log(`🚀 [Supabase API Call] Realtime updating 'lead_packages' (ID: "${targetLpId}"):`, packagePayload);
            const { data: updateRes, error: updateErr } = await supabaseClient
              .from('lead_packages')
              .update(packagePayload)
              .eq(matched.lead_package_id ? 'lead_package_id' : 'id', targetLpId)
              .select('*');

            if (updateErr) {
              console.error(`❌ [Supabase API Error] Realtime error updating 'lead_packages':`, updateErr);
            } else {
              console.log(`✅ [Supabase API Success] Realtime updated 'lead_packages' record:`, updateRes);
            }
          } else {
            console.log(`🚀 [Supabase API Call] Realtime inserting 'lead_packages' (ID: "${targetLpId}"):`, packagePayload);
            const { data: insertRes, error: insertErr } = await supabaseClient
              .from('lead_packages')
              .insert({
                ...packagePayload,
                lead_package_id: targetLpId,
                created_at: new Date().toISOString()
              })
              .select('*');

            if (insertErr) {
              console.error(`❌ [Supabase API Error] Realtime error inserting 'lead_packages':`, insertErr);
            } else {
              console.log(`✅ [Supabase API Success] Realtime inserted 'lead_packages' record:`, insertRes);
            }
          }
        } catch (lpErr) {
          console.warn("Could not update lead_packages in saveStep3DataRealtime:", lpErr);
        }

        // 3. Synchronize quotations table in Supabase
        try {
          const { data: existingQuotes } = await supabaseClient
            .from('quotations')
            .select('quotation_id')
            .eq('lead_id', leadId);
          if (existingQuotes && existingQuotes.length > 0) {
            for (const q of existingQuotes) {
              await supabaseClient
                .from('quotations')
                .update({
                  package_price: cleanPkgCost,
                  quotation_amount: cleanFinalAmt,
                  final_amount: cleanFinalAmt,
                  discount_amount: cleanDiscount,
                  additional_services_cost: cleanAdditional,
                  updated_at: new Date().toISOString()
                })
                .eq('quotation_id', q.quotation_id);
            }
          }
        } catch (qErr) {
          console.warn("Could not sync quotations table:", qErr);
        }

        // 4. Synchronize orders and payments tables in Supabase for confirmed orders
        try {
          const { data: linkedOrders } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('lead_id', leadId);

          if (linkedOrders && linkedOrders.length > 0) {
            for (const ord of linkedOrders) {
              const adv = Number(ord.advance_received || 0);
              const newBalance = Math.max(0, cleanFinalAmt - adv);
              await supabaseClient
                .from('orders')
                .update({
                  package_price: cleanPkgCost,
                  quotation_amount: cleanFinalAmt,
                  final_amount: cleanFinalAmt,
                  quotation_discount: cleanDiscount,
                  additional_services_cost: cleanAdditional,
                  balance_amount: newBalance,
                  updated_at: new Date().toISOString()
                })
                .eq('order_id', ord.order_id);

              // 5. Synchronize payments table without altering historical payment records
              const { data: linkedPayments } = await supabaseClient
                .from('payments')
                .select('*')
                .eq('order_id', ord.order_id);

              if (linkedPayments && linkedPayments.length > 0) {
                for (const pay of linkedPayments) {
                  const actualPaid = (Number(pay.advance_received) || 0) + (Number(pay.final_payment_received) || 0) + (Number(pay.additional_received) || 0);
                  const newBalanceDue = Math.max(0, cleanFinalAmt - actualPaid);
                  const newStatus = (newBalanceDue <= 0 && cleanFinalAmt > 0) 
                    ? 'Fully Paid' 
                    : (actualPaid > 0 ? 'Partially Paid' : (pay.payment_status || 'Pending'));

                  await supabaseClient
                    .from('payments')
                    .update({
                      quotation_amount: cleanFinalAmt,
                      balance_due: newBalanceDue,
                      payment_status: newStatus,
                      updated_at: new Date().toISOString()
                    })
                    .eq('payment_id', pay.payment_id);
                }
              }
            }
          }
        } catch (ordErr) {
          console.warn("Could not sync orders/payments in saveStep3DataRealtime:", ordErr);
        }

        // 6. Database Source of Truth: Re-fetch and verify the actual saved record from Supabase
        const { data: verifiedLead, error: verifyErr } = await supabaseClient
          .from('leads')
          .select('*')
          .eq('lead_id', leadId)
          .single();

        if (verifyErr || !verifiedLead) {
          throw new Error(verifyErr?.message || "Failed to verify saved record from database.");
        }

        const verifiedPkgPrice = Number(verifiedLead.package_price ?? cleanPkgCost);
        const verifiedDiscount = Number(verifiedLead.Quotation_Discount ?? cleanDiscount);
        const verifiedAdditional = Number(verifiedLead.Additional_Services_Cost ?? cleanAdditional);
        const verifiedFinalAmt = Math.max(0, verifiedPkgPrice - verifiedDiscount + verifiedAdditional);

        // Update local context manually to ensure instant visual sync in modal
        if (selectedLead) {
          setSelectedLead(prev => {
            if (!prev) return null;
            return {
              ...prev,
              ...verifiedLead,
              Team_member: safeTeamMembersText,
              Team_Members: safeTeamMembersText,
              team_members: safeTeamMembersText,
              Add_Deliverable: safeDeliverablesText,
              deliverables_description: safeDeliverablesText,
              Select_Package_Option: pkgId,
              selected_package_id: pkgId,
              Quotation_Discount: verifiedDiscount,
              Additional_Services_Cost: verifiedAdditional,
              Final_Quotation_Amount: verifiedFinalAmt,
              Final_Package_Amount: verifiedFinalAmt,
              final_package_amount: verifiedFinalAmt,
              package_price: verifiedPkgPrice,
              budget: verifiedPkgPrice
            };
          });
        }
        
        // Also sync wizardLeadData deliverables and team members state
        setWizardLeadData(prev => ({
          ...prev,
          Team_member: safeTeamMembersText,
          Team_Members: safeTeamMembersText,
          team_members: safeTeamMembersText,
          Add_Deliverable: safeDeliverablesText,
          deliverables: deliverablesText,
          deliverables_description: deliverablesText,
          Select_Package_Option: pkgId,
          selected_package_id: pkgId,
          package_cost: verifiedPkgPrice,
          package_price: verifiedPkgPrice,
          budget: verifiedPkgPrice,
          final_amount: verifiedFinalAmt,
          final_quoted_amount: verifiedFinalAmt
        }));

        // Invalidate stale cached quote services in localStorage
        try {
          localStorage.removeItem(`erp_quote_services_${leadId}`);
        } catch (e) {}

        // Global refresh
        if (refreshData) {
          await refreshData();
        }

        setStep3AutoSaveStatus('saved');
      } catch (err) {
        console.error("Exception in saveStep3DataRealtime:", err);
        setStep3AutoSaveStatus('error');
      }
    }, 400);
  };

  const getCleanSalesStaffName = (rawName?: any, leadObj?: Lead | null): string => {
    let candidate = String(rawName || '').trim();

    if (!candidate && leadObj) {
      if (leadObj.sales_staff_name && String(leadObj.sales_staff_name).trim()) {
        candidate = String(leadObj.sales_staff_name).trim();
      } else if (leadObj.sales_person && !['Sales', 'Sales Team', 'Admin', 'Admin User'].includes(String(leadObj.sales_person).trim())) {
        candidate = String(leadObj.sales_person).trim();
      }
    }

    if (!candidate && currentUser?.name) {
      candidate = currentUser.name;
    }

    if (!candidate) return '';

    // If candidate contains comma-separated names, extract only the actual Sales Person
    if (candidate.includes(',')) {
      if (leadObj?.sales_person && !['Sales', 'Sales Team', 'Admin', 'Admin User'].includes(String(leadObj.sales_person).trim())) {
        const sp = String(leadObj.sales_person).trim().toLowerCase();
        const parts = candidate.split(',').map(s => s.trim());
        const match = parts.find(p => p.toLowerCase() === sp || p.toLowerCase().includes(sp) || sp.includes(p.toLowerCase()));
        if (match) return match;
      }
      return candidate.split(',')[0].trim();
    }

    return candidate;
  };

  const getCleanSalesStaffMobile = (rawMobile?: any, leadObj?: Lead | null): string => {
    let candidate = String(rawMobile || '').trim();

    if (!candidate && leadObj && leadObj.sales_staff_mobile && String(leadObj.sales_staff_mobile).trim()) {
      candidate = String(leadObj.sales_staff_mobile).trim();
    }

    if (!candidate && currentUser?.mobile) {
      candidate = currentUser.mobile || '';
    }

    if (!candidate) return '';

    if (candidate.includes('||')) {
      candidate = candidate.split('||')[0].trim();
    }
    if (candidate.includes(',')) {
      candidate = candidate.split(',')[0].trim();
    }

    return candidate;
  };

  const [salesStaffName, setSalesStaffName] = useState<string>('');
  const [salesStaffMobile, setSalesStaffMobile] = useState<string>('');

  const getEffectiveSalesStaffName = (): string => {
    if (salesStaffName && String(salesStaffName).trim()) {
      return String(salesStaffName).trim();
    }
    if (currentUser?.name && String(currentUser.name).trim()) {
      return String(currentUser.name).trim();
    }
    if (selectedLead?.sales_staff_name && String(selectedLead.sales_staff_name).trim()) {
      return String(selectedLead.sales_staff_name).trim();
    }
    return 'Sales Staff';
  };

  const getEffectiveSalesStaffMobile = (): string => {
    let raw = '';
    if (salesStaffMobile && String(salesStaffMobile).trim()) {
      raw = String(salesStaffMobile).trim();
    } else if (currentUser?.mobile && String(currentUser.mobile).trim()) {
      raw = String(currentUser.mobile).trim();
    } else if (selectedLead?.sales_staff_mobile && String(selectedLead.sales_staff_mobile).trim()) {
      raw = String(selectedLead.sales_staff_mobile).trim();
    }
    const digits = raw.replace(/\D/g, '');
    return digits || raw;
  };

  React.useEffect(() => {
    if (currentUser?.name && (!salesStaffName || !salesStaffName.trim())) {
      setSalesStaffName(currentUser.name);
    }
    if (currentUser?.mobile && (!salesStaffMobile || !salesStaffMobile.trim())) {
      setSalesStaffMobile(currentUser.mobile);
    }
  }, [currentUser]);
  const [quoteDiscount, setQuoteDiscount] = useState<number | ''>('');
  const [quoteAdditional, setQuoteAdditional] = useState<number | ''>('');
  
  const [quoteServices, setQuoteServices] = useState<{ id: string; name: string; qty: number; price: number; isAdditional?: boolean }[]>([]);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  
  // Adding service inline temp states
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceQty, setNewServiceQty] = useState(1);
  const [newServicePrice, setNewServicePrice] = useState(0);
  const [isAddingInline, setIsAddingInline] = useState(false);

  const handleAddInlineService = () => {
    if (!newServiceName.trim()) return;
    const newService = {
      id: `add_${Date.now()}`,
      name: newServiceName.trim(),
      qty: Math.max(1, newServiceQty),
      price: Math.max(0, newServicePrice),
      isAdditional: true
    };
    setQuoteServices(prev => [...prev, newService]);
    // reset states
    setNewServiceName('');
    setNewServiceQty(1);
    setNewServicePrice(0);
    setIsAddingInline(false);
  };

  const handleEditServiceItem = (id: string, updatedFields: Partial<{ name: string; qty: number; price: number }>) => {
    setQuoteServices(prev => prev.map(s => s.id === id ? { ...s, ...updatedFields } : s));
  };

  const handleRemoveServiceItem = (id: string) => {
    setQuoteServices(prev => prev.filter(s => s.id !== id));
  };

  
  // Synchronize/initialize services on entering Step 4
  React.useEffect(() => {
    const isStep4Active = wizardStep === 3 || crmWizardStep === 3;
    if (!isStep4Active) {
      setEditingServiceId(null);
      setIsAddingInline(false);
      return;
    }

    const activePkgs = getSelectedPkgsInfo(crmWizardStep === 3);
    const activePkgIds = activePkgs.map(lp => lp.package_id).filter(Boolean);

    // Build expected list of base deliverables from active packages directly from packages table
    const expectedBaseDeliverables: { pkgId: string; name: string }[] = [];
    activePkgs.forEach((lp) => {
      const pkgKey = lp.package_id || 'default';
      const pObj = (packages || []).find(p => p.package_id === lp.package_id);
      const incStr = pObj?.team_members || '';
      const delStr = pObj?.deliverables || '';

      const inclusionsList = parseTeamMembers(incStr);
      const deliverablesList = delStr
        ? delStr.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean)
        : [];

      const combined = [...inclusionsList, ...deliverablesList];
      if (combined.length === 0) {
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
        defaultItems.forEach(name => {
          expectedBaseDeliverables.push({ pkgId: pkgKey, name });
        });
      } else {
        combined.forEach(name => {
          expectedBaseDeliverables.push({ pkgId: pkgKey, name });
        });
      }
    });

    const leadId = crmWizardStep === 3 ? (selectedLead?.lead_id || 'edit') : (createdLeadId || 'create');
    const storageKey = `erp_quote_services_${leadId}`;
    const cached = localStorage.getItem(storageKey);
    let cacheIsValid = false;

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          const cachedBaseServices = parsed.filter(s => !s.isAdditional && s.id.startsWith('base_'));
          
          if (cachedBaseServices.length === expectedBaseDeliverables.length) {
            const allMatched = expectedBaseDeliverables.every((expected) => {
              return cachedBaseServices.some(s => {
                const parts = s.id.split('_');
                const pkgIdPart = parts[1];
                return pkgIdPart === expected.pkgId && s.name === expected.name;
              });
            });
            if (allMatched) {
              cacheIsValid = true;
              setQuoteServices(parsed);
              return;
            }
          }
        }
      } catch (e) {
        console.warn("Failed to parse cached quote services", e);
      }
    }

    // Fallback/Rebuild: auto-initialize directly using data from packages table
    const initialServices: { id: string; name: string; qty: number; price: number; isAdditional: boolean }[] = [];
    activePkgs.forEach((lp) => {
      const pkgKey = lp.package_id || 'default';
      const pObj = (packages || []).find(p => p.package_id === lp.package_id);
      const incStr = pObj?.team_members || '';
      const delStr = pObj?.deliverables || '';

      const inclusionsList = parseTeamMembers(incStr);
      const deliverablesList = delStr
        ? delStr.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean)
        : [];

      const combined = [...inclusionsList, ...deliverablesList];

      if (combined.length === 0) {
        // Fallback standard photography inclusions
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
        const totalCost = Number(lp.package_cost || 0);
        const ratio = totalCost ? (totalCost / sumDefault) : 1;

        let distributed = 0;
        defaultItems.forEach((name, idx) => {
          let pricePerItem;
          if (idx === defaultItems.length - 1) {
            pricePerItem = totalCost - distributed;
          } else {
            pricePerItem = Math.round((defaultPrices[idx] || 5000) * ratio);
            distributed += pricePerItem;
          }
          initialServices.push({
            id: `base_${pkgKey}_${idx}`,
            name,
            qty: 1,
            price: pricePerItem,
            isAdditional: false
          });
        });
      } else {
        // Divide lp.package_cost equally among combined items
        const count = combined.length;
        const totalCost = Number(lp.package_cost || 0);
        let distributed = 0;
        combined.forEach((name, idx) => {
          let pricePerItem;
          if (idx === count - 1) {
            pricePerItem = totalCost - distributed;
          } else {
            pricePerItem = Math.round(totalCost / count);
            distributed += pricePerItem;
          }
          initialServices.push({
            id: `base_${pkgKey}_${idx}`,
            name,
            qty: 1,
            price: pricePerItem,
            isAdditional: false
          });
        });
      }
    });

    setQuoteServices(initialServices);
  }, [wizardStep, crmWizardStep, selectedLead, createdLeadId, packages, wizardLeadData.selected_package_id, selectedPkgIds]);

  // Save services to local storage whenever they change
  React.useEffect(() => {
    const isStep4Active = wizardStep === 3 || crmWizardStep === 3;
    if (!isStep4Active) return;
    const leadId = crmWizardStep === 3 ? (selectedLead?.lead_id || 'edit') : (createdLeadId || 'create');
    localStorage.setItem(`erp_quote_services_${leadId}`, JSON.stringify(quoteServices));
  }, [quoteServices, selectedLead, createdLeadId, crmWizardStep, wizardStep]);

  const handleEditInclusion = (pkgKey: string, index: number, value: string) => {
    if (isStep3Locked) return;
    setEditableInclusions(prev => {
      const list = prev[pkgKey] ? [...prev[pkgKey]] : [];
      list[index] = value;
      return { ...prev, [pkgKey]: list };
    });
  };

  const handleRemoveInclusion = (pkgKey: string, index: number) => {
    if (isStep3Locked) return;
    setEditableInclusions(prev => {
      const list = prev[pkgKey] ? prev[pkgKey].filter((_, i) => i !== index) : [];
      return { ...prev, [pkgKey]: list };
    });
  };

  const handleAddInclusion = (pkgKey: string, value: string) => {
    if (isStep3Locked) return;
    if (!value.trim()) return;
    setEditableInclusions(prev => {
      const list = prev[pkgKey] ? [...prev[pkgKey]] : [];
      list.push(value.trim());
      return { ...prev, [pkgKey]: list };
    });
  };

  const handleEditDeliverable = (pkgKey: string, index: number, value: string) => {
    if (isStep3Locked) return;
    setEditableDeliverables(prev => {
      const list = prev[pkgKey] ? [...prev[pkgKey]] : [];
      list[index] = value;
      return { ...prev, [pkgKey]: list };
    });
  };

  const handleRemoveDeliverable = (pkgKey: string, index: number) => {
    if (isStep3Locked) return;
    setEditableDeliverables(prev => {
      const list = prev[pkgKey] ? prev[pkgKey].filter((_, i) => i !== index) : [];
      return { ...prev, [pkgKey]: list };
    });
  };

  const handleAddDeliverable = (pkgKey: string, value: string) => {
    if (isStep3Locked) return;
    if (!value.trim()) return;
    setEditableDeliverables(prev => {
      const list = prev[pkgKey] ? [...prev[pkgKey]] : [];
      list.push(value.trim());
      return { ...prev, [pkgKey]: list };
    });
  };

  // Reset or clear state when selectedLead changes or is deselected
  React.useEffect(() => {
    if (!selectedLead && activeTab === 'create') {
      return;
    }
    if (!selectedLead) {
      setEditableInclusions({});
      setEditableDeliverables({});
      return;
    }
  }, [selectedLead, activeTab]);

  const lastLoadedLeadIdRef = React.useRef<string | null>(null);

  // Fetch from Supabase directly for the JSON columns
  React.useEffect(() => {
    const pkgId = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option;
    const targetLeadId = selectedLead?.lead_id || (activeTab === 'create' ? createdLeadId : null);
    if (targetLeadId && targetLeadId !== 'DRAFT-LEAD' && supabaseClient) {
      const currentKey = `${targetLeadId}`;
      if (lastLoadedLeadIdRef.current === currentKey) {
        return;
      }
      const fetchSupabasePackageData = async () => {
        try {
          const { data: lpData } = await supabaseClient
            .from('lead_packages')
            .select('*')
            .eq('lead_id', targetLeadId);

          const { data, error } = await supabaseClient
            .from('leads')
            .select('*')
            .eq('lead_id', targetLeadId)
            .maybeSingle();
          
          if (!error && (data || (lpData && lpData.length > 0))) {
            lastLoadedLeadIdRef.current = currentKey;
            
            const primaryLp = lpData && lpData.length > 0 ? lpData[0] : null;
            const effectivePkgId = pkgId || data?.Select_Package_Option || primaryLp?.package_id || 'Custom Package';

            const cleanCost = primaryLp?.package_cost ?? data?.package_price ?? data?.budget;
            if (cleanCost != null && !isNaN(Number(cleanCost))) {
              setWizardLeadData(prev => {
                const existingPkg = prev.selected_package_id || prev.Select_Package_Option;
                const finalPkg = (existingPkg && existingPkg.trim() !== '') ? existingPkg : effectivePkgId;
                return {
                  ...prev,
                  package_cost: Number(cleanCost),
                  package_price: Number(cleanCost),
                  budget: Number(cleanCost),
                  notes: data?.notes_special_customizations ?? prev.notes,
                  Select_Package_Option: finalPkg,
                  selected_package_id: finalPkg,
                };
              });
            }
            if (data?.Quotation_Discount != null) {
              setQuoteDiscount(Number(data.Quotation_Discount));
            }
            if (data?.Additional_Services_Cost != null) {
              setQuoteAdditional(Number(data.Additional_Services_Cost));
            }

            const rawTeamData = data?.Team_Members || data?.Team_member || (data as any)?.team_members || primaryLp?.Team_Members_Included || primaryLp?.editable_inclusions;
            console.log('TEAM MEMBERS LOADED', { leadId: targetLeadId, Team_Members: rawTeamData });
            if (rawTeamData) {
              const loadedInclusions = parseTeamMembersJsonToRecord(rawTeamData, effectivePkgId, crmEvents);
              if (Object.keys(loadedInclusions).length > 0) {
                setEditableInclusions(loadedInclusions);
              }
            }

            const rawDelData = data?.Add_Deliverable || primaryLp?.deliverables_descriptionn || primaryLp?.editable_deliverables || data?.deliverables_description;
            console.log('DELIVERABLES LOADED', { leadId: targetLeadId, Add_Deliverable: rawDelData });
            if (rawDelData) {
              const loadedDeliverables = parseDeliverablesJsonToRecord(rawDelData, effectivePkgId, crmEvents);
              if (Object.keys(loadedDeliverables).length > 0) {
                setEditableDeliverables(loadedDeliverables);
              }
            }
          }
        } catch (e) {
          console.error('Error fetching leads/lead_packages details from Supabase', e);
        }
      };
      fetchSupabasePackageData();
    } else {
      if (!selectedLead && !createdLeadId) {
        lastLoadedLeadIdRef.current = null;
      }
    }
  }, [selectedLead?.lead_id, createdLeadId, activeTab, wizardLeadData.selected_package_id, wizardLeadData.Select_Package_Option, supabaseClient, crmEvents, crmWizardStep, wizardStep]);

  // Save to Supabase directly for the JSON columns
  const isFirstRender = React.useRef(true);
  
  // Explicit saves are now handled directly in the onChange handlers for immediate persistence
  // to avoid closure stale state overwrites in debounced effects.

  // Step 1 Automatic Data Prefill & Hydration from Supabase leads table
  React.useEffect(() => {
    if (!selectedLead?.lead_id || !supabaseClient || selectedLead.lead_id === 'DRAFT-LEAD') return;

    let isMounted = true;

    const loadStep1DataFromDB = async () => {
      try {
        const { data: dbLead, error } = await supabaseClient
          .from('leads')
          .select('*')
          .eq('lead_id', selectedLead.lead_id)
          .maybeSingle();

        if (error || !dbLead || !isMounted) return;

        setWizardLeadData(prev => ({
          ...prev,
          customer_name: dbLead.customer_name || prev.customer_name || '',
          mobile: dbLead.mobile ? String(dbLead.mobile) : (prev.mobile ? String(prev.mobile) : ''),
          whatsapp_number: dbLead.whatsapp_number ? String(dbLead.whatsapp_number) : (dbLead.mobile ? String(dbLead.mobile) : (prev.whatsapp_number ? String(prev.whatsapp_number) : '')),
          email: dbLead.email ?? prev.email ?? '',
          lead_source: dbLead.lead_source || prev.lead_source || '',
          Specify_Custom_Lead_Source_Name: dbLead.Specify_Custom_Lead_Source_Name || prev.Specify_Custom_Lead_Source_Name || '',
          address: dbLead.address || prev.address || '',
          city: dbLead.city || prev.city || '',
          state: dbLead.state || prev.state || '',
          pincode: dbLead.pincode || prev.pincode || '',
          client_residence_address: dbLead.client_residence_address || prev.client_residence_address || '',
          desired_event_shoot_type: dbLead.desired_event_shoot_type || prev.desired_event_shoot_type || '',
          status: dbLead.status || dbLead.current_status || prev.status,
          budget: dbLead.budget ?? prev.budget ?? 0,
          package_price: dbLead.package_price ?? prev.package_price ?? 0,
          Select_Package_Option: prev.Select_Package_Option || prev.selected_package_id || dbLead.Select_Package_Option || '',
          selected_package_id: prev.selected_package_id || prev.Select_Package_Option || dbLead.Select_Package_Option || '',
        }));

        // Keep selectedLead object in sync with fresh database values
        setSelectedLead(prev => {
          if (!prev || prev.lead_id !== dbLead.lead_id) return prev;
          return {
            ...prev,
            customer_name: dbLead.customer_name || prev.customer_name,
            mobile: dbLead.mobile ? String(dbLead.mobile) : prev.mobile,
            whatsapp_number: dbLead.whatsapp_number ? String(dbLead.whatsapp_number) : prev.whatsapp_number,
            email: dbLead.email ?? prev.email,
            lead_source: dbLead.lead_source || prev.lead_source,
            Specify_Custom_Lead_Source_Name: dbLead.Specify_Custom_Lead_Source_Name || prev.Specify_Custom_Lead_Source_Name,
            status: dbLead.status || dbLead.current_status || prev.status,
          };
        });
      } catch (err) {
        console.error("Error loading Step 1 data from DB:", err);
      }
    };

    loadStep1DataFromDB();

    return () => { isMounted = false; };
  }, [selectedLead?.lead_id, supabaseClient]);

  // Step 1 Customer Details Automatic Data Hydration from Supabase
  React.useEffect(() => {
    if (!selectedLead?.lead_id || selectedLead.lead_id === 'DRAFT-LEAD' || !supabaseClient) return;

    let isMounted = true;

    const hydrateCustomerDetails = async () => {
      try {
        const { data: leadData, error } = await supabaseClient
          .from('leads')
          .select('*')
          .eq('lead_id', selectedLead.lead_id)
          .maybeSingle();

        if (error || !leadData || !isMounted) return;

        setWizardLeadData(prev => ({
          ...prev,
          customer_name: leadData.customer_name || prev.customer_name || selectedLead.customer_name || '',
          mobile: String(leadData.mobile || prev.mobile || selectedLead.mobile || ''),
          whatsapp_number: String(leadData.whatsapp_number || prev.whatsapp_number || leadData.mobile || prev.mobile || selectedLead.whatsapp_number || selectedLead.mobile || ''),
          email: leadData.email ?? prev.email ?? selectedLead.email ?? '',
          lead_source: leadData.lead_source || prev.lead_source || selectedLead.lead_source || 'Reference',
          Specify_Custom_Lead_Source_Name: leadData.Specify_Custom_Lead_Source_Name || prev.Specify_Custom_Lead_Source_Name || selectedLead.Specify_Custom_Lead_Source_Name || '',
          address: leadData.address || prev.address || selectedLead.address || '',
          city: leadData.city || prev.city || selectedLead.city || '',
          state: leadData.state || prev.state || selectedLead.state || '',
          pincode: leadData.pincode || prev.pincode || selectedLead.pincode || '',
          client_residence_address: leadData.client_residence_address || prev.client_residence_address || selectedLead.client_residence_address || '',
          desired_event_shoot_type: leadData.desired_event_shoot_type || prev.desired_event_shoot_type || selectedLead.desired_event_shoot_type || '',
          Select_Package_Option: prev.Select_Package_Option || prev.selected_package_id || leadData.Select_Package_Option || selectedLead.Select_Package_Option || '',
          status: leadData.status || leadData.current_status || prev.status || selectedLead.status || '',
        }));
      } catch (err) {
        console.warn("Failed to hydrate customer details from Supabase", err);
      }
    };

    hydrateCustomerDetails();

    return () => { isMounted = false; };
  }, [selectedLead?.lead_id, supabaseClient]);

  // Step 2 Automatic Data Persistence & Prefill
  React.useEffect(() => {
    const isStep2 = (activeTab === 'create' && wizardStep === 2) || (activeTab === 'crm' && crmWizardStep === 2);
    const activeLeadId = activeTab === 'create' ? createdLeadId : selectedLead?.lead_id;

    if (!isStep2 || !activeLeadId || !supabaseClient) return;

    let isMounted = true;

    const loadStep2DataFromDB = async () => {
      try {
        // 1. Fetch lead details
        const { data: leadData, error: leadErr } = await supabaseClient
          .from('leads')
          .select('*')
          .eq('lead_id', activeLeadId)
          .maybeSingle();

        if (leadErr) {
          console.error("Error fetching lead for step 2:", leadErr);
          return;
        }

        if (!isMounted) return;

        // 2. Fetch lead events
        const { data: eventsData, error: eventsErr } = await supabaseClient
          .from('lead_events')
          .select('*')
          .eq('lead_id', activeLeadId);

        if (eventsErr) {
          console.error("Error fetching events for step 2:", eventsErr);
          return;
        }

        if (!isMounted) return;

        if (leadData) {
          // Restore follow-up details
          if (leadData.next_follow_up_date) {
            setStep2FollowUpDate(leadData.next_follow_up_date);
          }
          if (leadData.follow_up_notes) {
            setStep2FollowUpNotes(leadData.follow_up_notes);
          }
          
          setWizardLeadData(prev => ({
            ...prev,
            lead_source: leadData.lead_source || prev.lead_source,
            Specify_Custom_Lead_Source_Name: leadData.Specify_Custom_Lead_Source_Name || prev.Specify_Custom_Lead_Source_Name,
            client_residence_address: leadData.client_residence_address || prev.client_residence_address,
            city: leadData.city || prev.city,
            state: leadData.state || prev.state,
            pincode: leadData.pincode || prev.pincode,
            reference_source: leadData.reference_source || prev.reference_source,
          }));
        }

        if (eventsData && eventsData.length > 0) {
          const mappedEvents: LeadEvent[] = eventsData.map(ev => ({
            id: ev.id,
            event_type: ev.event_type,
            event_name: ev.event_name,
            event_date: ev.event_date,
            event_start_date: ev.event_date,
            event_end_date: ev.event_end_date || ev.Event_End_Date || '',
            event_location: ev.event_location,
            event_shoot_type: ev.event_shoot_type,
            guest_pax: ev.guest_pax,
            staff_pax: ev.staff_pax,
            event_start_time: ev.event_start_time,
            event_end_time: ev.event_end_time,
            google_maps_link: ev.google_maps_link,
            assigned_staff_names: ev.assigned_staff_names,
            assigned_staff_mobiles: ev.assigned_staff_mobiles,
            reporting_date: ev.reporting_date,
            reporting_time: ev.reporting_time
          }));

          if (activeTab === 'create') {
            setCreateEvents(mappedEvents);
          } else {
            setCrmEvents(mappedEvents);
          }

          // Pre-fill the form with the first event's details
          const firstEv = mappedEvents[0];
          setEventForm({
            event_type: firstEv.event_type || '',
            event_name: firstEv.event_name || '',
            event_date: firstEv.event_date || '',
            event_start_date: firstEv.event_date || '',
            event_end_date: firstEv.event_end_date || (firstEv as any).Event_End_Date || '',
            event_location: firstEv.event_location || '',
            event_shoot_type: firstEv.event_shoot_type || '',
            guest_pax: firstEv.guest_pax || '',
            staff_pax: firstEv.staff_pax || '',
            event_start_time: firstEv.event_start_time || '',
            event_end_time: firstEv.event_end_time || '',
            google_maps_link: firstEv.google_maps_link || ''
          });
          setEditingEventId(firstEv.id);
          setShowEventForm(true); // Force form to display so fields are not blank
        }
      } catch (err) {
        console.error("Error in loadStep2DataFromDB effect:", err);
      }
    };

    loadStep2DataFromDB();

    return () => {
      isMounted = false;
    };
  }, [wizardStep, crmWizardStep, activeTab, createdLeadId, selectedLead?.lead_id, supabaseClient]);

  // Auto-scroll and focus transitions for Sales Popups & Forms
  React.useEffect(() => {
    if (activeTab === 'create') {
      triggerAutoScrollAndFocus('#create_lead_form', 150);
    }
  }, [wizardStep, activeTab]);

  React.useEffect(() => {
    if (selectedLead) {
      triggerAutoScrollAndFocus('#lead_details_mobile_modal', 150);
    }
  }, [crmWizardStep, selectedLead?.lead_id]);

  React.useEffect(() => {
    const isModalOpen = Boolean(isAddFormOpen || editingPackage);
    if (!isModalOpen) return;

    triggerAutoScrollAndFocus('#add_edit_package_modal', 150);

    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const scrollBody = target.closest('#add_edit_package_modal_body') as HTMLElement | null;
      if (!scrollBody) {
        e.preventDefault();
        return;
      }
      const isAtTop = scrollBody.scrollTop <= 0 && e.deltaY < 0;
      const isAtBottom = scrollBody.scrollTop + scrollBody.clientHeight >= scrollBody.scrollHeight - 1 && e.deltaY > 0;
      if (isAtTop || isAtBottom) {
        e.preventDefault();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const scrollBody = target.closest('#add_edit_package_modal_body') as HTMLElement | null;
      if (!scrollBody) {
        e.preventDefault();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchmove', handleTouchMove);
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [isAddFormOpen, editingPackage]);

  React.useEffect(() => {
    if (showConfirmModal) {
      if (selectedLead) {
         initEventsReporting(selectedLead);
         setConfirmForm(prev => ({
            ...prev,
            quotation_amount: Number(selectedLead.Final_Quotation_Amount) || Number((selectedLead as any).final_quotation_amount) || Number(wizardLeadData.final_amount) || Number(selectedLead.final_amount) || 0
         }));
      }
    }
  }, [showConfirmModal, selectedLead?.lead_id]);

  React.useEffect(() => {
    if (showFinalReportingModal) {
      triggerAutoScrollAndFocus('#final_reporting_modal', 150);
    }
  }, [showFinalReportingModal]);

  React.useEffect(() => {
    if (showStep3Popup) {
      triggerAutoScrollAndFocus('#step3_followup_modal', 150);
    }
  }, [showStep3Popup]);

  React.useEffect(() => {
    // Completely removed automated quotation number generation as per instructions
  }, [wizardStep, crmWizardStep, activeQuoteNum]);

  const getSelectedPkgsInfo = (isEdit: boolean) => {
    const finalPkgId = (isEdit
      ? (wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || selectedLead?.Select_Package_Option)
      : (wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || selectedPkgIds[0])) || 'Custom Package';

    if (finalPkgId === 'Custom Package' || finalPkgId === 'custom_package') {
      return [{
        package_name: 'Custom Package',
        package_id: 'Custom Package',
        package_cost: Number(wizardLeadData.package_cost) || 0,
        deliverables: wizardLeadData.deliverables || '',
        inclusions: '',
        team_members: '',
        seasonal_offer: '',
        terms_conditions: '',
        event_type: '',
        duration: '',
        category: ''
      }];
    }

    const primaryPkg = (packages || []).find(p => String(p.package_id) === String(finalPkgId) || String(p.package_name) === String(finalPkgId));
    if (primaryPkg) {
      return [{
        package_name: primaryPkg.package_name,
        package_id: primaryPkg.package_id,
        package_cost: pkgPrices[primaryPkg.package_id] !== undefined ? Number(pkgPrices[primaryPkg.package_id]) : (Number(wizardLeadData.package_cost) || Number(primaryPkg.price) || 0),
        deliverables: wizardLeadData.deliverables || pkgDeliverables[primaryPkg.package_id] || primaryPkg.deliverables || '',
        inclusions: primaryPkg.package_includes || '',
        team_members: primaryPkg.team_members || '',
        seasonal_offer: primaryPkg.seasonal_offer || '',
        terms_conditions: primaryPkg.terms_conditions || '',
        event_type: primaryPkg.event_type || '',
        duration: primaryPkg.duration || '',
        category: primaryPkg.category || ''
      }];
    }

    return [{
      package_name: wizardLeadData.package_name || 'Custom Package',
      package_id: finalPkgId || 'Custom Package',
      package_cost: Number(wizardLeadData.package_cost) || 0,
      deliverables: wizardLeadData.deliverables || '',
      inclusions: '',
      team_members: '',
      seasonal_offer: '',
      terms_conditions: '',
      event_type: '',
      duration: '',
      category: ''
    }];
  };

  const dynamicBaseSum = getSelectedPkgsInfo(crmWizardStep > 0).reduce((sum, p) => sum + Number(p.package_cost || 0), 0);
  const dynamicAdditionalSum = quoteServices
    .filter(s => s.isAdditional)
    .reduce((sum, s) => sum + (Number(s.qty) * Number(s.price)), 0);
    const discountVal = Number(quoteDiscount || 0);
  const rawDynamicFinalAmt = Math.max(0, dynamicBaseSum + Number(quoteAdditional || 0) - discountVal);
  const dynamicFinalAmt = Number.isNaN(rawDynamicFinalAmt) ? 0 : rawDynamicFinalAmt;

  React.useEffect(() => {
    setWizardLeadData(prev => {
      if (prev.final_amount !== dynamicFinalAmt) {
        return { ...prev, final_amount: dynamicFinalAmt };
      }
      return prev;
    });
  }, [dynamicFinalAmt]);

  const getLeadInfoForQuote = (isEdit: boolean) => {
    const effectiveSalesName = getEffectiveSalesStaffName();
    const effectiveSalesMobile = getEffectiveSalesStaffMobile();

    const finalAmountVal = dynamicFinalAmt;
    const currentLeadId = isEdit ? (selectedLead?.lead_id || wizardLeadData.lead_id) : (selectedLead?.lead_id || createForm.lead_id || '');
    const activeLead = selectedLead || leads?.find((l: any) => l.lead_id === currentLeadId);
    const linkedOrder = orders?.find((o: any) => currentLeadId && (o.lead_id === currentLeadId || o.order_id === currentLeadId));
    const resolvedOrderId = selectedLead?.order_id || (selectedLead as any)?.Order_ID || linkedOrder?.order_id || (activeLead as any)?.order_id || wizardLeadData.order_id || '';
    const linkedPayment = linkedOrder ? payments?.find((p: any) => p.order_id === linkedOrder.order_id) : payments?.find((p: any) => (resolvedOrderId && p.order_id === resolvedOrderId) || (currentLeadId && p.lead_id === currentLeadId));

    const isOrderConfirmed = Boolean(
      isLeadConfirmed ||
      wizardLeadData.status === 'Order Confirmed' ||
      salesStatus === 'Order Confirmed' ||
      (activeLead && ['Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed'].includes(activeLead.status || '')) ||
      (activeLead && (activeLead as any).current_status === 'Order Confirmed') ||
      (activeLead && (activeLead as any).booking_status === 'Confirmed') ||
      (linkedOrder && linkedOrder.status !== 'Cancelled') ||
      (orders && orders.some((o: any) => (currentLeadId && o.lead_id === currentLeadId && o.status !== 'Cancelled') || (resolvedOrderId && o.order_id === resolvedOrderId && o.status !== 'Cancelled')))
    );

    let advanceAmt = 0;
    const paymentsBreakdown: { label: string; amount: number }[] = [];

    // Filter payment history from context and local pending
    const matchOrderId = resolvedOrderId || linkedOrder?.order_id || '';
    const matchLeadId = currentLeadId || '';

    let localPending: any[] = [];
    try {
      const saved = localStorage.getItem('pending_payment_approvals');
      if (saved) localPending = JSON.parse(saved) || [];
    } catch (_) {}

    let approvedIds = new Set<string>();
    try {
      const appSaved = localStorage.getItem('approved_payment_history_ids');
      if (appSaved) approvedIds = new Set(JSON.parse(appSaved));
    } catch (_) {}

    let rejectedIds = new Set<string>();
    try {
      const rejSaved = localStorage.getItem('rejected_payment_history_ids');
      if (rejSaved) rejectedIds = new Set(JSON.parse(rejSaved));
    } catch (_) {}

    const combinedHistMap = new Map<string, any>();
    (paymentHistory || []).forEach((h: any) => {
      const k = String(h.id || h.payment_history_id || '');
      if (k) combinedHistMap.set(k, h);
    });
    localPending.forEach((h: any) => {
      const k = String(h.id || h.payment_history_id || '');
      if (k && !combinedHistMap.has(k)) combinedHistMap.set(k, h);
    });

    const validOrderHistories = Array.from(combinedHistMap.values()).filter((h: any) => {
      const hid = String(h.order_id || '').trim();
      if (!hid) return false;
      const isMatch = (matchOrderId && hid === matchOrderId) || 
                      (matchLeadId && (hid === matchLeadId || hid === `ORD-${matchLeadId}`));
      if (!isMatch) return false;

      const histId = String(h.id || h.payment_history_id || '');
      const isRejected = h.approval_status === 'Rejected' || 
        rejectedIds.has(histId) || 
        (typeof h.notes === 'string' && (
          h.notes.includes('Rejected') || 
          h.notes.includes('[REJECTED]') || 
          h.notes.endsWith('- Rejected') || 
          h.notes.toLowerCase().includes('rejected by business owner')
        ));
      return !isRejected;
    });

    const advanceItems = validOrderHistories.filter((h: any) => {
      const type = String(h.payment_type || h.Payment_type || '').trim().toLowerCase();
      if (type === 'advance payment' || type === 'advance') return true;
      if (!type && typeof h.notes === 'string' && h.notes.toLowerCase().includes('advance')) return true;
      return false;
    });

    if (advanceItems.length > 0) {
      advanceAmt = advanceItems.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);
    } else if (isOrderConfirmed) {
      if (linkedOrder && linkedOrder.advance_received !== undefined && Number(linkedOrder.advance_received) > 0) {
        advanceAmt = Number(linkedOrder.advance_received);
      } else if (linkedPayment && linkedPayment.advance_received !== undefined && Number(linkedPayment.advance_received) > 0 && linkedPayment.payment_status !== 'Rejected' && linkedPayment.payment_status !== 'Cancelled') {
        advanceAmt = Number(linkedPayment.advance_received);
      } else if (wizardLeadData.advance_received !== undefined && Number(wizardLeadData.advance_received) > 0) {
        advanceAmt = Number(wizardLeadData.advance_received);
      } else if (activeLead?.advance_collected !== undefined && Number(activeLead.advance_collected) > 0) {
        advanceAmt = Number(activeLead.advance_collected);
      } else if (selectedLead?.advance_received !== undefined && Number(selectedLead.advance_received) > 0) {
        advanceAmt = Number(selectedLead.advance_received);
      }
    }

    if (advanceAmt > 0) {
      paymentsBreakdown.push({ label: 'Advance Payment', amount: advanceAmt });
    }

    const otherItems = validOrderHistories.filter((h: any) => !advanceItems.includes(h));
    const otherMap = new Map<string, number>();
    otherItems.forEach((h: any) => {
      const rawType = String(h.payment_type || h.Payment_type || '').trim() || 'Payment';
      let label = rawType;
      if (rawType.toLowerCase().includes('shoot') || rawType.toLowerCase().includes('event')) {
        label = 'Event Date Payment';
      } else if (rawType.toLowerCase().includes('final')) {
        label = 'Final Payment';
      }
      const amt = Number(h.amount) || 0;
      if (amt > 0) {
        otherMap.set(label, (otherMap.get(label) || 0) + amt);
      }
    });
    otherMap.forEach((amt, lbl) => {
      paymentsBreakdown.push({ label: lbl, amount: amt });
    });

    const totalPaidVal = paymentsBreakdown.reduce((sum, p) => sum + p.amount, 0);
    const pendingAmountVal = Math.max(0, finalAmountVal - totalPaidVal);

    if (isEdit) {
      return {
        ...selectedLead,
        order_id: resolvedOrderId || selectedLead?.order_id || '',
        is_order_confirmed: isOrderConfirmed,
        advance_received: advanceAmt,
        advance_payment_received: advanceAmt,
        advance_collected: advanceAmt,
        payments_breakdown: paymentsBreakdown,
        total_paid_amount: totalPaidVal,
        pending_amount: pendingAmountVal,
        customer_name: wizardLeadData.customer_name,
        mobile: wizardLeadData.mobile,
        email: wizardLeadData.email,
        event_date: wizardLeadData.event_date,
        event_location: wizardLeadData.event_location,
        event_type: wizardLeadData.event_type,
        shoot_type: wizardLeadData.shoot_type,
        budget: wizardLeadData.budget || finalAmountVal,
        whatsapp_number: wizardLeadData.whatsapp_number,
        address: wizardLeadData.address,
        city: wizardLeadData.city,
        state: wizardLeadData.state,
        pincode: wizardLeadData.pincode,
        client_residence_address: wizardLeadData.client_residence_address,
        desired_event_shoot_type: wizardLeadData.desired_event_shoot_type,
        deliverables_description: wizardLeadData.deliverables,
        notes_special_customizations: wizardLeadData.notes,
        Select_Package_Option: wizardLeadData.Select_Package_Option || wizardLeadData.selected_package_id || selectedLead?.Select_Package_Option || '',
        sales_staff_name: effectiveSalesName,
        sales_staff_mobile: effectiveSalesMobile,
        events: crmEvents,
        Final_Quotation_Amount: finalAmountVal || wizardLeadData.final_quoted_amount || wizardLeadData.budget || selectedLead?.Final_Quotation_Amount || selectedLead?.final_quotation_amount || selectedLead?.final_amount,
        final_quotation_amount: finalAmountVal || wizardLeadData.final_quoted_amount || wizardLeadData.budget || selectedLead?.final_quotation_amount || selectedLead?.Final_Quotation_Amount || selectedLead?.final_amount,
        final_amount: finalAmountVal || wizardLeadData.final_quoted_amount || wizardLeadData.budget || selectedLead?.final_amount || selectedLead?.Final_Quotation_Amount || selectedLead?.final_quotation_amount,
        dynamicFinalAmt: finalAmountVal
      };
    } else {
      return {
        ...createForm,
        lead_id: createdLeadId || 'DRAFT-LEAD',
        order_id: resolvedOrderId || '',
        is_order_confirmed: isOrderConfirmed,
        advance_received: advanceAmt,
        advance_payment_received: advanceAmt,
        advance_collected: advanceAmt,
        payments_breakdown: paymentsBreakdown,
        total_paid_amount: totalPaidVal,
        pending_amount: pendingAmountVal,
        deliverables_description: selectedPkgs.map(p => pkgDeliverables[p.id] || p.deliverables || 'N/A').join('\n'),
        notes_special_customizations: selectedPkgs.map(p => pkgNotes[p.id] || '').join('\n'),
        Select_Package_Option: createForm.Select_Package_Option || selectedPkgIds[0] || '',
        sales_staff_name: effectiveSalesName,
        sales_staff_mobile: effectiveSalesMobile,
        events: createEvents,
        Final_Quotation_Amount: finalAmountVal || createForm.budget,
        final_quotation_amount: finalAmountVal || createForm.budget,
        final_amount: finalAmountVal || createForm.budget,
        dynamicFinalAmt: finalAmountVal
      };
    }
  };

  const validateLeadForQuotation = (leadObj: any, activePkgs: any[]) => {
    const missing: string[] = [];
    if (!String(leadObj.customer_name || '').trim()) missing.push('Customer Name');
    if (!String(leadObj.mobile || '').trim()) missing.push('Mobile Number');
    if (!String(leadObj.event_type || '').trim()) missing.push('Event Type');
    if (!String(leadObj.event_date || '').trim()) missing.push('Event Date');
    if (!String(leadObj.event_location || '').trim() && !String(leadObj.location || '').trim()) missing.push('Event Location');
    if (activePkgs.length === 0) missing.push('At least one selected package');
    return missing;
  };

  const handleGenerateQuote = async (isEdit: boolean): Promise<string | null> => {
    setIsSaving(true);
    console.log("✔ Starting quotation generation...");
    try {
      const effName = getEffectiveSalesStaffName();
      const effMobile = getEffectiveSalesStaffMobile();
      if (!salesStaffName || !salesStaffName.trim()) setSalesStaffName(effName);
      if (!salesStaffMobile || !salesStaffMobile.trim()) setSalesStaffMobile(effMobile);

      const leadObj = getLeadInfoForQuote(isEdit);
      const leadIdForError = leadObj?.lead_id || createdLeadId || 'UNKNOWN';

      console.log("✔ Validating form...");
      const activePkgs = getSelectedPkgsInfo(isEdit);

      const missingFields = validateLeadForQuotation(leadObj, activePkgs);
      if (missingFields.length > 0) {
        showErrorHelper(
          "Quotation Incomplete",
          `Missing required fields: ${missingFields.join(', ')}`,
          "validateLeadForQuotation()",
          leadIdForError,
          "Complete all required fields before generating the quotation."
        );
        setIsSaving(false);
        return null;
      }

      const basePkgSum = dynamicBaseSum;
      const finalAmt = dynamicFinalAmt;

      const leadId = leadObj.lead_id || 'DRAFT-LEAD';
      let dbQuote = null;
      if (supabaseClient && leadId !== 'DRAFT-LEAD') {
        const { data, error } = await supabaseClient
          .from('quotations')
          .select('quotation_id, quotation_number, created_at')
          .eq('lead_id', leadId)
          .maybeSingle();
        if (!error && data) {
          dbQuote = data;
        }
      }

      const existingQuotation = dbQuote || (quotations || []).find(q => q.lead_id === leadId);
      
      const d = new Date();
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const randomFour = String(Math.floor(1 + Math.random() * 9999)).padStart(4, '0');
      const generatedQuotNum = existingQuotation ? existingQuotation.quotation_number : `QT-${dateStr}-${randomFour}`;
      const quotNum = activeQuoteNum || generatedQuotNum;
      
      console.log(`✔ Creating/Updating quotation ${quotNum}...`);
      const qId = existingQuotation ? existingQuotation.quotation_id : ('QT-' + Math.random().toString(36).substring(2, 9).toUpperCase());
      
      const activePkgId = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || 'Custom Package';
      const { teamMembersJson, deliverablesJson, teamMembersText, deliverablesText } = buildStep3EventPayloads(
        activePkgId,
        crmEvents,
        editableInclusions,
        editableDeliverables
      );
      
      const activeDeliverablesText = (deliverablesText === '[]' && leadObj.deliverables_description && leadObj.deliverables_description !== '[]') 
        ? leadObj.deliverables_description 
        : deliverablesText;
        
      const activeTeamMembersText = (teamMembersText === '[]' && (leadObj.Team_member || leadObj.Team_Members) && (leadObj.Team_member !== '[]' || leadObj.Team_Members !== '[]'))
        ? (leadObj.Team_member || leadObj.Team_Members)
        : teamMembersText;
        
      let finalBasePkgSum = basePkgSum;
      if (finalBasePkgSum === 0 && leadObj.package_price && leadObj.package_price > 0) {
        finalBasePkgSum = leadObj.package_price;
      }

      const standardQuotation = {
        quotation_id: qId,
        quotation_number: quotNum,
        lead_id: leadId,
        customer_id: leadObj.customer_name || '',
        customer_name: leadObj.customer_name || '',
        order_id: '',
        package_name: activePkgs.map(p => p.package_name).join(' + '),
        package_price: finalBasePkgSum,
        quotation_amount: finalBasePkgSum + Number(quoteAdditional || 0),
        discount: quoteDiscount,
        discount_amount: quoteDiscount,
        additional_services_cost: Number(quoteAdditional || 0),
        final_quotation_amount: finalAmt,
        final_amount: finalAmt,
        tax_amount: 0,
        quotation_status: 'Sent',
        pdf_url: '',
        generated_date: new Date().toISOString().split('T')[0],
        created_at: existingQuotation ? existingQuotation.created_at : new Date().toISOString(),
        created_by: salesStaffName || 'System',
        whatsapp_sent_status: false,
        viewed_status: false,
        terms_conditions: quotationTerms,
        deliverables_description: activeDeliverablesText,
        notes_special_customizations: leadObj.notes_special_customizations,
          Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
          Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
          Final_Quotation_Amount: finalAmt,
        client_residence_address: leadObj.client_residence_address,
        city: leadObj.city,
        state: leadObj.state,
        pincode: leadObj.pincode,
        desired_event_shoot_type: leadObj.desired_event_shoot_type || leadObj.shoot_type,

        editableInclusions: editableInclusions,
        editableDeliverables: editableDeliverables
      };

      console.log("✔ Saving to Supabase...");
      const finalQuoteNum = await addQuotation(standardQuotation);
      console.log(`✔ Quotation saved successfully. Confirmed Quotation Number: ${finalQuoteNum}`);
      setActiveQuoteNum(finalQuoteNum);

      if (isEdit) {
        if (wizardLeadData.selected_package_id) {
          const selectedPkg = packages.find((p) => p.package_id === wizardLeadData.selected_package_id);
          const activePackagesList = (leadPackages || []).filter(lp => lp.lead_id === selectedLead.lead_id);
          
          if (!activePackagesList.some(lp => lp.package_id === wizardLeadData.selected_package_id)) {
            activePackagesList.push({
              package_id: wizardLeadData.selected_package_id,
              package_name: selectedPkg?.package_name || 'Selected Package',
              package_cost: Number(wizardLeadData.package_cost),
              quantity: 1,
              total_amount: Number(wizardLeadData.package_cost),
              discount: 0,
              final_amount: Number(wizardLeadData.package_cost),
              deliverables_description: activeDeliverablesText,
              notes_special_customizations: wizardLeadData.notes,
              additional_services_cost: 0,
              team_members: '',
              deliverables: ''
            } as any);
          }
          
          const payloadToSave = activePackagesList.map(lp => {
            const isPrimary = lp.package_id === wizardLeadData.selected_package_id;
            const incStr = (editableInclusions[lp.package_id!] || []).join(', ');
            const delStr = (editableDeliverables[lp.package_id!] || []).join(', ');
            
            // Protect against empty object overwriting valid data during a race condition
            const hasNewInclusions = Object.keys(editableInclusions).length > 0;
            const hasNewDeliverables = Object.keys(editableDeliverables).length > 0;
            
            return {
              package_id: lp.package_id!,
              package_name: lp.package_name || 'Selected Package',
              package_cost: isPrimary ? Number(wizardLeadData.package_cost) : lp.package_cost,
              quantity: lp.quantity || 1,
              total_amount: isPrimary ? Number(wizardLeadData.package_cost) : lp.total_amount,
              discount: lp.discount || 0,
              final_amount: isPrimary ? Number(wizardLeadData.package_cost) : lp.final_amount,
              deliverables_description: isPrimary ? activeDeliverablesText : lp.deliverables_description,
              notes_special_customizations: isPrimary ? wizardLeadData.notes : lp.notes_special_customizations,
              additional_services_cost: lp.additional_services_cost || 0,
              team_members: incStr || lp.team_members || '',
              deliverables: delStr || lp.deliverables || '',
              ...(hasNewInclusions ? { editable_inclusions: editableInclusions, Team_Members_Included: teamMembersJson } : {}),
              ...(hasNewDeliverables ? { editable_deliverables: editableDeliverables, deliverables_descriptionn: deliverablesJson } : {}),
            };
          });

          await saveLeadPackages(selectedLead.lead_id, payloadToSave);
        }

        const updatedRemarks = appendCompletedStep(wizardLeadData.notes || '', 3);

        setWizardLeadData(prev => ({
          ...prev,
          budget: finalAmt,
          final_quoted_amount: finalAmt,
          status: 'Quotation Sent' as CurrentStage,
          remarks: updatedRemarks,
          deliverables: activeDeliverablesText,
          deliverables_description: activeDeliverablesText,
          Team_member: activeTeamMembersText,
          Team_Members: activeTeamMembersText,
          team_members: activeTeamMembersText
        }));
        await updateLead(leadObj.lead_id, {
          budget: finalAmt,
          status: 'Quotation Sent' as CurrentStage,
          package_price: finalBasePkgSum,
          deliverables_description: activeDeliverablesText,
          Team_member: activeTeamMembersText,
          Team_Members: activeTeamMembersText,
          team_members: activeTeamMembersText,
          notes_special_customizations: leadObj.notes_special_customizations,
          Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
          Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
          Final_Quotation_Amount: finalAmt,
          
          client_residence_address: leadObj.client_residence_address,
          city: leadObj.city,
          state: leadObj.state,
          pincode: leadObj.pincode,
          desired_event_shoot_type: leadObj.desired_event_shoot_type || leadObj.shoot_type,
          remarks: updatedRemarks,
          Select_Package_Option: leadObj.Select_Package_Option || ''
        });
        
        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            status: 'Quotation Sent' as CurrentStage,
            remarks: updatedRemarks
          };
        });
      } else {
        setCreateForm(prev => ({
          ...prev,
          budget: finalAmt
        }));
        setSalesStatus('Quotation Sent');
        await updateLead(createdLeadId!, {
          budget: finalAmt,
          status: 'Quotation Sent' as CurrentStage,
          package_price: finalBasePkgSum,
          deliverables_description: activeDeliverablesText,
          Team_member: activeTeamMembersText,
          Team_Members: activeTeamMembersText,
          team_members: activeTeamMembersText,
          notes_special_customizations: leadObj.notes_special_customizations,
          Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
          Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
          Final_Quotation_Amount: finalAmt,
          sales_staff_name: salesStaffName,
          sales_staff_mobile: salesStaffMobile,
          client_residence_address: leadObj.client_residence_address,
          city: leadObj.city,
          state: leadObj.state,
          pincode: leadObj.pincode,
          desired_event_shoot_type: leadObj.desired_event_shoot_type || leadObj.shoot_type,
          remarks: getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city),
            next_follow_up_date: followUpDate || null,
            follow_up_notes: internalNotes || null,
          Select_Package_Option: leadObj.Select_Package_Option || ''
        });
      }

      console.log("✔ Process completed");
      return finalQuoteNum;
    } catch (err: any) {
      showErrorHelper(
        "Quotation Save Failed",
        err.message || "Failed to save quotation data to the database.",
        "handleGenerateQuote()",
        isEdit && selectedLead ? selectedLead.lead_id : (createdLeadId || 'UNKNOWN'),
        "Check your network connection and ensure the lead data is valid.",
        err
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviewQuotePDF = async (isEdit: boolean) => {
    try {
      const effName = getEffectiveSalesStaffName();
      const effMobile = getEffectiveSalesStaffMobile();
      if (!salesStaffName || !salesStaffName.trim()) setSalesStaffName(effName);
      if (!salesStaffMobile || !salesStaffMobile.trim()) setSalesStaffMobile(effMobile);

      const leadObj = getLeadInfoForQuote(isEdit);

      // Re-fetch latest payment data for exact order to guarantee fresh, non-stale payment info
      try {
        const currentLeadId = isEdit ? (selectedLead?.lead_id || wizardLeadData.lead_id) : (selectedLead?.lead_id || createForm.lead_id || createdLeadId || '');
        const resolvedOrderId = leadObj.order_id || selectedLead?.order_id || '';
        const paymentData = await fetchAndResolveLatestPaymentData(
          currentLeadId,
          resolvedOrderId,
          paymentHistory,
          allOrders,
          allPayments,
          allLeads
        );
        if (paymentData.exactOrderId && !leadObj.order_id) {
          leadObj.order_id = paymentData.exactOrderId;
        }
        if (paymentData.hasAdvance || paymentData.advanceAmount > 0) {
          leadObj.advance_received = paymentData.advanceAmount;
          leadObj.advance_payment_received = paymentData.advanceAmount;
          leadObj.advance_collected = paymentData.advanceAmount;
          leadObj.is_order_confirmed = true;
        }
        if (paymentData.paymentsBreakdown && paymentData.paymentsBreakdown.length > 0) {
          leadObj.payments_breakdown = paymentData.paymentsBreakdown;
        }
        leadObj.total_paid_amount = paymentData.totalPaidAmount;
        leadObj.pending_amount = paymentData.pendingAmount;
        if (paymentData.totalPaidAmount > 0) {
          leadObj.is_order_confirmed = true;
        }
      } catch (pErr) {
        console.warn("Could not re-fetch payment data for preview, proceeding:", pErr);
      }

      const activePkgs = getSelectedPkgsInfo(isEdit);

      const missingFields = validateLeadForQuotation(leadObj, activePkgs);
      if (missingFields.length > 0) {
        showToastMsg(`Quotation Incomplete! Please enter the following fields: ${missingFields.join(', ')}`, "error");
        return;
      }

      let currentLogo = logoBase64;
      let currentAspect = logoAspectRatio;
      try {
        const logoUrl = 'https://aqifyxsimhqayfjwzzwj.supabase.co/storage/v1/object/public/img/logo%20(4)%20(1).png';
        const result = await getLogoBase64FromUrl(logoUrl);
        currentLogo = result.base64;
        currentAspect = result.aspect;
      } catch (e) {
        console.warn("Failed to wait-load logo for preview, using preloaded:", e);
      }

      const doc = generateQuotationPDF(
        leadObj,
        activePkgs,
        "",
        quotationTerms,
        currentLogo,
        currentAspect,
        editableInclusions,
        editableDeliverables,
        Number(quoteDiscount || 0),
        Number(quoteAdditional || 0),
        quoteServices
      );
      
      const blobUrl = doc.output('bloburl');
      setGeneratedPDFBlobUrl(blobUrl);
      window.open(blobUrl, '_blank');
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to preview PDF.");
    }
  };

  const handleDownloadQuotePDF = async (isEdit: boolean) => {
    try {
      console.log("✔ Generating PDF...");
      const leadObj = getLeadInfoForQuote(isEdit);

      // Re-fetch latest payment data for exact order to guarantee fresh, non-stale payment info
      try {
        const currentLeadId = isEdit ? (selectedLead?.lead_id || wizardLeadData.lead_id) : (selectedLead?.lead_id || createForm.lead_id || createdLeadId || '');
        const resolvedOrderId = leadObj.order_id || selectedLead?.order_id || '';
        const paymentData = await fetchAndResolveLatestPaymentData(
          currentLeadId,
          resolvedOrderId,
          paymentHistory,
          allOrders,
          allPayments,
          allLeads
        );
        if (paymentData.exactOrderId && !leadObj.order_id) {
          leadObj.order_id = paymentData.exactOrderId;
        }
        if (paymentData.hasAdvance || paymentData.advanceAmount > 0) {
          leadObj.advance_received = paymentData.advanceAmount;
          leadObj.advance_payment_received = paymentData.advanceAmount;
          leadObj.advance_collected = paymentData.advanceAmount;
          leadObj.is_order_confirmed = true;
        }
        if (paymentData.paymentsBreakdown && paymentData.paymentsBreakdown.length > 0) {
          leadObj.payments_breakdown = paymentData.paymentsBreakdown;
        }
        leadObj.total_paid_amount = paymentData.totalPaidAmount;
        leadObj.pending_amount = paymentData.pendingAmount;
        if (paymentData.totalPaidAmount > 0) {
          leadObj.is_order_confirmed = true;
        }
      } catch (pErr) {
        console.warn("Could not re-fetch payment data for PDF download, proceeding:", pErr);
      }

      const activePkgs = getSelectedPkgsInfo(isEdit);
      
      const doc = generateQuotationPDF(
        leadObj,
        activePkgs,
        "",
        quotationTerms,
        logoBase64,
        logoAspectRatio,
        editableInclusions,
        editableDeliverables,
        Number(quoteDiscount || 0),
        Number(quoteAdditional || 0),
        quoteServices
      );
      
      console.log("✔ PDF generated");
      const pdfFileName = generateQuotationPdfFileName(leadObj);
      doc.save(pdfFileName);
      
      showToastMsg("Quotation successfully generated!", "success");
    } catch (err: any) {
      showErrorHelper(
        "PDF Generation Failed",
        err.message || "jsPDF failed to render the quotation document.",
        "handleDownloadQuotePDF()",
        isEdit && selectedLead ? selectedLead.lead_id : (createdLeadId || 'UNKNOWN'),
        "Check console logs to see if there is an issue with the document template or variables.",
        err
      );
    }
  };

  const handleSendWhatsAppQuote = async (isEdit: boolean) => {
    try {
      console.log("✔ Generating PDF...");
      const leadObj = getLeadInfoForQuote(isEdit);

      // Re-fetch latest payment data for exact order to guarantee fresh, non-stale payment info
      try {
        const currentLeadId = isEdit ? (selectedLead?.lead_id || wizardLeadData.lead_id) : (selectedLead?.lead_id || createForm.lead_id || createdLeadId || '');
        const resolvedOrderId = leadObj.order_id || selectedLead?.order_id || '';
        const paymentData = await fetchAndResolveLatestPaymentData(
          currentLeadId,
          resolvedOrderId,
          paymentHistory,
          allOrders,
          allPayments,
          allLeads
        );
        if (paymentData.exactOrderId && !leadObj.order_id) {
          leadObj.order_id = paymentData.exactOrderId;
        }
        if (paymentData.hasAdvance || paymentData.advanceAmount > 0) {
          leadObj.advance_received = paymentData.advanceAmount;
          leadObj.advance_payment_received = paymentData.advanceAmount;
          leadObj.advance_collected = paymentData.advanceAmount;
          leadObj.is_order_confirmed = true;
        }
        if (paymentData.paymentsBreakdown && paymentData.paymentsBreakdown.length > 0) {
          leadObj.payments_breakdown = paymentData.paymentsBreakdown;
        }
        leadObj.total_paid_amount = paymentData.totalPaidAmount;
        leadObj.pending_amount = paymentData.pendingAmount;
        if (paymentData.totalPaidAmount > 0) {
          leadObj.is_order_confirmed = true;
        }
      } catch (pErr) {
        console.warn("Could not re-fetch payment data for WhatsApp quote, proceeding:", pErr);
      }

      const activePkgs = getSelectedPkgsInfo(isEdit);
      const finalAmt = dynamicFinalAmt;

      const doc = generateQuotationPDF(
        leadObj,
        activePkgs,
        "",
        quotationTerms,
        logoBase64,
        logoAspectRatio,
        editableInclusions,
        editableDeliverables,
        Number(quoteDiscount || 0),
        Number(quoteAdditional || 0),
        quoteServices
      );
      
      console.log("✔ PDF generated");
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      setGeneratedPDFBlobUrl(blobUrl);

      // Download the PDF automatically as requested
      const pdfFileName = generateQuotationPdfFileName(leadObj);
      doc.save(pdfFileName);

      console.log("✔ Opening WhatsApp...");
      const rawPhone = leadObj.whatsapp_number || leadObj.mobile || '';
      const phoneStr = typeof rawPhone === 'string' ? rawPhone : String(rawPhone);
      
      const safeCustomerName = String(leadObj.customer_name || '');
      let eventDetailsStr = '';
      if (leadObj.events && leadObj.events.length > 0) {
        eventDetailsStr = leadObj.events.map((ev) => {
          const eName = ev.event_name || ev.event_type || 'Event';
          const eDate = ev.event_date ? (formatDateDDMMYY(ev.event_date) || ev.event_date) : 'N/A';
          const eTime = ev.event_start_time ? convertTo12Hour(ev.event_start_time) : '';
          return `🎉 ${eName}\n📅 Date: ${eDate}${eTime ? ` | Time: ${eTime}` : ''}`;
        }).join('\n\n') + '\n';
      } else {
        const safeEventType = String(leadObj.event_type || 'Event');
        const safeEventDate = leadObj.event_date ? (formatDateDDMMYY(leadObj.event_date) || leadObj.event_date) : 'N/A';
        eventDetailsStr = `🎉 Event: ${safeEventType}\n📅 Event Date: ${safeEventDate}\n`;
      }

      const message = `Hello *${safeCustomerName}*,\n\n` +
        `Thank you for choosing *PhotoCrew Pictures*.\n\n` +
        `Please find your quotation details below:\n\n` +
        eventDetailsStr +
        `💰 Final Amount: ₹${finalAmt.toLocaleString('en-IN')}\n\n` +
        `Thank you.\nPhotoCrew Pictures`;

      const cleanPhone = phoneStr.replace(/[^0-9]/g, '');
      if (!cleanPhone) {
        showErrorHelper(
          "WhatsApp Redirect Failed",
          "Customer WhatsApp or mobile number is missing.",
          "handleSendWhatsAppQuote()",
          isEdit && selectedLead ? selectedLead.lead_id : (createdLeadId || 'UNKNOWN'),
          "Enter a valid mobile/WhatsApp number in Customer Details."
        );
        return;
      }
      const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');

      showToastMsg("Quotation downloaded and WhatsApp prepared!", "success");
      console.log("✔ Process completed");
    } catch (err: any) {
      showErrorHelper(
        "WhatsApp Redirect Failed",
        err.message || "Failed to prepare WhatsApp message or generate PDF.",
        "handleSendWhatsAppQuote()",
        isEdit && selectedLead ? selectedLead.lead_id : (createdLeadId || 'UNKNOWN'),
        "Check console logs to see if there is an issue with the document template or variables.",
        err
      );
    }
  };

  const handleSendEmailQuote = async (isEdit: boolean) => {
    try {
      const leadObj = getLeadInfoForQuote(isEdit);
      const activePkgs = getSelectedPkgsInfo(isEdit);
      const basePkgSum = dynamicBaseSum;
      const finalAmt = dynamicFinalAmt;
      
      const pkgNames = activePkgs.map(p => p.package_name).join(' + ') || 'Selected Package';
      const email = leadObj.email || '';
      
      const safeCustomerName = String(leadObj.customer_name || '');
      const safeEventType = String(leadObj.event_type || 'Event');

      const subject = `Photocrew Pictures - Custom Quotation Details`;
      const body = `Dear ${safeCustomerName},\n\n` +
        `Thank you for reach out to us! We are pleased to provide the custom quotation details for your upcoming ${safeEventType} shoot.\n\n` +
        `Selected Package: ${pkgNames}\n` +
        `Package Base Price: Rs. ${basePkgSum.toLocaleString('en-IN')}\n` +
        `Discount Applied: Rs. ${(quoteDiscount || 0).toLocaleString('en-IN')}\n` +
        `Final Quotation Amount: Rs. ${finalAmt.toLocaleString('en-IN')}\n\n` +
        `We will follow up shortly to discuss any specific adjustments you might need.\n\n` +
        `Warm regards,\n` +
        `The Photocrew Pictures Team\n` +
        `https://www.photocrewpictures.com/`;

      window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    } catch (err: any) {
      showToastMsg("Failed to open email client.", "error");
    }
  };

  const renderQuotationAndStep4Section = (isEdit: boolean) => {
    const activePkgs = getSelectedPkgsInfo(isEdit);
    const basePkgSum = dynamicBaseSum;
    const finalAmt = dynamicFinalAmt;
    const pkgNames = activePkgs.map(p => p.package_name).join(' + ') || 'Selected Package';

    const budgetValue = isEdit ? wizardLeadData.budget : createForm.budget;
    const setBudget = (val: number | '') => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, budget: val === '' ? 0 : val }));
      } else {
        setCreateForm(prev => ({ ...prev, budget: val }));
      }
    };

    const remarksValue = isEdit ? wizardLeadData.remarks : createForm.remarks;
    const setRemarks = (val: string) => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, remarks: val }));
      } else {
        setCreateForm(prev => ({ ...prev, remarks: val }));
      }
    };

    const notesValue = isEdit ? wizardLeadData.notes : internalNotes;
    const setNotes = (val: string) => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, notes: val }));
      } else {
        setInternalNotes(val);
      }
    };

    const followUpValue = isEdit ? wizardLeadData.next_follow_up_date : followUpDate;
    const setFollowUp = (val: string) => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, next_follow_up_date: val }));
      } else {
        setFollowUpDate(val);
      }
    };

    const leadValue = isEdit ? wizardLeadData.lead_value : createForm.lead_value;
    const setLeadValue = (val: number | '') => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, lead_value: val === '' ? 0 : val }));
      } else {
        setCreateForm(prev => ({ ...prev, lead_value: val }));
      }
    };

    const leadScore = isEdit ? wizardLeadData.lead_score : createForm.lead_score;
    const setLeadScore = (val: number | '') => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, lead_score: val === '' ? 0 : val }));
      } else {
        setCreateForm(prev => ({ ...prev, lead_score: val }));
      }
    };

    return (
      <div className="space-y-6">
        {/* Quotation Details */}
        <div className="bg-slate-900/50 border border-slate-805/40 rounded-xl p-4.5 space-y-3.5 shadow-sm">
          <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wide font-mono flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <span>📋</span> Quotation Details
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Package Amount (Editable Package Base Price) */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5 font-mono">
                <span>💰</span> Package Base Price (₹)
              </label>
              <input
                type="number"
                id={isEdit ? "input_section2_package_base_price" : "create_section2_package_base_price"}
                value={wizardLeadData.package_cost !== undefined && wizardLeadData.package_cost !== null ? wizardLeadData.package_cost : (basePkgSum !== undefined ? basePkgSum : '')}
                onChange={(e) => {
                  const rawVal = e.target.value;
                  const parsedNum = rawVal === '' ? 0 : Number(rawVal);
                  const currentPkg = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || 'Custom Package';
                  setWizardLeadData(prev => ({
                    ...prev,
                    package_cost: rawVal,
                    package_price: parsedNum,
                    budget: parsedNum,
                    final_quoted_amount: parsedNum
                  }));
                  if (currentPkg) {
                    setPkgPrices(prev => ({ ...prev, [currentPkg]: parsedNum }));
                  }
                }}
                onBlur={(e) => {
                  const rawVal = e.target.value;
                  const parsedNum = rawVal === '' ? 0 : Number(rawVal);
                  const currentPkg = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || 'Custom Package';
                  saveStep3DataRealtime(editableInclusions, editableDeliverables, currentPkg, parsedNum);
                }}
                placeholder="0"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg py-2 px-3 text-xs text-amber-300 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-all"
              />
            </div>

            {/* Discount */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Quotation Discount (₹)
              </label>
              <input
                type="number"
                value={quoteDiscount || ''}
                onChange={(e) => {
                  const rawVal = e.target.value;
                  const discNum = rawVal === '' ? 0 : Number(rawVal);
                  setQuoteDiscount(rawVal === '' ? 0 : discNum);
                  const currentPkg = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || 'Custom Package';
                  saveStep3DataRealtime(editableInclusions, editableDeliverables, currentPkg, undefined, discNum, quoteAdditional);
                }}
                placeholder="0"
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 font-mono transition-all"
              />
            </div>

            {/* Additional Services Cost - Hidden per user request */}
            <div className="hidden">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Additional Services Cost (₹)
              </label>
              <input
                type="number"
                value={quoteAdditional || ''}
                onChange={(e) => {
                  const rawVal = e.target.value;
                  const addNum = rawVal === '' ? 0 : Number(rawVal);
                  setQuoteAdditional(rawVal === '' ? 0 : addNum);
                  const currentPkg = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || 'Custom Package';
                  saveStep3DataRealtime(editableInclusions, editableDeliverables, currentPkg, undefined, quoteDiscount, addNum);
                }}
                placeholder="0"
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 font-mono transition-all"
              />
            </div>

            {/* Extra Charges */}

          </div>

          {/* Final Calculated Amount Badge */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between shadow-inner mt-2">
            <div className="space-y-0.5">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide font-mono">Final Quotation Amount</p>
              <p className="text-[9px] text-slate-500 font-mono">Formula: Base Price (₹{basePkgSum}) - Disc (₹{quoteDiscount || 0})</p>
            </div>
            <div className="text-right">
              <span className="text-lg font-extrabold text-amber-500 font-mono">
                ₹{finalAmt.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Action buttons directly under Quotation Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-slate-800/60">
            {/* Download PDF */}
            <button
              type="button"
              onClick={() => handleDownloadQuotePDF(isEdit)}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold bg-red-950/40 hover:bg-red-900/50 text-red-300 rounded-lg transition-all border border-red-900/40 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>📄</span> {isSaving ? 'Processing...' : 'Download PDF Document'}
            </button>

            {/* Send WhatsApp */}
            <button
              type="button"
              onClick={() => handleSendWhatsAppQuote(isEdit)}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 rounded-lg transition-all border border-emerald-900/40 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>💬</span> {isSaving ? 'Processing...' : 'Send Quotation via WhatsApp'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderStep3Workspace = (isEdit: boolean) => {
    const availablePkgs = (packages && packages.length > 0) ? packages : INITIAL_PACKAGES;
    const rawPkgId = isEdit
      ? (wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || selectedLead?.Select_Package_Option || '')
      : (wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || selectedPkgIds[0] || '');
    const currentPkgId = (rawPkgId && rawPkgId.trim() !== '') ? rawPkgId : 'Custom Package';

    let selectedPkg = availablePkgs.find(p => String(p.package_id) === String(currentPkgId) || String(p.package_name) === String(currentPkgId));
    if (!selectedPkg && currentPkgId) {
      selectedPkg = {
        package_id: currentPkgId,
        package_name: (currentPkgId === 'custom_package' || currentPkgId === 'Custom Package') ? 'Custom Package' : `Package ${currentPkgId}`,
        price: wizardLeadData.package_cost || 0,
        deliverables: wizardLeadData.deliverables || "",
        status: "Active"
      } as any;
    }
    const selectedPkgId = selectedPkg?.package_id || 'Custom Package';
    const inclusionsList = editableInclusions[selectedPkgId] || editableInclusions['Custom Package'] || editableInclusions['custom_package'] || (Object.values(editableInclusions).find(v => Array.isArray(v) && v.length > 0) || []);
    const deliverablesList = editableDeliverables[selectedPkgId] || editableDeliverables['Custom Package'] || editableDeliverables['custom_package'] || (Object.values(editableDeliverables).find(v => Array.isArray(v) && v.length > 0) || []);
    const currentEvents = isEdit ? crmEvents : createEvents;

    return (
      <div className="space-y-4 animate-fade-in text-left">
        <div className="space-y-3.5 text-left">
          <div className="flex items-center justify-between">
            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Select Package Option *</label>
            {step3AutoSaveStatus === 'saving' && (
              <span className="text-[10px] text-amber-400 font-mono font-semibold animate-pulse flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                Saving...
              </span>
            )}
            {step3AutoSaveStatus === 'saved' && (
              <span className="text-[10px] text-emerald-400 font-mono font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Saved ✓
              </span>
            )}
            {step3AutoSaveStatus === 'error' && (
              <span className="text-[10px] text-red-400 font-mono font-semibold flex items-center gap-1">
                Save failed
              </span>
            )}
          </div>
          <SearchablePackageSelect
            id="select_package_option"
            value={currentPkgId}
            onChange={(val) => {
              setSelectedPkgIds([val]);
              handlePackageDropdownChange(val);
            }}
            packages={availablePkgs}
            isLocked={isStep3Locked}
          />
          </div>

          {/* Sales Executive Details */}
          <div className="hidden bg-slate-900/50 border border-slate-805/40 rounded-lg p-3 space-y-2.5 shadow-sm mt-3">
            <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide font-mono flex items-center gap-1.5 border-b border-slate-800 pb-1">
              <span>👤</span> Sales Executive Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                  Sales Staff Name *
                </label>
                <input
                  id={isEdit ? "input_sales_staff_name" : "wizard_sales_staff_name"}
                  type="text"
                  required
                  value={salesStaffName}
                  onChange={(e) => setSalesStaffName(e.target.value)}
                  placeholder="E.g., Jane Doe"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 font-sans transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                  Sales Staff Mobile Number *
                </label>
                <input
                  id={isEdit ? "input_sales_staff_mobile" : "wizard_sales_staff_mobile"}
                  type="text"
                  required
                  value={salesStaffMobile}
                  onChange={(e) => setSalesStaffMobile(e.target.value)}
                  placeholder="E.g., 9876543210"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 font-mono transition-all"
                />
              </div>
            </div>
          </div>

          {/* Single Package Base Price (₹) Field (Hidden visually per request, keeping value intact internally) */}
          <div className="hidden" style={{ display: 'none' }}>
            <label className="block text-[11px] font-bold text-amber-400 uppercase tracking-wide font-mono flex items-center gap-1.5">
              <span>💰</span> Package Base Price (₹) *
            </label>
            <input
              type="number"
              value={wizardLeadData.package_cost !== undefined && wizardLeadData.package_cost !== null ? wizardLeadData.package_cost : (selectedPkg?.price || '')}
              onChange={(e) => {
                const val = e.target.value;
                const numVal = val === '' ? 0 : Number(val);
                setWizardLeadData(prev => ({
                  ...prev,
                  package_cost: val,
                  package_price: numVal,
                  budget: numVal,
                  final_quoted_amount: numVal
                }));
                saveStep3DataRealtime(editableInclusions, editableDeliverables, wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option, numVal);
              }}
              placeholder="Enter package base price..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-amber-300 font-mono font-bold"
              required
            />
          </div>

          {/* Event-Wise Configuration or Single Configuration */}
          <div>
            {currentEvents && currentEvents.length > 0 ? (
              currentEvents.map((event, eventIdx) => {
                const eventKey = `${selectedPkgId}_${event.id}`;
                const nameKey = `${selectedPkgId}_${event.event_name || event.event_type || 'Unnamed Event'}`;
                const customKey = `Custom Package_${event.id}`;
                const customNameKey = `Custom Package_${event.event_name || event.event_type || 'Unnamed Event'}`;
                const customLowerKey = `custom_package_${event.id}`;
                const customLowerNameKey = `custom_package_${event.event_name || event.event_type || 'Unnamed Event'}`;

                const isMulti = currentEvents && currentEvents.length > 1;
                const evId = String(event.id || event.event_id || `EV-${eventIdx + 1}`);
                const eventKey = `${selectedPkgId}_${evId}`;
                const altKey = `Custom Package_${evId}`;
                const customKey = `custom_package_${evId}`;

                const directTm = event.team_members || event.inclusions || event.Team_Members || event.team_members_included;
                const parsedDirectTm = directTm ? (Array.isArray(directTm) ? directTm.map((m: any) => {
                  const { qty, text } = parseQtyAndText(m);
                  return text ? combineQtyAndText(qty, text) : '';
                }).filter(Boolean) : null) : null;

                const eventInclusions = editableInclusions[eventKey] !== undefined
                  ? editableInclusions[eventKey]
                  : (editableInclusions[altKey] !== undefined
                      ? editableInclusions[altKey]
                      : (editableInclusions[customKey] !== undefined
                          ? editableInclusions[customKey]
                          : (editableInclusions[evId] !== undefined
                              ? editableInclusions[evId]
                              : (parsedDirectTm !== null
                                  ? parsedDirectTm
                                  : (isMulti ? [] : (inclusionsList.length > 0 ? [...inclusionsList] : []))))));

                const directDel = event.deliverables || event.deliverables_list || event.Add_Deliverable || event.deliverables_description;
                const parsedDirectDel = directDel ? (Array.isArray(directDel) ? directDel.map((d: any) => {
                  const { qty, text } = parseQtyAndText(d);
                  return text ? combineQtyAndText(qty, text) : '';
                }).filter(Boolean) : null) : null;

                const eventDeliverables = editableDeliverables[eventKey] !== undefined
                  ? editableDeliverables[eventKey]
                  : (editableDeliverables[altKey] !== undefined
                      ? editableDeliverables[altKey]
                      : (editableDeliverables[customKey] !== undefined
                          ? editableDeliverables[customKey]
                          : (editableDeliverables[evId] !== undefined
                              ? editableDeliverables[evId]
                              : (parsedDirectDel !== null
                                  ? parsedDirectDel
                                  : (isMulti ? [] : (deliverablesList.length > 0 ? [...deliverablesList] : []))))));

                const updateInclusionsForEvent = (newList: string[]) => {
                  const updated = {
                    ...editableInclusions,
                    [eventKey]: newList,
                    [altKey]: newList,
                    [customKey]: newList,
                    [evId]: newList
                  };
                  if (!isMulti) {
                    updated[selectedPkgId] = newList;
                    updated['Custom Package'] = newList;
                    updated['custom_package'] = newList;
                  }
                  setEditableInclusions(updated);
                  if (crmEvents && crmEvents.length > 0) {
                    setCrmEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, team_members: newList, inclusions: newList } : e)));
                  }
                  if (createEvents && createEvents.length > 0) {
                    setCreateEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, team_members: newList, inclusions: newList } : e)));
                  }
                  saveStep3DataRealtime(updated, editableDeliverables);
                };

                const updateDeliverablesForEvent = (newList: string[]) => {
                  const updated = {
                    ...editableDeliverables,
                    [eventKey]: newList,
                    [altKey]: newList,
                    [customKey]: newList,
                    [evId]: newList
                  };
                  if (!isMulti) {
                    updated[selectedPkgId] = newList;
                    updated['Custom Package'] = newList;
                    updated['custom_package'] = newList;
                  }
                  setEditableDeliverables(updated);
                  if (crmEvents && crmEvents.length > 0) {
                    setCrmEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, deliverables: newList, deliverables_list: newList } : e)));
                  }
                  if (createEvents && createEvents.length > 0) {
                    setCreateEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, deliverables: newList, deliverables_list: newList } : e)));
                  }
                  saveStep3DataRealtime(editableInclusions, updated);
                };

                const startDateStr = formatDDMMYYYY(event.event_start_date || event.event_date);
                const endDateRaw = event.event_end_date || (event as any).Event_End_Date || '';
                const endDateStr = endDateRaw ? formatDDMMYYYY(endDateRaw) : 'N/A';
                const startTimeStr = event.event_start_time ? convertTo12Hour(event.event_start_time) : 'N/A';
                const endTimeStr = event.event_end_time ? convertTo12Hour(event.event_end_time) : 'N/A';
                const guestPaxVal = event.guest_pax !== '' && event.guest_pax !== null && event.guest_pax !== undefined ? event.guest_pax : 'N/A';
                const isMulti = currentEvents && currentEvents.length > 1;
                const specificEventLocation = (event.event_location || (event as any).location || (event as any).venue_address || (event as any).venue || (event as any).event_venue || '').trim();
                const eventLocationDisplay = specificEventLocation || (!isMulti ? (wizardLeadData.event_location || selectedLead?.event_location || 'N/A') : 'N/A');

                return (
                  <div key={event.id || eventIdx} className="bg-slate-900/25 border border-slate-800/60 p-4 rounded-xl space-y-4 mt-3 mb-4">
                    {/* VERY SMALL COMPACT EVENT SUMMARY */}
                    <div className="bg-slate-950/60 border border-slate-800/70 p-2.5 sm:p-3 rounded-lg text-left font-mono">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs sm:text-sm font-bold text-slate-100 font-sans">
                          {event.event_name || `Event ${eventIdx + 1}`}
                        </span>
                        {event.event_type && (
                          <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono font-bold border border-slate-700">
                            [{event.event_type}]
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-300 leading-tight flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span>
                          Start: <span className="text-slate-100 font-semibold">{startDateStr}{startTimeStr !== 'N/A' ? ` | ${startTimeStr}` : ''}</span>
                        </span>
                        {(endDateRaw || endTimeStr !== 'N/A') && (
                          <>
                            <span className="text-slate-500">•</span>
                            <span>
                              End: <span className="text-slate-100 font-semibold">{endDateStr !== 'N/A' ? endDateStr : startDateStr}{endTimeStr !== 'N/A' ? ` | ${endTimeStr}` : ''}</span>
                            </span>
                          </>
                        )}
                        <span className="text-slate-500">•</span>
                        <span>
                          Guest Pax: <span className="text-slate-100 font-semibold">{guestPaxVal}</span>
                        </span>
                      </div>
                      <div className="mt-2 pt-1.5 border-t border-slate-800/60 text-[11px] text-slate-300">
                        <span className="text-slate-400 font-semibold uppercase font-mono text-[10px] mr-1.5">
                          Event Address:
                        </span>
                        <span className="text-slate-100 font-medium break-words font-sans">
                          {eventLocationDisplay}
                        </span>
                      </div>
                    </div>

                    {/* Team Members Included */}
                    <div>
                      <div className="mb-2">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Team Members Included</label>
                      </div>
                      {eventInclusions.length === 0 ? (
                        <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                          <p className="text-xs text-zinc-500 italic">No team members added yet.</p>
                          <button
                            type="button"
                            onClick={() => {
                              const currentList = [...eventInclusions];
                              currentList.push("");
                              updateInclusionsForEvent(currentList);
                            }}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                          >
                            + Add Member
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {eventInclusions.map((item, idx) => (
                            <CompactQtyItemRow
                              key={idx}
                              value={item}
                              options={activeMasterRoles}
                              placeholder="Type or select Role / Team Member..."
                              accentColor="indigo"
                              onChange={(newVal) => {
                                const currentList = [...eventInclusions];
                                currentList[idx] = newVal;
                                updateInclusionsForEvent(currentList);
                              }}
                              onDelete={() => {
                                const currentList = [...eventInclusions];
                                currentList.splice(idx, 1);
                                updateInclusionsForEvent(currentList);
                              }}
                            />
                          ))}
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                const currentList = [...eventInclusions];
                                currentList.push("");
                                updateInclusionsForEvent(currentList);
                              }}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                            >
                              + Add Member
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Deliverables Description / Base Package Deliverables */}
                    <div>
                      <div className="mb-2">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Deliverables Description / Base Package Deliverables</label>
                      </div>
                      {eventDeliverables.length === 0 ? (
                        <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                          <p className="text-xs text-zinc-500 italic">No deliverables added yet.</p>
                          <button
                            type="button"
                            onClick={() => {
                              const currentList = [...eventDeliverables];
                              currentList.push("");
                              updateDeliverablesForEvent(currentList);
                            }}
                            className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                          >
                            + Add Deliverable
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {eventDeliverables.map((item, idx) => (
                            <CompactQtyItemRow
                              key={idx}
                              value={item}
                              options={activeMasterDeliverables}
                              placeholder="Type or select Deliverable..."
                              accentColor="emerald"
                              onChange={(newVal) => {
                                const currentList = [...eventDeliverables];
                                currentList[idx] = newVal;
                                updateDeliverablesForEvent(currentList);
                              }}
                              onDelete={() => {
                                const currentList = [...eventDeliverables];
                                currentList.splice(idx, 1);
                                updateDeliverablesForEvent(currentList);
                              }}
                            />
                          ))}
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                const currentList = [...eventDeliverables];
                                currentList.push("");
                                updateDeliverablesForEvent(currentList);
                              }}
                              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                            >
                              + Add Deliverable
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-slate-900/25 border border-slate-800/60 p-4 rounded-xl space-y-4 mt-3 mb-4">
                {/* Single Team Members Included */}
                <div>
                  <div className="mb-2">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Team Members Included</label>
                  </div>
                  {inclusionsList.length === 0 ? (
                    <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                      <p className="text-xs text-zinc-500 italic">No team members added yet.</p>
                      <button
                        type="button"
                        onClick={() => {
                          const currentList = [...inclusionsList];
                          currentList.push("");
                          const updated = {
                            ...editableInclusions,
                            [selectedPkgId]: currentList
                          };
                          setEditableInclusions(updated);
                          saveStep3DataRealtime(updated, editableDeliverables);
                        }}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                      >
                        + Add Member
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {inclusionsList.map((item, idx) => (
                        <CompactQtyItemRow
                          key={idx}
                          value={item}
                          options={activeMasterRoles}
                          placeholder="Type or select Role / Team Member..."
                          accentColor="indigo"
                          onChange={(newVal) => {
                            const currentList = [...inclusionsList];
                            currentList[idx] = newVal;
                            const updated = {
                              ...editableInclusions,
                              [selectedPkgId]: currentList
                            };
                            setEditableInclusions(updated);
                            saveStep3DataRealtime(updated, editableDeliverables);
                          }}
                          onDelete={() => {
                            const currentList = [...inclusionsList];
                            currentList.splice(idx, 1);
                            const updated = {
                              ...editableInclusions,
                              [selectedPkgId]: currentList
                            };
                            setEditableInclusions(updated);
                            saveStep3DataRealtime(updated, editableDeliverables);
                          }}
                        />
                      ))}
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const currentList = [...inclusionsList];
                            currentList.push("");
                            const updated = {
                              ...editableInclusions,
                              [selectedPkgId]: currentList
                            };
                            setEditableInclusions(updated);
                            saveStep3DataRealtime(updated, editableDeliverables);
                          }}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                        >
                          + Add Member
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Single Deliverables */}
                <div>
                  <div className="mb-2">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Deliverables Description / Base Package Deliverables</label>
                  </div>
                  {deliverablesList.length === 0 ? (
                    <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                      <p className="text-xs text-zinc-500 italic">No deliverables added yet.</p>
                      <button
                        type="button"
                        onClick={() => {
                          const currentList = [...deliverablesList];
                          currentList.push("");
                          const updated = {
                            ...editableDeliverables,
                            [selectedPkgId]: currentList
                          };
                          setEditableDeliverables(updated);
                          saveStep3DataRealtime(editableInclusions, updated);
                        }}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                      >
                        + Add Deliverable
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {deliverablesList.map((item, idx) => (
                        <CompactQtyItemRow
                          key={idx}
                          value={item}
                          options={activeMasterDeliverables}
                          placeholder="Type or select Deliverable..."
                          accentColor="emerald"
                          onChange={(newVal) => {
                            const currentList = [...deliverablesList];
                            currentList[idx] = newVal;
                            const updated = {
                              ...editableDeliverables,
                              [selectedPkgId]: currentList
                            };
                            setEditableDeliverables(updated);
                            saveStep3DataRealtime(editableInclusions, updated);
                          }}
                          onDelete={() => {
                            const currentList = [...deliverablesList];
                            currentList.splice(idx, 1);
                            const updated = {
                              ...editableDeliverables,
                              [selectedPkgId]: currentList
                            };
                            setEditableDeliverables(updated);
                            saveStep3DataRealtime(editableInclusions, updated);
                          }}
                        />
                      ))}
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const currentList = [...deliverablesList];
                            currentList.push("");
                            const updated = {
                              ...editableDeliverables,
                              [selectedPkgId]: currentList
                            };
                            setEditableDeliverables(updated);
                            saveStep3DataRealtime(editableInclusions, updated);
                          }}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                        >
                          + Add Deliverable
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        <div className="mt-4 flex justify-end pb-2">
          <button
            type="button"
            onClick={handleSavePackageOnly}
            disabled={isSaving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold uppercase tracking-wider rounded-lg shadow transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving Package...' : 'Save Package'}
          </button>
        </div>

        {renderQuotationAndStep4Section(isEdit)}
      </div>
    );
  };

  useEffect(() => {
    let isMounted = true;

    const fetchReportingData = async () => {
       if (!selectedLead?.lead_id) return;
       try {
          if (!supabaseClient) return;
          const { data, error } = await supabaseClient
             .from('order_event_reporting')
             .select('*')
             .eq('lead_id', selectedLead.lead_id);
          
          if (error) {
             console.error("Failed to load order_event_reporting data", error);
             return;
          }

          if (isMounted && data && data.length > 0) {
             const first = data[0];
             setWizardLeadData(prev => ({
                ...prev,
                confirmed_event_date: first.confirmed_event_date || prev.confirmed_event_date,
                confirmed_event_time: first.confirmed_event_time || prev.confirmed_event_time,
                final_amount: first.contract_final_amount || prev.final_amount,
                advance_received: (first.advance_payment_received !== undefined && first.advance_payment_received !== null && first.advance_payment_received !== '') ? Number(first.advance_payment_received) : prev.advance_received,
             }));

             setCrmEvents(prev => prev.map(ev => {
                const rep = data.find(r => r.event_id === ev.id);
                if (rep) {
                   return {
                      ...ev,
                      reporting_date: rep.reporting_date || ev.reporting_date,
                      reporting_time: rep.reporting_time || ev.reporting_time
                   };
                }
                return ev;
             }));
          }
       } catch (err) {
          console.error("Error loading reporting data", err);
       }
    };

    fetchReportingData();
    
    return () => { isMounted = false; };
  }, [selectedLead?.lead_id, supabaseClient]);

  // Sync wizardLeadData.advance_received and wizardLeadData.final_amount with latest payment and order confirmation data
  const prevSalesLeadSyncRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!selectedLead?.lead_id) {
      prevSalesLeadSyncRef.current = null;
      return;
    }
    if (prevSalesLeadSyncRef.current === selectedLead.lead_id) return;
    prevSalesLeadSyncRef.current = selectedLead.lead_id;
    const linkedOrder = orders?.find(o => o.lead_id === selectedLead.lead_id);
    const linkedPayment = linkedOrder ? payments?.find(p => p.order_id === linkedOrder.order_id) : null;
    
    if (linkedOrder || linkedPayment) {
      setWizardLeadData(prev => {
        const latestAdvance = linkedPayment ? ((linkedPayment.advance_received || 0) + (linkedPayment.final_payment_received || 0)) : (linkedOrder ? (linkedOrder.advance_received || 0) : prev.advance_received);
        const latestFinalAmount = linkedOrder ? (linkedOrder.quotation_amount || 0) : prev.final_amount;
        
        return {
          ...prev,
          advance_received: latestAdvance,
          final_amount: latestFinalAmount
        };
      });
    }
  }, [selectedLead?.lead_id]);

  // Handle lead select
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.role === 'sales' || e.detail?.role === 'owner' || !e.detail?.role) {
        const leadId = e.detail?.leadId || e.detail?.lead_id;
        const orderId = e.detail?.orderId || e.detail?.order_id;
        const targetLead = leads.find(
          l => (leadId && (l.lead_id === leadId || l.order_id === leadId)) ||
               (orderId && (l.lead_id === orderId || l.order_id === orderId)) ||
               (l.events && l.events.some(ev => ev.id === leadId || ev.id === orderId))
        );
        if (targetLead) {
          handleSelectLead(targetLead);
        }
      }
    };
    window.addEventListener('calendar-action-click-deferred', handler);
    window.addEventListener('calendar-action-click', handler);
    return () => {
      window.removeEventListener('calendar-action-click-deferred', handler);
      window.removeEventListener('calendar-action-click', handler);
    };
  }, [leads]);
  
  const handleSelectLead = async (lead: Lead, targetStep?: number) => {
    let fullLead = lead;
    if (supabaseClient && lead.lead_id && lead.lead_id !== 'DRAFT-LEAD') {
      try {
        const { data: dbLead, error: dbLeadErr } = await supabaseClient
          .from('leads')
          .select('*')
          .eq('lead_id', lead.lead_id)
          .maybeSingle();
        
        if (!dbLeadErr && dbLead) {
          const directLostReason = dbLead.Lost_Reason || dbLead.lost_reason || lead.Lost_Reason || (lead as any).lost_reason || '';
          const directLostNotes = dbLead.Lost_Notes || dbLead.lost_notes || lead.Lost_Notes || (lead as any).lost_notes || '';
          fullLead = {
            ...lead,
            ...dbLead,
            Lost_Reason: directLostReason,
            lost_reason: directLostReason,
            Lost_Notes: directLostNotes,
            lost_notes: directLostNotes
          };
        }
      } catch (err) {
        console.warn("Failed to fetch full lead details on select", err);
      }
    }

    // If lost lead, ensure clean reason and notes without dirty metadata
    if (['Lost Lead', 'Lead Lost', 'Lost'].includes(fullLead.status || (fullLead as any).current_status || '')) {
      const { reason: cleanR, notes: cleanN } = getStrictLostReasonAndNotes(fullLead);
      fullLead.Lost_Reason = cleanR;
      fullLead.lost_reason = cleanR;
      fullLead.Lost_Notes = cleanN;
      fullLead.lost_notes = cleanN;
    }

    setSelectedLead(fullLead);
    setCrmEvents(fullLead.events || []);

    // Always fetch fresh events to ensure no cached EV- IDs are used
    let eventsForCheck = fullLead.events || [];
    if (supabaseClient && fullLead.lead_id && fullLead.lead_id !== 'DRAFT-LEAD') {
      try {
        const { data: freshEvents, error } = await supabaseClient
          .from('lead_events')
          .select('*')
          .eq('lead_id', fullLead.lead_id)
          .order('created_at', { ascending: true });
        
        if (!error && freshEvents && freshEvents.length > 0) {
          setCrmEvents(freshEvents as LeadEvent[]);
          eventsForCheck = freshEvents as LeadEvent[];
          setSelectedLead(prev => prev ? { ...prev, events: freshEvents as LeadEvent[] } : prev);
        }
      } catch (err) {
        console.warn("Failed to load fresh events on selection", err);
      }
    }

    setGeneratedPDFBlobUrl('');
    setActiveQuoteNum('');
    setQuoteDiscount(0);
    setQuoteAdditional(0);
    // Explicitly reset only when switching to a different lead ID
    if (!selectedLead || selectedLead.lead_id !== lead.lead_id) {
      setEditableInclusions({});
      setEditableDeliverables({});
      lastLoadedLeadIdRef.current = null;
    }
    // Clean and set Sales Executive Details (isolated from Operations/Production staff on events)
    const initialSalesStaffName = getCleanSalesStaffName(lead.sales_staff_name, lead);
    const initialSalesStaffMobile = getCleanSalesStaffMobile(lead.sales_staff_mobile, lead);
    setSalesStaffName(initialSalesStaffName);
    setSalesStaffMobile(initialSalesStaffMobile);

    const activePackages = (leadPackages || []).filter(lp => lp.lead_id === lead.lead_id);
    const primaryLP = activePackages[0];
    
    // Find the latest quotation for this lead if it exists
    const latestQuote = [...(quotations || [])]
      .filter(q => q.lead_id === lead.lead_id)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

    // Determine the target CRM step based on persisted data and status
    const hasQuotationOrPackage = !!(
      latestQuote ||
      primaryLP?.package_id ||
      (fullLead.Select_Package_Option && String(fullLead.Select_Package_Option).trim() !== '') ||
      ['Quotation Sent', 'Negotiation', 'Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed', 'Lost Lead'].includes(fullLead.status || '') ||
      ['Quotation Sent', 'Negotiation', 'Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed', 'Lost Lead'].includes((fullLead as any).current_status || '')
    );

    const hasCustomerDetails = !!(
      (fullLead.customer_name && String(fullLead.customer_name).trim() !== '') ||
      (fullLead.mobile && String(fullLead.mobile).trim() !== '')
    );

    const localSavedStep = localStorage.getItem(`crm_last_step_${lead.lead_id}`);
    const remarksMatch = fullLead.remarks?.match(/\[CRM_COMPLETED_STEP:\s*(\d+)\]/);
    const localStepVal = localSavedStep && !isNaN(parseInt(localSavedStep, 10)) ? parseInt(localSavedStep, 10) : 0;
    const remarksStepVal = remarksMatch && !isNaN(parseInt(remarksMatch[1], 10)) ? parseInt(remarksMatch[1], 10) : 0;
    const explicitStep = Math.max(localStepVal, remarksStepVal) || null;

    const isConfirmedLead = ['Confirm Order', 'Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed'].includes(fullLead.status || '') || (fullLead as any).current_status === 'Order Confirmed' || (fullLead as any).booking_status === 'Confirmed' || orders.some(o => o.lead_id === fullLead.lead_id && o.status !== 'Cancelled');
    const isUnlockedLead = unlockRequests.some(r => (r.lead_id === fullLead.lead_id || r.order_id === fullLead.lead_id || r.project_id === fullLead.lead_id) && (r.status === 'Approved' || r.request_status === 'Approved')) || unlockedRecords.some(r => r.recordId === fullLead.lead_id && r.module === 'Sales');

    // Navigation logic: always open first incomplete step. If lead is unlocked, open Step 3.
    let startStep = 1;
    if (isConfirmedLead && isUnlockedLead) {
      startStep = 3;
    } else if (explicitStep) {
      if (explicitStep >= 2) startStep = 3;
      else if (explicitStep === 1) startStep = 2;
    } else {
      if (hasQuotationOrPackage) startStep = 3;
      else if (hasCustomerDetails) startStep = 2;
      else startStep = 1;
    }

    const finalStep = targetStep || startStep;
    const completedStep = Math.max(finalStep === 3 ? 3 : (startStep === 3 ? (hasQuotationOrPackage ? 3 : 2) : startStep - 1), explicitStep || 1);
    setCrmHighestStep(completedStep);
    setCrmWizardStep(finalStep);
    
    const hasPackageAnywhere = !!(lead.Select_Package_Option || primaryLP?.package_id || latestQuote?.package_id);
    if (completedStep >= 3 || hasPackageAnywhere) {
    } else {
    }

    setQuoteDiscount(fullLead.Quotation_Discount ?? latestQuote?.discount_amount ?? 0);
    setQuoteAdditional(fullLead.Additional_Services_Cost ?? latestQuote?.additional_services_cost ?? 0);
    if (latestQuote) {
      setActiveQuoteNum(latestQuote.quotation_number || '');
      const quoteSalesName = getCleanSalesStaffName(latestQuote.sales_staff_name || lead.sales_staff_name, lead);
      const quoteSalesMobile = getCleanSalesStaffMobile(latestQuote.sales_staff_mobile || lead.sales_staff_mobile, lead);
      setSalesStaffName(quoteSalesName);
      setSalesStaffMobile(quoteSalesMobile);
    }

    const matchedPkgId = fullLead.Select_Package_Option || latestQuote?.package_id || primaryLP?.package_id || 'Custom Package';
    const matchedPkg = (packages || []).find(p => p.package_id === matchedPkgId);

    // 1. Load Deliverables
    const rawDelData = fullLead.Add_Deliverable || primaryLP?.deliverables_descriptionn || primaryLP?.editable_deliverables || fullLead.deliverables_description || latestQuote?.deliverables_description || matchedPkg?.deliverables;
    if (rawDelData) {
      const newDeliverables = parseDeliverablesJsonToRecord(rawDelData, matchedPkgId, fullLead.events || crmEvents);
      setEditableDeliverables(newDeliverables);
    } else {
      setEditableDeliverables({});
    }

    // 2. Load Team Members
    const rawTeamData = fullLead.Team_Members || fullLead.Team_member || (fullLead as any)?.team_members || primaryLP?.Team_Members_Included || primaryLP?.editable_inclusions || matchedPkg?.team_members;
    console.log('TEAM MEMBERS LOADED in openCRMModal', { leadId: fullLead.lead_id, Team_Members: rawTeamData });
    if (rawTeamData) {
      const newInclusions = parseTeamMembersJsonToRecord(rawTeamData, matchedPkgId, fullLead.events || crmEvents);
      setEditableInclusions(newInclusions);
    } else {
      setEditableInclusions({});
    }

    const firstEvent = fullLead.events && fullLead.events.length > 0 ? fullLead.events[0] : null;
    const evName = firstEvent?.event_name || fullLead.custom_event_name || '';
    const evShootType = firstEvent?.event_shoot_type || fullLead.desired_event_shoot_type || fullLead.shoot_type || '';
    const evDate = firstEvent?.event_date || fullLead.event_date || '';
    const evStartDate = firstEvent?.event_start_date || fullLead.event_date || '';
    const evEndDate = firstEvent?.event_end_date || (firstEvent as any)?.Event_End_Date || fullLead.Event_End_Date || '';
    const evLocation = firstEvent?.event_location || fullLead.event_location || '';
    const evGuestPax = firstEvent?.guest_pax ?? fullLead.guest_pax ?? fullLead.total_pax ?? '';
    const evStaffPax = firstEvent?.staff_pax ?? fullLead.staff_pax ?? '';
    setInternalNotes(fullLead.follow_up_notes || '');
    setFollowUpDate(fullLead.next_follow_up_date || '');
    
    const cleanPkgPrice = (fullLead.package_price && Number(fullLead.package_price) > 0)
      ? Number(fullLead.package_price)
      : ((primaryLP?.package_cost && Number(primaryLP.package_cost) > 0)
        ? Number(primaryLP.package_cost)
        : ((latestQuote?.package_price && Number(latestQuote.package_price) > 0)
          ? Number(latestQuote.package_price)
          : (fullLead.budget && Number(fullLead.budget) > 0
            ? Number(fullLead.budget)
            : (matchedPkg ? Number(matchedPkg.price) : 0))));
    
    setWizardLeadData({
      customer_name: fullLead.customer_name || '',
      mobile: fullLead.mobile ? String(fullLead.mobile) : '',
      whatsapp_number: fullLead.whatsapp_number ? String(fullLead.whatsapp_number) : (fullLead.mobile ? String(fullLead.mobile) : ''),
      email: fullLead.email || '',
      address: fullLead.address || '',
      city: latestQuote?.city || fullLead.city || '',
      state: latestQuote?.state || fullLead.state || '',
      pincode: latestQuote?.pincode || fullLead.pincode || '',
      client_residence_address: latestQuote?.client_residence_address || fullLead.client_residence_address || '',
      desired_event_shoot_type: latestQuote?.desired_event_shoot_type || fullLead.desired_event_shoot_type || '',
      // Step 2
      event_type: fullLead.event_type || '',
      custom_event_name: fullLead.custom_event_name || '',
      event_name: evName,
      event_shoot_type: evShootType,
      event_date: evDate,
      event_start_date: evStartDate,
      event_end_date: evEndDate,
      event_time: fullLead.event_time || '',
      reporting_time: fullLead.reporting_time || '',
      event_location: evLocation,
      guest_pax: evGuestPax,
      staff_pax: evStaffPax,
      lead_source: fullLead.lead_source || '',
      Specify_Custom_Lead_Source_Name: fullLead.Specify_Custom_Lead_Source_Name || '',
      shoot_type: evShootType,
      // Step 3
      selected_package_id: matchedPkgId || 'Custom Package',
      Select_Package_Option: matchedPkgId || 'Custom Package',
      package_cost: cleanPkgPrice || '',
      package_price: cleanPkgPrice || '',
      deliverables: typeof rawDelData === 'string' ? rawDelData : JSON.stringify(rawDelData || ''),
      deliverables_description: typeof rawDelData === 'string' ? rawDelData : JSON.stringify(rawDelData || ''),
      notes_special_customizations: fullLead.notes_special_customizations || latestQuote?.notes_special_customizations || primaryLP?.notes_special_customizations || '',
      notes: fullLead.remarks || '',
      // Step 4
      budget: cleanPkgPrice || fullLead.budget || latestQuote?.quotation_amount || 0,
      final_quoted_amount: fullLead.Final_Quotation_Amount ?? latestQuote?.final_amount ?? (primaryLP ? Number(primaryLP.final_amount) : 0),
      remarks: fullLead.remarks || '',
      next_follow_up_date: '',
      // Step 5
      status: fullLead.status || 'New Lead',
      Lost_Reason: fullLead.Lost_Reason || (fullLead as any).lost_reason || '',
      lost_reason: fullLead.lost_reason || fullLead.Lost_Reason || '',
      Lost_Notes: fullLead.Lost_Notes || (fullLead as any).lost_notes || '',
      lost_notes: fullLead.lost_notes || fullLead.Lost_Notes || '',
      // Order Confirmed Rule fields
      confirmed_event_date: fullLead.booking_date || fullLead.event_date || '',
      confirmed_event_time: fullLead.booking_time || fullLead.event_time || '',
      final_amount: (fullLead.Final_Package_Amount !== null && fullLead.Final_Package_Amount !== undefined && !isNaN(Number(fullLead.Final_Package_Amount)) && Number(fullLead.Final_Package_Amount) > 0)
        ? Number(fullLead.Final_Package_Amount)
        : (Number(fullLead.final_package_amount) || Number(fullLead.Final_Quotation_Amount) || (Number((fullLead as any).final_amount) > 0 ? Number((fullLead as any).final_amount) : 0)),
      advance_received: (fullLead.advance_collected !== undefined && fullLead.advance_collected !== null && fullLead.advance_collected !== '') ? Number(fullLead.advance_collected) : 0,
      total_pax: fullLead.total_pax || 0,
      reference_source: fullLead.reference_source || '',
      lead_value: fullLead.lead_value || 0,
      lead_score: fullLead.lead_score || 0,
      booking_status: fullLead.booking_status || 'Pending',
    });

    setFollowUpForm({
      call_notes: lead.follow_up_notes || '',
      next_follow_up_date: '',
      status: lead.status,
      quotation_amount: 0,
      negotiation_notes: '',
      event_date: lead.event_date || '',
      event_time: lead.event_time || '',
      reporting_time: lead.reporting_time || '08:00',
      advance_received: 0,
      payment_mode: 'UPI',
    });
    setConfirmForm({
      package_name: packages?.find((p) => String(p.package_id) === String(lead.Select_Package_Option))?.package_name || lead.Select_Package_Option || '',
      quotation_amount: Number(fullLead.Final_Package_Amount) || Number((fullLead as any).final_package_amount) || Number(fullLead.Final_Quotation_Amount) || Number((fullLead as any).final_amount) || (Number(wizardLeadData.final_amount) > 0 ? Number(wizardLeadData.final_amount) : 0),
      advance_received: 0,
      event_date: lead.event_date || '',
      event_time: lead.event_time || '',
      payment_mode: 'UPI',
      notes: '',
    });
  };

  const handlePackageDropdownChange = (packageId: string) => {
    if (isStep3Locked) {
      showToastMsg("Quotation details are locked. Owner unlock approval required to edit.", "error");
      return;
    }

    const activeEvents = activeTab === 'create' ? createEvents : crmEvents;
    
    // Auto save by logged in sales user
    if (currentUser) {
      setSalesStaffName(currentUser.name || '');
      setSalesStaffMobile(currentUser.mobile || '');
    }
    
    const targetPkgId = packageId || 'Custom Package';
    setSelectedPkgIds([targetPkgId]);

    if (targetPkgId === 'Custom Package' || targetPkgId === 'custom_package') {
      const customPkgVal = 'Custom Package';
      setWizardLeadData((prev) => ({
        ...prev,
        selected_package_id: customPkgVal,
        Select_Package_Option: customPkgVal,
        package_name: 'Custom Package',
      }));

      const newInclusions = { ...editableInclusions };
      if (!newInclusions[customPkgVal]) newInclusions[customPkgVal] = [];
      const newDeliverables = { ...editableDeliverables };
      if (!newDeliverables[customPkgVal]) newDeliverables[customPkgVal] = [];

      if (activeEvents && activeEvents.length > 0) {
        activeEvents.forEach((ev) => {
          const k1 = `${customPkgVal}_${ev.id}`;
          const k2 = `${customPkgVal}_${ev.event_name || ev.event_type || 'Unnamed Event'}`;
          if (!newInclusions[k1]) newInclusions[k1] = [];
          if (!newInclusions[k2]) newInclusions[k2] = [];
          if (!newDeliverables[k1]) newDeliverables[k1] = [];
          if (!newDeliverables[k2]) newDeliverables[k2] = [];
        });
      }

      setEditableInclusions(newInclusions);
      setEditableDeliverables(newDeliverables);
      if (selectedLead && selectedLead.lead_id && selectedLead.lead_id !== 'DRAFT-LEAD') {
        saveStep3DataRealtime(newInclusions, newDeliverables, customPkgVal);
      }
      return;
    }

    const availablePkgs = (packages && packages.length > 0) ? packages : INITIAL_PACKAGES;
    const pkg = availablePkgs.find((p) => String(p.package_id) === String(targetPkgId) || String(p.package_name) === String(targetPkgId));
    if (pkg) {
      const pkgIdStr = String(pkg.package_id);
      const pkgPrice = Number(pkg.price) || 0;
      setWizardLeadData((prev) => ({
        ...prev,
        selected_package_id: pkgIdStr,
        Select_Package_Option: pkgIdStr,
        package_name: pkg.package_name,
        package_cost: pkgPrice,
        package_price: pkgPrice,
        deliverables: pkg.deliverables || '',
        notes: pkg.seasonal_offer ? `Seasonal Offer: ${pkg.seasonal_offer}` : prev.notes,
        budget: pkgPrice,
        final_quoted_amount: pkgPrice,
      }));
      setPkgPrices(prev => ({ ...prev, [pkgIdStr]: pkgPrice, [targetPkgId]: pkgPrice }));
      
      const incList = parseTeamMembers(pkg.team_members);
      const defaultInc = incList.length > 0 ? incList : [];
      
      const delList = parseTeamMembers(pkg.deliverables);
      const defaultDel = delList.length > 0 ? delList : [];

      const newInclusions = { ...editableInclusions };
      newInclusions[pkgIdStr] = [...defaultInc];
      newInclusions[targetPkgId] = [...defaultInc];
      
      const newDeliverables = { ...editableDeliverables };
      newDeliverables[pkgIdStr] = [...defaultDel];
      newDeliverables[targetPkgId] = [...defaultDel];

      if (activeEvents && activeEvents.length > 0) {
        activeEvents.forEach((ev) => {
          newInclusions[`${pkgIdStr}_${ev.id}`] = [...defaultInc];
          newInclusions[`${pkgIdStr}_${ev.event_name || ev.event_type || 'Unnamed Event'}`] = [...defaultInc];
          newInclusions[`${targetPkgId}_${ev.id}`] = [...defaultInc];
          newInclusions[`${targetPkgId}_${ev.event_name || ev.event_type || 'Unnamed Event'}`] = [...defaultInc];
          
          newDeliverables[`${pkgIdStr}_${ev.id}`] = [...defaultDel];
          newDeliverables[`${pkgIdStr}_${ev.event_name || ev.event_type || 'Unnamed Event'}`] = [...defaultDel];
          newDeliverables[`${targetPkgId}_${ev.id}`] = [...defaultDel];
          newDeliverables[`${targetPkgId}_${ev.event_name || ev.event_type || 'Unnamed Event'}`] = [...defaultDel];
        });
      }

      setEditableInclusions(newInclusions);
      setEditableDeliverables(newDeliverables);
      if (selectedLead && selectedLead.lead_id && selectedLead.lead_id !== 'DRAFT-LEAD') {
        saveStep3DataRealtime(newInclusions, newDeliverables, pkgIdStr, pkgPrice);
      }
    } else {
      setWizardLeadData((prev) => ({
        ...prev,
        selected_package_id: targetPkgId,
        Select_Package_Option: targetPkgId,
      }));
      if (selectedLead && selectedLead.lead_id && selectedLead.lead_id !== 'DRAFT-LEAD') {
        saveStep3DataRealtime(editableInclusions, editableDeliverables, targetPkgId);
      }
    }
  };

  const validateStep3Data = (mode: 'package' | 'all'): boolean => {
    // Validate package selection
    const pkgId = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option;
    if (!pkgId || pkgId.trim() === '') {
      showValidationError("select_package_option", "Please select a package before continuing.");
      showToastMsg("❌ Please complete all required fields before saving the package.", "error");
      return false;
    }

    // Auto-detect & attach current logged-in Sales Executive
    const effName = getEffectiveSalesStaffName();
    const effMobile = getEffectiveSalesStaffMobile();
    if (!salesStaffName || !salesStaffName.trim()) {
      setSalesStaffName(effName);
    }
    if (!salesStaffMobile || !salesStaffMobile.trim()) {
      setSalesStaffMobile(effMobile);
    }

    if (mode === 'all') {
      if (wizardLeadData.status === 'Order Confirmed') {
        if (!wizardLeadData.confirmed_event_date) {
          showValidationError("input_confirmed_event_date", "Please provide Confirmed Event Date.");
          showToastMsg("❌ Please complete all required fields before saving.", "error");
          return false;
        }

        if (wizardLeadData.final_amount === undefined || wizardLeadData.final_amount === null || isNaN(wizardLeadData.final_amount) || wizardLeadData.final_amount <= 0) {
          showValidationError("input_final_amount", "Please provide Final Amount.");
          showToastMsg("❌ Please complete all required fields before saving.", "error");
          return false;
        }
        if (wizardLeadData.advance_received === undefined || wizardLeadData.advance_received === null || isNaN(wizardLeadData.advance_received)) {
          showValidationError("input_advance_received", "Please provide Advance Payment Received.");
          showToastMsg("❌ Please complete all required fields before saving.", "error");
          return false;
        }

        if (crmEvents && crmEvents.length > 0) {
          for (const ev of crmEvents) {
            const rDate = ev.reporting_date || ev.event_date || wizardLeadData.confirmed_event_date;
            if (!rDate) {
              showValidationError(`reporting_date_${ev.id}`, "Reporting Date is required.");
              showToastMsg("❌ Please complete all required fields before saving.", "error");
              return false;
            }
            if (!ev.reporting_time) {
              showValidationError(`reporting_time_${ev.id}`, "Reporting Time is required.");
              showToastMsg("❌ Please complete all required fields before saving.", "error");
              return false;
            }
          }
        }
      }
    }

    return true;
  };

  const completeApprovedUnlockRequest = async (leadId: string) => {
    if (!leadId) return;
    console.log("[DEBUG completeApprovedUnlockRequest] Executing completeApprovedUnlockRequest for leadId:", leadId);
    try {
      const linkedOrder = (orders || []).find(o => o.lead_id === leadId);
      const orderId = linkedOrder?.order_id || (selectedLead as any)?.order_id;
      const nowIso = new Date().toISOString();

      // 1. Update lead record in Supabase & context state: set quotation_locked = true
      try {
        await updateLead(leadId, { quotation_locked: true, updated_at: nowIso } as any);
        console.log("[DEBUG completeApprovedUnlockRequest] Successfully updated lead quotation_locked = true via updateLead for", leadId);
      } catch (lErr: any) {
        console.warn("[DEBUG completeApprovedUnlockRequest] updateLead warning:", lErr?.message || lErr);
      }

      if (selectedLead && selectedLead.lead_id === leadId) {
        setSelectedLead(prev => prev ? { ...prev, quotation_locked: true } : prev);
      }

      // 2. Update unlock_requests table status to Completed
      if (supabaseClient) {
        try {
          const { data: allReqs } = await supabaseClient
            .from('unlock_requests')
            .select('*');

          if (allReqs && allReqs.length > 0) {
            const matchingReqs = allReqs.filter((r: any) => {
              const matchesLead = r.lead_id === leadId || r.order_id === leadId || r.project_id === leadId;
              const matchesOrder = orderId && (r.order_id === orderId || r.lead_id === orderId);
              return matchesLead || matchesOrder;
            });

            for (const req of matchingReqs) {
              const reqKeyCol = req.id ? 'id' : (req.request_id ? 'request_id' : 'lead_id');
              const reqKeyVal = req.id || req.request_id || req.lead_id;

              await supabaseClient
                .from('unlock_requests')
                .update({
                  request_status: 'Completed',
                  status: 'Completed',
                  completed_at: nowIso,
                  edited_at: nowIso,
                  updated_at: nowIso
                })
                .eq(reqKeyCol, reqKeyVal);
            }
          }

          // Proxy call fallback
          await fetch('/api/db/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'unlock_requests',
              matchColumn: 'lead_id',
              matchValue: leadId,
              updates: { request_status: 'Completed', status: 'Completed', completed_at: nowIso, updated_at: nowIso }
            })
          }).catch(() => {});

          if (orderId && orderId !== leadId) {
            await fetch('/api/db/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                table: 'unlock_requests',
                matchColumn: 'order_id',
                matchValue: orderId,
                updates: { request_status: 'Completed', status: 'Completed', completed_at: nowIso, updated_at: nowIso }
              })
            }).catch(() => {});
          }
        } catch (dbErr: any) {
          console.warn("[DEBUG completeApprovedUnlockRequest] unlock_requests DB update warning:", dbErr?.message || dbErr);
        }
      }

      // 3. Update local React unlockRequests state
      setUnlockRequests(prev => Array.isArray(prev) ? prev.map(r => {
        const matchesLead = r.lead_id === leadId || r.order_id === leadId || r.project_id === leadId;
        const matchesOrder = orderId && (r.order_id === orderId || r.lead_id === orderId);
        if (matchesLead || matchesOrder) {
          return {
            ...r,
            request_status: 'Completed',
            status: 'Completed',
            completed_at: nowIso,
            edited_at: nowIso
          };
        }
        return r;
      }) : []);

      // Re-fetch unlock_requests from DB to stay synchronized
      if (supabaseClient) {
        const { data } = await supabaseClient.from('unlock_requests').select('*');
        if (data) {
          setUnlockRequests(data.map((r: any) => ({
            ...r,
            request_status: r.request_status || r.status || 'Pending',
            status: r.request_status || r.status || 'Pending',
            reason: r.request_reason || r.reason || '',
            sales_staff_name: r.requested_by_name || r.sales_staff_name || '',
            sales_staff_id: r.requested_by_user_id || r.sales_staff_id || ''
          })));
        }
      }

    } catch (err: any) {
      console.error("[DEBUG completeApprovedUnlockRequest] Exception during unlock completion:", err?.message || err);
    }
  };

  const handleSavePackageOnly = async () => {
    if (isSaving) return;
    if (isStep3Locked) {
      showToastMsg("Quotation details are locked. Owner unlock approval required to edit.", "error");
      return;
    }
    const targetLeadId = selectedLead?.lead_id || createdLeadId;
    setIsSaving(true);
    try {
      // 1. Perform unified validation
      if (!validateStep3Data('package')) {
        setIsSaving(false);
        return;
      }

      const pkgId = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || selectedLead?.Select_Package_Option || 'Custom Package';
      const currentEvents = selectedLead ? crmEvents : createEvents;

      const { teamMembersJson, deliverablesJson, flatTeamMembers, teamMembersText, deliverablesText } = buildStep3EventPayloads(
        pkgId,
        currentEvents,
        editableInclusions,
        editableDeliverables
      );

      // 3. Update the lead record in Supabase with latest Step 3 package / pricing / staff info
      const updatedRemarks = appendCompletedStep(wizardLeadData.notes || '', 3);
      
      const updatedEvents = currentEvents.map(ev => ({
        ...ev,
        assigned_staff_names: ev.assigned_staff_names || '',
        assigned_staff_mobiles: ev.assigned_staff_mobiles || ''
      }));

      const cleanPkgCost = wizardLeadData.package_cost !== "" && wizardLeadData.package_cost != null && !isNaN(Number(wizardLeadData.package_cost))
        ? Number(wizardLeadData.package_cost)
        : (wizardLeadData.package_price !== "" && wizardLeadData.package_price != null && !isNaN(Number(wizardLeadData.package_price))
          ? Number(wizardLeadData.package_price)
          : (wizardLeadData.budget ? Number(wizardLeadData.budget) : (selectedLead?.package_price || selectedLead?.budget || null)));

      const cleanDiscount = quoteDiscount === "" || quoteDiscount == null || isNaN(Number(quoteDiscount)) ? null : Number(quoteDiscount);
      const cleanAdditional = quoteAdditional === "" || quoteAdditional == null || isNaN(Number(quoteAdditional)) ? null : Number(quoteAdditional);
      const cleanFinalAmt = Math.max(0, (cleanPkgCost || 0) + (cleanAdditional || 0) - (cleanDiscount || 0));

      const effectiveSalesName = getEffectiveSalesStaffName();
      const effectiveSalesMobile = getEffectiveSalesStaffMobile();

      const safeTeamMembersText = teamMembersText;
      const safeDeliverablesText = deliverablesText;

      if (targetLeadId && targetLeadId !== 'DRAFT-LEAD' && supabaseClient) {
        console.log('TEAM MEMBERS SAVE in handleSavePackageOnly', { leadId: targetLeadId, teamMembers: flatTeamMembers, serialized: safeTeamMembersText });
        
        try {
          const { data: dbResult, error: dbError } = await supabaseClient
            .from('leads')
            .update({
              budget: cleanPkgCost,
              package_price: cleanPkgCost,
              deliverables_description: safeDeliverablesText,
              Team_member: safeTeamMembersText,
              Team_Members: safeTeamMembersText,
              team_members: safeTeamMembersText,
              notes_special_customizations: wizardLeadData.notes,
              remarks: updatedRemarks,
              Select_Package_Option: pkgId,
              sales_staff_name: effectiveSalesName,
              sales_staff_mobile: effectiveSalesMobile,
              Quotation_Discount: cleanDiscount,
              Additional_Services_Cost: cleanAdditional,
              Final_Quotation_Amount: cleanFinalAmt,
              Final_Package_Amount: cleanFinalAmt,
              events: updatedEvents
            })
            .eq('lead_id', targetLeadId)
            .select('*');
          console.log('TEAM MEMBERS DB RESULT handleSavePackageOnly', { data: dbResult, error: dbError });
        } catch (dbErr) {
          console.warn("Direct Supabase update warning in handleSavePackageOnly:", dbErr);
        }

        await updateLead(targetLeadId, {
          budget: cleanPkgCost,
          package_price: cleanPkgCost,
          deliverables_description: safeDeliverablesText,
          Team_member: safeTeamMembersText,
          Team_Members: safeTeamMembersText,
          team_members: safeTeamMembersText,
          notes_special_customizations: wizardLeadData.notes,
          remarks: updatedRemarks,
          Select_Package_Option: pkgId,
          sales_staff_name: effectiveSalesName,
          sales_staff_mobile: effectiveSalesMobile,
          Quotation_Discount: cleanDiscount,
          Additional_Services_Cost: cleanAdditional,
          Final_Quotation_Amount: cleanFinalAmt,
          Final_Package_Amount: cleanFinalAmt,
          final_package_amount: cleanFinalAmt,
          _explicit_step3_save: true,
          events: updatedEvents
        });

        // Also upsert to lead_packages table so that Step 3 reloads from lead_packages perfectly
        try {
          const isValidPackage = INITIAL_PACKAGES.some(p => p.package_id === pkgId);
          if (!isValidPackage) {
            console.warn(`[SalesModule] Skipping lead_packages upsert for invalid package_id: ${pkgId}`);
            throw new Error(`Invalid package_id: ${pkgId}`);
          }

          const rawPackagePayload = {
            lead_id: targetLeadId,
            package_id: pkgId,
            package_name: wizardLeadData.package_name || (pkgId === 'Custom Package' || pkgId === 'custom_package' ? 'Custom Package' : `Package ${pkgId}`),
            quantity: 1,
            package_cost: cleanPkgCost || 0,
            total_amount: cleanPkgCost || 0,
            discount: cleanDiscount || 0,
            final_amount: cleanFinalAmt || 0,
            Team_Members_Included: teamMembersJson,
            editable_inclusions: editableInclusions,
            deliverables_descriptionn: deliverablesJson,
            deliverables_description: deliverablesText,
            editable_deliverables: editableDeliverables,
            updated_at: new Date().toISOString()
          };

          const { payload: packagePayload, isValid, teamMembersValid, deliverablesValid, issues } = verifyAndFormatLeadPackagePayload(
            rawPackagePayload,
            'SalesModule handleSavePackageOnly [Save Package]'
          );

          console.log('[SalesModule lead_packages API Prep] Target Lead ID:', targetLeadId, 'Package ID:', pkgId);
          console.log('[SalesModule lead_packages API Prep] Verification status:', {
            isValid,
            teamMembersValid,
            deliverablesValid,
            issuesCount: issues.length,
            Team_Members_Included_Type: Array.isArray(packagePayload.Team_Members_Included) ? 'Array' : typeof packagePayload.Team_Members_Included,
            deliverables_descriptionn_Type: Array.isArray(packagePayload.deliverables_descriptionn) ? 'Array' : typeof packagePayload.deliverables_descriptionn
          });

          const { data: existingLps, error: fetchLpErr } = await supabaseClient
            .from('lead_packages')
            .select('*')
            .eq('lead_id', targetLeadId);

          if (fetchLpErr) {
            console.warn("[lead_packages SalesModule] Error querying existing lead_packages:", fetchLpErr);
          }

          let targetLpId = `LP-${targetLeadId}-${pkgId}`;
          if (existingLps && existingLps.length > 0) {
            const matched = existingLps.find(lp => String(lp.package_id) === String(pkgId)) || existingLps[0];
            targetLpId = matched.lead_package_id || matched.id || targetLpId;
            console.log(`🚀 [Supabase API Call] Updating 'lead_packages' record (lead_package_id: "${targetLpId}"):`, packagePayload);
            const { data: updateRes, error: updateErr } = await supabaseClient
              .from('lead_packages')
              .update(packagePayload)
              .eq(matched.lead_package_id ? 'lead_package_id' : 'id', targetLpId)
              .select('*');

            if (updateErr) {
              console.error(`❌ [Supabase API Error] Error updating 'lead_packages':`, updateErr);
            } else {
              console.log(`✅ [Supabase API Success] Successfully updated 'lead_packages' record:`, updateRes);
            }
          } else {
            console.log(`🚀 [Supabase API Call] Inserting new 'lead_packages' record (lead_package_id: "${targetLpId}"):`, packagePayload);
            const { data: insertRes, error: insertErr } = await supabaseClient
              .from('lead_packages')
              .insert({
                ...packagePayload,
                lead_package_id: targetLpId,
                created_at: new Date().toISOString()
              })
              .select('*');

            if (insertErr) {
              console.error(`❌ [Supabase API Error] Error inserting into 'lead_packages':`, insertErr);
            } else {
              console.log(`✅ [Supabase API Success] Successfully inserted 'lead_packages' record:`, insertRes);
            }
          }
        } catch (lpErr) {
          console.error("❌ Exception while upserting lead_packages record in SalesModule handleSavePackageOnly:", lpErr);
        }
      }

      // Persist step 3 completion so reopening opens at step 3
      const newCompleted = Math.max(crmHighestStep, 3);
      setCrmHighestStep(newCompleted);
      if (targetLeadId && targetLeadId !== 'DRAFT-LEAD') {
        localStorage.setItem(`crm_last_step_${targetLeadId}`, String(newCompleted));
      }

      setWizardLeadData(prev => ({
        ...prev,
        deliverables: deliverablesText,
        deliverables_description: deliverablesText,
        package_price: cleanPkgCost ?? prev.package_price,
        selected_package_id: pkgId,
        Select_Package_Option: pkgId
      }));

      // Update the local selectedLead state so that the UI reflects it
      if (selectedLead) {
        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            budget: cleanPkgCost || 0,
            package_price: cleanPkgCost || 0,
            deliverables_description: deliverablesText,
            notes_special_customizations: wizardLeadData.notes,
            remarks: updatedRemarks,
            Select_Package_Option: pkgId,
            sales_staff_name: effectiveSalesName,
            sales_staff_mobile: effectiveSalesMobile,
            Quotation_Discount: cleanDiscount,
            Additional_Services_Cost: cleanAdditional,
            Final_Quotation_Amount: cleanFinalAmt,
          };
        });
        await completeApprovedUnlockRequest(selectedLead.lead_id);
      }

      showToastMsg("Package configuration saved successfully!", "success");
    } catch (err: any) {
      console.error("Save package only failed:", err);
      setSaveErrorPopup({
        title: "Failed to save package",
        message: "❌ Failed to save package.\nPlease try again."
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStep = async (step: number) => {
    if (!selectedLead) return;
    setIsSaving(true);
    try {
      if (step === 1) {
        if (isStep1Locked) {
          showToastMsg("Customer details are locked after order confirmation.", "error");
          setIsSaving(false);
          return;
        }
        if (!wizardLeadData.mobile) {
          showToastMsg("Phone Number is required.", "error");
          setIsSaving(false);
          return;
        }
        const mobileVal = String(wizardLeadData.mobile || '').trim();
        if (!/^\d{10}$/.test(mobileVal)) {
          showToastMsg("Please enter a valid 10-digit mobile number.", "error");
          setIsSaving(false);
          return;
        }
        if (!wizardLeadData.lead_source) {
          showToastMsg("Lead Source is required.", "error");
          setIsSaving(false);
          return;
        }
        const updatedRemarks = appendCompletedStep(selectedLead.remarks || wizardLeadData.remarks, 1);
        await updateLead(selectedLead.lead_id, {
          customer_name: wizardLeadData.customer_name || '',
          mobile: wizardLeadData.mobile,
          whatsapp_number: wizardLeadData.whatsapp_number,
          email: wizardLeadData.email,
          address: wizardLeadData.address,
          city: wizardLeadData.city,
          state: wizardLeadData.state,
          pincode: wizardLeadData.pincode,
          client_residence_address: wizardLeadData.client_residence_address,
          lead_source: wizardLeadData.lead_source,
          Specify_Custom_Lead_Source_Name: wizardLeadData.lead_source === 'Other' && wizardLeadData.Specify_Custom_Lead_Source_Name?.trim() !== '' ? wizardLeadData.Specify_Custom_Lead_Source_Name.trim() : null,
          total_pax: wizardLeadData.total_pax,
          reference_source: wizardLeadData.reference_source,
          Select_Package_Option: wizardLeadData.Select_Package_Option || wizardLeadData.selected_package_id || selectedLead.Select_Package_Option || '',
          remarks: updatedRemarks,
          status: getStatusRank(selectedLead.status || selectedLead.current_status) < 1 || selectedLead.status === 'New Lead' ? 'Create Quote' : (selectedLead.status || 'Create Quote'),
          current_status: getStatusRank(selectedLead.status || selectedLead.current_status) < 1 || selectedLead.status === 'New Lead' ? 'Create Quote' : (selectedLead.current_status || selectedLead.status || 'Create Quote')
        });

        const newCompleted = Math.max(crmHighestStep, 1);
        setCrmHighestStep(newCompleted);
        localStorage.setItem(`crm_last_step_${selectedLead.lead_id}`, String(newCompleted));

        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            remarks: updatedRemarks
          };
        });

        showToastMsg("CRM Updated Successfully.", "success");
      } else if (step === 2) {
        if (isStep2Locked) {
          showToastMsg("Event details are locked after order confirmation.", "error");
          setIsSaving(false);
          return;
        }
        let finalEventsList = [...crmEvents];

        if (showEventForm || finalEventsList.length === 0) {
          if (!eventForm.event_type || eventForm.event_type === '') {
            showToastMsg("Please select Event Type.", "error");
            setIsSaving(false);
            return;
          }
          if (!eventForm.event_date || eventForm.event_date === '') {
            showToastMsg("Please select Event Date.", "error");
            setIsSaving(false);
            return;
          }
          if (!eventForm.event_location || eventForm.event_location.trim() === '') {
            showToastMsg("Please enter Event Location.", "error");
            setIsSaving(false);
            return;
          }

          const dateTimeErrMsg = getEventDateTimeErrorMessage(eventForm.event_date, eventForm.event_end_date, eventForm.event_start_time, eventForm.event_end_time);
          if (dateTimeErrMsg) {
            showToastMsg(dateTimeErrMsg, "error");
            setIsSaving(false);
            return;
          }

          const guestPaxVal = eventForm.guest_pax !== '' ? Math.max(0, parseInt(String(eventForm.guest_pax)) || 0) : '';
          const staffPaxVal = eventForm.staff_pax !== '' ? Math.max(0, parseInt(String(eventForm.staff_pax)) || 0) : '';

          const eventData = {
            ...eventForm,
            guest_pax: guestPaxVal,
            staff_pax: staffPaxVal,
            event_start_date: eventForm.event_date,
            event_end_date: eventForm.event_end_date || ''
          };

          if (editingEventId) {
            finalEventsList = finalEventsList.map(ev => ev.id === editingEventId ? { ...eventData, id: editingEventId } : ev);
          } else {
            finalEventsList.push({
              ...eventData,
              id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `EV-${Date.now().toString().slice(-8)}`
            });
          }

          setCrmEvents(finalEventsList);
          setEditingEventId(null);
          setShowEventForm(false);
        }

        if (finalEventsList.length === 0) {
          showToastMsg("Please add at least one event.", "error");
          setIsSaving(false);
          return;
        }

        // Pre-validate and format all events in the finalEventsList
        for (const ev of finalEventsList) {
          if (!ev.event_type || ev.event_type.trim() === '') {
            showToastMsg("Please select Event Type for all events.", "error");
            setIsSaving(false); return;
          }
          if (ev.event_type === 'Other' && (!ev.event_name || ev.event_name.trim() === '')) {
            showToastMsg("Please enter Event Name for 'Other' event types.", "error");
            setIsSaving(false); return;
          }
          if (!ev.event_date || ev.event_date.trim() === '') {
            showToastMsg("Please select Event Date for all events.", "error");
            setIsSaving(false); return;
          }
          if (!ev.event_start_time || ev.event_start_time.trim() === '') {
            showToastMsg("Please select Event Start Time for all events.", "error");
            setIsSaving(false); return;
          }
          if (!ev.event_end_time || ev.event_end_time.trim() === '') {
            showToastMsg("Please select Event End Time for all events.", "error");
            setIsSaving(false); return;
          }
          if (!ev.event_location || ev.event_location.trim() === '') {
            showToastMsg("Please enter Event Location for all events.", "error");
            setIsSaving(false); return;
          }
          
          try {
            ev.event_start_time = validateAndFormatTime(ev.event_start_time, "Event Start Time") || '';
          } catch (err: any) {
            showToastMsg(err.message, "error");
            setIsSaving(false);
            return;
          }
          try {
            ev.event_end_time = validateAndFormatTime(ev.event_end_time, "Event End Time") || '';
          } catch (err: any) {
            showToastMsg(err.message, "error");
            setIsSaving(false);
            return;
          }
          
          const dateTimeErrMsg = getEventDateTimeErrorMessage(ev.event_date, ev.event_end_date, ev.event_start_time, ev.event_end_time);
          if (dateTimeErrMsg) {
            showToastMsg(dateTimeErrMsg, "error");
            setIsSaving(false);
            return;
          }
        }


        // Perform direct save for Step 2 without showing follow-up popup
        await handleSaveStep2Direct();
        return;
      } else if (step === 3) {
        if (isStep3Locked) {
          showToastMsg("Quotation details are locked. Owner unlock approval required to edit.", "error");
          setIsSaving(false);
          return;
        }
        if (!validateStep3Data('all')) {
          setIsSaving(false);
          return;
        }
        const pkgId = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || selectedLead.Select_Package_Option || 'Custom Package';
        const { teamMembersJson, deliverablesJson, flatTeamMembers, teamMembersText, deliverablesText } = buildStep3EventPayloads(
          pkgId,
          crmEvents,
          editableInclusions,
          editableDeliverables
        );

        const updatedRemarks = appendCompletedStep(wizardLeadData.notes || '', 3);
        
        const updatedEvents = crmEvents.map(ev => ({
          ...ev,
          assigned_staff_names: ev.assigned_staff_names || '',
          assigned_staff_mobiles: ev.assigned_staff_mobiles || ''
        }));

        const cleanPkgCost = wizardLeadData.package_cost !== "" && wizardLeadData.package_cost != null && !isNaN(Number(wizardLeadData.package_cost)) ? Number(wizardLeadData.package_cost) : (wizardLeadData.package_price !== "" && wizardLeadData.package_price != null && !isNaN(Number(wizardLeadData.package_price)) ? Number(wizardLeadData.package_price) : null);
        const cleanDiscount = quoteDiscount === "" || quoteDiscount == null || isNaN(Number(quoteDiscount)) ? null : Number(quoteDiscount);
        const cleanAdditional = quoteAdditional === "" || quoteAdditional == null || isNaN(Number(quoteAdditional)) ? null : Number(quoteAdditional);
        const cleanFinalAmt = Math.max(0, (cleanPkgCost || 0) + (cleanAdditional || 0) - (cleanDiscount || 0));
        const cleanPincode = wizardLeadData.pincode === "" || wizardLeadData.pincode == null ? null : wizardLeadData.pincode;

        const effectiveSalesName = getEffectiveSalesStaffName();
        const effectiveSalesMobile = getEffectiveSalesStaffMobile();

        const safeTeamMembersText = teamMembersText;
        const safeDeliverablesText = deliverablesText;

        console.log('TEAM MEMBERS SAVE in handleStep3Submit', { leadId: selectedLead.lead_id, teamMembers: flatTeamMembers, serialized: safeTeamMembersText });

        try {
          const { data: dbResult, error: dbError } = await supabaseClient
            .from('leads')
            .update({
              budget: cleanPkgCost,
              package_price: cleanPkgCost,
              deliverables_description: safeDeliverablesText,
              Team_member: safeTeamMembersText,
              Team_Members: safeTeamMembersText,
              team_members: safeTeamMembersText,
              notes_special_customizations: wizardLeadData.notes,
              remarks: updatedRemarks,
              Select_Package_Option: pkgId,
              client_residence_address: wizardLeadData.client_residence_address,
              city: wizardLeadData.city,
              state: wizardLeadData.state,
              pincode: cleanPincode,
              sales_staff_name: effectiveSalesName,
              sales_staff_mobile: effectiveSalesMobile,
              Quotation_Discount: cleanDiscount,
              Additional_Services_Cost: cleanAdditional,
              Final_Quotation_Amount: cleanFinalAmt,
              Final_Package_Amount: cleanFinalAmt,
              events: updatedEvents
            })
            .eq('lead_id', selectedLead.lead_id)
            .select('*');
          console.log('TEAM MEMBERS DB RESULT handleStep3Submit', { data: dbResult, error: dbError });
        } catch (dbErr) {
          console.warn("Direct Supabase update warning in handleStep3Submit:", dbErr);
        }

        await updateLead(selectedLead.lead_id, {
          budget: cleanPkgCost,
          package_price: cleanPkgCost,
          deliverables_description: safeDeliverablesText,
          Team_member: safeTeamMembersText,
          Team_Members: safeTeamMembersText,
          team_members: safeTeamMembersText,
          notes_special_customizations: wizardLeadData.notes,
          remarks: updatedRemarks,
          Select_Package_Option: pkgId,
          client_residence_address: wizardLeadData.client_residence_address,
          city: wizardLeadData.city,
          state: wizardLeadData.state,
          pincode: cleanPincode,
          sales_staff_name: effectiveSalesName,
          sales_staff_mobile: effectiveSalesMobile,
          Quotation_Discount: cleanDiscount,
          Additional_Services_Cost: cleanAdditional,
          Final_Quotation_Amount: cleanFinalAmt,
          Final_Package_Amount: cleanFinalAmt,
          final_package_amount: cleanFinalAmt,
          _explicit_step3_save: true,
          events: updatedEvents
        });

        setWizardLeadData(prev => ({
          ...prev,
          deliverables: safeDeliverablesText,
          deliverables_description: safeDeliverablesText,
          Team_member: safeTeamMembersText,
          Team_Members: safeTeamMembersText,
          team_members: safeTeamMembersText,
          package_price: cleanPkgCost ?? prev.package_price,
          selected_package_id: pkgId,
          Select_Package_Option: pkgId,
          final_amount: cleanFinalAmt
        }));

        const newCompleted = Math.max(crmHighestStep, 3);
        setCrmHighestStep(newCompleted);
        localStorage.setItem(`crm_last_step_${selectedLead.lead_id}`, String(newCompleted));

        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            budget: cleanPkgCost ?? prev.budget,
            package_price: cleanPkgCost ?? prev.package_price,
            deliverables_description: safeDeliverablesText,
            Team_member: safeTeamMembersText,
            Team_Members: safeTeamMembersText,
            team_members: safeTeamMembersText,
            notes_special_customizations: wizardLeadData.notes,
            remarks: updatedRemarks,
            Select_Package_Option: pkgId,
            client_residence_address: wizardLeadData.client_residence_address,
            city: wizardLeadData.city,
            state: wizardLeadData.state,
            pincode: wizardLeadData.pincode,
            sales_staff_name: effectiveSalesName,
            sales_staff_mobile: effectiveSalesMobile,
            Quotation_Discount: cleanDiscount,
            Additional_Services_Cost: cleanAdditional,
            Final_Quotation_Amount: cleanFinalAmt,
            Final_Package_Amount: cleanFinalAmt,
            final_package_amount: cleanFinalAmt
          };
        });

        if (wizardLeadData.status === 'Order Confirmed') {
          if (!wizardLeadData.confirmed_event_date) {
             showToastMsg("Please provide Confirmed Event Date.", "error");
             setIsSaving(false); return;
          }
          if (!wizardLeadData.final_amount || isNaN(wizardLeadData.final_amount)) {
             showToastMsg("Please provide Final Amount.", "error");
             setIsSaving(false); return;
          }
          
          const pkgName = packages.find(p => p.package_id === wizardLeadData.selected_package_id)?.package_name || 'Selected Package';
          
          let masterOrderId = '';
          try {
             masterOrderId = await confirmOrder(
               selectedLead.lead_id,
               pkgName,
               Number(wizardLeadData.final_amount),
               Number(wizardLeadData.advance_received || 0),
               wizardLeadData.confirmed_event_date,
               wizardLeadData.confirmed_event_time,
               'UPI',
               wizardLeadData.notes || 'Order confirmed via CRM Wizard',
               undefined,
               undefined
             );
          } catch (err: any) {
             console.error('confirmOrder error', err);
             showToastMsg('Failed to confirm order: ' + err.message, 'error');
             setIsSaving(false); return;
          }

          // Save to order_event_reporting
          try {
             if (supabaseClient) {
               const finalAmt = Number(wizardLeadData.final_amount);
               const advanceAmt = Number(wizardLeadData.advance_received || 0);
               const pendingAmt = finalAmt - advanceAmt;
               const paymentStatus = pendingAmt <= 0 ? 'Paid' : 'Pending';

               for (const ev of crmEvents) {
                 const payload = {
                   order_id: masterOrderId,
                   lead_id: selectedLead.lead_id,
                   event_id: ev.id,
                   event_name: ev.event_name || ev.event_type || 'Unknown Event',
                   confirmed_event_date: wizardLeadData.confirmed_event_date,
                   confirmed_event_time: wizardLeadData.confirmed_event_time,
                   contract_final_amount: finalAmt,
                   advance_payment_received: advanceAmt,
                   reporting_date: ev.reporting_date || ev.event_date || wizardLeadData.confirmed_event_date,
                   reporting_time: ev.reporting_time || wizardLeadData.confirmed_event_time,
                   pending_amount: pendingAmt,
                   payment_status: paymentStatus
                 };

                 const { data: existing, error: fetchErr } = await supabaseClient
                   .from('order_event_reporting')
                   .select('event_id')
                   .eq('event_id', ev.id)
                   .maybeSingle();

                 if (fetchErr && fetchErr.code !== 'PGRST116') {
                    throw fetchErr;
                 }

                 if (existing) {
                   const { error: updErr } = await supabaseClient
                     .from('order_event_reporting')
                     .update(payload)
                     .eq('event_id', ev.id);
                   if (updErr) throw updErr;
                 } else {
                   const { error: insErr } = await supabaseClient
                     .from('order_event_reporting')
                     .insert(payload);
                   if (insErr) throw insErr;
                 }
               }
             }
          } catch (err: any) {
             const errMsg = `Failed to save Order Event Reporting.\nTable Name: order_event_reporting\nColumn Name: Multiple (Check schema)\nFailed Function: handleSaveStep -> UPSERT\nSQL Operation: INSERT/UPDATE\nExact Supabase Error: ${err.message || String(err)}\nSuggested Fix: Verify table schema 'order_event_reporting' exists with correct columns.`;
             alert(errMsg);
             setIsSaving(false);
             return;
          }
          
          await completeApprovedUnlockRequest(selectedLead.lead_id);
          showToastMsg("Order Confirmed and sent to Operations.", "success");
          setSelectedLead(null);
          setIsSaving(false);
          return;
        }

        await completeApprovedUnlockRequest(selectedLead.lead_id);
        showToastMsg(`✅ Quotation & CRM changes saved.`, "success");
        setStep3FollowUpDate(selectedLead?.next_follow_up_date || '');
        setStep3FollowUpTime((selectedLead as any)?.next_follow_up_time || '');
        setStep3FollowUpNotes(selectedLead?.follow_up_notes || '');
        setShowStep3Popup(true);
        setIsSaving(false);
        return; // Open follow-up popup
      }

      if (step < 3) {
        let nextStep = step + 1;
        setCrmWizardStep(nextStep);
        setTimeout(() => {
          document.getElementById('crm-wizard-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' });
        }, 50);
      } else {
        setSelectedLead(null);
      }
    } catch (err: any) {
      console.error("Save failed:", err);
      const errMsg = err?.message || String(err);
      const parsed = parseStatusUpdateError(errMsg);
      
      const oldStatus = selectedLead ? (selectedLead.current_status || selectedLead.status || 'New Lead') : null;
      const newStatus = wizardLeadData?.status || null;
      
      logStatusUpdateError({
        leadId: selectedLead?.lead_id || null,
        orderId: null,
        oldStatus,
        newStatus,
        updatePayload: {
          budget: Number(wizardLeadData?.package_cost || wizardLeadData?.budget || 0),
          package_price: Number(wizardLeadData?.package_cost || 0),
          remarks: wizardLeadData?.remarks || wizardLeadData?.notes || '',
          Select_Package_Option: wizardLeadData?.selected_package_id || wizardLeadData?.Select_Package_Option || ''
        },
        insertPayload: null,
        dbResponse: null,
        fullError: err
      });

      setStatusError({
        title: "CRM Multi-step Wizard Status Update Failed",
        reason: parsed.reason,
        suggestedFix: parsed.suggestedFix
      });
      showToastMsg(parsed.reason, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Automatic background sync for Quote Sent -> Quote Follow-up when follow-up date and time are reached
  React.useEffect(() => {
    if (!leads || leads.length === 0) return;

    const checkAndSyncFollowUp = () => {
      leads.forEach(async (ld) => {
        const rawSt = ld.current_status || ld.status;
        if ((rawSt === 'Quote Sent' || rawSt === 'Quotation Sent') && isFollowUpDateTimeReached(ld)) {
          try {
            await updateLeadFollowUp(
              ld.lead_id,
              'Quote Follow-up' as CurrentStage,
              'Auto updated: Scheduled follow-up date and time reached',
              ld.next_follow_up_date || '',
              Number(ld.budget || 0),
              ld.follow_up_notes || 'Follow-up date and time reached'
            );
          } catch (e) {
            // Silent auto sync
          }
        }
      });
    };

    checkAndSyncFollowUp();
    const interval = setInterval(checkAndSyncFollowUp, 30000);
    return () => clearInterval(interval);
  }, [leads]);

  const handleSaveStep2Direct = async (passedEvents?: any[]) => {
    const isCreateFlow = activeTab === 'create';
    if (!isCreateFlow && isStep2Locked) {
      showToastMsg("Event details are locked after order confirmation.", "error");
      return;
    }
    const currentLeadId = isCreateFlow ? createdLeadId : selectedLead?.lead_id;
    if (!currentLeadId) {
      showToastMsg("Lead not initialized yet.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const finalEventsList = passedEvents || (isCreateFlow ? [...createEvents] : [...crmEvents]);
      if (finalEventsList.length === 0) {
        showToastMsg("Please add at least one event.", "error");
        setIsSaving(false);
        return;
      }
      
      // Pre-validate and format all events in the finalEventsList
      for (const ev of finalEventsList) {
        if (!ev.event_type || ev.event_type.trim() === '') {
          showToastMsg("Please select Event Type for all events.", "error");
          setIsSaving(false); return;
        }
        if (ev.event_type === 'Other' && (!ev.event_name || ev.event_name.trim() === '')) {
          showToastMsg("Please enter Event Name for 'Other' event types.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_date || ev.event_date.trim() === '') {
          showToastMsg("Please select Event Date for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_start_time || ev.event_start_time.trim() === '') {
          showToastMsg("Please select Event Start Time for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_end_time || ev.event_end_time.trim() === '') {
          showToastMsg("Please select Event End Time for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_location || ev.event_location.trim() === '') {
          showToastMsg("Please enter Event Location for all events.", "error");
          setIsSaving(false); return;
        }
        
        try {
          ev.event_start_time = validateAndFormatTime(ev.event_start_time, "Event Start Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          setIsSaving(false); return;
        }
        try {
          ev.event_end_time = validateAndFormatTime(ev.event_end_time, "Event End Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          setIsSaving(false); return;
        }
        
        const dateTimeErrMsg = getEventDateTimeErrorMessage(ev.event_date, ev.event_end_date, ev.event_start_time, ev.event_end_time);
        if (dateTimeErrMsg) {
          showToastMsg(dateTimeErrMsg, "error");
          setIsSaving(false); return;
        }
      }

      const firstEvent = finalEventsList[0];

      const formattedEventTime = validateAndFormatTime(firstEvent.event_start_time, "Event Start Time");
      const formattedReportingTime = validateAndFormatTime(isCreateFlow ? reportingTime : wizardLeadData.reporting_time, "Reporting Time");

      await updateLead(currentLeadId, {
        event_type: firstEvent.event_type === 'Other' ? 'Other' : firstEvent.event_type,
        custom_event_name: firstEvent.event_name,
        custom_event_type: firstEvent.event_type === 'Other' ? firstEvent.event_name : undefined,
        event_date: firstEvent.event_date,
        Event_End_Date: firstEvent.event_end_date || (firstEvent as any).Event_End_Date || null,
        event_time: formattedEventTime || null,
        event_start_time: firstEvent.event_start_time || null,
        event_end_time: firstEvent.event_end_time || null,
        reporting_time: formattedReportingTime || null,
        event_location: firstEvent.event_location,
        google_maps_link: firstEvent.google_maps_link || '',
        lead_source: isCreateFlow ? createForm.lead_source : wizardLeadData.lead_source,
        shoot_type: firstEvent.event_shoot_type || '',
        event_shoot_type: firstEvent.event_shoot_type || '',
        desired_event_shoot_type: firstEvent.event_shoot_type || '',
        client_residence_address: isCreateFlow ? createForm.client_residence_address : wizardLeadData.client_residence_address,
        city: isCreateFlow ? createForm.city : wizardLeadData.city,
        state: isCreateFlow ? createForm.state : wizardLeadData.state,
        pincode: isCreateFlow ? createForm.pincode : wizardLeadData.pincode,
        total_pax: firstEvent.guest_pax !== '' && firstEvent.guest_pax != null ? Number(firstEvent.guest_pax) : null,
        guest_pax: firstEvent.guest_pax !== '' && firstEvent.guest_pax != null ? Number(firstEvent.guest_pax) : null,
        staff_pax: firstEvent.staff_pax !== '' && firstEvent.staff_pax != null ? Number(firstEvent.staff_pax) : null,
        reference_source: isCreateFlow ? createForm.reference_source : wizardLeadData.reference_source || '',
        Select_Package_Option: isCreateFlow ? (createForm.Select_Package_Option || selectedPkgIds[0] || '') : (wizardLeadData.Select_Package_Option || wizardLeadData.selected_package_id || selectedLead?.Select_Package_Option || ''),
        events: finalEventsList
      });

      let reloadedEvents = finalEventsList;
      if (supabaseClient) {
        const { data: dbEvents, error: dbErr } = await supabaseClient
          .from('lead_events')
          .select('*')
          .eq('lead_id', currentLeadId)
          .order('created_at', { ascending: true });
          
        if (!dbErr && dbEvents && dbEvents.length > 0) {
          reloadedEvents = dbEvents as LeadEvent[];
          if (isCreateFlow) {
            setCreateEvents(reloadedEvents);
          } else {
            setCrmEvents(reloadedEvents);
          }
        }
      }

      if (isCreateFlow) {
        // Await confirmation from Supabase that the lead and events are persisted before initializing Step 3
        if (supabaseClient && currentLeadId) {
          try {
            await supabaseClient
              .from('leads')
              .select('lead_id')
              .eq('lead_id', currentLeadId)
              .maybeSingle();
          } catch (refetchErr) {
            console.warn("Silent confirmation before Step 3 failed:", refetchErr);
          }
        }

        if (selectedPkgIds.length === 0) {
          setSelectedPkgIds(['Custom Package']);
          setWizardLeadData(prev => ({ ...prev, selected_package_id: 'Custom Package', Select_Package_Option: 'Custom Package' }));
        }
        setWizardStep(3);
      } else {
        const newCompleted = Math.max(crmHighestStep, 2);
        setCrmHighestStep(newCompleted);
        if (selectedLead) {
          localStorage.setItem(`crm_last_step_${selectedLead.lead_id}`, String(newCompleted));
        }

        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            events: reloadedEvents
          };
        });

        setCrmWizardStep(3);
      }

      showToastMsg("✅ Event Details Saved Successfully", "success");
    } catch (err: any) {
      console.error("Step 2 direct save failed:", err);
      showToastMsg(`Failed to save event details: ${err.message || err}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStep3FollowUp = async () => {
    const isCreateFlow = activeTab === 'create';
    const currentLeadId = isCreateFlow ? createdLeadId : selectedLead?.lead_id;

    if (!currentLeadId) {
      showToastMsg("Lead record not found.", "error");
      return;
    }
    if (!step3FollowUpDate) {
      showToastMsg("Follow-up Date is required.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const fullNotes = step3FollowUpTime
        ? `[Time: ${step3FollowUpTime}] ${step3FollowUpNotes}`.trim()
        : step3FollowUpNotes;

      const currentPkgCost = Number(isCreateFlow ? (createForm.budget || finalTotal || 0) : (wizardLeadData.package_cost || selectedLead?.budget || 0));

      const previousStatus = selectedLead ? (selectedLead.current_status || selectedLead.status || 'Create Quote') : 'Create Quote';
      const prevRank = getStatusRank(previousStatus);

      // Target stage:
      // If previous status rank < 2 (i.e. Create Quote or New Lead), update status to Quote Sent.
      // If previous status rank >= 2 (already Quote Sent, Quote Follow-up, Confirm Order, Lost Lead), preserve existing status!
      const targetStage: CurrentStage = (isCreateFlow || prevRank < 2) 
        ? ('Quote Sent' as CurrentStage) 
        : (previousStatus as CurrentStage);

      await updateLeadFollowUp(
        currentLeadId,
        targetStage,
        fullNotes || 'Quotation created & follow-up scheduled',
        step3FollowUpDate,
        currentPkgCost,
        fullNotes || 'Quotation sent'
      );

      await completeApprovedUnlockRequest(currentLeadId);

      localStorage.setItem(`follow_up_date_${currentLeadId}`, step3FollowUpDate);
      localStorage.setItem(`follow_up_notes_${currentLeadId}`, fullNotes);

      if (isCreateFlow) {
        setSalesStatus('Quote Sent' as CurrentStage);
        resetForm();
        setActiveTab('list');
      } else {
        setSelectedLead(null);
        setCrmWizardStep(1);
        setActiveTab('list');
      }

      showToastMsg("✅ Quotation & Follow-up saved! Status updated to Quote Sent.", "success");
      setShowStep3Popup(false);
    } catch (err: any) {
      console.error("Failed to save Step 3 follow-up:", err);
      showToastMsg(`Failed to save follow-up: ${err.message || err}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStep2FollowUp = async () => {
    const isCreateFlow = activeTab === 'create';
    const currentLeadId = isCreateFlow ? createdLeadId : selectedLead?.lead_id;
    if (!currentLeadId) {
      showToastMsg("Lead not initialized yet.", "error");
      return;
    }
    if (!step2FollowUpDate) {
      showToastMsg("Next Follow-up Date is mandatory.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const finalEventsList = (isCreateFlow ? [...createEvents] : [...crmEvents]);
      if (finalEventsList.length === 0) {
        showToastMsg("No events found to save.", "error");
        setIsSaving(false);
        return;
      }
      
      // Pre-validate and format all events in the finalEventsList
      for (const ev of finalEventsList) {
        if (!ev.event_type || ev.event_type.trim() === '') {
          showToastMsg("Please select Event Type for all events.", "error");
          setIsSaving(false); return;
        }
        if (ev.event_type === 'Other' && (!ev.event_name || ev.event_name.trim() === '')) {
          showToastMsg("Please enter Event Name for 'Other' event types.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_date || ev.event_date.trim() === '') {
          showToastMsg("Please select Event Date for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_start_time || ev.event_start_time.trim() === '') {
          showToastMsg("Please select Event Start Time for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_end_time || ev.event_end_time.trim() === '') {
          showToastMsg("Please select Event End Time for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_location || ev.event_location.trim() === '') {
          showToastMsg("Please enter Event Location for all events.", "error");
          setIsSaving(false); return;
        }
        
        try {
          ev.event_start_time = validateAndFormatTime(ev.event_start_time, "Event Start Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          setIsSaving(false); return;
        }
        try {
          ev.event_end_time = validateAndFormatTime(ev.event_end_time, "Event End Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          setIsSaving(false); return;
        }
        
        const dateTimeErrMsg = getEventDateTimeErrorMessage(ev.event_date, ev.event_end_date, ev.event_start_time, ev.event_end_time);
        if (dateTimeErrMsg) {
          showToastMsg(dateTimeErrMsg, "error");
          setIsSaving(false); return;
        }
      }

      const firstEvent = finalEventsList[0];

      const formattedEventTime = validateAndFormatTime(firstEvent.event_start_time, "Event Start Time");
      const formattedReportingTime = validateAndFormatTime(isCreateFlow ? reportingTime : wizardLeadData.reporting_time, "Reporting Time");

      // Save event details first
      await updateLead(currentLeadId, {
        event_type: firstEvent.event_type === 'Other' ? 'Other' : firstEvent.event_type,
        custom_event_name: firstEvent.event_name,
        custom_event_type: firstEvent.event_type === 'Other' ? firstEvent.event_name : undefined,
        event_date: firstEvent.event_date,
        Event_End_Date: firstEvent.event_end_date || (firstEvent as any).Event_End_Date || null,
        event_time: formattedEventTime || null,
        event_start_time: firstEvent.event_start_time || null,
        event_end_time: firstEvent.event_end_time || null,
        reporting_time: formattedReportingTime || null,
        event_location: firstEvent.event_location,
        google_maps_link: firstEvent.google_maps_link || '',
        lead_source: isCreateFlow ? createForm.lead_source : wizardLeadData.lead_source,
        shoot_type: firstEvent.event_shoot_type || '',
        event_shoot_type: firstEvent.event_shoot_type || '',
        desired_event_shoot_type: firstEvent.event_shoot_type || '',
        client_residence_address: isCreateFlow ? createForm.client_residence_address : wizardLeadData.client_residence_address,
        city: isCreateFlow ? createForm.city : wizardLeadData.city,
        state: isCreateFlow ? createForm.state : wizardLeadData.state,
        pincode: isCreateFlow ? createForm.pincode : wizardLeadData.pincode,
        total_pax: firstEvent.guest_pax !== '' && firstEvent.guest_pax != null ? Number(firstEvent.guest_pax) : null,
        guest_pax: firstEvent.guest_pax !== '' && firstEvent.guest_pax != null ? Number(firstEvent.guest_pax) : null,
        staff_pax: firstEvent.staff_pax !== '' && firstEvent.staff_pax != null ? Number(firstEvent.staff_pax) : null,
        
        reference_source: isCreateFlow ? createForm.reference_source : wizardLeadData.reference_source || '',
        Select_Package_Option: isCreateFlow ? (createForm.Select_Package_Option || selectedPkgIds[0] || '') : (wizardLeadData.Select_Package_Option || wizardLeadData.selected_package_id || ''),
        events: finalEventsList
      });

      // Reload latest Event Details from the database to ensure we have the real IDs
      let reloadedEvents = finalEventsList;
      if (supabaseClient) {
        const { data: dbEvents, error: dbErr } = await supabaseClient
          .from('lead_events')
          .select('*')
          .eq('lead_id', currentLeadId)
          .order('created_at', { ascending: true });
          
        if (dbErr) {
          throw new Error(`Failed to verify saved events: ${dbErr.message || dbErr.details || 'Unknown database error'}`);
        }
        
        if (dbEvents && dbEvents.length > 0) {
          reloadedEvents = dbEvents as LeadEvent[];
          if (isCreateFlow) {
            setCreateEvents(reloadedEvents);
          } else {
            setCrmEvents(reloadedEvents);
          }
        }
      }

      const notesWithTag = appendCompletedStep(step2FollowUpNotes || 'Saved event details', 2);

      // Determine target status: If the current status is New Lead or empty, update to Follow Up. Otherwise preserve advanced status.
      const previousStatus = isCreateFlow ? 'New Lead' : (selectedLead ? getLeadCurrentStatus(selectedLead) : 'New Lead');
      const targetStatus = (previousStatus === 'New Lead' || !previousStatus) ? 'Follow Up' : previousStatus;

      // Update lead follow up and preserve/update status
      await updateLeadFollowUp(
        currentLeadId,
        targetStatus as CurrentStage,
        notesWithTag,
        step2FollowUpDate,
        Number(isCreateFlow ? (createForm.budget || 0) : (wizardLeadData.package_cost || selectedLead?.budget || 0)),
        step2FollowUpNotes || 'Saved event details'
      );

      localStorage.setItem(`follow_up_date_${currentLeadId}`, step2FollowUpDate);
      localStorage.setItem(`follow_up_notes_${currentLeadId}`, step2FollowUpNotes);

      if (isCreateFlow) {
        setSalesStatus(targetStatus as CurrentStage);
        setSelectedPkgIds(['Custom Package']);
        setWizardLeadData(prev => ({ ...prev, selected_package_id: 'Custom Package', Select_Package_Option: 'Custom Package' }));
        setWizardStep(3);
      } else {
        const newCompleted = Math.max(crmHighestStep, 2);
        setCrmHighestStep(newCompleted);
        if (selectedLead) {
          localStorage.setItem(`crm_last_step_${selectedLead.lead_id}`, String(newCompleted));
        }

        // Locally update the status and remarks
        const timestamp = new Date().toISOString();
        const updatedRemarks = `${selectedLead?.remarks || ''}\n[Update ${timestamp.split('T')[0]}]: ${notesWithTag}. ${step2FollowUpNotes ? 'Neg Notes: ' + step2FollowUpNotes : ''}. Next follow-up: ${step2FollowUpDate}`;

        // Locally update the status
        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            status: targetStatus as CurrentStage,
            current_status: targetStatus,
            remarks: updatedRemarks,
            follow_up_notes: step2FollowUpNotes,
            next_follow_up_date: step2FollowUpDate,
            events: reloadedEvents
          };
        });

        setCrmWizardStep(3);
      }

      showToastMsg("✅ Event Details Saved Successfully", "success");
      setShowStep2Popup(false);
    } catch (err: any) {
      console.error("Step 2 Follow-up save failed:", err);
      const errorMsg = err?.details || err?.message || String(err);
      showToastMsg(`Save Failed: ${errorMsg}`, "error");
      showErrorHelper(
        "Step 2 Save & Next Failed",
        errorMsg,
        "handleSaveStep2FollowUp",
        currentLeadId,
        "Check event details and try again.",
        err
      );
      setTimeout(() => {
        document.getElementById('error_details_modal')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLostLead = async () => {
    if (!selectedLead) return;
    const finalReason = lostReason === 'Other' ? otherLostReason : lostReason;
    if (!finalReason || finalReason.trim() === '') {
      showToastMsg("Lost Reason is mandatory.", "error");
      return;
    }
    if (!lostNotes || lostNotes.trim() === '') {
      showToastMsg("Lost Notes are mandatory.", "error");
      return;
    }
    setIsSaving(true);
    try {
      await updateLead(selectedLead.lead_id, {
        status: 'Lost Lead',
        current_status: 'Lost Lead',
        remarks: `Lost Reason: ${finalReason}. Notes: ${lostNotes}`,
        "Lost_Reason": finalReason,
        "Lost_Notes": lostNotes,
        lost_reason: finalReason,
        lost_notes: lostNotes,
        follow_up_notes: finalReason
      } as any);

      await updateLeadFollowUp(
        selectedLead.lead_id,
        'Lost Lead',
        finalReason,
        '',
        Number(selectedLead.package_price || selectedLead.budget || 0),
        lostNotes
      );

      showToastMsg("Lead status set to Lost successfully.", "success");
      setShowLostModal(false);
      setSelectedLead(null);
    } catch (err: any) {
      console.error("Failed to set lead as lost:", err);
      showToastMsg(err.message || String(err), "error");
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleSubmitUnlockRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnlockLead) return;
    
    if (unlockRequestReason === 'Other' && !unlockRequestCustomReason.trim()) {
      showToastMsg("Please enter a custom reason.", "error");
      return;
    }
    
    setIsSaving(true);
    
    try {
      if (!supabaseClient) {
        throw new Error("Supabase database client is not initialized.");
      }

      const order = orders.find(o => o.lead_id === selectedUnlockLead.lead_id);
      const orderId = order?.order_id || (selectedUnlockLead as any).order_id || selectedUnlockLead.lead_id || 'ORD-UNKNOWN';
      
      // 1. Prevent Duplicate Requests: Check if a Pending request already exists
      const { data: existingPending, error: checkErr } = await supabaseClient
        .from('unlock_requests')
        .select('*')
        .or(`lead_id.eq.${selectedUnlockLead.lead_id},order_id.eq.${orderId}`)
        .eq('request_status', 'Pending');

      if (checkErr) {
        console.error("Error checking existing pending unlock requests:", checkErr);
      }

      const localPending = unlockRequests.find((r: any) => 
        (r.lead_id === selectedUnlockLead.lead_id || r.order_id === orderId) &&
        (r.status === 'Pending' || r.request_status === 'Pending')
      );

      if ((existingPending && existingPending.length > 0) || localPending) {
        showToastMsg("An Unlock Request is already pending Business Owner approval.", "error");
        setIsSaving(false);
        return;
      }

      const fullReason = unlockRequestReason === 'Other' ? unlockRequestCustomReason.trim() : unlockRequestReason;

      const unlockRequestPayload = {
        lead_id: selectedUnlockLead.lead_id,
        order_id: orderId,
        requested_by_user_id: currentUser?.id || 'sales-user',
        requested_by_name: currentUser?.name || 'Sales Staff',
        requested_by_role: currentUser?.role || 'Sales',
        business_owner_user_id: 'BO-MAIN',
        chapter_id: selectedUnlockLead.chapter_id || 'DEFAULT',
        request_reason: fullReason || 'Unlock quotation for editing',
        request_status: 'Pending',
        requested_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      
      // 2. Save to Supabase: MUST succeed
      const { data: insertedData, error: reqErr } = await supabaseClient
        .from('unlock_requests')
        .insert([unlockRequestPayload])
        .select();

      if (reqErr) {
        console.error("Supabase unlock_requests insert failed:", reqErr);
        throw new Error(`Database insert failed: ${reqErr.message}`);
      }

      if (!insertedData || insertedData.length === 0) {
        throw new Error("Database insert did not return confirmation. Request not saved.");
      }



      // 4. Send notification to Business Owner
      if (addNotification) {
        try {
          const payload = {
            title: unlockRequestReason,
            message: `New unlock request received for ${selectedUnlockLead.customer_name || 'Lead'}.`,
            notification_type: 'Quotation Unlock Request',
            recipient_role: 'Business Owner',
            project_id: orderId,
            task_id: 'Pending',
            priority: 'High',
            action_url: JSON.stringify({
              lead_id: selectedUnlockLead.lead_id,
              customer_name: selectedUnlockLead.customer_name,
              mobile: selectedUnlockLead.mobile,
              sales_staff_id: currentUser?.id || '',
              sales_staff_name: currentUser?.name || '',
              sales_staff_mobile: currentUser?.mobile || ''
            })
          };
          await addNotification(payload);
        } catch (notifErr) {
          console.error("Notification error:", notifErr);
        }
      }
      
      const normalizedNewRecord = {
        ...insertedData[0],
        status: 'Pending',
        request_status: 'Pending',
        reason: fullReason,
        request_reason: fullReason,
        sales_staff_name: currentUser?.name || 'Sales Staff',
        sales_staff_id: currentUser?.id || 'sales-user',
        customer_name: selectedUnlockLead.customer_name || 'Unknown'
      };

      setUnlockRequests(prev => [
        ...prev.filter(r => r.lead_id !== selectedUnlockLead.lead_id && r.order_id !== orderId),
        normalizedNewRecord
      ]);

      showToastMsg("Unlock request submitted successfully.", "success");
      setShowUnlockRequestModal(false);
      setSelectedUnlockLead(null);
    } catch (err: any) {
      console.error("Failed to submit unlock request:", err);
      showToastMsg(err.message || String(err), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelLead = async () => {
    const targetLeadId = createdLeadId || selectedLead?.lead_id;
    if (!targetLeadId) {
      showToastMsg("No lead found to cancel.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const existingLead = leads.find(l => l.lead_id === targetLeadId) || selectedLead;
      const leadBudget = existingLead?.budget || 0;

      const finalReason = "Cancelled";
      const cancellationNotes = createdLeadId ? "Cancelled during Step 2 creation" : "Cancelled during Operations configuration";

      let finalEventsList = [...(createdLeadId ? createEvents : crmEvents)];
      if (finalEventsList.length === 0 && (eventForm.event_type || eventForm.event_name || eventForm.event_date || eventForm.event_location)) {
        finalEventsList.push({
          id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `EV-${Date.now().toString().slice(-8)}`,
          event_type: eventForm.event_type || '',
          event_name: eventForm.event_name || '',
          event_shoot_type: eventForm.event_shoot_type || '',
          event_date: eventForm.event_date || '',
          event_start_time: eventForm.event_start_time || '',
          event_end_time: eventForm.event_end_time || '',
          event_location: eventForm.event_location || '',
          google_maps_link: eventForm.google_maps_link || '',
          guest_pax: eventForm.guest_pax || '',
          staff_pax: eventForm.staff_pax || '',
          event_start_date: eventForm.event_date || '',
          event_end_date: eventForm.event_end_date || ''
        } as any);
      }
      const firstEvent = finalEventsList[0] || {};
      const payload: any = {
        status: 'Lost Lead',
        current_status: 'Lost Lead',
        remarks: `Lost Reason: ${finalReason}. Notes: ${cancellationNotes}`,
        "Lost_Reason": finalReason,
        "Lost_Notes": cancellationNotes,
        lost_reason: finalReason,
        lost_notes: cancellationNotes,
        
        client_residence_address: createForm.client_residence_address || existingLead?.client_residence_address || '',
        city: createForm.city || existingLead?.city || '',
        state: createForm.state || existingLead?.state || '',
        pincode: createForm.pincode || existingLead?.pincode || '',
        
        event_type: firstEvent.event_type || '',
        custom_event_name: firstEvent.event_name || '',
        event_date: firstEvent.event_date || '',
        event_start_time: firstEvent.event_start_time || null,
        event_end_time: firstEvent.event_end_time || null,
        event_location: firstEvent.event_location || '',
        google_maps_link: firstEvent.google_maps_link || '',
        event_shoot_type: firstEvent.event_shoot_type || '',
        guest_pax: firstEvent.guest_pax !== '' && firstEvent.guest_pax != null ? Number(firstEvent.guest_pax) : null,
        staff_pax: firstEvent.staff_pax !== '' && firstEvent.staff_pax != null ? Number(firstEvent.staff_pax) : null,
        
        next_follow_up_date: step2FollowUpDate || null,
        follow_up_notes: step2FollowUpNotes || null,
        
        events: finalEventsList
      };

      await updateLead(targetLeadId, payload);

      await updateLeadFollowUp(
        targetLeadId,
        'Lost Lead',
        finalReason,
        step2FollowUpDate || '',
        Number(leadBudget),
        cancellationNotes
      );

      showToastMsg("Lead marked as Lost successfully.", "success");
      setShowCancelConfirmPopup(false);
      resetForm();
      setActiveTab('list');
    } catch (err: any) {
      console.error("Error marking lead as Lost:", err);
      showToastMsg(`Failed to mark lead as Lost: ${err.message || err}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // On-change/blur handler for phone/email inputs to detect repeat customers
  const handleCheckExistingCustomer = (type: 'phone' | 'email', value: string) => {
    if (!value || value.length < 5) return;
    const parsedCustomers = getCustomers(leads, orders, payments || []);
    
    const matched = parsedCustomers.find(c => {
      if (type === 'phone') {
        const cleanInput = String(value).replace(/[^\d]/g, '').slice(-10);
        if (!cleanInput || cleanInput.length < 10) return false;
        const cleanMobile = String(c.mobile || '').replace(/[^\d]/g, '').slice(-10);
        const cleanAlt = String(c.alternate_mobile || '').replace(/[^\d]/g, '').slice(-10);
        return cleanInput === cleanMobile || (cleanAlt && cleanInput === cleanAlt);
      } else {
        const cleanInput = value.trim().toLowerCase();
        if (!cleanInput.includes('@')) return false;
        return c.email && c.email.trim().toLowerCase() === cleanInput;
      }
    });

    if (matched) {
      setDetectedCustomer(matched);
      setShowDetectionPopup(true);
    }
  };

  // Handle repeat bookings (Pre-fills customized data and issues a Lead AND dynamic Order immediately)
  const handleExecuteQuickReorder = async (cust: any) => {
    if (!reorderForm.event_date) {
      alert('Please specify the event date for the repeat customer booking.');
      return;
    }

    const newLeadId = await addLead({
      customer_name: cust.customer_name,
      mobile: cust.mobile,
      alternate_mobile: cust.alternate_mobile || undefined,
      whatsapp_number: cust.whatsapp_number || cust.mobile,
      email: cust.email,
      address: cust.address,
      city: cust.city,
      state: cust.state,
      pincode: cust.pincode,
      client_residence_address: cust.client_residence_address,
      lead_source: 'Repeat Customer Desk',
      event_type: reorderForm.event_type,
      custom_event_name: reorderForm.event_type === 'Other' ? reorderForm.custom_event_name : undefined,
      custom_event_type: reorderForm.event_type === 'Other' ? reorderForm.custom_event_name : undefined,
      event_date: reorderForm.event_date,
      event_time: reorderForm.event_time,
      event_location: reorderForm.event_location,
      budget: Number(reorderForm.quotation_amount),
      remarks: `Dynamic Repeat reservation. [CUST_ID: ${cust.customer_id}]`
    });

    const newOrderId = await confirmOrder(
      newLeadId,
      reorderForm.package_name,
      Number(reorderForm.quotation_amount),
      Number(reorderForm.advance_received)
    );

    alert(`Success! Repeat booking completed.\nNew Lead ID: ${newLeadId}\nNew Order ID: ${newOrderId}\nSame Customer ID: ${cust.customer_id}`);

    // Reset forms and view
    setShowDetectionPopup(false);
    setIsQuickReorderView(false);
    setDetectedCustomer(null);
    setReorderForm({
      event_type: '',
      custom_event_name: '',
      custom_event_type: '',
      event_date: '',
      event_time: '',
      event_location: '',
      package_name: '',
      quotation_amount: 0,
      advance_received: 0,
    });
    setActiveTab('list');
  };

  // Wizard action helpers and handlers
  const autoScrollToFormHeader = () => {
    const el = document.getElementById('create_lead_form_heading');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const formEl = document.getElementById('create_lead_form');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const getRemarksPayload = (formRemarks: string, intNotes: string, fDate: string, wNum: string, adr: string, cty: string, resAdr?: string) => {
    let result = '';
    if (wNum) result += `WhatsApp: ${wNum}\n`;
    if (adr) result += `Event Venue: ${adr}\n`;
    if (resAdr) result += `Residence: ${resAdr}\n`;
    if (cty) result += `City: ${cty}\n`;
    if (fDate) result += `Follow-up Date: ${fDate}\n`;
    if (intNotes) result += `Internal Notes: ${intNotes}\n`;
    if (formRemarks) result += `Remarks: ${formRemarks}\n`;
    
    if (selectedPkgIds.length > 0) {
      result += `\n--- Selected Package Customizations ---\n`;
      selectedPkgIds.forEach(id => {
        const p = PACKAGES_LIST.flatMap(cat => cat.items).find(item => item.id === id);
        if (p) {
          result += `Package: ${p.name}\n`;
          result += `  Custom Price: ₹${(pkgPrices[id] !== undefined ? pkgPrices[id] : p.cost).toLocaleString('en-IN')}\n`;
          result += `  Deliverables: ${pkgDeliverables[id] || 'N/A'}\n`;
          result += `  Notes: ${pkgNotes[id] || 'N/A'}\n`;
        }
      });
    }
    return result;
  };

  const handleSaveEventForm = (isCrm: boolean = !!selectedLead, addAnother: boolean = false) => {
    if (!eventForm.event_type) {
      showValidationError("input_event_type", "Event Type is required.");
      return;
    }
    if (!eventForm.event_date) {
      showValidationError("input_event_date", "Event Date is required.");
      return;
    }
    if (!eventForm.event_location.trim()) {
      showValidationError("input_event_location", "Event Location is required.");
      return;
    }

    const dateTimeErrMsg = getEventDateTimeErrorMessage(eventForm.event_date, eventForm.event_end_date, eventForm.event_start_time, eventForm.event_end_time);
    if (dateTimeErrMsg) {
      showToastMsg(dateTimeErrMsg, "error");
      return;
    }

    const guestPaxVal = eventForm.guest_pax !== '' ? Math.max(0, parseInt(String(eventForm.guest_pax)) || 0) : '';
    const staffPaxVal = eventForm.staff_pax !== '' ? Math.max(0, parseInt(String(eventForm.staff_pax)) || 0) : '';

    const eventData = {
      ...eventForm,
      guest_pax: guestPaxVal,
      staff_pax: staffPaxVal,
      event_start_date: eventForm.event_date,
      event_end_date: eventForm.event_end_date || ''
    };

    const savedEventType = eventForm.event_type;

    if (isCrm) {
      if (editingEventId) {
        setCrmEvents(prev => prev.map(ev => ev.id === editingEventId ? { ...eventData, id: editingEventId } : ev));
        showToastMsg("Event updated in list.", "success");
      } else {
        const newEv: LeadEvent = {
          ...eventData,
          id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `EV-${Date.now().toString().slice(-8)}`
        };
        setCrmEvents(prev => [...prev, newEv]);
        showToastMsg("Event added to list.", "success");
      }
    } else {
      if (editingEventId) {
        setCreateEvents(prev => prev.map(ev => ev.id === editingEventId ? { ...eventData, id: editingEventId } : ev));
        showToastMsg("Event updated in list.", "success");
      } else {
        const newEv: LeadEvent = {
          ...eventData,
          id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `EV-${Date.now().toString().slice(-8)}`
        };
        setCreateEvents(prev => [...prev, newEv]);
        showToastMsg("Event added to list.", "success");
      }
    }

    setEditingEventId(null);

    if (addAnother) {
      setEventForm({
        event_type: '',
        event_name: '',
        event_shoot_type: '',
        event_date: '',
        event_start_time: '',
        event_end_time: '',
        event_location: '',
        google_maps_link: '',
        guest_pax: "" as any,
        staff_pax: "" as any,
        event_start_date: '',
        event_end_date: ''
      });
      setShowEventForm(true);
    } else {
      setShowEventForm(false);
    }
  };

  const handleEditEvent = (ev: LeadEvent) => {
    setEditingEventId(ev.id);
    const startDate = ev.event_start_date || ev.event_date || '';
    const endDate = ev.event_end_date || (ev as any).Event_End_Date || (ev as any).Event_end_date || '';
    const startTime = ev.event_start_time || (ev as any).start_time || (ev as any).event_time || '';
    const endTime = ev.event_end_time || (ev as any).end_time || '';
    const location = ev.event_location || (ev as any).location || (ev as any).venue_address || '';
    const maps = ev.google_maps_link || (ev as any).maps_link || '';

    setEventForm({
      event_type: ev.event_type || '',
      event_name: ev.event_name || '',
      event_shoot_type: ev.event_shoot_type || '',
      event_date: startDate,
      event_start_date: startDate,
      event_end_date: endDate,
      event_start_time: startTime,
      event_end_time: endTime,
      event_location: location,
      google_maps_link: maps,
      guest_pax: ev.guest_pax !== null && ev.guest_pax !== undefined ? ev.guest_pax : ('' as any),
      staff_pax: ev.staff_pax !== null && ev.staff_pax !== undefined ? ev.staff_pax : ('' as any),
      reporting_date: ev.reporting_date || '',
      reporting_time: ev.reporting_time || ''
    });
    setShowEventForm(true);
  };

  const handleDeleteEvent = (id: string, isCrm: boolean = !!selectedLead) => {
    if (isCrm) {
      setCrmEvents(prev => prev.filter(ev => ev.id !== id));
    } else {
      setCreateEvents(prev => prev.filter(ev => ev.id !== id));
    }
    const purgeKeys = (record: Record<string, string[]>) => {
      const next = { ...record };
      Object.keys(next).forEach(k => {
        if (k === id || k.endsWith(`_${id}`) || k.includes(id)) {
          delete next[k];
        }
      });
      return next;
    };
    setEditableInclusions(prev => purgeKeys(prev));
    setEditableDeliverables(prev => purgeKeys(prev));
    showToastMsg("Event removed from list.", "success");
  };

  const handleAddNewEventClick = (isCrm: boolean = !!selectedLead) => {
    setEditingEventId(null);
    setEventForm({
      event_type: '',
      event_name: '',
      event_shoot_type: '',
      event_date: '',
      event_start_time: '',
      event_end_time: '',
      event_location: '',
      google_maps_link: '',
      guest_pax: "" as any,
      staff_pax: "" as any,
      event_start_date: '',
      event_end_date: ''
    });
    setShowEventForm(true);
  };

  const formatDDMMYYYY = (dateStr: string | undefined | null): string => {
    if (!dateStr) return 'N/A';
    const clean = dateStr.trim();
    if (!clean || clean === '—' || clean === 'N/A') return 'N/A';
    return formatDateDDMMYY(clean) || 'N/A';
  };

  const convertTo24Hour = (timeStr: string | undefined | null): string => {
    if (!timeStr) return '';
    const clean = timeStr.trim().toUpperCase();
    if (!clean) return '';

    // Match 12-hour AM/PM format (e.g., "08:00 AM", "8:00:00 AM", "12:30 PM", "01:00:00 PM")
    const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const minutes = ampmMatch[2];
      const period = ampmMatch[3];

      if (period === 'PM' && hours < 12) {
        hours += 12;
      } else if (period === 'AM' && hours === 12) {
        hours = 0;
      }

      const hh = String(hours).padStart(2, '0');
      return `${hh}:${minutes}`;
    }

    // Check if it's in 24-hour format with or without seconds (e.g., "14:30", "14:30:00", "8:30:00")
    const hhmmssMatch = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hhmmssMatch) {
      const hh = String(parseInt(hhmmssMatch[1], 10)).padStart(2, '0');
      const mm = hhmmssMatch[2];
      return `${hh}:${mm}`;
    }

    return '';
  };

  const convertTo12Hour = (timeStr: string | undefined | null): string => {
    if (!timeStr) return '';
    const clean = timeStr.trim();
    if (!clean) return '';

    // If it already has AM/PM, format nicely
    if (clean.toUpperCase().includes('AM') || clean.toUpperCase().includes('PM')) {
      const ampmMatch = clean.toUpperCase().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/);
      if (ampmMatch) {
        const hh = String(parseInt(ampmMatch[1], 10)).padStart(2, '0');
        const mm = ampmMatch[2];
        const period = ampmMatch[3];
        return `${hh}:${mm} ${period}`;
      }
      return clean;
    }

    // Match 24-hour format HH:MM or HH:MM:SS
    const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
      return clean;
    }

    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    if (hours === 0) {
      hours = 12;
    }

    const hh = String(hours).padStart(2, '0');
    return `${hh}:${minutes} ${period}`;
  };

  const parseDateParts = (dStr: string | undefined | null): { year: number; month: number; day: number } | null => {
    if (!dStr) return null;
    const clean = dStr.trim();
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

  const parseTimeParts = (tStr: string | undefined | null): { hours: number; minutes: number } | null => {
    if (!tStr) return null;
    const clean = tStr.trim();
    if (!clean) return null;

    const t24 = convertTo24Hour(clean);
    if (!t24) return null;

    const parts = t24.split(':');
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      if (!isNaN(hours) && !isNaN(minutes)) {
        return { hours, minutes };
      }
    }
    return null;
  };

  const buildDateTime = (
    dateStr: string | undefined | null,
    timeStr: string | undefined | null,
    defaultTime: { hours: number; minutes: number }
  ): Date | null => {
    const dParts = parseDateParts(dateStr);
    if (!dParts) return null;

    const tParts = parseTimeParts(timeStr) || defaultTime;
    return new Date(dParts.year, dParts.month - 1, dParts.day, tParts.hours, tParts.minutes, 0, 0);
  };

  const normalizeDateStr = (dStr: string | undefined | null): string => {
    const parts = parseDateParts(dStr);
    if (!parts) return dStr ? dStr.trim() : '';
    const y = parts.year;
    const m = String(parts.month).padStart(2, '0');
    const d = String(parts.day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getEventDateTimeErrorMessage = (
    startDate: string | undefined | null,
    endDate: string | undefined | null,
    startTime: string | undefined | null,
    endTime: string | undefined | null
  ): string | null => {
    if (!startDate || startDate.trim() === '') return null;

    const startParts = parseDateParts(startDate);
    if (!startParts) return null;

    const effectiveEndDate = endDate && endDate.trim() !== '' ? endDate : startDate;
    const endParts = parseDateParts(effectiveEndDate);
    if (!endParts) return null;

    // Rule 3 – Check if End Date is earlier than Start Date
    if (
      startParts.year > endParts.year ||
      (startParts.year === endParts.year && startParts.month > endParts.month) ||
      (startParts.year === endParts.year && startParts.month === endParts.month && startParts.day > endParts.day)
    ) {
      return "Event End Date cannot be earlier than Event Start Date.";
    }

    const isSameDate =
      startParts.year === endParts.year &&
      startParts.month === endParts.month &&
      startParts.day === endParts.day;

    // Rule 1 – If Start Date and End Date are the same date
    if (isSameDate) {
      const startT = parseTimeParts(startTime);
      const endT = parseTimeParts(endTime);
      if (startT && endT) {
        const startMin = startT.hours * 60 + startT.minutes;
        const endMin = endT.hours * 60 + endT.minutes;
        if (endMin <= startMin) {
          return "End Time must be later than Start Time when the Event Start Date and Event End Date are the same.";
        }
      }
    }

    // Rule 2 – Different Start Date & End Date (End Date > Start Date): any End Time allowed
    return null;
  };

  const isEventDateTimeInvalid = (
    startDate: string | undefined | null,
    endDate: string | undefined | null,
    startTime: string | undefined | null,
    endTime: string | undefined | null
  ): boolean => {
    return getEventDateTimeErrorMessage(startDate, endDate, startTime, endTime) !== null;
  };

  const isTimeEarlier = (start: string | undefined | null, end: string | undefined | null): boolean => {
    return isEventDateTimeInvalid(eventForm.event_date, eventForm.event_end_date, start, end);
  };

  const renderEventDetailsSection = (isCrm: boolean) => {
    const eventsList = isCrm ? crmEvents : createEvents;
    const isNewFormVisible = !editingEventId && (showEventForm || eventsList.length === 0);

    const renderFormFields = (isEditingThisEvent: boolean) => (
      <div className="space-y-4">
        {/* Event Type */}
        <div className="text-left">
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            Event Type *
          </label>
          <select
            id="input_event_type"
            value={eventForm.event_type}
            onChange={(e) => {
              const val = e.target.value;
              setEventForm(prev => ({
                ...prev,
                event_type: val,
                event_name: prev.event_name || ''
              }));
            }}
            className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all cursor-pointer font-bold"
          >
            <option value="">Select Event Type</option>
            {synchronizedEventTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Conditional Event Details fields displayed only after Event Type is selected */}
        {eventForm.event_type && eventForm.event_type !== '' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
            {/* Event Name */}
            <div className="sm:col-span-2 text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event Name
              </label>
              <input
                id="input_event_name"
                type="text"
                placeholder="e.g. Sangeet, Haldi, Reception"
                value={eventForm.event_name}
                onChange={(e) => setEventForm({ ...eventForm, event_name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>

            {/* Event Date */}
            <div className="text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event Date *
              </label>
              <input
                id="input_event_date"
                type="date"
                required
                value={eventForm.event_date}
                onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none font-mono"
              />
            </div>

            {/* Event Start Time */}
            <div className="text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event Start Time
              </label>
              <TimePicker12Hour
                id="input_event_start_time"
                value={convertTo24Hour(eventForm.event_start_time)}
                onChange={(val24) => {
                  const val12 = convertTo12Hour(val24);
                  setEventForm({ ...eventForm, event_start_time: val12 });
                }}
              />
            </div>

            {/* Event End Date */}
            <div className="text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event End Date
              </label>
              <input
                id="input_event_end_date"
                type="date"
                value={eventForm.event_end_date || ''}
                onChange={(e) => setEventForm({ ...eventForm, event_end_date: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none font-mono cursor-pointer"
              />
            </div>

            {/* Event End Time */}
            <div className="text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event End Time
              </label>
              <TimePicker12Hour
                id="input_event_end_time"
                value={convertTo24Hour(eventForm.event_end_time)}
                onChange={(val24) => {
                  const val12 = convertTo12Hour(val24);
                  setEventForm({ ...eventForm, event_end_time: val12 });
                }}
              />
              {(() => {
                const dateTimeErrMsg = getEventDateTimeErrorMessage(eventForm.event_date, eventForm.event_end_date, eventForm.event_start_time, eventForm.event_end_time);
                return dateTimeErrMsg ? (
                  <p className="text-[11px] text-rose-400 mt-1 animate-fade-in font-medium">
                    {dateTimeErrMsg}
                  </p>
                ) : null;
              })()}
            </div>

            {/* Event Location - Multiline Address */}
            <div className="sm:col-span-2 text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event Location * (Venue Address)
              </label>
              <textarea
                required
                rows={3}
                placeholder="Enter the full event location and venue address details"
                value={eventForm.event_location}
                onChange={(e) => setEventForm({ ...eventForm, event_location: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none"
              />
            </div>

            {/* Google Maps Link */}
            <div className="sm:col-span-2 text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Google Maps Location Link (Optional)
              </label>
              <input
                type="url"
                placeholder="e.g. https://maps.app.goo.gl/..."
                value={eventForm.google_maps_link}
                onChange={(e) => setEventForm({ ...eventForm, google_maps_link: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>

            {/* Guest Pax */}
            <div className="sm:col-span-2 text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Guest Pax
              </label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 150"
                value={eventForm.guest_pax}
                onChange={(e) => setEventForm({ ...eventForm, guest_pax: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none font-mono"
              />
            </div>

            {/* Save Event Buttons */}
            <div className="sm:col-span-2 flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowEventForm(false);
                  setEditingEventId(null);
                }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              {isEditingThisEvent ? (
                <button
                  type="button"
                  onClick={() => handleSaveEventForm(isCrm, false)}
                  className="bg-cyan-600 hover:bg-cyan-500 text-slate-100 font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                >
                  Update Event
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleSaveEventForm(isCrm, false)}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                  >
                    Save Event
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEventForm(isCrm, true)}
                    className="bg-cyan-600 hover:bg-cyan-500 text-slate-100 font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                  >
                    Save & Add Another Event
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-4">
        {/* Render Event Cards */}
        {eventsList.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
              Added Events ({eventsList.length})
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {eventsList.map((ev, idx) => {
                const isEditingThisEvent = editingEventId === ev.id;
                const isCollapsed = collapsedEventIds[ev.id] ?? true;
                const startDateStr = formatDDMMYYYY(ev.event_start_date || ev.event_date);
                const endDateRaw = ev.event_end_date || (ev as any).Event_End_Date || '';
                const endDateStr = endDateRaw ? formatDDMMYYYY(endDateRaw) : 'N/A';
                const startTimeStr = ev.event_start_time ? convertTo12Hour(ev.event_start_time) : 'N/A';
                const endTimeStr = ev.event_end_time ? convertTo12Hour(ev.event_end_time) : 'N/A';

                const guestPaxVal = ev.guest_pax !== '' && ev.guest_pax !== null && ev.guest_pax !== undefined ? ev.guest_pax : 'N/A';
                const staffPaxVal = ev.staff_pax !== '' && ev.staff_pax !== null && ev.staff_pax !== undefined ? ev.staff_pax : 'N/A';

                const dateTimeSummary = (() => {
                  const startPart = `${startDateStr} • ${startTimeStr}`;
                  if (endDateRaw && endDateStr !== 'N/A') {
                    return `${startPart} → ${endDateStr} • ${endTimeStr}`;
                  } else if (endTimeStr !== 'N/A') {
                    return `${startPart} → ${endTimeStr}`;
                  }
                  return startPart;
                })();

                if (isEditingThisEvent) {
                  return (
                    <div key={ev.id} className="bg-slate-900 border border-cyan-500/50 rounded-xl p-4 space-y-4 shadow-lg animate-fade-in text-left">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <Edit className="w-3.5 h-3.5" /> Edit Event {idx + 1}: {ev.event_name || ev.event_type}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEventId(null);
                            setShowEventForm(false);
                          }}
                          className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                      {renderFormFields(true)}
                    </div>
                  );
                }

                return (
                  <div key={ev.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm transition-all duration-200">
                    <div 
                      className="flex items-center justify-between p-3.5 bg-slate-950/40 cursor-pointer select-none border-b border-slate-800/40 hover:bg-slate-950/60 transition-colors"
                      onClick={() => setCollapsedEventIds(prev => ({ ...prev, [ev.id]: !isCollapsed }))}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="bg-cyan-500/10 text-cyan-400 p-1.5 rounded-lg shrink-0">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div className="text-left space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-100">{ev.event_name || `Event ${idx + 1}`}</span>
                            <span className="text-xs text-slate-500 font-mono">|</span>
                            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono font-bold">
                              {ev.event_type}
                            </span>
                          </div>

                          {/* Show compact summary ONLY when COLLAPSED */}
                          {isCollapsed && (
                            <>
                              <p className="text-[11px] text-slate-300 font-mono">
                                {dateTimeSummary}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono">
                                Guest Pax: <span className="text-slate-200 font-semibold">{guestPaxVal}</span>
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleEditEvent(ev)}
                          className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
                          title="Edit Event"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(ev.id, isCrm)}
                          className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Remove Event"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollapsedEventIds(prev => ({ ...prev, [ev.id]: !isCollapsed }))}
                          className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                        >
                          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="p-4 bg-slate-900/50 text-xs text-slate-300 space-y-3">
                        {/* Event Name & Type Info Header if name differs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-850/60 font-mono">
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Event Name</span>
                            <span className="text-slate-100 font-semibold">{ev.event_name || `Event ${idx + 1}`}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Event Type</span>
                            <span className="text-slate-100 font-semibold">{ev.event_type}</span>
                          </div>
                          {(ev.event_shoot_type || (ev as any).shoot_type) && (
                            <div>
                              <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Event Shoot Type</span>
                              <span className="text-slate-100 font-semibold">{ev.event_shoot_type || (ev as any).shoot_type}</span>
                            </div>
                          )}
                        </div>

                        {/* Dates & Times Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-850/60 font-mono">
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Start Date</span>
                            <span className="text-slate-200 font-semibold">{startDateStr}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Start Time</span>
                            <span className="text-slate-200 font-semibold">{startTimeStr}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">End Date</span>
                            <span className="text-slate-200 font-semibold">{endDateStr}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">End Time</span>
                            <span className="text-slate-200 font-semibold">{endTimeStr}</span>
                          </div>
                        </div>

                        {/* Pax Info Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-850/60 font-mono">
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Guest Pax</span>
                            <span className="text-slate-200 font-semibold">{guestPaxVal}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Staff Pax</span>
                            <span className="text-slate-200 font-semibold">{staffPaxVal}</span>
                          </div>
                        </div>

                        {/* Reporting Info if present */}
                        {(ev.reporting_date || ev.reporting_time) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-850/60 font-mono">
                            {ev.reporting_date && (
                              <div>
                                <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Reporting Date</span>
                                <span className="text-slate-200 font-semibold">{formatDDMMYYYY(ev.reporting_date)}</span>
                              </div>
                            )}
                            {ev.reporting_time && (
                              <div>
                                <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Reporting Time</span>
                                <span className="text-slate-200 font-semibold">{convertTo12Hour(ev.reporting_time)}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Venue Address */}
                        <div className="border-t border-slate-800/40 pt-2.5 text-left">
                          <span className="text-slate-400 block mb-1 text-[10px] font-sans font-bold uppercase tracking-wider">Venue Address / Location:</span>
                          <p className="text-slate-200 bg-slate-950/20 p-2 rounded border border-slate-850/50 whitespace-pre-wrap font-mono">
                            {ev.event_location || 'N/A'}
                          </p>
                        </div>

                        {/* Google Maps Link */}
                        {ev.google_maps_link && (
                          <div className="flex items-center gap-1.5 text-cyan-400 text-left pt-1 font-mono text-[11px]">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <a 
                              href={ev.google_maps_link} 
                              target="_blank" 
                              referrerPolicy="no-referrer"
                              rel="noopener noreferrer" 
                              className="hover:underline break-all"
                            >
                              {ev.google_maps_link}
                            </a>
                          </div>
                        )}

                        {/* Assigned Staff if present */}
                        {ev.assigned_staff_names && (
                          <div className="border-t border-slate-800/40 pt-2 text-left font-mono">
                            <span className="text-slate-400 block mb-0.5 text-[10px] font-sans font-bold uppercase tracking-wider">Assigned Staff:</span>
                            <span className="text-slate-200">{ev.assigned_staff_names}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Inline Event Form for New Event */}
        {isNewFormVisible ? (
          <div className="bg-slate-900/60 border border-slate-850 rounded-xl p-4 space-y-4 animate-fade-in text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                Event Details
              </span>
              {eventsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowEventForm(false);
                    setEditingEventId(null);
                  }}
                  className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
            {renderFormFields(false)}
          </div>
        ) : (
          /* Add Another Event Button */
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => handleAddNewEventClick(isCrm)}
              className="flex items-center gap-1.5 border border-dashed border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-400 bg-slate-900/30 px-4 py-2.5 rounded-lg text-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Another Event</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  const handleWizardNext = async () => {
    if (isSaving) return;

    let finalUser: any = null;

    if (wizardStep === 1) {
      if (!createForm.mobile) {
        showValidationError("input_mobile", "Phone Number is required.");
        return;
      }
      if (!createForm.lead_source || createForm.lead_source === '') {
        showValidationError("input_lead_source", "Lead Source is required.");
        return;
      }

      // Check Supabase Authentication and Session before creating lead
      if (supabaseClient) {
        try {
          const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
          const { data: userData, error: userErr } = await supabaseClient.auth.getUser();

          const session = sessionData?.session;
          const authUser = userData?.user;

          console.log('SESSION', session);
          console.log('USER', authUser);

          if (sessionErr || userErr) {
            console.warn("Session/user fetch error:", sessionErr || userErr);
          }

          // If BOTH session and authUser are null AND we don't have a currentUser in React state
          if (!session && !authUser && !currentUser) {
            showToastMsg("Please login again.", "error");
            return;
          }

          // Check if session is expired
          const isExpired = session?.expires_at ? (session.expires_at <= Math.floor(Date.now() / 1000)) : false;
          if (isExpired && !authUser) {
            showToastMsg("Session expired.", "error");
            return;
          }

          // Users Table Lookup
          const currentUid = authUser?.id || session?.user?.id || currentUser?.id;
          const emailFromAuth = authUser?.email || session?.user?.email || currentUser?.email;

          let dbUser: any = null;
          if (currentUid) {
            const { data: userById, error: dbUserErr } = await supabaseClient
              .from('users')
              .select('*')
              .eq('id', currentUid)
              .maybeSingle();

            dbUser = userById;
            if (dbUserErr) {
              console.warn("Users table lookup failed in UI:", dbUserErr.message);
            }
          }

          if (!dbUser && emailFromAuth) {
            const { data: dbUserByEmail } = await supabaseClient
              .from('users')
              .select('*')
              .eq('email', emailFromAuth.toLowerCase().trim())
              .maybeSingle();
            
            if (dbUserByEmail && currentUid) {
              console.log("Aligning user profile ID during lead creation...");
              await supabaseClient
                .from('users')
                .update({ id: currentUid })
                .eq('email', emailFromAuth.toLowerCase().trim());
              dbUser = { ...dbUserByEmail, id: currentUid };
            } else if (dbUserByEmail) {
              dbUser = dbUserByEmail;
            }
          }

          finalUser = currentUser;
          if (dbUser) {
            finalUser = mapUserFieldsFromDb(dbUser);
          }

          if (!finalUser) {
            showToastMsg("User record missing from users table.", "error");
            return;
          }

          if (emailFromAuth && finalUser.email && finalUser.email.toLowerCase().trim() !== emailFromAuth.toLowerCase().trim()) {
            showToastMsg("User record email does not match logged-in account.", "error");
            return;
          }

          if (!finalUser.role) {
            showToastMsg("User role not loaded correctly.", "error");
            return;
          }

          if (!finalUser.active) {
            showToastMsg("User account is deactivated.", "error");
            return;
          }

          if (finalUser.role !== 'Sales Team' && finalUser.role !== 'Business Owner') {
            showToastMsg("User does not have permission to create quotations.", "error");
            return;
          }
        } catch (authErr: any) {
          showToastMsg(`Authentication error: ${authErr.message || authErr}`, "error");
          return;
        }
      } else {
        if (!currentUser) {
          showToastMsg("Please login again.", "error");
          return;
        }
        finalUser = currentUser;
        if (currentUser.role !== 'Sales Team' && currentUser.role !== 'Business Owner') {
          showToastMsg("User does not have permission to create quotations.", "error");
          return;
        }
      }

      const mobileVal = String(createForm.mobile || '').trim();
      if (!/^\d{10}$/.test(mobileVal)) {
        showToastMsg("Please enter a valid 10-digit mobile number.", "error");
        return;
      }
      if (createForm.email && createForm.email.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(createForm.email.trim())) {
          showToastMsg("Please enter a valid email address.", "error");
          return;
        }
      }

      try {
        setIsSaving(true);
        const finalSource = createForm.lead_source === 'Other' ? 'Other' : createForm.lead_source;
        const customLeadSourceName = createForm.lead_source === 'Other' && otherSource.trim() !== '' ? otherSource.trim() : null;
        let finalId = createdLeadId;
        if (!createdLeadId) {
          const newId = await addLead({
            customer_name: createForm.customer_name || '',
            mobile: createForm.mobile,
            alternate_mobile: (createForm.alternate_mobile && String(createForm.alternate_mobile).trim() !== '' && String(createForm.alternate_mobile).trim() !== '+91') ? String(createForm.alternate_mobile) : undefined,
            email: createForm.email,
            lead_source: finalSource,
            Specify_Custom_Lead_Source_Name: customLeadSourceName,
            whatsapp_number: createForm.whatsapp_number,
            address: createForm.address,
            city: createForm.city,
            state: createForm.state,
            pincode: createForm.pincode,
            client_residence_address: createForm.client_residence_address,
            shoot_type: createForm.shoot_type,
            desired_event_shoot_type: createForm.desired_event_shoot_type,
            total_pax: createForm.total_pax !== '' ? Number(createForm.total_pax) : undefined,
            reference_source: createForm.reference_source,
            booking_status: createForm.booking_status || undefined,
            event_type: createForm.event_type || '',
            event_date: createForm.event_date || '',
            event_time: createForm.event_time || '',
            event_location: createForm.event_location || '',
            budget: Number(createForm.budget) || 0,
            remarks: getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city, createForm.client_residence_address),
            next_follow_up_date: followUpDate || null,
            follow_up_notes: internalNotes || null,
            Select_Package_Option: createForm.Select_Package_Option || selectedPkgIds[0] || ''
          });
          setCreatedLeadId(newId);
          finalId = newId;
          console.log(`Created lead with ID: ${newId}`);
        } else {
          await updateLead(createdLeadId, {
            customer_name: createForm.customer_name || '',
            mobile: createForm.mobile,
            alternate_mobile: (createForm.alternate_mobile && String(createForm.alternate_mobile).trim() !== '' && String(createForm.alternate_mobile).trim() !== '+91') ? String(createForm.alternate_mobile) : undefined,
            email: createForm.email,
            lead_source: finalSource,
            Specify_Custom_Lead_Source_Name: customLeadSourceName,
            whatsapp_number: createForm.whatsapp_number,
            address: createForm.address,
            city: createForm.city,
            state: createForm.state,
            pincode: createForm.pincode,
            client_residence_address: createForm.client_residence_address,
            desired_event_shoot_type: createForm.desired_event_shoot_type,
            total_pax: createForm.total_pax !== '' ? Number(createForm.total_pax) : undefined,
            reference_source: createForm.reference_source,
            booking_status: createForm.booking_status || undefined,
            remarks: getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city, createForm.client_residence_address),
            next_follow_up_date: followUpDate || null,
            follow_up_notes: internalNotes || null,
            Select_Package_Option: createForm.Select_Package_Option || selectedPkgIds[0] || ''
          });
        }
        const isEdit = !!createdLeadId;

        const newLeadObj: Lead = {
          lead_id: finalId,
          customer_name: createForm.customer_name || '',
          mobile: createForm.mobile,
          alternate_mobile: (createForm.alternate_mobile && String(createForm.alternate_mobile).trim() !== '' && String(createForm.alternate_mobile).trim() !== '+91') ? String(createForm.alternate_mobile) : undefined,
          email: createForm.email,
          lead_source: finalSource,
            Specify_Custom_Lead_Source_Name: customLeadSourceName,
          whatsapp_number: createForm.whatsapp_number,
          address: createForm.address,
          city: createForm.city,
          state: createForm.state,
          pincode: createForm.pincode,
          client_residence_address: createForm.client_residence_address,
          shoot_type: createForm.shoot_type,
          desired_event_shoot_type: createForm.desired_event_shoot_type,
          total_pax: createForm.total_pax !== '' ? Number(createForm.total_pax) : undefined,
          reference_source: createForm.reference_source,
          booking_status: createForm.booking_status || 'Pending',
          event_type: createForm.event_type || 'Other',
          event_date: createForm.event_date || new Date().toISOString().split('T')[0],
          event_time: createForm.event_time || '12:00',
          event_location: createForm.event_location || 'TBD',
          budget: Number(createForm.budget) || 0,
          remarks: getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city, createForm.client_residence_address),
          next_follow_up_date: followUpDate || null,
            follow_up_notes: internalNotes || null,
          Select_Package_Option: createForm.Select_Package_Option || selectedPkgIds[0] || '',
          status: 'Create Quote',
          created_date: new Date().toISOString().split('T')[0],
          sales_person: finalUser?.name || currentUser?.name || 'Sales Team',
          created_by: finalUser?.name || currentUser?.name || 'Sales Team'
        };

        // Stay in Create Lead form, and advance to Step 2
        setWizardStep(2);

        showToastMsg("Inbound quotation created successfully! Continuing to Step 2.", "success");
      } catch (err: any) {
        console.error("Step 1 saving failed:", err);
  
      const errMsg = err.message || String(err);
      
      if (errMsg.includes('FATAL_MISSING_COLUMN')) {
        const parts = errMsg.split('||');
        const table = parts[1] || 'leads';
        const col = parts[2] || 'Unknown';
        const sql = `ALTER TABLE "${table}" ADD COLUMN "${col}" numeric;`;
        const colType = col === 'Specify_Custom_Lead_Source_Name' ? 'text' : 'numeric';
        const properSql = `ALTER TABLE "${table}" ADD COLUMN "${col}" ${colType};`;
        
        showToastMsg(`CRITICAL DB ERROR:\nTable: ${table}\nMissing Column: ${col}\nSuggested SQL: ${properSql}`, "error");
        setIsSaving(false);
        return;
      }

        let displayedMsg = errMsg;
        
        const lowerMsg = errMsg.toLowerCase();
        if (lowerMsg.includes("row-level security policy") || lowerMsg.includes("rls") || lowerMsg.includes("security policy")) {
          displayedMsg = "Lead insert blocked by RLS policy.";
        } else if (lowerMsg.includes("user record missing") || lowerMsg.includes("missing from users table") || lowerMsg.includes("missing from users")) {
          displayedMsg = "User record missing from users table.";
        } else if (lowerMsg.includes("session expired") || lowerMsg.includes("jwt expired")) {
          displayedMsg = "Session expired.";
        } else if (lowerMsg.includes("permission") || lowerMsg.includes("permission denied")) {
          displayedMsg = "User does not have permission to create quotations.";
        } else if (lowerMsg.includes("login") || lowerMsg.includes("unauthenticated") || lowerMsg.includes("jwt")) {
          displayedMsg = "Please login again.";
        } else {
          displayedMsg = errMsg;
        }
        
        showToastMsg(displayedMsg, "error");
      } finally {
        setIsSaving(false);
      }
    }

    else if (wizardStep === 2) {
      let finalEventsList = [...createEvents];
      
      // If eventForm is visible or there are no events in the list, validate and add
      if (showEventForm || finalEventsList.length === 0) {
        if (!eventForm.event_type || eventForm.event_type === '') {
          showValidationError("input_event_type", "Please select Event Type.");
          return;
        }
        if (!eventForm.event_date || eventForm.event_date === '') {
          showValidationError("input_event_date", "Please select Event Date.");
          return;
        }
        if (!eventForm.event_location || eventForm.event_location.trim() === '') {
          showValidationError("input_event_location", "Please enter Event Location.");
          return;
        }
        const dateTimeErrMsg = getEventDateTimeErrorMessage(eventForm.event_date, eventForm.event_end_date, eventForm.event_start_time, eventForm.event_end_time);
        if (dateTimeErrMsg) {
          showValidationError("input_event_end_time", dateTimeErrMsg);
          return;
        }

        const guestPaxVal = eventForm.guest_pax !== '' ? Math.max(0, parseInt(String(eventForm.guest_pax)) || 0) : '';
        const staffPaxVal = eventForm.staff_pax !== '' ? Math.max(0, parseInt(String(eventForm.staff_pax)) || 0) : '';

        const eventData = {
          ...eventForm,
          guest_pax: guestPaxVal,
          staff_pax: staffPaxVal,
          event_start_date: eventForm.event_date,
          event_end_date: eventForm.event_end_date || ''
        };

        if (editingEventId) {
          finalEventsList = finalEventsList.map(ev => ev.id === editingEventId ? { ...eventData, id: editingEventId } : ev);
        } else {
          finalEventsList.push({
            ...eventData,
            id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `EV-${Date.now().toString().slice(-8)}`
          });
        }
        
        setCreateEvents(finalEventsList);
        setEditingEventId(null);
        setShowEventForm(false);
      }

      if (finalEventsList.length === 0) {
        showToastMsg("Please add at least one event.", "error");
        return;
      }

      // Pre-validate and format all events in the finalEventsList
      for (const ev of finalEventsList) {
        if (!ev.event_type || ev.event_type.trim() === '') {
          showToastMsg("Please select Event Type for all events.", "error");
          return;
        }
        if (ev.event_type === 'Other' && (!ev.event_name || ev.event_name.trim() === '')) {
          showToastMsg("Please enter Event Name for 'Other' event types.", "error");
          return;
        }
        if (!ev.event_date || ev.event_date.trim() === '') {
          showToastMsg("Please select Event Date for all events.", "error");
          return;
        }
        if (!ev.event_start_time || ev.event_start_time.trim() === '') {
          showToastMsg("Please select Event Start Time for all events.", "error");
          return;
        }
        if (!ev.event_end_time || ev.event_end_time.trim() === '') {
          showToastMsg("Please select Event End Time for all events.", "error");
          return;
        }
        if (!ev.event_location || ev.event_location.trim() === '') {
          showToastMsg("Please enter Event Location for all events.", "error");
          return;
        }
        
        try {
          ev.event_start_time = validateAndFormatTime(ev.event_start_time, "Event Start Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          return;
        }
        try {
          ev.event_end_time = validateAndFormatTime(ev.event_end_time, "Event End Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          return;
        }
        
        const dateTimeErrMsg = getEventDateTimeErrorMessage(ev.event_date, ev.event_end_date, ev.event_start_time, ev.event_end_time);
        if (dateTimeErrMsg) {
          showToastMsg(dateTimeErrMsg, "error");
          return;
        }
      }

      const firstEvent = finalEventsList[0];

      try {
        await handleSaveStep2Direct();
      } catch (err: any) {
        console.error("Step 2 saving failed:", err);
  
      const errMsg = err.message || String(err);
      
      if (errMsg.includes('FATAL_MISSING_COLUMN')) {
        const parts = errMsg.split('||');
        const table = parts[1] || 'leads';
        const col = parts[2] || 'Unknown';
        const sql = `ALTER TABLE "${table}" ADD COLUMN "${col}" numeric;`;
        const colType = col === 'Specify_Custom_Lead_Source_Name' ? 'text' : 'numeric';
        const properSql = `ALTER TABLE "${table}" ADD COLUMN "${col}" ${colType};`;
        
        showToastMsg(`CRITICAL DB ERROR:\nTable: ${table}\nMissing Column: ${col}\nSuggested SQL: ${properSql}`, "error");
        setIsSaving(false);
        return;
      }

        let displayedMsg = errMsg;
        if (errMsg.toLowerCase().includes("database") || errMsg.toLowerCase().includes("connection") || errMsg.toLowerCase().includes("failed to fetch") || errMsg.toLowerCase().includes("supabase")) {
          displayedMsg = "Database save failed: connection error.";
        } else {
          displayedMsg = `Unable to save event details: ${errMsg}`;
        }
        showToastMsg(displayedMsg, "error");
      } finally {
        setIsSaving(false);
      }
    }

  };

  const handleStatusSave = async () => {
    if (isSaving) return;
    const finalStatus = salesStatus || 'New Lead';
    try {
      setIsSaving(true);

      // Save Packages
      const selectedPkgs = PACKAGES_LIST.flatMap(cat => cat.items).filter(item => selectedPkgIds.includes(item.id));
      if (selectedPkgIds.length > 0) {
        const packagesPayload = selectedPkgs.map(pkg => ({
          package_id: pkg.id,
          package_name: pkg.name,
          package_cost: pkgPrices[pkg.id] !== undefined ? pkgPrices[pkg.id] : pkg.cost,
          quantity: 1,
          total_amount: pkgPrices[pkg.id] !== undefined ? pkgPrices[pkg.id] : pkg.cost,
          discount: leadDiscount,
          final_amount: pkgPrices[pkg.id] !== undefined ? pkgPrices[pkg.id] : pkg.cost,
          deliverables_description: pkgDeliverables[pkg.id] || pkg.deliverables || 'N/A',
          notes_special_customizations: pkgNotes[pkg.id] || '',
          additional_services_cost: 0,
          team_members: pkg.team_members || '',
          deliverables: pkg.deliverables || ''
        }));
        await saveLeadPackages(createdLeadId!, packagesPayload);
      }

      const activePkgId = createForm.Select_Package_Option || selectedPkgIds[0] || 'Custom Package';
      const activeEventsList = createEvents.length > 0 ? createEvents : [];
      const { teamMembersText, deliverablesText } = buildStep3EventPayloads(
        activePkgId,
        activeEventsList,
        editableInclusions,
        editableDeliverables
      );

      await updateLead(createdLeadId!, {
        status: finalStatus as CurrentStage,
        budget: finalTotal,
        package_price: finalTotal,
        Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
        Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
        Final_Quotation_Amount: finalTotal,
        Final_Package_Amount: finalTotal,
        final_package_amount: finalTotal,
        selected_package_id: activePkgId,
        Select_Package_Option: activePkgId,
        deliverables_description: deliverablesText || selectedPkgs.map(p => pkgDeliverables[p.id] || p.deliverables || 'N/A').join('\n'),
        notes_special_customizations: teamMembersText || selectedPkgs.map(p => pkgNotes[p.id] || '').join('\n'),
        sales_staff_name: salesStaffName,
        sales_staff_mobile: salesStaffMobile,
        client_residence_address: createForm.client_residence_address,
        city: createForm.city,
        state: createForm.state,
        pincode: createForm.pincode,
        desired_event_shoot_type: createForm.desired_event_shoot_type,
        remarks: getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city, createForm.client_residence_address),
        next_follow_up_date: followUpDate || null,
        follow_up_notes: internalNotes || null,
        events: activeEventsList
      });

      setWizardLeadData(prev => ({
        ...prev,
        selected_package_id: activePkgId,
        Select_Package_Option: activePkgId,
        package_cost: finalTotal,
        package_price: finalTotal,
        final_amount: finalTotal,
        budget: finalTotal,
        final_quoted_amount: finalTotal,
        deliverables: deliverablesText,
        deliverables_description: deliverablesText
      }));

      const currentCreatedLead = leads.find(l => l.lead_id === createdLeadId);
      const syncedLeadObj: Lead = {
        ...(currentCreatedLead || {}),
        lead_id: createdLeadId!,
        customer_name: createForm.customer_name,
        mobile: createForm.mobile,
        whatsapp_number: createForm.whatsapp_number,
        status: finalStatus as CurrentStage,
        budget: finalTotal,
        package_price: finalTotal,
        Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
        Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
        Final_Quotation_Amount: finalTotal,
        Final_Package_Amount: finalTotal,
        final_package_amount: finalTotal,
        selected_package_id: activePkgId,
        Select_Package_Option: activePkgId,
        deliverables_description: deliverablesText,
        events: activeEventsList
      } as Lead;
      setSelectedLead(syncedLeadObj);

      showToastMsg("✅ Quotation created successfully.", "success");
      setStep3FollowUpDate(followUpDate || '');
      setStep3FollowUpTime('');
      setStep3FollowUpNotes(internalNotes || '');
      setShowStep3Popup(true);
    } catch (err: any) {
      console.error("Step 5 status save failed:", err);
      const errMsg = err?.message || String(err);
      const parsed = parseStatusUpdateError(errMsg);

      const targetLd = leads.find(l => l.lead_id === createdLeadId);
      const oldStatus = targetLd ? (targetLd.current_status || targetLd.status || 'New Lead') : null;
      const newStatus = finalStatus || null;

      logStatusUpdateError({
        leadId: createdLeadId || null,
        orderId: null,
        oldStatus,
        newStatus,
        updatePayload: {
          status: finalStatus,
          budget: finalTotal,
          package_price: finalTotal,
          Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
          Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
          Final_Quotation_Amount: finalTotal,
          Select_Package_Option: createForm.Select_Package_Option || selectedPkgIds[0] || ''
        },
        insertPayload: null,
        dbResponse: null,
        fullError: err
      });

      setStatusError({
        title: "Lead Stage Transition Failed",
        reason: parsed.reason,
        suggestedFix: parsed.suggestedFix
      });
      alert(parsed.reason);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOrderConfirmedSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving) return;

    const targetLd = leads.find(l => l.lead_id === createdLeadId) || selectedLead;
    if (targetLd && !areReportingDetailsComplete(targetLd)) {
      openReportingDetailsModal(targetLd, "Please complete and save the Reporting Details before confirming the order.");
      return;
    }

    if (!confirmedEventDate) {
      showToastMsg("Please select Confirmed Event Date.", "error");
      return;
    }

    if (finalPackageAmount === undefined || finalPackageAmount === 0 || isNaN(finalPackageAmount)) {
      showToastMsg("Please enter Final Amount.", "error");
      return;
    }
    if (advanceReceived === undefined || isNaN(advanceReceived)) {
      showToastMsg("Please enter Advance Paid Amount.", "error");
      return;
    }

    try {
      setIsSaving(true);
      const selectedPkgsNames = selectedPkgs.map(p => p.name).join(' + ') || 'Custom Configured Coverage';
      await confirmOrder(
        createdLeadId!,
        selectedPkgsNames,
        finalPackageAmount,
        advanceReceived,
        confirmedEventDate,
        confirmedEventTime,
        'UPI / Cash / Bank Transfer',
        getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city, createForm.client_residence_address),
        reportingTime
      );
      
      showToastMsg("Quotation created successfully.", "success");
      resetForm();
      setActiveTab('list');
    } catch (err: any) {
      console.error("Failed to commit confirmed order details:", err);
      const errMsg = err?.message || String(err);
      const parsed = parseStatusUpdateError(errMsg);

      const targetLd = leads.find(l => l.lead_id === createdLeadId);
      const oldStatus = targetLd ? (targetLd.current_status || targetLd.status || 'New Lead') : null;

      logStatusUpdateError({
        leadId: createdLeadId || null,
        orderId: null,
        oldStatus,
        newStatus: 'Order Confirmed',
        updatePayload: {
          status: 'Order Confirmed',
          event_date: confirmedEventDate,
          event_time: confirmedEventTime,
          reporting_time: reportingTime,
        },
        insertPayload: {
          order_status: 'Confirmed',
          current_stage: 'Order Confirmed',
          package_name: selectedPkgs.map(p => p.name).join(' + ') || 'Custom Configured Coverage',
          quotation_amount: finalPackageAmount,
          advance_received: advanceReceived,
        },
        dbResponse: null,
        fullError: err
      });

      setStatusError({
        title: "Order Confirmation Pipeline Transition Failed",
        reason: parsed.reason,
        suggestedFix: parsed.suggestedFix
      });
      alert(parsed.reason);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle follow up submit
  const handleFollowUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || isSaving) return;

    if (followUpForm.status === 'Order Confirmed' || followUpForm.status === 'Confirm Order') {
      if (!areReportingDetailsComplete(selectedLead)) {
        openReportingDetailsModal(selectedLead, "Please complete and save the Reporting Details before confirming the order.");
        return;
      }

      if (!followUpForm.event_date) {
        showToastMsg("Please select Confirmed Event Date.", "error");
        return;
      }

      if (followUpForm.quotation_amount === undefined || followUpForm.quotation_amount === 0 || isNaN(followUpForm.quotation_amount)) {
        showToastMsg("Please enter Final Amount.", "error");
        return;
      }
      if (followUpForm.advance_received === undefined || isNaN(followUpForm.advance_received) || Number(followUpForm.advance_received) <= 0) {
        showToastMsg("Please enter Advance Paid Amount.", "error");
        return;
      }
      if (!followUpForm.transaction_id || !followUpForm.transaction_id.trim()) {
        showToastMsg("Please enter Payment Tracking ID / Transaction Reference Number.", "error");
        return;
      }

      const packageName = packages?.find(p => String(p.package_id) === String(selectedLead.Select_Package_Option))?.package_name || selectedLead.Select_Package_Option || '';

      try {
        setIsSaving(true);
        await confirmOrder(
          selectedLead.lead_id,
          packageName,
          Number(followUpForm.quotation_amount),
          Number(followUpForm.advance_received),
          followUpForm.event_date,
          followUpForm.event_time,
          followUpForm.payment_mode || 'UPI',
          followUpForm.call_notes || 'Confirmed from CRM activity logger',
          followUpForm.reporting_time || '08:00',
          followUpForm.transaction_id
        );

        setSelectedLead(null);
        showToastMsg("Order Confirmed Successfully.", "success");
      } catch (err: any) {
        console.error("Failed to convert lead:", err);
        const errMsg = err?.message || String(err);
        const parsed = parseStatusUpdateError(errMsg);

        const oldStatus = selectedLead ? (selectedLead.current_status || selectedLead.status || 'New Lead') : null;

        logStatusUpdateError({
          leadId: selectedLead?.lead_id || null,
          orderId: null,
          oldStatus,
          newStatus: 'Order Confirmed',
          updatePayload: {
            status: 'Order Confirmed',
            remarks: followUpForm.call_notes
          },
          insertPayload: {
            order_status: 'Confirmed',
            current_stage: 'Order Confirmed',
            package_name: packageName,
            quotation_amount: Number(followUpForm.quotation_amount),
            advance_received: Number(followUpForm.advance_received),
          },
          dbResponse: null,
          fullError: err
        });

        setStatusError({
          title: "Follow-up Transition to Order Confirmed Failed",
          reason: parsed.reason,
          suggestedFix: parsed.suggestedFix
        });
        alert(parsed.reason);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!followUpForm.call_notes) {
      alert('Please fill in some Call Notes to update lead follow-up.');
      return;
    }

    try {
      setIsSaving(true);
      await updateLeadFollowUp(
        selectedLead.lead_id,
        followUpForm.status,
        followUpForm.call_notes,
        followUpForm.next_follow_up_date || '',
        Number(followUpForm.quotation_amount),
        followUpForm.negotiation_notes
      );

      // Refresh selected lead state
      setSelectedLead((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: followUpForm.status,
          budget: Number(followUpForm.quotation_amount),
        };
      });

      // Clear follow up text
      setFollowUpForm(prev => ({ ...prev, call_notes: '', negotiation_notes: '' }));
      alert('CRM Updated Successfully.');
    } catch (err: any) {
      console.error("Failed to update follow-up:", err);
      const errMsg = err?.message || String(err);
      const parsed = parseStatusUpdateError(errMsg);

      const oldStatus = selectedLead ? (selectedLead.current_status || selectedLead.status || 'New Lead') : null;

      logStatusUpdateError({
        leadId: selectedLead?.lead_id || null,
        orderId: null,
        oldStatus,
        newStatus: followUpForm.status,
        updatePayload: {
          status: followUpForm.status,
          budget: Number(followUpForm.quotation_amount),
          remarks: followUpForm.call_notes
        },
        insertPayload: null,
        dbResponse: null,
        fullError: err
      });

      setStatusError({
        title: "Follow-up Pipeline Status Update Failed",
        reason: parsed.reason,
        suggestedFix: parsed.suggestedFix
      });
      alert(parsed.reason);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalReportingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || isSaving) return;

    try {
      setIsSaving(true);
      
      const crmEvents = selectedLead.events || [];
      let updatedLeadFields: any = {};

      if (crmEvents.length > 0) {
        // Validate all events have required reporting details
        for (const ev of crmEvents) {
          const fd = finalReportingForm[ev.id] || { reporting_date: '', reporting_time: '' };
          if (!fd.reporting_date || !fd.reporting_date.trim() || !fd.reporting_time || !fd.reporting_time.trim()) {
            showToastMsg("Please complete Reporting Date and Reporting Time for all events.", "error");
            setIsSaving(false);
            return;
          }
        }

        // Save event-wise reporting details
        const updatedEvents = crmEvents.map(ev => {
          const fd = finalReportingForm[ev.id] || { reporting_date: '', reporting_time: '' };
          return {
            ...ev,
            reporting_date: fd.reporting_date,
            reporting_time: fd.reporting_time
          };
        });
        
        updatedLeadFields = {
          events: updatedEvents,
          Reporting_date: updatedEvents[0]?.reporting_date || '', // fallback
          reporting_time: updatedEvents[0]?.reporting_time || ''
        };
        await updateLead(selectedLead.lead_id, updatedLeadFields);
      } else {
        // Fallback for leads without explicit events
        const fd = finalReportingForm['default'] || { reporting_date: '', reporting_time: '' };
        if (!fd.reporting_date || !fd.reporting_date.trim() || !fd.reporting_time || !fd.reporting_time.trim()) {
          showToastMsg("Please complete Reporting Date and Reporting Time.", "error");
          setIsSaving(false);
          return;
        }

        updatedLeadFields = {
          Reporting_date: fd.reporting_date,
          reporting_time: fd.reporting_time
        };
        await updateLead(selectedLead.lead_id, updatedLeadFields);
      }

      const updatedLead = {
        ...selectedLead,
        ...updatedLeadFields
      };

      setShowFinalReportingModal(false);
      setSelectedLead(updatedLead);
      showToastMsg("Reporting Details Saved Successfully.", "success");

      // Auto-open Confirm Order modal once reporting details are saved
      const today = new Date().toISOString().split('T')[0];
      const linkedOrder = orders?.find(o => o.lead_id === updatedLead.lead_id);
      const linkedPayment = linkedOrder ? payments?.find(p => p.order_id === linkedOrder.order_id) : null;
      const calcAdvance = linkedPayment 
        ? ((linkedPayment.advance_received ?? 0) + (linkedPayment.final_payment_received ?? 0)) 
        : (linkedOrder 
            ? (linkedOrder.advance_received ?? 0) 
            : (updatedLead.advance_collected !== undefined && updatedLead.advance_collected !== null && updatedLead.advance_collected !== ''
                ? Number(updatedLead.advance_collected) 
                : 0));

      setConfirmForm(prev => ({
        ...prev,
        package_name: packages?.find((p) => String(p.package_id) === String(updatedLead.Select_Package_Option))?.package_name || updatedLead.Select_Package_Option || prev.package_name || '',
        quotation_amount: Number(updatedLead.Final_Package_Amount) || Number((updatedLead as any).final_package_amount) || Number(updatedLead.Final_Quotation_Amount) || Number((updatedLead as any).final_amount) || Number(updatedLead.budget) || (updatedLead.lead_id === selectedLead?.lead_id ? Number(wizardLeadData.final_amount) : 0) || prev.quotation_amount || 0,
        advance_received: typeof calcAdvance === 'number' && !isNaN(calcAdvance) ? calcAdvance : ((prev.advance_received !== '' && prev.advance_received !== undefined && prev.advance_received !== null && !isNaN(Number(prev.advance_received))) ? Number(prev.advance_received) : 0),
        event_date: updatedLead.event_date || prev.event_date || today,
        event_time: updatedLead.event_time || prev.event_time || ''
      }));
      setShowConfirmModal(true);
    } catch (err) {
      console.error(err);
      showToastMsg("Failed to save Reporting Details.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Order Confirmation Process
  const handleConfirmOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || isSaving) return;

    if (!confirmForm.event_date) {
      showToastMsg("Please select Confirmed Event Date.", "error");
      return;
    }

    const effectiveFinalAmt = Number(confirmForm.quotation_amount) || Number(selectedLead.Final_Package_Amount) || Number((selectedLead as any).final_package_amount) || Number(selectedLead.Final_Quotation_Amount) || (Number(wizardLeadData.final_amount) > 0 ? Number(wizardLeadData.final_amount) : 0);
    if (!effectiveFinalAmt || effectiveFinalAmt <= 0 || isNaN(effectiveFinalAmt)) {
      showToastMsg("Please enter Final Amount.", "error");
      return;
    }
    const numAdvance = (confirmForm.advance_received !== '' && confirmForm.advance_received !== undefined && confirmForm.advance_received !== null) ? Number(confirmForm.advance_received) : 0;
    if (isNaN(numAdvance) || numAdvance < 0) {
      showToastMsg("Please enter a valid Advance Paid Amount.", "error");
      return;
    }
    if (!confirmForm.transaction_id || !confirmForm.transaction_id.trim()) {
      showToastMsg("Please enter Payment Tracking ID / Transaction Reference Number.", "error");
      return;
    }

    // Validate that each event has a Reporting Date and Reporting Time
    if (selectedLead.events && selectedLead.events.length > 0) {
      for (let i = 0; i < selectedLead.events.length; i++) {
        const ev = selectedLead.events[i];
        const key = ev.id || `ev_${i}`;
        const rep = eventsReporting[key];
        const evTitle = ev.event_name || ev.event_type || `Event ${i + 1}`;
        if (!rep?.reporting_date || !rep.reporting_date.trim()) {
          showToastMsg(`Please enter Reporting Date for ${evTitle}.`, "error");
          return;
        }
        if (!rep?.reporting_time || !rep.reporting_time.trim()) {
          showToastMsg(`Please enter Reporting Time for ${evTitle}.`, "error");
          return;
        }
      }
    } else {
      const rep = eventsReporting['default'];
      if (!rep?.reporting_date || !rep.reporting_date.trim()) {
        showToastMsg("Please enter Reporting Date.", "error");
        return;
      }
      if (!rep?.reporting_time || !rep.reporting_time.trim()) {
        showToastMsg("Please enter Reporting Time.", "error");
        return;
      }
    }

    try {
      setIsSaving(true);

      // Save each event's reporting details to lead_events table in Supabase
      if (selectedLead.events && selectedLead.events.length > 0) {
        const updatedEvents = selectedLead.events.map((ev, idx) => {
          const key = ev.id || `ev_${idx}`;
          const rep = eventsReporting[key] || {
            reporting_date: ev.reporting_date || (ev as any).Reporting_date || ev.event_date || ev.event_start_date || selectedLead.Reporting_date || (selectedLead as any).reporting_date || selectedLead.event_date || '',
            reporting_time: ev.reporting_time || selectedLead.reporting_time || ''
          };
          return {
            ...ev,
            reporting_date: rep.reporting_date || ev.reporting_date || ev.event_date || '',
            reporting_time: rep.reporting_time || ev.reporting_time || ''
          };
        });

        await updateLead(selectedLead.lead_id, {
          events: updatedEvents,
          Reporting_date: updatedEvents[0]?.reporting_date || '',
          reporting_time: updatedEvents[0]?.reporting_time || ''
        });
      } else {
        const rep = eventsReporting['default'] || {
          reporting_date: selectedLead.Reporting_date || (selectedLead as any).reporting_date || selectedLead.event_date || '',
          reporting_time: selectedLead.reporting_time || ''
        };
        await updateLead(selectedLead.lead_id, {
          Reporting_date: rep.reporting_date,
          reporting_time: rep.reporting_time
        });
      }

      const firstRepTime = (selectedLead.events && selectedLead.events.length > 0)
        ? (eventsReporting[selectedLead.events[0].id || 'ev_0']?.reporting_time || selectedLead.events[0]?.reporting_time || selectedLead.reporting_time)
        : (eventsReporting['default']?.reporting_time || selectedLead.reporting_time);

      await confirmOrder(
        selectedLead.lead_id,
        confirmForm.package_name,
        effectiveFinalAmt,
        numAdvance,
        confirmForm.event_date,
        confirmForm.event_time,
        confirmForm.payment_mode,
        confirmForm.notes,
        firstRepTime,
        confirmForm.transaction_id
      );

      setShowConfirmModal(false);
      showToastMsg("Booking Confirmation saved successfully. Order transferred to Operations.", "success");
      setWizardLeadData(prev => ({
        ...prev,
        advance_received: numAdvance,
        status: 'Order Confirmed'
      }));
      setSalesStatus('Order Confirmed' as CurrentStage);
      setSelectedLead(null);
      if (activeTab === 'create') {
        resetForm();
        setActiveTab('list');
      }
    } catch (err: any) {
      console.error("Failed to convert order:", err);
      const errMsg = err?.message || String(err);
      const parsed = parseStatusUpdateError(errMsg);

      const oldStatus = selectedLead ? (selectedLead.current_status || selectedLead.status || 'New Lead') : null;

      try {
        logStatusUpdateError({
          leadId: selectedLead?.lead_id || null,
          orderId: null,
          oldStatus,
          newStatus: 'Order Confirmed',
          updatePayload: {
            status: 'Order Confirmed',
            event_date: confirmForm.event_date,
            event_time: confirmForm.event_time,
            reporting_time: undefined,
          },
          insertPayload: {
            order_status: 'Confirmed',
            current_stage: 'Order Confirmed',
            package_name: confirmForm.package_name,
            quotation_amount: Number(confirmForm.quotation_amount),
            advance_received: Number(confirmForm.advance_received),
          },
          dbResponse: null,
          fullError: err
        });
      } catch (logErr) {
        console.warn("Failed to log status update error:", logErr);
      }

      setStatusError({
        title: "Action Button Order Confirmation Failed",
        reason: parsed.reason,
        suggestedFix: parsed.suggestedFix
      });
      showToastMsg(parsed.reason || "Failed to confirm order.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const createdLeadRecord = createdLeadId ? leads?.find((l: Lead) => l.lead_id === createdLeadId) : null;
  const isCreatedLeadConfirmed = createdLeadRecord
    ? (['Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed'].includes(createdLeadRecord.status || '') ||
       (createdLeadRecord as any).current_status === 'Order Confirmed' ||
       (createdLeadRecord as any).booking_status === 'Confirmed' ||
       (getLeadCurrentStatus && getLeadCurrentStatus(createdLeadRecord) === 'Order Confirmed') ||
       (getLeadCurrentStage && ['Operations', 'Production', 'Post-Production', 'Completed'].includes(getLeadCurrentStage(createdLeadRecord))) ||
       (orders && orders.some((o: any) => o.lead_id === createdLeadRecord.lead_id && o.status !== 'Cancelled')) ||
       salesStatus === 'Order Confirmed' ||
       wizardLeadData.status === 'Order Confirmed')
    : (salesStatus === 'Order Confirmed' || wizardLeadData.status === 'Order Confirmed');

  const handleCreateFlowOrderConfirm = () => {
    const targetLead = createdLeadRecord || {
      lead_id: createdLeadId || 'NEW-LEAD',
      customer_name: createForm.customer_name,
      mobile: createForm.mobile,
      whatsapp_number: createForm.whatsapp_number,
      status: 'Create Quote',
      budget: finalTotal,
      package_price: finalTotal,
      Final_Quotation_Amount: finalTotal,
      Final_Package_Amount: finalTotal,
      final_package_amount: finalTotal,
      Select_Package_Option: selectedPkgIds[0] || createForm.selected_package_id || createForm.Select_Package_Option || 'Custom Package',
      events: createEvents && createEvents.length > 0 ? createEvents : []
    } as Lead;

    const activeEventsList = (createEvents && createEvents.length > 0) ? createEvents : (targetLead.events || []);
    const activePkgId = selectedPkgIds[0] || createForm.selected_package_id || createForm.Select_Package_Option || targetLead.Select_Package_Option || 'Custom Package';
    const activePkgName = packages?.find((p: any) => String(p.package_id) === String(activePkgId))?.package_name || activePkgId;

    const leadForConfirmation: Lead = {
      ...targetLead,
      lead_id: createdLeadId || targetLead.lead_id || 'NEW-LEAD',
      customer_name: targetLead.customer_name || createForm.customer_name,
      mobile: targetLead.mobile || createForm.mobile,
      whatsapp_number: targetLead.whatsapp_number || createForm.whatsapp_number,
      status: targetLead.status || 'Create Quote',
      budget: finalTotal || targetLead.budget,
      package_price: finalTotal || targetLead.package_price,
      Final_Quotation_Amount: finalTotal || targetLead.Final_Quotation_Amount,
      Final_Package_Amount: finalTotal || targetLead.Final_Package_Amount,
      final_package_amount: finalTotal || targetLead.final_package_amount,
      Select_Package_Option: activePkgId,
      selected_package_id: activePkgId,
      events: activeEventsList
    };

    if (areReportingDetailsComplete && !areReportingDetailsComplete(leadForConfirmation)) {
      if (openReportingDetailsModal) {
        openReportingDetailsModal(leadForConfirmation, "Please complete and save the Reporting Details before confirming the order.");
      }
      return;
    }

    setSelectedLead(leadForConfirmation);

    const today = new Date().toISOString().split('T')[0];
    const linkedOrder = orders?.find((o: any) => o.lead_id === leadForConfirmation.lead_id);
    const linkedPayment = linkedOrder ? payments?.find((p: any) => p.order_id === linkedOrder.order_id) : null;
    const calcAdvance = linkedPayment 
      ? ((linkedPayment.advance_received ?? 0) + (linkedPayment.final_payment_received ?? 0)) 
      : (linkedOrder 
          ? (linkedOrder.advance_received ?? 0) 
          : (leadForConfirmation.advance_collected !== undefined && leadForConfirmation.advance_collected !== null && leadForConfirmation.advance_collected !== ''
              ? Number(leadForConfirmation.advance_collected) 
              : (wizardLeadData.advance_received !== undefined && wizardLeadData.advance_received !== null && wizardLeadData.advance_received !== ''
                  ? Number(wizardLeadData.advance_received)
                  : 0)));

    setConfirmForm({
      ...confirmForm,
      package_name: activePkgName,
      quotation_amount: finalTotal || Number(leadForConfirmation.Final_Quotation_Amount) || Number(leadForConfirmation.budget) || 0,
      advance_received: calcAdvance,
      event_date: (activeEventsList[0]?.event_date) || leadForConfirmation.event_date || today,
      event_time: (activeEventsList[0]?.event_time) || leadForConfirmation.event_time || ''
    });
    setShowConfirmModal(true);
  };

  // Companion lead metadata parse
  const getFollowUpDate = (remarks?: string) => {
    if (!remarks) return null;
    const match = remarks.match(/Next follow-up:\s*(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  };

  const todayStr = '2026-06-10';

  const statCreatedQuotation = leads.filter(l => {
    const st = getLeadCurrentStatus(l);
    return st === 'Create Quote' || st === 'Created Quotation' || st === 'New Lead';
  }).length;
  const statQuotesSent = leads.filter(l => {
    const st = getLeadCurrentStatus(l);
    return st === 'Quote Sent' || st === 'Quotation Sent';
  }).length;
  const statQuoteFollowups = leads.filter(l => {
    const st = getLeadCurrentStatus(l);
    return st === 'Quote Follow-up' || st === 'Follow Up' || st === 'Follow-up';
  }).length;
  const statConfirmedOrders = leads.filter(l => {
    const st = getLeadCurrentStatus(l);
    return st === 'Confirm Order' || st === 'Order Confirmed';
  }).length;
  const statLeadLost = leads.filter(l => {
    const st = getLeadCurrentStatus(l);
    return st === 'Lead Lost' || st === 'Lost Lead';
  }).length;

  // Filter Leads List
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = 
      lead.customer_name.toLowerCase().includes(filterQuery.toLowerCase()) || 
      lead.lead_id.toLowerCase().includes(filterQuery.toLowerCase()) ||
      lead.mobile.includes(filterQuery);

    const matchesSource = filterSource === '' || lead.lead_source === filterSource;
    const leadStatus = getLeadCurrentStatus(lead);
    const matchesStatus = filterStatus === '' 
      ? true 
      : filterStatus === 'Overdue' 
        ? (() => {
            if (leadStatus !== 'Follow Up') return false;
            const fDate = getFollowUpDate(lead.remarks);
            return fDate ? fDate < todayStr : false;
          })()
        : (() => {
            const statusLower = leadStatus.toLowerCase().trim();
            const filterLower = filterStatus.toLowerCase().trim();
            if (filterLower === 'create quote' || filterLower === 'created quotation') {
              return statusLower === 'create quote' || statusLower === 'created quotation' || statusLower === 'new lead';
            }
            if (filterLower === 'quote sent') {
              return statusLower === 'quote sent' || statusLower === 'quotation sent';
            }
            if (filterLower === 'quote follow-up') {
              return statusLower === 'quote follow-up' || statusLower === 'follow up' || statusLower === 'follow-up';
            }
            if (filterLower === 'confirm order') {
              return statusLower === 'confirm order' || statusLower === 'order confirmed';
            }
            if (filterLower === 'lead lost') {
              return statusLower === 'lead lost' || statusLower === 'lost lead';
            }
            if (filterLower === 'customer review') {
              return statusLower === 'customer review' || statusLower === 'client review' || statusLower === 'client review sent';
            }
            if (filterLower === 'project completed') {
              return statusLower === 'project completed' || statusLower === 'project closed' || statusLower === 'completed' || statusLower === 'closed' || statusLower === 'project delivered' || statusLower === 'delivered' || statusLower === 'approved' || statusLower === 'final approval' || statusLower === 'client approved';
            }
            if (filterLower === 'approved') {
              return statusLower === 'approved' || statusLower === 'client approved';
            }
            if (filterLower === 'project delivered') {
              return statusLower === 'project delivered' || statusLower === 'delivered';
            }
            if (filterLower === 'project closed') {
              return statusLower === 'project closed' || statusLower === 'closed';
            }
            if (filterLower === 'new project received') {
              return statusLower === 'new project received' || statusLower === 'new order received';
            }
            if (filterLower === 'follow up') {
              return statusLower === 'follow up' || statusLower === 'follow-up';
            }
            return statusLower === filterLower;
          })();
    const matchesSales = filterSalesPerson === '' || lead.sales_person === filterSalesPerson;
    const matchesDate = filterDate === '' || lead.event_date === filterDate;

    let matchesDateRange = true;
    if (appliedStartDate) {
      matchesDateRange = matchesDateRange && (lead.created_date >= appliedStartDate);
    }
    if (appliedEndDate) {
      matchesDateRange = matchesDateRange && (lead.created_date <= appliedEndDate);
    }

    return matchesSearch && matchesSource && matchesStatus && matchesSales && matchesDate && matchesDateRange;
  }).sort((a, b) => {
    const parseRegistrationTimestamp = (leadObj: Lead): number => {
      const raw = leadObj.created_at || leadObj.created_date || (leadObj as any).registered_date || (leadObj as any).registration_date || leadObj.updated_at;
      if (!raw) return 0;
      if (typeof raw === 'number') return raw;
      const s = String(raw).trim();
      if (!s) return 0;
      const parsed = new Date(s).getTime();
      if (!isNaN(parsed) && parsed > 0) return parsed;
      if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(s)) {
        const parts = s.split(/[-/]/);
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d.getTime();
      }
      return 0;
    };

    const timeB = parseRegistrationTimestamp(b);
    const timeA = parseRegistrationTimestamp(a);
    if (timeA !== timeB && timeA > 0 && timeB > 0) {
      return sortOrder === 'latest' ? timeB - timeA : timeA - timeB;
    }
    if (timeB > 0 && timeA === 0) return sortOrder === 'latest' ? 1 : -1;
    if (timeA > 0 && timeB === 0) return sortOrder === 'latest' ? -1 : 1;

    const idA = (a.lead_id || '').trim();
    const idB = (b.lead_id || '').trim();
    const comp = idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
    return sortOrder === 'latest' ? -comp : comp;
  });

  return (
    <div id="sales_module" className="space-y-6">
      {statusError && (
        <div className="fixed inset-0 bg-slate-955/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-4 flex items-center gap-3">
              <span className="p-2.5 bg-red-500/20 text-red-400 rounded-xl text-lg">⚠️</span>
              <div>
                <h3 className="font-bold text-slate-100 text-sm font-sans">{statusError.title || 'Status Update Failed'}</h3>
                <p className="text-[10px] text-red-400 font-mono tracking-wider">DATABASE SCHEMA / INTEGRITY EXCEPTION</p>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Reason:</span>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs text-red-300 font-mono leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {statusError.reason}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Suggested Fix / Schema Migration:</span>
                <div className="bg-emerald-950/20 border border-emerald-500/25 rounded-xl p-3 text-xs text-emerald-300 font-sans leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {statusError.suggestedFix}
                </div>
              </div>
            </div>

            <div className="bg-slate-950/40 border-t border-slate-800 px-6 py-3.5 flex justify-end">
              <button
                onClick={() => setStatusError(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-700"
              >
                Dismiss Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Bar */}
      {activeTab !== 'create' && activeTab !== 'custom_package_master' && !selectedLead && (
        <div 
          className={`${activeTab === 'calendar' ? 'hidden' : 'flex'} flex-col sm:flex-row sm:items-center justify-between gap-4`}
          style={activeTab === 'calendar' ? { display: 'none' } : undefined}
        >
          <DashboardGreetingHeader
            dashboardTitle="Sales Dashboard"
            userName={salesPersonName}
            userMobile={loggedInSalesMobile}
          />

          {/* Create and Tabs Controls */}
          <div className="flex items-center gap-2">
            <button
              id="btn_lead_tab_profiles"
              onClick={() => { setActiveTab('profiles'); setSelectedLead(null); setSelectedCustomerProfileId(null); }}
              className={`hidden px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                activeTab === 'profiles'
                  ? 'bg-zinc-900 border-zinc-750 text-white font-black hover:border-zinc-700'
                  : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              👥 Customer Profiles
            </button>

            <button
              id="btn_lead_tab_calendar"
              onClick={() => { setActiveTab('calendar'); setSelectedLead(null); setSelectedCustomerProfileId(null); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                activeTab === 'calendar'
                  ? 'bg-zinc-900 border-zinc-750 text-white font-black hover:border-zinc-700'
                  : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-zinc-405 group-hover:text-zinc-200" />
              <span>Sales Calendar</span>
            </button>
            
            {canEdit ? (
              <button
                id="btn_lead_create_flag"
                onClick={() => { setActiveTab('create'); setSelectedLead(null); }}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl shadow-sm cursor-pointer transition-all ${
                  activeTab === 'create'
                    ? 'bg-emerald-600 hover:bg-emerald-505 text-white'
                    : 'bg-emerald-500/10 hover:bg-emerald-600/20 text-emerald-450 border border-emerald-500/25'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Quotation</span>
              </button>
            ) : (
              <span className="text-[11px] bg-red-500/10 text-red-400 border border-red-500/20 rounded px-2.5 py-1 flex items-center gap-1.5" title="You are restricted from adding leads in this role.">
                <Ban className="w-3 h-3" />
                <span>Sales Access Blocked</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Sandbox Area */}
      {false && selectedLead && (
        <div className="hidden lg:grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Column A: Lead Details & Meta */}
          <div className="lg:col-span-4 bg-slate-850 rounded-xl border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded font-black border border-slate-700">
                  {selectedLead.lead_id}
                </span>
                <h3 className="text-base font-bold text-slate-100 mt-2">{selectedLead.customer_name}</h3>
              </div>
              <button 
                onClick={() => setSelectedLead(null)}
                className="p-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-450 hover:text-slate-250 text-xs rounded transition-all cursor-pointer text-slate-400"
              >
                Close Back
              </button>
            </div>

            {/* Informational Items */}
            <div className="space-y-3.5 text-xs">
              <div className="flex items-center gap-2.5 text-slate-350">
                <Phone className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="font-mono text-slate-200">{formatIndianPhoneNumber(selectedLead.mobile)}</span>
              </div>
              {selectedLead.alternate_mobile && (
                <div className="flex items-center gap-2.5 text-slate-350">
                  <Phone className="w-4 h-4 text-slate-505 flex-shrink-0" />
                  <span>Alt: <span className="font-mono text-slate-200">{formatIndianPhoneNumber(selectedLead.alternate_mobile)}</span></span>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-slate-350">
                <Mail className="w-4 h-4 text-slate-505 flex-shrink-0" />
                <span className="text-slate-200 break-words">{selectedLead.email}</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-350">
                <MapPin className="w-4 h-4 text-slate-505 flex-shrink-0" />
                <span className="text-slate-200">{selectedLead.event_location}</span>
              </div>
            </div>

            {/* Detailed Parameters */}
            <div className="border-t border-slate-800 pt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div>
                <span className="text-slate-500 block">Event Type</span>
                <strong className="text-slate-200 font-medium">{selectedLead.event_type === 'Other' ? (selectedLead.custom_event_name || selectedLead.custom_event_type || 'Other') : selectedLead.event_type}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Lead Source</span>
                <strong className="text-slate-200 font-medium">
                  {selectedLead.lead_source === 'Other' && selectedLead.Specify_Custom_Lead_Source_Name 
                    ? `Other: ${selectedLead.Specify_Custom_Lead_Source_Name}` 
                    : selectedLead.lead_source}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Events Scheduled</span>
                <div className="flex flex-col gap-1 mt-1">
                  {selectedLead.events && selectedLead.events.length > 0 ? (
                    selectedLead.events.map((ev, i) => (
                      <div key={i} className="text-xs">
                        <span className="text-amber-500 font-semibold">{ev.event_name || ev.event_type || 'Event'}</span>
                        <br/>
                        <strong className="text-slate-200 font-medium font-mono text-[10px]">{ev.event_date ? (formatDateDDMMYY(ev.event_date) || ev.event_date) : 'N/A'} {ev.event_start_time ? `@ ${formatTime12Hour(ev.event_start_time)}` : ''}</strong>
                      </div>
                    ))
                  ) : (
                    <strong className="text-slate-200 font-medium">{selectedLead.event_date ? (formatDateDDMMYY(selectedLead.event_date) || selectedLead.event_date) : 'N/A'} {selectedLead.event_time ? `@ ${formatTime12Hour(selectedLead.event_time)}` : ''}</strong>
                  )}
                </div>
              </div>
              <div>
                <span className="text-slate-500 block">Current Budget</span>
                <strong className="text-amber-400 font-extrabold font-mono">{formatINR(selectedLead.budget)}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">City / State</span>
                <strong className="text-slate-200 font-medium">{selectedLead.city || 'N/A'} / {selectedLead.state || 'N/A'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Pincode</span>
                <strong className="text-slate-200 font-medium">{selectedLead.pincode || 'N/A'}</strong>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block">Residence Address</span>
                <strong className="text-slate-200 font-medium block break-words">{selectedLead.client_residence_address || 'N/A'}</strong>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block">Package Option</span>
                <strong className="text-slate-200 font-medium block break-words">
                  {(() => {
                    const pkg = packages.find(p => p.package_id === selectedLead.Select_Package_Option);
                    return pkg ? `${pkg.package_name} (${selectedLead.Select_Package_Option})` : (selectedLead.Select_Package_Option || 'Not selected');
                  })()}
                </strong>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 text-[11px]">
              <span className="text-slate-500 block mb-1">Remarks & Audits</span>
              <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800 font-mono text-[10px] text-slate-400 max-h-36 overflow-y-auto whitespace-pre-wrap">
                {selectedLead.remarks || 'No remarks recorded.'}
              </div>
            </div>

            {/* Action Area: Convert Lead */}
            {canEdit && (
              <div className="border-t border-slate-800 pt-4">
                <button
                  id="btn_confirm_order"
                  onClick={() => {
                    if (!selectedLead) return;
                    const today = new Date().toISOString().split('T')[0];
                    const linkedOrder = orders?.find(o => o.lead_id === selectedLead.lead_id);
                    const linkedPayment = linkedOrder ? payments?.find(p => p.order_id === linkedOrder.order_id) : null;
                    const calcAdvance = linkedPayment 
                      ? ((linkedPayment.advance_received ?? 0) + (linkedPayment.final_payment_received ?? 0)) 
                      : (linkedOrder 
                          ? (linkedOrder.advance_received ?? 0) 
                          : (selectedLead.advance_collected !== undefined && selectedLead.advance_collected !== null && selectedLead.advance_collected !== ''
                              ? Number(selectedLead.advance_collected) 
                              : (wizardLeadData.advance_received !== undefined && wizardLeadData.advance_received !== null && wizardLeadData.advance_received !== ''
                                  ? Number(wizardLeadData.advance_received) 
                                  : 0)));
                    
                    setConfirmForm({
                      ...confirmForm,
                      package_name: packages?.find((p) => String(p.package_id) === String(selectedLead.Select_Package_Option))?.package_name || selectedLead.Select_Package_Option || '',
                      quotation_amount: Number(selectedLead.Final_Package_Amount) || Number((selectedLead as any).final_package_amount) || Number(selectedLead.Final_Quotation_Amount) || Number((selectedLead as any).final_amount) || Number(wizardLeadData.final_amount) || 0,
                      advance_received: calcAdvance,
                      event_date: selectedLead.event_date || today,
                      event_time: selectedLead.event_time || ''
                    });
                    initEventsReporting(selectedLead);
                    setShowConfirmModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-950/20 text-xs transition-all cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>CONFIRM ORDER CONTRACT</span>
                </button>
              </div>
            )}
          </div>

          {/* Column B: Follow-up Activity Logger */}
          <div className="lg:col-span-8 bg-slate-850 rounded-xl border border-slate-800 p-5">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5 pb-2.5 border-b border-slate-800 mb-4">
              <span>📝</span> Log Lead Follow-up activity & CRM notes
            </h3>

            {selectedLead && isLeadLocked && (
              <div className="p-4 mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left animate-fade-in relative z-10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider font-mono">
                    <span className="animate-pulse">🔒</span> Stage-Locked: Order Confirmed
                  </div>
                  <p className="text-[11px] text-slate-350 leading-relaxed font-sans">
                    This lead is lock-protected due to having officially transitioned to operations. Only payment schedules are editable.
                  </p>
                </div>
                {currentRole === 'Business Owner' && (
                  <button
                    type="button"
                    onClick={() => {
                      setUnlockReason('Data Correction');
                      setUnlockingRecordId(selectedLead.lead_id);
                    }}
                    className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg transition-all cursor-pointer font-mono font-extrabold uppercase tracking-wide border border-amber-500/20 shadow-lg"
                  >
                    🔓 Owner Override
                  </button>
                )}
              </div>
            )}

            {canEdit ? (
              <form onSubmit={handleFollowUpSubmit} className="space-y-4">
                <fieldset disabled={isLeadLocked} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
                    {/* Status Options */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Transition ERP Stage *
                      </label>
                      <select
                        value={followUpForm.status}
                        onChange={(e) => setFollowUpForm({ ...followUpForm, status: e.target.value as CurrentStage })}
                        className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="Quote Sent">Quote Sent</option>
                        <option value="Quote Follow-up">Quote Follow-up</option>
                        <option value="Confirm Order">Confirm Order</option>
                        {followUpForm.status && !['Quote Sent', 'Quote Follow-up', 'Confirm Order', 'Order Confirmed', 'Quotation Sent', 'Follow Up'].includes(followUpForm.status) && (
                          <option value={followUpForm.status}>{followUpForm.status}</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {(followUpForm.status === 'Confirm Order' || followUpForm.status === 'Order Confirmed') ? (
                    <div className="space-y-4 pt-2 border-t border-slate-800">
                      <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Configure Confirmed Order Settings</h4>
                      
                      {/* Read-only multiple events display */}
                      {selectedLead?.events && selectedLead.events.length > 0 && (
                        <div className="space-y-2 mb-4">
                          <label className="block text-xs font-medium text-slate-400 mb-2">Confirmed Event Dates</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedLead.events.map(ev => (
                              <div key={ev.id} className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 flex flex-col">
                                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-1">🎬 {ev.event_name || ev.event_type || 'Event'}</span>
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-slate-500 font-mono">Date:</span>
                                    <span className="text-[11px] text-slate-300 font-mono font-semibold">{ev.event_date ? (formatDateDDMMYY(ev.event_date) || ev.event_date) : 'N/A'}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-slate-500 font-mono">Time:</span>
                                    <span className="text-[11px] text-slate-300 font-mono font-semibold">{ev.event_start_time ? convertTo12Hour(ev.event_start_time) : 'N/A'}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Hidden inputs to preserve existing API requirements silently */}
                        <div className="hidden">
                          <label className="block text-xs font-medium text-slate-400 mb-1">Event Date * (Required)</label>
                          <input
                            type="date"
                            value={followUpForm.event_date || (selectedLead?.events?.[0]?.event_date) || ''}
                            onChange={(e) => setFollowUpForm({ ...followUpForm, event_date: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100"
                          />
                        </div>
                        <div className="hidden">
                          <label className="block text-xs font-medium text-slate-400 mb-1">Event Time * (Required)</label>
                          <TimePicker12Hour
                            value={followUpForm.event_time || (selectedLead?.events?.[0]?.event_start_time) || ''}
                            onChange={(val24) => setFollowUpForm({ ...followUpForm, event_time: val24 })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">
                            Reporting Time * (Required)
                          </label>
                          <TimePicker12Hour
                            required
                            value={followUpForm.reporting_time}
                            onChange={(val24) => setFollowUpForm({ ...followUpForm, reporting_time: val24 })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">
                            Final Amount (₹) *
                          </label>
                          <input
                            type="number"
                            required
                            value={followUpForm.quotation_amount}
                            onChange={(e) => setFollowUpForm({ ...followUpForm, quotation_amount: Number(e.target.value) })}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">
                            Advance Amount Received (₹)
                          </label>
                          <input
                            type="number"
                            value={followUpForm.advance_received}
                            onChange={(e) => setFollowUpForm({ ...followUpForm, advance_received: Number(e.target.value) })}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">
                            Payment Mode
                          </label>
                          <select
                            value={followUpForm.payment_mode}
                            onChange={(e) => setFollowUpForm({ ...followUpForm, payment_mode: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="UPI">UPI (GPay/PhonePe)</option>
                            <option value="Cash">Cash Handover</option>
                            <option value="Bank Transfer">Bank NFT/RTGS/IMPS</option>
                            <option value="Card">Credit/Debit Card</option>
                            <option value="Cheque">Cheque Deposit</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-slate-400 mb-1">
                            Payment Tracking ID / Transaction Reference Number *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Enter Transaction Ref / Tracking ID (e.g. TXN12345678)"
                            value={followUpForm.transaction_id || ''}
                            onChange={(e) => setFollowUpForm({ ...followUpForm, transaction_id: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Next Date */}
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">
                            Next Follow-up Action Date *
                          </label>
                          <input
                            type="date"
                            required
                            value={followUpForm.next_follow_up_date}
                            onChange={(e) => setFollowUpForm({ ...followUpForm, next_follow_up_date: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                          />
                        </div>

                        {/* Proposed budget */}
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">
                            Negotiated Quotation Amount (₹) *
                          </label>
                          <input
                            type="number"
                            required
                            value={followUpForm.quotation_amount}
                            onChange={(e) => setFollowUpForm({ ...followUpForm, quotation_amount: Number(e.target.value) })}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                          />
                        </div>
                      </div>

                      {/* Call reports */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Call / Conversation Notes *
                        </label>
                        <textarea
                          rows={4}
                          required
                          placeholder="Log exact customer concerns, desired outputs, specific package selections, or callbacks."
                          value={followUpForm.call_notes}
                          onChange={(e) => setFollowUpForm({ ...followUpForm, call_notes: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-750 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        ></textarea>
                      </div>

                      {/* Negotiation notes */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Negotiation Notes (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="Specific price offsets, discount justifications, extra features offered..."
                          value={followUpForm.negotiation_notes}
                          onChange={(e) => setFollowUpForm({ ...followUpForm, negotiation_notes: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-750 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </>
                  )}
                </fieldset>

                {/* Buttons */}
                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedLead(null)}
                    className="px-4 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg transition-all cursor-pointer"
                  >
                    Discard Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLeadLocked || isSaving}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-all border ${
                      isLeadLocked || isSaving
                      ? 'bg-slate-800/80 text-slate-500 border-slate-800/50 cursor-not-allowed opacity-50'
                      : 'bg-indigo-650 hover:bg-indigo-550 text-white border-indigo-500/10 cursor-pointer text-shadow'
                    }`}
                  >
                    {isSaving ? 'Saving...' : (isLeadLocked ? '🔒 Locked' : followUpForm.status === 'Order Confirmed' ? '💍 Confirm Order booking' : 'Save Follow-up Notes')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl space-y-2">
                <Ban className="w-10 h-10 text-slate-650 mx-auto" />
                <h4 className="text-sm font-semibold text-slate-350">Access Restrictions Active</h4>
                <p className="text-xs max-w-sm mx-auto">
                  Only the **Sales Team** or the **Business Owner** possess authorized write clearances to log client interaction updates. Keep testing with another persona.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Sandbox Area & Mobile Base view */}
      <div className="space-y-6">
        {selectedLead ? null : activeTab === 'calendar' ? (
          <SalesCalendar onSelectLead={(lead) => handleSelectLead(lead)} />
        ) : activeTab === 'profiles' ? (
          /* NEW SCREEN: Customer Profiles & History Timeline sub-tab */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Accounts Directory / Ledger */}
            <div className="lg:col-span-4 bg-slate-850 rounded-xl border border-slate-800 p-4 space-y-4 text-left">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 font-mono">
                  <span>👥</span> CLIENT ACCOUNTS ({getCustomers(leads, orders, payments).length})
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Unified customer profiles compiled via CRM phone & email graphs.
                </p>
              </div>

              {/* Search Customer Input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name, phone, email..."
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 pl-8 pr-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                />
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
                {customerSearchQuery && (
                  <button 
                    onClick={() => setCustomerSearchQuery('')} 
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Roster List */}
              <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                {(() => {
                  const items = getCustomers(leads, orders, payments);
                  const filtered = items.filter(c => 
                    c.customer_name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                    c.customer_id.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                    c.email.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                    c.mobile.includes(customerSearchQuery)
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="p-8 text-center text-slate-500 text-xs">
                        No clients match your query.
                      </div>
                    );
                  }

                  return filtered.map((cust) => {
                    const isSelected = selectedCustomerProfileId === cust.customer_id;
                    return (
                      <div
                        key={cust.customer_id}
                        onClick={() => {
                          setSelectedCustomerProfileId(cust.customer_id);
                          setIsQuickReorderView(false);
                        }}
                        className={`p-3 rounded-xl border transition-all text-left cursor-pointer ${
                          isSelected 
                            ? 'bg-indigo-600/10 border-indigo-500/40 shadow-sm shadow-indigo-505/10' 
                            : 'bg-slate-900 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] bg-slate-800 border border-slate-700 text-amber-500/90 px-2 py-0.5 rounded font-mono font-bold">
                            {cust.customer_id}
                          </span>
                          {cust.totalOrders >= 2 && (
                            <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-black uppercase">
                              🔥 REPEAT ({cust.totalOrders})
                            </span>
                          )}
                        </div>
                        
                        <h4 className="text-xs font-black text-slate-100 mt-2 font-sans break-words">
                          {cust.customer_name}
                        </h4>
                        
                        <div className="text-[10px] text-slate-400 font-mono mt-1 space-y-0.5">
                          <div className="break-words">{cust.email}</div>
                          <div>{formatIndianPhoneNumber(cust.mobile)}</div>
                        </div>

                        <div className="border-t border-slate-800/60 mt-2.5 pt-2 flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">Total CLV:</span>
                          <strong className="text-emerald-450 font-bold font-mono">{formatINR(cust.totalRevenue)}</strong>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Right Column: In-depth Timeline & Historiography Ledger */}
            <div className="lg:col-span-8 bg-slate-850 rounded-xl border border-slate-800 p-5 space-y-6 text-left">
              {(() => {
                const list = getCustomers(leads, orders, payments);
                // default to first customer if none is explicitly clicked
                const currentProfileId = selectedCustomerProfileId || (list.length > 0 ? list[0].customer_id : null);
                const cust = list.find(c => c.customer_id === currentProfileId);

                if (!cust) {
                  return (
                    <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl space-y-2">
                      <Users className="w-8 h-8 mx-auto text-slate-600 animate-pulse" />
                      <h4 className="text-sm font-semibold text-slate-400">Select customer profile</h4>
                      <p className="text-xs text-slate-505">Pick any client from the directory to review lifetime timeline history.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6 animate-fade-in text-slate-200">
                    {/* Header profile details */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-slate-900 border border-slate-750 font-mono text-amber-500 px-2.5 py-0.5 rounded font-black font-mono">
                            {cust.customer_id}
                          </span>
                          {cust.totalOrders >= 2 && (
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full font-black">
                              LOYAL RETIRED BUYER COHORT
                            </span>
                          )}
                        </div>
                        <h2 className="text-lg font-black text-white mt-1.5">{cust.customer_name}</h2>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400 font-mono text-[10px] mt-1.5">
                          <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-indigo-400" /> {cust.email}</span>
                          <span className="text-slate-800">|</span>
                          <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-indigo-400" /> {formatIndianPhoneNumber(cust.mobile)}</span>
                          {cust.alternate_mobile && (
                            <>
                              <span className="text-slate-800">|</span>
                              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-zinc-500" /> Alt: {formatIndianPhoneNumber(cust.alternate_mobile)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsQuickReorderView(!isQuickReorderView);
                            // Set event date default to next month
                            const defaultReorderDate = new Date();
                            defaultReorderDate.setMonth(defaultReorderDate.getMonth() + 1);
                            setReorderForm(prev => ({
                              ...prev,
                              event_date: defaultReorderDate.toISOString().split('T')[0]
                            }));
                          }}
                          className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-650 to-indigo-750 hover:from-indigo-600 hover:to-indigo-700 text-white font-black text-xs px-4 py-2 rounded-xl shadow-lg transition-all cursor-pointer font-sans"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isQuickReorderView ? "Close Reorder Desk" : "Create New Reorder"}</span>
                        </button>
                      )}
                    </div>

                    {/* Quick Reorder Config Section */}
                    {isQuickReorderView && (
                      <div className="bg-slate-900 border border-indigo-500/20 p-4 rounded-xl space-y-4 animate-fade-in-up">
                        <div className="border-b border-slate-800 pb-2">
                          <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest font-mono">
                            ✍️ CONFIGURE REPEAT SHOOT CONTRACT
                          </h4>
                          <p className="text-[10px] text-slate-400">
                            Book a new independent contract project. This generates a new Lead and verified Order ID, keeping customer ID intact.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className={reorderForm.event_type === 'Other' ? "sm:col-span-2 space-y-2" : ""}>
                            <label className="block text-[11px] font-medium text-slate-400 mb-1">Event Type</label>
                            <select
                              value={reorderForm.event_type}
                              onChange={(e) => setReorderForm({ ...reorderForm, event_type: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100"
                            >
                              {synchronizedEventTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>

                            {reorderForm.event_type === 'Other' && (
                              <div className="animate-fade-in-down mt-2">
                                <label className="block text-[11px] font-mono font-bold text-amber-500 mb-1.5">
                                  Custom Event Type *
                                </label>
                                <input
                                  type="text"
                                  required
                                  placeholder="Specify custom event type"
                                  value={reorderForm.custom_event_name}
                                  onChange={(e) => setReorderForm({ ...reorderForm, custom_event_name: e.target.value })}
                                  className="w-full bg-slate-950 border border-amber-500/50 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all text-white"
                                />
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-400 mb-1">Shoot Date *</label>
                            <input
                              type="date"
                              required
                              value={reorderForm.event_date}
                              onChange={(e) => setReorderForm({ ...reorderForm, event_date: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-400 mb-1">Execution Location</label>
                            <input
                              type="text"
                              placeholder="e.g. Grand Hyatt, Goa"
                              value={reorderForm.event_location}
                              onChange={(e) => setReorderForm({ ...reorderForm, event_location: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-400 mb-1">Package Designation</label>
                            <input
                              type="text"
                              placeholder="e.g. Royal Gold Cinema"
                              value={reorderForm.package_name}
                              onChange={(e) => setReorderForm({ ...reorderForm, package_name: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-440 mb-1">Quotation Contract Sum (₹)</label>
                            <input
                              type="number"
                              value={reorderForm.quotation_amount}
                              onChange={(e) => setReorderForm({ ...reorderForm, quotation_amount: Number(e.target.value), advance_received: Math.round(Number(e.target.value)/3) })}
                              className="w-full bg-slate-950 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-440 mb-1">Advance Deposited (₹)</label>
                            <input
                              type="number"
                              value={reorderForm.advance_received}
                              onChange={(e) => setReorderForm({ ...reorderForm, advance_received: Number(e.target.value) })}
                              className="w-full bg-slate-950 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                          <button
                            type="button"
                            onClick={() => setIsQuickReorderView(false)}
                            className="bg-slate-800 hover:bg-slate-750 px-4 py-1.5 text-xs rounded border border-slate-700 text-slate-350 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExecuteQuickReorder(cust)}
                            className="bg-indigo-600 hover:bg-indigo-555 px-4 py-1.5 text-xs text-white rounded font-bold shadow shadow-indigo-650/30 cursor-pointer"
                          >
                            Issue Repeat Order Contract
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Stats Summary widgets */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-750 text-indigo-400">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-mono block uppercase">Total Bookings</span>
                          <span className="text-sm font-black text-slate-100 font-mono">{cust.totalOrders}</span>
                        </div>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-750 text-emerald-400">
                          <DollarSign className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-mono block uppercase">Lifetime Revenue</span>
                          <span className="text-sm font-black text-emerald-400 font-mono">{formatINR(cust.totalRevenue)}</span>
                        </div>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-750 text-amber-500">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-mono block uppercase">Latest Event Date</span>
                          <span className="text-sm font-bold text-slate-205 font-mono">{cust.lastEventDate || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Timelines history segments */}
                    <div className="space-y-6">
                      
                      {/* Subsegment 1: Historical Inquiries Timeline */}
                      <div>
                        <h4 className="text-xs font-black text-slate-400 font-mono tracking-wider uppercase pb-2 border-b border-slate-800 mb-3 flex items-center gap-1.5">
                          <span>Inquiries Timeline</span>
                        </h4>
                        <div className="space-y-3">
                          {cust.leads.map((ld, i) => (
                            <div key={ld.lead_id} className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-0 before:w-0.5 before:bg-slate-800">
                              <span className="absolute left-[3px] top-[5px] w-1.5 h-1.5 rounded-full bg-indigo-505 ring-4 ring-slate-850" />
                              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs w-full">
                                <div className="flex-1 space-y-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] text-amber-400 font-bold">{ld.lead_id}</span>
                                    <span className="text-[11px] text-slate-400">
                                      Source: {ld.lead_source === 'Other' && ld.Specify_Custom_Lead_Source_Name ? `Other: ${ld.Specify_Custom_Lead_Source_Name}` : ld.lead_source}
                                    </span>
                                  </div>
                                  
                                  {/* Render each event separately */}
                                  <div className="space-y-2 mt-2">
                                    {ld.events && ld.events.length > 0 ? ld.events.map((ev, evIdx) => (
                                      <div key={ev.id || evIdx} className="bg-slate-950/40 p-2 rounded border border-slate-800/50">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-[10px] text-slate-500 font-mono">📅 {ev.event_name || ev.event_type || 'Event'}</span>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 font-mono text-[11px]">
                                          <span className="text-slate-300">Date: {ev.event_date || 'N/A'}</span>
                                          <span className="text-slate-300">Time: {ev.event_start_time ? convertTo12Hour(ev.event_start_time) : 'N/A'}</span>
                                        </div>
                                      </div>
                                    )) : (
                                      <div className="bg-slate-950/40 p-2 rounded border border-slate-800/50">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-[10px] text-slate-500 font-mono">📅 {ld.event_type || 'Event'}</span>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 font-mono text-[11px]">
                                          <span className="text-slate-300">Date: {ld.event_date || 'N/A'}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="bg-slate-800 px-2 py-0.5 rounded text-[9px] font-mono text-indigo-400 font-semibold uppercase">
                                    {ld.status}
                                  </span>
                                  <span className="font-mono text-[11px] text-emerald-450 font-black">
                                    {formatINR(ld.budget)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {cust.leads.length === 0 && (
                            <p className="text-[11px] text-slate-500 font-mono italic">No previous inquiries logged.</p>
                          )}
                        </div>
                      </div>

                      {/* Subsegment 2: Confirmed Orders History */}
                      <div>
                        <h4 className="text-xs font-black text-slate-400 font-mono tracking-wider uppercase pb-2 border-b border-slate-800 mb-3 flex items-center gap-1.5">
                          <span>Verified Orders & Contracts History</span>
                        </h4>
                        <div className="space-y-3">
                          {cust.orders.map((ord) => (
                            <div key={ord.order_id} className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                              <div className="flex-1 space-y-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-indigo-400 font-bold">{ord.order_id}</span>
                                  <span className="text-[11px] text-slate-400">
                                    Package: <strong className="text-slate-200">{ord.package_name}</strong> | Location: {ord.event_location}
                                  </span>
                                </div>

                                {/* Render each event separately */}
                                <div className="space-y-2 mt-2">
                                  {(() => {
                                    const ordLead = leads.find(l => l.lead_id === ord.lead_id);
                                    if (ordLead && ordLead.events && ordLead.events.length > 0) {
                                      return ordLead.events.map((ev, evIdx) => (
                                        <div key={ev.id || evIdx} className="bg-slate-950/40 p-2 rounded border border-slate-800/50">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] text-slate-500 font-mono">📅 {ev.event_name || ev.event_type || 'Event'}</span>
                                          </div>
                                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 font-mono text-[11px]">
                                            <span className="text-slate-300">Date: {ev.event_date || 'N/A'}</span>
                                            <span className="text-slate-300">Time: {ev.event_start_time ? convertTo12Hour(ev.event_start_time) : 'N/A'}</span>
                                          </div>
                                        </div>
                                      ));
                                    } else {
                                      return (
                                        <div className="bg-slate-950/40 p-2 rounded border border-slate-800/50">
                                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 font-mono text-[11px]">
                                            <span className="text-slate-300">Date: {ord.event_date || 'N/A'}</span>
                                          </div>
                                        </div>
                                      );
                                    }
                                  })()}
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <div className="text-slate-550 font-mono text-[10px] uppercase">Quotation</div>
                                  <strong className="text-emerald-450 text-[11px] font-mono font-black">{formatINR(ord.quotation_amount)}</strong>
                                </div>
                                <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] font-mono text-amber-500 font-semibold uppercase">
                                  {ord.order_status}
                                </span>
                              </div>
                            </div>
                          ))}
                          {cust.orders.length === 0 && (
                            <p className="text-[11px] text-slate-500 font-mono italic">No confirmed order folders detected.</p>
                          )}
                        </div>
                      </div>

                      {/* Subsegment 3: Payment History Ledger */}
                      <div>
                        <h4 className="text-xs font-black text-slate-400 font-mono tracking-wider uppercase pb-2 border-b border-slate-800 mb-3 flex items-center gap-1.5">
                          <span>Financial Ledger Payments History</span>
                        </h4>
                        <div className="space-y-3">
                          {(() => {
                            const customerOrdersIds = cust.orders.map(o => o.order_id);
                            const customerPayments = payments.filter(p => customerOrdersIds.includes(p.order_id));
                            
                            if (customerPayments.length === 0) {
                              return <p className="text-[11px] text-slate-550 font-mono italic">Awaiting payment ledger clearance logs...</p>;
                            }

                            return customerPayments.map(p => (
                              <div key={p.payment_id} className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div>
                                  <span className="text-slate-500 text-[10px] block font-mono">Invoice Code</span>
                                  <span className="font-mono text-indigo-400 font-bold">{p.payment_id} (Ref: {p.order_id})</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 text-[10px] block font-mono">Deposited Cash</span>
                                  <span className="font-mono text-emerald-445 font-bold">{formatINR(p.advance_received + p.final_payment_received)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-505 text-[10px] block font-mono">Balance Due</span>
                                  <span className={`font-mono font-black ${p.balance_due > 0 ? 'text-red-405 animate-pulse' : 'text-slate-405'}`}>{formatINR(p.balance_due)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 text-[10px] block font-mono">Clearance Status</span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold leading-none inline-block mt-0.5 uppercase ${
                                    p.payment_status === 'Cleared' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-455 border border-rose-500/20'
                                  }`}>
                                    {p.payment_status}
                                  </span>
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>

                      {/* Subsegment 4: Delivery History */}
                      <div>
                        <h4 className="text-xs font-black text-slate-400 font-mono tracking-wider uppercase pb-2 border-b border-slate-800 mb-3 flex items-center gap-1.5">
                          <span>Operational Crews & Delivery History</span>
                        </h4>
                        <div className="space-y-3">
                          {(() => {
                            const customerOrdersIds = cust.orders.map(o => o.order_id);
                            // Link production items
                            const linkedProduction = production.filter(prod => customerOrdersIds.includes(prod.order_id));

                            if (linkedProduction.length === 0) {
                              return <p className="text-[11px] text-slate-550 font-mono italic">Roster operations not yet dispatched to editors...</p>;
                            }

                            return linkedProduction.map(prod => (
                              <div key={prod.production_id} className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-xs flex justify-between items-center text-zinc-300">
                                <div>
                                  <span className="font-mono text-[10px] text-indigo-400 font-black">PROD-{prod.production_id} / {prod.order_id}</span>
                                  <div className="text-[11px] text-slate-450 mt-0.5">
                                    Editor assigned: <strong className="text-slate-205">{prod.editor_assigned || 'Unassigned'}</strong>
                                  </div>
                                </div>

                                <div className="text-right">
                                  <div className="text-[10px] text-slate-550 font-mono uppercase">Delivery Stage</div>
                                  <span className="text-amber-500 font-black font-mono text-[11px] uppercase">{prod.editing_status}</span>
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                      
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : activeTab === 'custom_package_master' ? (
          <CustomPackageMaster />
        ) : activeTab === 'packages' ? (
          /* NEW SCREEN: Package Management Catalog */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 text-left relative overflow-hidden font-sans">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" />
                  <span>Dynamic Package Catalog</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Manage core service offerings, pricing rates, and category bindings synced directly with Supabase.
                </p>
              </div>
              
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPackage(null);
                    setPkgForm({ 
                      package_name: '', 
                      category: 'Weddings', 
                      price: 0, 
                      status: 'Active', 
                      deliverables: '', 
                      team_members: '', 
                      seasonal_offer: '',
                      terms_conditions: '',
                      event_type: '',
                      duration: '',
                      package_includes: ''
                    });
                    setPkgTeamMembers([{ qty: 1, name: '' }]);
                    setPkgDeliverablesList([{ qty: 1, name: '' }]);
                    setPkgDeliverableInput('');
                    setCustomCategory('');
                    setIsAddFormOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all cursor-pointer border border-transparent"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create offering</span>
                </button>
              )}
            </div>

            {packageSuccessMsg && (
              <div id="package_success_banner" className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-300 font-medium flex items-center justify-between shadow-lg animate-fade-in">
                <span className="font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{packageSuccessMsg}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPackageSuccessMsg(null)}
                  className="text-emerald-400 hover:text-emerald-200 p-1 rounded-lg hover:bg-emerald-900/40 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {dbCategoryError && (
              <div id="db_category_error_banner" className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-400 font-medium space-y-1">
                <span className="font-bold flex items-center gap-1">⚠️ Database Schema Notice</span>
                <p>{dbCategoryError}</p>
              </div>
            )}

            {/* In-place Add / Edit Package Modal */}
            {(isAddFormOpen || editingPackage) && (
              <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 text-left text-xs bg-black/70 animate-fade-in overscroll-contain">
                <div
                  id="add_edit_package_modal"
                  className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl relative text-slate-350 overflow-hidden overscroll-contain"
                  style={{ maxHeight: 'calc(100dvh - 40px)' }}
                >
                  {/* Modal Header */}
                  <div className="border-b border-slate-800 p-4 sm:p-6 flex items-center justify-between shrink-0 bg-slate-900 z-10 select-none">
                    <h4 className="text-sm sm:text-base font-bold text-slate-100 font-mono tracking-wide flex items-center gap-2">
                      <span>{editingPackage ? '✏️ Edit Service Package' : '✨ Define New Service Package'}</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddFormOpen(false);
                        setEditingPackage(null);
                        setPkgForm({ 
                          package_name: '', 
                          category: 'Weddings', 
                          price: 0, 
                          status: 'Active', 
                          deliverables: '', 
                          team_members: '', 
                          seasonal_offer: '',
                          terms_conditions: '',
                          event_type: '',
                          duration: '',
                          package_includes: ''
                        });
                        setPkgTeamMembers([{ qty: 1, name: '' }]);
                        setPkgDeliverablesList([{ qty: 1, name: '' }]);
                        setPkgDeliverableInput('');
                        setCustomCategory('');
                      }}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                      title="Close modal"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Scrollable Form Body */}
                  <div
                    id="add_edit_package_modal_body"
                    className="overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-5 text-xs text-slate-300 flex-1 min-h-0 w-full max-w-full overscroll-contain"
                    style={{ overscrollBehavior: 'contain' }}
                  >
                    {/* SECTION 1: PACKAGE DETAILS */}
                    <div className="space-y-3 w-full max-w-full">
                      <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px] font-mono text-emerald-400">
                        Package Details
                      </label>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                        {/* Package Name */}
                        <div>
                          <label className="block text-slate-300 font-semibold mb-1 text-xs">
                            Package Name <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Traditional Wedding Photography"
                            value={pkgForm.package_name}
                            onChange={(e) => setPkgForm({ ...pkgForm, package_name: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-slate-200 focus:outline-none transition-colors text-xs font-sans"
                          />
                        </div>

                        {/* Package Category */}
                        <div>
                          <label className="block text-slate-300 font-semibold mb-1 text-xs">
                            Package Category <span className="text-rose-400">*</span>
                          </label>
                          <select
                            value={pkgForm.category}
                            onChange={(e) => setPkgForm({ ...pkgForm, category: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-slate-200 focus:outline-none transition-colors font-sans text-xs"
                          >
                            {categoriesList.filter(c => c !== 'CUSTOM_CATEGORY').map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                            <option value="CUSTOM_CATEGORY">➕ Create Custom Category...</option>
                          </select>
                          {pkgForm.category === 'CUSTOM_CATEGORY' && (
                            <div className="animate-slide-down mt-2">
                              <label className="block text-amber-400 font-semibold mb-1 text-[11px]">New Custom Category Name</label>
                              <input
                                type="text"
                                placeholder="e.g. Newborn Baby shoot"
                                value={customCategory}
                                onChange={(e) => setCustomCategory(e.target.value)}
                                className="w-full bg-slate-950 border border-amber-500/40 focus:border-amber-500 rounded-xl py-2 px-3 text-slate-200 focus:outline-none font-sans text-xs"
                              />
                            </div>
                          )}
                        </div>

                        {/* Package Price */}
                        <div>
                          <label className="block text-slate-300 font-semibold mb-1 text-xs">
                            Package Price (INR) <span className="text-rose-400">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold text-xs">₹</span>
                            <input
                              type="number"
                              placeholder="e.g. 25000"
                              value={pkgForm.price || ''}
                              onChange={(e) => setPkgForm({ ...pkgForm, price: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2 pl-7 pr-3 text-slate-200 focus:outline-none font-mono text-xs transition-colors"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: TEAM MEMBERS INCLUDED */}
                    <div className="border-t border-slate-800/80 pt-4 space-y-3 w-full max-w-full">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px] font-mono">
                          Team Members Included
                        </label>
                      </div>

                      {/* Column Header */}
                      <div className="flex items-center gap-2 sm:gap-3 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <div className="flex-1 min-w-0">Team Member Name / Role</div>
                        <div className="w-[60px] sm:w-[75px] text-center shrink-0">Qty</div>
                        <div className="w-9 sm:w-10 text-center shrink-0">Remove</div>
                      </div>

                      <div className="space-y-2.5 w-full max-w-full">
                        {pkgTeamMembers.map((member, index) => (
                          <div 
                            key={index} 
                            className="flex items-center gap-2 sm:gap-3 w-full min-w-0 animate-fade-in"
                          >
                            {/* Member Name */}
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                placeholder="e.g. Candid Photographer"
                                value={member.name}
                                onChange={(e) => {
                                  const newList = [...pkgTeamMembers];
                                  newList[index] = { ...member, name: e.target.value };
                                  setPkgTeamMembers(newList);
                                }}
                                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-slate-200 focus:outline-none font-sans text-xs"
                              />
                            </div>

                            {/* Qty */}
                            <div className="w-[60px] sm:w-[75px] shrink-0">
                              <input
                                type="number"
                                min="1"
                                value={member.qty || 1}
                                onChange={(e) => {
                                  const newList = [...pkgTeamMembers];
                                  newList[index] = { ...member, qty: Math.max(1, parseInt(e.target.value) || 1) };
                                  setPkgTeamMembers(newList);
                                }}
                                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl py-2 px-1 text-xs font-mono font-bold text-center text-emerald-400 focus:outline-none"
                              />
                            </div>

                            {/* Remove */}
                            <div className="w-9 sm:w-10 shrink-0 flex justify-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const newList = pkgTeamMembers.filter((_, idx) => idx !== index);
                                  setPkgTeamMembers(newList.length > 0 ? newList : [{ qty: 1, name: '' }]);
                                }}
                                className="w-9 h-9 sm:w-10 sm:h-10 text-slate-400 hover:text-rose-400 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-rose-500/30 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                                title="Remove item"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setPkgTeamMembers([...pkgTeamMembers, { qty: 1, name: '' }])}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add More</span>
                      </button>
                    </div>

                    {/* SECTION 3: DELIVERABLES */}
                    <div className="border-t border-slate-800/80 pt-4 space-y-3 w-full max-w-full">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px] font-mono">
                          Deliverables
                        </label>
                      </div>

                      {/* Column Header */}
                      <div className="flex items-center gap-2 sm:gap-3 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <div className="flex-1 min-w-0">Deliverable Name / Description</div>
                        <div className="w-[60px] sm:w-[75px] text-center shrink-0">Qty</div>
                        <div className="w-9 sm:w-10 text-center shrink-0">Remove</div>
                      </div>

                      <div className="space-y-2.5 w-full max-w-full">
                        {pkgDeliverablesList.map((del, index) => (
                          <div 
                            key={index} 
                            className="flex items-center gap-2 sm:gap-3 w-full min-w-0 animate-fade-in"
                          >
                            {/* Deliverable Name */}
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                placeholder="e.g. Traditional 30 Edited Photos"
                                value={del.name}
                                onChange={(e) => {
                                  const newList = [...pkgDeliverablesList];
                                  newList[index] = { ...del, name: e.target.value };
                                  setPkgDeliverablesList(newList);
                                  setPkgForm({ ...pkgForm, deliverables: JSON.stringify(newList) });
                                }}
                                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-slate-200 focus:outline-none font-sans text-xs"
                              />
                            </div>

                            {/* Qty */}
                            <div className="w-[60px] sm:w-[75px] shrink-0">
                              <input
                                type="number"
                                min="1"
                                value={del.qty || 1}
                                onChange={(e) => {
                                  const newList = [...pkgDeliverablesList];
                                  newList[index] = { ...del, qty: Math.max(1, parseInt(e.target.value) || 1) };
                                  setPkgDeliverablesList(newList);
                                  setPkgForm({ ...pkgForm, deliverables: JSON.stringify(newList) });
                                }}
                                className="w-full bg-slate-950 border border-slate-750 focus:border-emerald-500 rounded-xl py-2 px-1 text-xs font-mono font-bold text-center text-emerald-400 focus:outline-none"
                              />
                            </div>

                            {/* Remove */}
                            <div className="w-9 sm:w-10 shrink-0 flex justify-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const newList = pkgDeliverablesList.filter((_, idx) => idx !== index);
                                  const updatedList = newList.length > 0 ? newList : [{ qty: 1, name: '' }];
                                  setPkgDeliverablesList(updatedList);
                                  setPkgForm({ ...pkgForm, deliverables: JSON.stringify(updatedList) });
                                }}
                                className="w-9 h-9 sm:w-10 sm:h-10 text-slate-400 hover:text-rose-400 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-rose-500/30 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                                title="Remove item"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setPkgDeliverablesList([...pkgDeliverablesList, { qty: 1, name: '' }])}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add More</span>
                      </button>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-slate-800 shrink-0 bg-slate-900 z-10 select-none">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddFormOpen(false);
                        setEditingPackage(null);
                        setPkgForm({ 
                          package_name: '', 
                          category: 'Weddings', 
                          price: 0, 
                          status: 'Active', 
                          deliverables: '', 
                          team_members: '', 
                          seasonal_offer: '',
                          terms_conditions: '',
                          event_type: '',
                          duration: '',
                          package_includes: ''
                        });
                        setPkgTeamMembers([{ qty: 1, name: '' }]);
                        setPkgDeliverablesList([{ qty: 1, name: '' }]);
                        setPkgDeliverableInput('');
                        setCustomCategory('');
                      }}
                      className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all cursor-pointer font-medium border border-transparent"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!pkgForm.package_name.trim()) {
                           alert('Please supply a package name.');
                          return;
                        }
                        if (pkgForm.price <= 0) {
                          alert('Please enter a valid price greater than zero.');
                          return;
                        }

                        let resolvedCategory = pkgForm.category;
                        if (resolvedCategory === 'CUSTOM_CATEGORY') {
                          if (!customCategory.trim()) {
                            alert('Please enter a valid custom category name.');
                            return;
                          }
                          resolvedCategory = customCategory.trim();
                        }
                        
                        const filteredMembers = pkgTeamMembers.filter(item => item.name.trim() !== '');
                        const teamMembersStr = filteredMembers.length > 0 ? JSON.stringify(filteredMembers) : '';
                        
                        const filteredDeliverables = pkgDeliverablesList.filter(item => item.name.trim() !== '');
                        const deliverablesStr = filteredDeliverables.length > 0 ? JSON.stringify(filteredDeliverables) : '';
                        
                        const payload = {
                          ...pkgForm,
                          team_members: teamMembersStr,
                          deliverables: deliverablesStr,
                          category: resolvedCategory
                        };
                        
                        try {
                          setIsSaving(true);
                          if (editingPackage) {
                            await updatePackage(editingPackage.package_id, payload);
                          } else {
                            await addPackage(payload);
                          }
                          setIsAddFormOpen(false);
                          setEditingPackage(null);
                          setPkgForm({ 
                            package_name: '', 
                            category: 'Weddings', 
                            price: 0, 
                            status: 'Active', 
                            deliverables: '', 
                            team_members: '', 
                            seasonal_offer: '',
                            terms_conditions: '',
                            event_type: '',
                            duration: '',
                            package_includes: ''
                          });
                          setPkgTeamMembers([{ qty: 1, name: '' }]);
                          setPkgDeliverablesList([{ qty: 1, name: '' }]);
                          setCustomCategory('');
                        } catch (err: any) {
                          alert(`Failed to save package: ${err.message || err}`);
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      disabled={isSaving}
                      className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all cursor-pointer border border-transparent disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                      {isSaving ? 'Saving...' : 'Save Package'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Custom Multi-Search & Filters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-center bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
              {/* Search Package Field */}
              <div className="relative w-full">
                <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase tracking-tight">Search Package</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search package name..."
                    value={catSearchQuery}
                    onChange={(e) => setCatSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-8 pr-4 text-xs text-slate-250 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                  {catSearchQuery && (
                    <button
                      onClick={() => setCatSearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter by Category selection */}
              <div className="w-full">
                <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase tracking-tight font-sans">Filter by Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2.5 text-xs text-slate-250 focus:outline-none cursor-pointer"
                >
                  <option value="All">All Categories ({categoriesList.length})</option>
                  {categoriesList.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Filter by Status selection */}
              <div className="w-full">
                <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase tracking-tight font-sans">Filter by Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2.5 text-xs text-slate-250 focus:outline-none cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active Packages Only</option>
                  <option value="Inactive">Inactive Packages Only</option>
                </select>
              </div>
            </div>

            {/* Category Listing Grid */}
            <div className="space-y-6">
              {categoriesList.map((cat) => {
                // Respect category filter
                if (categoryFilter !== 'All' && cat !== categoryFilter) return null;

                const catPkgs = (packages || []).filter(
                  p => normalizeCategory(p.category) === cat && 
                  p.package_name.toLowerCase().includes(catSearchQuery.toLowerCase()) &&
                  (statusFilter === 'All' || p.status === statusFilter)
                );
                
                if (catPkgs.length === 0) return null;
                
                return (
                  <div key={cat} className="space-y-2.5 text-left animate-fade-in">
                    <h4 className="text-[10px] font-black font-mono tracking-wider text-slate-400 border-b border-slate-800 pb-1 uppercase flex justify-between items-center bg-slate-950/20 px-2 py-1 rounded">
                      <span>{cat}</span>
                      <span className="text-slate-500 font-mono">({catPkgs.length})</span>
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                      {catPkgs.map((pkg: any) => {
                        const deliverableItems = parsePackageDeliverables(pkg.deliverables);

                        return (
                          <div
                            key={pkg.package_id}
                            className="bg-slate-955 border border-slate-850 hover:border-slate-800 p-4 sm:p-5 rounded-xl flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-black/40 relative group"
                          >
                            {/* Card Top: Package Header & Deliverables */}
                            <div className="flex-1 flex flex-col">
                              {/* Header: ID & Status Badge */}
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="font-mono text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                                  {pkg.package_id}
                                </span>
                                <span className={`px-2 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wider rounded border ${
                                  pkg.status === 'Active'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                                }`}>
                                  {pkg.status}
                                </span>
                              </div>

                              {/* Package Name */}
                              <h5 className="text-sm font-bold text-slate-100 leading-snug tracking-tight mb-3">
                                {pkg.package_name}
                              </h5>

                              {/* Deliverables: Professional readable list */}
                              <div className="flex-1 pb-3 flex flex-col justify-start">
                                {deliverableItems.length > 0 ? (
                                  <ul className="space-y-1.5 text-left">
                                    {deliverableItems.map((item: ParsedDeliverableItem, idx: number) => {
                                      const isLeadingSpecOrAdjective =
                                        /^(?:unlimited|approx|all|raw|free|complimentary)\b/i.test(item.name) ||
                                        /^\d+\s*(?:edited|photos?|pics?|pages?|sheets?|min|hrs?|hours?)/i.test(item.name);
                                      const showQty = item.hasQty && (item.qty > 1 || !isLeadingSpecOrAdjective);

                                      return (
                                        <li key={idx} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                                          <span className="text-emerald-400 font-bold select-none shrink-0 leading-tight mt-0.5">•</span>
                                          <span className="break-words">
                                            {showQty && (
                                              <strong className="font-semibold text-slate-100">{item.qty} × </strong>
                                            )}
                                            <span>{item.name}</span>
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-slate-500 italic py-1">
                                    No custom deliverables specified
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Card Bottom: Price and Actions */}
                            <div className="pt-3 border-t border-slate-850/80 mt-auto flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-sm sm:text-base font-bold text-emerald-400 tracking-tight">
                                  ₹{Number(pkg.price || 0).toLocaleString('en-IN')}
                                </span>
                              </div>
                              
                              {canEdit && (
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingPackage(pkg);
                                      setPkgForm({
                                        package_name: pkg.package_name,
                                        category: pkg.category,
                                        price: pkg.price,
                                        status: pkg.status as 'Active' | 'Inactive',
                                        deliverables: pkg.deliverables || '',
                                        team_members: pkg.team_members || '',
                                        seasonal_offer: pkg.seasonal_offer || '',
                                        terms_conditions: pkg.terms_conditions || '',
                                        event_type: pkg.event_type || '',
                                        duration: pkg.duration || '',
                                        package_includes: pkg.package_includes || ''
                                      });
                                      const parsed = parseTeamMembers(pkg.team_members);
                                      setPkgTeamMembers(parsed.length > 0 ? parsed.map(s => { const r = parseQtyAndText(s); return { qty: r.qty, name: r.text }; }) : [{ qty: 1, name: '' }]);
                                      const parsedDel = parseTeamMembers(pkg.deliverables);
                                      setPkgDeliverablesList(parsedDel.length > 0 ? parsedDel.map(s => { const r = parseQtyAndText(s); return { qty: r.qty, name: r.text }; }) : []);
                                      setCustomCategory('');
                                      setIsAddFormOpen(true);
                                    }}
                                    className="h-8 px-2 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white text-[10px] uppercase font-mono tracking-wider font-bold border border-slate-800 hover:border-slate-700 rounded-lg transition-all cursor-pointer text-center flex items-center justify-center whitespace-nowrap shadow-sm"
                                    title="Edit package details"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const nextStatus = pkg.status === 'Active' ? 'Inactive' : 'Active';
                                      await updatePackage(pkg.package_id, { status: nextStatus });
                                    }}
                                    className={`h-8 px-2 text-center text-[10px] uppercase font-mono tracking-wider font-bold border rounded-lg transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shadow-sm ${
                                      pkg.status === 'Active'
                                        ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/25 text-amber-400 hover:text-amber-300'
                                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/25 text-emerald-400 hover:text-emerald-300'
                                    }`}
                                    title={pkg.status === 'Active' ? "Deactivate Package" : "Activate Package"}
                                  >
                                    {pkg.status === 'Active' ? 'Deactivate' : 'Activate'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeletingPackageId(pkg.package_id);
                                    }}
                                    className="h-8 px-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 hover:text-rose-300 text-[10px] uppercase font-mono tracking-wider font-bold rounded-lg transition-all cursor-pointer text-center flex items-center justify-center whitespace-nowrap shadow-sm"
                                    title="Delete Package"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeTab === 'create' ? (
          /* SCREEN 2: Create Lead Layout as dedicated Full Page inside the application */
          <div 
            id="create_lead_form"
            className="bg-[#030303] border border-slate-800 rounded-2xl w-full shadow-2xl flex flex-col overflow-hidden relative max-h-[85vh] lg:max-h-[90vh]"
          >
            <button 
              type="button"
              onClick={() => { resetForm(); setActiveTab('list'); }}
              className="absolute top-2 right-3 z-20 p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center border border-transparent hover:border-slate-700/50 bg-slate-950/80"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {crmToast && (
              <div id="crm-create-toast-container" className={`mx-4 mt-4 p-3 rounded-xl shadow-lg flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200 shrink-0 ${
                crmToast.type === 'success' 
                  ? 'bg-emerald-950/90 border border-emerald-500/20 text-emerald-400' 
                  : 'bg-red-950/90 border border-red-500/20 text-red-400'
              }`}>
                <span>{crmToast.type === 'success' ? '⚡' : '⚠️'}</span>
                <span className="text-[11px] font-mono font-bold whitespace-pre-wrap">{crmToast.message}</span>
              </div>
            )}

            {/* Wizard Progress Bar */}
            <div className="bg-slate-955/30 px-4 sm:px-6 py-1.5 border-b border-slate-800/50 shrink-0">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                {[
                  { step: 1, label: 'Customer' },
                  { step: 2, label: 'Event Info' },
                  { step: 3, label: 'CRM & Quotation' }
                ].map((item) => {
                  const isActive = wizardStep === item.step;
                  const isCompleted = wizardStep > item.step;
                  return (
                    <div key={item.step} className="flex flex-col items-center sm:items-start text-center sm:text-left space-y-1">
                      <div className="w-full flex items-center gap-1">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black font-mono transition-all duration-300 ${
                          isActive 
                            ? 'bg-cyan-500 text-slate-950 ring-4 ring-cyan-500/10' 
                            : isCompleted 
                              ? 'bg-emerald-500 text-slate-955' 
                              : 'bg-slate-800 text-slate-500'
                        }`}>
                          {isCompleted ? '✓' : item.step}
                        </span>
                        <div className={`hidden sm:block flex-1 h-0.5 rounded transition-all duration-300 ${
                          isCompleted ? 'bg-emerald-500' : 'bg-slate-800'
                        }`} />
                      </div>
                      <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${
                        isActive ? 'text-cyan-400' : isCompleted ? 'text-emerald-400' : 'text-slate-500'
                      }`}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Body: Content Fields */}
            <div className="p-3 sm:p-4 overflow-y-auto shrink min-h-0 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              
              {/* STEP 1: CUSTOMER DETAILS */}
              {wizardStep === 1 && (
                <div className="bg-slate-950/30 border border-slate-800/60 rounded-xl p-4 space-y-4 shadow-sm animate-fade-in">
                  <div className="flex items-center gap-2 border-b border-slate-800/50 pb-2 mb-1">
                    <Users className="w-4 h-4 text-cyan-405" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">1. Customer Details</span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Customer Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-404 mb-1.5">
                        Customer Full Name (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Rahul Sharma"
                        value={createForm.customer_name}
                        onChange={(e) => setCreateForm({ ...createForm, customer_name: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all font-sans"
                      />
                    </div>

                    {/* Mobile Number */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-404 mb-1.5">
                        Mobile Number *
                      </label>
                      <input
                        id="input_mobile"
                        type="text"
                        required
                        placeholder="e.g. 9876543210"
                        value={createForm.mobile}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^\d]/g, '').slice(0, 10);
                          setCreateForm({ ...createForm, mobile: val });
                          if (val.length === 10) {
                            handleCheckExistingCustomer('phone', val);
                          }
                        }}
                        onBlur={(e) => handleCheckExistingCustomer('phone', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all font-mono"
                      />
                    </div>

                    {/* WhatsApp Number */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-404">
                          WhatsApp Number
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (createForm.mobile) {
                              setCreateForm(prev => ({ ...prev, whatsapp_number: prev.mobile }));
                            }
                          }}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wider cursor-pointer hover:underline"
                        >
                          Copy Mobile
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="WhatsApp contact number"
                        value={createForm.whatsapp_number}
                        onChange={(e) => setCreateForm({ ...createForm, whatsapp_number: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all font-mono"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-404 mb-1.5">
                        Email (Optional)
                      </label>
                      <input
                        type="email"
                        placeholder="customer@domain.com"
                        value={createForm.email}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCreateForm({ ...createForm, email: val });
                          if (val.includes('@') && val.length > 5 && (val.endsWith('.com') || val.endsWith('.in') || val.endsWith('.org'))) {
                            handleCheckExistingCustomer('email', val);
                          }
                        }}
                        onBlur={(e) => handleCheckExistingCustomer('email', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all font-sans"
                      />
                    </div>

                    {/* Lead Source */}
                    <div className="space-y-2 text-left">
                      <div>
                        <label className="block text-xs font-semibold text-slate-404 mb-1.5">
                          Inbound Lead Channel Source *
                        </label>
                        <select
                          value={createForm.lead_source}
                          required
                          onChange={(e) => setCreateForm({ ...createForm, lead_source: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all cursor-pointer"
                        >
                          <option value="">Select Lead Source</option>
                          {LEAD_SOURCES.map(source => (
                            <option key={source} value={source}>{source}</option>
                          ))}
                        </select>
                      </div>
                      {createForm.lead_source === 'Other' && (
                        <div className="animate-fade-in-down">
                          <label className="block text-xs font-mono font-bold text-amber-500 mb-1.5">
                            Specify Custom Lead Source Name *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Billboard, Event Flyer"
                            value={otherSource}
                            onChange={(e) => setOtherSource(e.target.value)}
                            className="w-full bg-slate-955 border border-amber-500/50 rounded-lg py-2 px-3 text-xs text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                          />
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* STEP 2: EVENT DETAILS */}
              {wizardStep === 2 && (
                <div className="bg-slate-950/30 border border-slate-800/60 rounded-xl p-4.5 space-y-4 shadow-sm animate-fade-in text-left">
                  <div className="flex items-center gap-2 border-b border-slate-800/50 pb-2 mb-1 text-left">
                    <Calendar className="w-4 h-4 text-cyan-405" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">2. Event Details</span>
                  </div>

                  {renderEventDetailsSection(false)}
                </div>
              )}

              {/* STEP 3: PACKAGE SELECTION */}
              {wizardStep === 3 && (
                <div className="bg-slate-950/30 border border-slate-800/60 rounded-xl p-4.5 space-y-4 shadow-sm animate-fade-in text-left">
                  <div className="flex items-center gap-2 border-b border-slate-800/50 pb-2 mb-1">
                    <CheckSquare className="w-4 h-4 text-cyan-405" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">3. Package Selection</span>
                  </div>

                  {renderStep3Workspace(false)}
                </div>
              )}
            </div>

            {/* Sticky Footer */}
            <div className="flex justify-between items-center gap-3 border-t border-slate-800/80 py-2 px-4 sm:px-5 bg-slate-950/40 backdrop-blur-md shrink-0">
              {/* Back or Cancel */}
              <div className="flex items-center gap-2">
                {wizardStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep(wizardStep - 1)}
                    className="px-4.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl cursor-pointer border border-slate-850 hover:border-slate-700 transition-colors"
                  >
                    ← Back Step
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { resetForm(); setActiveTab('list'); }}
                    className="px-4.5 py-2 text-xs font-semibold bg-slate-805 hover:bg-slate-800 text-slate-300 rounded-xl cursor-pointer border border-slate-800 hover:border-slate-700/50 transition-colors"
                  >
                    Back
                  </button>
                )}
                {wizardStep === 2 && (!createdLeadId || leads.find(l => l.lead_id === createdLeadId)?.status === 'New Lead') && (
                  <div />
                )}
              </div>

              {/* Next or Save */}
              {wizardStep < 3 ? (
                <button
                  type="button"
                  onClick={handleWizardNext}
                  disabled={isSaving || (wizardStep === 3 && selectedPkgIds.length === 0)}
                  className={`px-5.5 py-2 text-xs font-bold text-white rounded-xl shadow-lg border border-transparent transition-colors flex items-center gap-1.5 ${
                    wizardStep === 3 && selectedPkgIds.length === 0
                      ? 'bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed opacity-50 shadow-none'
                      : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/10 cursor-pointer'
                  }`}
                >
                  {isSaving ? 'Processing...' : 'Save & Continue →'}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {!isCreatedLeadConfirmed && (
                    <button
                      type="button"
                      id="btn_step3_order_confirmed"
                      onClick={handleCreateFlowOrderConfirm}
                      disabled={isSaving || (selectedPkgIds.length === 0 && !createForm.selected_package_id && !createForm.Select_Package_Option)}
                      className={`px-4 py-2 text-xs font-mono font-bold uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 border-0 ${
                        (selectedPkgIds.length === 0 && !createForm.selected_package_id && !createForm.Select_Package_Option)
                          ? 'bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed opacity-50 shadow-none'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-emerald-950/20'
                      }`}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>ORDER CONFIRMED</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      if (salesStatus === 'Order Confirmed') {
                        handleOrderConfirmedSubmit(e);
                      } else {
                        handleStatusSave();
                      }
                    }}
                    disabled={isSaving}
                    className="px-5.5 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl shadow-lg shadow-emerald-500/10 cursor-pointer border border-transparent transition-colors flex items-center gap-1.5"
                  >
                    {isSaving ? 'Saving...' : salesStatus === 'Order Confirmed' ? '🎉 Confirm Order & Transition' : '✍️ Create Quotation'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
        /* SCREEN 1: Lead List datagrid */
        <div className="space-y-4">

          {/* Sales Performance Dashboard Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mt-2">
            {[
              { label: 'Create Quote', val: statCreatedQuotation, theme: 'blue' as CameraLensTheme, filterValue: 'Create Quote', chartPoints: [10, 15, 12, 18, 14, 20, 16], trendText: 'Initial Lead' },
              { label: 'Quote Sent', val: statQuotesSent, theme: 'purple' as CameraLensTheme, filterValue: 'Quote Sent', chartPoints: [12, 14, 18, 15, 21, 25, 22], trendText: 'Quotation Saved' },
              { label: 'Quote Follow-up', val: statQuoteFollowups, theme: 'gold' as CameraLensTheme, filterValue: 'Quote Follow-up', chartPoints: [5, 12, 8, 15, 10, 19, 14], trendText: 'Scheduled CRM' },
              { label: 'Confirm Order', val: statConfirmedOrders, theme: 'cyan' as CameraLensTheme, filterValue: 'Confirm Order', chartPoints: [8, 15, 12, 20, 16, 25, 24], trendText: 'To Operations' },
              { label: 'Lead Lost', val: statLeadLost, theme: 'red' as CameraLensTheme, filterValue: 'Lead Lost', chartPoints: [4, 6, 3, 7, 5, 8, 4], trendText: 'Opportunity Closed' },
            ].map((card, idx) => (
              <CameraLensStatsCard
                key={idx}
                label={card.label}
                val={card.val}
                theme={card.theme}
                trendText={card.trendText}
                subText="SALES STATUS"
                chartPoints={card.chartPoints}
                activeFilterValue={filterStatus}
                currentFilterValue={card.filterValue}
                onClick={() => setFilterStatus(filterStatus === card.filterValue ? '' : card.filterValue)}
                lensLabel={card.label.slice(0, 10).toUpperCase()}
              />
            ))}
          </div>
          
          {/* Leads Directory Header Bar & Collapsible Utilities */}
          {(() => {
            const activeFilterCount = [
              Boolean(filterQuery.trim()),
              Boolean(filterSource),
              Boolean(filterStatus),
              Boolean(dateRangeStart || appliedStartDate),
              Boolean(dateRangeEnd || appliedEndDate)
            ].filter(Boolean).length;

            return (
              <div className="space-y-3">
                {/* Leads Directory Title & Control Buttons Bar */}
                <div className="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-850 shadow-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">📁</span>
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono">Leads Directory</h3>
                        <p className="text-[10px] text-zinc-400">Export active pipeline registers using start and end filters</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                      {/* Sort Order Filter Button */}
                      <ListSortFilter value={sortOrder} onChange={setSortOrder} />

                      {/* Event Date Filter selector (Most Recent Event / Last Event / All) */}
                      <div className="relative">
                        <select
                          id="select_event_date_filter_toolbar_module"
                          value={filterEventDateOption || 'all'}
                          onChange={(e) => {
                            const val = e.target.value as 'all' | 'most_recent' | 'last_event' | '';
                            if (setFilterEventDateOption) {
                              setFilterEventDateOption(val === 'all' ? '' : val);
                            }
                          }}
                          className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer shadow-sm appearance-none pr-8 ${
                            filterEventDateOption && filterEventDateOption !== 'all'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-500/10'
                              : 'bg-zinc-950 hover:bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                          }`}
                          title="Event Date Filter: Most Recent Event, Last Event, All"
                        >
                          <option value="most_recent" className="bg-zinc-950 text-amber-300">Most Recent Event</option>
                          <option value="last_event" className="bg-zinc-950 text-amber-300">Last Event</option>
                          <option value="all" className="bg-zinc-950 text-zinc-300">All</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>

                      {/* Download Reports Button */}
                      <button
                        type="button"
                        id="btn_toggle_download_reports"
                        onClick={() => setIsDownloadReportsExpanded(!isDownloadReportsExpanded)}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer shadow-sm ${
                          isDownloadReportsExpanded
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-500/10'
                            : 'bg-zinc-950 hover:bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <span>📥</span>
                        <span>Download Reports</span>
                        {isDownloadReportsExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-amber-400 ml-0.5 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 ml-0.5 shrink-0" />
                        )}
                      </button>

                      {/* Filters Toggle Button */}
                      <button
                        type="button"
                        id="btn_toggle_filters"
                        onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer shadow-sm ${
                          isFiltersExpanded || activeFilterCount > 0
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10'
                            : 'bg-zinc-950 hover:bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <Filter className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Filters</span>
                        {activeFilterCount > 0 && (
                          <span className="bg-emerald-500 text-zinc-950 text-[10px] font-black px-1.5 py-0.2 rounded-full font-mono">
                            {activeFilterCount}
                          </span>
                        )}
                        {isFiltersExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-emerald-400 ml-0.5 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 ml-0.5 shrink-0" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Collapsible Download Reports Options Panel */}
                  <div 
                    className={`grid transition-all duration-300 ease-in-out ${
                      isDownloadReportsExpanded 
                        ? 'grid-rows-[1fr] opacity-100 pt-3 border-t border-zinc-800/60' 
                        : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handlePrintReport}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-zinc-950 hover:bg-zinc-900 text-amber-400 border border-zinc-850 hover:border-zinc-800 rounded-lg transition-all cursor-pointer"
                          title="Print lead report to paper"
                        >
                          <span>🖨️</span> Print Report
                        </button>
                        
                        <button
                          type="button"
                          onClick={handlePrintReport}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-zinc-950 hover:bg-zinc-900 text-rose-400 border border-zinc-850 hover:border-zinc-800 rounded-lg transition-all cursor-pointer"
                          title="Download report as PDF format"
                        >
                          <span>📄</span> Download PDF
                        </button>
                        
                        <button
                          type="button"
                          onClick={handleDownloadExcel}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-zinc-950 hover:bg-zinc-900 text-emerald-450 border border-zinc-850 hover:border-zinc-800 rounded-lg transition-all cursor-pointer"
                          title="Download report as Excel spreadsheet"
                        >
                          <span>📊</span> Excel (.xlsx)
                        </button>

                        <button
                          type="button"
                          onClick={handleDownloadCSV}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-zinc-950 hover:bg-zinc-900 text-indigo-400 border border-zinc-850 hover:border-zinc-800 rounded-lg transition-all cursor-pointer"
                          title="Download report as CSV file"
                        >
                          <span>📝</span> CSV
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Collapsible Quick Filters Panel */}
                <div 
                  className={`grid transition-all duration-300 ease-in-out ${
                    isFiltersExpanded 
                      ? 'grid-rows-[1fr] opacity-100 my-3' 
                      : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="bg-zinc-900/40 rounded-2xl border border-zinc-850 shadow-xl relative p-4">
                      {/* Corner calibration tick marks */}
                      <div className="absolute top-2 left-2 w-1.5 h-1.5 border-t border-l border-emerald-500/40" />
                      <div className="absolute top-2 right-2 w-1.5 h-1.5 border-t border-r border-emerald-500/40" />
                      <div className="absolute bottom-2 left-2 w-1.5 h-1.5 border-b border-l border-emerald-500/40" />
                      <div className="absolute bottom-2 right-2 w-1.5 h-1.5 border-b border-r border-emerald-500/40" />

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        {/* Search query */}
                        <div className="md:col-span-3">
                          <label className="block text-[10px] uppercase font-mono font-bold text-zinc-400 mb-1">
                            Search Lead / Customer Name
                          </label>
                          <div className="relative">
                            <Search className="w-4 h-4 text-emerald-505 absolute left-3 top-3" />
                            <input
                              type="text"
                              placeholder="ID, name, or phone..."
                              value={filterQuery}
                              onChange={(e) => setFilterQuery(e.target.value)}
                              className="w-full bg-zinc-950 border border-zinc-850 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                            />
                          </div>
                        </div>

                        {/* Source */}
                        <div className="md:col-span-2">
                          <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1">
                            Lead Source
                          </label>
                          <select
                            value={filterSource}
                            onChange={(e) => setFilterSource(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100/90"
                          >
                            <option value="">All Sources</option>
                            {LEAD_SOURCES.map(source => (
                              <option key={source} value={source}>{source}</option>
                            ))}
                          </select>
                        </div>

                        {/* Status (Stage) */}
                        <div className="md:col-span-2">
                          <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1">
                            Active Stage
                          </label>
                          <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100/90 font-sans cursor-pointer focus:outline-none focus:border-emerald-500"
                          >
                            <option value="">All Stages</option>
                            {ACTIVE_STAGE_GROUPS.map((group, idx) => (
                              <optgroup key={idx} label={group.label} className={`bg-slate-950 ${group.colorClass} font-bold`}>
                                {group.options.map(opt => (
                                  <option key={opt.value} value={opt.value} className="text-white font-normal">{opt.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>

                        {/* Start Date */}
                        <div className="md:col-span-2">
                          <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1">
                            Start Date (Created)
                          </label>
                          <DateFilterInput
                            value={dateRangeStart}
                            onChange={setDateRangeStart}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 font-mono focus:border-amber-500"
                          />
                        </div>

                        {/* End Date */}
                        <div className="md:col-span-2">
                          <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1">
                            End Date (Created)
                          </label>
                          <DateFilterInput
                            value={dateRangeEnd}
                            onChange={setDateRangeEnd}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 font-mono focus:border-amber-500"
                          />
                        </div>

                        {/* Actions */}
                        <div className="md:col-span-1 flex flex-col sm:flex-row md:flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedStartDate(dateRangeStart);
                              setAppliedEndDate(dateRangeEnd);
                            }}
                            className="w-full flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 py-1.5 text-[10px] font-bold text-white rounded transition-all cursor-pointer"
                            title="Apply Date Filter"
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFilterQuery('');
                              setFilterSource('');
                              setFilterStatus('');
                              setFilterSalesPerson('');
                              setFilterDate('');
                              setDateRangeStart('');
                              setDateRangeEnd('');
                              setAppliedStartDate('');
                              setAppliedEndDate('');
                            }}
                            className="w-full flex items-center justify-center gap-0.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 py-1.5 px-1.5 text-[10px] text-zinc-300 rounded transition-all cursor-pointer animate-none"
                            title="Reset all filters"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Table view */}
          <div className="bg-zinc-900/20 rounded-2xl border border-zinc-850 overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-max">
                <thead>
                  <tr className="bg-zinc-950/70 text-zinc-405 font-bold border-b border-zinc-850 text-[10px] uppercase font-mono tracking-wider">
                    <th className="p-3.5 pl-5">Lead ID</th>
                    <th className="p-3.5">Order ID</th>
                    <th className="p-3.5">Customer Name</th>
                    <th className="p-3.5">Mobile Number</th>
                    <th className="p-3.5">
                      <div className="inline-flex items-center gap-1.5 uppercase font-mono tracking-wider text-[10px] font-bold text-zinc-405 select-none">
                        <span>Event Category</span>
                        <ArrowUpDown className="w-3 h-3 text-zinc-500" />
                      </div>
                    </th>
                    <th className="p-3.5">Event Location</th>
                    <th className="p-3.5">Event Date</th>

                    <th className="p-3.5">Current Status</th>
                    <th className="p-3.5">Created Date</th>
                    <th className="p-3.5 text-right pr-5 w-[160px] min-w-max">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/60">
                  {filteredLeads.length > 0 ? (
                    filteredLeads.map((lead) => {
                      const leadStatus = getLeadCurrentStatus(lead);
                      const currentStage = getLeadCurrentStage(lead);
                      const isActiveInSales = currentStage === 'Sales';
                      const linkedOrder = orders.find((o) => o.lead_id === lead.lead_id);
                      
                      const rawEventsList = (lead?.events && Array.isArray(lead.events) && lead.events.length > 0)
                        ? lead.events
                        : (linkedOrder?.events && Array.isArray(linkedOrder.events) && linkedOrder.events.length > 0)
                          ? linkedOrder.events
                          : [];

                      let eventDisplay = (lead.custom_event_name || lead.event_name || lead.event_type || linkedOrder?.custom_event_name || linkedOrder?.event_name || linkedOrder?.event_type || 'Event').trim();
                      if (rawEventsList.length > 0) {
                        const parsedEvents = rawEventsList.map((ev: any, idx: number) => {
                          const name = (ev.event_name || ev.custom_event_name || ev.event_type || ev.Event_Name || lead.custom_event_name || lead.event_name || lead.event_type || `Event ${idx + 1}`).trim();
                          const dateStr = (ev.event_date || ev.Event_Date || ev.date || '').trim();
                          let timestamp = 0;
                          if (dateStr) {
                            if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(dateStr)) {
                              const parts = dateStr.split(/[-/]/);
                              const day = parseInt(parts[0], 10);
                              const month = parseInt(parts[1], 10) - 1;
                              const year = parseInt(parts[2], 10);
                              const d = new Date(year, month, day);
                              if (!isNaN(d.getTime())) timestamp = d.getTime();
                            } else {
                              const d = new Date(dateStr);
                              if (!isNaN(d.getTime())) timestamp = d.getTime();
                            }
                          }
                          return { name: name || 'Event', timestamp };
                        });
                        parsedEvents.sort((a, b) => {
                          if (a.timestamp && b.timestamp) return b.timestamp - a.timestamp;
                          if (a.timestamp) return -1;
                          if (b.timestamp) return 1;
                          return 0;
                        });
                        const mostRecentName = parsedEvents[0]?.name || 'Event';
                        eventDisplay = parsedEvents.length > 1 ? `${mostRecentName} +${parsedEvents.length - 1}` : mostRecentName;
                      }

                      return (
                        <tr 
                          key={lead.lead_id} 
                          className="hover:bg-zinc-900/30 text-zinc-300 transition-all"
                        >
                          <td className="p-3.5 pl-5 font-mono text-[11px] font-bold text-indigo-400">
                            {lead.lead_id}
                          </td>
                          <td className="p-3.5 font-mono text-[11px] text-violet-400 font-bold">
                            {linkedOrder ? linkedOrder.order_id : 'N/A'}
                          </td>
                          <td className="p-3.5 font-bold text-white">
                            {lead.customer_name === 'Inbound Prospect' ? '' : lead.customer_name}
                          </td>
                          <td className="p-3.5 font-mono text-zinc-400">
                            {formatIndianPhoneNumber(lead.mobile)}
                          </td>
                          <td className="p-3.5 text-zinc-300 font-sans">
                            <EventCategoryCell lead={lead} orders={orders} filterEventDateOption={filterEventDateOption} />
                          </td>
                          <td className="p-3.5 text-zinc-300">
                            <EventLocationCell lead={lead} orders={orders} filterEventDateOption={filterEventDateOption} />
                          </td>
                          <td className="p-3.5 text-zinc-300">
                            <EventDateCell lead={lead} orders={orders} filterEventDateOption={filterEventDateOption} />
                          </td>
                          <td className="p-3.5">
                            <StatusText status={leadStatus} />
                          </td>
                          <td className="p-3.5 font-mono text-zinc-400">
                            {lead.created_date ? formatDateDDMMYY(lead.created_date) : 'N/A'}
                          </td>
                          <td className="p-3.5 text-right pr-5 w-[160px] min-w-max overflow-visible relative">
                            {(() => {
                              const isManageCrmOnlyStatus = ['New Lead', 'Follow-up', 'Follow Up', 'Contacted', 'Create Quote', 'Created Quotation'].includes(leadStatus);
                              const isActionsDropdownStatus = ['Quote Sent', 'Quotation Sent', 'Quote Follow-up', 'Negotiation', 'Confirm Order', 'Order Confirmed'].includes(leadStatus) || currentStage !== 'Sales';
                              const isConfirmOrderStatus = false; // Disabled lock requirement for confirmed orders
                              const isLeadLostStatus = ['Lead Lost', 'Lost Lead'].includes(leadStatus);

                              const latestUnlockRequest = unlockRequests
                                .filter((r: any) => r.lead_id === lead.lead_id || (linkedOrder && r.order_id === linkedOrder.order_id) || ((lead as any).order_id && r.order_id === (lead as any).order_id))
                                .sort((a: any, b: any) => new Date(b.created_at || b.requested_at || "").getTime() - new Date(a.created_at || a.requested_at || "").getTime())[0];
                              const isPendingUnlock = latestUnlockRequest?.status === 'Pending' || latestUnlockRequest?.request_status === 'Pending';
                              const isRejectedUnlock = latestUnlockRequest?.status === 'Rejected' || latestUnlockRequest?.request_status === 'Rejected';
                              const isApprovedUnlock = lead.quotation_locked === false || (
                                lead.quotation_locked !== true && (latestUnlockRequest?.status === 'Approved' || latestUnlockRequest?.request_status === 'Approved')
                              );

                               if (isPendingUnlock || isApprovedUnlock || isRejectedUnlock || isConfirmOrderStatus) {
                                return (
                                  <div className="relative flex justify-end">
                                    <button
                                      type="button"
                                      id={`btn_actions_confirm_${lead.lead_id}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (openDropdownLeadId === lead.lead_id) {
                                          setOpenDropdownLeadId(null);
                                        } else {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          const spaceBelow = window.innerHeight - rect.bottom;
                                          const spaceAbove = rect.top;
                                          const menuHeight = 90;
                                          
                                          let top: number | string = rect.bottom + 4;
                                          let bottom: number | string = 'auto';
                                          
                                          if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
                                            top = 'auto';
                                            bottom = window.innerHeight - rect.top + 4;
                                          }
                                          
                                          setDropdownCoords({ top, right: window.innerWidth - rect.right, bottom });
                                          setOpenDropdownLeadId(lead.lead_id);
                                        }
                                      }}
                                      className={`w-36 h-8 text-[11px] font-bold rounded-xl border transition-all cursor-pointer inline-flex items-center justify-between px-2.5 shadow shrink-0 ${
                                        isPendingUnlock 
                                          ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/30' 
                                          : isApprovedUnlock 
                                            ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30'
                                            : isRejectedUnlock 
                                              ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/30'
                                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                                      }`}
                                    >
                                      <span>
                                        {isPendingUnlock ? '🟡 Action' : isApprovedUnlock ? '🟢 Action' : isRejectedUnlock ? '🔴 Action' : '🔒 Action'}
                                      </span>
                                      <span className="text-[10px] ml-1">▼</span>
                                    </button>

                                    {openDropdownLeadId === lead.lead_id && createPortal(
                                      <div 
                                        className="fixed w-48 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-[9999] p-1.5 space-y-1.5 animate-in fade-in zoom-in-95 duration-100 text-left actions-dropdown-menu"
                                        style={{ top: dropdownCoords.top, right: dropdownCoords.right, bottom: dropdownCoords.bottom }}
                                      >
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenDropdownLeadId(null);
                                            handleSelectLead(lead);
                                          }}
                                          className="w-full h-8 px-3 text-xs font-bold bg-zinc-950 hover:bg-zinc-900 text-amber-400 hover:text-white rounded-lg border border-zinc-850/40 transition-all cursor-pointer flex items-center gap-2 shadow"
                                        >
                                          <Eye className="w-3.5 h-3.5 shrink-0" />
                                          <span>View CRM</span>
                                        </button>

                                        {isPendingUnlock ? (
                                          <button
                                            type="button"
                                            disabled
                                            className="w-full h-8 px-3 text-xs font-bold bg-amber-950/40 text-amber-400/60 rounded-lg border border-amber-900/20 flex items-center gap-2 cursor-not-allowed opacity-70"
                                          >
                                            <Clock className="w-3.5 h-3.5 shrink-0 text-amber-400/60" />
                                            <span>Waiting for Approval</span>
                                          </button>
                                        ) : isApprovedUnlock ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOpenDropdownLeadId(null);
                                              handleSelectLead(lead, 3);
                                            }}
                                            className="w-full h-8 px-3 text-xs font-bold bg-emerald-950 hover:bg-emerald-900 text-emerald-400 hover:text-white rounded-lg border border-emerald-900/30 transition-all cursor-pointer flex items-center gap-2 shadow"
                                          >
                                            <Edit className="w-3.5 h-3.5 shrink-0" />
                                            <span>Edit Quotation</span>
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOpenDropdownLeadId(null);
                                              setSelectedUnlockLead(lead);
                                              setUnlockRequestReason('Customer requested additional discount');
                                              setUnlockRequestCustomReason('');
                                              setShowUnlockRequestModal(true);
                                            }}
                                            className="w-full h-8 px-3 text-xs font-bold bg-amber-950 hover:bg-amber-900 text-amber-400 hover:text-white rounded-lg border border-amber-900/30 transition-all cursor-pointer flex items-center gap-2 shadow"
                                          >
                                            <Ban className="w-3.5 h-3.5 shrink-0" />
                                            <span>Unlock Quotation</span>
                                          </button>
                                        )}
                                      </div>,
                                      document.body
                                    )}
                                  </div>
                                );
                              }

                              if (isLeadLostStatus) {
                                return (
                                  <button
                                    type="button"
                                    id={`btn_followup_${lead.lead_id}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectLead(lead);
                                    }}
                                    className="w-32 h-8 text-xs font-bold bg-purple-950/30 hover:bg-purple-900/50 text-purple-400 hover:text-white rounded-xl border border-purple-900/50 transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shadow shrink-0"
                                  >
                                    <Eye className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                                    <span>View CRM</span>
                                  </button>
                                );
                              }

                              if (isActionsDropdownStatus && isActiveInSales && canEdit) {
                                return (
                                  <div className="relative inline-block text-left actions-dropdown-container">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (openDropdownLeadId === lead.lead_id) {
                                          setOpenDropdownLeadId(null);
                                        } else {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          const spaceBelow = window.innerHeight - rect.bottom;
                                          const spaceAbove = rect.top;
                                          const menuHeight = 130;
                                          
                                          let top: number | string = rect.bottom + 4;
                                          let bottom: number | string = 'auto';
                                          
                                          if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
                                            top = 'auto';
                                            bottom = window.innerHeight - rect.top + 4;
                                          }
                                          
                                          setDropdownCoords({ top, right: window.innerWidth - rect.right, bottom });
                                          setOpenDropdownLeadId(lead.lead_id);
                                        }
                                      }}
                                      className={`w-32 h-8 text-xs font-bold rounded-xl border transition-all cursor-pointer inline-flex items-center justify-between px-3 shadow shrink-0 ${
                                        isApprovedUnlock
                                          ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border-emerald-500/40'
                                          : 'bg-zinc-950 hover:bg-zinc-900 text-amber-400 hover:text-white border-zinc-850'
                                      }`}
                                    >
                                      <span>{isApprovedUnlock ? '✔ Edit Record' : '⚡ Actions'}</span>
                                      <span className="text-[10px] ml-1">▼</span>
                                    </button>

                                    {openDropdownLeadId === lead.lead_id && createPortal(
                                      <div 
                                        className="fixed w-48 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-[9999] p-1.5 space-y-1.5 animate-in fade-in zoom-in-95 duration-100 text-left actions-dropdown-menu"
                                        style={{ top: dropdownCoords.top, right: dropdownCoords.right, bottom: dropdownCoords.bottom }}
                                      >
                                        {/* Add Note Option */}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenDropdownLeadId(null);
                                            setNoteModalLeadId(lead.lead_id);
                                            setNoteModalOrderId(''); // sales leads typically don't have an orderId until confirmed
                                            setNoteModalCustomerName(lead.customer_name);
                                            setNoteModalOpen(true);
                                          }}
                                          className="w-full h-8 px-3 text-xs font-bold bg-blue-950/40 hover:bg-blue-900/60 text-blue-400 hover:text-white rounded-lg border border-blue-900/40 transition-all cursor-pointer flex items-center gap-2 shadow"
                                        >
                                          <FileText className="w-3.5 h-3.5 shrink-0" />
                                          <span>VIEW/ADD NOTE</span>
                                        </button>
                                        
                                        {/* View CRM Option */}
                                        <button
                                          type="button"
                                          id={`btn_followup_${lead.lead_id}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenDropdownLeadId(null);
                                            handleSelectLead(lead);
                                          }}
                                          className="w-full h-8 px-3 text-xs font-bold bg-zinc-950 hover:bg-zinc-900 text-amber-400 hover:text-white rounded-lg border border-zinc-850/40 transition-all cursor-pointer flex items-center gap-2 shadow"
                                        >
                                          <Eye className="w-3.5 h-3.5 shrink-0" />
                                          <span>View CRM</span>
                                        </button>

                                        {/* Confirm Order Option */}
                                        <button
                                          type="button"
                                          id={`btn_confirm_order_direct_${lead.lead_id}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenDropdownLeadId(null);
                                            handleSelectLead(lead);

                                            const today = new Date().toISOString().split('T')[0];
                                            const linkedOrder = orders?.find(o => o.lead_id === lead.lead_id);
                                            const linkedPayment = linkedOrder ? payments?.find(p => p.order_id === linkedOrder.order_id) : null;
                                            const calcAdvance = linkedPayment 
                                              ? ((linkedPayment.advance_received ?? 0) + (linkedPayment.final_payment_received ?? 0)) 
                                              : (linkedOrder 
                                                  ? (linkedOrder.advance_received ?? 0) 
                                                  : (lead.advance_collected !== undefined && lead.advance_collected !== null && lead.advance_collected !== ''
                                                      ? Number(lead.advance_collected) 
                                                      : 0));

                                            setConfirmForm({
                                              ...confirmForm,
                                              package_name: packages?.find((p) => String(p.package_id) === String(lead.Select_Package_Option))?.package_name || lead.Select_Package_Option || '',
                                              quotation_amount: Number(lead.Final_Package_Amount) || Number((lead as any).final_package_amount) || Number(lead.Final_Quotation_Amount) || Number((lead as any).final_quotation_amount) || Number((lead as any).final_amount) || (lead.lead_id === selectedLead?.lead_id ? Number(wizardLeadData.final_amount) : 0) || 0,
                                              advance_received: calcAdvance,
                                              event_date: lead.event_date || today,
                                              event_time: lead.event_time || ''
                                            });
                                            initEventsReporting(lead);
                                            setShowConfirmModal(true);
                                          }}
                                          className="w-full h-8 px-3 text-xs font-bold bg-emerald-950 hover:bg-emerald-900 text-emerald-400 hover:text-white rounded-lg border border-emerald-900/30 transition-all cursor-pointer flex items-center gap-2 shadow"
                                        >
                                          <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                                          <span>Confirm Order</span>
                                        </button>

                                        {/* Lost Lead Option */}
                                        <button
                                          type="button"
                                          id={`btn_lost_lead_direct_${lead.lead_id}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenDropdownLeadId(null);
                                            setSelectedLead(lead);
                                            setLostReason('');
                                            setOtherLostReason('');
                                            setLostNotes('');
                                            setShowLostModal(true);
                                          }}
                                          className="w-full h-8 px-3 text-xs font-bold bg-rose-950 hover:bg-rose-900 text-rose-400 hover:text-white rounded-lg border border-rose-900/30 transition-all cursor-pointer flex items-center gap-2 shadow"
                                        >
                                          <X className="w-3.5 h-3.5 shrink-0" />
                                          <span>Lost Lead</span>
                                        </button>
                                      </div>,
                                      document.body
                                    )}
                                  </div>
                                );
                              }

                              if (isManageCrmOnlyStatus && isActiveInSales && canEdit) {
                                return (
                                  <div className="flex items-center justify-end gap-1.5 w-full">
                                    <button
                                      type="button"
                                      id={`btn_followup_${lead.lead_id}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectLead(lead);
                                      }}
                                      className="flex-1 h-8 px-2 text-xs font-bold bg-sky-950/30 hover:bg-sky-900/50 text-sky-400 hover:text-white rounded-xl border border-sky-900/50 transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shadow"
                                    >
                                      <Edit className="w-3.5 h-3.5 shrink-0" />
                                      <span>Manage CRM</span>
                                    </button>
                                    <button
                                      type="button"
                                      id={`btn_lost_lead_direct_${lead.lead_id}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenDropdownLeadId(null);
                                        setSelectedLead(lead);
                                        setLostReason('');
                                        setOtherLostReason('');
                                        setLostNotes('');
                                        setShowLostModal(true);
                                      }}
                                      className="w-8 h-8 text-xs font-bold bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 hover:text-white rounded-xl border border-rose-900/50 transition-all cursor-pointer inline-flex items-center justify-center shadow shrink-0"
                                      title="Mark as Lost Lead"
                                    >
                                      <X className="w-4 h-4 shrink-0" />
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <button
                                  type="button"
                                  id={`btn_followup_${lead.lead_id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectLead(lead);
                                  }}
                                  className="w-32 h-8 text-xs font-bold bg-purple-950/30 hover:bg-purple-900/50 text-purple-400 hover:text-white rounded-xl border border-purple-900/50 transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shadow shrink-0"
                                >
                                  <Eye className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                                  <span>View CRM</span>
                                </button>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={11} className="p-12 text-center text-slate-500">
                        <Filter className="w-8 h-8 text-neutral-500 mx-auto mb-2" />
                        <span className="text-xs font-mono text-zinc-500">No matching records in the directory grid. Try resetting filters.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Confirmation Modal to Officially Log and Book Contract */}
      <AddNoteModal
        isOpen={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        leadId={noteModalLeadId}
        orderId={noteModalOrderId}
        customerName={noteModalCustomerName}
      />

      {showConfirmModal && selectedLead && (
        <div 
          className="fixed inset-0 bg-black/85 z-[95] flex items-center justify-center p-3 sm:p-4 md:p-6 backdrop-blur-md overflow-hidden transition-opacity duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm_booking_modal_title"
        >
          <div 
            ref={confirmBookingModalRef}
            id="confirm_booking_modal" 
            className="bg-slate-850 border border-slate-750 rounded-2xl overflow-hidden max-w-lg sm:max-w-xl md:max-w-2xl w-full shadow-2xl flex flex-col h-[calc(100dvh-2rem)] sm:h-[min(88dvh,780px)] animate-in fade-in zoom-in-95 duration-150 relative"
          >
            {/* Header - Fixed at Top */}
            <div className="flex items-center justify-between border-b border-slate-800 px-4 sm:px-5 py-3 sm:py-3.5 shrink-0 bg-slate-850">
              <h4 id="confirm_booking_modal_title" className="font-bold text-slate-100 text-sm sm:text-base flex items-center gap-2 font-sans min-w-0">
                <span className="text-base sm:text-lg shrink-0">💍</span>
                <span className="truncate">Booking Confirmation & Contract Form</span>
              </h4>
              <button 
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
                title="Close"
                aria-label="Close Booking Confirmation Modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmOrderSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* ONE SINGLE SCROLLABLE CONTAINER FOR THE ENTIRE POPUP CONTENT */}
              <div className="overflow-y-auto overflow-x-hidden px-3.5 sm:px-5 md:px-6 py-4 custom-scrollbar flex-1 min-h-0 space-y-4 text-xs">
                
                {/* Product package name - Read-Only */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Product Package Name *
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={confirmForm.package_name || packages?.find((p) => String(p.package_id) === String(selectedLead.Select_Package_Option))?.package_name || selectedLead.Select_Package_Option || 'Custom Selected Package'}
                    className="w-full h-9 bg-slate-900/80 border border-slate-750 rounded-lg px-3 text-slate-200 text-xs font-medium focus:outline-none opacity-85 cursor-not-allowed select-none shadow-inner"
                  />
                </div>

                {/* Event Date & Reporting Details Section */}
                <div>
                  <label className="block text-xs font-semibold text-amber-400 mb-1.5 flex items-center justify-between flex-wrap gap-1">
                    <span>📅 Events & Reporting Details *</span>
                    <span className="text-[10px] text-slate-400 font-normal">Set reporting time for crew</span>
                  </label>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-3">
                    {selectedLead?.events && selectedLead.events.length > 0 ? (
                      selectedLead.events.map((ev, i) => {
                        const key = ev.id || `ev_${i}`;
                        const repData = eventsReporting[key] || {
                          reporting_date: ev.reporting_date || (ev as any).Reporting_date || ev.event_date || ev.event_start_date || selectedLead.Reporting_date || (selectedLead as any).reporting_date || selectedLead.event_date || '',
                          reporting_time: ev.reporting_time || selectedLead.reporting_time || ''
                        };

                        return (
                          <div key={key} className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-2.5">
                            <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                              <span className="text-xs font-bold text-amber-400 font-sans tracking-wide">
                                {selectedLead.events.length > 1 ? `EVENT ${i + 1}` : 'EVENT DETAILS'}
                              </span>
                              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 truncate max-w-[150px]">
                                {ev.event_shoot_type || selectedLead.shoot_type || 'Shoot'}
                              </span>
                            </div>

                            {/* Event Name info (Event Date & Event Time removed from UI) */}
                            <div className="bg-slate-900/60 p-2.5 rounded-md border border-slate-800/60 text-[11px]">
                              <div className="min-w-0">
                                <span className="text-slate-400 block text-[10px] uppercase font-mono">Event Name</span>
                                <span className="text-slate-200 font-semibold break-words">{ev.event_name || 'Event'}</span>
                              </div>
                            </div>

                            {/* Reporting Date & Reporting Time */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                              <div>
                                <label className="block text-[10px] font-mono font-bold uppercase text-slate-400 mb-1">
                                  Reporting Date *
                                </label>
                                <input
                                  type="date"
                                  required
                                  value={repData.reporting_date || ''}
                                  onChange={(e) => {
                                    setEventsReporting(prev => ({
                                      ...prev,
                                      [key]: {
                                        ...(prev[key] || { reporting_time: '' }),
                                        reporting_date: e.target.value
                                      }
                                    }));
                                  }}
                                  className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-mono font-bold uppercase text-slate-400 mb-1">
                                  Reporting Time *
                                </label>
                                <TimePicker12Hour
                                  required
                                  value={repData.reporting_time || ''}
                                  onChange={(val24) => {
                                    setEventsReporting(prev => ({
                                      ...prev,
                                      [key]: {
                                        ...(prev[key] || { reporting_date: '' }),
                                        reporting_time: val24
                                      }
                                    }));
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-2.5">
                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                          <span className="text-xs font-bold text-amber-400 font-sans tracking-wide">
                            EVENT DETAILS
                          </span>
                          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 truncate max-w-[150px]">
                            {selectedLead.shoot_type || 'Shoot'}
                          </span>
                        </div>

                        {/* Single Event Info (Event Date & Event Time removed from UI) */}
                        <div className="bg-slate-900/60 p-2.5 rounded-md border border-slate-800/60 text-[11px]">
                          <div className="min-w-0">
                            <span className="text-slate-400 block text-[10px] uppercase font-mono">Event Name</span>
                            <span className="text-slate-200 font-semibold break-words">{selectedLead.event_type === 'Other' ? (selectedLead.custom_event_name || selectedLead.custom_event_type || 'Other') : (selectedLead.event_type || 'General Event')}</span>
                          </div>
                        </div>

                        {/* Reporting Inputs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                          <div>
                            <label className="block text-[10px] font-mono font-bold uppercase text-slate-400 mb-1">
                              Reporting Date *
                            </label>
                            <input
                              type="date"
                              required
                              value={eventsReporting['default']?.reporting_date || selectedLead.Reporting_date || (selectedLead as any).reporting_date || selectedLead.event_date || ''}
                              onChange={(e) => {
                                setEventsReporting(prev => ({
                                  ...prev,
                                  default: {
                                    ...(prev['default'] || { reporting_time: '' }),
                                    reporting_date: e.target.value
                                  }
                                }));
                              }}
                              className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono font-bold uppercase text-slate-400 mb-1">
                              Reporting Time *
                            </label>
                            <TimePicker12Hour
                              required
                              value={eventsReporting['default']?.reporting_time || selectedLead.reporting_time || ''}
                              onChange={(val24) => {
                                setEventsReporting(prev => ({
                                  ...prev,
                                  default: {
                                    ...(prev['default'] || { reporting_date: '' }),
                                    reporting_time: val24
                                  }
                                }));
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <input type="hidden" value={confirmForm.event_date || ''} />
                </div>

                {/* Package cost and advance */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Final Package Amount (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      readOnly
                      disabled
                      value={(() => {
                        const step3ResolvedAmt = getStep3FinalQuotationAmount(selectedLead, {
                          dynamicFinalAmt,
                          wizardLeadData,
                          quotations,
                          leads,
                          orders,
                          leadPackages,
                          confirmFormQuotationAmount: confirmForm.quotation_amount
                        });
                        return step3ResolvedAmt > 0 ? step3ResolvedAmt : (confirmForm.quotation_amount || '');
                      })()}
                      className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-3 text-slate-100 text-xs focus:outline-none font-mono opacity-80 cursor-not-allowed select-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Advance Collected (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={confirmForm.advance_received !== undefined && confirmForm.advance_received !== null ? confirmForm.advance_received : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setConfirmForm({ ...confirmForm, advance_received: '' });
                        } else {
                          const num = Number(val);
                          setConfirmForm({ ...confirmForm, advance_received: isNaN(num) ? 0 : num });
                        }
                      }}
                      className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-3 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>

                {/* Payment Mode & Payment Tracking ID in a responsive 2-column layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Payment Mode
                    </label>
                    <select
                      value={confirmForm.payment_mode}
                      onChange={(e) => setConfirmForm({ ...confirmForm, payment_mode: e.target.value })}
                      className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-3 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="UPI">UPI (GPay/PhonePe)</option>
                      <option value="Cash">Cash Handover</option>
                      <option value="Bank Transfer">Bank NFT/RTGS/IMPS</option>
                      <option value="Card">Credit/Debit Card</option>
                      <option value="Cheque">Cheque Deposit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Payment Tracking / Ref Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. TXN12345678"
                      value={confirmForm.transaction_id || ''}
                      onChange={(e) => setConfirmForm({ ...confirmForm, transaction_id: e.target.value })}
                      className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-3 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>

                {/* Balance due readout */}
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-300">Remaining Balance Due:</span>
                  <strong className="text-emerald-400 font-mono font-bold text-sm sm:text-base">
                    {formatINR(Math.max(0, (confirmForm.quotation_amount || 0) - ((confirmForm.advance_received !== '' && confirmForm.advance_received !== undefined && confirmForm.advance_received !== null) ? Number(confirmForm.advance_received) : 0)))}
                  </strong>
                </div>
              </div>

              {/* Bottom Action Buttons - Fixed & Accessible at Modal Footer */}
              <div className="shrink-0 flex flex-wrap sm:flex-nowrap items-center justify-end gap-2.5 border-t border-slate-800 px-4 sm:px-6 py-3 bg-slate-850/95 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl cursor-pointer text-xs font-medium transition-colors text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn_confirm_submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/20 text-xs transition-all text-center"
                >
                  <span>{isSaving ? 'Processing...' : 'Approve & Book Contract'}</span>
                  {!isSaving && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Final Reporting Details Popup */}
      {showFinalReportingModal && selectedLead && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md overflow-y-auto">
          <div id="final_reporting_modal" className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden max-w-2xl w-full shadow-2xl space-y-0 my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/90">
              <h4 className="font-bold text-slate-100 text-base flex items-center gap-2.5 font-sans leading-none m-0">
                <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-sm">⏰</span>
                <span>Final Reporting Details</span>
              </h4>
              <button 
                type="button"
                onClick={() => {
                  setShowFinalReportingModal(false);
                  setSelectedLead(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer border-0 bg-transparent flex items-center justify-center"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Form Body */}
            <form onSubmit={handleFinalReportingSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {(selectedLead.events && selectedLead.events.length > 0) ? (
                selectedLead.events.map((ev, idx) => {
                  const evData = finalReportingForm[ev.id] || { reporting_date: '', reporting_time: '' };
                  return (
                    <div key={ev.id} className="bg-slate-950/60 p-5 rounded-xl border border-slate-800 space-y-4">
                      {selectedLead.events.length > 1 && (
                        <h5 className="font-bold text-indigo-400 text-xs uppercase tracking-wider font-mono border-b border-slate-800/80 pb-2.5 flex items-center justify-between">
                          <span>Event #{idx + 1}</span>
                        </h5>
                      )}
                      
                      {/* Row 1: Event Name (Full Width) */}
                      <div className="w-full">
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Event Name
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={ev.event_name || ev.event_type || ''}
                          className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                        />
                      </div>

                      {/* Row 2: Event Date & Event Start Time */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                            Event Date *
                          </label>
                          <input
                            type="date"
                            readOnly
                            value={ev.event_date || ''}
                            className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                            Event Start Time *
                          </label>
                          <TimePicker12Hour
                            disabled
                            value={ev.event_start_time || ev.event_time || ''}
                            onChange={() => {}}
                          />
                        </div>
                      </div>

                      {/* Row 3: Reporting Date, Reporting End Date, Reporting Time */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                            Reporting Date *
                          </label>
                          <input
                            type="date"
                            required
                            value={evData.reporting_date}
                            onChange={(e) => setFinalReportingForm({ 
                              ...finalReportingForm, 
                              [ev.id]: { ...evData, reporting_date: e.target.value } 
                            })}
                            className="w-full h-10 bg-slate-900 border border-slate-750 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3 text-xs text-slate-100 font-mono transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                            Reporting End Date
                          </label>
                          <input
                            type="date"
                            readOnly
                            value={ev.event_end_date || ev.Event_End_Date || (selectedLead?.Event_End_Date && selectedLead?.events?.length === 1 ? selectedLead.Event_End_Date : '') || ''}
                            className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                            Reporting Time *
                          </label>
                          <TimePicker12Hour
                            required
                            value={evData.reporting_time}
                            onChange={(val24) => setFinalReportingForm({ 
                              ...finalReportingForm, 
                              [ev.id]: { ...evData, reporting_time: val24 } 
                            })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800 space-y-4">
                  {/* Row 1: Event Name (Full Width) */}
                  <div className="w-full">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Event Name
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={selectedLead.event_type || selectedLead.customer_name || 'Event'}
                      className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                    />
                  </div>

                  {/* Row 2: Event Date & Event Start Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Event Date *
                      </label>
                      <input
                        type="date"
                        readOnly
                        value={selectedLead.event_date || selectedLead.Reporting_date || ''}
                        className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Event Start Time *
                      </label>
                      <TimePicker12Hour
                        disabled
                        value={selectedLead.event_time || selectedLead.reporting_time || ''}
                        onChange={() => {}}
                      />
                    </div>
                  </div>

                  {/* Row 3: Reporting Date, Reporting End Date, Reporting Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                        Reporting Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={finalReportingForm['default']?.reporting_date || ''}
                        onChange={(e) => setFinalReportingForm({ 
                          ...finalReportingForm, 
                          'default': { ...finalReportingForm['default'], reporting_date: e.target.value } 
                        })}
                        className="w-full h-10 bg-slate-900 border border-slate-750 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3 text-xs text-slate-100 font-mono transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                        Reporting End Date
                      </label>
                      <input
                        type="date"
                        readOnly
                        value={selectedLead.Event_End_Date || ''}
                        className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                        Reporting Time *
                      </label>
                      <TimePicker12Hour
                        required
                        value={finalReportingForm['default']?.reporting_time || ''}
                        onChange={(val24) => setFinalReportingForm({ 
                          ...finalReportingForm, 
                          'default': { ...finalReportingForm['default'], reporting_time: val24 } 
                        })}
                      />
                    </div>
                  </div>
                </div>
              )}
                
              {/* Button: Centered */}
              <div className="flex justify-center items-center pt-4 border-t border-slate-800/80">
                 <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all cursor-pointer inline-flex items-center justify-center min-w-max"
                >
                  {isSaving ? 'Saving...' : 'Save Reporting Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Step 3 Follow-up Popup Modal */}
      {showStep3Popup && (selectedLead || activeTab === 'create') && (
        <div className="fixed inset-0 bg-black/85 z-55 flex items-center justify-center p-4 backdrop-blur-md">
          <div id="step3_followup_modal" className="bg-slate-850 border border-slate-750 rounded-xl overflow-hidden max-w-md w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 font-sans">
                <span>📅</span> Follow-up Date &amp; Time
              </h4>
              <button
                type="button"
                onClick={() => setShowStep3Popup(false)}
                className="text-slate-500 hover:text-slate-300 cursor-pointer border-0 bg-transparent"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-lg text-xs text-indigo-200">
              Please schedule the follow-up date to finalize quotation and set lead status to <strong>Quote Sent</strong>.
            </div>

            <div className="space-y-3.5 text-xs text-slate-300">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono mb-1">
                  Follow-up Date <span className="text-rose-400">* (Required)</span>
                </label>
                <input
                  type="date"
                  required
                  value={step3FollowUpDate}
                  onChange={(e) => setStep3FollowUpDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg py-2 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono mb-1">
                  Follow-up Time <span className="text-slate-500">(Optional)</span>
                </label>
                <TimePicker12Hour
                  value={step3FollowUpTime}
                  onChange={(val24) => setStep3FollowUpTime(val24)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono mb-1">
                  Follow-up Notes <span className="text-slate-500">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Summarize key client preferences, expected decision timeline, or notes..."
                  value={step3FollowUpNotes}
                  onChange={(e) => setStep3FollowUpNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg py-2 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowStep3Popup(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs border-0 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveStep3FollowUp}
                  disabled={isSaving || isCrmLocked || !step3FollowUpDate}
                  className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-lg text-xs border-0"
                >
                  {isSaving ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Details Modal */}
      {errorDetails && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-slate-900 border border-red-900/50 rounded-xl overflow-hidden max-w-lg w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h4 className="font-bold text-red-400 text-lg flex items-center gap-2">
                <span>❌</span> {errorDetails.title}
              </h4>
              <button 
                onClick={() => setErrorDetails(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm text-slate-300">
              <p><strong>Reason:</strong> {errorDetails.reason}</p>
              {errorDetails.source && <p><strong>Source:</strong> {errorDetails.source}</p>}
              {errorDetails.failedFunction && <p><strong>Failed Function:</strong> {errorDetails.failedFunction}</p>}
              {errorDetails.database && <p><strong>Database:</strong> {errorDetails.database}</p>}
              {errorDetails.leadId && <p><strong>Lead ID:</strong> {errorDetails.leadId}</p>}
              {errorDetails.suggestedFix && (
                <div className="mt-4 p-3 bg-blue-950/30 border border-blue-900/50 rounded-lg text-blue-300">
                  <strong>Suggested Fix:</strong> {errorDetails.suggestedFix}
                </div>
              )}
              {process.env.NODE_ENV !== 'production' && errorDetails.stack && (
                <div className="mt-4 p-3 bg-slate-950 rounded-lg overflow-auto max-h-40 border border-slate-800 text-[10px] font-mono text-slate-500">
                  {errorDetails.stack}
                </div>
              )}
            </div>
            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setErrorDetails(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Lead Popup Modal */}
      {showLostModal && selectedLead && (
        <div className="fixed inset-0 bg-black/85 z-55 flex items-center justify-center p-4 backdrop-blur-md">
          <div id="lost_lead_modal" className="bg-slate-850 border border-slate-750 rounded-xl overflow-hidden max-w-md w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 font-sans">
                <span>💔</span> Mark Lead as Lost
              </h4>
              <button 
                onClick={() => setShowLostModal(false)}
                className="text-slate-500 hover:text-slate-350 cursor-pointer animate-none border-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-xs text-red-200">
              Please select a mandatory reason and log notes to set lead status to <strong>Lost</strong>.
            </div>

            <div className="space-y-3.5 text-xs text-slate-300">
              <div>
                <label className="block font-medium text-slate-400 mb-1">
                  Lost Reason * (Required)
                </label>
                <select
                  required
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">-- Select Reason --</option>
                  <option value="Budget Constraint">Budget Constraint</option>
                  <option value="Chose Competitor">Chose Competitor</option>
                  <option value="Event Cancelled / Postponed">Event Cancelled / Postponed</option>
                  <option value="No Response / Ghosted">No Response / Ghosted</option>
                  <option value="Desired Date Unavailable">Desired Date Unavailable</option>
                  <option value="Other">Other (Specify below)</option>
                </select>
              </div>

              {lostReason === 'Other' && (
                <div>
                  <label className="block font-medium text-slate-400 mb-1">
                    Specify Custom Lost Reason * (Required)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter custom lost reason..."
                    value={otherLostReason}
                    onChange={(e) => setOtherLostReason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                  />
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-400 mb-1">
                  Lost Notes * (Required)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Detail the exact reason client decided otherwise..."
                  value={lostNotes}
                  onChange={(e) => setLostNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowLostModal(false)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl cursor-pointer text-xs animate-none border-0"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveLostLead}
                  disabled={isSaving || !lostReason || (lostReason === 'Other' && !otherLostReason) || !lostNotes}
                  className="px-4 py-2 bg-gradient-to-r from-red-650 to-rose-650 hover:from-red-600 hover:to-rose-600 disabled:opacity-50 text-white font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-lg text-xs border-0"
                >
                  {isSaving ? 'Processing...' : 'Mark as Lost'}
                  <CheckSquare className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Request Modal */}
      {showUnlockRequestModal && selectedUnlockLead && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-slate-850 border border-slate-750 rounded-xl overflow-hidden max-w-md w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 font-sans">
                <Ban className="w-4 h-4 text-amber-500" /> Request Quotation Unlock
              </h4>
              <button 
                onClick={() => setShowUnlockRequestModal(false)}
                className="text-slate-500 hover:text-slate-350 cursor-pointer animate-none border-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-xs text-amber-200/80">
              This request will be sent to the Business Owner for approval. The quotation remains locked until approved.
            </div>

            <form onSubmit={handleSubmitUnlockRequest} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-400 mb-1">
                  Reason * (Required)
                </label>
                <select
                  required
                  value={unlockRequestReason}
                  onChange={(e) => setUnlockRequestReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="Customer requested additional discount">Customer requested additional discount</option>
                  <option value="Customer requested package modification">Customer requested package modification</option>
                  <option value="Customer requested event changes">Customer requested event changes</option>
                  <option value="Customer requested team member changes">Customer requested team member changes</option>
                  <option value="Customer requested deliverable changes">Customer requested deliverable changes</option>
                  <option value="Pricing correction required">Pricing correction required</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {unlockRequestReason === 'Other' && (
                <div>
                  <label className="block font-medium text-slate-400 mb-1">
                    Enter Reason * (Required)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter custom reason..."
                    value={unlockRequestCustomReason}
                    onChange={(e) => setUnlockRequestCustomReason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowUnlockRequestModal(false)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl cursor-pointer text-xs animate-none border-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold cursor-pointer text-xs disabled:opacity-50 border-0 flex items-center justify-center"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Submitting...
                    </>
                  ) : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lead Cancel Confirmation Modal */}
      {showCancelConfirmPopup && (
        <div className="fixed inset-0 bg-black/85 z-55 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div id="lead_cancel_confirm_modal" className="bg-slate-850 border border-slate-750 rounded-xl overflow-hidden max-w-sm w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 font-sans">
                <span>⚠️</span> Mark Lead as Lost
              </h4>
              <button 
                onClick={() => setShowCancelConfirmPopup(false)}
                className="text-slate-500 hover:text-slate-350 cursor-pointer animate-none border-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-sm text-slate-300 py-2 text-left">
              Are you sure you want to mark this lead as Lost?
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowCancelConfirmPopup(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl cursor-pointer text-xs font-semibold border-0"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleCancelLead}
                disabled={isSaving}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl cursor-pointer shadow-lg text-xs border-0"
              >
                {isSaving ? 'Processing...' : 'Yes, Mark as Lost'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLead && (
        <div 
          id="lead_details_mobile_modal" 
          className="bg-[#030303] border border-slate-800 rounded-2xl w-full shadow-2xl flex flex-col overflow-hidden relative animate-fade-in text-left font-sans text-slate-100 max-h-[85vh] lg:max-h-[90vh]"
        >
            {/* Header: Sticky */}
            {!['Create Quote', 'Created Quotation', 'New Lead'].includes(getLeadCurrentStatus(selectedLead)) && (
              <div className={`py-2.5 px-4 sm:px-5 border-b flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm shrink-0 ${
                isLeadLost && crmWizardStep === 3 ? 'bg-rose-950/40 border-rose-500/30' : 'bg-slate-950/40 border-slate-850'
              }`}>
                {crmWizardStep !== 3 ? (
                  <div className="flex items-center gap-2 text-left flex-wrap">
                    <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5 font-mono uppercase tracking-wider">
                      <span>💍</span> Digital Lead CRM Workspace — Client Board
                    </h3>
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded font-mono font-bold">Code: {selectedLead.lead_id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                      isLeadLost ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                      getLeadCurrentStage(selectedLead) === 'Sales' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                      getLeadCurrentStage(selectedLead) === 'Operations' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                      getLeadCurrentStage(selectedLead) === 'Production' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                      'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}>
                      Stage: {isLeadLost ? 'Lost Lead' : getLeadCurrentStage(selectedLead)}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                      isLeadLost ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                    }`}>
                      Status: {getLeadCurrentStatus(selectedLead)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold font-mono uppercase tracking-wider ${isLeadLost ? 'text-rose-300' : 'text-slate-200'}`}>
                      Step 3: Package Configuration
                    </span>
                    {isLeadLost && (
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-mono font-bold uppercase flex items-center gap-1">
                        <span>💔</span> [ LOST LEAD ]
                      </span>
                    )}
                  </div>
                )}
                <button 
                  onClick={() => setSelectedLead(null)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs rounded-xl border border-slate-700 font-bold uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1 shadow"
                >
                  Back to Leads
                </button>
              </div>
            )}

            {/* Custom Toast Alert */}
            {crmToast && (
              <div id="crm-toast-container" className={`mx-4 mt-1.5 p-1.5 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 shrink-0 ${
                crmToast.type === 'success' 
                  ? 'bg-emerald-950 border border-emerald-500/20 text-emerald-400' 
                  : 'bg-red-950 border border-red-500/20 text-red-400'
              }`}>
                <span>{crmToast.type === 'success' ? '⚡' : '⚠️'}</span>
                <span className="text-[10px] font-mono font-bold whitespace-pre-wrap">{crmToast.message}</span>
              </div>
            )}

            {/* Event Completion CRM Lock Banner */}
            {isCrmLocked && (
              <div className="mx-4 sm:mx-5 mt-2 p-2.5 sm:p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-amber-300 font-mono text-xs sm:text-sm font-bold shadow-md animate-fade-in shrink-0">
                <span className="text-base sm:text-lg">🔒</span>
                <span>
                  {isMultiEventLead
                    ? "All events have ended. This CRM is now locked."
                    : "Event has ended. This CRM is now locked."}
                </span>
              </div>
            )}

            {/* Progress Bar & Indicators */}
            <div className={`w-full ${isLeadLost && crmWizardStep === 3 ? 'bg-rose-950/20 border-b border-rose-500/30' : 'bg-slate-950/20 border-b border-slate-850'} py-1.5 px-4 sm:px-5 shrink-0 justify-start text-left ${['Create Quote', 'Created Quotation', 'New Lead'].includes(getLeadCurrentStatus(selectedLead)) ? 'sticky top-0 z-10 backdrop-blur-sm' : ''}`}>
              <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
                <div className="flex flex-1 items-center gap-2">
                  <span className={`text-[10px] sm:text-xs font-mono font-bold uppercase tracking-widest text-left shrink-0 ${isLeadLost && crmWizardStep === 3 ? 'text-rose-400' : 'text-indigo-400'}`}>
                    Step {crmWizardStep} of 3:
                  </span>
                  <span className={`text-[10px] sm:text-xs font-semibold py-0.5 px-2 rounded border shrink-0 flex items-center gap-1.5 ${
                    isLeadLost && crmWizardStep === 3
                      ? 'text-rose-300 bg-rose-950/40 border-rose-500/30 font-mono font-bold'
                      : 'text-slate-300 bg-slate-800 border-slate-750'
                  }`}>
                    {crmWizardStep === 1 ? 'Customer Details' :
                     crmWizardStep === 2 ? 'Event Details' :
                     'Quotation Workspace'}
                    {isLeadLost && crmWizardStep === 3 && (
                      <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1 py-0.2 rounded uppercase">
                        [ LOST LEAD ]
                      </span>
                    )}
                  </span>
                  <div className="flex-1 max-w-xs h-1 bg-slate-950 rounded-full overflow-hidden hidden sm:block ml-4">
                    <div 
                      className={`h-full transition-all duration-300 ${isLeadLost && crmWizardStep === 3 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                      style={{ width: `${(crmWizardStep / 3) * 100}%` }}
                    />
                  </div>
                </div>
                {['Create Quote', 'Created Quotation', 'New Lead'].includes(getLeadCurrentStatus(selectedLead)) && (
                  <button 
                    onClick={() => setSelectedLead(null)}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[10px] sm:text-xs rounded border border-slate-700 font-bold uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1 shadow shrink-0"
                  >
                    Back to Leads
                  </button>
                )}
              </div>
            </div>

            {/* Content container with horizontal padding */}
            <div id="crm-wizard-scroll-container" className="shrink min-h-0 overflow-y-auto p-2.5 sm:p-3">
              <div className="max-w-5xl mx-auto">
                <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
                  <fieldset disabled={isCrmLocked} className="space-y-3 border-0 p-0 m-0 min-w-0">
                    {crmWizardStep === 1 && (
                    <div className="space-y-4 animate-fade-in text-left">
                      <div className="border-b border-slate-800 pb-1.5">
                        <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                          <span className="p-0.5 px-1.5 bg-indigo-500/10 text-indigo-400 rounded text-[10px] font-mono">1</span>
                          <span>Customer Details</span>
                        </h3>
                        <p className="text-[10px] text-zinc-400 mt-0.5">Manage client contact identity, email correspondence, and location parameters.</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-left">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Customer Name (Optional)</label>
                          <input
                            type="text"
                            value={wizardLeadData.customer_name || ''}
                            onChange={(e) => setWizardLeadData({ ...wizardLeadData, customer_name: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Mobile Number *</label>
                          <input
                            type="text"
                            value={wizardLeadData.mobile || ''}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^\d]/g, '').slice(0, 10);
                              setWizardLeadData({ ...wizardLeadData, mobile: val });
                            }}
                            className="w-full bg-slate-955 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-white font-mono"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">WhatsApp Number</label>
                          <input
                            type="text"
                            value={wizardLeadData.whatsapp_number || ''}
                            onChange={(e) => setWizardLeadData({ ...wizardLeadData, whatsapp_number: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Email (Optional)</label>
                          <input
                            type="email"
                            value={wizardLeadData.email || ''}
                            onChange={(e) => setWizardLeadData({ ...wizardLeadData, email: e.target.value })}
                            className="w-full bg-slate-955 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-white font-mono"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Inbound Lead Channel Source *</label>
                          <select
                            value={wizardLeadData.lead_source || ''}
                            onChange={(e) => setWizardLeadData({ ...wizardLeadData, lead_source: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-white cursor-pointer select-element"
                            required
                          >
                            <option value="">── Choose Lead Source ──</option>
                            {LEAD_SOURCES.map(source => (
                              <option key={source} value={source}>{source}</option>
                            ))}
                          </select>
                          {wizardLeadData.lead_source === 'Other' && (
                            <div className="animate-fade-in-down mt-2">
                              <label className="block text-xs font-mono font-bold text-amber-500 mb-1.5">
                                Specify Custom Lead Source Name *
                              </label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. Billboard, Event Flyer"
                                value={wizardLeadData.Specify_Custom_Lead_Source_Name || ''}
                                onChange={(e) => setWizardLeadData({ ...wizardLeadData, Specify_Custom_Lead_Source_Name: e.target.value })}
                                className="w-full bg-slate-955 border border-amber-500/50 rounded-lg py-2 px-3 text-xs text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                              />
                             </div>
                           )}
                         </div>
                       </div>
                     </div>
                   )}

                   {crmWizardStep === 2 && (
                     <div className="space-y-4 animate-fade-in text-left">
                       <div className="border-b border-slate-800 pb-1.5">
                         <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                           <span className="p-0.5 px-1.5 bg-indigo-500/10 text-indigo-400 rounded text-[10px] font-mono">2</span>
                           <span>Event Details</span>
                         </h3>
                         <p className="text-[11px] text-zinc-400 mt-1">Configure event metadata, starting schedules, reporting times, and lead origins.</p>
                       </div>
                       
                       {renderEventDetailsSection(true)}
                     </div>
                   )}

                   {crmWizardStep === 3 && (
                     <div className={`space-y-4 animate-fade-in text-left ${isLeadLost ? 'bg-rose-950/10 border border-rose-500/30 rounded-2xl p-3.5 sm:p-4' : ''}`}>
                       <div className={`border-b pb-1.5 flex items-center justify-between ${isLeadLost ? 'border-rose-500/30' : 'border-slate-800'}`}>
                         <h3 className={`text-xs sm:text-sm font-bold flex items-center gap-2 ${isLeadLost ? 'text-rose-400' : 'text-white'}`}>
                           <span className={`p-0.5 px-1.5 rounded text-[10px] font-mono ${isLeadLost ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-indigo-500/10 text-indigo-400'}`}>3</span>
                           <span>Quotation Workspace</span>
                         </h3>
                         {isLeadLost && (
                           <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded font-mono font-bold uppercase flex items-center gap-1">
                             <span>💔</span> [ LOST LEAD ]
                           </span>
                         )}
                       </div>
                       {renderStep3Workspace(true)}
                        <div className="hidden">
                        <div className="space-y-3.5 text-left">
                         <div>
                           <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Select Package Option *</label>
                           <select
                             id="hidden_legacy_select_package_option"
                             value={wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || ''}
                             onChange={(e) => handlePackageDropdownChange(e.target.value)}
                             className={`w-full bg-slate-955 border focus:outline-none rounded-lg py-1.5 px-3 text-xs cursor-pointer ${
                               !(wizardLeadData.Select_Package_Option || wizardLeadData.selected_package_id || selectedLead?.Select_Package_Option)
                                 ? 'border-rose-500/40 focus:border-rose-500 text-rose-200'
                                 : 'border-slate-800 focus:border-indigo-500 text-white'
                             }`}
                           >
                             <option value="">── Choose configuration package ──</option>
                             {(() => {
                               const currentPkgId = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || '';
                               const availablePkgs = (packages && packages.length > 0) ? packages : INITIAL_PACKAGES;
                               const activePkgs = availablePkgs.filter(p => (!p.status || p.status.toLowerCase() === 'active') && String(p.package_id) !== 'Custom Package' && String(p.package_id) !== 'custom_package' && String(p.package_name) !== 'Custom Package');
                               if (currentPkgId && !activePkgs.some(p => String(p.package_id) === String(currentPkgId))) {
                                 const matched = availablePkgs.find(p => String(p.package_id) === String(currentPkgId));
                                 if (matched) {
                                   activePkgs.unshift(matched);
                                 } else {
                                   activePkgs.unshift({
                                     package_id: currentPkgId,
                                     package_name: `Package ${currentPkgId} (Legacy)`,
                                     price: wizardLeadData.package_cost || selectedLead?.Final_Quotation_Amount || 0,
                                     status: 'Active'
                                   } as any);
                                 }
                               }
                               return (
                                 <>
                                   {activePkgs.map((pkg) => (
                                     <option key={pkg.package_id} value={pkg.package_id}>
                                       {pkg.package_name} (₹{Number(pkg.price).toLocaleString('en-IN')})
                                     </option>
                                   ))}
                                   <option value="Custom Package">Custom Package</option>
                                 </>
                               );
                             })()}
                           </select>
                           {!(wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option) && (
                             <p className="text-rose-450 font-bold text-xs mt-1 font-mono animate-pulse flex items-center gap-1.5">
                               ⚠️ Please select a package before continuing.
                             </p>
                           )}
                         </div>
 
                         {(() => {
                           const availablePkgs = (packages && packages.length > 0) ? packages : INITIAL_PACKAGES;
                           const currentPkgId = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option; 
                           let selectedPkg = availablePkgs.find(p => String(p.package_id) === String(currentPkgId)); 
                           if (!selectedPkg && currentPkgId) { 
                             selectedPkg = { package_id: currentPkgId, package_name: (currentPkgId === 'custom_package' || currentPkgId === 'Custom Package') ? 'Custom Package' : `Package ${currentPkgId} (Legacy)`, price: wizardLeadData.package_cost || 0, deliverables: wizardLeadData.deliverables || "", status: "Active" } as any; 
                           }
                           const selectedPkgId = selectedPkg?.package_id || '';
                          const inclusionsList = editableInclusions[selectedPkgId] || [];
                          const deliverablesList = editableDeliverables[selectedPkgId] || [];

                          return (
                            <div className="space-y-4 animate-fade-in">
                              {/* Sales Executive Details */}
                              <div className="hidden bg-slate-900/50 border border-slate-805/40 rounded-lg p-3 space-y-2.5 shadow-sm mt-3">
                                <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide font-mono flex items-center gap-1.5 border-b border-slate-800 pb-1">
                                  <span>👤</span> Sales Executive Details
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                                      Sales Staff Name *
                                    </label>
                                    <input
                                      id="input_sales_staff_name"
                                      type="text"
                                      required
                                      value={salesStaffName}
                                      onChange={(e) => setSalesStaffName(e.target.value)}
                                      placeholder="E.g., Jane Doe"
                                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 font-sans transition-all"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                                      Sales Staff Mobile Number *
                                    </label>
                                    <input
                                      id="input_sales_staff_mobile"
                                      type="text"
                                      required
                                      value={salesStaffMobile}
                                      onChange={(e) => setSalesStaffMobile(e.target.value)}
                                      placeholder="E.g., 9876543210"
                                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 font-mono transition-all"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Single Package Base Price (₹) Field (Hidden visually per request) */}
                              <div className="hidden" style={{ display: 'none' }}>
                                <label className="block text-[11px] font-bold text-amber-400 uppercase tracking-wide font-mono flex items-center gap-1.5">
                                  <span>💰</span> Package Base Price (₹) *
                                </label>
                                <input
                                  type="number"
                                  value={wizardLeadData.package_cost !== undefined && wizardLeadData.package_cost !== null ? wizardLeadData.package_cost : (selectedPkg?.price || '')}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const numVal = val === '' ? 0 : Number(val);
                                    setWizardLeadData(prev => ({
                                      ...prev,
                                      package_cost: val,
                                      package_price: numVal,
                                      budget: numVal,
                                      final_quoted_amount: numVal
                                    }));
                                    saveStep3DataRealtime(editableInclusions, editableDeliverables, wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option, numVal);
                                  }}
                                  placeholder="Enter package base price..."
                                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-amber-300 font-mono font-bold"
                                  required
                                />
                              </div>

                              {/* Event-Wise Configuration or Single Configuration */}
                              <div>
                                {crmEvents && crmEvents.length > 0 ? (
                                  crmEvents.map((event, eventIdx) => {
                                    const isMulti = crmEvents && crmEvents.length > 1;
                                    const evId = String(event.id || event.event_id || `EV-${eventIdx + 1}`);
                                    const eventKey = `${selectedPkgId}_${evId}`;
                                    const altKey = `Custom Package_${evId}`;
                                    const customKey = `custom_package_${evId}`;

                                    const directTm = event.team_members || event.inclusions || event.Team_Members || event.team_members_included;
                                    const parsedDirectTm = directTm ? (Array.isArray(directTm) ? directTm.map((m: any) => {
                                      const { qty, text } = parseQtyAndText(m);
                                      return text ? combineQtyAndText(qty, text) : '';
                                    }).filter(Boolean) : null) : null;

                                    const eventInclusions = editableInclusions[eventKey] !== undefined
                                      ? editableInclusions[eventKey]
                                      : (editableInclusions[altKey] !== undefined
                                          ? editableInclusions[altKey]
                                          : (editableInclusions[customKey] !== undefined
                                              ? editableInclusions[customKey]
                                              : (editableInclusions[evId] !== undefined
                                                  ? editableInclusions[evId]
                                                  : (parsedDirectTm !== null
                                                      ? parsedDirectTm
                                                      : (isMulti ? [] : (inclusionsList.length > 0 ? [...inclusionsList] : []))))));

                                    const directDel = event.deliverables || event.deliverables_list || event.Add_Deliverable || event.deliverables_description;
                                    const parsedDirectDel = directDel ? (Array.isArray(directDel) ? directDel.map((d: any) => {
                                      const { qty, text } = parseQtyAndText(d);
                                      return text ? combineQtyAndText(qty, text) : '';
                                    }).filter(Boolean) : null) : null;

                                    const eventDeliverables = editableDeliverables[eventKey] !== undefined
                                      ? editableDeliverables[eventKey]
                                      : (editableDeliverables[altKey] !== undefined
                                          ? editableDeliverables[altKey]
                                          : (editableDeliverables[customKey] !== undefined
                                              ? editableDeliverables[customKey]
                                              : (editableDeliverables[evId] !== undefined
                                                  ? editableDeliverables[evId]
                                                  : (parsedDirectDel !== null
                                                      ? parsedDirectDel
                                                      : (isMulti ? [] : (deliverablesList.length > 0 ? [...deliverablesList] : []))))));

                                    const updateInclusionsForEvent = (newList: string[]) => {
                                      const updated = {
                                        ...editableInclusions,
                                        [eventKey]: newList,
                                        [altKey]: newList,
                                        [customKey]: newList,
                                        [evId]: newList
                                      };
                                      if (!isMulti) {
                                        updated[selectedPkgId] = newList;
                                        updated['Custom Package'] = newList;
                                        updated['custom_package'] = newList;
                                      }
                                      setEditableInclusions(updated);
                                      if (crmEvents && crmEvents.length > 0) {
                                        setCrmEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, team_members: newList, inclusions: newList } : e)));
                                      }
                                      if (createEvents && createEvents.length > 0) {
                                        setCreateEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, team_members: newList, inclusions: newList } : e)));
                                      }
                                      saveStep3DataRealtime(updated, editableDeliverables);
                                    };

                                    const updateDeliverablesForEvent = (newList: string[]) => {
                                      const updated = {
                                        ...editableDeliverables,
                                        [eventKey]: newList,
                                        [altKey]: newList,
                                        [customKey]: newList,
                                        [evId]: newList
                                      };
                                      if (!isMulti) {
                                        updated[selectedPkgId] = newList;
                                        updated['Custom Package'] = newList;
                                        updated['custom_package'] = newList;
                                      }
                                      setEditableDeliverables(updated);
                                      if (crmEvents && crmEvents.length > 0) {
                                        setCrmEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, deliverables: newList, deliverables_list: newList } : e)));
                                      }
                                      if (createEvents && createEvents.length > 0) {
                                        setCreateEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, deliverables: newList, deliverables_list: newList } : e)));
                                      }
                                      saveStep3DataRealtime(editableInclusions, updated);
                                    };

                                    const startDateStr = formatDDMMYYYY(event.event_start_date || event.event_date);
                                    const endDateRaw = event.event_end_date || (event as any).Event_End_Date || '';
                                    const endDateStr = endDateRaw ? formatDDMMYYYY(endDateRaw) : 'N/A';
                                    const startTimeStr = event.event_start_time ? convertTo12Hour(event.event_start_time) : 'N/A';
                                    const endTimeStr = event.event_end_time ? convertTo12Hour(event.event_end_time) : 'N/A';
                                    const guestPaxVal = event.guest_pax !== '' && event.guest_pax !== null && event.guest_pax !== undefined ? event.guest_pax : 'N/A';
                                    const isMulti = crmEvents && crmEvents.length > 1;
                                    const specificEventLocation = (event.event_location || (event as any).location || (event as any).venue_address || (event as any).venue || (event as any).event_venue || '').trim();
                                    const eventLocationDisplay = specificEventLocation || (!isMulti ? (wizardLeadData.event_location || selectedLead?.event_location || 'N/A') : 'N/A');

                                    return (
                                      <div key={event.id || eventIdx} className="bg-slate-900/25 border border-slate-800/60 p-4 rounded-xl space-y-4 mt-3 mb-4">
                                        {/* VERY SMALL COMPACT EVENT SUMMARY */}
                                        <div className="bg-slate-950/60 border border-slate-800/70 p-2.5 sm:p-3 rounded-lg text-left font-mono">
                                          <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <span className="text-xs sm:text-sm font-bold text-slate-100 font-sans">
                                              {event.event_name || `Event ${eventIdx + 1}`}
                                            </span>
                                            {event.event_type && (
                                              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono font-bold border border-slate-700">
                                                [{event.event_type}]
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[11px] text-slate-300 leading-tight flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                            <span>
                                              Start: <span className="text-slate-100 font-semibold">{startDateStr}{startTimeStr !== 'N/A' ? ` | ${startTimeStr}` : ''}</span>
                                            </span>
                                            {(endDateRaw || endTimeStr !== 'N/A') && (
                                              <>
                                                <span className="text-slate-500">•</span>
                                                <span>
                                                  End: <span className="text-slate-100 font-semibold">{endDateStr !== 'N/A' ? endDateStr : startDateStr}{endTimeStr !== 'N/A' ? ` | ${endTimeStr}` : ''}</span>
                                                </span>
                                              </>
                                            )}
                                            <span className="text-slate-500">•</span>
                                            <span>
                                              Guest Pax: <span className="text-slate-100 font-semibold">{guestPaxVal}</span>
                                            </span>
                                          </div>
                                          <div className="mt-2 pt-1.5 border-t border-slate-800/60 text-[11px] text-slate-300">
                                            <span className="text-slate-400 font-semibold uppercase font-mono text-[10px] mr-1.5">
                                              Event Address:
                                            </span>
                                            <span className="text-slate-100 font-medium break-words font-sans">
                                              {eventLocationDisplay}
                                            </span>
                                          </div>
                                        </div>

                                         {/* Team Members Included */}
                                         <div>
                                           <div className="mb-2">
                                             <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Team Members Included</label>
                                           </div>
                                           {eventInclusions.length === 0 ? (
                                             <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                                               <p className="text-xs text-zinc-500 italic">No team members added yet.</p>
                                               <button
                                                 type="button"
                                                 onClick={() => {
                                                   const currentList = [...eventInclusions];
                                                   currentList.push("");
                                                   const updated = {
                                                     ...editableInclusions,
                                                     [eventKey]: currentList,
                                                     [nameKey]: currentList
                                                   };
                                                   setEditableInclusions(updated);
                                                   saveStep3DataRealtime(updated, editableDeliverables);
                                                 }}
                                                 className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                                               >
                                                 + Add Member
                                               </button>
                                             </div>
                                           ) : (
                                              <div className="space-y-1.5">
                                                {eventInclusions.map((item, idx) => (
                                                  <CompactQtyItemRow
                                                    key={idx}
                                                    value={item}
                                                    options={activeMasterRoles}
                                                    placeholder="Type or select Role / Team Member..."
                                                    accentColor="indigo"
                                                    onChange={(newVal) => {
                                                      const currentList = [...eventInclusions];
                                                      currentList[idx] = newVal;
                                                      const updated = {
                                                        ...editableInclusions,
                                                        [eventKey]: currentList,
                                                        [nameKey]: currentList
                                                      };
                                                      setEditableInclusions(updated);
                                                      saveStep3DataRealtime(updated, editableDeliverables);
                                                    }}
                                                    onDelete={() => {
                                                      const currentList = [...eventInclusions];
                                                      currentList.splice(idx, 1);
                                                      const updated = {
                                                        ...editableInclusions,
                                                        [eventKey]: currentList,
                                                        [nameKey]: currentList
                                                      };
                                                      setEditableInclusions(updated);
                                                      saveStep3DataRealtime(updated, editableDeliverables);
                                                    }}
                                                  />
                                                ))}
                                                <div className="flex justify-end pt-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const currentList = [...eventInclusions];
                                                      currentList.push("");
                                                      const updated = {
                                                        ...editableInclusions,
                                                        [eventKey]: currentList,
                                                        [nameKey]: currentList
                                                      };
                                                      setEditableInclusions(updated);
                                                      saveStep3DataRealtime(updated, editableDeliverables);
                                                    }}
                                                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                                                  >
                                                    + Add Member
                                                  </button>
                                                </div>
                                              </div>
                                           )}
                                         </div>
                                         {/* Deliverables Description / Base Package Deliverables */}
                                         <div>
                                           <div className="mb-2">
                                             <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Deliverables Description / Base Package Deliverables</label>
                                           </div>
                                           {eventDeliverables.length === 0 ? (
                                             <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                                               <p className="text-xs text-zinc-500 italic">No deliverables added yet.</p>
                                               <button
                                                 type="button"
                                                 onClick={() => {
                                                   const currentList = [...eventDeliverables];
                                                   currentList.push("");
                                                   const updated = {
                                                     ...editableDeliverables,
                                                     [eventKey]: currentList,
                                                     [nameKey]: currentList
                                                   };
                                                   setEditableDeliverables(updated);
                                                   saveStep3DataRealtime(editableInclusions, updated);
                                                 }}
                                                 className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                                               >
                                                 + Add Deliverable
                                               </button>
                                             </div>
                                           ) : (
                                              <div className="space-y-1.5">
                                                {eventDeliverables.map((item, idx) => (
                                                  <CompactQtyItemRow
                                                    key={idx}
                                                    value={item}
                                                    options={activeMasterDeliverables}
                                                    placeholder="Type or select Deliverable..."
                                                    accentColor="emerald"
                                                    onChange={(newVal) => {
                                                      const currentList = [...eventDeliverables];
                                                      currentList[idx] = newVal;
                                                      const updated = {
                                                        ...editableDeliverables,
                                                        [eventKey]: currentList,
                                                        [nameKey]: currentList
                                                      };
                                                      setEditableDeliverables(updated);
                                                      saveStep3DataRealtime(editableInclusions, updated);
                                                    }}
                                                    onDelete={() => {
                                                      const currentList = [...eventDeliverables];
                                                      currentList.splice(idx, 1);
                                                      const updated = {
                                                        ...editableDeliverables,
                                                        [eventKey]: currentList,
                                                        [nameKey]: currentList
                                                      };
                                                      setEditableDeliverables(updated);
                                                      saveStep3DataRealtime(editableInclusions, updated);
                                                    }}
                                                  />
                                                ))}
                                                <div className="flex justify-end pt-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const currentList = [...eventDeliverables];
                                                      currentList.push("");
                                                      const updated = {
                                                        ...editableDeliverables,
                                                        [eventKey]: currentList,
                                                        [nameKey]: currentList
                                                      };
                                                      setEditableDeliverables(updated);
                                                      saveStep3DataRealtime(editableInclusions, updated);
                                                    }}
                                                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                                                  >
                                                    + Add Deliverable
                                                  </button>
                                                </div>
                                              </div>
                                           )}
                                         </div>
                                        </div>
                                      );
                                    })
                                ) : (
                                  <div className="bg-slate-900/25 border border-slate-800/60 p-4 rounded-xl space-y-4 mt-3 mb-4">
                                     {/* Single Team Members Included */}
                                     <div>
                                       <div className="mb-2">
                                         <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Team Members Included</label>
                                       </div>
                                       {inclusionsList.length === 0 ? (
                                         <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                                           <p className="text-xs text-zinc-500 italic">No team members added yet.</p>
                                           <button
                                             type="button"
                                             onClick={() => {
                                               const currentList = [...inclusionsList];
                                               currentList.push("");
                                               const updated = {
                                                 ...editableInclusions,
                                                 [selectedPkgId]: currentList
                                               };
                                               setEditableInclusions(updated);
                                               saveStep3DataRealtime(updated, editableDeliverables);
                                             }}
                                             className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                                           >
                                             + Add Member
                                           </button>
                                         </div>
                                       ) : (
                                          <div className="space-y-1.5">
                                            {inclusionsList.map((item, idx) => (
                                              <CompactQtyItemRow
                                                key={idx}
                                                value={item}
                                                options={activeMasterRoles}
                                                placeholder="Type or select Role / Team Member..."
                                                accentColor="indigo"
                                                onChange={(newVal) => {
                                                  const currentList = [...inclusionsList];
                                                  currentList[idx] = newVal;
                                                  const updated = {
                                                    ...editableInclusions,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableInclusions(updated);
                                                  saveStep3DataRealtime(updated, editableDeliverables);
                                                }}
                                                onDelete={() => {
                                                  const currentList = [...inclusionsList];
                                                  currentList.splice(idx, 1);
                                                  const updated = {
                                                    ...editableInclusions,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableInclusions(updated);
                                                  saveStep3DataRealtime(updated, editableDeliverables);
                                                }}
                                              />
                                            ))}
                                            <div className="flex justify-end pt-1">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const currentList = [...inclusionsList];
                                                  currentList.push("");
                                                  const updated = {
                                                    ...editableInclusions,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableInclusions(updated);
                                                  saveStep3DataRealtime(updated, editableDeliverables);
                                                }}
                                                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                                              >
                                                + Add Member
                                              </button>
                                            </div>
                                          </div>
                                       )}
                                     </div>

                                     {/* Single Deliverables Description */}
                                     <div>
                                       <div className="mb-2">
                                         <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Deliverables Description / Base Package Deliverables</label>
                                       </div>
                                       {deliverablesList.length === 0 ? (
                                         <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                                           <p className="text-xs text-zinc-500 italic">No deliverables added yet.</p>
                                           <button
                                             type="button"
                                             onClick={() => {
                                               const currentList = [...deliverablesList];
                                               currentList.push("");
                                               const updated = {
                                                 ...editableDeliverables,
                                                 [selectedPkgId]: currentList
                                               };
                                               setEditableDeliverables(updated);
                                               saveStep3DataRealtime(editableInclusions, updated);
                                             }}
                                             className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                                           >
                                             + Add Deliverable
                                           </button>
                                         </div>
                                       ) : (
                                          <div className="space-y-1.5">
                                            {deliverablesList.map((item, idx) => (
                                              <CompactQtyItemRow
                                                key={idx}
                                                value={item}
                                                options={activeMasterDeliverables}
                                                placeholder="Type or select Deliverable..."
                                                accentColor="emerald"
                                                onChange={(newVal) => {
                                                  const currentList = [...deliverablesList];
                                                  currentList[idx] = newVal;
                                                  const updated = {
                                                    ...editableDeliverables,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableDeliverables(updated);
                                                  saveStep3DataRealtime(editableInclusions, updated);
                                                }}
                                                onDelete={() => {
                                                  const currentList = [...deliverablesList];
                                                  currentList.splice(idx, 1);
                                                  const updated = {
                                                    ...editableDeliverables,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableDeliverables(updated);
                                                  saveStep3DataRealtime(editableInclusions, updated);
                                                }}
                                              />
                                            ))}
                                            <div className="flex justify-end pt-1">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const currentList = [...deliverablesList];
                                                  currentList.push("");
                                                  const updated = {
                                                    ...editableDeliverables,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableDeliverables(updated);
                                                  saveStep3DataRealtime(editableInclusions, updated);
                                                }}
                                                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                                              >
                                                + Add Deliverable
                                              </button>
                                            </div>
                                          </div>
                                       )}
                                     </div>
                                    </div>
                                )}
                              </div>

                              <div className="mt-4 flex justify-end pb-2">
                                <button
                                  type="button"
                                  onClick={handleSavePackageOnly}
                                  disabled={isSaving}
                                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-bold uppercase tracking-wider rounded-lg shadow transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isSaving ? 'Saving...' : 'Save Package'}
                                </button>
                              </div>

                              {renderQuotationAndStep4Section(true)}
                            </div>
                          );
                        })()}
                        </div>
                      </div>

                      {/* STEP 5 INTEGRATED (CRM): Status Update / Order Confirmation Details at BOTTOM of Step 3 */}
                      <div className="space-y-4 animate-fade-in text-left mt-6">
                        <div className="border-b border-slate-800 pb-1.5">
                          <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                            <span className="p-0.5 px-1.5 bg-indigo-500/10 text-indigo-400 rounded text-[10px] font-mono">4</span>
                            <span>Status Update</span>
                          </h3>
                        </div>
                        <div className="space-y-4 text-left">
                          {['Lost Lead', 'Lead Lost', 'Lost'].includes(wizardLeadData.status || selectedLead?.status || (selectedLead as any)?.current_status || '') ? (() => {
                            const { reason: lostReasonText, notes: lostNotesText } = getStrictLostReasonAndNotes(selectedLead || (wizardLeadData as any));
                            return (
                              <div id="lost_lead_status_update_section" className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3.5 space-y-3.5 animate-in fade-in zoom-in-95 duration-200">
                                <div className="border-b border-rose-500/20 pb-1.5 flex items-center justify-between">
                                  <h4 className="text-[11px] font-black text-rose-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                                    <span>💔</span> Lost Lead Information
                                  </h4>
                                  <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-mono font-bold uppercase">
                                    Status: Lost Lead
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 gap-3.5 text-left text-xs">
                                  <div>
                                    <span className="block text-[10px] text-zinc-400 uppercase font-mono font-bold mb-1">Lost Reason</span>
                                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-rose-300 font-semibold font-mono text-xs">
                                      {lostReasonText}
                                    </div>
                                  </div>

                                  <div>
                                    <span className="block text-[10px] text-zinc-400 uppercase font-mono font-bold mb-1">Lost Note</span>
                                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs whitespace-pre-wrap font-sans">
                                      {lostNotesText}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })() : (['Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Raw Footage Received', 'Editing Started', 'Client Review', 'Editing Complete', 'Completed'].includes(wizardLeadData.status || selectedLead?.status || '') || selectedLead?.booking_status === 'Confirmed' || !!orders?.find(o => o.lead_id === selectedLead?.lead_id)) ? (
                            (selectedLead?.status === 'Order Confirmed' || selectedLead?.status === 'Event Scheduled' || selectedLead?.booking_status === 'Confirmed' || !!orders?.find(o => o.lead_id === selectedLead?.lead_id)) ? (
                              <div id="configure_confirmed_order_section" className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5 space-y-3.5 animate-in fade-in zoom-in-95 duration-200">
                                <div className="border-b border-emerald-500/20 pb-1.5">
                                  <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest font-mono">💍 Order Confirmation Details</h4>
                                  <p className="text-[10px] text-zinc-400 mt-0.5">These are the finalized details saved for this order from the database.</p>
                                </div>
                                
                                <div className="hidden">
                                  <input type="text" value={selectedLead?.booking_date || selectedLead?.event_date || wizardLeadData.confirmed_event_date || ''} onChange={() => {}} />
                                  <input type="number" value={selectedLead?.final_package_amount || selectedLead?.Final_Quotation_Amount || wizardLeadData.final_amount || 0} onChange={() => {}} />
                                  <input type="number" value={selectedLead?.advance_collected || wizardLeadData.advance_received || 0} onChange={() => {}} />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-left text-xs">
                                  <div>
                                    <span className="block text-[10px] text-zinc-500 uppercase font-mono font-bold mb-0.5">Order Status</span>
                                    <strong className="text-emerald-400">Order Confirmed</strong>
                                  </div>
                                  
                                  <div className="col-span-1 sm:col-span-2 space-y-2 mb-2">
                                    {crmEvents && crmEvents.length > 0 ? (
                                      crmEvents.map((ev: any, idx: number) => (
                                        <div key={ev.id} className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                          <div className="flex flex-col min-w-max">
                                            <span className="text-[10px] text-amber-500 font-black uppercase tracking-wider mb-0.5">Event {idx + 1}</span>
                                            <span className="text-xs font-bold text-slate-200">{ev.event_name || ev.event_type || 'N/A'}</span>
                                          </div>
                                          <div className="flex gap-4">
                                            <div>
                                              <span className="block text-[9px] text-zinc-500 uppercase font-mono font-bold">Booking Date</span>
                                              <strong className="text-slate-300 text-xs font-mono">{ev.event_date || 'N/A'}</strong>
                                            </div>
                                            <div>
                                              <span className="block text-[9px] text-zinc-500 uppercase font-mono font-bold">Booking Time</span>
                                              <strong className="text-slate-300 text-xs font-mono">{ev.event_start_time ? convertTo12Hour(ev.event_start_time) : 'N/A'}</strong>
                                            </div>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <div>
                                        <span className="block text-[10px] text-zinc-500 uppercase font-mono font-bold mb-0.5">Booking Date & Time</span>
                                        <strong className="text-slate-200">{selectedLead?.booking_date || 'N/A'} {selectedLead?.booking_time ? `at ${selectedLead.booking_time}` : ''}</strong>
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <span className="block text-[10px] text-zinc-500 uppercase font-mono font-bold mb-0.5">Final Package Amount</span>
                                    <strong className="text-amber-400 font-mono">₹{Number(selectedLead?.final_package_amount || selectedLead?.Final_Quotation_Amount || wizardLeadData.final_amount || 0).toLocaleString('en-IN')}</strong>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] text-zinc-500 uppercase font-mono font-bold mb-0.5">Advance Payment</span>
                                    <strong className="text-emerald-400 font-mono">₹{Number((selectedLead?.advance_collected !== undefined && selectedLead?.advance_collected !== null && selectedLead?.advance_collected !== '') ? selectedLead.advance_collected : (wizardLeadData.advance_received || 0)).toLocaleString('en-IN')}</strong>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] text-zinc-500 uppercase font-mono font-bold mb-0.5">Payment Mode</span>
                                    <strong className="text-slate-200">{selectedLead?.payment_mode || 'N/A'}</strong>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] text-zinc-500 uppercase font-mono font-bold mb-0.5">Transaction ID</span>
                                    <strong className="text-slate-200">
                                      {(selectedLead?.payment_mode === 'Cash' || selectedLead?.payment_mode === 'Other') ? 'N/A' : (selectedLead?.transaction_id || payments?.find(p => p.order_id === (orders?.find(o => o.lead_id === selectedLead?.lead_id)?.order_id || selectedLead?.lead_id))?.transaction_id || 'N/A')}
                                    </strong>
                                  </div>
                                  <div className="col-span-1 sm:col-span-2">
                                    <span className="block text-[10px] text-zinc-500 uppercase font-mono font-bold mb-0.5">Booking Notes</span>
                                    <p className="text-slate-300 whitespace-pre-wrap">{selectedLead?.contract_notes || 'No extra notes'}</p>
                                  </div>
                                </div>

                                {crmEvents && crmEvents.length > 0 && (
                                  <div className="mt-4 space-y-3">
                                    <h5 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest font-mono border-b border-emerald-500/20 pb-1.5">Event-wise Details</h5>
                                    {crmEvents.map((ev: any) => (
                                      <div key={ev.id} className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                        <div className="col-span-1 sm:col-span-4">
                                          <span className="text-xs font-bold text-slate-200">🎬 {ev.event_name || ev.event_type}</span>
                                        </div>
                                        <div>
                                           <span className="block text-[10px] text-zinc-500 uppercase font-mono font-bold mb-0.5">Event Date</span>
                                           <strong className="text-slate-300 font-mono">{ev.event_date || 'N/A'}</strong>
                                        </div>
                                        <div>
                                           <span className="block text-[10px] text-zinc-500 uppercase font-mono font-bold mb-0.5">Reporting Date</span>
                                           <strong className="text-slate-300 font-mono">{ev.reporting_date || ev.event_date || 'N/A'}</strong>
                                        </div>
                                        <div>
                                           <span className="block text-[10px] text-zinc-500 uppercase font-mono font-bold mb-0.5">Reporting End Date</span>
                                           <strong className="text-slate-300 font-mono">{ev.event_end_date || ev.Event_End_Date || (crmEvents.length === 1 && selectedLead?.Event_End_Date ? selectedLead.Event_End_Date : 'N/A')}</strong>
                                        </div>
                                        <div>
                                           <span className="block text-[10px] text-zinc-500 uppercase font-mono font-bold mb-0.5">Reporting Time</span>
                                           <strong className="text-slate-300 font-mono">{ev.reporting_time || 'N/A'}</strong>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 flex items-center justify-between text-xs mt-4">
                                  <div>
                                    <span className="text-[10px] text-zinc-555 uppercase font-bold font-mono">Calculated Pending Amount</span>
                                    <strong className="block text-red-500 text-sm font-mono mt-0.5">
                                      ₹{(Number(selectedLead?.final_package_amount || selectedLead?.Final_Quotation_Amount || wizardLeadData.final_amount || 0) - Number((selectedLead?.advance_collected !== undefined && selectedLead?.advance_collected !== null && selectedLead?.advance_collected !== '') ? selectedLead.advance_collected : (wizardLeadData.advance_received || 0))).toLocaleString('en-IN')}
                                    </strong>
                                  </div>
                                  {(Number(selectedLead?.final_package_amount || selectedLead?.Final_Quotation_Amount || wizardLeadData.final_amount || 0) - Number((selectedLead?.advance_collected !== undefined && selectedLead?.advance_collected !== null && selectedLead?.advance_collected !== '') ? selectedLead.advance_collected : (wizardLeadData.advance_received || 0))) > 0 ? (
                                    <span className="text-[9px] bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded uppercase font-bold font-mono">Payment Pending</span>
                                  ) : (
                                    <span className="text-[9px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded uppercase font-bold font-mono">Fully Paid</span>
                                  )}
                                </div>
                              </div>
                            ) : (

                            <div id="configure_confirmed_order_section" className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5 space-y-3.5 animate-in fade-in zoom-in-95 duration-200">
                              <div className="border-b border-emerald-500/20 pb-1.5">
                                <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest font-mono">💍 Configure Confirmed Order & Booking Contract</h4>
                                <p className="text-[10px] text-zinc-400 mt-0.5">Confirming this order creates a real-time production entry. The CRM profile remains editable if the client requests changes.</p>
                              </div>

                              {/* Display each event separately */}
                              {crmEvents && crmEvents.length > 0 && (
                                <div className="space-y-2 mb-4">
                                  <label className="block text-[10px] text-zinc-400 mb-2 uppercase font-mono font-bold border-b border-zinc-800 pb-1">Confirmed Event Dates</label>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {crmEvents.map(ev => (
                                      <div key={ev.id} className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-0.5">🎬 {ev.event_name || ev.event_type || 'Event'}</span>
                                          <div className="flex items-center gap-3 mt-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[10px] text-slate-500 font-mono">Date:</span>
                                              <span className="text-[11px] text-slate-300 font-mono font-semibold">{ev.event_date || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[10px] text-slate-500 font-mono">Time:</span>
                                              <span className="text-[11px] text-slate-300 font-mono font-semibold">{ev.event_start_time ? convertTo12Hour(ev.event_start_time) : 'N/A'}</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-left">
                                {/* Hidden input to preserve business logic without confusing the UI */}
                                <div className="hidden">
                                  <label className="block text-[10px] text-zinc-400 mb-1 uppercase font-mono font-bold">Confirmed Event Date *</label>
                                  <input
                                    id="input_confirmed_event_date"
                                    type="date"
                                    value={wizardLeadData.confirmed_event_date || (crmEvents && crmEvents.length > 0 ? crmEvents[0].event_date : '') || ''}
                                    onChange={(e) => setWizardLeadData({ ...wizardLeadData, confirmed_event_date: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 px-3 text-xs text-white font-mono"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] text-zinc-400 mb-1 uppercase font-mono font-bold">Contract Final Amount (₹) *</label>
                                  <input
                                    id="input_final_amount"
                                    type="number"
                                    value={wizardLeadData.final_amount ?? ""}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setWizardLeadData({ ...wizardLeadData, final_amount: val === "" ? ("" as any) : Math.max(0, parseInt(val) || 0) });
                                    }}
                                    className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 px-3 text-xs text-amber-400 font-mono font-bold"
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-zinc-400 mb-1 uppercase font-mono font-bold">Advance Payment Received (₹) *</label>
                                  <input
                                    id="input_advance_received"
                                    type="number"
                                    value={wizardLeadData.advance_received ?? ""}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setWizardLeadData({ ...wizardLeadData, advance_received: val === "" ? ("" as any) : Math.max(0, parseInt(val) || 0) });
                                    }}
                                    className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 px-3 text-xs text-emerald-400 font-mono font-bold"
                                    required
                                  />
                                </div>
                                
                                {crmEvents && crmEvents.length > 0 && (
                                  <div className="col-span-1 sm:col-span-2 mt-4 space-y-3">
                                    <h5 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest font-mono border-b border-emerald-500/20 pb-1.5">Event-wise Reporting Details</h5>
                                    {crmEvents.map(ev => {
                                      const repEndDate = ev.event_end_date || ev.Event_End_Date || (crmEvents.length === 1 && selectedLead?.Event_End_Date ? selectedLead.Event_End_Date : '');
                                      return (
                                        <div key={ev.id} className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                          <div className="col-span-1 sm:col-span-3"><span className="text-xs font-bold text-slate-200">🎬 {ev.event_name || ev.event_type}</span></div>
                                          <div>
                                             <label className="block text-[10px] text-zinc-400 mb-1 uppercase font-mono font-bold">Reporting Date *</label>
                                             <input 
                                               id={`reporting_date_${ev.id}`}
                                               type="date" 
                                               value={ev.reporting_date || ev.event_date || ''} 
                                               onChange={(e) => {
                                                 const updated = crmEvents.map(eItem => eItem.id === ev.id ? { ...eItem, reporting_date: e.target.value } : eItem);
                                                 setCrmEvents(updated);
                                               }} 
                                               className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 px-3 text-xs text-white font-mono"
                                               required 
                                             />
                                          </div>
                                          <div>
                                             <label className="block text-[10px] text-zinc-400 mb-1 uppercase font-mono font-bold">Reporting End Date</label>
                                             <input 
                                               id={`reporting_end_date_${ev.id}`}
                                               type="date" 
                                               value={repEndDate} 
                                               readOnly
                                               placeholder="N/A"
                                               className="w-full bg-slate-950/60 border border-slate-850/80 rounded-lg py-1.5 px-3 text-xs text-slate-300 font-mono cursor-not-allowed"
                                             />
                                          </div>
                                          <div>
                                             <label className="block text-[10px] text-zinc-400 mb-1 uppercase font-mono font-bold">Reporting Time *</label>
                                             <TimePicker12Hour 
                                               id={`reporting_time_${ev.id}`}
                                               required
                                               value={ev.reporting_time || ''} 
                                               onChange={(val24) => {
                                                 const updated = crmEvents.map(eItem => eItem.id === ev.id ? { ...eItem, reporting_time: val24 } : eItem);
                                                 setCrmEvents(updated);
                                               }} 
                                             />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 flex items-center justify-between text-xs">
                                <div>
                                  <span className="text-[10px] text-zinc-550 uppercase font-bold font-mono">Calculated Pending Amount</span>
                                  <strong className="block text-red-500 text-sm font-mono mt-0.5">₹{((wizardLeadData.final_amount || 0) - (wizardLeadData.advance_received || 0)).toLocaleString('en-IN')}</strong>
                                </div>
                                <span className="text-[9px] bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded uppercase font-bold font-mono">Payment Pending</span>
                              </div>
                            </div>
                            )
                          ) : (
                            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
                              <span className="text-slate-500 text-xs font-mono">No Order Confirmation Details Available.</span>
                            </div>
                          )}
                        </div>
                      </div>
                     </div>
                   )}
                  </fieldset>
                </form>
              </div>
            </div>

            {/* Footer Buttons: Sticky */}
            <div className="py-1 px-4 sm:px-5 border-t border-slate-850 flex items-center justify-between bg-slate-950/40 sticky bottom-0 z-10 shrink-0 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                {crmWizardStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setCrmWizardStep(crmWizardStep - 1)}
                    className="px-3.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-mono font-bold uppercase rounded transition-all cursor-pointer border border-slate-705 border-0"
                  >
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedLead(null)}
                    className="px-3.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-mono font-bold uppercase rounded transition-all cursor-pointer border border-slate-705 border-0"
                  >
                    Back
                  </button>
                )}
                {crmWizardStep === 2 && selectedLead?.status === 'Order Confirmed' && (
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirmPopup(true)}
                    disabled={isCrmLocked}
                    className={`px-3.5 py-1 text-xs font-mono font-bold uppercase rounded transition-all shadow-lg ${
                      isCrmLocked ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50 shadow-none' : 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-rose-600/15'
                    } border border-transparent`}
                  >
                    Lost Lead
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const hasCrmPackage = Boolean(
                    (wizardLeadData.selected_package_id && wizardLeadData.selected_package_id.trim() !== '') ||
                    ((wizardLeadData as any).Select_Package_Option && (wizardLeadData as any).Select_Package_Option.trim() !== '') ||
                    (selectedLead?.Select_Package_Option && selectedLead.Select_Package_Option.trim() !== '') ||
                    (selectedLead?.selected_package_id && selectedLead.selected_package_id.trim() !== '')
                  );

                  return (
                    <>
                      {crmWizardStep === 3 && !isLeadConfirmed && wizardLeadData.status !== 'Order Confirmed' && selectedLead?.status !== 'Order Confirmed' && (
                        <button
                          type="button"
                          id="btn_step3_order_confirmed"
                          onClick={() => {
                            if (!selectedLead) return;
                            if (!areReportingDetailsComplete(selectedLead)) {
                              openReportingDetailsModal(selectedLead, "Please complete and save the Reporting Details before confirming the order.");
                              return;
                            }
                            const today = new Date().toISOString().split('T')[0];
                            const linkedOrder = orders?.find(o => o.lead_id === selectedLead.lead_id);
                            const linkedPayment = linkedOrder ? payments?.find(p => p.order_id === linkedOrder.order_id) : null;
                            const calcAdvance = linkedPayment 
                              ? ((linkedPayment.advance_received ?? 0) + (linkedPayment.final_payment_received ?? 0)) 
                              : (linkedOrder 
                                  ? (linkedOrder.advance_received ?? 0) 
                                  : (selectedLead.advance_collected !== undefined && selectedLead.advance_collected !== null && selectedLead.advance_collected !== ''
                                      ? Number(selectedLead.advance_collected) 
                                      : (wizardLeadData.advance_received !== undefined && wizardLeadData.advance_received !== null && wizardLeadData.advance_received !== ''
                                          ? Number(wizardLeadData.advance_received) 
                                          : 0)));
                            
                            setConfirmForm({
                              ...confirmForm,
                              package_name: packages?.find((p) => String(p.package_id) === String(wizardLeadData.selected_package_id || selectedLead.Select_Package_Option))?.package_name || wizardLeadData.selected_package_id || selectedLead.Select_Package_Option || '',
                              quotation_amount: Number(selectedLead.Final_Package_Amount) || Number((selectedLead as any).final_package_amount) || Number(wizardLeadData.final_amount) || Number(selectedLead.Final_Quotation_Amount) || Number((selectedLead as any).final_amount) || 0,
                              advance_received: calcAdvance,
                              event_date: selectedLead.event_date || today,
                              event_time: selectedLead.event_time || ''
                            });
                            setShowConfirmModal(true);
                          }}
                          disabled={isSaving || isCrmLocked || !hasCrmPackage}
                          className={`px-4 py-1 text-xs font-mono font-bold uppercase rounded transition-all shadow-md flex items-center gap-1.5 border-0 ${
                            isCrmLocked
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50 shadow-none' :
                            !hasCrmPackage
                              ? 'bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed opacity-50 shadow-none'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-emerald-950/20'
                          }`}
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                          <span>ORDER CONFIRMED</span>
                        </button>
                      )}
                      <button
                        type="button"
                        id="btn_crm_save_step"
                        onClick={() => handleSaveStep(crmWizardStep)}
                        disabled={isSaving || isCrmLocked || (crmWizardStep === 3 && !hasCrmPackage)}
                        className={`px-4 py-1 text-xs font-mono font-bold uppercase rounded transition-all shadow-md flex items-center gap-1.5 border-0 ${
                          isCrmLocked
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50 shadow-none' :
                          crmWizardStep === 3 && !hasCrmPackage
                            ? 'bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed opacity-50 shadow-none'
                            : 'bg-indigo-650 hover:bg-indigo-600 text-white cursor-pointer'
                        }`}
                      >
                        {isSaving ? (
                          <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                        ) : null}
                        <span>{isSaving ? 'Saving...' : crmWizardStep === 3 ? ((isLeadConfirmed || ['Order Confirmed', 'Event Scheduled', 'Completed'].includes(wizardLeadData.status || selectedLead?.status || '')) ? 'Save' : 'SAVE & FOLLOW-UP') : 'Save & Next'}</span>
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

      {saveErrorPopup && (
        <div id="save_error_popup" className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto text-xl font-bold font-mono">
              ❌
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                {saveErrorPopup.title}
              </h3>
              <p className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed">
                {saveErrorPopup.message}
              </p>
            </div>
            <button
              onClick={() => setSaveErrorPopup(null)}
              className="w-full py-2 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold uppercase rounded-lg transition-all border-0 shadow-md"
            >
              Close
            </button>
          </div>
        </div>
      )}



{/* MODAL: Existing Customer Detection Pop-up */}
      {showDetectionPopup && detectedCustomer && (
        <div id="modal_existing_customer_detection" className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-indigo-500/30 rounded-2xl w-full max-w-lg shadow-2xl relative p-6 space-y-5">
            {/* Ambient light ring */}
            <div className="absolute top-0 left-12 w-48 h-48 bg-indigo-500/[0.03] rounded-full blur-[60px] pointer-events-none" />

            <div className="flex items-start justify-between border-b border-slate-800 pb-3 relative z-10">
              <div>
                <h3 className="text-sm font-bold text-white tracking-widest font-mono flex items-center gap-1.5">
                  <span className="p-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] rounded font-black font-mono">DUPLICATION WARNING</span>
                  <span>EXISTING CUSTOMER DETECTED</span>
                </h3>
                <p className="text-[11px] text-indigo-300 mt-0.5 font-sans">
                  The phone index or email graph entered already maps to an active account.
                </p>
              </div>
              <button 
                onClick={() => { setShowDetectionPopup(false); setDetectedCustomer(null); }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 relative z-10 text-slate-300 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-max">
                <thead>
                  <tr className="bg-slate-900 text-slate-400 font-mono text-[9px] uppercase">
                    <th className="p-2 border border-slate-800">Customer Name</th>
                    <th className="p-2 border border-slate-800">Phone Number</th>
                    <th className="p-2 border border-slate-800">Lead Created Date</th>
                    <th className="p-2 border border-slate-800">Current Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-950/40 text-slate-300">
                    <td className="p-2 border border-slate-800 font-bold">{detectedCustomer.customer_name}</td>
                    <td className="p-2 border border-slate-800 font-mono">{detectedCustomer.mobile}</td>
                    <td className="p-2 border border-slate-800 font-mono">
                      {detectedCustomer.leads && detectedCustomer.leads.length > 0 
                        ? new Date(Math.max(...detectedCustomer.leads.map((l: any) => new Date(l.created_date || 0).getTime()))).toISOString().split('T')[0]
                        : 'N/A'}
                    </td>
                    <td className="p-2 border border-slate-800">
                      {detectedCustomer.leads && detectedCustomer.leads.length > 0
                        ? getLeadCurrentStatus(detectedCustomer.leads.sort((a: any, b: any) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())[0])
                        : 'N/A'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-2 p-1 border-t border-slate-800 mt-4 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowDetectionPopup(false);
                  setDetectedCustomer(null);
                  setActiveTab('list');
                }}
                className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-755 text-slate-200 border border-slate-700 rounded-lg cursor-pointer transition-all font-bold"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowDetectionPopup(false);
                  setDetectedCustomer(null);
                }}
                className="px-4 py-2 text-xs bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-505 hover:to-indigo-605 text-white rounded-lg shadow-md cursor-pointer transition-all font-bold"
              >
                Continue
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: Business Owner Unlock Reason Prompt */}
      {unlockingRecordId && (
        <div id="modal_sales_record_unlock" className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl w-full max-w-md shadow-2xl relative p-6 space-y-4">
            <div className="absolute top-0 left-12 w-48 h-48 bg-amber-500/[0.03] rounded-full blur-[60px] pointer-events-none" />
            
            <div className="flex items-start justify-between border-b border-slate-800 pb-3 relative z-10 font-sans">
              <div>
                <h3 className="text-sm font-bold text-white tracking-widest font-mono flex items-center gap-1.5">
                  <span className="p-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] rounded font-black font-mono">OWNER OVERRIDE</span>
                  <span>UNLOCK REASON REQUIRED</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                  Provide a justification to unlock this protected sales record.
                </p>
              </div>
              <button 
                onClick={() => { setUnlockingRecordId(''); setUnlockReason('Data Correction'); setUnlockCustomReason(''); }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const finalReason = unlockReason === 'Other' ? unlockCustomReason : unlockReason;
              if (!finalReason.trim()) {
                alert('A valid unlock reason is required.');
                return;
              }
              unlockRecord(unlockingRecordId, 'Sales', finalReason);
              setUnlockingRecordId('');
              setUnlockCustomReason('');
              setUnlockReason('Data Correction');
              alert('Record unlocked successfully for editing!');
            }} className="space-y-4 relative z-10 font-sans">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase font-mono tracking-wider">
                  Select Override Reason *
                </label>
                <select
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-205 focus:outline-none focus:border-slate-700"
                >
                  <option value="Data Correction">Data Correction</option>
                  <option value="Customer Request">Customer Request</option>
                  <option value="Admin Override">Admin Override</option>
                  <option value="Other">Other (Type custom reason)</option>
                </select>
              </div>

              {unlockReason === 'Other' && (
                <div className="animate-fade-in">
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase font-mono tracking-wider">
                    Custom justification *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter unlock justification..."
                    value={unlockCustomReason}
                    onChange={(e) => setUnlockCustomReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-slate-700"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800 font-bold">
                <button
                  type="button"
                  onClick={() => { setUnlockingRecordId(''); setUnlockReason('Data Correction'); setUnlockCustomReason(''); }}
                  className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg cursor-pointer border border-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow-sm cursor-pointer font-extrabold uppercase tracking-wide font-mono border border-amber-500/20"
                >
                  🔓 Confirm Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GLOBAL MODALS ACCESSIBLE CROSS-TAB */}
      
      {/* 1. Global Read-Only View Details Modal wrapped in createPortal to overlay on top of any active portals (like Screen 2 Create Lead) */}
      {viewingPkgDetails && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[20000] flex items-center justify-center p-4 overflow-y-auto animate-fade-in text-left text-xs bg-black/60">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-5 shadow-2xl relative text-slate-300">
            
            {!viewingPkgDetails.package_name ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
                <span className="text-3xl text-rose-550">⚠️</span>
                <h4 className="text-sm font-bold text-slate-100">Package details not available.</h4>
                <p className="text-xs text-slate-400">The requested package specifications could not be resolved or found.</p>
                <button
                  type="button"
                  onClick={() => setViewingPkgDetails(null)}
                  className="px-4 py-2 bg-emerald-605 hover:bg-emerald-505 text-white font-bold rounded-lg text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (() => {
              // Internal parser helpers
              const getDeliverableValue = (pkg: any, key: string) => {
                const text = (pkg.deliverables || '').toLowerCase();
                const name = (pkg.package_name || '').toLowerCase();
                
                if (key === 'photos') {
                  const matches = pkg.deliverables?.match(/(\d+\s+edited\s+photos|\d+\+?\s+photos|unlimited\s+photos)/i);
                  if (matches) return matches[0];
                  if (text.includes('photographer') || text.includes('photos')) {
                    const sentences = parseTeamMembers(pkg.deliverables);
                    const match = sentences.find((s: string) => s.toLowerCase().includes('photographer') || s.toLowerCase().includes('photo') || s.toLowerCase().includes('candid'));
                    if (match) return match;
                  }
                  return 'Standard High-Res Edited Digital Photos';
                }

                if (key === 'videos') {
                  if (text.includes('video') || text.includes('videographer') || text.includes('cinematic') || text.includes('teaser')) {
                    const sentences = parseTeamMembers(pkg.deliverables);
                    const match = sentences.find((s: string) => s.toLowerCase().includes('video') || s.toLowerCase().includes('videographer') || s.toLowerCase().includes('cinematic') || s.toLowerCase().includes('teaser'));
                    if (match) return match;
                    return '4K Cinematic Highlight Video';
                  }
                  return 'Not Included';
                }

                if (key === 'reels') {
                  if (text.includes('reels') || text.includes('reel') || text.includes('short')) {
                    const sentences = parseTeamMembers(pkg.deliverables);
                    const match = sentences.find((s: string) => s.toLowerCase().includes('reel') || s.toLowerCase().includes('short'));
                    if (match) return match;
                    return 'Reels Package Included';
                  }
                  if (name.includes('platinum') || name.includes('diamond')) {
                    return 'Complimentary social reels package included';
                  }
                  return 'Not Included';
                }

                if (key === 'album') {
                  if (text.includes('album') || text.includes('book') || text.includes('print')) {
                    const sentences = parseTeamMembers(pkg.deliverables);
                    const match = sentences.find((s: string) => s.toLowerCase().includes('album') || s.toLowerCase().includes('book') || s.toLowerCase().includes('print'));
                    if (match) return match;
                    return 'Standard Hardcover Photo Album';
                  }
                  return 'Not Included';
                }

                if (key === 'frames') {
                  if (text.includes('frame') || text.includes('canvas')) {
                    const sentences = parseTeamMembers(pkg.deliverables);
                    const match = sentences.find((s: string) => s.toLowerCase().includes('frame') || s.toLowerCase().includes('canvas'));
                    if (match) return match;
                    return '1 Wall Frame / Canvas Print';
                  }
                  if (name.includes('platinum') || name.includes('diamond')) {
                    return '1 Large Dynamic Acrylic Wall Frame';
                  }
                  return 'Not Included';
                }

                return 'N/A';
              };

              const normalizeSalesText = (value: any): string => {
                if (typeof value === 'string') return value;
                if (Array.isArray(value)) {
                  return value.map(item => {
                    if (typeof item === 'string') return item;
                    if (item && typeof item === 'object') {
                      return item.name || item.role || item.text || item.title || JSON.stringify(item);
                    }
                    return String(item || '');
                  }).join(' ');
                }
                if (value && typeof value === 'object') {
                  return value.name || value.role || value.text || value.title || JSON.stringify(value);
                }
                if (value == null) return '';
                return String(value);
              };

              const getTeamValue = (pkg: any, key: string) => {
                const text = (normalizeSalesText(pkg.team_members) + ' ' + normalizeSalesText(pkg.deliverables)).toLowerCase();
                
                if (key === 'photographer') {
                  if (text.includes('candid photographer') && text.includes('traditional photographer')) {
                    return '2 Photographers (1 Candid, 1 Traditional)';
                  }
                  if (text.includes('candid photographer') || text.includes('candid')) {
                    return '1 Professional Candid Photographer';
                  }
                  if (text.includes('traditional photographer')) {
                    return '1 Traditional Photographer';
                  }
                  if (text.includes('photographer')) {
                    const matches = text.match(/(\d+)\s+photographer/i);
                    return matches ? `${matches[1]} Lead Photographer(s)` : '1 Candid Photographer';
                  }
                  return '1 Candid Photographer';
                }

                if (key === 'videographer') {
                  if (text.includes('cinematographer') && text.includes('traditional videographer')) {
                    return '2 Videographers (1 Cinema, 1 Traditional)';
                  }
                  if (text.includes('cinematographer') || text.includes('cinematic videographer') || text.includes('cinematic')) {
                    return '1 Cinematic Videographer (4K Cinematic)';
                  }
                  if (text.includes('traditional videographer') || text.includes('videographer')) {
                    return '1 Traditional Videographer';
                  }
                  if (pkg.category?.toLowerCase().includes('photo') && !text.includes('video')) {
                    return '0 (Photography Only Package)';
                  }
                  return '1 Professional Videographer';
                }

                if (key === 'drone') {
                  if (text.includes('drone') || text.includes('aerial')) {
                    return '1 Certified Drone Pilot (Cinematic 4K Aerials)';
                  }
                  return '0 (Available as Premium Add-on)';
                }

                if (key === 'assistant') {
                  if (text.includes('assistant') || text.includes('lights') || text.includes('production manager')) {
                    return '1 Technical Field Assistant';
                  }
                  const crewMatch = text.match(/(\d+)\s+crew/i);
                  if (crewMatch) {
                    const total = parseInt(crewMatch[1], 10);
                    if (total > 3) return '1/2 Setup & Lights Assistants';
                  }
                  return '0 (Standard Crew Allocation)';
                }

                return 'N/A';
              };

              const getCoverageValue = (pkg: any, key: string) => {
                const cat = (pkg.category || '').toLowerCase();
                const name = (pkg.package_name || '').toLowerCase();

                if (key === 'hours') {
                  if (name.includes('pre-wedding') || name.includes('shoot') || name.includes('interior') || name.includes('product')) {
                    return '3 to 5 Event Shoot Hours';
                  }
                  if (name.includes('platinum') || name.includes('diamond')) {
                    return 'Continuous Coverage (Up to 12 Hours)';
                  }
                  return 'Full Day (8 to 10 Hours)';
                }

                if (key === 'events') {
                  if (name.includes('platinum') || name.includes('diamond')) {
                    return 'Multi-event Coverage (Pre-wedding + Wedding covered)';
                  }
                  return '1 Main Day Event Coverage';
                }

                if (key === 'type') {
                  if (cat.includes('outdoor') || name.includes('outdoor')) {
                    return 'Exclusively Outdoor Locations';
                  }
                  if (cat.includes('interior') || name.includes('indoor') || name.includes('interior')) {
                    return 'Fully Indoor / Controlled Studio / Residential';
                  }
                  return 'Hybrid (Both Indoor Banquet & Outdoor Garden/Mandap)';
                }

                return 'N/A';
              };

              const getOffersValue = (pkg: any, key: string) => {
                const offer = pkg.seasonal_offer || '';
                
                if (key === 'seasonal') {
                  if (offer && offer !== 'None') return offer;
                  return 'No seasonal discount currently active';
                }

                if (key === 'complimentary') {
                  if (offer.toLowerCase().includes('complimentary') || offer.toLowerCase().includes('free')) {
                    return offer;
                  }
                  const price = pkg.price || 0;
                  if (price > 120000) {
                    return 'Complimentary Pre-Wedding Teaser videography & 1 Framed Canvas Print';
                  }
                  if (price > 80000) {
                    return 'Complimentary Wedding Film Teaser (1-min Reels Cut)';
                  }
                  return 'Standard Package Deliverables Apply';
                }

                return 'N/A';
              };

              const photosVal = getDeliverableValue(viewingPkgDetails, 'photos');
              const videosVal = getDeliverableValue(viewingPkgDetails, 'videos');
              const reelsVal = getDeliverableValue(viewingPkgDetails, 'reels');
              const albumVal = getDeliverableValue(viewingPkgDetails, 'album');
              const framesVal = getDeliverableValue(viewingPkgDetails, 'frames');

              const photographerVal = getTeamValue(viewingPkgDetails, 'photographer');
              const videographerVal = getTeamValue(viewingPkgDetails, 'videographer');
              const droneVal = getTeamValue(viewingPkgDetails, 'drone');
              const assistantVal = getTeamValue(viewingPkgDetails, 'assistant');

              const hoursVal = getCoverageValue(viewingPkgDetails, 'hours');
              const eventsVal = getCoverageValue(viewingPkgDetails, 'events');
              const typeVal = getCoverageValue(viewingPkgDetails, 'type');

              const seasonalVal = getOffersValue(viewingPkgDetails, 'seasonal');
              const complimentaryVal = getOffersValue(viewingPkgDetails, 'complimentary');

              return (
                <>
                  {/* Header */}
                  <div className="flex justify-between items-start border-b border-slate-800 pb-3.5">
                    <div>
                      <span className="font-mono text-[10px] text-zinc-500 font-bold uppercase block mb-0.5">
                        ID: {viewingPkgDetails.package_id || 'Dynamic Link'}
                      </span>
                      <h4 className="text-sm sm:text-base font-extrabold text-slate-100 font-sans tracking-tight">
                        📋 {viewingPkgDetails.package_name || 'Package Specifications'}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ${
                        viewingPkgDetails.status === 'Active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                      }`}>
                        {viewingPkgDetails.status || 'Active'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewingPkgDetails(null)}
                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg cursor-pointer"
                        title="Close Modal"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Pricing and Category Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/40 p-3 rounded-xl border border-slate-850">
                    <div>
                      <span className="text-slate-550 block font-bold text-[9px] uppercase font-mono mb-0.5">Category Group</span>
                      <span className="text-indigo-400 font-bold text-xs">{normalizeCategory(viewingPkgDetails.category)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-550 block font-bold text-[9px] uppercase font-mono mb-0.5">Standard Package Rate</span>
                      <span className="text-emerald-400 font-mono font-black text-sm">
                        ₹{viewingPkgDetails.price ? viewingPkgDetails.price.toLocaleString('en-IN') : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Dynamic Custom Info Banner */}
                  {(viewingPkgDetails.event_type || viewingPkgDetails.duration || viewingPkgDetails.package_includes) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-850 text-xs">
                      {viewingPkgDetails.event_type && (
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase font-mono font-semibold mb-0.5">Event Type</span>
                          <span className="text-slate-200 font-medium">{viewingPkgDetails.event_type}</span>
                        </div>
                      )}
                      {viewingPkgDetails.duration && (
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase font-mono font-semibold mb-0.5">Duration</span>
                          <span className="text-slate-200 font-medium">{viewingPkgDetails.duration}</span>
                        </div>
                      )}
                      {viewingPkgDetails.package_includes && (
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase font-mono font-semibold mb-0.5">Key Focus</span>
                          <span className="text-slate-200 font-medium">{viewingPkgDetails.package_includes}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4.5 max-h-[50vh] overflow-y-auto pr-1">
                    {/* Deliverables Panel */}
                    <div className="bg-slate-950/20 border border-slate-850 p-3.5 rounded-xl space-y-2.5">
                      <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase block border-b border-slate-850 pb-1.5 flex items-center gap-1.5">
                        📦 Key Deliverables Included
                      </span>
                      <div className="space-y-2 text-xs">
                        <div className="flex flex-col bg-slate-900/40 p-1.5 rounded border border-transparent hover:border-slate-800/60">
                          <span className="text-slate-500 text-[10px] font-bold font-mono">Photos Included</span>
                          <span className="text-slate-200 font-semibold">{photosVal}</span>
                        </div>
                        <div className="flex flex-col bg-slate-900/40 p-1.5 rounded border border-transparent hover:border-slate-800/60">
                          <span className="text-slate-500 text-[10px] font-bold font-mono">Videos Included</span>
                          <span className="text-slate-205 font-medium">{videosVal}</span>
                        </div>
                        <div className="flex flex-col bg-slate-900/40 p-1.5 rounded border border-transparent hover:border-slate-800/60">
                          <span className="text-slate-500 text-[10px] font-bold font-mono font-mono">Reels Included</span>
                          <span className="text-slate-205 font-medium">{reelsVal}</span>
                        </div>
                        <div className="flex flex-col bg-slate-900/40 p-1.5 rounded border border-transparent hover:border-slate-800/60">
                          <span className="text-slate-500 text-[10px] font-bold font-mono">Album Included</span>
                          <span className="text-slate-205 font-medium">{albumVal}</span>
                        </div>
                        <div className="flex flex-col bg-slate-900/40 p-1.5 rounded border border-transparent hover:border-slate-800/60">
                          <span className="text-slate-500 text-[10px] font-bold font-mono">Frames Included</span>
                          <span className="text-slate-205 font-medium">{framesVal}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right column: Crew & Coverage */}
                    <div className="space-y-4">
                      {/* Crew Members */}
                      <div className="bg-slate-950/20 border border-slate-850 p-3.5 rounded-xl space-y-2.5">
                        <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase block border-b border-slate-850 pb-1.5 flex items-center gap-1.5">
                          👥 Team Members Included
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-900/40 p-1.5 rounded">
                            <span className="text-slate-500 text-[9px] font-bold uppercase block mb-0.5">Photographer Count</span>
                            <span className="text-slate-250 font-medium">{photographerVal}</span>
                          </div>
                          <div className="bg-slate-900/40 p-1.5 rounded">
                            <span className="text-slate-500 text-[9px] font-bold uppercase block mb-0.5">Videographer Count</span>
                            <span className="text-slate-250 font-medium">{videographerVal}</span>
                          </div>
                          <div className="bg-slate-900/40 p-1.5 rounded">
                            <span className="text-slate-500 text-[9px] font-bold uppercase block mb-0.5">Drone Operator Count</span>
                            <span className="text-slate-250 font-medium">{droneVal}</span>
                          </div>
                          <div className="bg-slate-900/40 p-1.5 rounded">
                            <span className="text-slate-500 text-[9px] font-bold uppercase block mb-0.5">Assistant Count</span>
                            <span className="text-slate-250 font-medium">{assistantVal}</span>
                          </div>
                        </div>
                      </div>

                      {/* Coverage details */}
                      <div className="bg-slate-950/20 border border-slate-850 p-3.5 rounded-xl space-y-2.5">
                        <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase block border-b border-slate-850 pb-1.5 flex items-center gap-1.5">
                          📸 Coverage Details
                        </span>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                            <span className="text-slate-450 font-medium">Event Coverage Hours</span>
                            <span className="text-slate-200 font-bold">{hoursVal}</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                            <span className="text-slate-450 font-medium">Number of Events Covered</span>
                            <span className="text-slate-200 font-bold">{eventsVal}</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                            <span className="text-slate-450 font-medium">Outdoor/Indoor Coverage</span>
                            <span className="text-slate-200 font-bold">{typeVal}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Offers & Perks */}
                  <div className="bg-indigo-950/15 border border-indigo-900/40 p-3.5 rounded-xl space-y-2 text-xs">
                    <span className="text-[10px] font-bold text-indigo-400 font-mono tracking-wider uppercase block border-b border-indigo-950 pb-1">
                      🎁 Package Offers & complimentary Items
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                      <div>
                        <span className="text-slate-500 text-[9px] font-bold uppercase block">Seasonal Offer</span>
                        <span className="text-indigo-300 font-semibold">{seasonalVal}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[9px] font-bold uppercase block">Complimentary Items</span>
                        <span className="text-amber-400 font-semibold">{complimentaryVal}</span>
                      </div>
                    </div>
                  </div>

                  {/* Terms & Conditions */}
                  <div className="bg-slate-950/30 border border-slate-850 rounded-xl p-3.5 space-y-1.5 text-xs">
                    <span className="text-slate-505 block font-bold text-[9px] uppercase font-mono tracking-wider">
                      📑 Contractual Terms & conditions
                    </span>
                    <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-850 max-h-24 overflow-y-auto leading-relaxed text-slate-350">
                      {viewingPkgDetails.terms_conditions || (
                        <p className="italic text-slate-500 font-sans">
                          Standard photo studio service guidelines apply: 50% advance for confirmation, 35% on event day, and 15% during delivery. Extra coverage hours chargeable.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Modal Footer Controls */}
                  <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-slate-800">
                    {canEdit && activeTab === 'packages' && (
                      <button
                        type="button"
                        onClick={() => {
                          const pkg = viewingPkgDetails;
                          setEditingPackage(pkg);
                          setPkgForm({
                            package_name: pkg.package_name,
                            category: pkg.category,
                            price: pkg.price,
                            status: pkg.status,
                            deliverables: pkg.deliverables || '',
                            team_members: pkg.team_members || '',
                            seasonal_offer: pkg.seasonal_offer || '',
                            terms_conditions: pkg.terms_conditions || '',
                            event_type: pkg.event_type || '',
                            duration: pkg.duration || '',
                            package_includes: pkg.package_includes || ''
                          });
                          const parsed = parseTeamMembers(pkg.team_members);
                          setPkgTeamMembers(parsed.length > 0 ? parsed.map(s => { const r = parseQtyAndText(s); return { qty: r.qty, name: r.text }; }) : [{ qty: 1, name: '' }]);
                          const parsedDel = parseTeamMembers(pkg.deliverables);
                          setPkgDeliverablesList(parsedDel.length > 0 ? parsedDel.map(s => { const r = parseQtyAndText(s); return { qty: r.qty, name: r.text }; }) : []);
                          setIsAddFormOpen(false);
                          setViewingPkgDetails(null);
                        }}
                        className="px-4 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold rounded-lg border border-slate-700 cursor-pointer transition-all text-xs"
                      >
                        Edit Details
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setViewingPkgDetails(null)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer transition-all shadow-md text-xs"
                    >
                      Close Specs
                    </button>
                  </div>
                </>
              );
            })()}

          </div>
        </div>,
        document.body
      )}


      {/* Delete Package Confirmation / Safety Check Modal */}

      {deletingPackageId && (() => {
        const pkg = packages.find(p => p.package_id === deletingPackageId);
        if (!pkg) return null;

        const isUsed = (() => {
          const pkgId = deletingPackageId;
          const nameLower = (pkg.package_name || '').trim().toLowerCase();

          // 1. Check Leads
          const usedInLeads = (leads || []).some(lead => {
            const option = (lead.Select_Package_Option || '').trim().toLowerCase();
            return option === pkgId.toLowerCase() || option === nameLower;
          });

          // Also check LeadPackages
          const usedInLeadPackages = (leadPackages || []).some(lp => {
            return lp.package_id === pkgId || (lp.package_name || '').trim().toLowerCase() === nameLower;
          });

          // 2. Check Quotations
          const usedInQuotations = (quotations || []).some(quote => {
            return (
              quote.package_id === pkgId ||
              quote.selected_package_id === pkgId ||
              quote.Select_Package_Option === pkgId ||
              (quote.package_name || '').trim().toLowerCase() === nameLower
            );
          });

          // 3. Check Orders
          const usedInOrders = (orders || []).some(order => {
            return (order.package_name || '').trim().toLowerCase() === nameLower;
          });

          return usedInLeads || usedInLeadPackages || usedInQuotations || usedInOrders;
        })();

        return createPortal(
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[20001] flex items-center justify-center p-4 overflow-y-auto animate-fade-in text-left text-xs bg-black/60">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl relative text-slate-300">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🗑️</span>
                  <div>
                    <h3 className="text-base font-bold text-white">Delete Package</h3>
                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5">Package ID: {pkg.package_id}</p>
                  </div>
                </div>
                {!isDeletingPackage && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeletePackageError(null);
                      setDeletingPackageId(null);
                    }}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {deletePackageError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2">
                  <span className="text-sm">⚠️</span>
                  <div className="space-y-1">
                    <p className="font-bold">Deletion Failed</p>
                    <p>{deletePackageError}</p>
                  </div>
                </div>
              )}

              {isUsed ? (
                <div className="space-y-4">
                  <p className="text-slate-300 text-xs leading-relaxed font-sans">
                    This package is already referenced in existing records (leads, quotes, or orders). You can deactivate it instead to preserve historic references.
                  </p>
                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/60">
                    <button
                      type="button"
                      disabled={isDeletingPackage}
                      onClick={() => {
                        setDeletePackageError(null);
                        setDeletingPackageId(null);
                      }}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg cursor-pointer transition-all text-xs border border-transparent"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingPackage}
                      onClick={async () => {
                        const selectedPackageId = pkg.package_id;
                        if (!selectedPackageId || typeof selectedPackageId !== 'string' || !selectedPackageId.trim()) {
                          setDeletePackageError('Invalid package ID. Cannot proceed with deletion.');
                          return;
                        }
                        try {
                          setIsDeletingPackage(true);
                          setDeletePackageError(null);
                          await deletePackage(selectedPackageId.trim());
                          setDeletingPackageId(null);
                          setPackageSuccessMsg('Package deleted successfully.');
                          setTimeout(() => setPackageSuccessMsg(null), 5000);
                        } catch (err: any) {
                          setDeletePackageError(err.message || String(err));
                        } finally {
                          setIsDeletingPackage(false);
                        }
                      }}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg cursor-pointer transition-all text-xs shadow-md disabled:opacity-50"
                    >
                      {isDeletingPackage ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-200 text-xs leading-relaxed font-sans">
                    Are you sure you want to delete this package?
                  </p>
                  
                  {isDeletingPackage && (
                    <div className="text-indigo-400 font-mono text-[10px] animate-pulse flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting package from database...</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/60">
                    <button
                      type="button"
                      disabled={isDeletingPackage}
                      onClick={() => {
                        setDeletePackageError(null);
                        setDeletingPackageId(null);
                      }}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg cursor-pointer transition-all text-xs border border-slate-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingPackage}
                      onClick={async () => {
                        const selectedPackageId = pkg.package_id;
                        if (!selectedPackageId || typeof selectedPackageId !== 'string' || !selectedPackageId.trim()) {
                          setDeletePackageError('Invalid package ID. Cannot proceed with deletion.');
                          return;
                        }
                        try {
                          setIsDeletingPackage(true);
                          setDeletePackageError(null);
                          await deletePackage(selectedPackageId.trim());
                          setDeletingPackageId(null);
                          setPackageSuccessMsg('Package deleted successfully.');
                          setTimeout(() => setPackageSuccessMsg(null), 5000);
                        } catch (err: any) {
                          setDeletePackageError(err.message || String(err));
                        } finally {
                          setIsDeletingPackage(false);
                        }
                      }}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg cursor-pointer transition-all text-xs shadow-md disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isDeletingPackage ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <span>Delete</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* 2. Side-by-Side Comparison Modal */}
      {isComparingPkgs && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[20000] flex items-center justify-center p-4 overflow-y-auto animate-fade-in text-left text-xs bg-black/60">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl p-6 space-y-5 shadow-2xl relative text-slate-300">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <span className="font-mono text-[10px] text-zinc-500 font-bold uppercase block mb-0.5">Dynamic comparison checklist</span>
                <h4 className="text-sm font-extrabold text-slate-100 font-sans tracking-tight">
                  ⚖️ Side-by-Side Specifications Comparison ({selectedPkgIds.length} packages selected)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsComparingPkgs(false)}
                className="text-slate-450 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Comparison Grid Table */}
            <div className="overflow-x-auto border border-slate-800/85 rounded-xl bg-slate-950/40">
              <table className="w-full min-w-max border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0F172A]">
                    <th className="p-3 text-left font-bold text-slate-400 font-mono text-[10px] uppercase w-48 border-r border-slate-800/60">Specification Parameter</th>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      if (!pkg) return null;
                      return (
                        <th key={id} className="p-3 text-left font-bold text-slate-100 border-r border-slate-850/60 last:border-r-0">
                          <div className="space-y-1">
                            <span className="text-[9px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded font-mono uppercase font-black border border-emerald-900/30">
                              {normalizeCategory(pkg.category)}
                            </span>
                            <h5 className="font-bold text-slate-100 mt-1 leading-tight">{pkg.package_name}</h5>
                            <span className="block font-mono text-emerald-400 font-extrabold text-[12px] pt-1">
                              ₹{pkg.price ? pkg.price.toLocaleString('en-IN') : 'N/A'}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Category Row */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">🏷️ Category</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans font-medium text-slate-200">
                          {pkg ? normalizeCategory(pkg.category) : 'General'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Pricing Row */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">💰 Price Rate</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-mono text-emerald-400 font-extrabold">
                          ₹{pkg?.price ? pkg.price.toLocaleString('en-IN') : 'N/A'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Deliverables */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">📦 Core Deliverables</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans leading-relaxed text-slate-300">
                          <div className="max-h-24 overflow-y-auto pr-1 whitespace-pre-line text-xs font-sans">
                            {pkg?.deliverables || <span className="italic text-slate-500">Not configured</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Team Members */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">👥 Crew Required</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans text-slate-300">
                          {pkg?.team_members || <span className="italic text-slate-500">Standard team allocation</span>}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Seasonal Offers */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">🎁 Seasonal offers</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans text-amber-400">
                          {pkg?.seasonal_offer && pkg.seasonal_offer !== 'None' ? pkg.seasonal_offer : <span className="italic text-slate-505">None active</span>}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Event Duration */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">⏱️ Duration Limit</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans text-slate-300">
                          {pkg?.category === 'Pre-Wedding' || pkg?.category === 'Outdoor' || pkg?.package_name?.toLowerCase().includes('shoot')
                            ? '3 to 5 Hours' 
                            : 'Full Day (8-10 Hours)'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Scope Condition */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">📷 Shoot Scope</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans text-slate-300">
                          {pkg?.category?.includes('Video') || pkg?.package_name?.toLowerCase().includes('video') || pkg?.package_name?.toLowerCase().includes('reel')
                            ? 'Cinematic Video' 
                            : 'Standard Multi-Crew (Photo/Video)'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Terms & Conditions */}
                  <tr className="hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">📑 Terms & Conditions</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans leading-relaxed text-slate-305">
                          <div className="max-h-24 overflow-y-auto bg-slate-950/20 p-2 rounded border border-slate-900/65 text-slate-300 whitespace-pre-line text-[11px]">
                            {pkg?.terms_conditions || <span className="italic text-slate-500 font-sans">Standard contract rules apply</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Comparison Total Summary */}
            <div className="bg-[#0f172a] border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-left font-sans">
                <span className="text-slate-400 text-xs block font-mono font-bold">COMPARISON CUMULATIVE SUM</span>
                <span className="text-slate-200 text-[11px] leading-relaxed">Both packages are computed dynamically. Total discount is managed directly in the main lead profile session editor.</span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-slate-505 font-mono text-xs block">Combined Proposal Value:</span>
                <span className="font-mono text-emerald-400 font-black text-xl">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsComparingPkgs(false)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer border border-transparent text-xs"
              >
                Close Comparison
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
};
