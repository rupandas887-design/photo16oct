import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import heic2any from 'heic2any';
import { useRole } from './RoleContext';
import { DashboardGreetingHeader } from './DashboardGreetingHeader';
import { 
  Clock, CheckCircle2, Eye, FileVideo, Play, UserCheck, 
  ShieldCheck, ChevronDown, ChevronUp, Upload, FileText, CheckSquare, Lock, Activity, 
  Link as LinkIcon, AlertCircle, X, Sparkles, Check, MessageSquare, Copy, ExternalLink, RefreshCw,
  User, Phone
} from 'lucide-react';
import { supabaseClient } from '../supabaseClient';
import { EditorAssignment } from '../types';
import { ProjectDetailModal } from './ProjectDetailModal';
import { AddNoteModal } from './AddNoteModal';
import { TimePicker12Hour } from './TimePicker12Hour';
import { ListSortFilter, SortOrder, compareRecordsByDate } from './ui/ListSortFilter';
import { parseQtyAndText, formatQtyItem, deserializeLeadEvents, parseDeliverablesWithQty, uploadProofToStorage, resolveStorageUrl, parseCustomerProof, ParsedCustomerProof, formatDateDDMMYY, triggerAutoScrollAndFocus, processAndCompressImage } from '../utils';

// Format ISO string to DD MMM YYYY (e.g. 12 Sep 2026, 05 Jan 2026)
const formatISTDate = (isoStr?: string | null): string => {
  if (!isoStr) return '';
  return formatDateDDMMYY(isoStr);
};

// Format ISO string to 12-hour AM/PM with seconds in IST (Asia/Kolkata)
const formatISTTime12Hour = (isoStr?: string | null): string => {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d);
  } catch {
    return '';
  }
};

// Floating Action Menu Dropdown using React Portal
interface ActionMenuDropdownProps {
  buttonContent: React.ReactNode;
  buttonClassName?: string;
  dropdownId: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

const ActionMenuDropdown: React.FC<ActionMenuDropdownProps> = ({
  buttonContent,
  buttonClassName,
  dropdownId,
  isOpen,
  onToggle,
  onClose,
  children
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  } | null>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return false;
    const rect = buttonRef.current.getBoundingClientRect();

    // CRITICAL: If button is inside a display:none container (e.g. desktop vs mobile view toggle),
    // rect.width & rect.height will be 0. Do NOT compute coordinates or render portal for hidden buttons!
    if (rect.width === 0 || rect.height === 0) {
      setCoords(null);
      return false;
    }

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Desired dropdown width: max 230px, or screen width minus 24px padding
    const dropdownWidth = Math.min(230, windowWidth - 24);

    const spaceBelow = windowHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estimatedHeight = 220; // estimated max height of dropdown menu

    let top: number | undefined = undefined;
    let bottom: number | undefined = undefined;

    if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
      // Open upward
      bottom = windowHeight - rect.top + 6;
    } else {
      // Open downward
      top = rect.bottom + 6;
    }

    // Calculate horizontal positioning:
    // Default right-aligned to button, clamped within screen margins
    let leftCandidate = rect.right - dropdownWidth;
    let left = Math.max(12, Math.min(leftCandidate, windowWidth - dropdownWidth - 12));

