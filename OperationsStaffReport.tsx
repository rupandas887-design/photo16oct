import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRole } from './RoleContext';
import { 
  FileText, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Eye, 
  ExternalLink, 
  X, 
  Search, 
  ArrowLeft, 
  Layers, 
  Camera,
  Package,
  Play,
  CheckCircle,
  Filter,
  ChevronDown
} from 'lucide-react';
import { formatDateDDMMYY, formatTime12Hour, resolveStorageUrl } from '../utils';

export type OperationsReportDateFilter = 'This Month' | 'Last Month' | 'Last 3 Months' | 'Custom Date' | null;

/** Convert any date representation to YYYY-MM-DD */
const toYMD = (dateInput?: string | null | Date): string | null => {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return null;
    const y = dateInput.getFullYear();
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(dateInput).trim();
  if (!str || str === '—' || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined') return null;

  // 1. YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. DD MMM YYYY or DD-MMM-YYYY (e.g. "19 Sep 2026", "08 October 2026")
  const MONTHS_MAP: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const dMmmYMatch = str.match(/^(\d{1,2})[\s\-\/\.]*([a-zA-Z]{3,9})[\s\-\/\.,]*(\d{2,4})/);
  if (dMmmYMatch) {
    const d = dMmmYMatch[1].padStart(2, '0');
    const mStr = dMmmYMatch[2].slice(0, 3).toLowerCase();
    const m = MONTHS_MAP[mStr];
    let y = dMmmYMatch[3];
    if (y.length === 2) y = '20' + y;
    if (m) {
      return `${y}-${m}-${d}`;
    }
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    let y = dmyMatch[3];
    if (y.length === 2) y = '20' + y;
    return `${y}-${m}-${d}`;
  }

  // 4. Fallback Date parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
};

/** Compute standard DateRange based on selected preset */
const computePresetRange = (preset: 'This Month' | 'Last Month' | 'Last 3 Months'): { start: string; end: string } => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  if (preset === 'This Month') {
    return {
      start: formatYMD(new Date(year, month, 1)),
      end: formatYMD(new Date(year, month + 1, 0))
    };
  }
  if (preset === 'Last Month') {
    return {
      start: formatYMD(new Date(year, month - 1, 1)),
      end: formatYMD(new Date(year, month, 0))
    };
  }
  // 'Last 3 Months': previous 2 months plus current month
  return {
    start: formatYMD(new Date(year, month - 2, 1)),
    end: formatYMD(new Date(year, month + 1, 0))
  };
};

/** Check if date falls in range */
const isDateInRange = (
  dateStr: string | null | undefined,
  start: string | null,
  end: string | null
): boolean => {
  if (!start && !end) return true;
  if (!dateStr) return false;
  const ymd = toYMD(dateStr);
  if (!ymd) return false;

  if (start && end) {
    const minD = start <= end ? start : end;
    const maxD = start <= end ? end : start;
    return ymd >= minD && ymd <= maxD;
  }
  if (start) {
    return ymd >= start;
  }
  if (end) {
    return ymd <= end;
  }
  return true;
};

interface OperationsStaffReportProps {
  onBack?: () => void;
}

export type UploadStageType = 'equipment_received' | 'event_start' | 'event_end';

export interface EventProofImage {
  id: string;
  url: string;
  title: string;
  uploadType: UploadStageType;
  uploadedDate: string;
  uploadedTime: string;
  rawTimestamp?: string;
}

export interface CategorizedProofsResult {
  equipmentReceivedProofs: EventProofImage[];
  eventStartProofs: EventProofImage[];
  eventEndProofs: EventProofImage[];
  allProofs: EventProofImage[];
}

export interface OperationsReportEvent {
  key: string;
  assignmentId: string;
  orderId: string;
  leadId: string;
  eventId: string;
  eventName?: string;
  customerName: string;
  customerMobile: string;
  eventCategory: string; // ONLY the Event Type
  reportingDate: string; // Formatted date e.g. "19 Sep 2026" or "—"
  rawReportingDate: string;
  reportingTime: string; // Formatted time e.g. "09:30 AM" or "—"
  rawReportingTime: string;
  proofs: EventProofImage[];
  equipmentReceivedProofs: EventProofImage[];
  eventStartProofs: EventProofImage[];
  eventEndProofs: EventProofImage[];
  isCompleted: boolean;
  eventCompleteDate: string; // Formatted date e.g. "19 Sep 2026" or "Not Completed"
  currentStatus: string;
  venue: string;
}

