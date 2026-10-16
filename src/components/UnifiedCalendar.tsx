import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRole } from './RoleContext';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  MapPin, 
  Phone, 
  User, 
  X, 
  Search, 
  Filter, 
  Briefcase, 
  CheckCircle2, 
  Camera, 
  Video, 
  ExternalLink,
  Sparkles,
  Layers,
  UserPlus
} from 'lucide-react';
import { formatINR, formatTime12Hour, formatDateDDMMYY, deserializeLeadEvents, parseDeliverablesWithQty, formatQtyItem, formatIndianPhoneNumber } from '../utils';
import { EventLocationCell, cleanLocationString } from './EventLocationCell';

interface UnifiedCalendarProps {
  role: 'sales' | 'operations' | 'production' | 'production_staff' | 'owner' | 'worker';
  staffMemberId?: string;
  staffMemberName?: string;
  onSelectLead?: (lead: any) => void;
  onOpenAssignEditor?: (targetOrderId: string, targetLeadId?: string) => void;
  onOpenAssignStaff?: (targetOrderId: string, targetLeadId?: string, targetEventId?: string) => void;
}

interface CalendarEventItem {
  id: string;
  orderId: string;
  leadId?: string;
  eventId?: string;
  customerName: string;
  customerMobile?: string;
  eventName: string;
  eventType: string;
  eventDate: string;
  eventTime?: string;
  reportingDate?: string;
  reportingTime?: string;
  location?: string;
  assignedRole?: string;
  assignedStaff?: string;
  assignedCrew?: {
    photographer?: string;
    videographer?: string;
    drone?: string;
    assistant?: string;
  };
  salesCrew?: string;
  editorAssigned?: string;
  editorsList?: string[];
  deliverables?: string | string[];
  deliverablesList?: string[];
  equipmentKit?: string;
  equipmentItems?: string[];
  targetDeliveryDate?: string;
  rawFootageLink?: string;
  budget?: number;
  salesPerson?: string;
  status: string;
  desk?: string;
  sourceRecord?: any;
}

const resolveSalesCrewName = (ord?: any, lead?: any, ev?: any, quotationsList: any[] = []): string => {
  // 1. Check event-specific sales staff if present on event object
  if (ev) {
    const evSales = ev.sales_staff_name || ev.sales_person || ev.salesPerson || (ev as any).Sales_Staff_Name;
    if (evSales && typeof evSales === 'string' && evSales.trim() && !['unassigned', 'none', 'n/a', 'null', 'undefined', '—', '-'].includes(evSales.trim().toLowerCase())) {
      return evSales.trim();
    }
  }

  // 2. Direct sales_staff_name or sales_person on lead or order
  const directName = 
    lead?.sales_staff_name ||
    ord?.sales_staff_name ||
    (lead as any)?.Sales_Staff_Name ||
    (ord as any)?.Sales_Staff_Name ||
    lead?.sales_person ||
    ord?.sales_person ||
    (lead as any)?.Sales_Person_Name;

  if (directName && typeof directName === 'string' && directName.trim() && !['unassigned', 'none', 'n/a', 'null', 'undefined', '—', '-'].includes(directName.trim().toLowerCase())) {
    return directName.trim();
  }

  // 3. Match from quotations
  const targetQuote = (quotationsList || []).find((q: any) => 
    (lead?.lead_id && q.lead_id === lead.lead_id) || 
    (ord?.lead_id && q.lead_id === ord.lead_id) ||
    (ord?.order_id && (q.order_id === ord.order_id || q.lead_id === ord.order_id))
  );

  if (targetQuote) {
    const qSales = targetQuote.sales_staff_name || targetQuote.sales_person || (targetQuote as any).Sales_Staff_Name || targetQuote.created_by;
    if (qSales && typeof qSales === 'string' && qSales.trim() && !['unassigned', 'none', 'n/a', 'null', 'undefined', '—', '-', 'system', 'admin'].includes(qSales.trim().toLowerCase())) {
      return qSales.trim();
    }
  }

  // 4. Fallback to created_by if it represents the user who created it
  const createdBy = lead?.created_by || ord?.created_by;
  if (createdBy && typeof createdBy === 'string' && createdBy.trim() && !['unassigned', 'none', 'n/a', 'null', 'undefined', '—', '-', 'system', 'admin'].includes(createdBy.trim().toLowerCase())) {
    return createdBy.trim();
  }

  return 'Sales Team';
};

const resolveAssignedRoles = (eventSa: any[] = [], matchedOp?: any): string => {
  const roles: string[] = [];
  (eventSa || []).forEach(sa => {
    if (sa.assignment_status === 'Cancelled' || sa.assignment_status === 'Rejected') return;
    const r = (sa.staff_role || sa.role || '').trim();
    if (r && !roles.includes(r)) roles.push(r);
  });
  if (roles.length === 0 && matchedOp) {
    if (matchedOp.photographer_assigned) roles.push('Photographer');
    if (matchedOp.videographer_assigned) roles.push('Videographer');
    if (matchedOp.drone_operator_assigned) roles.push('Drone Operator');
    if (matchedOp.assistant_assigned) roles.push('Assistant');
  }
  return roles.length > 0 ? roles.join(', ') : 'Not assigned';
};

const parseEquipmentNames = (raw: any): string[] => {
  if (!raw) return [];
  const list: string[] = [];

  const addName = (val: any) => {
    if (!val) return;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return;
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try {
          const parsed = JSON.parse(trimmed);
          const sub = parseEquipmentNames(parsed);
          sub.forEach(s => { if (!list.includes(s)) list.push(s); });
          return;
        } catch (_) {}
      }
      if (trimmed.includes(',')) {
        trimmed.split(',').forEach(part => {
          const c = part.trim();
          if (c && !isInvalidEquipment(c)) {
            if (!list.includes(c)) list.push(c);
          }
        });
        return;
      }
      if (!isInvalidEquipment(trimmed)) {
        if (!list.includes(trimmed)) list.push(trimmed);
      }
    } else if (typeof val === 'object') {
      if (Array.isArray(val)) {
        val.forEach(item => {
          const sub = parseEquipmentNames(item);
          sub.forEach(s => { if (!list.includes(s)) list.push(s); });
        });
      } else {
        const nameVal = val.name || val.equipment_name || val.title || val.item || val.label || val.equipment;
        if (nameVal && typeof nameVal !== 'object') {
          const sub = parseEquipmentNames(nameVal);
          sub.forEach(s => { if (!list.includes(s)) list.push(s); });
        } else {
          Object.entries(val).forEach(([k, v]) => {
            const lk = k.toLowerCase();
            if (['equipment', 'assigned_equipment', 'equipment_name', 'item', 'name'].includes(lk)) {
              const sub = parseEquipmentNames(v);
              sub.forEach(s => { if (!list.includes(s)) list.push(s); });
            }
          });
        }
      }
    }
  };

  addName(raw);
  return list;
};

const isInvalidEquipment = (str: string): boolean => {
  const low = str.toLowerCase();
  if (['none', 'not assigned', 'null', 'undefined', '—', '-', 'unassigned', 'true', 'false'].includes(low)) return true;
  if (low.startsWith('ev_') || low.startsWith('ord_') || low.startsWith('lead_') || low.length > 50) return true;
  return false;
};

const resolveEquipmentList = (eventSa: any[] = [], ev?: any, matchedOp?: any): string[] => {
  const set = new Set<string>();

  (eventSa || []).forEach(sa => {
    if (sa.assignment_status === 'Cancelled' || sa.assignment_status === 'Rejected') return;
    parseEquipmentNames(sa.equipment).forEach(e => set.add(e));
    parseEquipmentNames(sa.assigned_equipment).forEach(e => set.add(e));
    parseEquipmentNames(sa.equipment_details).forEach(e => set.add(e));
    parseEquipmentNames(sa.equipment_items).forEach(e => set.add(e));
  });

  if (ev) {
    parseEquipmentNames(ev.assigned_equipment).forEach(e => set.add(e));
    parseEquipmentNames(ev.equipment).forEach(e => set.add(e));
    parseEquipmentNames(ev.equipment_details).forEach(e => set.add(e));
    parseEquipmentNames(ev.equipment_kit).forEach(e => set.add(e));
  }

  if (matchedOp) {
    parseEquipmentNames(matchedOp.equipment_kit).forEach(e => set.add(e));
    parseEquipmentNames(matchedOp.assigned_equipment).forEach(e => set.add(e));
    parseEquipmentNames(matchedOp.equipment_details).forEach(e => set.add(e));
  }

  return Array.from(set);
};