    setCoords({ top, bottom, left, width: dropdownWidth });
    return true;
  }, []);

  // Compute position synchronously BEFORE paint when isOpen changes
  useLayoutEffect(() => {
    if (isOpen) {
      const isVisible = updatePosition();
      if (!isVisible) {
        setCoords(null);
      }
    } else {
      setCoords(null);
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (isOpen && coords) {
      const handleScrollOrResize = (e: Event) => {
        const target = e.target;
        if (target instanceof Node && dropdownRef.current && dropdownRef.current.contains(target)) {
          return;
        }
        updatePosition();
      };

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target;
        if (!target || !(target instanceof Node)) return;
        if (
          buttonRef.current && !buttonRef.current.contains(target) &&
          dropdownRef.current && !dropdownRef.current.contains(target)
        ) {
          onClose();
        }
      };

      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
      document.addEventListener('mousedown', handleClickOutside);

      return () => {
        window.removeEventListener('scroll', handleScrollOrResize, true);
        window.removeEventListener('resize', handleScrollOrResize);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, coords, updatePosition, onClose]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={buttonClassName}
      >
        {buttonContent}
      </button>

      {isOpen && coords !== null && createPortal(
        <div
          ref={dropdownRef}
          id={dropdownId}
          style={{
            position: 'fixed',
            top: coords.top !== undefined ? `${coords.top}px` : 'auto',
            bottom: coords.bottom !== undefined ? `${coords.bottom}px` : 'auto',
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: 'calc(100vh - 32px)',
            zIndex: 99999,
          }}
          className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-y-auto divide-y divide-zinc-800 animate-in fade-in zoom-in-95 text-left font-sans text-xs"
        >
          {children}
        </div>,
        document.body
      )}
    </>
  );
};

// Image compression helper - uses processAndCompressImage with solid white background fill to prevent blackout
const compressImage = async (file: File): Promise<string> => {
  try {
    const processed = await processAndCompressImage(file);
    return processed.dataUrl;
  } catch (err) {
    console.warn('[compressImage] Processing error fallback:', err);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }
};

// Helper to extract Raw Footage Drive Link matching the exact Final Consolidated link from Assign Editor notes / Operations verification
const getRawFootageDriveLink = (assignment: any, prod: any, order: any, lead: any, operations: any[], rawFootage?: any[]): string => {
  if (assignment?.raw_footage_link && typeof assignment.raw_footage_link === 'string' && assignment.raw_footage_link.trim() !== '') {
    return assignment.raw_footage_link.trim();
  }
  if (assignment?.rawFootageLink && typeof assignment.rawFootageLink === 'string' && assignment.rawFootageLink.trim() !== '') {
    return assignment.rawFootageLink.trim();
  }

  const orderId = order?.order_id || prod?.order_id || assignment?.order_id || prod?.tracking_id;
  const leadId = lead?.lead_id || order?.lead_id || prod?.lead_id || assignment?.production_id;
  const trackingId = prod?.tracking_id || assignment?.production_id;
  const eventId = assignment?.event_id || prod?.event_id;

  // Helper to extract URL from notes string, prioritizing "Verified Footage with Consolidated Link:"
  const extractFromNotes = (text?: string | null): string => {
    if (!text || typeof text !== 'string') return '';
    const vMatch = text.match(/Verified\s+Footage\s+with\s+Consolidated\s+Link:\s*(https?:\/\/[^\s\n\r"']+)/i);
    if (vMatch && vMatch[1]) return vMatch[1].trim();

    const cMatch = text.match(/Consolidated\s+(?:Drive\s+)?Link:\s*(https?:\/\/[^\s\n\r"']+)/i);
    if (cMatch && cMatch[1]) return cMatch[1].trim();

    return '';
  };

  // Helper to extract any valid http link from notes
  const extractAnyUrl = (text?: string | null): string => {
    if (!text || typeof text !== 'string') return '';
    const m = text.match(/(https?:\/\/[^\s\n\r"']+)/i);
    return m ? m[1].trim() : '';
  };

  // 1. Check Notes & Remarks first for the Verified Consolidated Link (SAME AS ASSIGN EDITOR POPUP NOTES)
  const noteCandidates = [
    prod?.project_notes,
    prod?.remarks,
    prod?.upload_notes,
    assignment?.notes,
    order?.notes,
    lead?.notes
  ];

  for (const n of noteCandidates) {
    const verified = extractFromNotes(n);
    if (verified) return verified;
  }

  // Match candidate operations records (scoped to exact event_id if present to prevent multi-event mixing)
  const candidateOps = (operations || []).filter(o => {
    if (eventId && eventId !== 'MULTIPLE' && o.event_id && o.event_id === eventId) {
      return !orderId || o.order_id === orderId;
    }
    return (orderId && (o.order_id === orderId || o.lead_id === orderId)) ||
           (leadId && (o.lead_id === leadId || o.order_id === leadId)) ||
           (trackingId && (o.order_id === trackingId || o.lead_id === trackingId)) ||
           (assignment?.production_id && (o.order_id === assignment.production_id || o.lead_id === assignment.production_id));
  });

  for (const op of candidateOps) {
    const fromOpNotes = extractFromNotes(op.remarks) || extractFromNotes(op.upload_notes_remarks) || extractFromNotes((op as any).Upload_Notes_Remarks);
    if (fromOpNotes) return fromOpNotes;
  }

  // Check Raw Footage table upload notes
  const rf = (rawFootage || []).find(f => 
    (orderId && (f.order_id === orderId || f.tracking_id === orderId)) ||
    (trackingId && (f.tracking_id === trackingId || f.order_id === trackingId))
  );
  if (rf?.upload_notes) {
    const fromRfNotes = extractFromNotes(rf.upload_notes);
    if (fromRfNotes) return fromRfNotes;
  }

  // 2. Check explicit final consolidated link columns (Operations & Production)
  for (const op of candidateOps) {
    const consLink = op.consolidated_drive_link || op.Consolidated_Drive_Link;
    if (consLink && typeof consLink === 'string' && consLink.trim() !== '') {
      return consLink.trim();
    }
  }

  const prodConsLink = (prod as any)?.final_consolidated_drive_link || 
                       prod?.consolidated_drive_link || 
                       prod?.Consolidated_Drive_Link;
  if (prodConsLink && typeof prodConsLink === 'string' && prodConsLink.trim() !== '') {
    return prodConsLink.trim();
  }

  if (order?.consolidated_drive_link && typeof order.consolidated_drive_link === 'string' && order.consolidated_drive_link.trim() !== '') {
    return order.consolidated_drive_link.trim();
  }
  if (lead?.consolidated_drive_link && typeof lead.consolidated_drive_link === 'string' && lead.consolidated_drive_link.trim() !== '') {
    return lead.consolidated_drive_link.trim();
  }

  // 3. Check general URLs from notes / remarks
  for (const n of noteCandidates) {
    const anyUrl = extractAnyUrl(n);
    if (anyUrl) return anyUrl;
  }
  for (const op of candidateOps) {
    const anyUrl = extractAnyUrl(op.remarks) || extractAnyUrl(op.upload_notes_remarks) || extractAnyUrl((op as any).Upload_Notes_Remarks);
    if (anyUrl) return anyUrl;
  }

  // 4. Fallback only if no consolidated link exists anywhere
  if (prod?.raw_footage_location && typeof prod.raw_footage_location === 'string' && prod.raw_footage_location.trim() !== '') {
    return prod.raw_footage_location.trim();
  }
  if ((assignment as any)?.drive_link && typeof (assignment as any).drive_link === 'string' && (assignment as any).drive_link.trim() !== '') {
    return (assignment as any).drive_link.trim();
  }
  for (const op of candidateOps) {
    const rawLink = op.raw_footage_drive_link || op.Raw_Footage_Drive_Link;
    if (rawLink && typeof rawLink === 'string' && rawLink.trim() !== '') {
      return rawLink.trim();
    }
  }
  if (rf?.server_path && typeof rf.server_path === 'string' && rf.server_path.trim() !== '') {
    return rf.server_path.trim();
  }
  if (order?.raw_footage_link && typeof order.raw_footage_link === 'string' && order.raw_footage_link.trim() !== '') {
    return order.raw_footage_link.trim();
  }
  if (lead?.raw_footage_link && typeof lead.raw_footage_link === 'string' && lead.raw_footage_link.trim() !== '') {
    return lead.raw_footage_link.trim();
  }

  return '';
};

// Helper to extract events array from lead/order/prod (either directly on events or deserialized from notes_special_customizations)
const getLeadEvents = (lead: any, order?: any, prod?: any): any[] => {
  if (lead?.events && Array.isArray(lead.events) && lead.events.length > 0) {
    return lead.events;
  }
  if (lead?.notes_special_customizations) {
    const deserialized = deserializeLeadEvents(lead.notes_special_customizations);
    if (deserialized.events && Array.isArray(deserialized.events) && deserialized.events.length > 0) {
      return deserialized.events;
    }
  }
  if (order?.events && Array.isArray(order.events) && order.events.length > 0) {
    return order.events;
  }
  if (order?.notes_special_customizations) {
    const deserialized = deserializeLeadEvents(order.notes_special_customizations);
    if (deserialized.events && Array.isArray(deserialized.events) && deserialized.events.length > 0) {
      return deserialized.events;
    }
  }
  if (prod?.events && Array.isArray(prod.events) && prod.events.length > 0) {
    return prod.events;
  }
  return [];
};

// Helper to identify the exact event record in lead.events for an assignment / prod / order
const getTargetEventForAssignment = (lead: any, order: any, prod: any, assignment?: any) => {
  const targetEventId = assignment?.event_id || prod?.event_id;
  const rawEvents = getLeadEvents(lead, order, prod);

  if (rawEvents.length > 0) {
    // 1. Try matching by exact event_id / id
    if (targetEventId !== undefined && targetEventId !== null && String(targetEventId).trim() !== '') {
      const searchStr = String(targetEventId).trim().toLowerCase();
      const matchById = rawEvents.find((ev: any) => 
        (ev.id && String(ev.id).trim().toLowerCase() === searchStr) ||
        (ev.event_id && String(ev.event_id).trim().toLowerCase() === searchStr)
      );
      if (matchById) return matchById;
    }

    // 2. Try matching by event_name or custom_event_name on assignment / prod / order
    const searchName = assignment?.event_name || prod?.custom_event_name || prod?.event_name || order?.custom_event_name || order?.event_name;
    if (searchName && searchName.trim() !== '') {
      const searchLower = searchName.trim().toLowerCase();
      const matchByName = rawEvents.find((ev: any) => 
        (ev.event_name && ev.event_name.trim().toLowerCase() === searchLower) ||
        (ev.custom_event_name && ev.custom_event_name.trim().toLowerCase() === searchLower) ||
        (ev.event_type && ev.event_type.trim().toLowerCase() === searchLower)
      );
      if (matchByName) return matchByName;
    }

    // ONLY return single event if there is exactly 1 event in total
    if (rawEvents.length === 1) {
      return rawEvents[0];
    }
  }

  return null;
};

// Helper to extract resolved Event Name without generic fallback
const getResolvedEventName = (lead: any, order: any, prod: any, assignment?: any): string => {
  const targetEv = getTargetEventForAssignment(lead, order, prod, assignment);
  if (targetEv) {
    if (targetEv.event_name === 'Other') {
      return targetEv.custom_event_name || 'Other';
    }
    if (targetEv.custom_event_name && targetEv.custom_event_name.trim() !== '') {
      return targetEv.custom_event_name;
    }
    if (targetEv.event_name && targetEv.event_name.trim() !== '') {
      return targetEv.event_name;
    }
    const eType = targetEv.event_type === 'Other' ? targetEv.custom_event_type : targetEv.event_type;
    if (eType && eType.trim() !== '') {
      return eType;
    }
  }

  const candidate = (
    lead?.custom_event_name ||
    (lead?.event_name && lead.event_name !== 'Other' ? lead.event_name : null) ||
    (order?.event_name && order.event_name !== 'Other' ? order.event_name : null) ||
    order?.custom_event_name ||
    (lead?.event_type === 'Other' ? lead?.custom_event_type : lead?.event_type) ||
    order?.event_type ||
    prod?.event_name ||
    ''
  ).toString().trim();

  if (candidate && candidate !== 'Project' && candidate !== 'Other' && candidate !== 'Unnamed Event') {
    return candidate;
  }

  return 'N/A';
};

// Helper to extract resolved Event Type from Sales Step 2 records
const getResolvedEventType = (lead: any, order: any, prod: any, assignment?: any): string => {
  const targetEv = getTargetEventForAssignment(lead, order, prod, assignment);
  if (targetEv) {
    if (targetEv.event_type === 'Other') {
      return targetEv.custom_event_type || 'Other';
    }
    if (targetEv.event_type && targetEv.event_type.trim() !== '') {
      return targetEv.event_type;
    }
  }

  const candidate = (
    (lead?.event_type === 'Other' ? lead?.custom_event_type : lead?.event_type) ||
    order?.event_type ||
    prod?.event_type ||
    ''
  ).toString().trim();

  return candidate || 'N/A';
};

// Helper to extract exact deliverable quantity saved for an assigned deliverable
const getAssignedDeliverableQty = (
  assignment: any,
  targetEvent: any,
  lead: any,
  order: any,
  prod: any,
  quotationsList: any[]
): number => {
  if (!assignment) return 1;

  const rawSpeciality = (
    assignment.speciality ||
    assignment.deliverable_id ||
    assignment.deliverable ||
    ''
  ).toString().trim();

  // 1. Direct check: If assignment speciality itself starts with or contains quantity (e.g. "2 x Photobook Album", "2 × Photobook Album", "Photobook Album - Qty: 2")
  const directParsed = parseQtyAndText(rawSpeciality);
  if (directParsed.qty > 1) {
    return directParsed.qty;
  }

  // 2. Direct property on assignment if present
  if (typeof (assignment as any).qty === 'number' && (assignment as any).qty > 0) {
    return (assignment as any).qty;
  }
  if (typeof (assignment as any).quantity === 'number' && (assignment as any).quantity > 0) {
    return (assignment as any).quantity;
  }

  const cleanSpeciality = (directParsed.text || rawSpeciality).trim();
  if (!cleanSpeciality) return 1;

  const targetEventId = targetEvent?.id || targetEvent?.event_id || assignment.event_id || prod?.event_id;
  const targetEventName = targetEvent?.event_name || targetEvent?.custom_event_name || targetEvent?.event_type || getResolvedEventName(lead, order, prod, assignment);

  let eventDeliverablesList: { name: string; qty: number }[] = [];

  // 3. Extract deliverables directly from targetEvent (from lead.events / order.events / prod.events)
  if (targetEvent && targetEvent.deliverables) {
    if (Array.isArray(targetEvent.deliverables)) {
      eventDeliverablesList = parseDeliverablesWithQty(JSON.stringify(targetEvent.deliverables));
    } else if (typeof targetEvent.deliverables === 'string') {
      eventDeliverablesList = parseDeliverablesWithQty(targetEvent.deliverables);
    }
  }

  // 4. If targetEvent has no deliverables, parse deliverables_description from order, lead, or quotation
  if (eventDeliverablesList.length === 0) {
    let deliverablesText = order?.deliverables_description || lead?.deliverables_description || (prod as any)?.deliverables_description || '';
    
    if (!deliverablesText && lead) {
      const targetLeadQuotes = (quotationsList || []).filter((q: any) => q.lead_id === lead.lead_id);
      targetLeadQuotes.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      if (targetLeadQuotes[0]) {
        deliverablesText = targetLeadQuotes[0].deliverables_description || targetLeadQuotes[0].deliverables || '';
      }
    }

    if (deliverablesText) {
      eventDeliverablesList = parseDeliverablesWithQty(deliverablesText, targetEventName, targetEventId);
    }
  }

  // 5. Fallback: check general package deliverables on lead, order
  if (eventDeliverablesList.length === 0) {
    const fallbackText = lead?.deliverables || order?.deliverables || '';
    if (fallbackText) {
      eventDeliverablesList = parseDeliverablesWithQty(fallbackText, targetEventName, targetEventId);
    }
  }

  // 6. Match cleanSpeciality against items in eventDeliverablesList
  if (eventDeliverablesList.length > 0) {
    const normSearch = cleanSpeciality.toLowerCase();

    // 6a. Exact clean name match
    const exactMatch = eventDeliverablesList.find(d => {
      const normD = parseQtyAndText(d.name).text.trim().toLowerCase();
      return normD === normSearch || d.name.trim().toLowerCase() === normSearch;
    });
    if (exactMatch && exactMatch.qty > 0) {
      return exactMatch.qty;
    }

    // 6b. Partial / substring match
    const substringMatch = eventDeliverablesList.find(d => {
      const normD = parseQtyAndText(d.name).text.trim().toLowerCase();
      return (normD && normSearch.includes(normD)) || (normSearch && normD.includes(normSearch));
    });
    if (substringMatch && substringMatch.qty > 0) {
      return substringMatch.qty;
    }
  }

  return 1;
};

export const ProductionStaffModule: React.FC = () => {
  const { 
    currentRole,
    currentUser, 
    staff, 
    productionStaff,
    leads, 
    orders, 
    operations, 
    production,
    rawFootage,
    editorAssignments, 
    quotations,
    updateEditorAssignment,
    updateEditorAssignmentStatus, 
    updateProduction,
    updateOrderStage,
    updateLead,
    pushUpdate,
    refreshData,
    clientAcceptanceVerifications = [],
    saveClientAcceptanceVerification
  } = useRole();

  // Resolve production staff member
  const prodStaffMember = (productionStaff || []).find(s => 
    (s.staff_id && currentUser?.id && s.staff_id === currentUser.id) ||
    (s.auth_user_id && currentUser?.id && s.auth_user_id === currentUser.id) ||
    ((s as any).id && currentUser?.id && (s as any).id === currentUser.id) ||
    (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) || 
    (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
    (s.name && currentUser?.name && s.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
  );
  const opStaffMember = (staff || []).find(s => 
    (s.staff_id && currentUser?.id && s.staff_id === currentUser.id) ||
    (s.auth_user_id && currentUser?.id && s.auth_user_id === currentUser.id) ||
    ((s as any).id && currentUser?.id && (s as any).id === currentUser.id) ||
    (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) || 
    (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
    (s.name && currentUser?.name && s.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
  );
  const resolvedStaffId = prodStaffMember?.staff_id || opStaffMember?.staff_id || currentUser?.id;
  const staffName = prodStaffMember?.name || opStaffMember?.name || currentUser?.name || 'Staff';
  const staffMobile = prodStaffMember?.mobile || opStaffMember?.mobile || currentUser?.mobile || '';
  const isProdStaff = currentRole === 'Production Staff' || currentUser?.role === 'Production Staff' || !currentRole || currentRole === 'Operation Staff';
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [noteModalData, setNoteModalData] = useState<{ leadId: string, orderId?: string, customerName: string } | null>(null);
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);

  const toggleOrderDetails = (orderId: string) => {
    setExpandedOrderIds(prev => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  // Selected project for ProjectDetailModal
  const [selectedProjectForDetail, setSelectedProjectForDetail] = useState<{ orderId: string; eventId?: string } | string | null>(null);

  // Modal States for Production Workflow
  // 1. Editing Started Modal
  const [editingStartedModal, setEditingStartedModal] = useState<{group: any, actionItem: any} | null>(null);
  const [editingStartedForm, setEditingStartedForm] = useState<{
    expected_delivery_date: string;
    estimated_completion_date: string;
    estimated_completion_time: string;
    selectedIds: string[];
  }>({ 
    expected_delivery_date: '',
    estimated_completion_date: '', 
    estimated_completion_time: '',
    selectedIds: []
  });

  // Helper to strictly format any date to DD MMM YYYY (e.g. 12 Sep 2026, 05 Jan 2026)
  const formatDateToDDMMYY = (dateStr?: string | null | Date): string => {
    if (!dateStr && (dateStr as any) !== 0) return '';
    return formatDateDDMMYY(dateStr) || String(dateStr);
  };

  // 2. Customer Review Modal
  const [customerReviewModal, setCustomerReviewModal] = useState<{group: any, actionItem: any} | null>(null);
  const [customerReviewForm, setCustomerReviewForm] = useState<{
    edited_drive_link: string;
    customer_review_image: string;
    selectedIds: string[];
    server_upload_confirmed: boolean;
    server_upload_event_date: string;
    server_upload_folder_name: string;
    event_configs: Record<string, { eventKey: string; eventId: string; eventName: string; eventDate: string; folderName: string; confirmed: boolean; isSaved: boolean; confirmedAt?: string }>;
  }>({ 
    edited_drive_link: '', 
    customer_review_image: '',
    selectedIds: [],
    server_upload_confirmed: false,
    server_upload_event_date: '',
    server_upload_folder_name: '',
    event_configs: {}
  });

  const openCustomerReviewModal = (grp: any, delivItem: any) => {
    const eventConfigs: Record<string, { eventKey: string; eventId: string; eventName: string; eventDate: string; folderName: string; confirmed: boolean; isSaved: boolean; confirmedAt?: string }> = {};
    const orderId = grp.orderId || (delivItem as any).orderId || grp.leadId || '';
    const cleanOrdId = String(orderId).trim().toLowerCase();

    (grp.deliverables || []).forEach((item: any) => {
      const evtKey = item.assignmentId;
      if (!eventConfigs[evtKey]) {
        const cleanEvtId = String(item.eventId || item.eventName || 'default').trim().toLowerCase();
        const savedVerif = (clientAcceptanceVerifications || []).find(v => {
          const vOrd = String(v.order_id || '').trim().toLowerCase();
          const vTask = String((v as any).task_id || (v as any).assignment_id || '').trim().toLowerCase();
          const delivTaskId = String(item.assignmentId || '').trim().toLowerCase();
          if (cleanOrdId && vOrd === cleanOrdId && vTask && delivTaskId && vTask === delivTaskId) {
            return true;
          }
          return false;
        });

        const existingConfirmed = Boolean(
          savedVerif?.consent_proof_verified ||
          item.serverUploadConfirmed ||
          item.assignmentObj?.server_upload_confirmed ||
          item.assignmentObj?.edited_folder_uploaded_to_server ||
          item.prodObj?.server_upload_confirmed
        );
        const rawDate = (
          item.serverUploadEventDate ||
          item.assignmentObj?.server_upload_event_date ||
          item.prodObj?.server_upload_event_date ||
          item.eventDate ||
          grp.eventDate ||
          ''
        ).trim();
        const existingEventDate = formatDateToDDMMYY(rawDate) || rawDate;
        const existingFolderName = (
          savedVerif?.folder_name ||
          item.serverUploadFolderName ||
          item.assignmentObj?.server_upload_folder_name ||
          item.prodObj?.server_upload_folder_name ||
          ''
        ).trim();

        eventConfigs[evtKey] = {
          eventKey: evtKey,
          eventId: item.eventId || '',
          eventName: `${item.eventName || grp.eventName || 'Event'} - ${item.deliverableName || item.speciality || 'Task'}`,
          eventDate: existingEventDate,
          folderName: existingFolderName,
          confirmed: existingConfirmed,
          isSaved: existingConfirmed && Boolean(existingFolderName),
          confirmedAt: savedVerif?.updated_at || item.serverUploadConfirmedAt || item.assignmentObj?.server_upload_confirmed_at || ''
        };
      }
    });

    const currentEvtKey = delivItem.assignmentId;
    const currentCfg = eventConfigs[currentEvtKey] || {
      eventKey: currentEvtKey,
      eventId: delivItem.eventId || '',
      eventName: `${delivItem.eventName || grp.eventName || 'Event'} - ${delivItem.deliverableName || delivItem.speciality || 'Task'}`,
      eventDate: formatDateToDDMMYY(delivItem.eventDate || grp.eventDate || '') || (delivItem.eventDate || grp.eventDate || ''),
      folderName: (delivItem.serverUploadFolderName || delivItem.assignmentObj?.server_upload_folder_name || '').trim(),
      confirmed: Boolean(delivItem.serverUploadConfirmed || delivItem.assignmentObj?.server_upload_confirmed),
      isSaved: Boolean(delivItem.serverUploadConfirmed && (delivItem.serverUploadFolderName || delivItem.assignmentObj?.server_upload_folder_name)),
      confirmedAt: ''
    };

    const savedTargetVerif = (clientAcceptanceVerifications || []).find(v => {
      const vOrd = String(v.order_id || '').trim().toLowerCase();
      const vTask = String((v as any).task_id || (v as any).assignment_id || '').trim().toLowerCase();
      const delivTaskId = String(delivItem.assignmentId || '').trim().toLowerCase();
      if (cleanOrdId && vOrd === cleanOrdId && vTask && delivTaskId && vTask === delivTaskId) {
        return true;
      }
      return false;
    });

    const taskProofCandidate = (
      delivItem.assignmentObj?.confirmation_proof ||
      delivItem.assignmentObj?.customer_review_image ||
      delivItem.assignmentObj?.customer_communication_proof ||
      delivItem.assignmentObj?.client_communication_proof ||
      delivItem.assignmentObj?.proof_url ||
      delivItem.assignmentObj?.proof_image ||
      delivItem.assignmentObj?.uploaded_proof ||
      (savedTargetVerif ? savedTargetVerif.client_communication_consent_proof : '') ||
      ''
    ).trim();

    const existingImage = taskProofCandidate;
    const existingEditedLink = (
      savedTargetVerif?.upload_link_path ||
      delivItem.editedDriveLink || 
      delivItem.assignmentObj?.edited_drive_link || 
      delivItem.assignmentObj?.Edited_Drive_Link || 
      ''
    ).trim();

    setCustomerReviewModal({ group: grp, actionItem: delivItem });
    setCustomerReviewForm({
      edited_drive_link: existingEditedLink,
      customer_review_image: existingImage,
      selectedIds: [delivItem.assignmentId],
      server_upload_confirmed: currentCfg.confirmed,
      server_upload_event_date: currentCfg.eventDate,
      server_upload_folder_name: currentCfg.folderName || '',
      event_configs: eventConfigs
    });
  };

  // WhatsApp Popup Modal (2nd Popup immediately after Customer Review save)
  const [whatsappModal, setWhatsappModal] = useState<{
    customerName: string;
    eventName: string;
    driveLink: string;
    phone: string;
    message: string;
  } | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // 3. Editing Completed Modal
  const [editingCompletedModal, setEditingCompletedModal] = useState<{group: any, actionItem: any} | null>(null);
  const [editingCompletedForm, setEditingCompletedForm] = useState<{
    confirmation_proof: string;
    selectedIds: string[];
    server_upload_confirmed: boolean;
    server_upload_event_date: string;
    server_upload_folder_name: string;
    event_configs: Record<string, { eventKey: string; eventId: string; eventName: string; eventDate: string; folderName: string; confirmed: boolean; serverFileLink?: string }>;
  }>({ 
    confirmation_proof: '', 
    selectedIds: [],
    server_upload_confirmed: false,
    server_upload_event_date: '',
    server_upload_folder_name: '',
    event_configs: {}
  });
  const [previewProofModal, setPreviewProofModal] = useState<{ url: string; title: string; uploadTime?: string | null } | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');

  useEffect(() => {
    if (previewProofModal) {
      // Increased delay to 300ms
      triggerAutoScrollAndFocus('#staff_proof_preview_card', 300);
    }
  }, [previewProofModal]);

  const openEditingCompletedModal = (grp: any, delivItem: any) => {
    const eventConfigs: Record<string, { eventKey: string; eventId: string; eventName: string; eventDate: string; folderName: string; confirmed: boolean; serverFileLink?: string }> = {};
    const orderId = grp.orderId || (delivItem as any).orderId || grp.leadId || '';
    const cleanOrdId = String(orderId).trim().toLowerCase();

    (grp.deliverables || []).forEach((item: any) => {
      const evtKey = item.assignmentId;
      if (!eventConfigs[evtKey]) {
        const cleanEvtId = String(item.eventId || item.eventName || 'default').trim().toLowerCase();
        const savedVerif = (clientAcceptanceVerifications || []).find(v => {
          const vOrd = String(v.order_id || '').trim().toLowerCase();
          const vTask = String((v as any).task_id || (v as any).assignment_id || '').trim().toLowerCase();
          const delivTaskId = String(item.assignmentId || '').trim().toLowerCase();
          if (cleanOrdId && vOrd === cleanOrdId && vTask && delivTaskId && vTask === delivTaskId) {
            return true;
          }
          return false;
        });

        const existingFolderName = (
          item.assignmentObj?.server_upload_folder_name ||
          item.assignmentObj?.folder_name ||
          item.serverUploadFolderName ||
          savedVerif?.folder_name ||
          ''
        ).trim();
        const existingServerFileLink = (
          item.assignmentObj?.server_file_link ||
          item.assignmentObj?.upload_link ||
          item.assignmentObj?.upload_link_path ||
          savedVerif?.upload_link_path ||
          ''
        ).trim();
        const existingConfirmed = Boolean(
          savedVerif?.consent_proof_verified ||
          item.serverUploadConfirmed ||
          item.assignmentObj?.server_upload_confirmed ||
          item.assignmentObj?.edited_folder_uploaded_to_server ||
          (existingFolderName.length > 0 && existingServerFileLink.length > 0)
        );
        const rawEvtDate = (
          item.serverUploadEventDate ||
          item.assignmentObj?.server_upload_event_date ||
          item.eventDate ||
          grp.eventDate ||
          ''
        ).trim();
        const existingEventDate = formatDateToDDMMYY(rawEvtDate) || rawEvtDate;

        eventConfigs[evtKey] = {
          eventKey: evtKey,
          eventId: item.eventId || '',
          eventName: `${item.eventName || grp.eventName || 'Event'} - ${item.deliverableName || item.speciality || 'Task'}`,
          eventDate: existingEventDate,
          folderName: existingFolderName,
          confirmed: existingConfirmed,
          serverFileLink: existingServerFileLink
        };
      }
    });

    const currentEvtKey = delivItem.assignmentId;
    const currentCfg = eventConfigs[currentEvtKey] || {
      eventKey: currentEvtKey,
      eventId: delivItem.eventId || '',
      eventName: `${delivItem.eventName || grp.eventName || 'Event'} - ${delivItem.deliverableName || delivItem.speciality || 'Task'}`,
      eventDate: formatDateToDDMMYY(delivItem.eventDate || grp.eventDate || '') || (delivItem.eventDate || grp.eventDate || ''),
      folderName: '',
      confirmed: false,
      serverFileLink: ''
    };

    const savedTargetVerif = (clientAcceptanceVerifications || []).find(v => {
      const vOrd = String(v.order_id || '').trim().toLowerCase();
      const vTask = String((v as any).task_id || (v as any).assignment_id || '').trim().toLowerCase();
      const delivTaskId = String(delivItem.assignmentId || '').trim().toLowerCase();
      if (cleanOrdId && vOrd === cleanOrdId && vTask && delivTaskId && vTask === delivTaskId) {
        return true;
      }
      return false;
    });

    const taskProofCandidate = (
      delivItem.assignmentObj?.confirmation_proof ||
      delivItem.assignmentObj?.customer_communication_proof ||
      delivItem.assignmentObj?.client_communication_proof ||
      delivItem.assignmentObj?.customer_review_image ||
      delivItem.assignmentObj?.proof_url ||
      delivItem.assignmentObj?.proof_image ||
      delivItem.assignmentObj?.uploaded_proof ||
      (savedTargetVerif ? savedTargetVerif.client_communication_consent_proof : '') ||
      ''
    ).trim();

    const existingProof = taskProofCandidate;

    setEditingCompletedModal({ group: grp, actionItem: delivItem });
    setEditingCompletedForm({
      confirmation_proof: existingProof,
      selectedIds: [delivItem.assignmentId],
      server_upload_confirmed: currentCfg.confirmed,
      server_upload_event_date: currentCfg.eventDate,
      server_upload_folder_name: currentCfg.folderName,
      event_configs: eventConfigs
    });
  };

  // Auto-scroll popup/modal into view whenever ANY modal popup is opened from Production Staff Dashboard
  useEffect(() => {
    if (
      editingStartedModal ||
      customerReviewModal ||
      whatsappModal ||
      editingCompletedModal ||
      selectedProjectForDetail
    ) {
      const timer = setTimeout(() => {
        let activeEl: HTMLElement | null = null;

        if (editingStartedModal) {
          activeEl = document.getElementById('editing_started_modal_card');
        } else if (customerReviewModal) {
          activeEl = document.getElementById('customer_review_modal_card');
        } else if (whatsappModal) {
          activeEl = document.getElementById('whatsapp_modal_card');
        } else if (editingCompletedModal) {
          activeEl = document.getElementById('editing_completed_modal_card');
        } else if (selectedProjectForDetail) {
          activeEl = document.getElementById('project_detail_modal_card') || document.getElementById('project_detail_master_modal');
        }

        // Fallback search for any active popup/dialog
        if (!activeEl) {
          activeEl = document.querySelector(
            '#editing_started_modal_card, #customer_review_modal_card, #whatsapp_modal_card, #editing_completed_modal_card, #project_detail_modal_card, [role="dialog"]'
          ) as HTMLElement;
        }

        if (activeEl) {
          const rect = activeEl.getBoundingClientRect();
          const windowHeight = window.innerHeight || document.documentElement.clientHeight;
          const windowWidth = window.innerWidth || document.documentElement.clientWidth;

          // Check if popup/element is already fully within the visible viewport
          const isFullyVisible = (
            rect.top >= 8 &&
            rect.left >= 8 &&
            rect.bottom <= (windowHeight - 8) &&
            rect.right <= (windowWidth - 8)
          );

          if (!isFullyVisible) {
            activeEl.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [
    editingStartedModal,
    customerReviewModal,
    whatsappModal,
    editingCompletedModal,
    selectedProjectForDetail
  ]);



  // Build assigned bookings list grouped by Order/Event for logged in assigned editor
  const activeBookings = useMemo(() => {
    if (!resolvedStaffId && !staffName && !currentUser?.id) return [];

    // Strict filter: ONLY tasks assigned to THIS staff member
    const myAssignments = editorAssignments.filter(ea => {
      const matchId = (resolvedStaffId && ea.staff_id && ea.staff_id === resolvedStaffId) ||
                      (currentUser?.id && ea.staff_id && ea.staff_id === currentUser.id);
      const matchName = (staffName && ea.staff_name && ea.staff_name.trim().toLowerCase() === staffName.trim().toLowerCase()) ||
                        (currentUser?.name && ea.staff_name && ea.staff_name.trim().toLowerCase() === currentUser.name.trim().toLowerCase());
      return matchId || matchName;
    });

    const individualDeliverables: any[] = [];
    myAssignments.forEach(assignment => {
        // Resolve production, order, and lead records flexibly
        const prod = production.find(p => 
          p.production_id === assignment.production_id || 
          p.tracking_id === assignment.production_id || 
          p.order_id === assignment.production_id || 
          p.lead_id === assignment.production_id ||
          p.production_id === `PRD-${assignment.production_id}`
        );
        
        const orderIdToFind = assignment.order_id || prod?.order_id || prod?.tracking_id || assignment.production_id;
        const leadIdToFind = prod?.lead_id || prod?.tracking_id || assignment.production_id;

        let order = orders.find(o => o.order_id === orderIdToFind || o.order_id === assignment.production_id);
        if (!order) {
          order = orders.find(o => o.lead_id === leadIdToFind || o.lead_id === assignment.production_id);
        }

        let lead = leads.find(l => l.lead_id === leadIdToFind || l.lead_id === order?.lead_id || l.lead_id === assignment.production_id);
        if (!lead && order) {
          lead = leads.find(l => l.lead_id === order.lead_id);
        }
        
        // Determine unified status
        let currentStatus = assignment.status || 'Assigned Editor';

        const excludedStatuses = ['Editing Completed', 'Editing Complete', 'Client Acceptance', 'Client Accepted', 'Business Owner Review', 'Project Completed', 'Completed', 'Order Closed', 'Closed'];
        const operationsOnlyStages = ['Order Confirmed', 'Confirm Order', 'New Order', 'Operations Assigned', 'Assigned Crew', 'Staff Assigned', 'Event Scheduled', 'Event Started', 'Event Completed', 'Event Ended', 'Footage Handover'];

        // Exclude deliverables that are complete on an individual assignment basis,
        // or if the overall order is completely finalized/closed.
        const isOrderFinalized = order && ['Business Owner Review', 'Project Completed', 'Completed', 'Order Closed', 'Closed'].includes(order.current_stage);
        const isProdFinalized = prod && ['Business Owner Review', 'Project Completed', 'Completed', 'Order Closed', 'Closed'].includes(prod.editing_status);

        if (excludedStatuses.includes(currentStatus) || isOrderFinalized || isProdFinalized) {
          return;
        }

        if (order && operationsOnlyStages.includes(order.current_stage) && (!prod || !['Verified Footage', 'Footage Handover Verified', 'Raw Footage Received', 'Assigned Editor', 'Editor Assigned', 'Editing Started', 'Customer Review', 'Editing Completed'].includes(prod.editing_status))) {
          return;
        }

        // Raw Footage Drive Link resolution across Operations / Raw Footage / Production / Assignment sources
        const rawFootageLink = getRawFootageDriveLink(assignment, prod, order, lead, operations, rawFootage);

        // Event Name, Type & Date resolution across Lead / Order / Production sources
        const targetEvent = getTargetEventForAssignment(lead, order, prod, assignment);
        const eventName = getResolvedEventName(lead, order, prod, assignment);
        const eventType = getResolvedEventType(lead, order, prod, assignment);
        const eventDate = (targetEvent?.event_date || lead?.events?.[0]?.event_date || lead?.event_date || order?.event_date || prod?.event_date || '').trim();
        const eventId = targetEvent?.id || targetEvent?.event_id || assignment.event_id || prod?.event_id || null;

        // Customer details resolution
        const customerName = (lead?.customer_name || order?.customer_name || prod?.customer_name || 'Client').trim();
        const customerMobile = (lead?.mobile || order?.customer_phone || prod?.customer_mobile || '').trim();

        // Edited Drive Link resolution
        const editedDriveLink = (assignment.Edited_Drive_Link || assignment.edited_drive_link || '').trim();

        // Visually upgrade currentStatus to Customer Review only if prior to Customer Review and a link was uploaded
        if (editedDriveLink && !['Client Acceptance', 'Editing Completed', 'Editing Complete', 'Completed'].includes(currentStatus) && !excludedStatuses.includes(currentStatus)) {
          if (['Assigned Editor', 'Editor Assigned', 'Assigned', 'Raw Footage Received', 'Editing Started', 'Editing Start', 'In Progress', 'Editing In Progress'].includes(currentStatus)) {
            currentStatus = 'Customer Review';
          }
        }

        // Customer Confirmation Image / Proof resolution
        const confirmationProof = (
          assignment.confirmation_proof ||
          assignment.customer_communication_proof ||
          assignment.client_communication_proof ||
          assignment.proof_url ||
          assignment.proof_image ||
          assignment.uploaded_proof ||
          ''
        ).trim();

        // Server Upload Confirmation resolution
        const serverUploadConfirmed = Boolean(
          assignment.server_upload_confirmed ||
          assignment.edited_folder_uploaded_to_server
        );
        const serverUploadEventDate = (
          assignment.server_upload_event_date ||
          eventDate ||
          ''
        ).trim();
        const serverUploadFolderName = (
          assignment.server_upload_folder_name ||
          ''
        ).trim();
        const serverUploadConfirmedAt = (assignment.server_upload_confirmed_at || '').trim();
        const serverUploadConfirmedBy = (assignment.server_upload_confirmed_by || '').trim();

        const delivQty = getAssignedDeliverableQty(assignment, targetEvent, lead, order, prod, quotations);

        individualDeliverables.push({
            assignmentId: assignment.assignment_id,
            orderId: order?.order_id || prod?.order_id || prod?.tracking_id || assignment.order_id || assignment.production_id || 'OR-ASSIGNED',
            eventId,
            leadId: lead?.lead_id || order?.lead_id || prod?.lead_id,
            customerName,
            customerMobile,
            eventDate,
            eventName,
            eventType,
            deliverable: assignment.speciality,
            qty: delivQty,
            targetFinishDate: prod?.target_delivery_date || prod?.expected_delivery_date || assignment.target_finish_date || '',
            status: currentStatus,
            rawFootageLink,
            editedDriveLink,
            confirmationProof,
            serverUploadConfirmed,
            serverUploadEventDate,
            serverUploadFolderName,
            serverUploadConfirmedAt,
            serverUploadConfirmedBy,
            assignmentObj: assignment,
            orderObj: order,
            leadObj: lead,
            prodObj: prod,
            targetEventObj: targetEvent
        });
    });

    // Group deliverables strictly by Order ID for this staff member (ONE ORDER ID = ONE CARD)
    const groupsMap = new Map<string, any>();
    individualDeliverables.forEach(item => {
      const groupKey = item.orderId;
      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          groupId: item.orderId,
          orderId: item.orderId,
          eventId: item.eventId,
          leadId: item.leadId,
          customerName: item.customerName,
          customerMobile: item.customerMobile,
          eventName: item.eventName,
          eventType: item.eventType,
          eventDate: item.eventDate,
          targetFinishDate: item.targetFinishDate,
          rawFootageLink: item.rawFootageLink,
          serverUploadConfirmed: item.serverUploadConfirmed,
          serverUploadEventDate: item.serverUploadEventDate,
          serverUploadFolderName: item.serverUploadFolderName,
          orderObj: item.orderObj,
          leadObj: item.leadObj,
          prodObj: item.prodObj,
          targetEventObj: item.targetEventObj,
          deliverables: []
        });
      }

      const grp = groupsMap.get(groupKey);
      grp.deliverables.push(item);
      if (!grp.rawFootageLink && item.rawFootageLink) {
        grp.rawFootageLink = item.rawFootageLink;
      }
      if (!grp.serverUploadConfirmed && item.serverUploadConfirmed) {
        grp.serverUploadConfirmed = item.serverUploadConfirmed;
        grp.serverUploadEventDate = item.serverUploadEventDate;
        grp.serverUploadFolderName = item.serverUploadFolderName;
      }
      if (item.targetFinishDate && (!grp.targetFinishDate || item.targetFinishDate < grp.targetFinishDate)) {
        grp.targetFinishDate = item.targetFinishDate;
      }
    });

    // Calculate stage rank helper
    const getTaskStageRank = (st: string, driveLink?: string) => {
      const status = st || '';
      if (['Client Acceptance', 'Business Owner Review', 'Project Completed', 'Completed', 'Order Closed'].includes(status)) return 5;
      if (['Editing Completed', 'Editing Complete'].includes(status)) return 4;
      if (['Customer Review', 'Client Review', 'Client Review Sent'].includes(status) || (driveLink && driveLink.trim() !== '')) return 3;
      if (['Editing Started', 'Editing Start', 'In Progress', 'Editing In Progress'].includes(status)) return 2;
      if (['Assigned Editor', 'Editor Assigned', 'Assigned', 'Raw Footage Received'].includes(status)) return 1;
      return 0;
    };

    // Overall status per grouped task
    return Array.from(groupsMap.values()).map(grp => {
      // ORDER STATUS MUST REFLECT ALL DELIVERABLES FOR THE ORDER assigned to this staff member
      const allOrderDeliverables = individualDeliverables.filter(d => d.orderId === grp.orderId);
      const ranks = allOrderDeliverables.map((d: any) => getTaskStageRank(d.status, d.editedDriveLink));
      const minRank = ranks.length > 0 ? Math.min(...ranks) : 1;

      let overallStatus = 'Assigned Editor';
      if (minRank >= 5) overallStatus = 'Client Acceptance';
      else if (minRank >= 4) overallStatus = 'Editing Completed';
      else if (minRank >= 3) overallStatus = 'Customer Review';
      else if (minRank >= 2) overallStatus = 'Editing Started';
      else if (minRank >= 1) overallStatus = 'Assigned Editor';

      const uniqueEventNames = Array.from(new Set(grp.deliverables.map((d: any) => d.eventName).filter(Boolean)));
      const displayName = uniqueEventNames.join(', ') || 'Unnamed Event';
      const eventCount = uniqueEventNames.length || 1;

      const uniqueEventDates = Array.from(new Set(grp.deliverables.map((d: any) => d.eventDate).filter(Boolean)));
      const displayDate = uniqueEventDates.map((d: any) => formatDateToDDMMYY(d) || d).join(', ') || (grp.eventDate ? (formatDateToDDMMYY(grp.eventDate) || grp.eventDate) : '');

      const completedCount = allOrderDeliverables.filter((d: any) => ['Completed', 'Editing Complete', 'Editing Completed', 'Client Acceptance', 'Order Closed'].includes(d.status)).length;
      const progressText = `${completedCount}/${allOrderDeliverables.length} DELIVERABLES COMPLETE`;

      return {
        ...grp,
        eventName: displayName,
        eventCount,
        eventDate: displayDate,
        overallStatus: `${overallStatus} · ${progressText}`
      };
    });
  }, [staffName, resolvedStaffId, currentUser, editorAssignments, orders, leads, production, operations, quotations, rawFootage]);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'Assigned Editor':
      case 'Editor Assigned':
      case 'Assigned': 
        return { label: 'Assigned Editor', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' };
      case 'Editing Started': 
      case 'Editing Start':
        return { label: 'Editing Started', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' };
      case 'Customer Review': 
        return { label: 'Customer Review', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
      case 'Editing Completed':
      case 'Editing Complete':
        return { label: 'Editing Completed', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
      case 'Client Acceptance':
        return { label: 'Client Acceptance', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' };
      case 'Business Owner Review':
      case 'Project Completed':
      case 'Completed': 
      case 'Order Closed':
        return { label: 'Editing Completed', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
      default: 
        return { label: status, color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30' };
    }
  };

  // Helper to format WhatsApp phone number
  const formatWhatsAppPhone = (phone: string) => {
    let cleaned = (phone || '').replace(/\D/g, '');
    if (!cleaned) return '';
    if (cleaned.length === 8) {
      cleaned = '65' + cleaned;
    }
    return cleaned;
  };

  // 1. Submit Editing Started Modal
  const handleEditingStartedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStartedModal) return;
    if (!editingStartedForm.estimated_completion_date || !editingStartedForm.estimated_completion_time) {
      alert("Please provide both Estimated Completion Date and Estimated Completion Time.");
      return;
    }
    if (editingStartedForm.selectedIds.length === 0) {
      alert("Please select at least one deliverable to update.");
      return;
    }

    setIsSubmitting(true);
    try {
      const b = editingStartedModal.group;
      const deliverablesToUpdate = b.deliverables.filter((d: any) => editingStartedForm.selectedIds.includes(d.assignmentId));

      for (const deliv of deliverablesToUpdate) {
        const startPayload = {
          target_finish_date: editingStartedForm.estimated_completion_date,
          status: 'Editing Started'
        };

        // Update Editor Assignment locally and calculate production status
        await updateEditorAssignmentStatus(deliv.assignmentId, 'Editing Started' as any, startPayload);

        // Ensure update is persisted directly to Supabase editor_assignments table
        const saveRes = await pushUpdate('editor_assignments', 'assignment_id', deliv.assignmentId, startPayload);
        if (saveRes && saveRes.success === false) {
          throw new Error(saveRes.error || 'Failed to save Editing Started status to database');
        }
      }

      setEditingStartedModal(null);
      setEditingStartedForm({ expected_delivery_date: '', estimated_completion_date: '', estimated_completion_time: '', selectedIds: [] });
      await refreshData();
      showToast('🚀 Status updated to Editing Started!');
    } catch (err: any) {
      console.error('Error submitting Editing Started:', err);
      alert('Failed to update status: ' + (err.message || 'Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2A. Save Server Upload Confirmation directly inside Customer Review Modal
  const handleSaveCustomerReviewServerConfirmation = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!customerReviewModal) return;

    const b = customerReviewModal.group;
    const deliverablesToUpdate = b.deliverables.filter((d: any) => customerReviewForm.selectedIds.includes(d.assignmentId));
    if (deliverablesToUpdate.length === 0) {
      alert("Please select at least one deliverable to update.");
      return;
    }

    const uniqueEventKeys: string[] = deliverablesToUpdate.map((d: any) => d.assignmentId);
    for (const evtKey of uniqueEventKeys) {
      const cfg = customerReviewForm.event_configs[evtKey] || {
        confirmed: customerReviewForm.server_upload_confirmed,
        eventDate: customerReviewForm.server_upload_event_date,
        folderName: customerReviewForm.server_upload_folder_name,
        eventName: 'Event'
      };
      if (!cfg.confirmed || !cfg.eventDate?.trim() || !cfg.folderName?.trim() || !cfg.serverFileLink?.trim()) {
        const evtName = cfg.eventName || 'the event';
        alert(`Please tick "Edited Folder Uploaded in Server" and enter Event Date, Folder Name, and Server File Link for ${evtName}.`);
        return;
      }
      if (!cfg.serverFileLink?.trim()) {
        alert(`Please provide the Server File Link for ${cfg.eventName || 'the event'}.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let imgUrl = customerReviewForm.customer_review_image?.trim() || '';
      let proofUploadTime: string | null = null;
      if (imgUrl.startsWith('data:')) {
        imgUrl = await uploadProofToStorage(imgUrl, `customer_review_${Date.now()}.webp`);
        proofUploadTime = new Date().toISOString();
      }
      const timestamp = new Date().toISOString();

      for (const deliv of deliverablesToUpdate) {
        const evtKey = deliv.assignmentId;
        const cfg = customerReviewForm.event_configs[evtKey] || {
          confirmed: true,
          eventDate: customerReviewForm.server_upload_event_date,
          folderName: customerReviewForm.server_upload_folder_name
        };
        const serverEventDate = (cfg.eventDate || deliv.eventDate || '').trim();
        const serverFolderName = (cfg.folderName || '').trim();

        const assignPayload: any = {
          server_upload_confirmed: true,
          edited_folder_uploaded_to_server: true,
          server_upload_event_date: serverEventDate,
          server_upload_folder_name: serverFolderName,
          folder_name: serverFolderName,
          server_upload_confirmed_at: timestamp,
          server_upload_confirmed_by: staffName || 'Production Staff'
        };

        if (cfg.serverFileLink?.trim()) {
          assignPayload.server_file_link = cfg.serverFileLink.trim();
          assignPayload.upload_link = cfg.serverFileLink.trim();
          assignPayload.upload_link_path = cfg.serverFileLink.trim();
        }

        if (imgUrl) {
          assignPayload.customer_review_image = imgUrl;
          assignPayload.customer_communication_proof = imgUrl;
          assignPayload.confirmation_proof = imgUrl;
          assignPayload.proof_url = imgUrl;
          if (proofUploadTime) {
            assignPayload.proof_uploaded_at = proofUploadTime;
            assignPayload.customer_review_image_time = proofUploadTime;
          }
        }
        if (customerReviewForm.edited_drive_link?.trim()) {
          assignPayload.Edited_Drive_Link = customerReviewForm.edited_drive_link.trim();
          assignPayload.edited_drive_link = customerReviewForm.edited_drive_link.trim();
        }

        await updateEditorAssignment(deliv.assignmentId, assignPayload);
        await pushUpdate('editor_assignments', 'assignment_id', deliv.assignmentId, assignPayload);
      }

      // Update local state to mark as saved
      setCustomerReviewForm(prev => {
        const updatedConfigs = { ...prev.event_configs };
        uniqueEventKeys.forEach((k: string) => {
          if (updatedConfigs[k]) {
            updatedConfigs[k] = {
              ...updatedConfigs[k],
              confirmed: true,
              isSaved: true,
              confirmedAt: timestamp
            };
          }
        });
        return {
          ...prev,
          customer_review_image: imgUrl || prev.customer_review_image,
          server_upload_confirmed: true,
          event_configs: updatedConfigs
        };
      });

      await refreshData();
      showToast("✅ Edited Folder Server Upload Confirmed & Saved!");
    } catch (err: any) {
      console.error("Error saving server upload confirmation:", err);
      alert("❌ Failed to save confirmation: " + (err.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2B. Submit Customer Review Modal
  const handleCustomerReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerReviewModal) return;
    if (customerReviewForm.selectedIds.length === 0) {
      alert("Please select at least one deliverable to update.");
      return;
    }

    setIsSubmitting(true);
    try {
      let imgUrl = customerReviewForm.customer_review_image?.trim() || '';
      let proofUploadTime: string | null = null;
      if (imgUrl.startsWith('data:')) {
        imgUrl = await uploadProofToStorage(imgUrl, `customer_review_${Date.now()}.webp`);
        proofUploadTime = new Date().toISOString();
      }
      const timestamp = new Date().toISOString();
      const b = customerReviewModal.group;
      const editedLink = (customerReviewForm.edited_drive_link || customerReviewForm.customer_review_image || '').trim();

      const deliverablesToUpdate = b.deliverables.filter((d: any) => customerReviewForm.selectedIds.includes(d.assignmentId));

      for (const deliv of deliverablesToUpdate) {
        const evtKey = deliv.assignmentId;
        const cfg = customerReviewForm.event_configs[evtKey] || {
          confirmed: customerReviewForm.server_upload_confirmed,
          eventDate: customerReviewForm.server_upload_event_date,
          folderName: customerReviewForm.server_upload_folder_name
        };

        const assignPayload: any = {
          Edited_Drive_Link: editedLink,
          edited_drive_link: editedLink,
          status: 'Customer Review'
        };

        if (imgUrl) {
          assignPayload.customer_review_image = imgUrl;
          assignPayload.customer_communication_proof = imgUrl;
          assignPayload.confirmation_proof = imgUrl;
          assignPayload.proof_url = imgUrl;
          if (proofUploadTime) {
            assignPayload.proof_uploaded_at = proofUploadTime;
            assignPayload.customer_review_image_time = proofUploadTime;
          }
        }

        if (cfg.confirmed && cfg.eventDate && cfg.folderName) {
          assignPayload.server_upload_confirmed = true;
          assignPayload.edited_folder_uploaded_to_server = true;
          assignPayload.server_upload_event_date = cfg.eventDate.trim();
          assignPayload.server_upload_folder_name = cfg.folderName.trim();
          assignPayload.folder_name = cfg.folderName.trim();
          assignPayload.server_upload_confirmed_at = timestamp;
          assignPayload.server_upload_confirmed_by = staffName || 'Production Staff';
          if (cfg.serverFileLink?.trim()) {
            assignPayload.server_file_link = cfg.serverFileLink.trim();
            assignPayload.upload_link = cfg.serverFileLink.trim();
            assignPayload.upload_link_path = cfg.serverFileLink.trim();
          }
        }

        await updateEditorAssignmentStatus(deliv.assignmentId, 'Customer Review' as any, assignPayload);

        const saveRes = await pushUpdate('editor_assignments', 'assignment_id', deliv.assignmentId, assignPayload);

        if (saveRes && saveRes.success === false) {
          throw new Error(saveRes.error || 'Failed to save Customer Review updates to editor_assignments table');
        }
      }

      // Persist unified Client Acceptance Verification records
      if (saveClientAcceptanceVerification) {
        for (const deliv of deliverablesToUpdate) {
          const orderId = deliv.orderId || b.orderId || b.leadId || '';
          const evtKey = deliv.assignmentId;
          const cfg = customerReviewForm.event_configs[evtKey] || {
            confirmed: customerReviewForm.server_upload_confirmed,
            eventDate: customerReviewForm.server_upload_event_date,
            folderName: customerReviewForm.server_upload_folder_name
          };
          const fName = (cfg.folderName || '').trim();
          const lPath = (editedLink || '').trim();
          
          if (orderId) {
            await saveClientAcceptanceVerification({
              order_id: orderId,
              event_id: deliv.eventId || 'default',
              assignment_id: deliv.assignmentId,
              task_id: deliv.assignmentId,
              folder_name: fName,
              upload_link_path: lPath,
              client_communication_consent_proof: imgUrl || '',
              proof_file_name: imgUrl ? (imgUrl.split('/').pop()?.split('?')[0] || `Proof_${orderId}`) : '',
              consent_proof_verified: Boolean(cfg.confirmed)
            });
          }
        }
      }

      // Prepare WhatsApp popup payload
      const cName = b.customerName || 'Customer';
      const eName = customerReviewModal.actionItem?.eventName || b.eventName || 'Event';
      const cPhone = b.customerMobile || '';
      const messageText = `Hello ${cName},

Your edited photos/videos are ready for review.

Please review them using the following link:

${editedLink}

Kindly let us know if any changes are required.

Thank you.`;

      setCustomerReviewModal(null);
      setCustomerReviewForm({ 
        edited_drive_link: '', 
        customer_review_image: '',
        selectedIds: [], 
        server_upload_confirmed: false,
        server_upload_event_date: '',
        server_upload_folder_name: '',
        event_configs: {} 
      });
      await refreshData();
      showToast('📁 Customer Review saved & moved to Customer Review!');

      // Automatically open 2nd popup: WhatsApp review message
      setWhatsappModal({
        customerName: cName,
        eventName: eName,
        driveLink: editedLink,
        phone: cPhone,
        message: messageText
      });
    } catch (err: any) {
      console.error('Error submitting Customer Review:', err);
      alert('Failed to submit: ' + (err.message || 'Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Submit Editing Completed Modal
  const handleEditingCompletedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompletedModal) return;

    if (!editingCompletedForm.confirmation_proof.trim()) {
      alert("Validation Failed: Please upload or provide Customer Review Image / Confirmation Proof.");
      return;
    }

    if (editingCompletedForm.selectedIds.length === 0) {
      alert("Please select at least one deliverable to update.");
      return;
    }

    const b = editingCompletedModal.group;
    const deliverablesToUpdate = b.deliverables.filter((d: any) => editingCompletedForm.selectedIds.includes(d.assignmentId));
    if (deliverablesToUpdate.length === 0) {
      alert("Please select at least one deliverable to update.");
      return;
    }

    // Validate that every selected event has confirmed checklist with Event Date and Folder Name
    const uniqueEventKeys = deliverablesToUpdate.map((d: any) => d.assignmentId);
    for (const evtKey of uniqueEventKeys as string[]) {
      const cfg = editingCompletedForm.event_configs[evtKey] || {
        confirmed: editingCompletedForm.server_upload_confirmed,
        eventDate: editingCompletedForm.server_upload_event_date,
        folderName: editingCompletedForm.server_upload_folder_name,
        eventName: 'Event'
      };
      if (!cfg.confirmed || !cfg.eventDate?.trim() || !cfg.folderName?.trim() || !cfg.serverFileLink?.trim()) {
        const evtName = cfg.eventName || 'the event';
        alert(`Please tick "Edited Folder Uploaded in Server" and enter Event Date, Folder Name, and Server File Link for ${evtName}.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const proofInput = editingCompletedForm.confirmation_proof.trim();

      // 1. Upload proof image to Supabase Storage bucket ('img') if file/data-uri, or resolve public URL
      let mainProofUrl = '';
      let mainProofUploadTime = '';

      // 2. Save status and proof references to editor_assignments table
      for (const deliv of deliverablesToUpdate) {
        const cleanId = (deliv.assignmentId || 'proof').replace(/[^a-zA-Z0-9_-]/g, '_');
        const uploadedProofUrl = await uploadProofToStorage(proofInput, `cust_confirmation_${cleanId}`);
        const imageUploadTime = new Date().toISOString();
        if (!uploadedProofUrl || !uploadedProofUrl.trim()) {
          throw new Error("Proof upload failed: Returned Storage URL is null or empty.");
        }
        mainProofUrl = uploadedProofUrl;
        mainProofUploadTime = imageUploadTime;
        console.log(`[ProductionStaffModule] Proof Storage URL generated for ${deliv.assignmentId}:`, uploadedProofUrl);

        const evtKey = deliv.assignmentId;
        const cfg = editingCompletedForm.event_configs[evtKey] || {
          confirmed: true,
          eventDate: editingCompletedForm.server_upload_event_date,
          folderName: editingCompletedForm.server_upload_folder_name
        };
        const serverEventDate = (cfg.eventDate || deliv.eventDate || '').trim();
        const serverFolderName = (cfg.folderName || '').trim();

        const assignPayload = {
          confirmation_proof: uploadedProofUrl,
          customer_communication_proof: uploadedProofUrl,
          client_communication_proof: uploadedProofUrl,
          proof_url: uploadedProofUrl,
          proof_image: uploadedProofUrl,
          uploaded_proof: uploadedProofUrl,
          proof_uploaded_at: imageUploadTime,
          customer_review_image_time: imageUploadTime,
          customer_confirmation_time: imageUploadTime,
          server_upload_confirmed: true,
          server_upload_event_date: serverEventDate,
          server_upload_folder_name: serverFolderName,
          folder_name: serverFolderName,
          server_upload_confirmed_at: timestamp,
          server_upload_confirmed_by: staffName || currentUser?.name || 'Production Staff',
          edited_folder_uploaded_to_server: true,
          server_file_link: (cfg.serverFileLink || '').trim(),
          upload_link: (cfg.serverFileLink || '').trim(),
          upload_link_path: (cfg.serverFileLink || '').trim()
        };

        await updateEditorAssignmentStatus(deliv.assignmentId, 'Editing Completed' as any, assignPayload);

        const resAssign = await pushUpdate('editor_assignments', 'assignment_id', deliv.assignmentId, {
          status: 'Editing Completed',
          ...assignPayload
        });

        if (resAssign && resAssign.success === false) {
          throw new Error(`Failed to update editor assignment (${deliv.assignmentId}): ${resAssign.error || 'Database update failed'}`);
        }
      }

      // Persist unified Client Acceptance Verification records
      if (saveClientAcceptanceVerification) {
        for (const deliv of deliverablesToUpdate) {
          const orderId = deliv.orderId || b.orderId || b.leadId || '';
          const evtKey = deliv.assignmentId;
          const cfg = editingCompletedForm.event_configs[evtKey] || {
            confirmed: true,
            eventDate: editingCompletedForm.server_upload_event_date,
            folderName: editingCompletedForm.server_upload_folder_name
          };
          const fName = (cfg.folderName || editingCompletedForm.server_upload_folder_name || '').trim();
          const lPath = (cfg.serverFileLink || deliv.editedDriveLink || deliv.assignmentObj?.server_file_link || deliv.assignmentObj?.upload_link || deliv.assignmentObj?.edited_drive_link || deliv.assignmentObj?.Edited_Drive_Link || '').trim();
          
          if (orderId) {
            await saveClientAcceptanceVerification({
              order_id: orderId,
              event_id: deliv.eventId || 'default',
              assignment_id: deliv.assignmentId,
              task_id: deliv.assignmentId,
              folder_name: fName,
              upload_link_path: lPath,
              client_communication_consent_proof: mainProofUrl || proofInput,
              proof_file_name: mainProofUrl ? (mainProofUrl.split('/').pop()?.split('?')[0] || `Proof_${orderId}`) : '',
              consent_proof_verified: true,
              proof_uploaded_at: mainProofUploadTime || new Date().toISOString()
            } as any);
          }
        }
      }

      setEditingCompletedModal(null);
      setEditingCompletedForm({ 
        confirmation_proof: '', 
        selectedIds: [],
        server_upload_confirmed: false,
        server_upload_event_date: '',
        server_upload_folder_name: '',
        event_configs: {}
      });
      await refreshData();
      showToast("✅ Customer Review Proof & Server Upload confirmed!");
      alert("✅ Customer Review Proof and Server Upload confirmed successfully!");
    } catch (err: any) {
      console.error("[ProductionStaffModule] Error saving confirmation proof:", err);
      alert("❌ Failed to save Customer Review Proof: " + (err.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // End of Production Staff handlers

  const renderOrderHeader = (group: any) => (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 mb-4 text-[10px] font-mono text-zinc-400 space-y-1">
      <div className="flex justify-between">
        <span>Customer: <span className="text-white font-sans text-xs font-bold">{group.customerName}</span></span>
        <span>Order ID: <span className="text-white">{group.orderId}</span></span>
      </div>
      <div className="flex justify-between">
        <span>Event: <span className="text-white font-sans text-xs font-bold">{group.eventName}</span></span>
        <span>Assigned To: <span className="text-white font-sans text-xs">{staffName || currentUser?.name || 'Staff'}</span></span>
      </div>
    </div>
  );

  const renderDeliverableChecklist = (
    group: any,
    selectedIds: string[],
    setSelectedIds: (ids: string[]) => void,
    validStatuses: string[]
  ) => {
    const validDeliverables = group.deliverables.filter((d: any) => validStatuses.includes(d.status));
    if (validDeliverables.length === 0) return null;

    return (
      <div className="space-y-3 pt-3 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase">
            Select Deliverables to Update
          </label>
          <button
            type="button"
            onClick={() => {
              if (selectedIds.length === validDeliverables.length) {
                setSelectedIds([]);
              } else {
                setSelectedIds(validDeliverables.map((d: any) => d.assignmentId));
              }
            }}
            className="text-[10px] font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
          >
            {selectedIds.length === validDeliverables.length ? 'Clear All' : 'Select All'}
          </button>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
          {group.deliverables.map((d: any) => {
            const isValid = validStatuses.includes(d.status);
            const delivQty = d.qty || getAssignedDeliverableQty(d.assignmentObj, d.targetEventObj, d.leadObj, d.orderObj, d.prodObj, quotations);
            const parsedDeliv = parseQtyAndText(d.deliverable);
            const delivName = parsedDeliv.text || d.deliverable;
            const isSelected = selectedIds.includes(d.assignmentId);
            return (
              <label key={d.assignmentId} className={`flex items-start gap-3 p-3 rounded-xl border ${isValid ? isSelected ? 'bg-sky-500/10 border-sky-500/30' : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500' : 'bg-zinc-950 border-zinc-800/50 opacity-50'} cursor-${isValid ? 'pointer' : 'not-allowed'} transition-colors`}>
                {isValid ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds([...selectedIds, d.assignmentId]);
                      else setSelectedIds(selectedIds.filter(id => id !== d.assignmentId));
                    }}
                    className="mt-1 shrink-0 accent-sky-500"
                  />
                ) : (
                  <div className="mt-1 w-3.5 h-3.5 rounded border border-zinc-700 bg-zinc-900 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white flex justify-between gap-2">
                    <span className="truncate">{delivName}</span>
                    <span className="text-zinc-500 font-mono text-[10px] shrink-0">Qty: {delivQty}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1 font-mono">Current Status: {d.status}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 bg-black min-h-screen text-white font-sans selection:bg-purple-500/30">
      <div className="w-full mx-auto space-y-6">

        {/* TOAST NOTIFICATION */}
        {toastMessage && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4">
            <div className="bg-zinc-900 border border-purple-500/30 shadow-2xl rounded-xl px-5 py-3 flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-xs font-bold text-white whitespace-nowrap">{toastMessage}</span>
            </div>
          </div>
        )}

        {/* STAFF PROFILE / INFO SECTION */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 shadow-inner">
              <User className="w-6 h-6" />
            </div>
            <DashboardGreetingHeader
              dashboardTitle="Production Staff Dashboard"
              userName={staffName}
              userMobile={staffMobile}
            />
          </div>
        </div>

        {/* TOP TITLE BAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/90 p-2.5 sm:p-3 rounded-2xl border border-zinc-800 shadow-xl">
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-zinc-950/90 border border-zinc-700/80 rounded-xl shadow-md">
            <span className="p-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
              <CheckSquare className="w-4 h-4" />
            </span>
            <span className="font-mono font-bold text-xs sm:text-sm text-zinc-100 flex items-center gap-2">
              <span>My Assigned Deliverables</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-purple-300 border border-zinc-700 font-mono">
                {activeBookings.length}
              </span>
            </span>
          </div>
        </div>

        {/* TASKS TABLE */}
        <div className="space-y-4 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 pl-1">
            <h2 className="text-xs font-mono font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <span>🎬 My Assigned Deliverables</span>
              <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[10px]">{activeBookings.length}</span>
            </h2>
            <ListSortFilter value={sortOrder} onChange={setSortOrder} />
          </div>

          {activeBookings.length === 0 ? (
            <div className="text-center py-16 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 border-dashed space-y-2">
              <CheckCircle2 className="w-12 h-12 text-zinc-700 mx-auto" />
              <p className="text-zinc-400 font-medium text-sm">No active deliverables assigned specifically to you right now.</p>
              <p className="text-zinc-600 text-xs">New assignments made by Production Manager will automatically appear here.</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto custom-scrollbar pb-6">
              <div className="w-max min-w-full space-y-6 pr-6">
                {[...activeBookings].sort((a, b) => compareRecordsByDate(a, b, sortOrder)).map((grp) => {
                const isDetailsVisible = expandedOrderIds.includes(grp.orderId);

                return (
                  <div key={grp.groupId} className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl space-y-0 w-full min-w-max">
                    {/* CUSTOMER / ORDER DETAILS CARD (HIDDEN BY DEFAULT, VISIBLE WHEN VIEW DETAILS IS CLICKED) */}
                    {isDetailsVisible && (
                      <div className="p-4 sm:p-5 bg-zinc-900/90 border-b border-zinc-800 relative animate-in fade-in duration-200">
                        <div className="flex items-center justify-between mb-3 border-b border-zinc-800/80 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                              📋 Customer & Order Details
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold">
                              {grp.orderId}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleOrderDetails(grp.orderId)}
                            className="text-xs font-bold text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Hide Details Card"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Hide Details</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 items-start">
                          
                          {/* 1. Customer */}
                          <div className="space-y-0.5 col-span-2 sm:col-span-1 min-w-0">
                            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Customer</div>
                            <div className="font-black text-white text-base leading-snug break-words" title={grp.customerName}>
                              {grp.customerName}
                            </div>
                            {grp.customerMobile ? (
                              <div className="text-xs text-emerald-400 font-mono font-semibold flex items-center gap-1 mt-0.5 break-all">
                                <span>📞</span>
                                <span>{grp.customerMobile}</span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-zinc-500 font-mono mt-0.5">No contact</div>
                            )}
                          </div>

                          {/* 2. Order ID */}
                          <div className="space-y-0.5 min-w-0">
                            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Order ID</div>
                            <span className="font-mono font-bold text-violet-400 text-sm block truncate">
                              {grp.orderId}
                            </span>
                            {grp.leadId && grp.leadId !== grp.orderId && (
                              <span className="text-[10px] text-zinc-500 font-mono block truncate">Ref: {grp.leadId}</span>
                            )}
                          </div>

                          {/* 3. Event Count */}
                          <div className="space-y-0.5 min-w-0">
                            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Event Count</div>
                            <div className="font-bold text-purple-300 text-sm">
                              {grp.eventCount} {grp.eventCount === 1 ? 'Event' : 'Events'}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono truncate" title={grp.eventName}>
                              {grp.eventName}
                            </div>
                          </div>

                          {/* 4. Target Delivery Date */}
                          <div className="space-y-0.5 min-w-0">
                            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Target Delivery Date</div>
                            <span className="font-mono text-xs text-zinc-200 font-bold block pt-1 truncate">{formatDateToDDMMYY(grp.targetFinishDate) || 'Not set'}</span>
                          </div>

                          {/* 5. Overall Task Status */}
                          <div className="space-y-0.5 min-w-0">
                          </div>

                        </div>
                      </div>
                    )}

                    {/* ASSIGNED DELIVERABLES PANEL (ALWAYS VISIBLE BY DEFAULT) */}
                    <div className="p-4 bg-zinc-950/90 w-full">
                      {!isProdStaff && (
                        <div className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span>📦 Assigned Deliverables</span>
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px]">
                              {grp.deliverables.length} {grp.deliverables.length === 1 ? 'Deliverable' : 'Deliverables'}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-violet-300 font-mono text-[10px] font-bold">
                              Order ID: {grp.orderId}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-amber-400 font-mono text-[10px] font-bold" title="Order status reflects the least-advanced deliverable">
                              Order Status: {grp.overallStatus}
                            </span>
                          </span>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] text-zinc-500 font-normal">Assigned to: <strong className="text-purple-400">{staffName}</strong></span>
                            {grp.deliverables.length > 1 && (
                              <span className="text-[9px] text-zinc-500 italic hidden sm:block">*Order status reflects the least-advanced deliverable</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* DESKTOP LAYOUT (Table view, visible on all screens) */}
                      <div className="w-full">
                        <table className="w-full text-left border-collapse min-w-max">
                          <thead>
                            <tr className="bg-zinc-900/50 border-b border-zinc-800 font-mono text-[10px] text-zinc-400 uppercase tracking-wider">
                              <th className="px-3.5 py-2.5 font-bold min-w-[110px] whitespace-nowrap">Order ID</th>
                              <th className="px-3.5 py-2.5 font-bold min-w-[160px] whitespace-nowrap">Customer Name</th>
                              <th className="px-3.5 py-2.5 font-bold min-w-[150px] whitespace-nowrap">Event Category</th>
                              <th className="px-3.5 py-2.5 font-bold min-w-[200px] whitespace-nowrap">Assigned Task</th>
                              <th className="px-3.5 py-2.5 font-bold min-w-[140px] whitespace-nowrap">Target Delivery Date</th>
                              
                              <th className="px-3.5 py-2.5 font-bold min-w-[140px] whitespace-nowrap">Current Status</th>
                              <th className="px-3.5 py-2.5 font-bold min-w-[130px] whitespace-nowrap">Edited Drive Link</th>
                              <th className="px-3.5 py-2.5 font-bold min-w-[180px] whitespace-nowrap">Customer Proof</th>
                              <th className="px-3.5 py-2.5 font-bold min-w-[130px] whitespace-nowrap">Row Footage</th>
                              <th className="px-4 py-2.5 font-bold text-center min-w-[130px] whitespace-nowrap">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900/80 text-xs font-sans">
                            {grp.deliverables.map((delivItem: any) => {
                              const delivBadge = getStatusBadge(delivItem.status);
                              const isDelivLocked = ['Business Owner Review', 'Project Completed', 'Completed', 'Order Closed', 'Closed'].includes(delivItem.status) || grp.orderObj?.current_stage === 'Business Owner Review';

                              const delivQty = delivItem.qty || getAssignedDeliverableQty(delivItem.assignmentObj, delivItem.targetEventObj, delivItem.leadObj, delivItem.orderObj, delivItem.prodObj, quotations);
                              const parsedDeliv = parseQtyAndText(delivItem.deliverable);
                              const delivName = parsedDeliv.text || delivItem.deliverable;
                              const effectiveRawFootageLink = delivItem.rawFootageLink || grp.rawFootageLink;

                              return (
                                <tr key={delivItem.assignmentId} className="hover:bg-zinc-900/40 transition-colors">
                                  {/* 1. Order ID */}
                                  <td className="px-3.5 py-3 font-mono font-bold text-violet-400 whitespace-nowrap">
                                    {delivItem.orderId}
                                  </td>

                                  {/* 2. Customer Name */}
                                  <td className="px-3.5 py-3 font-bold text-white whitespace-nowrap">
                                    <div>{delivItem.customerName}</div>
                                    {delivItem.customerMobile && (
                                      <div className="text-[10px] text-emerald-400 font-mono font-normal flex items-center gap-1 mt-0.5">
                                        <span>📞</span>
                                        <span>{delivItem.customerMobile}</span>
                                      </div>
                                    )}
                                  </td>

                                  {/* 3. Event Category */}
                                  <td className="px-3.5 py-3 font-semibold text-purple-300">
                                    <span className="text-zinc-200 font-bold">{delivItem.eventType || 'N/A'}</span>
                                  </td>

                                  {/* 4. Assigned Task (Deliverable) */}
                                  <td className="px-3.5 py-3 font-bold text-zinc-300">
                                    <div className="flex items-center gap-1.5">
                                      <span>🎯 {delivQty} × {delivName}</span>
                                      {delivQty > 1 && (
                                        <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 font-mono text-[10px] border border-zinc-800">
                                          x{delivQty}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* 5. Target Delivery Date */}
                                  <td className="px-3.5 py-3 font-mono text-xs text-zinc-200 font-bold whitespace-nowrap">
                                    {formatDateToDDMMYY(delivItem.targetFinishDate || grp.targetFinishDate) || 'Not set'}
                                  </td>

                                  
                                  {/* 7. Current Status */}
                                  <td className="px-3.5 py-3 whitespace-nowrap">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border ${delivBadge.color}`}>
                                      {delivBadge.label}
                                    </span>
                                  </td>

                                  {/* 8. Edited Drive Link */}
                                  <td className="px-3.5 py-3 font-mono">
                                    {delivItem.editedDriveLink && (delivItem.editedDriveLink.startsWith('http://') || delivItem.editedDriveLink.startsWith('https://')) ? (
                                      <a
                                        href={delivItem.editedDriveLink.startsWith('http') ? delivItem.editedDriveLink : `https://${delivItem.editedDriveLink}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        referrerPolicy="no-referrer"
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-bold transition-all cursor-pointer max-w-[150px] truncate"
                                        title={delivItem.editedDriveLink}
                                      >
                                        <LinkIcon className="w-3 h-3 shrink-0" />
                                        <span className="truncate">View Link</span>
                                      </a>
                                    ) : (
                                      <span className="text-zinc-600 italic text-[11px]">Pending Upload</span>
                                    )}
                                  </td>

                                  {/* 9. Customer Proof */}
                                  <td className="px-3.5 py-3 whitespace-nowrap font-mono">
                                    {(() => {
                                      const proof = parseCustomerProof(delivItem.assignmentObj, delivItem.prodObj, delivItem.orderObj);

                                      if (!proof.hasProof) {
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 text-zinc-500 border border-zinc-800 text-[11px] font-mono">
                                            <Clock className="w-3 h-3 text-zinc-600" />
                                            <span>Pending</span>
                                          </span>
                                        );
                                      }

                                      // CASE 4: Both Image & Link exist
                                      if (proof.proofType === 'both' && proof.imageUrl && proof.linkUrl) {
                                        return (
                                          <div className="inline-flex items-center gap-1.5 flex-wrap">
                                            <button
                                              type="button"
                                              onClick={() => setPreviewProofModal({
                                                url: proof.imageUrl!,
                                                title: `Customer Confirmation Image - ${delivItem.customerName} (${delivItem.orderId})`,
                                                uploadTime: proof.uploadTime
                                              })}
                                              className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                                              title="Click to view uploaded confirmation image"
                                            >
                                              <Eye className="w-3 h-3 text-emerald-400 shrink-0" />
                                              <span>View Image</span>
                                            </button>
                                            <a
                                              href={proof.linkUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              referrerPolicy="no-referrer"
                                              className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                                              title={proof.linkUrl}
                                            >
                                              <ExternalLink className="w-3 h-3 text-indigo-400 shrink-0" />
                                              <span>Open Link</span>
                                            </a>
                                          </div>
                                        );
                                      }

                                      // CASE 2: Image exists
                                      if (proof.proofType === 'image' && proof.imageUrl) {
                                        return (
                                          <div className="flex flex-col gap-1">
                                            <button
                                              type="button"
                                              onClick={() => setPreviewProofModal({
                                                url: proof.imageUrl!,
                                                title: `Customer Confirmation Image - ${delivItem.customerName} (${delivItem.orderId})`,
                                                uploadTime: proof.uploadTime
                                              })}
                                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                                              title="Click to view full confirmation image"
                                            >
                                              <Eye className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                              <span>View Image</span>
                                            </button>
                                            {proof.uploadTime && (
                                              <div className="text-[10px] text-amber-400/90 font-mono flex items-center gap-1">
                                                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                                <span>{formatISTDate(proof.uploadTime)} {formatISTTime12Hour(proof.uploadTime)} IST</span>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }

                                      // CASE 1: Link exists
                                      if (proof.proofType === 'link' && proof.linkUrl) {
                                        return (
                                          <a
                                            href={proof.linkUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            referrerPolicy="no-referrer"
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                                            title={proof.linkUrl}
                                          >
                                            <ExternalLink className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                            <span>View Customer Proof</span>
                                          </a>
                                        );
                                      }

                                      // CASE 3: Button/proof reference
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (proof.imageUrl) {
                                              setPreviewProofModal({
                                                url: proof.imageUrl,
                                                title: `Customer Confirmation Proof - ${delivItem.customerName} (${delivItem.orderId})`,
                                                uploadTime: proof.uploadTime
                                              });
                                            } else if (proof.linkUrl) {
                                              window.open(proof.linkUrl, '_blank', 'noopener,noreferrer');
                                            }
                                          }}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/25 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                                          title="View Proof"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                          <span>View Proof</span>
                                        </button>
                                      );
                                    })()}
                                    {Boolean(delivItem.serverUploadFolderName) && (
                                      <div className="text-[9px] font-mono text-zinc-400 mt-1 flex items-center gap-1" title={`Server Folder: ${delivItem.serverUploadFolderName} (Event Date: ${formatDateToDDMMYY(delivItem.serverUploadEventDate) || 'N/A'})`}>
                                        <span className="text-emerald-400">📁</span>
                                        <span className="truncate max-w-[120px]">{delivItem.serverUploadFolderName}</span>
                                      </div>
                                    )}
                                  </td>

                                  {/* Row Footage */}
                                  <td className="px-3.5 py-3 whitespace-nowrap">
                                    {effectiveRawFootageLink && (
                                      effectiveRawFootageLink.startsWith('http') || effectiveRawFootageLink.includes('drive.google.com') 
                                    ) ? (
                                      <a
                                        href={effectiveRawFootageLink.startsWith('http') ? effectiveRawFootageLink : `https://${effectiveRawFootageLink}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-purple-400 hover:text-purple-300 underline font-semibold flex items-center gap-1 cursor-pointer"
                                      >
                                        View Row Footage ↗
                                      </a>
                                    ) : (
                                      <span className="text-zinc-500 italic text-[11px]">Pending</span>
                                    )}
                                  </td>

                                  {/* 10. Action Dropdown */}
                                  <td className="px-4 py-3 text-center min-w-[130px] whitespace-nowrap">
                                    <ActionMenuDropdown
                                      dropdownId={`action_dropdown_menu_${delivItem.assignmentId}`}
                                      isOpen={activeDropdownId === delivItem.assignmentId}
                                      onToggle={() => setActiveDropdownId(activeDropdownId === delivItem.assignmentId ? null : delivItem.assignmentId)}
                                      onClose={() => setActiveDropdownId(null)}
                                      buttonClassName="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-purple-600 hover:bg-purple-500 text-white transition-all flex items-center gap-1.5 shadow-md cursor-pointer mx-auto"
                                      buttonContent={
                                        <>
                                          <span>⚡ Action</span>
                                          <ChevronDown className="w-3.5 h-3.5" />
                                        </>
                                      }
                                    >
                                      {/* View Details */}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveDropdownId(null);
                                          if (!expandedOrderIds.includes(grp.orderId)) {
                                            toggleOrderDetails(grp.orderId);
                                          }
                                          setSelectedProjectForDetail({ orderId: grp.orderId, eventId: grp.eventId });
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-xs text-zinc-200 hover:bg-purple-600/20 hover:text-purple-300 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                      >
                                        <Eye className="w-4 h-4 text-purple-400" /> View Details
                                      </button>
                                      
                                      {/* Add Note */}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveDropdownId(null);
                                          setNoteModalData({ leadId: grp.leadId || grp.orderId, orderId: grp.orderId, customerName: grp.customerName });
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-xs text-zinc-200 hover:bg-amber-600/20 hover:text-amber-300 font-bold flex items-center gap-2 transition-colors cursor-pointer border-t border-zinc-800/80"
                                      >
                                        <span className="w-4 h-4 flex items-center justify-center text-amber-400">📝</span> VIEW/ADD NOTE
                                      </button>

                                      {/* View Customer Confirmation Proof */}
                                      {(() => {
                                        const proof = parseCustomerProof(delivItem.assignmentObj, delivItem.prodObj, delivItem.orderObj);
                                        if (!proof.hasProof) return null;

                                        return (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveDropdownId(null);
                                              if (proof.proofType === 'link' && proof.linkUrl) {
                                                window.open(proof.linkUrl, '_blank', 'noopener,noreferrer');
                                              } else if (proof.imageUrl) {
                                                setPreviewProofModal({
                                                  url: proof.imageUrl,
                                                  title: `Customer Confirmation Proof - ${delivItem.customerName} (${delivItem.orderId})`,
                                                  uploadTime: proof.uploadTime
                                                });
                                              }
                                            }}
                                            className="w-full text-left px-4 py-2.5 text-xs text-indigo-400 hover:bg-indigo-500/20 font-bold flex items-center gap-2 transition-colors cursor-pointer border-t border-zinc-800/80"
                                          >
                                            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                                            <span>{proof.proofType === 'link' ? 'View Customer Proof Link' : 'View Customer Proof Image'}</span>
                                          </button>
                                        );
                                      })()}

                                      {/* Locked State Notification */}
                                      {isDelivLocked ? (
                                        <div className="px-4 py-3 bg-emerald-500/10 text-emerald-400 text-[11px] font-bold flex items-center gap-2 border-t border-zinc-800/80">
                                          <Lock className="w-3.5 h-3.5" /> Editing Completed
                                        </div>
                                      ) : (
                                        <>
                                          {/* Workflow Step 1: Editing Started */}
                                          {(delivItem.status === 'Assigned Editor' || delivItem.status === 'Editor Assigned' || delivItem.status === 'Assigned' || delivItem.status === 'Raw Footage Received') && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveDropdownId(null);
                                                setEditingStartedModal({ group: grp, actionItem: delivItem });
                                                setEditingStartedForm({
                                                  expected_delivery_date: delivItem.targetFinishDate || new Date().toISOString().split('T')[0],
                                                  estimated_completion_date: delivItem.targetFinishDate || new Date().toISOString().split('T')[0],
                                                  estimated_completion_time: '18:00',
                                                  selectedIds: [delivItem.assignmentId]
                                                });
                                              }}
                                              className="w-full text-left px-4 py-2.5 text-xs text-sky-400 hover:bg-sky-500/20 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                            >
                                              <Play className="w-4 h-4" /> Start Editing
                                            </button>
                                          )}

                                          {/* Workflow Step 2: Customer Review */}
                                          {(delivItem.status === 'Editing Started' || delivItem.status === 'Editing Start') && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveDropdownId(null);
                                                openCustomerReviewModal(grp, delivItem);
                                              }}
                                              className="w-full text-left px-4 py-2.5 text-xs text-amber-400 hover:bg-amber-500/20 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                            >
                                              <UserCheck className="w-4 h-4" /> Upload Review
                                            </button>
                                          )}

                                          {/* Workflow Step 3: Re-send Customer Review & Upload Confirmation Proof */}
                                          {delivItem.status === 'Customer Review' && (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setActiveDropdownId(null);
                                                  openCustomerReviewModal(grp, delivItem);
                                                }}
                                                className="w-full text-left px-4 py-2.5 text-xs text-amber-400 hover:bg-amber-500/20 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                              >
                                                <RefreshCw className="w-4 h-4" /> Re-send Review Link
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setActiveDropdownId(null);
                                                  openEditingCompletedModal(grp, delivItem);
                                                }}
                                                className="w-full text-left px-4 py-2.5 text-xs text-indigo-400 hover:bg-indigo-500/20 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                              >
                                                <CheckCircle2 className="w-4 h-4" /> Upload Confirmation Proof
                                              </button>
                                            </>
                                          )}

                                          {/* Workflow Step 4: Editing Completed */}
                                          {(delivItem.status === 'Editing Completed' || delivItem.status === 'Editing Complete' || delivItem.status === 'Completed') && (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setActiveDropdownId(null);
                                                  openEditingCompletedModal(grp, delivItem);
                                                }}
                                                className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                              >
                                                <Upload className="w-3.5 h-3.5 text-indigo-400" /> Update Proof
                                              </button>
                                              <div className="px-4 py-2.5 bg-emerald-500/10 text-emerald-400 text-xs font-bold flex items-center gap-2 border-t border-zinc-800">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Editing Completed
                                              </div>
                                            </>
                                          )}
                                        </>
                                      )}
                                    </ActionMenuDropdown>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* MOBILE LAYOUT (Responsive list view, hidden on all screens) */}
                      <div className="hidden space-y-4">
                        {grp.deliverables.map((delivItem: any) => {
                          const delivBadge = getStatusBadge(delivItem.status);
                          const isDelivLocked = ['Business Owner Review', 'Project Completed', 'Completed', 'Order Closed', 'Closed'].includes(delivItem.status) || grp.orderObj?.current_stage === 'Business Owner Review';

                          const delivQty = delivItem.qty || getAssignedDeliverableQty(delivItem.assignmentObj, delivItem.targetEventObj, delivItem.leadObj, delivItem.orderObj, delivItem.prodObj, quotations);
                          const parsedDeliv = parseQtyAndText(delivItem.deliverable);
                          const delivName = parsedDeliv.text || delivItem.deliverable;
                          const effectiveRawFootageLink = delivItem.rawFootageLink || grp.rawFootageLink;

                          return (
                            <div key={delivItem.assignmentId} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3.5 space-y-3">
                              {/* Order ID & Customer */}
                              <div className="flex items-start justify-between gap-2 pb-2 border-b border-zinc-800/60">
                                <div>
                                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Order ID</div>
                                  <span className="font-mono font-bold text-violet-400 text-xs">{delivItem.orderId}</span>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Customer</div>
                                  <span className="font-bold text-white text-xs">{delivItem.customerName}</span>
                                </div>
                              </div>

                              {/* Event Category & Qty */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Event Category</div>
                                  <div className="text-sm font-bold text-zinc-200 break-words">
                                    {delivItem.eventType || 'N/A'}
                                  </div>
                                </div>
                                
                                <div className="shrink-0 text-right">
                                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold mb-1">Qty</div>
                                  <span className="inline-block px-2.5 py-1 rounded bg-zinc-950 text-zinc-100 text-xs font-mono font-black border border-zinc-800">
                                    {delivQty}
                                  </span>
                                </div>
                              </div>

                              {/* Deliverable Name (Assigned Task) & Target Delivery Date */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1 min-w-0">
                                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Assigned Task</div>
                                  <div className="text-xs font-bold text-purple-300 break-words flex items-start gap-1.5">
                                    <span className="shrink-0 mt-0.5">🎯</span>
                                    <span className="flex-1">{delivQty} × {delivName}</span>
                                  </div>
                                </div>

                                <div className="space-y-1 min-w-0 text-right">
                                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Target Delivery</div>
                                  <span className="font-mono text-xs text-zinc-200 font-bold block pt-0.5">
                                    {formatDateToDDMMYY(delivItem.targetFinishDate || grp.targetFinishDate) || 'Not set'}
                                  </span>
                                </div>
                              </div>

                              {/* Raw Footage Received */}
                              <div className="space-y-1">
                                <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Raw Footage Received</div>
                                <div>
                                  {effectiveRawFootageLink && (effectiveRawFootageLink.startsWith('http://') || effectiveRawFootageLink.startsWith('https://')) ? (
                                    <a
                                      href={effectiveRawFootageLink.startsWith('http') ? effectiveRawFootageLink : `https://${effectiveRawFootageLink}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      referrerPolicy="no-referrer"
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold transition-all cursor-pointer w-full text-center"
                                      title={effectiveRawFootageLink}
                                    >
                                      <FileVideo className="w-3.5 h-3.5 shrink-0" />
                                      <span>View Raw Footage</span>
                                      <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                                    </a>
                                  ) : effectiveRawFootageLink && effectiveRawFootageLink.trim() !== '' && effectiveRawFootageLink !== 'Pending' && effectiveRawFootageLink !== 'N/A' ? (
                                    <a
                                      href={effectiveRawFootageLink.startsWith('http') ? effectiveRawFootageLink : `https://${effectiveRawFootageLink}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      referrerPolicy="no-referrer"
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold transition-all cursor-pointer w-full text-center"
                                      title={effectiveRawFootageLink}
                                    >
                                      <FileVideo className="w-3.5 h-3.5 shrink-0" />
                                      <span>View Raw Footage</span>
                                      <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                                    </a>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-950 text-zinc-500 border border-zinc-800 text-[11px] font-mono">
                                      <Clock className="w-3 h-3 text-zinc-600" />
                                      <span>Pending</span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Status & Edited Drive Link */}
                              <div className="grid grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1">
                                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Current Status</div>
                                  <div className="pt-0.5">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border ${delivBadge.color}`}>
                                      {delivBadge.label}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-1 min-w-0">
                                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Edited Drive Link</div>
                                  <div className="pt-0.5 min-w-0">
                                    {delivItem.editedDriveLink && (delivItem.editedDriveLink.startsWith('http://') || delivItem.editedDriveLink.startsWith('https://')) ? (
                                      <a
                                        href={delivItem.editedDriveLink.startsWith('http') ? delivItem.editedDriveLink : `https://${delivItem.editedDriveLink}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        referrerPolicy="no-referrer"
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-bold transition-all cursor-pointer w-full justify-center text-center"
                                        title={delivItem.editedDriveLink}
                                      >
                                        <LinkIcon className="w-3 h-3 shrink-0" />
                                        <span className="truncate">View Link</span>
                                      </a>
                                    ) : (
                                      <span className="text-zinc-600 italic text-[10px] block py-1">Pending Upload</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Customer Confirmation Proof Row */}
                              <div className="space-y-1 pt-1">
                                <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">Customer Proof</div>
                                <div className="pt-0.5">
                                  {(() => {
                                    const proof = parseCustomerProof(delivItem.assignmentObj, delivItem.prodObj, delivItem.orderObj);

                                    if (!proof.hasProof) {
                                      return (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 text-zinc-500 border border-zinc-800 text-xs font-mono">
                                          <Clock className="w-3.5 h-3.5 text-zinc-600" />
                                          <span>Pending</span>
                                        </span>
                                      );
                                    }

                                    // CASE 4: Both Image & Link
                                    if (proof.proofType === 'both' && proof.imageUrl && proof.linkUrl) {
                                      return (
                                        <div className="flex flex-col gap-1 w-full">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                              type="button"
                                              onClick={() => setPreviewProofModal({
                                                url: proof.imageUrl!,
                                                title: `Customer Confirmation Image - ${delivItem.customerName} (${delivItem.orderId})`,
                                                uploadTime: proof.uploadTime
                                              })}
                                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer"
                                            >
                                              <Eye className="w-3.5 h-3.5" />
                                              <span>View Image</span>
                                            </button>
                                            <a
                                              href={proof.linkUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              referrerPolicy="no-referrer"
                                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer"
                                            >
                                              <ExternalLink className="w-3.5 h-3.5" />
                                              <span>Open Link</span>
                                            </a>
                                          </div>
                                          {proof.uploadTime && (
                                            <div className="text-[10px] text-amber-400/90 font-mono flex items-center justify-center gap-1 mt-0.5">
                                              <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                              <span>{formatISTDate(proof.uploadTime)} {formatISTTime12Hour(proof.uploadTime)} IST</span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }

                                    // CASE 2: Image exists
                                    if (proof.proofType === 'image' && proof.imageUrl) {
                                      return (
                                        <div className="flex flex-col gap-1 w-full">
                                          <button
                                            type="button"
                                            onClick={() => setPreviewProofModal({
                                              url: proof.imageUrl!,
                                              title: `Customer Confirmation Image - ${delivItem.customerName} (${delivItem.orderId})`,
                                              uploadTime: proof.uploadTime
                                            })}
                                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer w-full text-center"
                                          >
                                            <Eye className="w-3.5 h-3.5" />
                                            <span>View Image</span>
                                          </button>
                                          {proof.uploadTime && (
                                            <div className="text-[10px] text-amber-400/90 font-mono flex items-center justify-center gap-1 mt-0.5">
                                              <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                              <span>{formatISTDate(proof.uploadTime)} {formatISTTime12Hour(proof.uploadTime)} IST</span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }

                                    // CASE 1: Link exists
                                    if (proof.proofType === 'link' && proof.linkUrl) {
                                      return (
                                        <a
                                          href={proof.linkUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          referrerPolicy="no-referrer"
                                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer w-full text-center"
                                        >
                                          <ExternalLink className="w-3.5 h-3.5" />
                                          <span>View Customer Proof</span>
                                        </a>
                                      );
                                    }

                                    // CASE 3: Button/proof
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (proof.imageUrl) {
                                            setPreviewProofModal({
                                              url: proof.imageUrl,
                                              title: `Customer Confirmation Proof - ${delivItem.customerName} (${delivItem.orderId})`,
                                              uploadTime: proof.uploadTime
                                            });
                                          } else if (proof.linkUrl) {
                                            window.open(proof.linkUrl, '_blank', 'noopener,noreferrer');
                                          }
                                        }}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/25 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer w-full text-center"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>View Proof</span>
                                      </button>
                                    );
                                  })()}
                                  {Boolean(delivItem.serverUploadFolderName) && (
                                    <div className="text-[10px] font-mono text-zinc-300 bg-zinc-950/80 px-2.5 py-1.5 rounded-lg border border-zinc-800 flex items-center justify-between gap-2 mt-1">
                                      <span className="flex items-center gap-1.5 truncate">
                                        <span className="text-emerald-400">📁</span>
                                        <span className="truncate">{delivItem.serverUploadFolderName}</span>
                                      </span>
                                      {delivItem.serverUploadEventDate && (
                                        <span className="text-[9px] text-zinc-500 shrink-0 font-bold">({formatDateToDDMMYY(delivItem.serverUploadEventDate)})</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Action Button */}
                              <div className="pt-2 border-t border-zinc-800/80">
                                <ActionMenuDropdown
                                  dropdownId={`action_dropdown_menu_mobile_${delivItem.assignmentId}`}
                                  isOpen={activeDropdownId === delivItem.assignmentId}
                                  onToggle={() => setActiveDropdownId(activeDropdownId === delivItem.assignmentId ? null : delivItem.assignmentId)}
                                  onClose={() => setActiveDropdownId(null)}
                                  buttonClassName="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-purple-600 hover:bg-purple-500 text-white transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                                  buttonContent={
                                    <>
                                      <span>⚡ Action Menu</span>
                                      <ChevronDown className="w-4 h-4" />
                                    </>
                                  }
                                >
                                  {/* View Details */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDropdownId(null);
                                      if (!expandedOrderIds.includes(grp.orderId)) {
                                        toggleOrderDetails(grp.orderId);
                                      }
                                      setSelectedProjectForDetail({ orderId: grp.orderId, eventId: grp.eventId });
                                    }}
                                    className="w-full text-left px-4 py-3 text-xs text-zinc-200 hover:bg-purple-600/20 hover:text-purple-300 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    <Eye className="w-4 h-4 text-purple-400" /> View Details
                                  </button>

                                  {/* Add Note */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDropdownId(null);
                                      setNoteModalData({ leadId: grp.leadId || grp.orderId, orderId: grp.orderId, customerName: grp.customerName });
                                    }}
                                    className="w-full text-left px-4 py-3 text-xs text-zinc-200 hover:bg-amber-600/20 hover:text-amber-300 font-bold flex items-center gap-2 transition-colors cursor-pointer border-t border-zinc-800/80"
                                  >
                                    <span className="w-4 h-4 flex items-center justify-center text-amber-400">📝</span> VIEW/ADD NOTE
                                  </button>

                                  {/* View Customer Confirmation Proof */}
                                  {(() => {
                                    const proof = parseCustomerProof(delivItem.assignmentObj, delivItem.prodObj, delivItem.orderObj);
                                    if (!proof.hasProof) return null;

                                    return (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveDropdownId(null);
                                          if (proof.proofType === 'link' && proof.linkUrl) {
                                            window.open(proof.linkUrl, '_blank', 'noopener,noreferrer');
                                          } else if (proof.imageUrl) {
                                            setPreviewProofModal({
                                              url: proof.imageUrl,
                                              title: `Customer Confirmation Proof - ${delivItem.customerName} (${delivItem.orderId})`,
                                              uploadTime: proof.uploadTime
                                            });
                                          }
                                        }}
                                        className="w-full text-left px-4 py-3 text-xs text-indigo-400 hover:bg-indigo-500/20 font-bold flex items-center gap-2 transition-colors cursor-pointer border-t border-zinc-800/80"
                                      >
                                        <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                                        <span>{proof.proofType === 'link' ? 'View Customer Proof Link' : 'View Customer Proof Image'}</span>
                                      </button>
                                    );
                                  })()}

                                  {/* Locked State Notification */}
                                  {isDelivLocked ? (
                                    <div className="px-4 py-3 bg-emerald-500/10 text-emerald-400 text-[11px] font-bold flex items-center gap-2 border-t border-zinc-800/80">
                                      <Lock className="w-3.5 h-3.5" /> Editing Completed
                                    </div>
                                  ) : (
                                    <>
                                      {/* Workflow Step 1: Editing Started */}
                                      {(delivItem.status === 'Assigned Editor' || delivItem.status === 'Editor Assigned' || delivItem.status === 'Assigned' || delivItem.status === 'Raw Footage Received') && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActiveDropdownId(null);
                                            setEditingStartedModal({ group: grp, actionItem: delivItem });
                                            setEditingStartedForm({
                                              expected_delivery_date: delivItem.targetFinishDate || new Date().toISOString().split('T')[0],
                                              estimated_completion_date: delivItem.targetFinishDate || new Date().toISOString().split('T')[0],
                                              estimated_completion_time: '18:00',
                                              selectedIds: [delivItem.assignmentId]
                                            });
                                          }}
                                          className="w-full text-left px-4 py-3 text-xs text-sky-400 hover:bg-sky-500/20 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                        >
                                          <Play className="w-4 h-4" /> Start Editing
                                        </button>
                                      )}

                                      {/* Workflow Step 2: Customer Review */}
                                      {(delivItem.status === 'Editing Started' || delivItem.status === 'Editing Start') && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActiveDropdownId(null);
                                            openCustomerReviewModal(grp, delivItem);
                                          }}
                                          className="w-full text-left px-4 py-3 text-xs text-amber-400 hover:bg-amber-500/20 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                        >
                                          <UserCheck className="w-4 h-4" /> Upload Review
                                        </button>
                                      )}

                                      {/* Workflow Step 3: Re-send Customer Review & Upload Confirmation Proof */}
                                      {delivItem.status === 'Customer Review' && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveDropdownId(null);
                                              openCustomerReviewModal(grp, delivItem);
                                            }}
                                            className="w-full text-left px-4 py-3 text-xs text-amber-400 hover:bg-amber-500/20 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                          >
                                            <RefreshCw className="w-4 h-4" /> Re-send Review Link
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveDropdownId(null);
                                              openEditingCompletedModal(grp, delivItem);
                                            }}
                                            className="w-full text-left px-4 py-3 text-xs text-indigo-400 hover:bg-indigo-500/20 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                          >
                                            <CheckCircle2 className="w-4 h-4" /> Upload Confirmation Proof
                                          </button>
                                        </>
                                      )}

                                      {/* Workflow Step 4: Editing Completed */}
                                      {(delivItem.status === 'Editing Completed' || delivItem.status === 'Editing Complete' || delivItem.status === 'Completed') && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveDropdownId(null);
                                              openEditingCompletedModal(grp, delivItem);
                                            }}
                                            className="w-full text-left px-4 py-3 text-xs text-zinc-300 hover:bg-zinc-800 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                                          >
                                            <Upload className="w-3.5 h-3.5 text-indigo-400" /> Update Proof
                                          </button>
                                          <div className="px-4 py-3 bg-emerald-500/10 text-emerald-400 text-xs font-bold flex items-center gap-2 border-t border-zinc-800">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Editing Completed
                                          </div>
                                        </>
                                      )}
                                    </>
                                  )}
                                </ActionMenuDropdown>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ========================================================= */}
      {/* 1. EDITING STARTED MODAL POPUP */}
      {/* ========================================================= */}
      {editingStartedModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div id="editing_started_modal_card" className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">Editing Started</h3>
              </div>
              <button 
                onClick={() => setEditingStartedModal(null)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto pr-2 custom-scrollbar">
              {renderOrderHeader(editingStartedModal.group)}
              
              <p className="text-xs text-zinc-400 mb-4">
                Please review the expected delivery date and enter your estimated completion date & time.
              </p>

              <form id="editing-started-form" onSubmit={handleEditingStartedSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1 flex items-center justify-between">
                    <span>Expected Delivery Date (Pre-filled)</span>
                    {editingStartedForm.expected_delivery_date && (
                      <span className="text-zinc-500 font-mono text-[11px] font-normal lowercase tracking-normal">
                        ({formatDateToDDMMYY(editingStartedForm.expected_delivery_date)})
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      readOnly
                      disabled
                      tabIndex={-1}
                      value={editingStartedForm.expected_delivery_date}
                      className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-400 cursor-not-allowed select-none pointer-events-none focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-zinc-300 uppercase mb-1 flex items-center justify-between">
                    <span>Estimated Completion Date <span className="text-rose-400">*</span></span>
                    {editingStartedForm.estimated_completion_date && (
                      <span className="text-zinc-400 font-mono text-[11px] font-normal lowercase tracking-normal">
                        ({formatDateToDDMMYY(editingStartedForm.estimated_completion_date)})
                      </span>
                    )}
                  </label>
                  <input
                    type="date"
                    required
                    value={editingStartedForm.estimated_completion_date}
                    onChange={(e) => setEditingStartedForm({ ...editingStartedForm, estimated_completion_date: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-zinc-300 uppercase mb-1">
                    Estimated Completion Time <span className="text-rose-400">*</span>
                  </label>
                  <TimePicker12Hour
                    required
                    value={editingStartedForm.estimated_completion_time}
                    onChange={(val24) => setEditingStartedForm({ ...editingStartedForm, estimated_completion_time: val24 })}
                  />
                </div>

                {renderDeliverableChecklist(
                  editingStartedModal.group,
                  editingStartedForm.selectedIds,
                  (ids) => setEditingStartedForm({ ...editingStartedForm, selectedIds: ids }),
                  ['Assigned Editor', 'Editor Assigned', 'Assigned', 'Raw Footage Received']
                )}
              </form>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setEditingStartedModal(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                form="editing-started-form"
                type="submit"
                disabled={isSubmitting || editingStartedForm.selectedIds.length === 0}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer shadow-lg shadow-sky-600/20"
              >
                {isSubmitting ? 'Submitting...' : 'Submit & Start Editing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. CUSTOMER REVIEW MODAL POPUP */}
      {/* ========================================================= */}
      {customerReviewModal && (() => {
        const selectedDeliverables = customerReviewModal.group.deliverables.filter((d: any) => customerReviewForm.selectedIds.includes(d.assignmentId));
        const uniqueEventKeys = selectedDeliverables.map((d: any) => d.assignmentId);

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div id="customer_review_modal_card" className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">Customer Review & Server Checklist</h3>
                </div>
                <button 
                  onClick={() => setCustomerReviewModal(null)}
                  className="text-zinc-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto pr-2 custom-scrollbar">
                {renderOrderHeader(customerReviewModal.group)}

                <p className="text-xs text-zinc-400 mb-4">
                  Enter client review link and complete the server checklist below for customer review.
                </p>

                <form id="customer-review-form" onSubmit={handleCustomerReviewSubmit} className="space-y-5">
                  {/* Upload Link to Send Customer Editing Link */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono font-bold text-zinc-300 uppercase">
                      Upload Link to Send Customer Editing Link
                    </label>
                    <div className="relative">
                      <input
                        type="url"
                        id="customer_editing_link_input"
                        placeholder="https://drive.google.com/... or cloud review link"
                        value={customerReviewForm.edited_drive_link}
                        onChange={(e) => setCustomerReviewForm(prev => ({ ...prev, edited_drive_link: e.target.value }))}
                        className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-600 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors font-mono"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Enter or paste the client review link to be sent to the customer for reviewing the edited work.
                    </p>
                  </div>


                </form>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setCustomerReviewModal(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  form="customer-review-form"
                  type="submit"
                  disabled={isSubmitting || customerReviewForm.selectedIds.length === 0}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer shadow-lg shadow-amber-600/20"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit & Generate WhatsApp Message'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* 2B. WHATSAPP REVIEW MESSAGE POPUP (AUTOMATIC SECOND POPUP) */}
      {/* ========================================================= */}
      {whatsappModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div id="whatsapp_modal_card" className="bg-zinc-900 border border-emerald-500/40 rounded-2xl w-full w-full max-w-md shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">WhatsApp Review Message</h3>
              </div>
              <button 
                onClick={() => setWhatsappModal(null)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Pre-filled WhatsApp review message generated for <strong className="text-zinc-200">{whatsappModal.customerName}</strong> ({whatsappModal.phone || 'No Phone Registered'}).
            </p>

            <div className="space-y-2">
              <label className="block text-[11px] font-mono font-bold text-emerald-400 uppercase">
                Generated Message
              </label>
              <textarea
                readOnly
                rows={8}
                value={whatsappModal.message}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none resize-none select-all"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(whatsappModal.message);
                  setCopiedSuccess(true);
                  setTimeout(() => setCopiedSuccess(false), 3000);
                }}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-4 h-4 text-zinc-400" />
                <span>{copiedSuccess ? 'Copied!' : 'Copy Message'}</span>
              </button>

              {whatsappModal.phone ? (
                <a
                  href={`https://wa.me/${formatWhatsAppPhone(whatsappModal.phone)}?text=${encodeURIComponent(whatsappModal.message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/20"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open WhatsApp</span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2 bg-zinc-800 text-zinc-500 text-xs font-bold rounded-xl flex items-center gap-1.5 opacity-60 cursor-not-allowed"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>No Phone Available</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setWhatsappModal(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. EDITING COMPLETED MODAL POPUP */}
      {/* ========================================================= */}
      {editingCompletedModal && (() => {
        const selectedDeliverables = editingCompletedModal.group.deliverables.filter((d: any) => editingCompletedForm.selectedIds.includes(d.assignmentId));
        const uniqueEventKeys = selectedDeliverables.map((d: any) => d.assignmentId);

        const isChecklistValid = uniqueEventKeys.length > 0 && uniqueEventKeys.every((evtKey: string) => {
          const cfg = editingCompletedForm.event_configs[evtKey] || {
            confirmed: editingCompletedForm.server_upload_confirmed,
            eventDate: editingCompletedForm.server_upload_event_date,
            folderName: editingCompletedForm.server_upload_folder_name
          };
          return cfg.confirmed && cfg.eventDate?.trim() && cfg.folderName?.trim();
        });

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div id="editing_completed_modal_card" className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-bold text-white">Upload Confirmation / Proof</h3>
                </div>
                <button 
                  onClick={() => setEditingCompletedModal(null)}
                  className="text-zinc-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto pr-2 custom-scrollbar">
                {renderOrderHeader(editingCompletedModal.group)}

                <p className="text-xs text-zinc-400 mb-4">
                  Upload customer review image / confirmation proof. After attaching the image, complete the mandatory checklist below confirming that the edited folder has been uploaded to the server.
                </p>

                <form id="editing-completed-form" onSubmit={handleEditingCompletedSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono font-bold text-zinc-300 uppercase mb-1">
                      Customer Review Image / Proof <span className="text-rose-400">*</span>
                    </label>

                    {/* File Upload Field */}
                    <div className="bg-zinc-950 border border-dashed border-indigo-500/30 hover:border-indigo-500/60 rounded-xl p-3 text-center transition-colors">
                      <input
                        type="file"
                        id="customer_confirmation_file_input"
                        accept="image/*"
                        onChange={async (e) => {
                          if (e.target.files && e.target.files[0]) {
                            const compressed = await compressImage(e.target.files[0]);
                            setEditingCompletedForm({ ...editingCompletedForm, confirmation_proof: compressed });
                          }
                        }}
                        className="hidden"
                      />
                      <label
                        htmlFor="customer_confirmation_file_input"
                        className="cursor-pointer flex flex-col items-center justify-center gap-1.5 py-1"
                      >
                        <Upload className="w-5 h-5 text-indigo-400" />
                        <span className="text-xs font-bold text-indigo-300">
                          {editingCompletedForm.confirmation_proof ? 'Change Customer Review Image' : 'Select Customer Review Image'}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">PNG, JPG, JPEG, WEBP (auto-compressed & uploaded to Supabase)</span>
                      </label>
                    </div>
                    
                    {/* Selected Image Thumbnail Preview */}
                    {editingCompletedForm.confirmation_proof && (
                      <div className="mt-3 p-3 bg-zinc-950 border border-indigo-500/20 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs text-indigo-400 font-mono font-bold">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Image Attached
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingCompletedForm({ ...editingCompletedForm, confirmation_proof: '' })}
                            className="text-zinc-500 hover:text-rose-400 text-[11px] font-normal cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="relative rounded-lg overflow-hidden border border-zinc-800 max-h-48 bg-zinc-900 flex items-center justify-center">
                          <img
                            src={resolveStorageUrl(editingCompletedForm.confirmation_proof) || editingCompletedForm.confirmation_proof}
                            alt="Customer Review Image Preview"
                            referrerPolicy="no-referrer"
                            className="max-h-48 max-w-full object-contain rounded-lg"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {renderDeliverableChecklist(
                    editingCompletedModal.group,
                    editingCompletedForm.selectedIds,
                    (ids) => setEditingCompletedForm({ ...editingCompletedForm, selectedIds: ids }),
                    ['Customer Review', 'Client Review', 'Client Review Sent', 'Revision Required', 'Revision In Progress']
                  )}

                  {/* SERVER UPLOAD CONFIRMATION CHECKLIST */}
                  <div className="p-4 bg-zinc-950 border border-indigo-500/30 rounded-xl space-y-4">
                    <div className="text-[11px] font-mono font-bold text-zinc-300 uppercase flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="text-emerald-400">📁</span>
                        <span>Server Upload Confirmation</span>
                      </span>
                      <span className="text-[10px] text-rose-400 font-normal">* Mandatory Checklist</span>
                    </div>
                    {uniqueEventKeys.length > 0 ? (
                      uniqueEventKeys.map((evtKey: string) => {
                        const evtCfg = editingCompletedForm.event_configs[evtKey] || {
                          eventKey: evtKey,
                          eventId: '',
                          eventName: 'Event',
                          eventDate: editingCompletedForm.server_upload_event_date || '',
                          folderName: editingCompletedForm.server_upload_folder_name || '',
                          confirmed: editingCompletedForm.server_upload_confirmed,
                          serverFileLink: ''
                        };
                        const matchingDeliv = selectedDeliverables.find((d: any) => d.assignmentId === evtKey);
                        const eventDisplayName = evtCfg.eventName || matchingDeliv?.eventName || 'Event';
                        const defaultEvtDate = evtCfg.eventDate || matchingDeliv?.eventDate || editingCompletedModal.group?.eventDate || '';

                        return (
                          <div key={evtKey} className="space-y-3 bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800">
                            {uniqueEventKeys.length > 1 && (
                              <div className="text-xs font-bold text-indigo-300 pb-2 border-b border-zinc-800/80 flex items-center justify-between">
                                <span>Event: <strong className="text-white">{eventDisplayName}</strong></span>
                                {defaultEvtDate && <span className="text-[10px] text-zinc-400 font-mono">({formatDateToDDMMYY(defaultEvtDate)})</span>}
                              </div>
                            )}

                            <label className="flex items-start gap-3 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                id={`server_upload_confirmed_checkbox_${evtKey}`}
                                checked={Boolean(evtCfg.confirmed)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setEditingCompletedForm(prev => {
                                    const curCfg = prev.event_configs[evtKey] || evtCfg;
                                    const updatedConfigs = {
                                      ...prev.event_configs,
                                      [evtKey]: {
                                        ...curCfg,
                                        confirmed: checked,
                                        eventDate: curCfg.eventDate || defaultEvtDate,
                                        folderName: curCfg.folderName || ''
                                      }
                                    };
                                    return {
                                      ...prev,
                                      server_upload_confirmed: checked,
                                      server_upload_event_date: updatedConfigs[evtKey].eventDate,
                                      server_upload_folder_name: updatedConfigs[evtKey].folderName || '',
                                      event_configs: updatedConfigs
                                    };
                                  });
                                }}
                                className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-bold text-white block">
                                  Edited Folder Uploaded in Server
                                </span>
                                <span className="text-[10px] text-zinc-400 block mt-0.5">
                                  Mark this checkbox only after the edited folder has been uploaded to the server.
                                </span>
                              </div>
                            </label>

                            {evtCfg.confirmed && (
                              <div className="pt-3 border-t border-zinc-800/80 space-y-3 animate-in fade-in duration-200">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase mb-1">
                                      Event Date <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                      type="text"
                                      id={`server_upload_event_date_input_${evtKey}`}
                                      placeholder="e.g., 21 Aug 2026"
                                      value={evtCfg.eventDate || defaultEvtDate}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setEditingCompletedForm(prev => ({
                                          ...prev,
                                          server_upload_event_date: val,
                                          event_configs: {
                                            ...prev.event_configs,
                                            [evtKey]: {
                                              ...evtCfg,
                                              eventDate: val
                                            }
                                          }
                                        }));
                                      }}
                                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase mb-1">
                                      Folder Name <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                      type="text"
                                      id={`server_upload_folder_name_input_${evtKey}`}
                                      placeholder="Enter folder name"
                                      value={evtCfg.folderName || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setEditingCompletedForm(prev => ({
                                          ...prev,
                                          server_upload_folder_name: val,
                                          event_configs: {
                                            ...prev.event_configs,
                                            [evtKey]: {
                                              ...evtCfg,
                                              folderName: val
                                            }
                                          }
                                        }));
                                      }}
                                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
                                      required
                                    />
                                  </div>
                                </div>
                                {/* SERVER FILE LINK - Requirement */}
                                <div>
                                  <label className="block text-[11px] font-mono font-bold text-zinc-300 uppercase mb-1">
                                    SERVER FILE LINK <span className="text-rose-400">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    id={`server_file_link_input_${evtKey}`}
                                    placeholder="Paste final server file link here"
                                    value={evtCfg.serverFileLink || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditingCompletedForm(prev => ({
                                        ...prev,
                                        event_configs: {
                                          ...prev.event_configs,
                                          [evtKey]: {
                                            ...evtCfg,
                                            serverFileLink: val
                                          }
                                        }
                                      }));
                                    }}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
                                    required
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-zinc-500 italic">Select at least one deliverable above to configure server checklist.</p>
                    )}
                  </div>

                  {renderDeliverableChecklist(
                    editingCompletedModal.group,
                    editingCompletedForm.selectedIds,
                    (ids) => setEditingCompletedForm({ ...editingCompletedForm, selectedIds: ids }),
                    ['Customer Review', 'Client Review', 'Client Review Sent', 'Revision Required', 'Revision In Progress']
                  )}
                </form>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingCompletedModal(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  form="editing-completed-form"
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !editingCompletedForm.confirmation_proof.trim() ||
                    !isChecklistValid ||
                    editingCompletedForm.selectedIds.length === 0
                  }
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer shadow-lg shadow-indigo-600/20"
                >
                  {isSubmitting ? 'Uploading Proof & Saving...' : 'Submit & Confirm Server Upload 🎯'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* 4. CUSTOMER PROOF IMAGE ZOOM MODAL */}
      {/* ========================================================= */}
      {previewProofModal && (
        <div id="staff_proof_preview_modal" className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div id="staff_proof_preview_card" className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/80">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
                  <h3 className="text-sm font-bold text-white truncate">{previewProofModal.title}</h3>
                </div>
                {previewProofModal.uploadTime && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mt-1 pl-7">
                    <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Uploaded: {formatISTDate(previewProofModal.uploadTime)} at {formatISTTime12Hour(previewProofModal.uploadTime)} IST</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewProofModal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full View</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewProofModal(null)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-black/40 min-h-[300px]">
              <img
                src={previewProofModal.url}
                alt="Customer Confirmation Proof"
                referrerPolicy="no-referrer"
                className="max-h-[70vh] max-w-full object-contain rounded-xl shadow-2xl border border-zinc-800"
              />
            </div>

            <div className="p-3 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between text-xs text-zinc-400">
              <span className="font-mono text-[11px] truncate max-w-md">{previewProofModal.url}</span>
              <button
                type="button"
                onClick={() => setPreviewProofModal(null)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROJECT DETAIL MODAL */}
      {selectedProjectForDetail && (
        <ProjectDetailModal
          isOpen={!!selectedProjectForDetail}
          onClose={() => setSelectedProjectForDetail(null)}
          orderId={typeof selectedProjectForDetail === 'string' ? selectedProjectForDetail : selectedProjectForDetail.orderId}
          eventId={typeof selectedProjectForDetail === 'object' && selectedProjectForDetail ? selectedProjectForDetail.eventId : undefined}
          isProductionStaff={true}
          assignedStaffId={resolvedStaffId}
          assignedStaffName={staffName}
        />
      )}

      {/* Add Note Modal */}
      {noteModalData && (
        <AddNoteModal
          isOpen={true}
          onClose={() => setNoteModalData(null)}
          leadId={noteModalData.leadId}
          orderId={noteModalData.orderId}
          customerName={noteModalData.customerName}
        />
      )}

      {/* Note Popup Modal */}
      {selectedNote && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-zinc-700 flex justify-between items-center">
              <h3 className="text-white font-bold text-sm">Note</h3>
              <button onClick={() => setSelectedNote(null)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto text-zinc-300 text-sm whitespace-pre-wrap">
              {selectedNote}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