export const OperationsStaffReport: React.FC<OperationsStaffReportProps> = ({ onBack }) => {
  const { 
    currentUser, 
    staff, 
    leads, 
    orders, 
    staffAssignments, 
    leadEquipmentHistory 
  } = useRole();

  // Resolve logged-in operations staff member
  const staffMember = (staff || []).find(s => 
    (s.staff_id && currentUser?.id && s.staff_id === currentUser.id) ||
    (s.id && currentUser?.id && s.id === currentUser.id) ||
    (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) || 
    (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase())
  );
  const staffName = staffMember?.name || currentUser?.name || 'Staff';
  const staffId = staffMember?.staff_id || staffMember?.id || currentUser?.id || '';

  // Local states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress' | 'not_started'>('all');

  // Date Filter state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeFilterType, setActiveFilterType] = useState<OperationsReportDateFilter>(null);
  const [selectedOption, setSelectedOption] = useState<OperationsReportDateFilter>(null);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [appliedDateRange, setAppliedDateRange] = useState<{ start: string; end: string } | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Modals state: Only proof modal for this specific assigned event
  const [selectedProofEvent, setSelectedProofEvent] = useState<OperationsReportEvent | null>(null);
  const [activeProofTab, setActiveProofTab] = useState<'all' | UploadStageType>('all');
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    title: string;
    subtitle?: string;
    timestamp?: string;
  } | null>(null);

  const openProofModal = (eventItem: OperationsReportEvent, initialTab: 'all' | UploadStageType = 'all') => {
    setSelectedProofEvent(eventItem);
    setActiveProofTab(initialTab);
  };

  // Close filter dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewImage) {
          setPreviewImage(null);
        } else if (selectedProofEvent) {
          setSelectedProofEvent(null);
        } else if (isFilterOpen) {
          setIsFilterOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage, selectedProofEvent, isFilterOpen]);

  // Date filter actions
  const handleSelectPreset = (preset: 'This Month' | 'Last Month' | 'Last 3 Months') => {
    const range = computePresetRange(preset);
    setActiveFilterType(preset);
    setSelectedOption(preset);
    setAppliedDateRange(range);
    setIsFilterOpen(false);
  };

  const handleApplyCustomFilter = () => {
    if (customStartDate || customEndDate) {
      setActiveFilterType('Custom Date');
      setAppliedDateRange({
        start: customStartDate ? toYMD(customStartDate) || customStartDate : '',
        end: customEndDate ? toYMD(customEndDate) || customEndDate : ''
      });
      setIsFilterOpen(false);
    }
  };

  const handleClearFilter = () => {
    setActiveFilterType(null);
    setSelectedOption(null);
    setCustomStartDate('');
    setCustomEndDate('');
    setAppliedDateRange(null);
    setIsFilterOpen(false);
  };

  // Clean Order ID helper: returns strictly clean Order ID, never UUIDs or internal IDs
  const getCleanOrderId = (rawOrderId?: string, leadId?: string): string => {
    const val = (rawOrderId || '').trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const isEdr = /^EDR-/i.test(val);

    // If it's already a clean order ID (not UUID, not EDR, not LD-)
    if (val && !isUuid && !isEdr && !/^LD-/i.test(val)) {
      return val;
    }

    if (val && (isUuid || isEdr || /^LD-/i.test(val))) {
      const matched = (orders || []).find(o => 
        o.order_id === val || 
        o.id === val || 
        (leadId && o.lead_id === leadId) || 
        (val.startsWith('LD-') && o.lead_id === val)
      );
      if (matched?.order_id && !/^[0-9a-f]{8}-/i.test(matched.order_id) && !/^EDR-/i.test(matched.order_id)) {
        return matched.order_id;
      }
      if (/^LD-/i.test(val)) {
        return `OR-${val.replace(/^LD-?/i, '')}`;
      }
    }

    if (leadId) {
      const matched = (orders || []).find(o => o.lead_id === leadId);
      if (matched?.order_id && !/^[0-9a-f]{8}-/i.test(matched.order_id) && !/^EDR-/i.test(matched.order_id)) {
        return matched.order_id;
      }
      return `OR-${leadId.replace(/^LD-?/i, '')}`;
    }

    return (val && !isUuid && !isEdr) ? val : 'OR-PENDING';
  };

  // Helper to extract proofs strictly associated with Order -> Event -> Staff -> Upload Type
  const extractProofsForEvent = (
    orderId: string,
    leadId: string,
    eventId: string,
    eventName: string,
    assignmentId: string,
    sa: any,
    isMultiEventOrder: boolean,
    currentStaffName: string,
    currentStaffId: string
  ): CategorizedProofsResult => {
    const eqRecMap = new Map<string, EventProofImage>();
    const evStartMap = new Map<string, EventProofImage>();
    const evEndMap = new Map<string, EventProofImage>();

    const addProofToSection = (
      type: UploadStageType,
      url: string | null | undefined,
      title: string,
      timestamp?: string | null
    ) => {
      if (!url) return;
      const cleanUrl = url.trim();
      if (!cleanUrl || cleanUrl === 'N/A' || cleanUrl === '—') return;
      const resolved = resolveStorageUrl(cleanUrl) || cleanUrl;

      const targetMap = 
        type === 'equipment_received' ? eqRecMap :
        type === 'event_start' ? evStartMap : evEndMap;

      if (targetMap.has(resolved)) return;

      let upDate = '—';
      let upTime = '—';
      if (timestamp && timestamp !== 'N/A' && timestamp !== '—') {
        upDate = formatDateDDMMYY(timestamp) || timestamp;
        upTime = formatTime12Hour(timestamp) || timestamp;
      }

      targetMap.set(resolved, {
        id: `${type}_${targetMap.size}_${cleanUrl.slice(-10)}`,
        url: resolved,
        title: title || (type === 'equipment_received' ? 'Equipment Received Proof' : type === 'event_start' ? 'Event Start Proof' : 'Event End Proof'),
        uploadType: type,
        uploadedDate: upDate,
        uploadedTime: upTime,
        rawTimestamp: timestamp || undefined
      });
    };

    // 1. Direct photo fields on the assignment record
    if (sa) {
      // 1.1 Equipment Received photo
      if (sa.equipment_received_photo) {
        addProofToSection('equipment_received', sa.equipment_received_photo, 'Equipment Received', sa.equipment_received_time);
      }
      // 1.2 Event Start photo
      if (sa.event_start_photo) {
        addProofToSection('event_start', sa.event_start_photo, 'Event Start', sa.event_start_time);
      }
      // 1.3 Event End photo
      if (sa.event_end_photo) {
        addProofToSection('event_end', sa.event_end_photo, 'Event End / Complete', sa.event_end_time);
      }

      // Check sa.proofs JSON object
      if (sa.proofs) {
        let parsedSaProofs: any = null;
        try {
          parsedSaProofs = typeof sa.proofs === 'string' ? JSON.parse(sa.proofs) : sa.proofs;
        } catch (_) {}

        if (parsedSaProofs) {
          if (parsedSaProofs.equipment_received_photo) {
            addProofToSection('equipment_received', parsedSaProofs.equipment_received_photo, 'Equipment Received', parsedSaProofs.equipment_received_time || sa.equipment_received_time);
          }
          if (parsedSaProofs.event_start_photo) {
            addProofToSection('event_start', parsedSaProofs.event_start_photo, 'Event Start', parsedSaProofs.event_start_time || sa.event_start_time);
          }
          if (parsedSaProofs.event_end_photo) {
            addProofToSection('event_end', parsedSaProofs.event_end_photo, 'Event End / Complete', parsedSaProofs.event_end_time || sa.event_end_time);
          }
        }
      }

      // Check sa.proof_photos array if present
      if (sa.proof_photos && Array.isArray(sa.proof_photos)) {
        sa.proof_photos.forEach((p: any) => {
          if (!p?.photoUrl) return;
          const pName = (p.equipmentName || '').toLowerCase();
          if (pName.includes('event start')) {
            addProofToSection('event_start', p.photoUrl, 'Event Start', p.capturedAt);
          } else if (pName.includes('event complete') || pName.includes('event end') || pName.includes('completion')) {
            addProofToSection('event_end', p.photoUrl, 'Event End / Complete', p.capturedAt);
          } else {
            addProofToSection('equipment_received', p.photoUrl, p.equipmentName || 'Equipment Received', p.capturedAt);
          }
        });
      }
    }

    // 2. Photos recorded in leadEquipmentHistory - strictly mapped by Order -> Event -> Staff -> Upload Type
    const normStaff = currentStaffName.trim().toLowerCase();
    const curStaffId = String(currentStaffId || '').trim();
    const curAsgnId = String(assignmentId || '').trim();
    const curEvId = String(eventId || '').trim();
    const curEvName = (eventName || '').trim().toLowerCase();
    const isGenericEv = !curEvId || curEvId === 'ev' || curEvId === 'gen';

    (leadEquipmentHistory || []).forEach(h => {
      // Order ID match
      const matchOrder = (orderId && h.order_id === orderId) || (leadId && h.lead_id === leadId);
      if (!matchOrder) return;

      let parsed: any = {};
      if (h.remarks) {
        try {
          parsed = typeof h.remarks === 'string' ? JSON.parse(h.remarks) : h.remarks;
        } catch (_) {}
      }

      // Staff match (Must belong strictly to this staff member)
      const recordStaff = (h.returned_by || parsed.staff_name || parsed.uploaded_by || '').trim().toLowerCase();
      const recordStaffId = String(parsed.staff_id || '').trim();
      const staffMatches = (recordStaff && normStaff && recordStaff === normStaff) ||
                           (recordStaffId && curStaffId && recordStaffId === curStaffId);
      if (!staffMatches) return;

      // Assignment ID check
      const hAsgnId = String(h.assignment_id || parsed.assignment_id || '').trim();
      if (hAsgnId && curAsgnId && hAsgnId !== curAsgnId) return;

      // Event ID check
      const hEvId = String(h.event_id || parsed.event_id || '').trim();
      const isGenericHEv = !hEvId || hEvId === 'ev' || hEvId === 'gen';
      if (!isGenericEv && !isGenericHEv && hEvId !== curEvId) return;

      // Event Name check
      const hEvName = (h.event_name || parsed.event_name || '').trim().toLowerCase();
      if (hEvName && curEvName && hEvName !== curEvName) return;

      // If multi-event order, discard ambiguous records lacking matching event/assignment identifiers
      if (isMultiEventOrder) {
        const hasSpecificMatch = (hAsgnId && curAsgnId && hAsgnId === curAsgnId) ||
                                 (!isGenericEv && !isGenericHEv && hEvId === curEvId) ||
                                 (hEvName && curEvName && hEvName === curEvName);
        if (!hasSpecificMatch) return;
      }

      const photoUrl = parsed.photo_url || (h as any).photo_url || '';
      if (!photoUrl) return;

      const recTime = parsed.uploaded_at || h.returned_at || h.created_at || null;

      // Exact Upload Type Mapping
      const proofTypeStr = (parsed.proof_type || h.proof_type || '').toLowerCase();
      const eqNameStr = (h.equipment_name || '').toLowerCase();
      const eqStatusStr = (h.equipment_status || '').toLowerCase();
      const assetIdStr = (parsed.asset_id || h.asset_id || '').toLowerCase();

      const isStart = proofTypeStr.includes('event start') || proofTypeStr.includes('event_start') || 
                      eqNameStr.includes('event start') || assetIdStr.includes('event start');

      const isEnd = proofTypeStr.includes('event end') || proofTypeStr.includes('event complete') || 
                    proofTypeStr.includes('event_end') || proofTypeStr.includes('event_complete') ||
                    eqNameStr.includes('event complete') || eqNameStr.includes('event completion') || 
                    eqNameStr.includes('event end') || eqStatusStr.includes('event ended') || eqStatusStr.includes('completed');

      const isRec = proofTypeStr.includes('received') || proofTypeStr.includes('asset collection') || 
                    proofTypeStr.includes('asset_collection') || eqNameStr.includes('asset collection') || 
                    eqNameStr.includes('equipment received') || eqStatusStr.includes('received');

      if (isStart) {
        addProofToSection('event_start', photoUrl, 'Event Start', recTime);
      } else if (isEnd) {
        addProofToSection('event_end', photoUrl, 'Event End / Complete', recTime);
      } else if (isRec || (!isStart && !isEnd)) {
        const itemTitle = h.equipment_name || parsed.proof_type || 'Equipment Received';
        addProofToSection('equipment_received', photoUrl, itemTitle, recTime);
      }
    });

    // 3. Fallback from local storage staffProofs - strictly staff-scoped and event-scoped keys ONLY
    try {
      const saved = localStorage.getItem('staff_equipment_proofs_v2');
      if (saved) {
        const parsedProofs = JSON.parse(saved);
        const staffKey = `${orderId}_${eventId || 'ev'}_${normStaff}`;
        const asgnKey = assignmentId ? `${orderId}_${assignmentId}_${normStaff}` : '';
        const exactStaffKey = assignmentId ? `${orderId}_${eventId || 'ev'}_${assignmentId}_${normStaff}` : '';
        
        const candidateKeys = [exactStaffKey, staffKey, asgnKey].filter(Boolean);
        candidateKeys.forEach(k => {
          const localObj = parsedProofs[k];
          if (localObj) {
            // Equipment Received proofs
            (localObj.equipmentReceivedProofs || []).forEach((p: any) => {
              addProofToSection('equipment_received', p.photoUrl, p.equipmentName || 'Equipment Received', p.capturedAt);
            });
            // Event Start proofs
            (localObj.eventStartProofs || []).forEach((p: any) => {
              const pName = (p.equipmentName || '').toLowerCase();
              if (pName.includes('event start')) {
                addProofToSection('event_start', p.photoUrl, 'Event Start', p.capturedAt);
              } else {
                // Asset collection photo taken at event start
                addProofToSection('equipment_received', p.photoUrl, p.equipmentName || 'Equipment Received', p.capturedAt);
              }
            });
            // Complete / End proofs
            (localObj.completeProofs || []).forEach((p: any) => {
              addProofToSection('event_end', p.photoUrl, 'Event End / Complete', p.capturedAt);
            });
          }
        });
      }
    } catch (_) {}

    const eqArr = Array.from(eqRecMap.values());
    const stArr = Array.from(evStartMap.values());
    const endArr = Array.from(evEndMap.values());

    return {
      equipmentReceivedProofs: eqArr,
      eventStartProofs: stArr,
      eventEndProofs: endArr,
      allProofs: [...eqArr, ...stArr, ...endArr]
    };
  };

  // Helper to extract clean Event Category (Event Type ONLY)
  const getEventCategory = (ev: any, lead: any): string => {
    if (ev) {
      if (ev.event_type === 'Other') {
        return (ev.custom_event_type || 'Other').trim();
      }
      if (ev.event_type && ev.event_type.trim()) {
        return ev.event_type.trim();
      }
      if (ev.event_name && ev.event_name.trim()) {
        return ev.event_name.trim();
      }
    }
    if (lead?.event_type === 'Other') {
      return (lead.custom_event_type || 'Other').trim();
    }
    if (lead?.event_type && lead.event_type.trim()) {
      return lead.event_type.trim();
    }
    return 'Event';
  };

  // Build events STRICTLY assigned to the logged-in Operations Staff member
  const { allEventsList, statusCounts: rawStatusCounts } = useMemo(() => {
    if (!staffName && !staffId && !currentUser?.name) {
      return { allEventsList: [], statusCounts: { total: 0, started: 0, completed: 0, notStarted: 0 } };
    }

    const normStaff = staffName.trim().toLowerCase();
    const normCurUser = (currentUser?.name || '').trim().toLowerCase();

    const isStaffAssigned = (checkName?: string | null, checkId?: string | null): boolean => {
      const n = (checkName || '').trim().toLowerCase();
      if (normStaff && n && n === normStaff) return true;
      if (normCurUser && n && n === normCurUser) return true;
      if (staffId && checkId && String(checkId).trim() === String(staffId).trim()) return true;
      return false;
    };

    // Filter staff assignments specifically belonging to this staff member
    const myAssignments = (staffAssignments || []).filter(sa => {
      if (!sa) return false;
      if (sa.assignment_status === 'Cancelled' || sa.assignment_status === 'Rejected' || sa.task_status === 'Cancelled') {
        return false;
      }
      return isStaffAssigned(sa.staff_name, sa.staff_id);
    });

    const eventsList: OperationsReportEvent[] = [];
    const processedEventKeys = new Set<string>();

    // Gather distinct order / lead contexts that are relevant to this staff member
    const orderMap = new Map<string, { order?: any; lead?: any }>();

    // 1. From my active staff assignments
    myAssignments.forEach(sa => {
      const oId = getCleanOrderId(sa.order_id, sa.lead_id);
      if (!orderMap.has(oId)) {
        const matchedOrd = (orders || []).find(o => o.order_id === sa.order_id || (sa.lead_id && o.lead_id === sa.lead_id));
        const matchedLead = (leads || []).find(l => l.lead_id === (sa.lead_id || matchedOrd?.lead_id));
        orderMap.set(oId, { order: matchedOrd, lead: matchedLead });
      }
    });

    // 2. From leads with events specifically assigned to this staff member
    (leads || []).forEach(l => {
      const evs = (l.events && Array.isArray(l.events)) ? l.events : [];
      const hasMyEvent = evs.some((ev: any) => {
        const assignedNames = ev.assigned_staff_names
          ? ev.assigned_staff_names.split(',').map((n: string) => n.trim().toLowerCase())
          : [];
        const assignedIds = ev.assigned_staff_ids
          ? ev.assigned_staff_ids.split(',').map((id: string) => id.trim())
          : [];
        return assignedNames.some((n: string) => isStaffAssigned(n, null)) ||
               assignedIds.some((id: string) => isStaffAssigned(null, id));
      });
      if (hasMyEvent) {
        const matchedOrd = (orders || []).find(o => o.lead_id === l.lead_id);
        const oId = getCleanOrderId(matchedOrd?.order_id, l.lead_id);
        if (!orderMap.has(oId)) {
          orderMap.set(oId, { order: matchedOrd, lead: l });
        }
      }
    });

    // 3. From orders with events specifically assigned to this staff member
    (orders || []).forEach(o => {
      const evs = (o.events && Array.isArray(o.events)) ? o.events : [];
      const hasMyEvent = evs.some((ev: any) => {
        const assignedNames = ev.assigned_staff_names
          ? ev.assigned_staff_names.split(',').map((n: string) => n.trim().toLowerCase())
          : [];
        const assignedIds = ev.assigned_staff_ids
          ? ev.assigned_staff_ids.split(',').map((id: string) => id.trim())
          : [];
        return assignedNames.some((n: string) => isStaffAssigned(n, null)) ||
               assignedIds.some((id: string) => isStaffAssigned(null, id));
      });
      if (hasMyEvent) {
        const oId = getCleanOrderId(o.order_id, o.lead_id);
        if (!orderMap.has(oId)) {
          const matchedLead = (leads || []).find(l => l.lead_id === o.lead_id);
          orderMap.set(oId, { order: o, lead: matchedLead });
        }
      }
    });

    // Evaluate each order strictly: show ONLY the events actually assigned to this staff member
    orderMap.forEach(({ order, lead }, orderId) => {
      const leadId = lead?.lead_id || order?.lead_id || '';
      const orderEvents: any[] = (lead?.events && Array.isArray(lead.events) && lead.events.length > 0)
        ? lead.events
        : (order?.events && Array.isArray(order.events) && order.events.length > 0)
          ? order.events
          : [];

      if (orderEvents.length > 0) {
        orderEvents.forEach((ev: any, evIdx: number) => {
          const eventId = String(ev.id || ev.event_id || `evt_${evIdx}`);
          const evName = (ev.event_name || ev.custom_event_name || '').trim();
          const evType = (ev.event_type || ev.custom_event_type || '').trim();

          // 1. Check exact staff assignment in myAssignments
          const sa = myAssignments.find(s => {
            if (s.order_id !== orderId && s.lead_id !== leadId) return false;

            // If assignment has an event_id, it MUST match this event's id
            if (s.event_id) {
              return String(s.event_id).trim().toLowerCase() === eventId.toLowerCase();
            }

            // If order only has 1 event, assignment belongs to this single event
            if (orderEvents.length === 1) {
              return true;
            }

            // If multiple events, require exact event_name match
            if (s.event_name && (evName || evType)) {
              const sEv = s.event_name.trim().toLowerCase();
              return (evName && sEv === evName.toLowerCase()) || 
                     (ev.custom_event_name && sEv === ev.custom_event_name.trim().toLowerCase()) ||
                     (evType && sEv === evType.toLowerCase());
            }

            return false;
          });

          // 2. Check in ev.assigned_staff_names / ev.assigned_staff_ids
          const assignedNames = ev.assigned_staff_names
            ? ev.assigned_staff_names.split(',').map((n: string) => n.trim().toLowerCase())
            : [];
          const assignedIds = ev.assigned_staff_ids
            ? ev.assigned_staff_ids.split(',').map((id: string) => id.trim())
            : [];
          const isDirectlyAssigned = assignedNames.some((n: string) => isStaffAssigned(n, null)) ||
                                     assignedIds.some((id: string) => isStaffAssigned(null, id));

          // STRICT FILTER: If not assigned to this staff member, DO NOT SHOW!
          if (!sa && !isDirectlyAssigned) {
            return;
          }

          const uniqueKey = `${orderId}_${eventId}_${sa?.assignment_id || evIdx}`;
          if (processedEventKeys.has(uniqueKey)) return;
          processedEventKeys.add(uniqueKey);

          const customerName = (lead?.customer_name || order?.customer_name || lead?.client_name || 'Client').trim();
          const customerMobile = (lead?.mobile || order?.mobile || '').trim();
          const eventCategory = getEventCategory(ev, lead);

          const rawReportingDate = (
            ev.Reporting_date || 
            ev.reporting_date || 
            (sa as any)?.Reporting_date || 
            (sa as any)?.reporting_date || 
            lead?.Reporting_date || 
            lead?.reporting_date || 
            ev.event_date || 
            sa?.event_date || 
            lead?.event_date || 
            ''
          ).trim();
          const reportingDate = rawReportingDate ? (formatDateDDMMYY(rawReportingDate) || rawReportingDate) : '—';

          const rawReportingTime = (
            ev.reporting_time || 
            ev.Reporting_time || 
            (sa as any)?.reporting_time || 
            (sa as any)?.Reporting_time || 
            lead?.reporting_time || 
            ev.event_start_time || 
            ev.event_time || 
            ''
          ).trim();
          const reportingTime = rawReportingTime ? (formatTime12Hour(rawReportingTime) || rawReportingTime) : '—';

          const assignmentId = sa?.assignment_id || '';
          const isMultiEventOrder = orderEvents.length > 1;
          const { 
            equipmentReceivedProofs, 
            eventStartProofs, 
            eventEndProofs, 
            allProofs 
          } = extractProofsForEvent(
            orderId, 
            leadId, 
            eventId, 
            evName || evType || eventCategory, 
            assignmentId, 
            sa, 
            isMultiEventOrder, 
            staffName, 
            staffId
          );

          const rawStatus = (sa?.task_status || ev?.status || 'Assigned Crew').trim();
          const isCompleted = Boolean(
            sa?.event_end_photo || 
            sa?.event_end_time || 
            eventEndProofs.length > 0 ||
            ['completed', 'event complete', 'event completed', 'closed', 'order closed'].includes(rawStatus.toLowerCase())
          );

          let eventCompleteDate = 'Not Completed';
          if (isCompleted) {
            const rawCompDate = (
              sa?.event_end_time || 
              (sa as any)?.event_complete_date || 
              ev.event_end_date || 
              ev.event_date || 
              lead?.event_end_date || 
              ''
            ).trim();
            eventCompleteDate = rawCompDate ? (formatDateDDMMYY(rawCompDate) || rawCompDate) : 'Completed';
          }

          let currentStatus = rawStatus;
          if (isCompleted && !['completed', 'event complete', 'event completed'].includes(currentStatus.toLowerCase())) {
            currentStatus = 'Completed';
          } else if (!isCompleted && allProofs.length > 0 && ['assigned crew', 'assigned'].includes(currentStatus.toLowerCase())) {
            currentStatus = 'Event Started';
          }

          eventsList.push({
            key: uniqueKey,
            assignmentId,
            orderId,
            leadId,
            eventId,
            eventName: evName || evType || eventCategory,
            customerName,
            customerMobile,
            eventCategory,
            reportingDate,
            rawReportingDate,
            reportingTime,
            rawReportingTime,
            proofs: allProofs,
            equipmentReceivedProofs,
            eventStartProofs,
            eventEndProofs,
            isCompleted,
            eventCompleteDate,
            currentStatus,
            venue: ev.event_location || lead?.event_location || '—'
          });
        });
      } else {
        // Single event order (no events array)
        const sa = myAssignments.find(s => s.order_id === orderId || (leadId && s.lead_id === leadId));

        if (sa) {
          const eventId = sa.event_id || 'ev';
          const uniqueKey = `${orderId}_${eventId}_${sa.assignment_id || 'single'}`;
          if (processedEventKeys.has(uniqueKey)) return;
          processedEventKeys.add(uniqueKey);

          const customerName = (lead?.customer_name || order?.customer_name || lead?.client_name || 'Client').trim();
          const customerMobile = (lead?.mobile || order?.mobile || '').trim();
          const eventCategory = getEventCategory(null, lead);

          const rawReportingDate = (
            (sa as any)?.Reporting_date || 
            (sa as any)?.reporting_date || 
            lead?.Reporting_date || 
            lead?.reporting_date || 
            sa.event_date || 
            lead?.event_date || 
            ''
          ).trim();
          const reportingDate = rawReportingDate ? (formatDateDDMMYY(rawReportingDate) || rawReportingDate) : '—';

          const rawReportingTime = (
            (sa as any)?.reporting_time || 
            (sa as any)?.Reporting_time || 
            lead?.reporting_time || 
            lead?.event_time || 
            ''
          ).trim();
          const reportingTime = rawReportingTime ? (formatTime12Hour(rawReportingTime) || rawReportingTime) : '—';

          const assignmentId = sa.assignment_id || '';
          const { 
            equipmentReceivedProofs, 
            eventStartProofs, 
            eventEndProofs, 
            allProofs 
          } = extractProofsForEvent(
            orderId, 
            leadId, 
            eventId, 
            eventCategory, 
            assignmentId, 
            sa, 
            false, 
            staffName, 
            staffId
          );

          const rawStatus = (sa.task_status || lead?.status || 'Assigned Crew').trim();
          const isCompleted = Boolean(
            sa.event_end_photo || 
            sa.event_end_time || 
            eventEndProofs.length > 0 ||
            ['completed', 'event complete', 'event completed', 'closed', 'order closed'].includes(rawStatus.toLowerCase())
          );

          let eventCompleteDate = 'Not Completed';
          if (isCompleted) {
            const rawCompDate = (
              sa.event_end_time || 
              (sa as any).event_complete_date || 
              lead?.event_end_date || 
              lead?.event_date || 
              ''
            ).trim();
            eventCompleteDate = rawCompDate ? (formatDateDDMMYY(rawCompDate) || rawCompDate) : 'Completed';
          }

          let currentStatus = rawStatus;
          if (isCompleted && !['completed', 'event complete', 'event completed'].includes(currentStatus.toLowerCase())) {
            currentStatus = 'Completed';
          } else if (!isCompleted && allProofs.length > 0 && ['assigned crew', 'assigned'].includes(currentStatus.toLowerCase())) {
            currentStatus = 'Event Started';
          }

          eventsList.push({
            key: uniqueKey,
            assignmentId,
            orderId,
            leadId,
            eventId,
            eventName: eventCategory,
            customerName,
            customerMobile,
            eventCategory,
            reportingDate,
            rawReportingDate,
            reportingTime,
            rawReportingTime,
            proofs: allProofs,
            equipmentReceivedProofs,
            eventStartProofs,
            eventEndProofs,
            isCompleted,
            eventCompleteDate,
            currentStatus,
            venue: lead?.event_location || '—'
          });
        }
      }
    });

    // Also check any standalone myAssignments not captured above
    myAssignments.forEach((sa, saIdx) => {
      const oId = getCleanOrderId(sa.order_id, sa.lead_id);
      const evId = sa.event_id || `asgn_${saIdx}`;
      const uniqueKey = `${oId}_${evId}_${sa.assignment_id || saIdx}`;
      if (processedEventKeys.has(uniqueKey)) return;
      if (Array.from(processedEventKeys).some(k => sa.assignment_id && k.includes(sa.assignment_id))) return;
      processedEventKeys.add(uniqueKey);

      const matchedOrd = (orders || []).find(o => o.order_id === sa.order_id || (sa.lead_id && o.lead_id === sa.lead_id));
      const matchedLead = (leads || []).find(l => l.lead_id === (sa.lead_id || matchedOrd?.lead_id));
      const leadId = matchedLead?.lead_id || matchedOrd?.lead_id || '';

      const customerName = (matchedLead?.customer_name || matchedOrd?.customer_name || matchedLead?.client_name || 'Client').trim();
      const customerMobile = (matchedLead?.mobile || matchedOrd?.mobile || '').trim();
      const eventCategory = (sa.event_name || matchedLead?.event_type || matchedOrd?.event_type || 'Event').trim();

      const rawReportingDate = (
        (sa as any)?.Reporting_date || 
        (sa as any)?.reporting_date || 
        sa.event_date || 
        matchedLead?.Reporting_date || 
        matchedLead?.reporting_date || 
        matchedLead?.event_date || 
        ''
      ).trim();
      const reportingDate = rawReportingDate ? (formatDateDDMMYY(rawReportingDate) || rawReportingDate) : '—';

      const rawReportingTime = (
        (sa as any)?.reporting_time || 
        (sa as any)?.Reporting_time || 
        matchedLead?.reporting_time || 
        matchedLead?.event_time || 
        ''
      ).trim();
      const reportingTime = rawReportingTime ? (formatTime12Hour(rawReportingTime) || rawReportingTime) : '—';

      const assignmentId = sa.assignment_id || '';
      const { 
        equipmentReceivedProofs, 
        eventStartProofs, 
        eventEndProofs, 
        allProofs 
      } = extractProofsForEvent(
        oId, 
        leadId, 
        evId, 
        eventCategory, 
        assignmentId, 
        sa, 
        false, 
        staffName, 
        staffId
      );

      const rawStatus = (sa.task_status || 'Assigned Crew').trim();
      const isCompleted = Boolean(
        sa.event_end_photo || 
        sa.event_end_time || 
        eventEndProofs.length > 0 ||
        ['completed', 'event complete', 'event completed', 'closed', 'order closed'].includes(rawStatus.toLowerCase())
      );

      let eventCompleteDate = 'Not Completed';
      if (isCompleted) {
        const rawCompDate = (
          sa.event_end_time || 
          (sa as any).event_complete_date || 
          matchedLead?.event_end_date || 
          matchedLead?.event_date || 
          ''
        ).trim();
        eventCompleteDate = rawCompDate ? (formatDateDDMMYY(rawCompDate) || rawCompDate) : 'Completed';
      }

      let currentStatus = rawStatus;
      if (isCompleted && !['completed', 'event complete', 'event completed'].includes(currentStatus.toLowerCase())) {
        currentStatus = 'Completed';
      } else if (!isCompleted && allProofs.length > 0 && ['assigned crew', 'assigned'].includes(currentStatus.toLowerCase())) {
        currentStatus = 'Event Started';
      }

      eventsList.push({
        key: uniqueKey,
        assignmentId,
        orderId: oId,
        leadId,
        eventId: evId,
        eventName: eventCategory,
        customerName,
        customerMobile,
        eventCategory,
        reportingDate,
        rawReportingDate,
        reportingTime,
        rawReportingTime,
        proofs: allProofs,
        equipmentReceivedProofs,
        eventStartProofs,
        eventEndProofs,
        isCompleted,
        eventCompleteDate,
        currentStatus,
        venue: matchedLead?.event_location || '—'
      });
    });

    // Calculate metrics across assigned events
    const totalEvents = eventsList.length;
    const completedCount = eventsList.filter(e => e.isCompleted).length;
    const startedCount = eventsList.filter(e => !e.isCompleted && (e.proofs.length > 0 || ['event started', 'in progress', 'equipment received'].includes(e.currentStatus.toLowerCase()))).length;
    const notStartedCount = eventsList.filter(e => !e.isCompleted && e.proofs.length === 0 && !['event started', 'in progress', 'completed'].includes(e.currentStatus.toLowerCase())).length;

    return {
      allEventsList: eventsList,
      statusCounts: {
        total: totalEvents,
        started: startedCount,
        completed: completedCount,
        notStarted: notStartedCount
      }
    };
  }, [staffAssignments, leads, orders, leadEquipmentHistory, staffName, staffId, currentUser]);

  // Date Filtered Events (applies This Month, Last Month, Last 3 Months, or Custom Date)
  const dateFilteredEvents = useMemo(() => {
    if (!appliedDateRange) return allEventsList;
    return allEventsList.filter(item => {
      const dateCandidate = item.rawReportingDate || item.reportingDate || item.eventCompleteDate;
      return isDateInRange(dateCandidate, appliedDateRange.start, appliedDateRange.end);
    });
  }, [allEventsList, appliedDateRange]);

  // Status counts reflecting the filtered data (or all if not filtered)
  const statusCounts = useMemo(() => {
    const list = dateFilteredEvents;
    const totalEvents = list.length;
    const completedCount = list.filter(e => e.isCompleted).length;
    const startedCount = list.filter(e => !e.isCompleted && (e.proofs.length > 0 || ['event started', 'in progress', 'equipment received'].includes(e.currentStatus.toLowerCase()))).length;
    const notStartedCount = list.filter(e => !e.isCompleted && e.proofs.length === 0 && !['event started', 'in progress', 'completed'].includes(e.currentStatus.toLowerCase())).length;

    return {
      total: totalEvents,
      started: startedCount,
      completed: completedCount,
      notStarted: notStartedCount
    };
  }, [dateFilteredEvents]);

  // Filtered events for display based on search & status filter
  const filteredEvents = useMemo(() => {
    return dateFilteredEvents.filter(item => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchOrder = item.orderId.toLowerCase().includes(q);
        const matchCustomer = item.customerName.toLowerCase().includes(q);
        const matchCategory = item.eventCategory.toLowerCase().includes(q);
        if (!matchOrder && !matchCustomer && !matchCategory) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'completed') return item.isCompleted;
        if (statusFilter === 'in_progress') return !item.isCompleted && (item.proofs.length > 0 || item.currentStatus.toLowerCase().includes('started'));
        if (statusFilter === 'not_started') return !item.isCompleted && item.proofs.length === 0;
      }

      return true;
    });
  }, [dateFilteredEvents, searchQuery, statusFilter]);

  // Status badge styling helper
  const getStatusBadgeClass = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('complete') || s === 'closed') {
      return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    }
    if (s.includes('start') || s.includes('progress')) {
      return 'bg-sky-500/15 text-sky-400 border border-sky-500/30';
    }
    if (s.includes('handover') || s.includes('received')) {
      return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    }
    return 'bg-zinc-800 text-zinc-400 border border-zinc-700';
  };

  return (
    <div className="p-4 sm:p-6 bg-black min-h-screen text-white font-sans selection:bg-amber-500/30">
      <div className="max-w-[1400px] mx-auto space-y-6">

        {/* 4 SUMMARY ANALYTIC CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          {/* Card 1: Total Assigned Events */}
          <div className="bg-zinc-950/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                Total Assigned Events
              </span>
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-3">
              {statusCounts.total}
            </div>
            <p className="text-[10px] text-zinc-500 font-mono mt-1">
              Events scheduled for you
            </p>
          </div>

          {/* Card 2: Event Start Completed */}
          <div className="bg-zinc-950/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-sky-400 uppercase tracking-wider">
                Event Started
              </span>
              <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-sky-400 font-mono mt-3">
              {statusCounts.started}
            </div>
            <p className="text-[10px] text-zinc-500 font-mono mt-1">
              Started or in-progress
            </p>
          </div>

          {/* Card 3: Event Complete */}
          <div className="bg-zinc-950/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                Event Complete
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono mt-3">
              {statusCounts.completed}
            </div>
            <p className="text-[10px] text-zinc-500 font-mono mt-1">
              Events completed successfully
            </p>
          </div>

          {/* Card 4: Not Started */}
          <div className="bg-zinc-950/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-zinc-700 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                Not Started
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono mt-3">
              {statusCounts.notStarted}
            </div>
            <p className="text-[10px] text-zinc-500 font-mono mt-1">
              Awaiting kickoff / start
            </p>
          </div>

        </div>

        {/* SEARCH & FILTER CONTROLS */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-950/80 p-3 sm:p-4 rounded-2xl border border-zinc-800">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Order ID, Customer, Event Category..."
              className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-visible pb-1 sm:pb-0 flex-wrap sm:flex-nowrap">
            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'all', label: 'All Orders' },
                { id: 'completed', label: 'Completed' },
                { id: 'in_progress', label: 'In Progress' },
                { id: 'not_started', label: 'Not Started' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    statusFilter === f.id
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* SINGLE Filter button with dropdown/popover */}
            <div className="relative" ref={filterRef}>
              <button
                id="btn_operations_report_filter"
                type="button"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  activeFilterType
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                }`}
                title="Filter by Date"
              >
                <Filter className="w-3.5 h-3.5 text-amber-400" />
                <span>Filter</span>
                {activeFilterType && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">
                    {activeFilterType === 'Custom Date' ? 'Custom' : activeFilterType}
                  </span>
                )}
                <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Filter Popover Dropdown */}
              {isFilterOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-3 sm:p-3.5 z-50 text-xs font-mono space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <div className="flex items-center gap-1.5 text-zinc-200 font-bold font-mono text-xs">
                      <Filter className="w-3.5 h-3.5 text-amber-400" />
                      <span>Date Filter</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {activeFilterType && (
                        <button
                          type="button"
                          onClick={handleClearFilter}
                          className="text-[10px] text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsFilterOpen(false)}
                        className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Close (Esc)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 4 Options: 1. This Month, 2. Last Month, 3. Last 3 Months, 4. Custom Date */}
                  <div className="space-y-1">
                    {(['This Month', 'Last Month', 'Last 3 Months', 'Custom Date'] as const).map((opt) => {
                      const isSelected = activeFilterType === opt || selectedOption === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setSelectedOption(opt);
                            if (opt !== 'Custom Date') {
                              handleSelectPreset(opt);
                            }
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold'
                              : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                          }`}
                        >
                          <span>{opt}</span>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Date Inputs: shown when Custom Date is selected */}
                  {selectedOption === 'Custom Date' && (
                    <div className="space-y-2.5 pt-2.5 border-t border-zinc-800">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Start Date</label>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">End Date</label>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyCustomFilter}
                        disabled={!customStartDate && !customEndDate}
                        className="w-full py-2 rounded-xl text-xs font-mono font-bold bg-amber-500 hover:bg-amber-400 text-black transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                      >
                        Apply Filter
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* REPORT TABLE */}
        <div className="bg-zinc-950/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-zinc-850 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
                📋 Assigned Event Activity & Image Proof Log
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                {filteredEvents.length} {filteredEvents.length === 1 ? 'Event' : 'Events'}
              </span>
              {activeFilterType && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {activeFilterType === 'Custom Date' 
                    ? `Date: ${appliedDateRange?.start || 'Start'} to ${appliedDateRange?.end || 'End'}` 
                    : activeFilterType}
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-zinc-500">
              *Read-only activity log
            </div>
          </div>

          {/* SINGLE SHARED HORIZONTAL SCROLLBAR */}
          <div className="overflow-x-auto touch-pan-x w-full">
            <table className="w-full text-left border-collapse min-w-[1080px]">
              <thead className="bg-zinc-900/80 sticky top-0 z-10">
                <tr className="border-b border-zinc-800 font-mono text-[10px] text-zinc-400 uppercase tracking-wider whitespace-nowrap">
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[110px]">
                    Order ID
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[160px]">
                    Customer Name
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[160px]">
                    Event Category
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[130px]">
                    Reporting Date
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[120px]">
                    Reporting Time
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[130px]">
                    Proof
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[150px]">
                    Event Complete Date
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[130px] text-center">
                    Current Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-xs font-sans">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-500 font-mono text-xs">
                      No matching event assignments found for {staffName}.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((eventItem) => {
                    return (
                      <tr key={eventItem.key} className="hover:bg-zinc-900/40 transition-colors">
                        
                        {/* 1. Order ID */}
                        <td className="px-3.5 py-3 font-mono font-bold text-violet-400 whitespace-nowrap">
                          {eventItem.orderId}
                        </td>

                        {/* 2. Customer Name */}
                        <td className="px-3.5 py-3 whitespace-nowrap font-medium text-white">
                          <div className="font-bold">{eventItem.customerName}</div>
                          {eventItem.customerMobile && (
                            <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                              📞 {eventItem.customerMobile}
                            </div>
                          )}
                        </td>

                        {/* 3. Event Category (Event Type ONLY — strictly assigned event, no +1/+2) */}
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <span className="font-bold text-zinc-200">
                            {eventItem.eventCategory}
                          </span>
                        </td>

                        {/* 4. Reporting Date */}
                        <td className="px-3.5 py-3 font-mono text-xs text-zinc-300 whitespace-nowrap">
                          {eventItem.reportingDate}
                        </td>

                        {/* 5. Reporting Time */}
                        <td className="px-3.5 py-3 font-mono text-xs text-zinc-300 whitespace-nowrap">
                          {eventItem.reportingTime}
                        </td>

                        {/* 6. Proof: Single compact View Proof button */}
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openProofModal(eventItem, 'all')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
                            title="View Proof"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Proof</span>
                          </button>
                        </td>

                        {/* 7. Event Complete Date */}
                        <td className="px-3.5 py-3 font-mono text-xs whitespace-nowrap">
                          <span className={eventItem.eventCompleteDate === 'Not Completed' ? 'text-zinc-500 italic' : 'text-zinc-200 font-bold'}>
                            {eventItem.eventCompleteDate}
                          </span>
                        </td>

                        {/* 8. Current Status */}
                        <td className="px-3.5 py-3 whitespace-nowrap text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${getStatusBadgeClass(eventItem.currentStatus)}`}>
                            {eventItem.currentStatus}
                          </span>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* SINGLE EVENT PROOF MODAL FOR ASSIGNED EVENT */}
      {selectedProofEvent && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedProofEvent(null)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800 bg-zinc-950/90">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold text-white tracking-wide">
                      ORDER: <span className="text-violet-400 font-mono">{selectedProofEvent.orderId}</span>
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-mono text-[11px] font-bold border border-amber-500/30">
                      {selectedProofEvent.eventCategory}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-300 font-mono text-[11px] font-bold border border-sky-500/20">
                      {selectedProofEvent.proofs.length} {selectedProofEvent.proofs.length === 1 ? 'Proof Image' : 'Proof Images'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Customer: <strong className="text-zinc-200">{selectedProofEvent.customerName}</strong>
                    {selectedProofEvent.customerMobile && (
                      <span className="font-mono text-emerald-400 ml-2">📞 {selectedProofEvent.customerMobile}</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProofEvent(null)}
                className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Tabs for Section Browsing */}
            <div className="flex items-center gap-1.5 overflow-x-auto px-4 sm:px-6 pt-3 pb-2.5 border-b border-zinc-800 bg-zinc-950/60">
              <button
                type="button"
                onClick={() => setActiveProofTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  activeProofTab === 'all'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                All Sections ({selectedProofEvent.proofs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveProofTab('equipment_received')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  activeProofTab === 'equipment_received'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                Equipment Received ({selectedProofEvent.equipmentReceivedProofs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveProofTab('event_start')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  activeProofTab === 'event_start'
                    ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                Event Start ({selectedProofEvent.eventStartProofs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveProofTab('event_end')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  activeProofTab === 'event_end'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                Event End ({selectedProofEvent.eventEndProofs.length})
              </button>
            </div>

            {/* Scrollable Proof Content divided strictly into the 3 sections */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
              
              {/* Event Header Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-850">
                <div className="flex items-center gap-2.5">
                  <h4 className="text-sm sm:text-base font-bold text-white tracking-wide">
                    Event — <span className="text-amber-400">{selectedProofEvent.eventCategory}</span>
                  </h4>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                  <span className="text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
                    📅 {selectedProofEvent.reportingDate} • ⏰ {selectedProofEvent.reportingTime}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusBadgeClass(selectedProofEvent.currentStatus)}`}>
                    {selectedProofEvent.currentStatus}
                  </span>
                </div>
              </div>

              {/* SECTION 1: EQUIPMENT RECEIVED */}
              {(activeProofTab === 'all' || activeProofTab === 'equipment_received') && (
                <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-md">
                  <div className="flex items-center justify-between pb-2.5 border-b border-zinc-850">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-emerald-500/15 text-emerald-400">
                        <Package className="w-4 h-4" />
                      </div>
                      <h5 className="text-xs sm:text-sm font-mono font-bold text-zinc-200 tracking-wider uppercase">
                        Equipment Received
                      </h5>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-850 text-zinc-400 border border-zinc-750">
                        {selectedProofEvent.equipmentReceivedProofs.length} {selectedProofEvent.equipmentReceivedProofs.length === 1 ? 'Image' : 'Images'}
                      </span>
                    </div>
                    {selectedProofEvent.equipmentReceivedProofs.length === 0 && (
                      <span className="text-xs font-mono text-zinc-500 italic">Not Uploaded</span>
                    )}
                  </div>

                  {selectedProofEvent.equipmentReceivedProofs.length === 0 ? (
                    <div className="py-6 px-4 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-xl text-center flex flex-col items-center justify-center gap-1.5">
                      <span className="text-xs font-mono font-medium text-zinc-500 italic">
                        Not Uploaded
                      </span>
                      <span className="text-[11px] text-zinc-600 font-sans">
                        No Equipment Received image uploaded for this event
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                      {selectedProofEvent.equipmentReceivedProofs.map((proof, pIdx) => (
                        <div 
                          key={proof.id || pIdx}
                          className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2.5 hover:border-zinc-700 transition-colors shadow-sm"
                        >
                          <div 
                            onClick={() => setPreviewImage({
                              url: proof.url,
                              title: proof.title,
                              subtitle: `1. Equipment Received • ${selectedProofEvent.eventCategory} (${selectedProofEvent.orderId})`,
                              timestamp: proof.rawTimestamp
                            })}
                            className="relative w-full h-44 rounded-lg overflow-hidden bg-black/60 border border-zinc-800 group cursor-pointer"
                            title="Click to view full preview"
                          >
                            <img
                              src={proof.url}
                              alt={proof.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <span className="px-2.5 py-1 rounded-md bg-black/75 text-white text-xs font-mono font-bold flex items-center gap-1 shadow-md">
                                <Eye className="w-3.5 h-3.5" />
                                <span>Zoom</span>
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-xs font-bold text-zinc-200 truncate" title={proof.title}>
                              {proof.title}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1.5 border-t border-zinc-800">
                              <span className="text-zinc-300">📅 {proof.uploadedDate}</span>
                              <span className="text-amber-400">⏰ {proof.uploadedTime}</span>
                            </div>
                          </div>

                          <div className="pt-1 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setPreviewImage({
                                url: proof.url,
                                title: proof.title,
                                subtitle: `1. Equipment Received • ${selectedProofEvent.eventCategory} (${selectedProofEvent.orderId})`,
                                timestamp: proof.rawTimestamp
                              })}
                              className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View Image</span>
                            </button>
                            <a
                              href={proof.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-sky-400 hover:text-sky-300 transition-colors"
                            >
                              <span>Open Full</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 2: EVENT START */}
              {(activeProofTab === 'all' || activeProofTab === 'event_start') && (
                <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-md">
                  <div className="flex items-center justify-between pb-2.5 border-b border-zinc-850">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-sky-500/15 text-sky-400">
                        <Play className="w-4 h-4 fill-sky-400/20" />
                      </div>
                      <h5 className="text-xs sm:text-sm font-mono font-bold text-zinc-200 tracking-wider uppercase">
                        Event Start
                      </h5>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-850 text-zinc-400 border border-zinc-750">
                        {selectedProofEvent.eventStartProofs.length} {selectedProofEvent.eventStartProofs.length === 1 ? 'Image' : 'Images'}
                      </span>
                    </div>
                    {selectedProofEvent.eventStartProofs.length === 0 && (
                      <span className="text-xs font-mono text-zinc-500 italic">Not Uploaded</span>
                    )}
                  </div>

                  {selectedProofEvent.eventStartProofs.length === 0 ? (
                    <div className="py-6 px-4 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-xl text-center flex flex-col items-center justify-center gap-1.5">
                      <span className="text-xs font-mono font-medium text-zinc-500 italic">
                        Not Uploaded
                      </span>
                      <span className="text-[11px] text-zinc-600 font-sans">
                        No Event Start image uploaded for this event
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                      {selectedProofEvent.eventStartProofs.map((proof, pIdx) => (
                        <div 
                          key={proof.id || pIdx}
                          className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2.5 hover:border-zinc-700 transition-colors shadow-sm"
                        >
                          <div 
                            onClick={() => setPreviewImage({
                              url: proof.url,
                              title: proof.title,
                              subtitle: `2. Event Start • ${selectedProofEvent.eventCategory} (${selectedProofEvent.orderId})`,
                              timestamp: proof.rawTimestamp
                            })}
                            className="relative w-full h-44 rounded-lg overflow-hidden bg-black/60 border border-zinc-800 group cursor-pointer"
                            title="Click to view full preview"
                          >
                            <img
                              src={proof.url}
                              alt={proof.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <span className="px-2.5 py-1 rounded-md bg-black/75 text-white text-xs font-mono font-bold flex items-center gap-1 shadow-md">
                                <Eye className="w-3.5 h-3.5" />
                                <span>Zoom</span>
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-xs font-bold text-zinc-200 truncate" title={proof.title}>
                              {proof.title}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1.5 border-t border-zinc-800">
                              <span className="text-zinc-300">📅 {proof.uploadedDate}</span>
                              <span className="text-amber-400">⏰ {proof.uploadedTime}</span>
                            </div>
                          </div>

                          <div className="pt-1 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setPreviewImage({
                                url: proof.url,
                                title: proof.title,
                                subtitle: `2. Event Start • ${selectedProofEvent.eventCategory} (${selectedProofEvent.orderId})`,
                                timestamp: proof.rawTimestamp
                              })}
                              className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View Image</span>
                            </button>
                            <a
                              href={proof.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-sky-400 hover:text-sky-300 transition-colors"
                            >
                              <span>Open Full</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 3: EVENT END / COMPLETE */}
              {(activeProofTab === 'all' || activeProofTab === 'event_end') && (
                <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-md">
                  <div className="flex items-center justify-between pb-2.5 border-b border-zinc-850">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-amber-500/15 text-amber-400">
                        <CheckCircle className="w-4 h-4" />
                      </div>
                      <h5 className="text-xs sm:text-sm font-mono font-bold text-zinc-200 tracking-wider uppercase">
                        Event End
                      </h5>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-855 text-zinc-400 border border-zinc-750">
                        {selectedProofEvent.eventEndProofs.length} {selectedProofEvent.eventEndProofs.length === 1 ? 'Image' : 'Images'}
                      </span>
                    </div>
                    {selectedProofEvent.eventEndProofs.length === 0 && (
                      <span className="text-xs font-mono text-zinc-500 italic">Not Uploaded</span>
                    )}
                  </div>

                  {selectedProofEvent.eventEndProofs.length === 0 ? (
                    <div className="py-6 px-4 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-xl text-center flex flex-col items-center justify-center gap-1.5">
                      <span className="text-xs font-mono font-medium text-zinc-500 italic">
                        Not Uploaded
                      </span>
                      <span className="text-[11px] text-zinc-600 font-sans">
                        No Event End image uploaded for this event
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                      {selectedProofEvent.eventEndProofs.map((proof, pIdx) => (
                        <div 
                          key={proof.id || pIdx}
                          className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2.5 hover:border-zinc-700 transition-colors shadow-sm"
                        >
                          <div 
                            onClick={() => setPreviewImage({
                              url: proof.url,
                              title: proof.title,
                              subtitle: `3. Event End • ${selectedProofEvent.eventCategory} (${selectedProofEvent.orderId})`,
                              timestamp: proof.rawTimestamp
                            })}
                            className="relative w-full h-44 rounded-lg overflow-hidden bg-black/60 border border-zinc-800 group cursor-pointer"
                            title="Click to view full preview"
                          >
                            <img
                              src={proof.url}
                              alt={proof.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <span className="px-2.5 py-1 rounded-md bg-black/75 text-white text-xs font-mono font-bold flex items-center gap-1 shadow-md">
                                <Eye className="w-3.5 h-3.5" />
                                <span>Zoom</span>
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-xs font-bold text-zinc-200 truncate" title={proof.title}>
                              {proof.title}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1.5 border-t border-zinc-800">
                              <span className="text-zinc-300">📅 {proof.uploadedDate}</span>
                              <span className="text-amber-400">⏰ {proof.uploadedTime}</span>
                            </div>
                          </div>

                          <div className="pt-1 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setPreviewImage({
                                url: proof.url,
                                title: proof.title,
                                subtitle: `3. Event End • ${selectedProofEvent.eventCategory} (${selectedProofEvent.orderId})`,
                                timestamp: proof.rawTimestamp
                              })}
                              className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View Image</span>
                            </button>
                            <a
                              href={proof.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-sky-400 hover:text-sky-300 transition-colors"
                            >
                              <span>Open Full</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-3 border-t border-zinc-800 bg-zinc-950/80 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedProofEvent(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL IMAGE ZOOM PREVIEW MODAL */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/80">
              <div>
                <h3 className="text-sm font-bold text-white">{previewImage.title}</h3>
                {previewImage.subtitle && (
                  <p className="text-xs text-zinc-400 mt-0.5">{previewImage.subtitle}</p>
                )}
                {previewImage.timestamp && (
                  <p className="text-[10px] font-mono text-amber-400 mt-1">
                    Captured: {formatDateDDMMYY(previewImage.timestamp)} at {formatTime12Hour(previewImage.timestamp)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer font-bold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-black/50 min-h-[300px]">
              <img
                src={previewImage.url}
                alt="Full Preview"
                referrerPolicy="no-referrer"
                className="max-h-[70vh] max-w-full object-contain rounded-xl shadow-2xl border border-zinc-800"
              />
            </div>

            <div className="p-3 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between text-xs text-zinc-400">
              <span className="font-mono text-[11px] truncate max-w-md">{previewImage.url}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