const FloatingPopoverCell: React.FC<{
  items: string[];
  title: string;
  badgeBg: string;
  badgeText: string;
  buttonColorClass: string;
}> = ({ items, title, badgeBg, badgeText, buttonColorClass }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const normalizedItems = useMemo(() => {
    const list: string[] = [];
    (items || []).forEach(item => {
      if (!item) return;
      String(item).split(",").forEach(part => {
        const clean = part.trim();
        if (
          clean && 
          clean !== "Unassigned" && 
          clean !== "—" && 
          clean !== "Deliverables Pending" && 
          clean !== "Deliverables" &&
          !list.includes(clean)
        ) {
          list.push(clean);
        }
      });
    });
    return list;
  }, [items]);

  const updateCoords = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const popoverWidth = 240;
      const popoverHeight = 180;

      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 12) {
        left = Math.max(8, window.innerWidth - popoverWidth - 12);
      }

      let top = rect.bottom + 4;
      if (top + popoverHeight > window.innerHeight - 12) {
        top = Math.max(8, rect.top - popoverHeight - 4);
      }

      setCoords({ top, left });
    }
  }, []);

  const handleToggle = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen) {
      updateCoords();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updateCoords();
    };

    const handleOutsidePointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target;
      if (!target || !(target instanceof Node)) return;
      if (buttonRef.current && buttonRef.current.contains(target)) {
        return;
      }
      if (popoverRef.current && popoverRef.current.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleOutsidePointer, true);
      document.addEventListener("touchstart", handleOutsidePointer, true);
      document.addEventListener("click", handleOutsidePointer, true);
    }, 10);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      document.removeEventListener("mousedown", handleOutsidePointer, true);
      document.removeEventListener("touchstart", handleOutsidePointer, true);
      document.removeEventListener("click", handleOutsidePointer, true);
    };
  }, [isOpen, updateCoords]);

  if (!normalizedItems || normalizedItems.length === 0) {
    return <span className="text-zinc-500 italic text-xs">—</span>;
  }

  if (normalizedItems.length === 1) {
    return (
      <span className="text-zinc-200 font-medium text-xs font-mono truncate max-w-[150px] inline-block" title={normalizedItems[0]}>
        {normalizedItems[0]}
      </span>
    );
  }

  return (
    <div className="inline-block relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${buttonColorClass} font-bold rounded-lg text-xs font-mono transition cursor-pointer border border-zinc-700 shadow-sm hover:scale-[1.02] active:scale-[0.98] select-none`}
        title={`Click to view all ${normalizedItems.length} ${title}`}
      >
        <span className="truncate max-w-[100px]">{normalizedItems[0]}</span>
        <span className={`text-[10px] ${badgeBg} ${badgeText} px-1.5 py-0.5 rounded-md font-bold shrink-0`}>
          +{normalizedItems.length - 1}
        </span>
        <span className="text-zinc-400 text-[10px]">▾</span>
      </button>

      {isOpen && createPortal(
        <div 
          ref={popoverRef}
          style={{ top: coords.top, left: coords.left }}
          className="fixed z-[100000] w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-2.5 space-y-1.5 text-xs animate-in fade-in zoom-in-95 duration-100 select-text"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 px-1 pb-1 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-amber-400 font-extrabold">{title} ({normalizedItems.length})</span>
            <button 
              type="button" 
              onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
              className="text-zinc-500 hover:text-zinc-200 text-xs px-1"
            >
              ✕
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1 pt-1 pr-0.5">
            {normalizedItems.map((item, idx) => (
              <div key={idx} className="px-2.5 py-1.5 bg-zinc-950/90 rounded-lg text-zinc-200 font-mono text-xs font-medium border border-zinc-800/80 flex items-center justify-between gap-2 hover:border-zinc-700">
                <span className="text-zinc-400 text-[10px] font-bold font-mono">#{idx + 1}</span>
                <span className="truncate flex-1 text-right">{item}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const EquipmentCell: React.FC<{ items: string[] }> = ({ items }) => (
  <FloatingPopoverCell
    items={items}
    title="Equipment"
    badgeBg="bg-amber-500/20"
    badgeText="text-amber-400"
    buttonColorClass="bg-zinc-800 hover:bg-zinc-700 text-amber-300"
  />
);

const DeliverablesCell: React.FC<{ items: string[] }> = ({ items }) => (
  <FloatingPopoverCell
    items={items}
    title="Deliverables"
    badgeBg="bg-indigo-500/20"
    badgeText="text-indigo-400"
    buttonColorClass="bg-zinc-800 hover:bg-zinc-700 text-indigo-300"
  />
);

const EditorCell: React.FC<{ editors: string[] }> = ({ editors }) => (
  <FloatingPopoverCell
    items={editors}
    title="Assigned Editors"
    badgeBg="bg-purple-500/20"
    badgeText="text-purple-400"
    buttonColorClass="bg-zinc-800 hover:bg-zinc-700 text-purple-300"
  />
);

const extractDeliverablesList = (
  orderItem: any, 
  prodItem: any, 
  matchedLead?: any, 
  quotationsList: any[] = [],
  leadPackagesList: any[] = []
): string[] => {
  const resultNames: string[] = [];

  const addFromSource = (source: any) => {
    if (!source) return;
    const parsed = parseDeliverablesWithQty(source);
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      parsed.forEach(item => {
        if (!item || !item.name) return;
        const nameStr = String(item.name).trim();
        if (!nameStr) return;

        const low = nameStr.toLowerCase();
        if (
          low === "deliverables pending" ||
          low === "standard package" ||
          low === "custom package" ||
          low === "n/a" ||
          low === "none" ||
          low === "null" ||
          low === "undefined" ||
          low.startsWith("{") ||
          low.startsWith("[") ||
          low.startsWith("price") ||
          low.startsWith("total") ||
          low.startsWith("rs.") ||
          low.startsWith("inr") ||
          low.startsWith("amount")
        ) {
          return;
        }

        if (orderItem?.package_name && low === orderItem.package_name.toLowerCase()) return;
        if (matchedLead?.package_name && low === matchedLead.package_name.toLowerCase()) return;

        const displayName = formatQtyItem ? formatQtyItem(item) : (item.qty > 1 ? `${nameStr} (${item.qty})` : nameStr);
        if (!resultNames.includes(displayName)) {
          resultNames.push(displayName);
        }
      });
    }
  };

  const leadId = matchedLead?.lead_id || orderItem?.lead_id || orderItem?.order_id;
  const targetLeadPkgs = (leadPackagesList || []).filter((lp: any) => 
    (leadId && lp.lead_id === leadId) || (orderItem?.order_id && lp.order_id === orderItem.order_id)
  );

  // Priority 1: Step 3 Lead Packages
  targetLeadPkgs.forEach((lp: any) => {
    if (lp.editable_deliverables) addFromSource(lp.editable_deliverables);
    if (lp.deliverables_descriptionn) addFromSource(lp.deliverables_descriptionn);
    if (lp.deliverables_description) addFromSource(lp.deliverables_description);
    if (lp.deliverables) addFromSource(lp.deliverables);
  });

  // Priority 2: Order Item
  if (orderItem) {
    if (orderItem.deliverables_descriptionn) addFromSource(orderItem.deliverables_descriptionn);
    if (orderItem.editable_deliverables) addFromSource(orderItem.editable_deliverables);
    if (orderItem.deliverables_description) addFromSource(orderItem.deliverables_description);
    if (orderItem.deliverables) addFromSource(orderItem.deliverables);
    if (orderItem.Add_Deliverable) addFromSource(orderItem.Add_Deliverable);
    if (orderItem.package_details) addFromSource(orderItem.package_details);
  }

  // Priority 3: Matched Lead
  if (matchedLead) {
    if (matchedLead.deliverables_descriptionn) addFromSource(matchedLead.deliverables_descriptionn);
    if (matchedLead.editable_deliverables) addFromSource(matchedLead.editable_deliverables);
    if (matchedLead.deliverables_description) addFromSource(matchedLead.deliverables_description);
    if (matchedLead.deliverables) addFromSource(matchedLead.deliverables);
    if (matchedLead.Add_Deliverable) addFromSource(matchedLead.Add_Deliverable);
    if (matchedLead.package_details) addFromSource(matchedLead.package_details);
  }

  // Priority 4: Quotations
  const matchedQuote = (quotationsList || []).find((q: any) => 
    (matchedLead?.lead_id && q.lead_id === matchedLead.lead_id) || 
    (orderItem?.lead_id && q.lead_id === orderItem.lead_id) ||
    (orderItem?.order_id && (q.order_id === orderItem.order_id || q.lead_id === orderItem.order_id))
  );

  if (matchedQuote) {
    if (matchedQuote.deliverables_descriptionn) addFromSource(matchedQuote.deliverables_descriptionn);
    if (matchedQuote.editable_deliverables) addFromSource(matchedQuote.editable_deliverables);
    if (matchedQuote.deliverables_description) addFromSource(matchedQuote.deliverables_description);
    if (matchedQuote.deliverables) addFromSource(matchedQuote.deliverables);
    if (matchedQuote.package_details) addFromSource(matchedQuote.package_details);
  }

  // Priority 5: Production Item
  if (prodItem) {
    if (prodItem.deliverables_summary) addFromSource(prodItem.deliverables_summary);
    if (prodItem.assigned_deliverables) addFromSource(prodItem.assigned_deliverables);
    if (prodItem.deliverables) addFromSource(prodItem.deliverables);
  }

  const rawEvts = matchedLead?.events || orderItem?.events || [];
  if (Array.isArray(rawEvts)) {
    rawEvts.forEach(ev => {
      if (ev?.deliverables) addFromSource(ev.deliverables);
      if (ev?.deliverables_list) addFromSource(ev.deliverables_list);
      if (ev?.deliverable_name) addFromSource(ev.deliverable_name);
    });
  }

  return resultNames;
};

const normalizeDateStr = (dateVal?: string | null | Date): string => {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return '';
    return `${dateVal.getFullYear()}-${String(dateVal.getMonth() + 1).padStart(2, '0')}-${String(dateVal.getDate()).padStart(2, '0')}`;
  }
  const s = String(dateVal).trim();
  if (!s) return '';
  if (s.includes('T')) return s.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  return s;
};

export const UnifiedCalendar: React.FC<UnifiedCalendarProps> = ({ 
  role, 
  staffMemberId, 
  staffMemberName, 
  onSelectLead, 
  onOpenAssignEditor,
  onOpenAssignStaff
}) => {
  const { 
    currentUser, 
    currentUserName,
    leads = [], 
    orders = [], 
    operations = [], 
    production = [], 
    staffAssignments = [], 
    editorAssignments = [], 
    rawFootage = [],
    quotations = [],
    leadPackages = []
  } = useRole();

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [calendarModalDate, setCalendarModalDate] = useState<string | null>(null);
  const [calendarModalEvents, setCalendarModalEvents] = useState<CalendarEventItem[]>([]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentMonth(new Date());
  };

  // Compile calendar events according to the active role
  const allEvents = useMemo<CalendarEventItem[]>(() => {
    const items: CalendarEventItem[] = [];

    // Helper to safely extract deliverables list
    const extractDeliverablesString = (orderItem: any, prodItem: any): string => {
      if (prodItem?.deliverables_summary) return prodItem.deliverables_summary;
      if (prodItem?.assigned_deliverables) {
        if (Array.isArray(prodItem.assigned_deliverables)) return prodItem.assigned_deliverables.join(', ');
        return String(prodItem.assigned_deliverables);
      }
      if (orderItem?.package_details) {
        try {
          const pkg = typeof orderItem.package_details === 'string' ? JSON.parse(orderItem.package_details) : orderItem.package_details;
          if (pkg?.deliverables) {
            if (Array.isArray(pkg.deliverables)) return pkg.deliverables.map((d: any) => d.name || d.deliverable_name || d).join(', ');
            return String(pkg.deliverables);
          }
        } catch (_) {}
      }
      return orderItem?.package_name || 'Deliverables Pending';
    };

    // 1. PRODUCTION & PRODUCTION STAFF CALENDARS
    if (role === 'production_staff') {
      const targetStaffName = (staffMemberName || currentUserName || currentUser?.name || '').trim().toLowerCase();
      const targetStaffId = staffMemberId || currentUser?.id;

      const myAssignments = (editorAssignments || []).filter(ea => {
        if (ea.assignment_status === 'Cancelled' || ea.assignment_status === 'Rejected') return false;
        const matchId = targetStaffId && ea.staff_id && ea.staff_id === targetStaffId;
        const matchName = targetStaffName && ea.staff_name && ea.staff_name.trim().toLowerCase() === targetStaffName;
        return matchId || matchName;
      });

      myAssignments.forEach(ea => {
        const status = ea.status || 'Assigned Editor';
        const excludedStatuses = ['Editing Completed', 'Editing Complete', 'Client Acceptance', 'Client Accepted', 'Business Owner Review', 'Project Completed', 'Completed', 'Order Closed', 'Closed'];
        if (excludedStatuses.includes(status)) return;

        const prod = (production || []).find(p => 
          p.production_id === ea.production_id || 
          p.tracking_id === ea.production_id || 
          p.order_id === ea.production_id || 
          p.order_id === ea.order_id
        );

        const ordId = ea.order_id || prod?.order_id || prod?.tracking_id;
        const ord = (orders || []).find(o => o.order_id === ordId);
        const matchedLead = (leads || []).find(l => l.lead_id === ord?.lead_id || l.lead_id === ea.production_id || l.lead_id === ea.order_id);

        const explicitTargetDate = ea.target_finish_date || ea.target_delivery_date || prod?.target_delivery_date || ord?.target_delivery_date || ord?.event_date || matchedLead?.event_date || '';
        const normDate = normalizeDateStr(explicitTargetDate);
        if (!normDate) return;

        const editors = [ea.staff_name].filter(Boolean);
        const salesStaffName = resolveSalesCrewName(ord, matchedLead, undefined, quotations);
        const delivList = extractDeliverablesList(ord, prod, matchedLead, quotations, leadPackages);
        const delivs = delivList.length > 0 ? delivList.join(', ') : 'Deliverables';

        const rawLink = ea.edited_drive_link || ea.Edited_Drive_Link || prod?.raw_footage_location || ord?.raw_footage_link || '';

        items.push({
          id: `PROD-ASSIGN-${ea.assignment_id || ordId}`,
          orderId: ordId || '—',
          leadId: ord?.lead_id || matchedLead?.lead_id,
          eventId: ea.event_id,
          customerName: ord?.customer_name || matchedLead?.customer_name || prod?.customer_name || 'Client',
          customerMobile: ord?.customer_phone || ord?.mobile || matchedLead?.mobile || prod?.customer_mobile || '',
          eventName: ord?.custom_event_name || ord?.event_type || matchedLead?.event_type || 'Production Task',
          eventType: ord?.event_type || matchedLead?.event_type || 'Video Editing',
          eventDate: normDate,
          targetDeliveryDate: normalizeDateStr(explicitTargetDate),
          editorAssigned: ea.staff_name || 'Assigned Editor',
          editorsList: editors,
          salesCrew: salesStaffName,
          deliverables: delivs,
          deliverablesList: delivList,
          rawFootageLink: rawLink,
          status: status,
          desk: 'Production',
          sourceRecord: { order: ord, prod, assignment: ea, lead: matchedLead }
        });
      });
    } else if (role === 'production') {
      // Group by order/production
      const prodKeys = new Set<string>();

      // A. Process from orders in Production stages or with production artifacts
      const validProdStages = [
        'verified footage', 'footage handover verified', 'raw footage received', 'raw footage uploaded',
        'assigned editor', 'editor assigned', 'assigned', 'editing started', 'editing in progress',
        'internal qc review', 'customer review', 'client review sent', 'revision required',
        'revision in progress', 'editing completed', 'final approval', 'client acceptance',
        'approved', 'project delivered', 'completed', 'order closed', 'closed'
      ];

      (orders || []).forEach(ord => {
        const stage = (ord.current_stage || '').trim().toLowerCase();
        const matchedProd = (production || []).find(p => p.order_id === ord.order_id || p.tracking_id === ord.order_id || p.lead_id === ord.lead_id);
        const matchedAssignments = (editorAssignments || []).filter(ea => 
          (ord.order_id && (ea.order_id === ord.order_id || ea.production_id === ord.order_id)) ||
          (ord.lead_id && (ea.lead_id === ord.lead_id || ea.order_id === ord.lead_id || ea.production_id === ord.lead_id)) ||
          (matchedProd && (ea.production_id === matchedProd.production_id || ea.order_id === matchedProd.production_id || ea.production_id === matchedProd.tracking_id))
        );
        const matchedRf = (rawFootage || []).find(rf => rf.order_id === ord.order_id || rf.tracking_id === ord.order_id || (ord.lead_id && rf.lead_id === ord.lead_id));

        const isProdCandidate = validProdStages.includes(stage) || !!matchedProd || matchedAssignments.length > 0 || !!matchedRf;
        if (!isProdCandidate) return;

        const matchedLead = (leads || []).find(l => l.lead_id === ord.lead_id || l.order_id === ord.order_id);
        
        // Resolve Target Delivery Date as primary date for Production Calendar
        const explicitTargetDate = matchedAssignments.find(a => a.target_finish_date || a.target_delivery_date)?.target_finish_date ||
                                   matchedAssignments.find(a => a.target_finish_date || a.target_delivery_date)?.target_delivery_date ||
                                   matchedProd?.target_delivery_date || 
                                   matchedProd?.expected_delivery_date || 
                                   (ord as any)?.target_delivery_date ||
                                   (ord as any)?.delivery_target_date ||
                                   (matchedLead as any)?.delivery_target_date || '';
        
        const fallbackDate = ord.event_date || matchedLead?.event_date || '';
        const primaryTargetDate = explicitTargetDate || fallbackDate;
        const normDate = normalizeDateStr(primaryTargetDate);
        if (!normDate) return;

        const editorsSet = new Set<string>();
        matchedAssignments.forEach(ea => {
          if (ea.staff_name && ea.staff_name.trim() && ea.assignment_status !== 'Cancelled' && ea.assignment_status !== 'Rejected') {
            editorsSet.add(ea.staff_name.trim());
          }
        });
        if (matchedProd?.editor_assigned) {
          matchedProd.editor_assigned.split(',').forEach((n: string) => {
            const clean = n.trim();
            if (clean && clean !== 'Unassigned' && clean !== '—') editorsSet.add(clean);
          });
        }
        if (matchedProd?.assigned_staff) {
          matchedProd.assigned_staff.split(',').forEach((n: string) => {
            const clean = n.trim();
            if (clean && clean !== 'Unassigned' && clean !== '—') editorsSet.add(clean);
          });
        }
        if ((ord as any).assigned_editor) {
          String((ord as any).assigned_editor).split(',').forEach((n: string) => {
            const clean = n.trim();
            if (clean && clean !== 'Unassigned' && clean !== '—') editorsSet.add(clean);
          });
        }
        const editorsList = Array.from(editorsSet);
        const assignedEditorName = editorsList.length > 0 ? editorsList.join(', ') : 'Unassigned';

        const salesStaffName = resolveSalesCrewName(ord, matchedLead, undefined, quotations);
        const delivList = extractDeliverablesList(ord, matchedProd, matchedLead, quotations, leadPackages);
        const delivs = delivList.length > 0 ? delivList.join(', ') : extractDeliverablesString(ord, matchedProd);

        const rawLink = matchedProd?.raw_footage_location || 
                        matchedRf?.server_path || 
                        ord.raw_footage_link || 
                        '';

        items.push({
          id: `PROD-${ord.order_id}`,
          orderId: ord.order_id,
          leadId: ord.lead_id,
          customerName: ord.customer_name || matchedLead?.customer_name || 'Client',
          customerMobile: ord.customer_phone || ord.mobile || matchedLead?.mobile || '',
          eventName: ord.custom_event_name || ord.event_type || matchedLead?.event_type || 'Production Project',
          eventType: ord.event_type || matchedLead?.event_type || 'Video Editing',
          eventDate: normDate, // Placed on Calendar strictly by Target Delivery Date
          targetDeliveryDate: normalizeDateStr(explicitTargetDate || fallbackDate),
          editorAssigned: assignedEditorName,
          editorsList: editorsList,
          salesCrew: salesStaffName,
          deliverables: delivs,
          deliverablesList: delivList,
          rawFootageLink: rawLink,
          status: matchedProd?.editing_status || ord.current_stage || 'Pending',
          desk: 'Production',
          sourceRecord: { order: ord, prod: matchedProd, assignments: matchedAssignments, lead: matchedLead }
        });

        prodKeys.add(ord.order_id);
      });

      // B. Process production records that might not have orders
      (production || []).forEach(p => {
        const ordId = p.order_id || p.tracking_id || p.production_id;
        if (ordId && prodKeys.has(ordId)) return;

        const matchedLead = (leads || []).find(l => l.lead_id === p.lead_id || (ordId && l.order_id === ordId));
        const matchedOrd = (orders || []).find(o => ordId && o.order_id === ordId);

        const dateVal = p.target_delivery_date || p.expected_delivery_date || p.event_date || p.created_at;
        const normDate = normalizeDateStr(dateVal);
        if (!normDate) return;

        const editorsList = p.editor_assigned ? p.editor_assigned.split(',').map((s: string) => s.trim()).filter(Boolean) : (p.assigned_staff ? [p.assigned_staff] : []);
        const assignedEditorName = editorsList.length > 0 ? editorsList.join(', ') : 'Unassigned';
        const salesStaffName = p.sales_staff_name || p.sales_person || resolveSalesCrewName(matchedOrd, matchedLead, undefined, quotations);

        items.push({
          id: p.production_id || `PRD-${p.tracking_id}`,
          orderId: p.order_id || p.tracking_id || '—',
          leadId: p.lead_id,
          customerName: p.customer_name || matchedLead?.customer_name || matchedOrd?.customer_name || 'Client',
          customerMobile: p.customer_mobile || '',
          eventName: p.custom_event_name || 'Production Item',
          eventType: p.event_type || matchedOrd?.event_type || matchedLead?.event_type || 'Editing',
          eventDate: normDate, // Placed on Calendar strictly by Target Delivery Date
          targetDeliveryDate: normalizeDateStr(dateVal),
          editorAssigned: assignedEditorName,
          editorsList: editorsList,
          salesCrew: salesStaffName,
          deliverables: p.deliverables_summary || 'Deliverables',
          deliverablesList: p.deliverables_summary ? [p.deliverables_summary] : ['Deliverables'],
          rawFootageLink: p.raw_footage_location || '',
          status: p.editing_status || 'Pending',
          desk: 'Production',
          sourceRecord: { prod: p }
        });
      });
    }

    // 2. OPERATIONS CALENDAR
    else if (role === 'operations') {
      (orders || []).forEach(ord => {
        const matchedOp = (operations || []).find(op => op.order_id === ord.order_id);
        const matchedLead = (leads || []).find(l => l.lead_id === ord.lead_id || l.order_id === ord.order_id);
        const matchedSa = (staffAssignments || []).filter(sa => sa.order_id === ord.order_id);

        let rawEvents: any[] = [];
        if (matchedLead?.events && Array.isArray(matchedLead.events) && matchedLead.events.length > 0) {
          rawEvents = matchedLead.events;
        } else if (matchedLead?.notes_special_customizations) {
          const parsed = deserializeLeadEvents(matchedLead.notes_special_customizations);
          if (parsed.events && parsed.events.length > 0) {
            rawEvents = parsed.events;
          }
        }
        if (rawEvents.length === 0) {
          if (ord.events && Array.isArray(ord.events) && ord.events.length > 0) {
            rawEvents = ord.events;
          } else if (ord.notes_special_customizations) {
            const parsed = deserializeLeadEvents(ord.notes_special_customizations);
            if (parsed.events && parsed.events.length > 0) {
              rawEvents = parsed.events;
            }
          }
        }

        if (rawEvents.length > 0) {
          rawEvents.forEach((ev: any, evIdx: number) => {
            const evId = String(ev.id || ev.event_id || `ev_${evIdx + 1}`);
            const eventDateStr = ev.event_date || ev.eventDate || ev.date || ord.event_date || matchedOp?.event_date || matchedLead?.event_date;
            const normDate = normalizeDateStr(eventDateStr);
            if (!normDate) return;

            // Resolve crew specifically for this event
            const eventSa = matchedSa.filter(s => {
              const sEvId = String(s.event_id || '');
              return !sEvId || sEvId === evId || sEvId === String(ev.id || '') || sEvId === String(ev.event_id || '') || matchedSa.length === 1;
            });

            const photographer = eventSa.find(s => (s.staff_role || '').toLowerCase().includes('photo'))?.staff_name ||
                                 (rawEvents.length === 1 ? matchedOp?.photographer_assigned : undefined) || 'Unassigned';
            const videographer = eventSa.find(s => (s.staff_role || '').toLowerCase().includes('video'))?.staff_name ||
                                 (rawEvents.length === 1 ? matchedOp?.videographer_assigned : undefined) || 'Unassigned';
            const drone = eventSa.find(s => (s.staff_role || '').toLowerCase().includes('drone'))?.staff_name ||
                          (rawEvents.length === 1 ? matchedOp?.drone_operator_assigned : undefined) || 'Unassigned';
            const assistant = eventSa.find(s => (s.staff_role || '').toLowerCase().includes('assist'))?.staff_name ||
                              (rawEvents.length === 1 ? matchedOp?.assistant_assigned : undefined) || 'Unassigned';

            const loc = ev.event_location || ev.venue_address || ev.venue || ev.location || ev.address || ord.address || matchedLead?.city || matchedLead?.address || 'Studio / On Site';
            const salesStaffName = resolveSalesCrewName(ord, matchedLead, ev, quotations);

            const assignedRoleStr = resolveAssignedRoles(eventSa, matchedOp);
            const eqList = resolveEquipmentList(eventSa, ev, matchedOp);

            items.push({
              id: `OPS-${ord.order_id}-${evId}`,
              orderId: ord.order_id,
              leadId: ord.lead_id,
              eventId: evId,
              customerName: ord.customer_name || matchedLead?.customer_name || 'Client',
              customerMobile: ord.customer_phone || ord.mobile || matchedLead?.mobile || '',
              eventName: ev.event_name || ev.event_type || ord.custom_event_name || ord.event_type || 'Event',
              eventType: ev.event_type || ord.event_type || 'Photography',
              eventDate: normDate,
              reportingDate: ev.reporting_date || matchedOp?.reporting_date || normDate,
              reportingTime: ev.event_start_time || ev.event_time || ev.reporting_time || matchedOp?.reporting_time || ord.event_time || '08:00 AM',
              location: loc,
              salesCrew: salesStaffName,
              salesPerson: salesStaffName,
              assignedRole: assignedRoleStr,
              assignedCrew: { photographer, videographer, drone, assistant },
              equipmentKit: eqList.join(', '),
              equipmentItems: eqList,
              status: matchedOp?.event_status || ord.current_stage || 'Assigned Crew',
              desk: 'Operations',
              sourceRecord: { order: ord, op: matchedOp, lead: matchedLead, staffAssignments: eventSa, event: ev }
            });
          });
        } else {
          const eventDateStr = ord.event_date || matchedOp?.event_date || matchedLead?.event_date;
          const normDate = normalizeDateStr(eventDateStr);
          if (!normDate) return;

          // Resolve assigned crew
          const photographer = matchedOp?.photographer_assigned || matchedSa.find(s => (s.staff_role || '').toLowerCase().includes('photo'))?.staff_name || 'Unassigned';
          const videographer = matchedOp?.videographer_assigned || matchedSa.find(s => (s.staff_role || '').toLowerCase().includes('video'))?.staff_name || 'Unassigned';
          const drone = matchedOp?.drone_operator_assigned || matchedSa.find(s => (s.staff_role || '').toLowerCase().includes('drone'))?.staff_name || 'Unassigned';
          const assistant = matchedOp?.assistant_assigned || matchedSa.find(s => (s.staff_role || '').toLowerCase().includes('assist'))?.staff_name || 'Unassigned';
          const salesStaffName = resolveSalesCrewName(ord, matchedLead, undefined, quotations);
          const assignedRoleStr = resolveAssignedRoles(matchedSa, matchedOp);
          const eqList = resolveEquipmentList(matchedSa, undefined, matchedOp);

          items.push({
            id: `OPS-${ord.order_id}`,
            orderId: ord.order_id,
            leadId: ord.lead_id,
            eventId: 'default_event',
            customerName: ord.customer_name || matchedLead?.customer_name || 'Client',
            customerMobile: ord.customer_phone || ord.mobile || matchedLead?.mobile || '',
            eventName: ord.custom_event_name || ord.event_type || matchedLead?.event_type || 'Event',
            eventType: ord.event_type || matchedLead?.event_type || 'Photography',
            eventDate: normDate,
            reportingDate: matchedOp?.reporting_date || normDate,
            reportingTime: matchedOp?.reporting_time || ord.event_time || '08:00 AM',
            location: ord.address || matchedLead?.city || matchedLead?.address || 'Studio / On Site',
            salesCrew: salesStaffName,
            salesPerson: salesStaffName,
            assignedRole: assignedRoleStr,
            assignedCrew: { photographer, videographer, drone, assistant },
            equipmentKit: eqList.join(', '),
            equipmentItems: eqList,
            status: matchedOp?.event_status || ord.current_stage || 'Assigned Crew',
            desk: 'Operations',
            sourceRecord: { order: ord, op: matchedOp, lead: matchedLead, staffAssignments: matchedSa }
          });
        }
      });
    }

    // 3. SALES CALENDAR
    else if (role === 'sales') {
      const processedLeadIds = new Set<string>();
      const processedOrderIds = new Set<string>();

      // A. Process all confirmed orders from orders array
      (orders || []).forEach(ord => {
        const isOrderCancelled = ord.order_status === 'Cancelled' || ord.current_stage === 'Event Cancelled' || (ord as any).status === 'Cancelled';
        if (isOrderCancelled) return;

        const ordId = ord.order_id && typeof ord.order_id === 'string' ? ord.order_id.trim() : '';
        if (!ordId || ordId.startsWith('DRAFT')) return;

        const matchedLead = (leads || []).find(l => 
          (ord.lead_id && l.lead_id === ord.lead_id) || 
          (l.order_id && l.order_id === ordId) ||
          ((l as any).orders && (l as any).orders === ordId)
        );

        const matchedOp = (operations || []).find(op => 
          op.order_id === ordId || 
          (ord.lead_id && op.lead_id === ord.lead_id)
        );
        const matchedSa = (staffAssignments || []).filter(sa => 
          sa.order_id === ordId || 
          (ord.lead_id && sa.lead_id === ord.lead_id)
        );

        processedOrderIds.add(ordId);
        if (ord.lead_id) processedLeadIds.add(ord.lead_id);
        if (matchedLead?.lead_id) processedLeadIds.add(matchedLead.lead_id);

        let rawEvents: any[] = [];
        if (ord.events && Array.isArray(ord.events) && ord.events.length > 0) {
          rawEvents = ord.events;
        } else if (matchedLead?.events && Array.isArray(matchedLead.events) && matchedLead.events.length > 0) {
          rawEvents = matchedLead.events;
        }
        if (rawEvents.length === 0 && ord.notes_special_customizations) {
          const parsed = deserializeLeadEvents(ord.notes_special_customizations);
          if (parsed.events && parsed.events.length > 0) rawEvents = parsed.events;
        }
        if (rawEvents.length === 0 && matchedLead?.notes_special_customizations) {
          const parsed = deserializeLeadEvents(matchedLead.notes_special_customizations);
          if (parsed.events && parsed.events.length > 0) rawEvents = parsed.events;
        }

        const salesStaffName = resolveSalesCrewName(ord, matchedLead, undefined, quotations);

        if (rawEvents.length > 0) {
          rawEvents.forEach((ev: any, evIdx: number) => {
            const evId = String(ev.id || ev.event_id || `ev_${evIdx + 1}`);
            const eventDateStr = ev.event_date || ev.Event_Date || ev.date || ord.event_date || matchedLead?.event_date;
            const normDate = normalizeDateStr(eventDateStr);
            if (!normDate) return;

            const evTimeStr = ev.event_start_time || ev.event_time || ev.Event_Start_Time || ev.time || ord.event_time || matchedLead?.event_time || '';
            const evLoc = cleanLocationString(ev.event_location || ev.venue_address || ev.venue || ev.location || ev.address || ord.event_location || ord.address || matchedLead?.event_location || matchedLead?.city || matchedLead?.address || '');

            const evName = (ev.event_name || ev.custom_event_name || ev.eventName || ev.Event_Name || ev.event_type || ord.custom_event_name || ord.event_name || ord.event_type || matchedLead?.custom_event_name || matchedLead?.event_name || matchedLead?.event_type || `Event ${evIdx + 1}`).trim();
            const evType = (ev.event_type || ev.event_category || ev.eventType || ord.event_type || matchedLead?.event_type || 'Event').trim();

            const evSalesStaffName = resolveSalesCrewName(ord, matchedLead, ev, quotations);

            items.push({
              id: `ORD-${ordId}-${evId}`,
              orderId: ordId, // Strictly Order ID only, never Lead ID
              leadId: ord.lead_id || matchedLead?.lead_id,
              eventId: evId,
              customerName: ord.customer_name || matchedLead?.customer_name || 'Client',
              customerMobile: ord.customer_phone || ord.mobile || matchedLead?.mobile || matchedLead?.whatsapp_number || '',
              eventName: evName,
              eventType: evType,
              eventDate: normDate,
              eventTime: evTimeStr,
              reportingDate: ev.reporting_date || matchedOp?.reporting_date || normDate,
              reportingTime: evTimeStr || matchedOp?.reporting_time || '08:00 AM',
              location: evLoc,
              budget: ord.quotation_amount || matchedLead?.budget || 0,
              salesCrew: evSalesStaffName,
              salesPerson: evSalesStaffName,
              status: ord.current_stage || matchedLead?.status || 'Confirmed Order',
              desk: 'Sales',
              sourceRecord: { order: ord, lead: matchedLead, op: matchedOp, staffAssignments: matchedSa, event: ev }
            });
          });
        } else {
          const normDate = normalizeDateStr(ord.event_date || matchedLead?.event_date);
          if (!normDate) return;

          const evLoc = cleanLocationString(ord.event_location || ord.address || matchedLead?.event_location || matchedLead?.city || matchedLead?.address || '');
          const evTimeStr = ord.event_time || matchedLead?.event_time || '';

          const evName = (ord.custom_event_name || ord.event_name || ord.event_type || matchedLead?.custom_event_name || matchedLead?.event_name || matchedLead?.event_type || 'Shoot').trim();
          const evType = (ord.event_type || matchedLead?.event_type || 'Photography & Videography').trim();

          items.push({
            id: `ORD-${ordId}`,
            orderId: ordId, // Strictly Order ID only, never Lead ID
            leadId: ord.lead_id || matchedLead?.lead_id,
            customerName: ord.customer_name || matchedLead?.customer_name || 'Client',
            customerMobile: ord.customer_phone || ord.mobile || matchedLead?.mobile || matchedLead?.whatsapp_number || '',
            eventName: evName,
            eventType: evType,
            eventDate: normDate,
            eventTime: evTimeStr,
            reportingDate: matchedOp?.reporting_date || normDate,
            reportingTime: matchedOp?.reporting_time || evTimeStr || '08:00 AM',
            location: evLoc,
            budget: ord.quotation_amount || matchedLead?.budget || 0,
            salesCrew: salesStaffName,
            salesPerson: salesStaffName,
            status: ord.current_stage || matchedLead?.status || 'Confirmed Order',
            desk: 'Sales',
            sourceRecord: { order: ord, lead: matchedLead, op: matchedOp, staffAssignments: matchedSa }
          });
        }
      });

      // B. Process any confirmed leads not yet processed through orders array
      (leads || []).forEach(lead => {
        if (processedLeadIds.has(lead.lead_id)) return;
        if (lead.order_id && processedOrderIds.has(lead.order_id)) return;

        // Check existing Order Confirmation status/data: lead must be confirmed!
        const isLeadConfirmed = Boolean(
          lead.is_order_confirmed === true ||
          lead.isOrderConfirmed === true ||
          (lead as any).is_confirmed === true ||
          ['Confirmed', 'Order Confirmed'].includes(lead.booking_status || '') ||
          ['Order Confirmed', 'Booking Confirmed'].includes(lead.status || '') ||
          ['Order Confirmed', 'Booking Confirmed'].includes(lead.current_status || '') ||
          ['Order Confirmed', 'Booking Confirmed'].includes(lead.current_stage || '') ||
          ['Confirmed', 'Completed', 'Project Completed', 'Delivered', 'Paid', 'Closed'].includes((lead as any).order_status || '') ||
          (lead.order_id && typeof lead.order_id === 'string' && lead.order_id.trim() !== '' && lead.order_id !== lead.lead_id && !lead.order_id.startsWith('LD-') && !lead.order_id.startsWith('DRAFT'))
        );

        // Pre-confirmation leads must NOT appear in the Sales Calendar
        if (!isLeadConfirmed) return;

        // Match linked order if exists
        const matchedOrder: any = (orders || []).find(o => 
          (o.lead_id && o.lead_id === lead.lead_id) || 
          (lead.order_id && o.order_id === lead.order_id) ||
          ((lead as any).orders && (o.order_id === (lead as any).orders || o.lead_id === (lead as any).orders))
        );

        // Resolve valid Order ID - NEVER use Lead ID!
        const resolvedOrderId = matchedOrder?.order_id || 
          (lead.order_id && typeof lead.order_id === 'string' && lead.order_id.trim() !== '' && lead.order_id !== lead.lead_id && !lead.order_id.startsWith('LD-') && !lead.order_id.startsWith('DRAFT') ? lead.order_id.trim() : null) ||
          ((lead as any).orders && typeof (lead as any).orders === 'string' && (lead as any).orders.trim() !== '' && (lead as any).orders !== lead.lead_id && !(lead as any).orders.startsWith('LD-') ? (lead as any).orders.trim() : null);

        // An event only appears after order confirmation with a valid Order ID
        if (!resolvedOrderId) return;

        processedOrderIds.add(resolvedOrderId);
        processedLeadIds.add(lead.lead_id);

        const matchedOp = matchedOrder
          ? (operations || []).find(op => op.order_id === matchedOrder.order_id)
          : (operations || []).find(op => op.lead_id === lead.lead_id);
        const matchedSa = matchedOrder
          ? (staffAssignments || []).filter(sa => sa.order_id === matchedOrder.order_id)
          : (staffAssignments || []).filter(sa => sa.lead_id === lead.lead_id);

        let rawEvents: any[] = [];
        if (lead.events && Array.isArray(lead.events) && lead.events.length > 0) {
          rawEvents = lead.events;
        } else if (matchedOrder?.events && Array.isArray(matchedOrder.events) && matchedOrder.events.length > 0) {
          rawEvents = matchedOrder.events;
        }
        if (rawEvents.length === 0 && lead.notes_special_customizations) {
          const parsed = deserializeLeadEvents(lead.notes_special_customizations);
          if (parsed.events && parsed.events.length > 0) rawEvents = parsed.events;
        }
        if (rawEvents.length === 0 && matchedOrder?.notes_special_customizations) {
          const parsed = deserializeLeadEvents(matchedOrder.notes_special_customizations);
          if (parsed.events && parsed.events.length > 0) rawEvents = parsed.events;
        }

        const salesStaffName = resolveSalesCrewName(matchedOrder, lead, undefined, quotations);

        if (rawEvents.length > 0) {
          rawEvents.forEach((ev: any, evIdx: number) => {
            const evId = String(ev.id || ev.event_id || `ev_${evIdx + 1}`);
            const eventDateStr = ev.event_date || ev.Event_Date || ev.date || lead.event_date || matchedOrder?.event_date;
            const normDate = normalizeDateStr(eventDateStr);
            if (!normDate) return;

            const evTimeStr = ev.event_start_time || ev.event_time || ev.Event_Start_Time || ev.time || lead.event_time || matchedOrder?.event_time || '';
            const evLoc = cleanLocationString(ev.event_location || ev.venue_address || ev.venue || ev.location || ev.address || lead.event_location || lead.city || lead.address || matchedOrder?.event_location || matchedOrder?.address || '');

            const evName = (ev.event_name || ev.custom_event_name || ev.eventName || ev.Event_Name || ev.event_type || lead.custom_event_name || lead.event_name || lead.event_type || `Event ${evIdx + 1}`).trim();
            const evType = (ev.event_type || ev.event_category || ev.eventType || lead.event_type || matchedOrder?.event_type || 'Event').trim();

            const evSalesStaffName = resolveSalesCrewName(matchedOrder, lead, ev, quotations);

            items.push({
              id: `CONF-LEAD-${lead.lead_id}-${evId}`,
              orderId: resolvedOrderId, // Strictly Order ID only, never Lead ID
              leadId: lead.lead_id,
              eventId: evId,
              customerName: lead.customer_name || matchedOrder?.customer_name || 'Client',
              customerMobile: lead.mobile || lead.whatsapp_number || matchedOrder?.customer_phone || matchedOrder?.mobile || '',
              eventName: evName,
              eventType: evType,
              eventDate: normDate,
              eventTime: evTimeStr,
              reportingDate: ev.reporting_date || matchedOp?.reporting_date || normDate,
              reportingTime: evTimeStr || matchedOp?.reporting_time || '08:00 AM',
              location: evLoc,
              budget: lead.budget || matchedOrder?.quotation_amount || 0,
              salesCrew: evSalesStaffName,
              salesPerson: evSalesStaffName,
              status: lead.status || lead.current_status || matchedOrder?.current_stage || 'Confirmed Order',
              desk: 'Sales',
              sourceRecord: { lead, order: matchedOrder, op: matchedOp, staffAssignments: matchedSa, event: ev }
            });
          });
        } else {
          const normDate = normalizeDateStr(lead.event_date || matchedOrder?.event_date);
          if (!normDate) return;

          const evLoc = cleanLocationString(lead.event_location || (lead as any).venue_address || (lead as any).venue || lead.address || lead.city || matchedOrder?.event_location || matchedOrder?.address || '');
          const evTimeStr = lead.event_time || matchedOrder?.event_time || '';

          items.push({
            id: `CONF-LEAD-${lead.lead_id}`,
            orderId: resolvedOrderId, // Strictly Order ID only, never Lead ID
            leadId: lead.lead_id,
            customerName: lead.customer_name || matchedOrder?.customer_name || 'Client',
            customerMobile: lead.mobile || lead.whatsapp_number || matchedOrder?.customer_phone || matchedOrder?.mobile || '',
            eventName: (lead.custom_event_name || lead.event_name || lead.event_type || 'Shoot').trim(),
            eventType: (lead.event_type || matchedOrder?.event_type || 'Photography & Videography').trim(),
            eventDate: normDate,
            eventTime: evTimeStr,
            reportingDate: matchedOp?.reporting_date || normDate,
            reportingTime: matchedOp?.reporting_time || evTimeStr || '08:00 AM',
            location: evLoc,
            budget: lead.budget || matchedOrder?.quotation_amount || 0,
            salesCrew: salesStaffName,
            salesPerson: salesStaffName,
            status: lead.status || lead.current_status || matchedOrder?.current_stage || 'Confirmed Order',
            desk: 'Sales',
            sourceRecord: { lead, order: matchedOrder, op: matchedOp, staffAssignments: matchedSa }
          });
        }
      });
    }

    // 4. BUSINESS OWNER CALENDAR (Consolidated Studio Milestones)
    else if (role === 'owner') {
      // Collect across sales, operations, and production
      (orders || []).forEach(ord => {
        const normDate = normalizeDateStr(ord.event_date);
        if (!normDate) return;
        const matchedOp = (operations || []).find(op => op.order_id === ord.order_id);
        const matchedProd = (production || []).find(p => p.order_id === ord.order_id);
        const matchedLead = (leads || []).find(l => l.lead_id === ord.lead_id);

        items.push({
          id: `OWNER-${ord.order_id}`,
          orderId: ord.order_id,
          leadId: ord.lead_id,
          customerName: ord.customer_name || 'Client',
          customerMobile: ord.customer_phone || ord.mobile || '',
          eventName: ord.custom_event_name || ord.event_type || 'Event',
          eventType: ord.event_type || 'Milestone',
          eventDate: normDate,
          reportingTime: matchedOp?.reporting_time || ord.event_time || '',
          location: ord.address || matchedLead?.city || '—',
          budget: ord.quotation_amount || matchedLead?.budget || 0,
          editorAssigned: matchedProd?.editor_assigned || '—',
          status: ord.current_stage || 'In Progress',
          desk: matchedProd ? 'Production' : (matchedOp ? 'Operations' : 'Sales'),
          sourceRecord: { order: ord, op: matchedOp, prod: matchedProd, lead: matchedLead }
        });
      });
    }

    return items;
  }, [role, staffMemberId, staffMemberName, currentUserName, currentUser, orders, leads, operations, production, editorAssignments, staffAssignments, rawFootage, quotations]);

  // Filter items by search term and status
  const filteredEvents = useMemo(() => {
    const list = allEvents.filter(ev => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchId = ev.orderId.toLowerCase().includes(q) || (ev.leadId && ev.leadId.toLowerCase().includes(q));
        const matchName = ev.customerName.toLowerCase().includes(q);
        const matchEvent = ev.eventName.toLowerCase().includes(q) || ev.eventType.toLowerCase().includes(q);
        const matchStaff = (ev.editorAssigned && ev.editorAssigned.toLowerCase().includes(q)) ||
                           (ev.assignedStaff && ev.assignedStaff.toLowerCase().includes(q));
        if (!matchId && !matchName && !matchEvent && !matchStaff) return false;
      }

      if (selectedStatusFilter !== 'All') {
        if (ev.status.toLowerCase() !== selectedStatusFilter.toLowerCase()) return false;
      }

      return true;
    });

    // For production & production staff, strictly order by Target Delivery Date
    if (role === 'production' || role === 'production_staff') {
      list.sort((a, b) => {
        const timeA = a.targetDeliveryDate || a.eventDate ? new Date(a.targetDeliveryDate || a.eventDate).getTime() : 0;
        const timeB = b.targetDeliveryDate || b.eventDate ? new Date(b.targetDeliveryDate || b.eventDate).getTime() : 0;
        if (timeA > 0 && timeB > 0 && timeA !== timeB) return timeA - timeB;
        if (timeA > 0 && timeB === 0) return -1;
        if (timeB > 0 && timeA === 0) return 1;
        return a.orderId.localeCompare(b.orderId, undefined, { numeric: true });
      });
    }

    return list;
  }, [allEvents, searchTerm, selectedStatusFilter, role]);

  // Calendar Grid Calculation
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthName = currentMonth.toLocaleString('default', { month: 'long' });

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(year, month, 0).getDate();
  const todayStr = normalizeDateStr(new Date());

  const calendarGrid: {
    dateStr: string;
    dayNum: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    events: CalendarEventItem[];
  }[] = [];

  // Prev month padding
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dNum = daysInPreviousMonth - i;
    const pDate = new Date(year, month - 1, dNum);
    const dateStr = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
    const evs = filteredEvents.filter(e => e.eventDate === dateStr);
    calendarGrid.push({
      dateStr,
      dayNum: dNum,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      events: evs
    });
  }

  // Current month days
  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const evs = filteredEvents.filter(e => e.eventDate === dateStr);
    calendarGrid.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      events: evs
    });
  }

  // Next month padding to fill row
  const remaining = calendarGrid.length % 7 === 0 ? 0 : 7 - (calendarGrid.length % 7);
  for (let d = 1; d <= remaining; d++) {
    const nDate = new Date(year, month + 1, d);
    const dateStr = `${nDate.getFullYear()}-${String(nDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const evs = filteredEvents.filter(e => e.eventDate === dateStr);
    calendarGrid.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      events: evs
    });
  }

  // Get distinct statuses for filter
  const distinctStatuses = useMemo(() => {
    const set = new Set<string>();
    allEvents.forEach(e => {
      if (e.status) set.add(e.status);
    });
    return Array.from(set);
  }, [allEvents]);

  // Calendar Theme Colors based on Role
  const theme = useMemo(() => {
    switch (role) {
      case 'production':
      case 'production_staff':
        return {
          primary: 'purple',
          border: 'border-purple-500/30',
          bgHighlight: 'bg-purple-500/10',
          textHighlight: 'text-purple-400',
          buttonBg: 'bg-purple-600 hover:bg-purple-500 text-white'
        };
      case 'operations':
        return {
          primary: 'amber',
          border: 'border-amber-500/30',
          bgHighlight: 'bg-amber-500/10',
          textHighlight: 'text-amber-400',
          buttonBg: 'bg-amber-600 hover:bg-amber-500 text-white'
        };
      case 'sales':
        return {
          primary: 'blue',
          border: 'border-blue-500/30',
          bgHighlight: 'bg-blue-500/10',
          textHighlight: 'text-blue-400',
          buttonBg: 'bg-blue-600 hover:bg-blue-500 text-white'
        };
      case 'owner':
      default:
        return {
          primary: 'emerald',
          border: 'border-emerald-500/30',
          bgHighlight: 'bg-emerald-500/10',
          textHighlight: 'text-emerald-400',
          buttonBg: 'bg-emerald-600 hover:bg-emerald-500 text-white'
        };
    }
  }, [role]);

  return (
    <div className="space-y-4">
      {/* Calendar Header Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl md:rounded-3xl p-4 sm:p-5 md:p-6 shadow-2xl space-y-4 md:space-y-6">
        
        {/* Navigation & Controls Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
          
          {/* Month / Year Navigator */}
          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition cursor-pointer active:scale-90 shrink-0"
              aria-label="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <h2 className="text-sm sm:text-base font-mono font-bold tracking-wider text-center px-3 whitespace-nowrap">
              <span className={`${theme.textHighlight} font-extrabold`}>{monthName}</span>
              <span className="text-zinc-200 font-medium ml-1.5">{year}</span>
            </h2>

            <button
              type="button"
              onClick={handleNextMonth}
              className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition cursor-pointer active:scale-90 shrink-0"
              aria-label="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleToday}
              className="ml-2 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 rounded-lg text-xs font-mono font-bold text-zinc-300 hover:text-white transition cursor-pointer"
            >
              Today
            </button>
          </div>

          {/* Search & Status Filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search orders, clients, events..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition"
              />
            </div>

            {distinctStatuses.length > 0 && (
              <select
                value={selectedStatusFilter}
                onChange={e => setSelectedStatusFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-zinc-600 transition cursor-pointer"
              >
                <option value="All">All Statuses ({allEvents.length})</option>
                {distinctStatuses.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            )}

            <div className="px-3 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs font-mono font-bold text-zinc-400">
              Total: <span className={`${theme.textHighlight} font-black`}>{filteredEvents.length}</span>
            </div>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] sm:text-xs font-mono font-bold uppercase text-zinc-500">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
            <div key={day} className="py-2 bg-zinc-950/70 rounded-xl border border-zinc-850">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Month Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 w-full max-w-full">
          {calendarGrid.map((cell, idx) => {
            const hasEvents = cell.events.length > 0;
            const isSelected = cell.dateStr === calendarModalDate;

            return (
              <div
                key={idx}
                onClick={() => {
                  if (hasEvents) {
                    setCalendarModalDate(cell.dateStr);
                    setCalendarModalEvents(cell.events);
                  }
                }}
                className={`aspect-square min-h-[52px] sm:min-h-[80px] p-1 sm:p-2 rounded-xl border flex flex-col items-center justify-between select-none touch-manipulation relative transition-all duration-150 ${
                  hasEvents ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default'
                } ${
                  isSelected
                    ? `bg-zinc-900 ${theme.border} ring-1 ring-purple-500/30 shadow-lg`
                    : cell.isToday
                    ? `${theme.bgHighlight} ${theme.border} text-white shadow-md`
                    : cell.isCurrentMonth
                    ? 'bg-zinc-950/80 border-zinc-850 hover:border-zinc-700 hover:bg-zinc-900/40 text-zinc-200'
                    : 'bg-zinc-950/20 border-transparent text-zinc-800 opacity-20 pointer-events-none'
                }`}
              >
                {/* Date Number Display */}
                <div className="w-full flex items-center justify-between">
                  <span
                    className={`text-[11px] sm:text-xs font-mono font-extrabold shrink-0 ${
                      cell.isToday
                        ? `${theme.textHighlight} font-black`
                        : cell.isCurrentMonth
                        ? 'text-zinc-200'
                        : 'text-zinc-700'
                    }`}
                  >
                    {cell.dayNum}
                  </span>

                  {/* Badge count if multiple */}
                  {hasEvents && cell.events.length > 1 && (
                    <span className={`text-[8px] sm:text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full ${theme.bgHighlight} ${theme.textHighlight} border ${theme.border}`}>
                      {cell.events.length}
                    </span>
                  )}
                </div>

                {/* Event Names inside the Date Cell */}
                {cell.isCurrentMonth && hasEvents && (
                  <div className="w-full flex-1 flex flex-col justify-start gap-0.5 overflow-hidden mt-0.5 min-h-0">
                    {cell.events.slice(0, 2).map((ev, eIdx) => {
                      const displayName = ev.customerName || ev.orderId;
                      return (
                        <div
                          key={`${ev.id}_${eIdx}`}
                          className="w-full truncate text-[9px] sm:text-[10px] leading-tight px-1 py-0.5 rounded bg-zinc-900/90 text-zinc-300 border border-zinc-800 font-medium text-left hover:text-white"
                          title={`${ev.orderId}: ${ev.customerName} (${ev.status})`}
                        >
                          <span className={`${theme.textHighlight} font-bold mr-0.5`}>•</span>
                          {displayName}
                        </div>
                      );
                    })}
                    {cell.events.length > 2 && (
                      <span className="text-[8px] text-zinc-500 font-mono text-left pl-0.5">
                        +{cell.events.length - 2} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Modal for Clicked Date: Real Horizontal Table */}
        {calendarModalDate && createPortal(
          <div 
            className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 bg-zinc-950/85 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setCalendarModalDate(null)}
          >
            <div 
              className="bg-zinc-900 border border-zinc-800 w-full max-w-5xl rounded-2xl md:rounded-3xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden" 
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-800/80 shrink-0">
                <div>
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${theme.textHighlight} block font-extrabold`}>
                    {role.toUpperCase().replace('_', ' ')} CALENDAR // EVENT DETAILS
                  </span>
                  <h4 className="text-base sm:text-lg font-black text-white font-mono mt-0.5 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-zinc-400" />
                    <span>{formatDateDDMMYY(calendarModalDate) || calendarModalDate}</span>
                  </h4>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono font-bold px-2.5 py-1 ${theme.bgHighlight} ${theme.textHighlight} border ${theme.border} rounded-lg`}>
                    {calendarModalEvents.length} {calendarModalEvents.length === 1 ? 'RECORD' : 'RECORDS'}
                  </span>
                  <button
                    onClick={() => setCalendarModalDate(null)}
                    className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Modal Body: Responsive Genuine Horizontal Table */}
              <div className="p-3 sm:p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                {calendarModalEvents.length === 0 ? (
                  <div className="p-8 text-center bg-zinc-950/40 border border-dashed border-zinc-800 rounded-2xl text-zinc-500 text-xs font-mono">
                    No events scheduled for this date.
                  </div>
                ) : (
                  <div className="overflow-x-auto touch-pan-x w-full border border-zinc-800 rounded-2xl bg-zinc-950/80 shadow-inner">
                    <table className="w-full text-left border-collapse min-w-[1050px]">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-950/90 text-zinc-400 font-mono text-[10px] sm:text-[11px] uppercase tracking-wider font-bold">
                          {role === 'sales' ? (
                            <>
                              <th className="p-3 pl-4 whitespace-nowrap min-w-[120px]">Order ID</th>
                              <th className="p-3 whitespace-nowrap min-w-[170px]">Customer Name & Number</th>
                              <th className="p-3 whitespace-nowrap min-w-[140px]">Event Name</th>
                              <th className="p-3 whitespace-nowrap min-w-[150px]">Event Location</th>
                              <th className="p-3 whitespace-nowrap min-w-[130px]">Sales Crew</th>
                              <th className="p-3 whitespace-nowrap min-w-[120px]">Event Date</th>
                              <th className="p-3 whitespace-nowrap min-w-[110px]">Event Time</th>
                              <th className="p-3 text-left whitespace-nowrap min-w-[160px]">Status</th>
                              <th className="p-3 pr-4 text-center whitespace-nowrap min-w-[130px]">Actions</th>
                            </>
                          ) : role === 'operations' ? (
                            <>
                              <th className="p-3 pl-4 whitespace-nowrap min-w-[130px]">Order ID</th>
                              <th className="p-3 whitespace-nowrap min-w-[170px]">Customer Name</th>
                              <th className="p-3 whitespace-nowrap min-w-[150px]">Event Type</th>
                              <th className="p-3 whitespace-nowrap min-w-[130px]">Reporting Time</th>
                              <th className="p-3 whitespace-nowrap min-w-[160px]">Assigned Role</th>
                              <th className="p-3 whitespace-nowrap min-w-[180px]">Equipment Details</th>
                              <th className="p-3 text-left whitespace-nowrap min-w-[160px]">Status</th>
                              <th className="p-3 pr-4 text-center whitespace-nowrap min-w-[130px]">Actions</th>
                            </>
                          ) : role === 'production' ? (
                            <>
                              <th className="p-3 pl-4 whitespace-nowrap min-w-[120px]">Order ID</th>
                              <th className="p-3 whitespace-nowrap min-w-[170px]">Customer Name</th>
                              <th className="p-3 whitespace-nowrap min-w-[140px]">Event Category</th>
                              <th className="p-3 whitespace-nowrap min-w-[130px]">Sales Crew</th>
                              <th className="p-3 whitespace-nowrap min-w-[130px]">Targeted Date</th>
                              <th className="p-3 text-left whitespace-nowrap min-w-[160px]">Status</th>
                              <th className="p-3 pr-4 text-center whitespace-nowrap min-w-[130px]">Actions</th>
                            </>
                          ) : (
                            <>
                              <th className="p-3 pl-4 whitespace-nowrap min-w-[130px]">Order / Lead ID</th>
                              <th className="p-3 whitespace-nowrap min-w-[170px]">Customer Name</th>
                              <th className="p-3 whitespace-nowrap min-w-[160px]">Event Name & Type</th>
                              
                              {/* Role-Specific Column Headers */}
                              {role === 'production_staff' && (
                                <>
                                  <th className="p-3 whitespace-nowrap min-w-[180px]">Deliverables</th>
                                  <th className="p-3 whitespace-nowrap min-w-[130px]">Target Delivery</th>
                                  <th className="p-3 whitespace-nowrap min-w-[140px]">Assigned Editor</th>
                                  <th className="p-3 whitespace-nowrap min-w-[120px]">Raw Footage Link</th>
                                </>
                              )}

                              {role === 'owner' && (
                                <>
                                  <th className="p-3 whitespace-nowrap min-w-[120px]">Desk / Stage</th>
                                  <th className="p-3 whitespace-nowrap min-w-[170px]">Location</th>
                                  <th className="p-3 whitespace-nowrap min-w-[130px]">Value</th>
                                </>
                              )}

                              <th className="p-3 text-left whitespace-nowrap min-w-[160px]">Status</th>
                              <th className="p-3 pr-4 text-center whitespace-nowrap min-w-[130px]">Actions</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-850 text-xs font-sans">
                        {calendarModalEvents.map((ev, idx) => (
                          <tr key={`${ev.id}_${idx}`} className="hover:bg-zinc-900/50 transition font-mono">
                            {role === 'sales' ? (
                              <>
                                {/* 1. Order ID */}
                                <td className="p-3 pl-4 text-zinc-200 font-bold whitespace-nowrap min-w-[120px]">
                                  <span className={`${theme.textHighlight}`}>{ev.orderId}</span>
                                </td>

                                {/* 2. Customer Name & Number */}
                                <td className="p-3 font-sans font-bold text-white whitespace-nowrap min-w-[170px]">
                                  <div>{ev.customerName}</div>
                                  {ev.customerMobile && (
                                    <div className="text-[10px] font-mono text-zinc-400 font-normal mt-0.5">
                                      {formatIndianPhoneNumber(ev.customerMobile) || ev.customerMobile}
                                    </div>
                                  )}
                                </td>

                                {/* 3. Event Name */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[140px]">
                                  <div className="font-semibold text-zinc-100">{ev.eventName || ev.eventType || 'Event'}</div>
                                </td>

                                {/* 4. Event Location */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[150px]">
                                  <EventLocationCell
                                    lead={ev.sourceRecord?.lead ? {
                                      ...ev.sourceRecord.lead,
                                      order_id: ev.orderId,
                                      events: ev.sourceRecord.lead.events || ev.sourceRecord?.order?.events || (ev.sourceRecord?.event ? [ev.sourceRecord.event] : [])
                                    } : {
                                      lead_id: ev.leadId || ev.orderId,
                                      order_id: ev.orderId,
                                      events: ev.sourceRecord?.order?.events || (ev.sourceRecord?.event ? [ev.sourceRecord.event] : []),
                                      notes_special_customizations: ev.sourceRecord?.order?.notes_special_customizations,
                                      event_location: ev.location,
                                      address: ev.location
                                    }}
                                    orders={orders}
                                    currentLocation={ev.location}
                                  />
                                </td>

                                {/* 5. Sales Crew */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[130px]">
                                  <div className="text-zinc-200 font-medium font-mono text-xs">
                                    {ev.salesCrew || ev.salesPerson || 'Sales Team'}
                                  </div>
                                </td>

                                {/* 6. Event Date */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[120px]">
                                  <span className="font-mono text-xs text-zinc-200">
                                    {formatDateDDMMYY(ev.eventDate) || ev.eventDate}
                                  </span>
                                </td>

                                {/* 7. Event Time */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[110px]">
                                  <span className="font-mono text-xs text-zinc-200">
                                    {formatTime12Hour(ev.eventTime) || ev.eventTime || formatTime12Hour(ev.reportingTime) || ev.reportingTime || '—'}
                                  </span>
                                </td>

                                {/* 8. Status */}
                                <td className="p-3 text-left align-middle whitespace-nowrap min-w-[160px]">
                                  <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wide border whitespace-nowrap leading-none shadow-sm ${theme.bgHighlight} ${theme.textHighlight} ${theme.border}`}>
                                    {ev.status}
                                  </span>
                                </td>

                                {/* 9. Actions */}
                                <td className="p-3 pr-4 align-middle text-center whitespace-nowrap min-w-[130px]">
                                  <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCalendarModalDate(null);
                                        if (onSelectLead) {
                                          if (ev.sourceRecord?.lead) {
                                            onSelectLead(ev.sourceRecord.lead);
                                          } else if (ev.sourceRecord?.order) {
                                            onSelectLead(ev.sourceRecord.order);
                                          }
                                        }
                                      }}
                                      className="inline-flex items-center justify-center gap-1 h-7 px-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[11px] font-mono transition-colors cursor-pointer shadow-sm shrink-0 whitespace-nowrap leading-none"
                                    >
                                      <span>Open Lead</span>
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : role === 'operations' ? (
                              <>
                                {/* 1. Order ID */}
                                <td className="p-3 pl-4 text-zinc-200 font-bold whitespace-nowrap min-w-[130px]">
                                  <span className={`${theme.textHighlight}`}>{ev.orderId}</span>
                                  {ev.leadId && ev.leadId !== ev.orderId && (
                                    <span className="block text-[10px] text-zinc-500 font-normal">
                                      Lead: {ev.leadId}
                                    </span>
                                  )}
                                </td>

                                {/* 2. Customer Name */}
                                <td className="p-3 font-sans font-bold text-white whitespace-nowrap min-w-[170px]">
                                  <div>{ev.customerName}</div>
                                  {ev.customerMobile && (
                                    <div className="text-[10px] font-mono text-zinc-400 font-normal">
                                      {ev.customerMobile}
                                    </div>
                                  )}
                                </td>

                                {/* 3. Event Type */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[150px]">
                                  <div className="font-semibold text-zinc-100">{ev.eventType || ev.eventName || 'Event'}</div>
                                </td>

                                {/* 4. Reporting Time */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[130px]">
                                  <span className="font-mono">{ev.reportingTime || '08:00 AM'}</span>
                                </td>

                                {/* 5. Assigned Role */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[160px]">
                                  <div className="text-zinc-200 text-xs font-medium">
                                    {ev.assignedRole || 'Not assigned'}
                                  </div>
                                </td>

                                {/* 6. Equipment Details */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[180px]">
                                  <div className="text-zinc-200 text-xs font-medium">
                                    {ev.equipmentKit || 'Standard Kit'}
                                  </div>
                                </td>

                                {/* 7. Status */}
                                <td className="p-3 text-left align-middle whitespace-nowrap min-w-[160px]">
                                  <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wide border whitespace-nowrap leading-none shadow-sm ${theme.bgHighlight} ${theme.textHighlight} ${theme.border}`}>
                                    {ev.status}
                                  </span>
                                </td>

                                {/* 8. Actions */}
                                <td className="p-3 pr-4 align-middle text-center whitespace-nowrap min-w-[130px]">
                                  <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCalendarModalDate(null);
                                        if (onOpenAssignStaff) {
                                          onOpenAssignStaff(ev.orderId, ev.leadId, ev.eventId);
                                        }
                                        window.dispatchEvent(new CustomEvent('calendar-action-click', {
                                          detail: {
                                            role: 'operations',
                                            orderId: ev.orderId,
                                            leadId: ev.leadId,
                                            eventId: ev.eventId,
                                            event: ev.sourceRecord?.event
                                          }
                                        }));
                                      }}
                                      className="inline-flex items-center justify-center gap-1.5 h-7 px-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-lg text-[11px] font-mono transition-colors cursor-pointer shadow-sm shrink-0 whitespace-nowrap leading-none"
                                    >
                                      <UserPlus className="w-3.5 h-3.5 shrink-0" />
                                      <span>Assign Staff</span>
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : role === 'production' ? (
                              <>
                                {/* 1. Order ID */}
                                <td className="p-3 pl-4 text-zinc-200 font-bold whitespace-nowrap min-w-[120px]">
                                  <span className={`${theme.textHighlight}`}>{ev.orderId}</span>
                                </td>

                                {/* 2. Customer Name */}
                                <td className="p-3 font-sans font-bold text-white whitespace-nowrap min-w-[170px]">
                                  <div>{ev.customerName}</div>
                                </td>

                                {/* 3. Event Category */}
                                <td className="p-3 whitespace-nowrap text-zinc-200 min-w-[140px]">
                                  <span className="font-semibold text-zinc-100">{ev.eventType || '—'}</span>
                                </td>

                                {/* 4. Sales Crew */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[130px]">
                                  <div className="text-zinc-200 font-medium font-mono text-xs">
                                    {ev.salesCrew || '—'}
                                  </div>
                                </td>

                                {/* 5. Targeted Date */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[130px]">
                                  <span className="font-mono text-xs text-zinc-200">
                                    {ev.targetDeliveryDate ? (formatDateDDMMYY(ev.targetDeliveryDate) || ev.targetDeliveryDate) : '—'}
                                  </span>
                                </td>

                                {/* 6. Status */}
                                <td className="p-3 text-left align-middle whitespace-nowrap min-w-[160px]">
                                  <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wide border whitespace-nowrap leading-none shadow-sm ${theme.bgHighlight} ${theme.textHighlight} ${theme.border}`}>
                                    {ev.status}
                                  </span>
                                </td>

                                {/* 7. Actions */}
                                <td className="p-3 pr-4 align-middle text-center whitespace-nowrap min-w-[130px]">
                                  <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCalendarModalDate(null);
                                        if (onOpenAssignEditor) {
                                          onOpenAssignEditor(ev.orderId, ev.leadId);
                                        }
                                      }}
                                      className="inline-flex items-center justify-center gap-1 h-7 px-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer shadow-sm shrink-0 whitespace-nowrap leading-none"
                                    >
                                      <span>Assign Editor</span>
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : role === 'production_staff' ? (
                              <>
                                {/* 1. Order ID */}
                                <td className="p-3 pl-4 text-zinc-200 font-bold whitespace-nowrap min-w-[130px]">
                                  <span className={`${theme.textHighlight}`}>{ev.orderId}</span>
                                  {ev.leadId && ev.leadId !== ev.orderId && (
                                    <span className="block text-[10px] text-zinc-500 font-normal">
                                      Lead: {ev.leadId}
                                    </span>
                                  )}
                                </td>

                                {/* 2. Customer Name */}
                                <td className="p-3 font-sans font-bold text-white whitespace-nowrap min-w-[170px]">
                                  <div>{ev.customerName}</div>
                                </td>

                                {/* 3. Customer Mobile Number */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 font-mono text-xs min-w-[150px]">
                                  {ev.customerMobile || '—'}
                                </td>

                                {/* 4. Deliverables */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[180px]">
                                  <DeliverablesCell items={ev.deliverablesList || []} />
                                </td>

                                {/* 5. Target Delivery */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[130px]">
                                  {ev.targetDeliveryDate ? formatDateDDMMYY(ev.targetDeliveryDate) || ev.targetDeliveryDate : '—'}
                                </td>

                                {/* 6. Assigned Editor */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[140px]">
                                  <EditorCell editors={ev.editorsList || [ev.editorAssigned].filter(Boolean)} />
                                </td>

                                {/* 7. Raw Footage Link */}
                                <td className="p-3 whitespace-nowrap min-w-[140px]">
                                  {ev.rawFootageLink ? (
                                    <a
                                      href={ev.rawFootageLink.startsWith('http') ? ev.rawFootageLink : `https://${ev.rawFootageLink}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 hover:underline bg-cyan-950/40 border border-cyan-500/30 px-2.5 py-1 rounded-lg"
                                    >
                                      <span>Drive Link</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <span className="text-zinc-600 text-[10px]">No Link</span>
                                  )}
                                </td>

                                {/* 8. Status */}
                                <td className="p-3 text-left align-middle whitespace-nowrap min-w-[160px]">
                                  <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wide border whitespace-nowrap leading-none shadow-sm ${theme.bgHighlight} ${theme.textHighlight} ${theme.border}`}>
                                    {ev.status}
                                  </span>
                                </td>

                                {/* 9. Actions */}
                                <td className="p-3 pr-4 align-middle text-center whitespace-nowrap min-w-[130px]">
                                  <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCalendarModalDate(null);
                                        if (onOpenAssignEditor) {
                                          onOpenAssignEditor(ev.orderId, ev.leadId);
                                        }
                                      }}
                                      className="inline-flex items-center justify-center gap-1 h-7 px-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer shadow-sm shrink-0 whitespace-nowrap leading-none"
                                    >
                                      <span>Assign Editor</span>
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : role === 'owner' ? (
                              <>
                                {/* 1. Order / Lead ID */}
                                <td className="p-3 pl-4 text-zinc-200 font-bold whitespace-nowrap min-w-[130px]">
                                  <span className={`${theme.textHighlight}`}>{ev.orderId}</span>
                                  {ev.leadId && ev.leadId !== ev.orderId && (
                                    <span className="block text-[10px] text-zinc-500 font-normal">
                                      Lead: {ev.leadId}
                                    </span>
                                  )}
                                </td>

                                {/* 2. Customer Name */}
                                <td className="p-3 font-sans font-bold text-white whitespace-nowrap min-w-[170px]">
                                  <div>{ev.customerName}</div>
                                  {ev.customerMobile && (
                                    <div className="text-[10px] font-mono text-zinc-400 font-normal">
                                      {ev.customerMobile}
                                    </div>
                                  )}
                                </td>

                                {/* 3. Event Name & Type */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[160px]">
                                  <div className="font-semibold text-zinc-100">{ev.eventName}</div>
                                  <div className="text-[10px] text-zinc-400">{ev.eventType}</div>
                                </td>

                                {/* 4. Desk / Stage */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[120px]">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-900 border border-zinc-800 text-zinc-300">
                                    {ev.desk || 'Sales'}
                                  </span>
                                </td>

                                {/* 5. Location */}
                                <td className="p-3 whitespace-nowrap text-zinc-300 min-w-[170px]">
                                  <div className="text-zinc-200 text-xs truncate max-w-[200px]" title={ev.location}>
                                    {ev.location || '—'}
                                  </div>
                                </td>

                                {/* 6. Value */}
                                <td className="p-3 whitespace-nowrap text-zinc-200 min-w-[130px] font-mono text-xs font-semibold">
                                  {ev.budget ? `₹${Number(ev.budget).toLocaleString('en-IN')}` : '—'}
                                </td>

                                {/* 7. Status */}
                                <td className="p-3 text-left align-middle whitespace-nowrap min-w-[160px]">
                                  <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wide border whitespace-nowrap leading-none shadow-sm ${theme.bgHighlight} ${theme.textHighlight} ${theme.border}`}>
                                    {ev.status}
                                  </span>
                                </td>

                                {/* 8. Actions */}
                                <td className="p-3 pr-4 align-middle text-center whitespace-nowrap min-w-[130px]">
                                  <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCalendarModalDate(null);
                                        if (ev.sourceRecord?.lead && onSelectLead) onSelectLead(ev.sourceRecord.lead);
                                        else if (ev.sourceRecord?.order && onSelectLead) onSelectLead(ev.sourceRecord.order);
                                      }}
                                      className="inline-flex items-center justify-center gap-1 h-7 px-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer shadow-sm shrink-0 whitespace-nowrap leading-none"
                                    >
                                      <span>Open Lead</span>
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <td colSpan={8} className="p-3 pr-4 align-middle text-center whitespace-nowrap min-w-[130px]">
                                <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCalendarModalDate(null);
                                      if (ev.sourceRecord?.lead && onSelectLead) onSelectLead(ev.sourceRecord.lead);
                                    }}
                                    className="inline-flex items-center justify-center gap-1 h-7 px-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer shadow-sm shrink-0 whitespace-nowrap leading-none"
                                  >
                                    <span>Open Lead</span>
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};
