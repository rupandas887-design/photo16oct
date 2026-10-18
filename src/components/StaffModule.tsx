import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import heic2any from 'heic2any';
import { useRole } from './RoleContext';
import { DashboardGreetingHeader } from './DashboardGreetingHeader';
import { MapPin, Calendar, Clock, Briefcase, Camera, User, Phone, MessageSquare, Eye, CheckCircle, AlertCircle, Upload, X, Play, ShieldCheck, ChevronRight, ChevronLeft, Video, Loader2 } from 'lucide-react';
import { Lead, Order, Operation, StaffAssignment, EquipmentHandover } from '../types';
import { supabaseClient } from '../supabaseClient';
import { getCalculatedOrderStage, getStageRank, getAllStaffStatusesForOrder } from '../utils/orderStageCalculator';
import { ViewDetailsModal } from './operations/ViewDetailsModal';
import { AddNoteModal } from './AddNoteModal';
import { ListSortFilter, SortOrder } from './ui/ListSortFilter';
import * as utils from '../utils';
import { formatDateDDMMYY, formatTime12Hour, formatISTTimestamp, formatISTDate, formatISTTime12Hour, processAndCompressImage } from '../utils';

const formatDateDMY = (dateStr?: string | null): string => {
  if (!dateStr || dateStr === '—') return '—';
  return formatDateDDMMYY(dateStr) || '—';
};

const StaffActionDropdown: React.FC<{
  booking: any;
  hasEquipmentReceived: boolean;
  hasEventStart: boolean;
  hasEquipmentHandover: boolean;
  isCompleted: boolean;
  onViewDetails: () => void;
  onOpenPhotoModal: (step: 'Equipment Received' | 'Event Start' | 'Equipment Handover' | 'Event Complete') => void;
  onAddNote: () => void;
}> = ({
  booking,
  hasEquipmentReceived,
  hasEventStart,
  hasEquipmentHandover,
  isCompleted,
  onViewDetails,
  onOpenPhotoModal,
  onAddNote
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    openUpward: boolean;
    maxHeight: number;
    width: number;
  } | null>(null);

  const handleToggle = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const dropdownWidth = Math.min(220, viewportWidth - 24);
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;

      const calculatedLeft = Math.min(
        Math.max(12, rect.right - dropdownWidth),
        viewportWidth - dropdownWidth - 12
      );

      const calculatedTop = openUpward ? rect.top - 6 : rect.bottom + 6;
      const maxHeight = openUpward
        ? Math.min(280, rect.top - 16)
        : Math.min(280, viewportHeight - rect.bottom - 16);

      setMenuPosition({
        top: calculatedTop,
        left: calculatedLeft,
        openUpward,
        maxHeight,
        width: dropdownWidth,
      });
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target;
      if (!target || !(target instanceof Node)) return;
      const el = target instanceof Element ? target : target.parentElement;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        (!el || !el.closest(`.staff-action-dropdown-menu-${booking.orderId || booking.key}`))
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = (e: Event) => {
      const target = e.target;
      const el = target instanceof Element ? target : (target instanceof Node ? target.parentElement : null);
      if (el && el.closest(`.staff-action-dropdown-menu-${booking.orderId || booking.key}`)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, booking]);

  // Determine current status string
  // Event Start action MUST remain available until BOTH images (Asset + Event Start) exist
  let currentStatus = 'Assigned Crew';
  if (booking.taskStatus === 'Footage Handover' || booking.taskStatus === 'Verified Footage') {
    currentStatus = 'Footage Handover';
  } else if (booking.taskStatus === 'Event Ended' || booking.taskStatus === 'Event Completed' || isCompleted) {
    currentStatus = 'Event Ended';
  } else if ((booking.taskStatus === 'Event Started' || booking.taskStatus === 'Event Start') && hasEventStart) {
    currentStatus = 'Event Started';
  } else {
    currentStatus = 'Assigned Crew';
  }

  const actionOptions: { label: string; onClick: () => void }[] = [];

  // 1. View Details (always visible)
  actionOptions.push({
    label: 'View Details',
    onClick: () => {
      onViewDetails();
      setIsOpen(false);
    }
  });

  // Add Note option
  actionOptions.push({
    label: 'VIEW/ADD NOTE',
    onClick: () => {
      onAddNote();
      setIsOpen(false);
    }
  });

  // 2. Event Start (show whenever Event Start is pending or only 1 image has been uploaded)
  if (currentStatus === 'Assigned Crew') {
    actionOptions.push({
      label: 'Event Start',
      onClick: () => {
        onOpenPhotoModal('Event Start');
        setIsOpen(false);
      }
    });
  }

  // 3. Event End (show ONLY after both images are uploaded and saved, transitioning to Event Started)
  if (currentStatus === 'Event Started') {
    actionOptions.push({
      label: 'Event End',
      onClick: () => {
        onOpenPhotoModal('Event Complete');
        setIsOpen(false);
      }
    });
  }

  // 4. Footage Handover (show only when current status is Event Ended)
  if (currentStatus === 'Event Ended') {
    const hasEquipment = booking.equipmentItems && booking.equipmentItems.length > 0;
    actionOptions.push({
      label: hasEquipment ? 'Footage Handover' : 'Raw Footage Upload',
      onClick: () => {
        onOpenPhotoModal('Equipment Handover');
        setIsOpen(false);
      }
    });
  }

  return (
    <div className="inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold border border-indigo-500/30 shadow-md cursor-pointer transition-all inline-flex items-center gap-1.5 outline-none"
      >
        <span>🎯 Action</span>
        <span className={`text-[9px] text-indigo-200 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : ''}`}>▼</span>
      </button>

      {isOpen && menuPosition && createPortal(
        <div 
          className={`fixed z-[9999] bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 shadow-2xl rounded-2xl p-2 text-left animate-in fade-in zoom-in-95 duration-100 flex flex-col overflow-hidden staff-action-dropdown-menu-${booking.orderId || booking.key}`}
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            width: `${menuPosition.width}px`,
            maxHeight: `${menuPosition.maxHeight}px`,
            transform: menuPosition.openUpward ? 'translateY(-100%)' : 'none',
          }}
        >
          <div className="px-2.5 py-1.5 border-b border-zinc-800 mb-1 flex items-center justify-between shrink-0">
            <span className="text-[9px] font-mono uppercase tracking-widest text-indigo-400 font-extrabold flex items-center gap-1">
              <span>🎯</span> Available Actions
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-zinc-500 hover:text-white text-xs p-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto space-y-1 pr-0.5" style={{ maxHeight: `${menuPosition.maxHeight - 40}px` }}>
            {actionOptions.map((opt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={opt.onClick}
                className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-lg transition-all cursor-pointer font-sans font-semibold flex items-center justify-start gap-2"
              >
                <span className="text-indigo-400 text-xs shrink-0">⚡</span>
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
            {actionOptions.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500 italic font-mono text-center">
                No actions available
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// Helper to normalize various date string formats to YYYY-MM-DD
const normalizeDateStr = (rawDateStr: string): string => {
  if (!rawDateStr || rawDateStr === 'N/A') return '';
  const trimmed = rawDateStr.trim();
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    return trimmed.replace(/\//g, '-');
  }

  const dmYMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmYMatch) {
    const day = dmYMatch[1].padStart(2, '0');
    const month = dmYMatch[2].padStart(2, '0');
    const year = dmYMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
};

// Helper to extract timestamp (in ms) from booking for sorting (Latest -> Oldest)
const getBookingTimestamp = (b: any): number => {
  if (!b) return 0;
  
  // 1. Prioritize actual task/order received/created timestamp (createdAt / created_at / updatedAt / updated_at)
  const rawCreated = b.createdAt || b.created_at || b.updatedAt || b.updated_at;
  if (rawCreated) {
    const parsed = new Date(rawCreated);
    if (!isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  // 2. Fallback to event date / time only if created timestamp is missing/invalid
  const rawDate = (b.eventDate && b.eventDate !== 'N/A') 
    ? b.eventDate 
    : ((b.reportingDate && b.reportingDate !== 'N/A') ? b.reportingDate : '');

  const rawTime = (b.eventStartTime && b.eventStartTime !== 'N/A') 
    ? b.eventStartTime 
    : ((b.reportingTime && b.reportingTime !== 'N/A') ? b.reportingTime : '');

  let timestamp = 0;

  if (rawDate) {
    const norm = normalizeDateStr(rawDate);
    if (norm && /^\d{4}-\d{2}-\d{2}$/.test(norm)) {
      const [year, month, day] = norm.split('-').map(Number);
      let hours = 0;
      let minutes = 0;

      if (rawTime) {
        const timeTrimmed = rawTime.trim();
        const match12 = timeTrimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?$/i);
        if (match12) {
          let h = parseInt(match12[1], 10);
          const min = parseInt(match12[2], 10);
          const meridiem = match12[3] ? match12[3].toUpperCase() : null;
          if (meridiem === 'PM' && h < 12) h += 12;
          if (meridiem === 'AM' && h === 12) h = 0;
          hours = h;
          minutes = min;
        }
      }

      const d = new Date(year, month - 1, day, hours, minutes, 0);
      if (!isNaN(d.getTime())) {
        timestamp = d.getTime();
      }
    } else {
      const parsedDirect = new Date(rawDate);
      if (!isNaN(parsedDirect.getTime())) {
        timestamp = parsedDirect.getTime();
      }
    }
  }

  return timestamp || 0;
};

// Sort comparator to strictly sort Latest -> Oldest
const sortBookingsLatestFirst = (a: any, b: any): number => {
  const timeA = getBookingTimestamp(a);
  const timeB = getBookingTimestamp(b);

  if (timeA !== timeB) {
    return timeB - timeA; // Latest (higher timestamp) on top
  }

  // Secondary sort by created_at / createdAt if available
  const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (createdA !== createdB) {
    return createdB - createdA;
  }

  // Tertiary fallback: orderId or key
  return String(b.orderId || b.key || '').localeCompare(String(a.orderId || a.key || ''));
};

// Sort comparator to strictly sort Oldest -> Latest
const sortBookingsOldestFirst = (a: any, b: any): number => {
  const timeA = getBookingTimestamp(a);
  const timeB = getBookingTimestamp(b);

  if (timeA !== timeB) {
    return timeA - timeB; // Oldest (lower timestamp) on top
  }

  const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (createdA !== createdB) {
    return createdA - createdB;
  }

  return String(a.orderId || a.key || '').localeCompare(String(b.orderId || b.key || ''));
};

// Utility for image compression before storage - uses processAndCompressImage with solid white fill to prevent blackout
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

interface EquipmentProofItem {
  equipmentName: string;
  assetId: string;
  photoUrl: string;
  capturedAt: string;
}

interface EventProofData {
  startProofs?: EquipmentProofItem[];
  completeProofs?: EquipmentProofItem[];
  equipmentReceivedProofs?: EquipmentProofItem[];
  eventStartProofs?: EquipmentProofItem[];
  equipmentHandoverProofs?: EquipmentProofItem[];
}

// Helper to accurately check proof items for a staff booking across database history and local state
const getBookingProofStatus = (
  b: any,
  leadEquipmentHistory: any[],
  staffProofs: Record<string, EventProofData>,
  currentStaffName: string,
  currentStaffMemberId?: string
) => {
  const normStaffName = (currentStaffName || '').trim().toLowerCase();
  const staffKey = `${b.orderId}_${b.eventId || 'ev'}_${normStaffName}`;
  const asgnKey = b.assignmentId ? `${b.orderId}_${b.assignmentId}_${normStaffName}` : '';
  const proofObj = staffProofs[b.key] || (asgnKey ? staffProofs[asgnKey] : {}) || staffProofs[staffKey] || {};

  let hasAssetInHistory = false;
  let hasStartInHistory = false;
  let hasCompleteInHistory = false;
  let hasHandoverInHistory = false;

  (leadEquipmentHistory || []).forEach(h => {
    const matchOrder = (b.orderId && h.order_id === b.orderId) ||
                       (b.leadId && h.lead_id === b.leadId);
    if (!matchOrder) return;

    let parsed: any = {};
    if (h.remarks) {
      try {
        parsed = typeof h.remarks === 'string' ? JSON.parse(h.remarks) : h.remarks;
      } catch (e) {}
    }

    const recordStaff = (h.returned_by || parsed.staff_name || parsed.uploaded_by || '').trim().toLowerCase();
    const recordStaffId = parsed.staff_id || '';
    const staffMatches = (recordStaff && normStaffName && recordStaff === normStaffName) ||
                         (recordStaffId && currentStaffMemberId && recordStaffId === currentStaffMemberId);
    if (!staffMatches) return;

    // Strict Task Isolation Matching
    const hAssignmentId = h.assignment_id || parsed.assignment_id;
    if (hAssignmentId && b.assignmentId && hAssignmentId !== b.assignmentId) {
      return;
    }
    // If the record has an assignment ID, but the current booking does not, it belongs to another specific assignment.
    if (hAssignmentId && !b.assignmentId) {
      return;
    }

    const bEvId = b.eventId;
    const hEvId = parsed.event_id;
    if (bEvId && hEvId && bEvId !== 'gen' && bEvId !== 'ev' && hEvId !== 'gen' && hEvId !== 'ev' && bEvId !== hEvId) {
      return;
    }

    if (parsed.staff_role && b.assignedRole && parsed.staff_role.trim().toLowerCase() !== b.assignedRole.trim().toLowerCase()) {
      return;
    }

    const photoUrl = parsed.photo_url || (h as any).photo_url || '';
    if (!photoUrl) return;

    const eqName = (h.equipment_name || '').toLowerCase();
    const eqStatus = (h.equipment_status || '').toLowerCase();

    if (eqName.includes('asset collection') || eqName.includes('equipment received') || eqStatus.includes('asset collected') || eqStatus === 'equipment received') {
      hasAssetInHistory = true;
    }
    if (eqName.includes('event start') || eqStatus === 'event started' || eqStatus === 'event start') {
      hasStartInHistory = true;
    }
    if (eqName.includes('event complet') || eqStatus.includes('event complete') || eqStatus.includes('event ended')) {
      hasCompleteInHistory = true;
    }
    if (eqName.includes('equipment handover') || eqName.includes('asset return') || eqStatus.includes('handover')) {
      hasHandoverInHistory = true;
    }
  });

  const hasEquipment = Boolean(b.equipmentItems && b.equipmentItems.length > 0);

  const assetImageUploaded = hasAssetInHistory || 
    (proofObj.equipmentReceivedProofs && proofObj.equipmentReceivedProofs.length > 0) ||
    (proofObj.eventStartProofs && proofObj.eventStartProofs.some(p => (p.equipmentName || '').toLowerCase().includes('asset collection') || (p.equipmentName || '').toLowerCase().includes('equipment received')));

  const eventStartImageUploaded = hasStartInHistory ||
    (proofObj.eventStartProofs && proofObj.eventStartProofs.some(p => (p.equipmentName || '').toLowerCase().includes('event start')));

  const isEventStartComplete = hasEquipment 
    ? Boolean(assetImageUploaded && eventStartImageUploaded) 
    : Boolean(eventStartImageUploaded);
  const isEventComplete = Boolean(hasCompleteInHistory || (proofObj.completeProofs && proofObj.completeProofs.length > 0));
  const isHandoverComplete = Boolean(hasHandoverInHistory || (proofObj.equipmentHandoverProofs && proofObj.equipmentHandoverProofs.length > 0));

  return {
    assetImageUploaded,
    eventStartImageUploaded,
    isEventStartComplete,
    isEventComplete,
    isHandoverComplete
  };
};


const StaffEventDetailsCell = ({ b }: { b: any }) => {
  return (
    <div className="relative">
      <div className="font-bold text-zinc-100">{b.eventName}</div>
    </div>
  );
};

const StaffEquipmentDetailsCell = ({ b, proofStatus }: { b: any, proofStatus: any }) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, openUpward: false });

  const hasEquipment = b.equipmentItems && b.equipmentItems.length > 0;
  
  if (!hasEquipment) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700 text-xs font-bold font-mono">
        Not Assigned
      </span>
    );
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const popupWidth = 320;
      const left = Math.min(
        Math.max(12, rect.left + rect.width / 2 - popupWidth / 2),
        window.innerWidth - popupWidth - 12
      );
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < 280 && spaceAbove > spaceBelow;
      
      setCoords({
        left,
        top: openUpward ? rect.top - 6 : rect.bottom + 6,
        openUpward
      });
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target;
      if (!target || !(target instanceof Node)) return;
      const el = target instanceof Element ? target : target.parentElement;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        (!el || !el.closest(`.staff-equipment-details-popup-${b.orderId || b.key}`))
      ) {
        setIsOpen(false);
      }
    };
    const handleScrollOrResize = (e: Event) => {
      const target = e.target;
      const el = target instanceof Element ? target : (target instanceof Node ? target.parentElement : null);
      if (el && el.closest(`.staff-equipment-details-popup-${b.orderId || b.key}`)) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, b.orderId, b.key]);

  const eqStatusText = proofStatus.isHandoverComplete ? 'Handed Over' : proofStatus.assetImageUploaded ? 'Received' : 'Assigned';

  return (
    <div className="relative">
      <button 
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700/50 bg-zinc-800/40 text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-700/80 hover:border-zinc-600 transition-all font-semibold tracking-wider"
      >
        {b.equipmentItems.length} Equipment Assigned 
        <span className={`transition-transform duration-200 flex items-center justify-center ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {isOpen && createPortal(
        <div 
          className={`staff-equipment-details-popup-${b.orderId || b.key} fixed z-[110] w-[320px] max-w-[calc(100vw-1.5rem)] bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl shadow-black/80 overflow-hidden transform origin-${coords.openUpward ? 'bottom' : 'top'} animate-in fade-in zoom-in-95 duration-200 flex flex-col`}
          style={{ 
            left: coords.left, 
            ...(coords.openUpward ? { bottom: Math.max(12, window.innerHeight - coords.top) } : { top: Math.max(12, coords.top) }),
            maxHeight: `${Math.min(300, window.innerHeight - 30)}px`
          }}
        >
          <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-700/60 flex items-center justify-between shrink-0">
            <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">Equipment Details</h4>
            <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-zinc-700/50">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
            <div className="space-y-2">
              {b.equipmentItems.map((e: any, eIdx: number) => (
                <div key={eIdx} className="flex items-start gap-2 text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="font-mono font-medium text-white break-words">{e.name}</span>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-3 border-t border-zinc-800/60">
              <span className="block text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1.5">Equipment Status</span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold font-mono">
                ✓ {eqStatusText}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const StaffReportingDetailsCell = ({ b }: { b: any }) => {
  const repDate = b.reportingDate || 'N/A';
  const repTime = b.reportingTime || 'N/A';

  return (
    <div className="relative">
      <div className="text-[11px] text-zinc-300 font-mono flex items-center gap-1.5 flex-wrap">
        {repDate !== 'N/A' ? (
          <>
            <span className="font-bold">{formatDateDDMMYY(repDate)}</span>
            {repTime !== 'N/A' && (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 font-medium">{formatTime12Hour(repTime)}</span>
              </>
            )}
          </>
        ) : (
          <span className="text-zinc-600">Not set</span>
        )}
      </div>
    </div>
  );
}

export const StaffModule: React.FC = () => {
  const { currentUser, staff, leads, orders, operations, staffAssignments, equipment, leadEquipmentHistory, addLeadEquipmentHistory, refreshData, updateLead, pushInsert, pushUpdate, rawFootage } = useRole();

  // Resolve staff member
  const staffMember = (staff || []).find(s => 
    (s.staff_id && currentUser?.id && s.staff_id === currentUser.id) ||
    (s.auth_user_id && currentUser?.id && s.auth_user_id === currentUser.id) ||
    ((s as any).id && currentUser?.id && (s as any).id === currentUser.id) ||
    (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) || 
    (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
    (s.name && currentUser?.name && s.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
  );
  const staffName = staffMember?.name || currentUser?.name || 'Staff';
  const staffMobile = staffMember?.mobile || currentUser?.mobile || '';

  // Helper to strictly resolve raw footage link by exact assignment_id from raw_footage.server_path
  const resolveRawFootageLink = (
    orderId: string,
    assignmentId: string | null | undefined,
    eventId: string | null | undefined,
    eventName: string | null | undefined,
    directRawLink?: string | null
  ): string => {
    if (assignmentId && rawFootage && rawFootage.length > 0) {
      const match = rawFootage.find(r => r.assignment_id === assignmentId);
      if (match) {
        return match.server_path || '';
      }
    }
    return '';
  };

  // Local state for assignments
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');

  // Local storage cache for individual staff task statuses & photo proofs
  const [staffStatuses, setStaffStatuses] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('staff_event_statuses_v2');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [staffProofs, setStaffProofs] = useState<Record<string, EventProofData>>(() => {
    try {
      const saved = localStorage.getItem('staff_equipment_proofs_v2');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Load saved statuses & verification photo proofs from Supabase (leadEquipmentHistory & staffAssignments)
  useEffect(() => {
    if (!staffName) return;

    const newStatuses: Record<string, string> = {};
    const newProofs: Record<string, EventProofData> = {};

    // 1. Restore staff task status from staffAssignments
    if (staffAssignments && staffAssignments.length > 0) {
      staffAssignments.forEach(sa => {
        if (sa.staff_name && sa.staff_name.toLowerCase() === staffName.toLowerCase()) {
          const statusVal = (sa as any).task_status || sa.assignment_status;
          if (statusVal && statusVal !== 'Assigned') {
            const normName = staffName.toLowerCase();
            if (sa.assignment_id) {
              newStatuses[`${sa.order_id}_${sa.assignment_id}_${normName}`] = statusVal;
            }
            if (sa.event_id) {
              newStatuses[`${sa.order_id}_${sa.event_id}_${normName}`] = statusVal;
            }
            if (sa.event_id && sa.staff_role) {
              newStatuses[`${sa.order_id}_${sa.event_id}_${sa.staff_role.toLowerCase()}_${normName}`] = statusVal;
            }
            if (!sa.event_id && !sa.assignment_id) {
              newStatuses[`${sa.order_id}_gen_${normName}`] = statusVal;
            }
          }
        }
      });
    }

    // 2. Restore equipment verification photo proofs and precise task statuses from leadEquipmentHistory
    if (leadEquipmentHistory && leadEquipmentHistory.length > 0) {
      // Sort history to process older ones first, then newer ones can override status
      const sortedHistory = [...leadEquipmentHistory].sort((a, b) => 
        new Date(a.returned_at || 0).getTime() - new Date(b.returned_at || 0).getTime()
      );
      
      sortedHistory.forEach(leh => {
        let parsed: any = {};
        if (leh.remarks) {
          try {
            parsed = typeof leh.remarks === 'string' ? JSON.parse(leh.remarks) : leh.remarks;
          } catch (e) {}
        }

        const recordStaff = (leh.returned_by || parsed.staff_name || parsed.uploaded_by || '').trim().toLowerCase();
        const currentStaffNorm = staffName.trim().toLowerCase();
        const recordStaffId = parsed.staff_id || '';
        const currentStaffId = staffMember?.id || currentUser?.id || '';

        const isForCurrentStaff = (recordStaff && currentStaffNorm && recordStaff === currentStaffNorm) ||
                                  (recordStaffId && currentStaffId && recordStaffId === currentStaffId);

        if (isForCurrentStaff) {
          let eventId = 'gen';
          let photoUrl = (leh as any).photo_url || '';
          let assetId = (leh as any).asset_id || '';
          let parsedStatus = '';
          let parsedAssignmentId = parsed.assignment_id || '';
          let parsedRole = parsed.staff_role || '';
          
          if (parsed.photo_url) photoUrl = parsed.photo_url;
          if (parsed.asset_id) assetId = parsed.asset_id;
          if (parsed.event_id) eventId = parsed.event_id;
          if (parsed.current_status) parsedStatus = parsed.current_status;
          
          const keysToUpdate: string[] = [];
          if (parsedAssignmentId) {
            keysToUpdate.push(`${leh.order_id}_${parsedAssignmentId}_${currentStaffNorm}`);
          } else if (eventId && parsedRole) {
            keysToUpdate.push(`${leh.order_id}_${eventId}_${parsedRole.toLowerCase()}_${currentStaffNorm}`);
          } else if (eventId) {
            keysToUpdate.push(`${leh.order_id}_${eventId}_${currentStaffNorm}`);
          }

          let effStatus = parsedStatus;
          if (!effStatus || effStatus === 'Assigned Crew') {
            if (leh.equipment_status === 'Event Started') effStatus = 'Event Started';
            else if (leh.equipment_status === 'Event Complete') effStatus = 'Event Ended';
            else if (leh.equipment_status === 'Equipment Handover') effStatus = 'Footage Handover';
          }

          keysToUpdate.forEach(key => {
            // Status restoration: If effStatus exists, override status for this key
            if (effStatus && effStatus !== 'Assigned Crew') {
               newStatuses[key] = effStatus;
            }

            if (photoUrl) {
              const stage = leh.equipment_status;
              const proofField = stage === 'Equipment Received' ? 'equipmentReceivedProofs' :
                                 stage === 'Event Start' || stage === 'Event Started' ? 'eventStartProofs' :
                                 stage === 'Equipment Handover' ? 'equipmentHandoverProofs' :
                                 stage === 'Event Complete' || stage === 'Event Ended' ? 'completeProofs' : 'startProofs';
              
              const existing = newProofs[key] || {};
              const proofArr = existing[proofField] ? [...existing[proofField]!] : [];
              const proofItem: EquipmentProofItem = {
                equipmentName: leh.equipment_name,
                assetId: assetId || `EQ-${leh.equipment_name}`,
                photoUrl: photoUrl,
                capturedAt: leh.returned_at || new Date().toISOString()
              };

              // Only add if not already present (using equipmentName to dedup)
              if (!proofArr.some(p => p.equipmentName === proofItem.equipmentName)) {
                proofArr.push(proofItem);
              }

              newProofs[key] = {
                ...existing,
                [proofField]: proofArr
              };
            }
          });
        }
      });
    }

    // Merge with local storage state
    setStaffStatuses(prev => {
       const merged = { ...prev, ...newStatuses };
       localStorage.setItem('staff_event_statuses_v2', JSON.stringify(merged));
       return merged;
    });
    setStaffProofs(prev => {
       const freshForStaff: Record<string, EventProofData> = {};
       // Strictly filter previous local state so proofs from other staff members never bleed into this session
       const suffix = `_${staffName.trim().toLowerCase()}`;
       for (const [k, v] of Object.entries(prev)) {
          if (k.toLowerCase().endsWith(suffix)) {
             freshForStaff[k] = v;
          }
       }

       for (const key of Object.keys(newProofs)) {
          freshForStaff[key] = {
             ...(freshForStaff[key] || {}),
             ...newProofs[key]
          };
       }
       localStorage.setItem('staff_equipment_proofs_v2', JSON.stringify(freshForStaff));
       return freshForStaff;
    });

  }, [leadEquipmentHistory, staffAssignments, staffName]);

  // Modal states & refs
  const selectedBookingDetailsRef = useRef<HTMLDivElement>(null);
  const photoModalScrollRef = useRef<HTMLDivElement>(null);
  const photoModalRef = useRef<HTMLDivElement>(null);
  const calendarModalScrollRef = useRef<HTMLDivElement>(null);

  const [selectedBookingDetails, setSelectedBookingDetails] = useState<any | null>(null);
  const [photoModalData, setPhotoModalData] = useState<{
    booking: any;
    stage: 'Equipment Received' | 'Event Start' | 'Equipment Handover' | 'Event Complete';
  } | null>(null);
  const [noteModalData, setNoteModalData] = useState<{ leadId: string, orderId?: string, customerName: string } | null>(null);
  const [calendarModalDate, setCalendarModalDate] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ title: string; message: string; details?: string[] } | null>(null);

  // Lock background body scroll and auto-scroll modals to top when active
  useEffect(() => {
    if (photoModalData) {
      document.body.style.overflow = 'hidden';
      if (photoModalScrollRef.current) {
        photoModalScrollRef.current.scrollTop = 0;
      }
    } else if (calendarModalDate) {
      document.body.style.overflow = 'hidden';
      if (calendarModalScrollRef.current) {
        calendarModalScrollRef.current.scrollTop = 0;
      }
    } else if (selectedBookingDetails) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedBookingDetails, photoModalData, calendarModalDate]);

  // Ensure modal scroll position is reset to top when opened
  useEffect(() => {
    if (photoModalData && photoModalScrollRef.current) {
      photoModalScrollRef.current.scrollTop = 0;
    }
  }, [photoModalData]);

  // Photos attached in modal & raw footage link
  const [modalPhotos, setModalPhotos] = useState<Record<string, string>>({});
  const [modalPhotoTimestamps, setModalPhotoTimestamps] = useState<Record<string, string>>({});
  const [modalRawFootageLink, setModalRawFootageLink] = useState('');
  const [uploadingItemKey, setUploadingItemKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Calendar View & Navigation state
  const [activeTab, setActiveTab] = useState<'calendar' | 'tasks'>('calendar');
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [calendarModalEvents, setCalendarModalEvents] = useState<any[]>([]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Build assigned bookings list for logged in staff
  useEffect(() => {
    if (!staffName) return;

    // Robust equipment resolution for staff tasks
    const resolveAssignedEqListForStaff = (
      targetStaffName: string, 
      saObj: any, 
      evObj: any, 
      staffIdx: number, 
      orderIdStr: string, 
      leadIdStr?: string, 
      opObj?: any
    ): { name: string; assetId: string }[] => {
      const normName = (targetStaffName || '').trim().toLowerCase();
      if (!normName) return [];

      let eqNames: string[] = [];

      // 1. Direct staff assignment equipment from exact assignment record ONLY
      if (saObj) {
        const saEqRaw = saObj.equipment || saObj.assigned_equipment;
        if (saEqRaw !== undefined && saEqRaw !== null) {
          if (Array.isArray(saEqRaw)) {
            saEqRaw.forEach((item: any) => {
              if (typeof item === 'string' && item.trim()) eqNames.push(item.trim());
              else if (item && typeof item === 'object' && (item.equipment_name || item.name)) {
                eqNames.push(item.equipment_name || item.name);
              }
            });
          } else if (typeof saEqRaw === 'string') {
            const str = saEqRaw.trim();
            if (str) {
              try {
                const parsed = JSON.parse(str);
                if (Array.isArray(parsed)) {
                  parsed.forEach((item: any) => {
                    if (typeof item === 'string' && item.trim()) eqNames.push(item.trim());
                    else if (item && typeof item === 'object' && (item.equipment_name || item.name)) {
                      eqNames.push(item.equipment_name || item.name);
                    }
                  });
                } else if (parsed && typeof parsed === 'object') {
                  const name = parsed.equipment_name || parsed.name || parsed.model;
                  if (name) eqNames.push(name);
                } else {
                  str.split(',').forEach((s: string) => { if (s.trim()) eqNames.push(s.trim()); });
                }
              } catch(e) {
                str.split(',').forEach((s: string) => { if (s.trim()) eqNames.push(s.trim()); });
              }
            }
          }
        }
      }

      // Filter invalid placeholders
      const cleanNames = eqNames.filter(item => 
        item && item.trim() && 
        item.trim().toLowerCase() !== 'none' && 
        item.trim().toLowerCase() !== 'not assigned' &&
        item.trim().toLowerCase() !== 'null' &&
        item.trim().toLowerCase() !== 'undefined'
      );

      const uniqueNames = Array.from(new Set(cleanNames));
      return uniqueNames.map(eqStr => {
        const match = equipment?.find(e => 
          e.equipment_name?.toLowerCase() === eqStr.toLowerCase() || 
          e.model?.toLowerCase() === eqStr.toLowerCase()
        );
        return {
          name: eqStr,
          assetId: match?.equipment_id || match?.serial_number || ('EQ-ASSET-' + Math.floor(1000 + Math.random() * 9000))
        };
      });
    };

    const bookings: any[] = [];

    const finishedStatuses = [
      'footage handover', 'verified footage', 'footage handover verified',
      'raw footage received', 'editor assigned', 'assigned editor',
      'editing started', 'editing in progress', 'internal qc review',
      'client review sent', 'internal review', 'client review',
      'revision required', 'revision in progress', 'revision',
      'final approval', 'project delivered', 'project closed',
      'completed', 'closed', 'order closed', 'delivered'
    ];

    const getVerificationStatus = (orderId: string, eventId: string, assignmentId: string) => {
      const rfVerification = leadEquipmentHistory?.find(h => 
        h.order_id === orderId &&
        h.equipment_name === "Raw Footage Verification" &&
        (h.returned_by || "").trim().toLowerCase() === staffName.toLowerCase() &&
        (!assignmentId || (() => { try { return JSON.parse(h.remarks || "{}").assignment_id === assignmentId; } catch(e) { return false; } })()) &&
        (!eventId || eventId === "gen" || (() => { try { return JSON.parse(h.remarks || "{}").event_id === eventId; } catch(e) { return false; } })())
      );
      return rfVerification?.equipment_status || "Pending Verification";
    };

    const processedAssignmentIds = new Set<string>();
    const processedUniqueKeys = new Set<string>();

    const normStaff = (staffName || '').trim().toLowerCase();
    const normCurUser = (currentUser?.name || '').trim().toLowerCase();
    const currentStaffId = staffMember?.staff_id || (staffMember as any)?.id || currentUser?.id || '';

    const isStaffAssigned = (checkName?: string | null, checkId?: string | null): boolean => {
      const n = (checkName || '').trim().toLowerCase();
      if (normStaff && n && n === normStaff) return true;
      if (normCurUser && n && n === normCurUser) return true;
      if (currentStaffId && checkId && String(checkId).trim() === String(currentStaffId).trim()) return true;
      return false;
    };

    // Gather all distinct order / lead contexts
    const orderMap = new Map<string, { order?: Order; lead?: Lead; op?: Operation }>();

    (orders || []).forEach(o => {
      const oId = o.order_id;
      const l = (leads || []).find(lead => lead.lead_id === o.lead_id);
      const op = (operations || []).find(op => op.order_id === oId || (l && op.order_id === l.lead_id));
      orderMap.set(oId, { order: o, lead: l, op });
    });

    (leads || []).forEach(l => {
      const matchingOrd = (orders || []).find(o => o.lead_id === l.lead_id);
      const oId = matchingOrd?.order_id || `OR-${l.lead_id.replace(/^LD-?/, '')}`;
      if (!orderMap.has(oId)) {
        const op = (operations || []).find(op => op.order_id === oId || op.order_id === l.lead_id);
        orderMap.set(oId, { order: matchingOrd, lead: l, op });
      }
    });

    (staffAssignments || []).forEach(sa => {
      if (sa && isStaffAssigned(sa.staff_name, sa.staff_id)) {
        const oId = sa.order_id;
        if (oId && !orderMap.has(oId)) {
          const matchedOrd = (orders || []).find(o => o.order_id === oId);
          const matchedLead = (leads || []).find(l => l.lead_id === (sa.lead_id || matchedOrd?.lead_id));
          const op = (operations || []).find(op => op.order_id === oId);
          orderMap.set(oId, { order: matchedOrd, lead: matchedLead, op });
        }
      }
    });

    // Evaluate each order/lead strictly by event-level assignment
    orderMap.forEach(({ order, lead, op }, orderId) => {
      const leadId = lead?.lead_id || order?.lead_id || '';

      const orderEvents: any[] = (lead?.events && Array.isArray(lead.events) && lead.events.length > 0)
        ? lead.events
        : (order?.events && Array.isArray(order.events) && order.events.length > 0)
          ? order.events
          : [];

      if (orderEvents.length > 0) {
        // MULTIPLE or EXPLICIT EVENTS:
        // A logged-in Operations Staff member must see ONLY the events specifically assigned to that staff member.
        // Do NOT show events assigned to other Operations Staff members.
        // Do NOT show unassigned events.
        // Do NOT show all events from the order.
        orderEvents.forEach((ev: any, evIdx: number) => {
          const evIdentifier = String(ev.id || ev.event_id || `evt_${evIdx}`);
          const evName = (ev.event_name || ev.custom_event_name || ev.event_type || '').trim();
          const evType = (ev.event_type || ev.custom_event_type || 'Event').trim();

          // 1. Check in staffAssignments table for this exact event
          const sa = (staffAssignments || []).find(s => {
            if (!s || s.assignment_status === 'Cancelled' || s.assignment_status === 'Rejected') return false;
            if (s.order_id !== orderId && s.lead_id !== leadId) return false;
            if (!isStaffAssigned(s.staff_name, s.staff_id)) return false;

            if (s.event_id && evIdentifier) {
              if (String(s.event_id).trim().toLowerCase() === evIdentifier.toLowerCase()) return true;
            }
            if (s.event_name) {
              const sEv = s.event_name.trim().toLowerCase();
              if (sEv === evName.toLowerCase() || sEv === evType.toLowerCase() || (ev.custom_event_name && sEv === ev.custom_event_name.trim().toLowerCase())) {
                return true;
              }
            }
            // Only if strictly 1 event in total for order, match unassigned event_id
            if (orderEvents.length === 1 && !s.event_id && !s.event_name) {
              return true;
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
          const isDirectlyAssignedInEvent = assignedNames.some((n: string) => isStaffAssigned(n, null)) ||
                                            assignedIds.some((id: string) => isStaffAssigned(null, id));

          // 3. For strictly single-event orders only: check op fields
          const isSingleEventOpMatch = orderEvents.length === 1 && op && (
            isStaffAssigned(op.photographer_assigned) ||
            isStaffAssigned(op.videographer_assigned) ||
            isStaffAssigned(op.drone_operator_assigned) ||
            isStaffAssigned(op.assistant_assigned)
          );

          const isAssignedToThisStaff = Boolean(sa || isDirectlyAssignedInEvent || isSingleEventOpMatch);

          // If NOT assigned to this staff member, DO NOT DISPLAY
          if (!isAssignedToThisStaff) {
            return;
          }

          const assignmentId = sa?.assignment_id || '';
          if (assignmentId && processedAssignmentIds.has(assignmentId)) {
            return;
          }

          const staffObj = staff?.find(s => isStaffAssigned(s.name, s.staff_id || (s as any).id));
          let assignedRole = staffObj ? staffObj.role : 'Crew Member';
          if (sa?.staff_role) {
            assignedRole = sa.staff_role;
          } else if (orderEvents.length === 1 && op) {
            if (isStaffAssigned(op.photographer_assigned)) assignedRole = 'Photographer';
            else if (isStaffAssigned(op.videographer_assigned)) assignedRole = 'Videographer';
            else if (isStaffAssigned(op.drone_operator_assigned)) assignedRole = 'Drone Operator';
            else if (isStaffAssigned(op.assistant_assigned)) assignedRole = 'Assistant';
          }

          const staffIdx = assignedNames.findIndex((n: string) => isStaffAssigned(n, null));
          const assignedEqItems = resolveAssignedEqListForStaff(staffName, sa, ev, staffIdx, orderId, leadId, op);

          const uniqueKey = assignmentId 
            ? `${orderId}_${assignmentId}_${evIdentifier}_${normStaff}`
            : `${orderId}_${evIdentifier}_${(assignedRole || 'crew').toLowerCase()}_${normStaff}`;

          if (processedUniqueKeys.has(uniqueKey)) {
            return;
          }

          const currentStaffStatus = sa?.task_status || (ev as any)?.status || 'Assigned Crew';

          const resolvedRawLink = resolveRawFootageLink(
            orderId,
            assignmentId,
            evIdentifier,
            ev.event_type === 'Other' ? (ev.event_name || 'Other Event') : (ev.event_type || 'N/A'),
            sa?.raw_footage_link
          );

          if (!finishedStatuses.includes((currentStaffStatus || '').trim().toLowerCase())) {
            bookings.push({
              key: uniqueKey,
              assignmentId: assignmentId,
              orderId: orderId,
              leadId: leadId,
              eventId: evIdentifier,
              eventName: ev.event_type === 'Other' ? (ev.event_name || 'Other Event') : (ev.event_type || ev.event_name || 'N/A'),
              staffName: staffName,
              assignedStaff: staffName,
              customerName: lead?.customer_name || order?.customer_name || 'N/A',
              customerMobile: lead?.mobile || order?.mobile || 'N/A',
              customerWhatsapp: lead?.whatsapp_number || lead?.mobile || order?.whatsapp_number || order?.mobile || 'N/A',
              customerAddress: lead?.address || lead?.client_residence_address || lead?.city || 'N/A',
              shootType: ev.event_shoot_type || lead?.shoot_type || sa?.staff_role || 'N/A',
              assignedRole: assignedRole,
              eventDate: ev.event_date || lead?.event_date || sa?.event_date || 'N/A',
              eventStartTime: ev.event_start_time || ev.event_time || lead?.event_time || 'N/A',
              eventEndDate: ev.event_end_date || ev.event_date || lead?.event_date || 'N/A',
              eventEndTime: ev.event_end_time || 'N/A',
              reportingDate: ev.Reporting_date || ev.reporting_date || (sa as any)?.Reporting_date || (sa as any)?.reporting_date || lead?.Reporting_date || lead?.reporting_date || '—',
              reportingTime: ev.reporting_time || ev.Reporting_time || (sa as any)?.reporting_time || (sa as any)?.Reporting_time || op?.reporting_time || lead?.reporting_time || '—',
              venue: ev.event_location || lead?.event_location || 'N/A',
              googleMapsLink: ev.google_maps_link || ((orderEvents.length === 1) ? (lead?.google_maps_link || 'N/A') : 'N/A'),
              guestPax: ev.guest_pax || (lead as any)?.guest_pax || 'N/A',
              equipmentItems: assignedEqItems,
              taskStatus: currentStaffStatus,
              rawFootageVerificationStatus: getVerificationStatus(orderId, evIdentifier, assignmentId),
              rawFootageLink: resolvedRawLink,
              coordinator: op?.operations_coordinator || 'Unassigned',
              createdAt: lead?.created_at || order?.created_at || (ev as any)?.created_at || sa?.created_at || '',
              equipmentReceivedTime: sa?.equipment_received_time || (sa as any)?.equipment_received_time || null,
              equipmentHandoverTime: sa?.equipment_handover_time || (sa as any)?.equipment_handover_time || null,
              eventStartPhotoTime: sa?.event_start_time || (sa as any)?.event_start_time || null,
              eventEndPhotoTime: sa?.event_end_time || (sa as any)?.event_end_time || null
            });
            if (assignmentId) processedAssignmentIds.add(assignmentId);
            processedUniqueKeys.add(uniqueKey);
          }
        });
      } else {
        // NO EVENTS ARRAY (Single general event order):
        const sa = (staffAssignments || []).find(s => {
          if (!s || s.assignment_status === 'Cancelled' || s.assignment_status === 'Rejected') return false;
          if (s.order_id !== orderId && s.lead_id !== leadId) return false;
          return isStaffAssigned(s.staff_name, s.staff_id);
        });

        const isAssignedInOp = op && (
          isStaffAssigned(op.photographer_assigned) ||
          isStaffAssigned(op.videographer_assigned) ||
          isStaffAssigned(op.drone_operator_assigned) ||
          isStaffAssigned(op.assistant_assigned)
        );

        if (sa || isAssignedInOp) {
          const assignmentId = sa?.assignment_id || '';
          if (assignmentId && processedAssignmentIds.has(assignmentId)) {
            return;
          }

          let assignedRole = 'Crew Member';
          if (sa?.staff_role) {
            assignedRole = sa.staff_role;
          } else if (op) {
            if (isStaffAssigned(op.photographer_assigned)) assignedRole = 'Photographer';
            else if (isStaffAssigned(op.videographer_assigned)) assignedRole = 'Videographer';
            else if (isStaffAssigned(op.drone_operator_assigned)) assignedRole = 'Drone Operator';
            else if (isStaffAssigned(op.assistant_assigned)) assignedRole = 'Assistant';
          }

          const assignedEqItems = resolveAssignedEqListForStaff(staffName, sa, null, -1, orderId, leadId, op);
          const evIdentifier = sa?.event_id || 'gen';

          const uniqueKey = assignmentId 
            ? `${orderId}_${assignmentId}_gen_${normStaff}`
            : `${orderId}_gen_${(assignedRole || 'crew').toLowerCase()}_${normStaff}`;

          if (processedUniqueKeys.has(uniqueKey)) {
            return;
          }

          const currentStaffStatus = sa?.task_status || 'Assigned Crew';
          const resolvedRawLink = resolveRawFootageLink(
            orderId,
            assignmentId,
            evIdentifier,
            sa?.event_name || lead?.event_name || lead?.shoot_type || 'General Event',
            sa?.raw_footage_link
          );

          if (!finishedStatuses.includes((currentStaffStatus || '').trim().toLowerCase())) {
            bookings.push({
              key: uniqueKey,
              assignmentId: assignmentId,
              orderId: orderId,
              leadId: leadId,
              eventId: evIdentifier,
              eventName: sa?.event_name || lead?.event_name || lead?.shoot_type || 'General Event',
              staffName: staffName,
              assignedStaff: staffName,
              customerName: lead?.customer_name || order?.customer_name || 'N/A',
              customerMobile: lead?.mobile || order?.mobile || 'N/A',
              customerWhatsapp: lead?.whatsapp_number || lead?.mobile || order?.whatsapp_number || order?.mobile || 'N/A',
              customerAddress: lead?.address || lead?.client_residence_address || lead?.city || 'N/A',
              shootType: lead?.shoot_type || sa?.staff_role || 'N/A',
              assignedRole: assignedRole,
              eventDate: sa?.event_date || lead?.event_date || 'N/A',
              eventStartTime: lead?.event_time || 'N/A',
              eventEndDate: lead?.event_end_date || lead?.event_date || 'N/A',
              eventEndTime: lead?.event_end_time || 'N/A',
              reportingDate: (sa as any)?.Reporting_date || (sa as any)?.reporting_date || lead?.Reporting_date || lead?.reporting_date || '—',
              reportingTime: (sa as any)?.reporting_time || (sa as any)?.Reporting_time || op?.reporting_time || lead?.reporting_time || '—',
              venue: lead?.event_location || 'N/A',
              googleMapsLink: lead?.google_maps_link || 'N/A',
              guestPax: (lead as any)?.guest_pax || 'N/A',
              equipmentItems: assignedEqItems,
              taskStatus: currentStaffStatus,
              rawFootageVerificationStatus: getVerificationStatus(orderId, evIdentifier, assignmentId),
              rawFootageLink: resolvedRawLink,
              coordinator: op?.operations_coordinator || 'Unassigned',
              createdAt: lead?.created_at || order?.created_at || sa?.created_at || '',
              equipmentReceivedTime: sa?.equipment_received_time || (sa as any)?.equipment_received_time || null,
              equipmentHandoverTime: sa?.equipment_handover_time || (sa as any)?.equipment_handover_time || null,
              eventStartPhotoTime: sa?.event_start_time || (sa as any)?.event_start_time || null,
              eventEndPhotoTime: sa?.event_end_time || (sa as any)?.event_end_time || null
            });
            if (assignmentId) processedAssignmentIds.add(assignmentId);
            processedUniqueKeys.add(uniqueKey);
          }
        }
      }
    });

    // 4. Also catch any standalone staffAssignments belonging to this staff not covered above
    (staffAssignments || []).forEach(sa => {
      if (!sa || sa.assignment_status === 'Cancelled' || sa.assignment_status === 'Rejected') return;
      if (!isStaffAssigned(sa.staff_name, sa.staff_id)) return;
      if (sa.assignment_id && processedAssignmentIds.has(sa.assignment_id)) return;

      const orderId = sa.order_id;
      const matchedOrd = (orders || []).find(o => o.order_id === orderId);
      const matchedLead = (leads || []).find(l => l.lead_id === (sa.lead_id || matchedOrd?.lead_id));
      const op = (operations || []).find(o => o.order_id === orderId);

      const orderEvents: any[] = (matchedLead?.events && Array.isArray(matchedLead.events)) ? matchedLead.events : [];
      // If order has multiple events and sa does not match any of them, skip to avoid leaking
      if (orderEvents.length > 1) {
        const matchesEvent = orderEvents.some((e: any) => {
          const evId = String(e.id || e.event_id || '');
          const evName = (e.event_name || e.event_type || '').toLowerCase().trim();
          if (sa.event_id && evId && String(sa.event_id).toLowerCase() === evId.toLowerCase()) return true;
          if (sa.event_name && (sa.event_name.toLowerCase().trim() === evName)) return true;
          return false;
        });
        if (!matchesEvent) return;
      }

      let ev = sa.event_id ? orderEvents.find((e: any) => String(e.id || e.event_id || '').toLowerCase() === String(sa.event_id).toLowerCase()) : null;
      if (!ev && sa.event_name && orderEvents.length > 0) {
        ev = orderEvents.find((e: any) => {
          const sEvName = (sa.event_name || '').trim().toLowerCase();
          const evName1 = (e.event_name || '').trim().toLowerCase();
          const evName2 = (e.event_type || '').trim().toLowerCase();
          return sEvName === evName1 || sEvName === evName2;
        });
      }

      const assignedEqItems = resolveAssignedEqListForStaff(staffName, sa, ev, -1, orderId, matchedLead?.lead_id, op);
      const staffObj = staff?.find(s => isStaffAssigned(s.name, s.staff_id || (s as any).id));
      let assignedRole = staffObj ? staffObj.role : 'Crew Member';
      if (sa.staff_role) assignedRole = sa.staff_role;

      const assignmentId = sa.assignment_id || '';
      const evIdentifier = ev?.id || sa.event_id || 'ev';
      const uniqueKey = assignmentId 
        ? `${orderId}_${assignmentId}_${evIdentifier}_${normStaff}`
        : `${orderId}_${evIdentifier}_${(assignedRole || 'crew').toLowerCase()}_${normStaff}`;

      if (processedUniqueKeys.has(uniqueKey)) return;

      const currentStaffStatus = sa.task_status || 'Assigned Crew';
      const resolvedRawLink = resolveRawFootageLink(
        orderId,
        assignmentId,
        evIdentifier,
        ev ? (ev.event_type === 'Other' ? (ev.event_name || 'Other Event') : (ev.event_type || 'N/A')) : (sa.event_name || 'General Event'),
        sa.raw_footage_link
      );

      if (!finishedStatuses.includes((currentStaffStatus || '').trim().toLowerCase())) {
        bookings.push({
          key: uniqueKey,
          assignmentId: assignmentId,
          orderId: orderId,
          leadId: matchedLead?.lead_id || sa.lead_id || '',
          eventId: evIdentifier,
          eventName: ev ? (ev.event_type === 'Other' ? (ev.event_name || 'Other Event') : (ev.event_type || 'N/A')) : (sa.event_name || 'General Event'),
          customerName: matchedLead?.customer_name || matchedOrd?.customer_name || 'N/A',
          customerMobile: matchedLead?.mobile || matchedOrd?.mobile || 'N/A',
          customerWhatsapp: matchedLead?.whatsapp_number || matchedLead?.mobile || matchedOrd?.whatsapp_number || matchedOrd?.mobile || 'N/A',
          customerAddress: matchedLead?.address || matchedLead?.client_residence_address || matchedLead?.city || 'N/A',
          shootType: ev?.event_shoot_type || matchedLead?.shoot_type || sa.staff_role || 'N/A',
          assignedRole: assignedRole,
          eventDate: ev?.event_date || matchedLead?.event_date || sa.event_date || 'N/A',
          eventStartTime: ev?.event_start_time || matchedLead?.event_time || 'N/A',
          eventEndDate: ev?.event_end_date || ev?.event_date || matchedLead?.event_date || 'N/A',
          eventEndTime: ev?.event_end_time || 'N/A',
          reportingDate: ev?.Reporting_date || ev?.reporting_date || (sa as any)?.Reporting_date || (sa as any)?.reporting_date || matchedLead?.Reporting_date || matchedLead?.reporting_date || '—',
          reportingTime: ev?.reporting_time || ev?.Reporting_time || (sa as any)?.reporting_time || (sa as any)?.Reporting_time || op?.reporting_time || matchedLead?.reporting_time || '—',
          venue: ev?.event_location || matchedLead?.event_location || 'N/A',
          googleMapsLink: ev?.google_maps_link || 'N/A',
          guestPax: ev?.guest_pax || (matchedLead as any)?.guest_pax || 'N/A',
          equipmentItems: assignedEqItems,
          taskStatus: currentStaffStatus,
          rawFootageVerificationStatus: getVerificationStatus(orderId, evIdentifier, assignmentId),
          rawFootageLink: resolvedRawLink,
          coordinator: op?.operations_coordinator || 'Unassigned',
          createdAt: matchedLead?.created_at || matchedOrd?.created_at || (ev as any)?.created_at || sa.created_at || '',
          equipmentReceivedTime: sa.equipment_received_time || (sa as any).equipment_received_time || null,
          equipmentReceivedPhoto: sa.equipment_received_photo || (sa as any).equipment_received_photo || null,
          equipmentHandoverTime: sa.equipment_handover_time || (sa as any).equipment_handover_time || null,
          equipmentHandoverPhoto: sa.equipment_handover_photo || (sa as any).equipment_handover_photo || null,
          eventStartPhotoTime: sa.event_start_time || (sa as any).event_start_time || null,
          eventStartPhoto: sa.event_start_photo || (sa as any).event_start_photo || null,
          eventEndPhotoTime: sa.event_end_time || (sa as any).event_end_time || null,
          eventEndPhoto: sa.event_end_photo || (sa as any).event_end_photo || null
        });
        if (assignmentId) processedAssignmentIds.add(assignmentId);
        processedUniqueKeys.add(uniqueKey);
      }
    });

    // Ensure all keys in bookings are guaranteed unique
    const seenKeys = new Set<string>();
    const deduplicatedBookings = bookings.map((b, idx) => {
      let finalKey = b.key;
      if (seenKeys.has(finalKey)) {
        finalKey = `${finalKey}_${idx}`;
      }
      seenKeys.add(finalKey);
      return {
        ...b,
        key: finalKey
      };
    });

    // Strictly sort all assigned bookings Latest -> Oldest
    deduplicatedBookings.sort(sortBookingsLatestFirst);
    setActiveBookings(deduplicatedBookings);
  }, [leads, orders, operations, staffAssignments, staffName, staff, equipment, staffStatuses]);

  // Helper to safely upload base64 images without throwing SyntaxError on HTML server error responses
  const safeUploadImage = async (base64Url: string, fileName: string): Promise<string> => {
    if (!base64Url || !base64Url.startsWith('data:image')) {
      return base64Url;
    }

    const isPng = base64Url.startsWith('data:image/png');
    const isWebp = base64Url.startsWith('data:image/webp');
    const isGif = base64Url.startsWith('data:image/gif');
    const resolvedMime = isPng ? 'image/png' : isWebp ? 'image/webp' : isGif ? 'image/gif' : 'image/jpeg';

    let finalFileName = fileName;
    if (isPng && !finalFileName.toLowerCase().endsWith('.png')) {
      finalFileName = finalFileName.replace(/\.[a-z0-9]+$/i, '') + '.png';
    } else if (isWebp && !finalFileName.toLowerCase().endsWith('.webp')) {
      finalFileName = finalFileName.replace(/\.[a-z0-9]+$/i, '') + '.webp';
    }
    
    // 1. Try direct client-side Supabase upload first for speed
    try {
      if (supabaseClient) {
        const base64Data = base64Url.includes(';base64,') 
          ? base64Url.split(';base64,')[1] 
          : base64Url.replace(/^data:[^;]+;base64,/, '');
        const byteCharacters = atob(base64Data);
        const byteArrays = [];
        
        for (let offset = 0; offset < byteCharacters.length; offset += 8192) {
          const slice = byteCharacters.slice(offset, offset + 8192);
          const byteNumbers = new Array(slice.length);
          for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
          }
          byteArrays.push(new Uint8Array(byteNumbers));
        }
        
        const blob = new Blob(byteArrays, { type: resolvedMime });

        const { data, error } = await supabaseClient.storage
          .from('img')
          .upload(finalFileName, blob, {
            contentType: resolvedMime,
            upsert: true
          });

        if (!error && data) {
          const { data: publicData } = supabaseClient.storage
            .from('img')
            .getPublicUrl(data.path || finalFileName);
          if (publicData?.publicUrl) {
            return publicData.publicUrl;
          }
        }
      }
    } catch (clientUploadErr) {
      console.warn("[UploadProof] Direct client-side upload failed, falling back to server API...", clientUploadErr);
    }

    // 2. Fallback to server API with 8s timeout controller
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const uploadRes = await fetch('/api/upload-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: base64Url, fileName: finalFileName, contentType: resolvedMime, bucketName: 'img' }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (uploadRes.ok) {
        const text = await uploadRes.text();
        try {
          const uploadData = JSON.parse(text);
          if (uploadData && uploadData.success && uploadData.publicUrl) {
            return uploadData.publicUrl;
          }
        } catch (e) {}
      }
    } catch (proxyErr) {
      console.warn("[UploadProof] Server API upload failed or timed out", proxyErr);
    }

    // Fallback: Return base64 data URI if storage uploads fail so user submission succeeds
    return base64Url;
  };

  // Close Photo Verification Modal and cleanly reset state & body scroll
  const closePhotoModal = () => {
    setPhotoModalData(null);
    setModalPhotos({});
    setModalPhotoTimestamps({});
    setModalRawFootageLink('');
    setUploadingItemKey(null);
    setSubmitError(null);
    setIsSubmitting(false);
    document.body.style.overflow = '';
  };

  // Open Equipment Photo Verification Modal
  const openPhotoModal = (booking: any, stage: 'Equipment Received' | 'Event Start' | 'Equipment Handover' | 'Event Complete') => {
    setSubmitError(null);
    const existingPhotos: Record<string, string> = {};
    const existingTimestamps: Record<string, string> = {};

    const relevantHistory = (leadEquipmentHistory || []).filter(h => {
      // 1. Order ID / Lead ID match
      const matchOrder = (booking.orderId && h.order_id === booking.orderId) ||
                         (booking.leadId && h.lead_id === booking.leadId);
      if (!matchOrder) return false;

      // 2. Parse remarks JSON
      let parsed: any = {};
      if (h.remarks) {
        try {
          parsed = typeof h.remarks === 'string' ? JSON.parse(h.remarks) : h.remarks;
        } catch (e) {}
      }

      // 3. Match Assigned Staff ID / Staff Name (MUST belong to logged-in staff)
      const recordStaff = (h.returned_by || parsed.staff_name || parsed.uploaded_by || '').trim().toLowerCase();
      const currentStaffNorm = (staffName || '').trim().toLowerCase();
      const recordStaffId = parsed.staff_id || '';
      const currentStaffId = staffMember?.id || currentUser?.id || '';

      const staffMatches = (recordStaff && currentStaffNorm && recordStaff === currentStaffNorm) ||
                           (recordStaffId && currentStaffId && recordStaffId === currentStaffId);

      if (!staffMatches) return false;

      // 4. Strict assignment matching if present
      const hAssignmentId = h.assignment_id || parsed.assignment_id;
      if (booking.assignmentId && hAssignmentId && hAssignmentId !== booking.assignmentId) {
        return false;
      }

      // 5. Match Event ID if present and not 'gen'/'ev'
      const bookingEventId = booking.eventId;
      const historyEventId = parsed.event_id;
      if (bookingEventId && historyEventId && bookingEventId !== 'gen' && bookingEventId !== 'ev' && historyEventId !== 'gen' && historyEventId !== 'ev' && bookingEventId !== historyEventId) {
        return false;
      }

      // 6. Match Role if present
      if (parsed.staff_role && booking.assignedRole && parsed.staff_role.trim().toLowerCase() !== booking.assignedRole.trim().toLowerCase()) {
        return false;
      }

      return true;
    });

    for (const h of relevantHistory) {
      let photoUrl = '';
      let parsedRemarks: any = {};
      try {
        if (h.remarks && typeof h.remarks === 'string' && h.remarks.startsWith('{')) {
          parsedRemarks = JSON.parse(h.remarks);
          photoUrl = parsedRemarks.photo_url || '';
        } else if (h.remarks && typeof h.remarks === 'object' && h.remarks.photo_url) {
          photoUrl = h.remarks.photo_url;
        } else if ((h as any).photo_url) {
          photoUrl = (h as any).photo_url;
        }
      } catch (e) {
        photoUrl = '';
      }

      if (!photoUrl) continue;

      const hTime = (parsedRemarks.uploaded_at || h.returned_at || h.created_at) as string;
      const eqName = (h.equipment_name || '').toLowerCase();
      const eqStatus = (h.equipment_status || '').toLowerCase();
      const proofType = (parsedRemarks.proof_type || '').toLowerCase();

      if (stage === 'Equipment Handover') {
        const isHandover = eqName.includes('handover') || eqName.includes('asset return') || eqStatus.includes('handover') || eqStatus.includes('return') || proofType.includes('handover') || proofType.includes('return');
        if (isHandover) {
          existingPhotos['Equipment Handover Photo Proof'] = photoUrl;
          existingPhotos['Equipment Handover Image'] = photoUrl;
          existingPhotos['Asset Return Photo Proof'] = photoUrl;
          if (hTime) {
            existingTimestamps['Equipment Handover Photo Proof'] = hTime;
            existingTimestamps['Equipment Handover Image'] = hTime;
            existingTimestamps['Asset Return Photo Proof'] = hTime;
          }
        }
      } else if (stage === 'Event Complete') {
        const isComplete = eqName.includes('completion') || eqName.includes('complete') || eqName.includes('event end') || eqStatus.includes('complete') || eqStatus.includes('ended') || proofType.includes('complete') || proofType.includes('end');
        if (isComplete) {
          existingPhotos['Event Completion Photo Proof'] = photoUrl;
          if (hTime) existingTimestamps['Event Completion Photo Proof'] = hTime;
        }
      } else if (stage === 'Event Start' || stage === 'Equipment Received') {
        const isReceived = eqName.includes('asset collection') || eqName.includes('equipment received') || eqStatus.includes('asset collected') || eqStatus.includes('received') || proofType.includes('received') || proofType.includes('asset collection');
        const isStart = eqName.includes('event start') || eqStatus.includes('event started') || proofType.includes('event start');
        if (isReceived) {
          existingPhotos['Asset Collection Photo Proof'] = photoUrl;
          existingPhotos['Equipment Received Image'] = photoUrl;
          existingPhotos['Equipment Received / Asset Picture'] = photoUrl;
          if (h.equipment_name) existingPhotos[h.equipment_name] = photoUrl;
          if (hTime) {
            existingTimestamps['Asset Collection Photo Proof'] = hTime;
            existingTimestamps['Equipment Received Image'] = hTime;
            existingTimestamps['Equipment Received / Asset Picture'] = hTime;
            if (h.equipment_name) existingTimestamps[h.equipment_name] = hTime;
          }
        }
        if (isStart) {
          existingPhotos['Event Start Photo Proof'] = photoUrl;
          existingPhotos['Event Start Image'] = photoUrl;
          if (hTime) {
            existingTimestamps['Event Start Photo Proof'] = hTime;
            existingTimestamps['Event Start Image'] = hTime;
          }
        }
      }
    }

    // Direct check from staff_assignments row (strictly mapped by unique assignments to avoid cross-leakage)
    const saRecord = staffAssignments?.find(sa => {
      if (sa.order_id !== booking.orderId) return false;
      if ((sa.staff_name || '').trim().toLowerCase() !== staffName.trim().toLowerCase()) return false;
      
      // If booking has assignmentId, it must match EXACTLY
      if (booking.assignmentId && sa.assignment_id) {
        return sa.assignment_id === booking.assignmentId;
      }
      
      // If booking has eventId and it is not a generic placeholder, it must match EXACTLY
      if (booking.eventId && booking.eventId !== 'ev' && sa.event_id) {
        return sa.event_id === booking.eventId;
      }
      
      // If booking has eventName, it must match EXACTLY
      if (booking.eventName && sa.event_name) {
        return sa.event_name.trim().toLowerCase() === booking.eventName.trim().toLowerCase();
      }
      
      // If the staff member is assigned to multiple events under the same order,
      // a general name-only match is forbidden to prevent leakage.
      const otherSameStaffAssignments = staffAssignments.filter(s => 
        s.order_id === booking.orderId && 
        (s.staff_name || '').trim().toLowerCase() === staffName.trim().toLowerCase()
      );
      if (otherSameStaffAssignments.length > 1) {
        return false; // Prevent matching any incorrect slot by name only
      }
      
      return true;
    });

    if (saRecord) {
      if (stage === 'Equipment Handover') {
        if (saRecord.equipment_handover_photo && saRecord.equipment_handover_photo !== saRecord.equipment_received_photo) {
          existingPhotos['Equipment Handover Photo Proof'] = saRecord.equipment_handover_photo;
          existingPhotos['Equipment Handover Image'] = saRecord.equipment_handover_photo;
          existingPhotos['Asset Return Photo Proof'] = saRecord.equipment_handover_photo;
          if (saRecord.equipment_handover_time) {
            existingTimestamps['Equipment Handover Photo Proof'] = saRecord.equipment_handover_time;
            existingTimestamps['Equipment Handover Image'] = saRecord.equipment_handover_time;
            existingTimestamps['Asset Return Photo Proof'] = saRecord.equipment_handover_time;
          }
        }
      } else if (stage === 'Event Complete') {
        if (saRecord.event_end_photo) {
          existingPhotos['Event Completion Photo Proof'] = saRecord.event_end_photo;
          if (saRecord.event_end_time) {
            existingTimestamps['Event Completion Photo Proof'] = saRecord.event_end_time;
          }
        }
      } else if (stage === 'Event Start' || stage === 'Equipment Received') {
        if (saRecord.equipment_received_photo) {
          existingPhotos['Asset Collection Photo Proof'] = saRecord.equipment_received_photo;
          existingPhotos['Equipment Received Image'] = saRecord.equipment_received_photo;
          existingPhotos['Equipment Received / Asset Picture'] = saRecord.equipment_received_photo;
          if (saRecord.equipment_received_time) {
            existingTimestamps['Asset Collection Photo Proof'] = saRecord.equipment_received_time;
            existingTimestamps['Equipment Received Image'] = saRecord.equipment_received_time;
            existingTimestamps['Equipment Received / Asset Picture'] = saRecord.equipment_received_time;
          }
        }
        if (saRecord.event_start_photo) {
          existingPhotos['Event Start Photo Proof'] = saRecord.event_start_photo;
          existingPhotos['Event Start Image'] = saRecord.event_start_photo;
          if (saRecord.event_start_time) {
            existingTimestamps['Event Start Photo Proof'] = saRecord.event_start_time;
            existingTimestamps['Event Start Image'] = saRecord.event_start_time;
          }
        }
      }
    }

    // Check local staffProofs fallback (strictly for this staff member's key and matching stage)
    const staffKey = `${booking.orderId}_${booking.eventId || 'ev'}_${booking.assignmentId || 'no_asst'}_${staffName.trim().toLowerCase()}`;
    const genKey = `${booking.orderId}_gen_${booking.assignmentId || 'no_asst'}_${staffName.trim().toLowerCase()}`;
    const localProofObj = staffProofs[booking.key] || staffProofs[staffKey] || staffProofs[genKey];
    if (localProofObj) {
      if (stage === 'Equipment Handover' && localProofObj.equipmentHandoverProofs) {
        for (const p of localProofObj.equipmentHandoverProofs) {
          if (p.photoUrl) {
            existingPhotos['Equipment Handover Photo Proof'] = p.photoUrl;
            existingPhotos['Equipment Handover Image'] = p.photoUrl;
            existingPhotos['Asset Return Photo Proof'] = p.photoUrl;
            if (p.capturedAt) {
              existingTimestamps['Equipment Handover Photo Proof'] = p.capturedAt;
              existingTimestamps['Equipment Handover Image'] = p.capturedAt;
              existingTimestamps['Asset Return Photo Proof'] = p.capturedAt;
            }
          }
        }
      }
      if (stage === 'Event Complete' && localProofObj.completeProofs) {
        for (const p of localProofObj.completeProofs) {
          if (p.photoUrl) {
            existingPhotos['Event Completion Photo Proof'] = p.photoUrl;
            if (p.capturedAt) {
              existingTimestamps['Event Completion Photo Proof'] = p.capturedAt;
            }
          }
        }
      }
      if (stage === 'Event Start' || stage === 'Equipment Received') {
        if (localProofObj.equipmentReceivedProofs) {
          for (const p of localProofObj.equipmentReceivedProofs) {
            if (p.photoUrl) {
              existingPhotos['Asset Collection Photo Proof'] = existingPhotos['Asset Collection Photo Proof'] || p.photoUrl;
              existingPhotos['Equipment Received Image'] = existingPhotos['Equipment Received Image'] || p.photoUrl;
              existingPhotos['Equipment Received / Asset Picture'] = existingPhotos['Equipment Received / Asset Picture'] || p.photoUrl;
              if (p.capturedAt) {
                existingTimestamps['Asset Collection Photo Proof'] = existingTimestamps['Asset Collection Photo Proof'] || p.capturedAt;
                existingTimestamps['Equipment Received Image'] = existingTimestamps['Equipment Received Image'] || p.capturedAt;
                existingTimestamps['Equipment Received / Asset Picture'] = existingTimestamps['Equipment Received / Asset Picture'] || p.capturedAt;
              }
            }
          }
        }
        if (localProofObj.eventStartProofs) {
          for (const p of localProofObj.eventStartProofs) {
            if (p.photoUrl) {
              if ((p.equipmentName || '').toLowerCase().includes('asset collection') || (p.equipmentName || '').toLowerCase().includes('equipment received')) {
                existingPhotos['Asset Collection Photo Proof'] = existingPhotos['Asset Collection Photo Proof'] || p.photoUrl;
                existingPhotos['Equipment Received Image'] = existingPhotos['Equipment Received Image'] || p.photoUrl;
                existingPhotos['Equipment Received / Asset Picture'] = existingPhotos['Equipment Received / Asset Picture'] || p.photoUrl;
                if (p.capturedAt) {
                  existingTimestamps['Asset Collection Photo Proof'] = existingTimestamps['Asset Collection Photo Proof'] || p.capturedAt;
                  existingTimestamps['Equipment Received Image'] = existingTimestamps['Equipment Received Image'] || p.capturedAt;
                  existingTimestamps['Equipment Received / Asset Picture'] = existingTimestamps['Equipment Received / Asset Picture'] || p.capturedAt;
                }
              } else if ((p.equipmentName || '').toLowerCase().includes('event start')) {
                existingPhotos['Event Start Photo Proof'] = existingPhotos['Event Start Photo Proof'] || p.photoUrl;
                existingPhotos['Event Start Image'] = existingPhotos['Event Start Image'] || p.photoUrl;
                if (p.capturedAt) {
                  existingTimestamps['Event Start Photo Proof'] = existingTimestamps['Event Start Photo Proof'] || p.capturedAt;
                  existingTimestamps['Event Start Image'] = existingTimestamps['Event Start Image'] || p.capturedAt;
                }
              }
            }
          }
        }
      }
    }

    // Direct booking fallbacks
    if (booking.equipmentReceivedPhoto) {
      existingPhotos['Asset Collection Photo Proof'] = existingPhotos['Asset Collection Photo Proof'] || booking.equipmentReceivedPhoto;
      existingPhotos['Equipment Received Image'] = existingPhotos['Equipment Received Image'] || booking.equipmentReceivedPhoto;
      existingPhotos['Equipment Received / Asset Picture'] = existingPhotos['Equipment Received / Asset Picture'] || booking.equipmentReceivedPhoto;
    }
    if (booking.eventStartPhoto) {
      existingPhotos['Event Start Photo Proof'] = existingPhotos['Event Start Photo Proof'] || booking.eventStartPhoto;
      existingPhotos['Event Start Image'] = existingPhotos['Event Start Image'] || booking.eventStartPhoto;
    }
    if (booking.equipmentHandoverPhoto) {
      existingPhotos['Equipment Handover Photo Proof'] = existingPhotos['Equipment Handover Photo Proof'] || booking.equipmentHandoverPhoto;
      existingPhotos['Equipment Handover Image'] = existingPhotos['Equipment Handover Image'] || booking.equipmentHandoverPhoto;
      existingPhotos['Asset Return Photo Proof'] = existingPhotos['Asset Return Photo Proof'] || booking.equipmentHandoverPhoto;
    }
    if (booking.eventEndPhoto) {
      existingPhotos['Event Completion Photo Proof'] = existingPhotos['Event Completion Photo Proof'] || booking.eventEndPhoto;
    }

    // Booking timestamp fallback
    if (booking.equipmentReceivedTime) {
      existingTimestamps['Asset Collection Photo Proof'] = existingTimestamps['Asset Collection Photo Proof'] || booking.equipmentReceivedTime;
      existingTimestamps['Equipment Received Image'] = existingTimestamps['Equipment Received Image'] || booking.equipmentReceivedTime;
      existingTimestamps['Equipment Received / Asset Picture'] = existingTimestamps['Equipment Received / Asset Picture'] || booking.equipmentReceivedTime;
    }
    if (booking.eventStartPhotoTime) {
      existingTimestamps['Event Start Photo Proof'] = existingTimestamps['Event Start Photo Proof'] || booking.eventStartPhotoTime;
      existingTimestamps['Event Start Image'] = existingTimestamps['Event Start Image'] || booking.eventStartPhotoTime;
    }
    if (booking.eventEndPhotoTime) {
      existingTimestamps['Event Completion Photo Proof'] = existingTimestamps['Event Completion Photo Proof'] || booking.eventEndPhotoTime;
    }
    if (booking.equipmentHandoverTime) {
      existingTimestamps['Equipment Handover Photo Proof'] = existingTimestamps['Equipment Handover Photo Proof'] || booking.equipmentHandoverTime;
      existingTimestamps['Equipment Handover Image'] = existingTimestamps['Equipment Handover Image'] || booking.equipmentHandoverTime;
      existingTimestamps['Asset Return Photo Proof'] = existingTimestamps['Asset Return Photo Proof'] || booking.equipmentHandoverTime;
    }

    const existingRawLink = resolveRawFootageLink(
      booking.orderId,
      booking.assignmentId,
      booking.eventId,
      booking.eventName,
      booking.rawFootageLink || saRecord?.raw_footage_link
    );

    setModalPhotos(existingPhotos);
    setModalPhotoTimestamps(existingTimestamps);
    setModalRawFootageLink(existingRawLink || '');
    setPhotoModalData({ booking, stage });
  };

  // File Upload / Camera capture handler
  const handlePhotoCapture = async (eqName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !photoModalData) return;
    const file = e.target.files[0];
    const { booking, stage } = photoModalData;

    const hasEquipment = Boolean(booking?.equipmentItems && booking.equipmentItems.length > 0);

    // Enforce Event Start ordering rule ONLY if staff has equipment assigned: Must have Equipment Received image before Event Start image
    if (hasEquipment && stage === 'Event Start' && (eqName === 'Event Start Photo Proof' || eqName === 'Event Start Image')) {
      const hasAssetColl = !!modalPhotos['Asset Collection Photo Proof'] || 
        !!modalPhotos['Equipment Received Image'] ||
        !!modalPhotos['Equipment Received / Asset Picture'] ||
        !!modalPhotos['Equipment Received'];

      if (!hasAssetColl) {
        e.target.value = '';
        showToast("⚠️ Please upload the Equipment Received Image before uploading the Event Start Image.");
        return;
      }
    }

    try {
      setUploadingItemKey(eqName);
      const captureTime = new Date().toISOString();
      const compressedBase64 = await compressImage(file);

      // Upload immediately to storage
      const prefix = stage === 'Event Start' 
        ? ((eqName === 'Event Start Photo Proof' || eqName === 'Event Start Image') ? 'EventStart' : 'AssetCollection')
        : stage === 'Equipment Handover' ? 'EquipmentHandover'
        : stage.replace(/\s+/g, '_');
      const fileName = `proofs/${booking.orderId || booking.leadId}_${prefix}_${Date.now()}.jpg`;
      const uploadedUrl = (await safeUploadImage(compressedBase64, fileName)) || compressedBase64;

      setModalPhotos(prev => {
        const next = { ...prev, [eqName]: uploadedUrl };
        if (eqName === 'Asset Collection Photo Proof' || eqName.startsWith('Asset Collection:') || eqName === 'Equipment Received Image' || eqName === 'Equipment Received / Asset Picture' || eqName === 'Equipment Received') {
          next['Equipment Received Image'] = uploadedUrl;
          next['Equipment Received / Asset Picture'] = uploadedUrl;
          next['Asset Collection Photo Proof'] = uploadedUrl;
          next['Equipment Received'] = uploadedUrl;
        }
        if (eqName === 'Event Start Photo Proof' || eqName === 'Event Start Image') {
          next['Event Start Photo Proof'] = uploadedUrl;
          next['Event Start Image'] = uploadedUrl;
        }
        if (eqName === 'Equipment Handover Photo Proof' || eqName === 'Equipment Handover Image' || eqName === 'Asset Return Photo Proof' || eqName === 'Equipment Handover' || eqName.startsWith('Equipment Handover:') || eqName.startsWith('Asset Return:')) {
          next['Equipment Handover Photo Proof'] = uploadedUrl;
          next['Equipment Handover Image'] = uploadedUrl;
          next['Asset Return Photo Proof'] = uploadedUrl;
          next['Equipment Handover'] = uploadedUrl;
        }
        return next;
      });
      setModalPhotoTimestamps(prev => {
        const next = { ...prev, [eqName]: captureTime };
        if (eqName === 'Asset Collection Photo Proof' || eqName.startsWith('Asset Collection:') || eqName === 'Equipment Received Image' || eqName === 'Equipment Received / Asset Picture' || eqName === 'Equipment Received') {
          next['Equipment Received Image'] = captureTime;
          next['Equipment Received / Asset Picture'] = captureTime;
          next['Asset Collection Photo Proof'] = captureTime;
          next['Equipment Received'] = captureTime;
        }
        if (eqName === 'Event Start Photo Proof' || eqName === 'Event Start Image') {
          next['Event Start Photo Proof'] = captureTime;
          next['Event Start Image'] = captureTime;
        }
        if (eqName === 'Equipment Handover Photo Proof' || eqName === 'Equipment Handover Image' || eqName === 'Asset Return Photo Proof' || eqName === 'Equipment Handover' || eqName.startsWith('Equipment Handover:') || eqName.startsWith('Asset Return:')) {
          next['Equipment Handover Photo Proof'] = captureTime;
          next['Equipment Handover Image'] = captureTime;
          next['Asset Return Photo Proof'] = captureTime;
          next['Equipment Handover'] = captureTime;
        }
        return next;
      });

      // Save immediately to database and localStorage without advancing the event stage/status
      if (stage === 'Event Start') {
        const isAssetPhoto = eqName !== 'Event Start Photo Proof' && eqName !== 'Event Start Image';
        const matchingSA = staffAssignments?.find(sa => {
          if (!sa || sa.order_id !== booking.orderId) return false;
          if ((sa.staff_name || '').trim().toLowerCase() !== staffName.trim().toLowerCase()) return false;
          if (booking.assignmentId && sa.assignment_id && sa.assignment_id === booking.assignmentId) return true;
          if (booking.eventId && booking.eventId !== 'ev' && sa.event_id && sa.event_id === booking.eventId) return true;
          if ((!booking.eventId || booking.eventId === 'ev') && booking.eventName && sa.event_name && sa.event_name.trim().toLowerCase() === booking.eventName.trim().toLowerCase()) return true;
          return false;
        });
        const targetAssignmentId = booking.assignmentId || matchingSA?.assignment_id || null;

        if (isAssetPhoto) {
          const assetId = booking.equipmentItems?.find((eq: any) => eq.name === eqName)?.assetId || booking.equipmentItems?.[0]?.assetId || 'Asset Collection';
          const historyRecord = {
            lead_id: booking.leadId || null,
            order_id: booking.orderId || null,
            assignment_id: targetAssignmentId,
            equipment_name: eqName,
            equipment_status: 'Equipment Received',
            returned_by: staffName,
            returned_at: captureTime,
            photo_url: uploadedUrl,
            asset_id: assetId,
            proof_type: 'Equipment Received',
            event_id: booking.eventId || null,
            event_name: booking.eventName || null,
            remarks: JSON.stringify({
              assignment_id: targetAssignmentId || '',
              asset_id: assetId,
              proof_type: 'Equipment Received',
              staff_name: staffName,
              staff_role: booking.assignedRole || '',
              staff_id: staffMember?.id || currentUser?.id || '',
              photo_url: uploadedUrl,
              event_id: booking.eventId || 'ev',
              event_name: booking.eventName,
              order_id: booking.orderId,
              lead_id: booking.leadId,
              uploaded_at: captureTime,
              uploaded_by: staffName,
              current_status: staffStatuses[booking.key] || 'Assigned Crew'
            })
          };
          await pushInsert('lead_equipment_history', historyRecord);

          // Update assignment equipment_received_photo immediately
          if (targetAssignmentId) {
            const existingSA = staffAssignments?.find(sa => sa.assignment_id === targetAssignmentId);
            let existingProofs: any = {};
            if (existingSA?.proofs) {
              try {
                existingProofs = typeof existingSA.proofs === 'string' ? JSON.parse(existingSA.proofs) : existingSA.proofs;
              } catch (e) {}
            }
            await pushUpdate('staff_assignments', 'assignment_id', targetAssignmentId, {
              equipment_received_photo: uploadedUrl,
              equipment_received_time: captureTime,
              proofs: {
                ...existingProofs,
                equipment_received_photo: uploadedUrl,
                equipment_received_time: captureTime,
                equipment_received_date: captureTime.split('T')[0]
              }
            });
          }

          // Update local staffProofs cache
          const existingProofs = staffProofs[booking.key] || {};
          const prevEqProofs = existingProofs.equipmentReceivedProofs || [];
          const nextEqProofs = [...prevEqProofs.filter((p: any) => p.equipmentName !== eqName), {
            equipmentName: eqName,
            assetId: assetId,
            photoUrl: uploadedUrl,
            capturedAt: captureTime
          }];
          const nextProofs = {
            ...staffProofs,
            [booking.key]: {
              ...existingProofs,
              equipmentReceivedProofs: nextEqProofs
            }
          };
          setStaffProofs(nextProofs);
          localStorage.setItem('staff_equipment_proofs_v2', JSON.stringify(nextProofs));
        } else {
          // Event Start photo
          const startHistoryRecord = {
            lead_id: booking.leadId || null,
            order_id: booking.orderId || null,
            assignment_id: targetAssignmentId,
            equipment_name: 'Event Start',
            equipment_status: 'Event Started',
            returned_by: staffName,
            returned_at: captureTime,
            photo_url: uploadedUrl,
            asset_id: 'Event Start',
            proof_type: 'Event Start',
            event_id: booking.eventId || null,
            event_name: booking.eventName || null,
            remarks: JSON.stringify({
              assignment_id: targetAssignmentId || '',
              asset_id: 'Event Start',
              proof_type: 'Event Start',
              staff_name: staffName,
              staff_role: booking.assignedRole || '',
              staff_id: staffMember?.id || currentUser?.id || '',
              photo_url: uploadedUrl,
              event_id: booking.eventId || 'ev',
              event_name: booking.eventName,
              order_id: booking.orderId,
              lead_id: booking.leadId,
              uploaded_at: captureTime,
              uploaded_by: staffName,
              current_status: staffStatuses[booking.key] || 'Assigned Crew'
            })
          };
          await pushInsert('lead_equipment_history', startHistoryRecord);

          // Update assignment event_start_photo immediately
          if (targetAssignmentId) {
            const existingSA = staffAssignments?.find(sa => sa.assignment_id === targetAssignmentId);
            let existingProofs: any = {};
            if (existingSA?.proofs) {
              try {
                existingProofs = typeof existingSA.proofs === 'string' ? JSON.parse(existingSA.proofs) : existingSA.proofs;
              } catch (e) {}
            }
            await pushUpdate('staff_assignments', 'assignment_id', targetAssignmentId, {
              event_start_photo: uploadedUrl,
              event_start_time: captureTime,
              proofs: {
                ...existingProofs,
                event_start_photo: uploadedUrl,
                event_start_time: captureTime,
                event_start_date: captureTime.split('T')[0]
              }
            });
          }

          // Update local staffProofs cache
          const existingProofs = staffProofs[booking.key] || {};
          const prevStartProofs = existingProofs.eventStartProofs || [];
          const nextStartProofs = [...prevStartProofs.filter((p: any) => p.equipmentName !== 'Event Start Photo Proof'), {
            equipmentName: 'Event Start Photo Proof',
            assetId: 'Event Start',
            photoUrl: uploadedUrl,
            capturedAt: captureTime
          }];
          const nextProofs = {
            ...staffProofs,
            [booking.key]: {
              ...existingProofs,
              eventStartProofs: nextStartProofs
            }
          };
          setStaffProofs(nextProofs);
          localStorage.setItem('staff_equipment_proofs_v2', JSON.stringify(nextProofs));
        }

        showToast("✓ Image uploaded and saved successfully!");
      } else if (stage === 'Equipment Handover') {
        const matchingSA = staffAssignments?.find(sa => {
          if (!sa || sa.order_id !== booking.orderId) return false;
          if ((sa.staff_name || '').trim().toLowerCase() !== staffName.trim().toLowerCase()) return false;
          if (booking.assignmentId && sa.assignment_id && sa.assignment_id === booking.assignmentId) return true;
          if (booking.eventId && booking.eventId !== 'ev' && sa.event_id && sa.event_id === booking.eventId) return true;
          if ((!booking.eventId || booking.eventId === 'ev') && booking.eventName && sa.event_name && sa.event_name.trim().toLowerCase() === booking.eventName.trim().toLowerCase()) return true;
          return false;
        });
        const targetAssignmentId = booking.assignmentId || matchingSA?.assignment_id || null;
        const assetId = booking.equipmentItems?.find((eq: any) => eq.name === eqName)?.assetId || booking.equipmentItems?.[0]?.assetId || 'Equipment Handover';

        const historyRecord = {
          lead_id: booking.leadId || null,
          order_id: booking.orderId || null,
          assignment_id: targetAssignmentId,
          equipment_name: eqName,
          equipment_status: 'Equipment Handover Completed',
          returned_by: staffName,
          returned_at: captureTime,
          photo_url: uploadedUrl,
          asset_id: assetId,
          proof_type: 'Equipment Handover',
          event_id: booking.eventId || null,
          event_name: booking.eventName || null,
          remarks: JSON.stringify({
            assignment_id: targetAssignmentId || '',
            asset_id: assetId,
            proof_type: 'Equipment Handover',
            staff_name: staffName,
            staff_role: booking.assignedRole || '',
            staff_id: staffMember?.id || currentUser?.id || '',
            photo_url: uploadedUrl,
            event_id: booking.eventId || 'ev',
            event_name: booking.eventName,
            order_id: booking.orderId,
            lead_id: booking.leadId,
            uploaded_at: captureTime,
            uploaded_by: staffName,
            current_status: staffStatuses[booking.key] || 'Event Ended'
          })
        };
        await pushInsert('lead_equipment_history', historyRecord);

        // Update assignment equipment_handover_photo immediately
        if (targetAssignmentId) {
          const existingSA = staffAssignments?.find(sa => sa.assignment_id === targetAssignmentId);
          let existingProofs: any = {};
          if (existingSA?.proofs) {
            try {
              existingProofs = typeof existingSA.proofs === 'string' ? JSON.parse(existingSA.proofs) : existingSA.proofs;
            } catch (e) {}
          }
          await pushUpdate('staff_assignments', 'assignment_id', targetAssignmentId, {
            equipment_handover_photo: uploadedUrl,
            equipment_handover_time: captureTime,
            equipment_handover_date: captureTime.split('T')[0],
            proofs: {
              ...existingProofs,
              equipment_handover_photo: uploadedUrl,
              equipment_handover_time: captureTime,
              equipment_handover_date: captureTime.split('T')[0]
            }
          });
        }

        // Update local staffProofs cache
        const existingProofs = staffProofs[booking.key] || {};
        const prevHandoverProofs = existingProofs.equipmentHandoverProofs || [];
        const nextHandoverProofs = [...prevHandoverProofs.filter((p: any) => p.equipmentName !== eqName), {
          equipmentName: eqName,
          assetId: assetId,
          photoUrl: uploadedUrl,
          capturedAt: captureTime
        }];
        const nextProofs = {
          ...staffProofs,
          [booking.key]: {
            ...existingProofs,
            equipmentHandoverProofs: nextHandoverProofs
          }
        };
        setStaffProofs(nextProofs);
        localStorage.setItem('staff_equipment_proofs_v2', JSON.stringify(nextProofs));

        showToast("✓ Equipment Handover photo saved!");
      }
    } catch (err) {
      console.error('Error processing photo:', err);
      showToast('❌ Failed to process photo. Please try again.');
    } finally {
      setUploadingItemKey(null);
    }
  };

  // Submit Equipment Photos & Update Task Status
  const handleConfirmStatusUpdate = async () => {
    if (!photoModalData || isSubmitting) return;
    const { booking, stage } = photoModalData;
    setSubmitError(null);

    // --- EVENT START WORKFLOW ---
    if (stage === 'Event Start') {
      const hasEquipment = Boolean(booking.equipmentItems && booking.equipmentItems.length > 0);
      const isMultiEq = hasEquipment && booking.equipmentItems.length > 1;
      const assetKeys = hasEquipment ? booking.equipmentItems.map((eq: any) => eq.name) : [];
      const hasAssetColl = hasEquipment
        ? (!!modalPhotos['Asset Collection Photo Proof'] || !!modalPhotos['Equipment Received Image'] || !!modalPhotos['Equipment Received / Asset Picture'] || !!modalPhotos['Equipment Received'])
        : true;
      const hasEventStart = !!modalPhotos['Event Start Photo Proof'] || !!modalPhotos['Event Start Image'];

      // Strict Image Upload Validation before submitting
      const missingList: string[] = [];
      if (hasEquipment && !hasAssetColl) {
        missingList.push('1. Equipment Received Image');
      }
      if (!hasEventStart) {
        missingList.push('2. Event Start Image');
      }

      if (missingList.length > 0) {
        setSubmitError({
          title: 'EVENT SUBMISSION CANNOT BE COMPLETED',
          message: 'The following required image(s) are missing to start the event:',
          details: missingList
        });
        return;
      }

      try {
        setIsSubmitting(true);
        const timestamp = new Date().toISOString();

        const allProofsToSave: EquipmentProofItem[] = [];

          // A. Save / verify Asset Images
          for (const itemKey of assetKeys) {
            const rawUrl = modalPhotos[itemKey] || modalPhotos['Asset Collection Photo Proof'] || modalPhotos['Equipment Received / Asset Picture'];
            if (!rawUrl) continue;

            const isNewAsset = !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://');
            const fileName = `proofs/${booking.orderId || booking.leadId}_AssetCollection_${Date.now()}.jpg`;
            const finalUrl = await safeUploadImage(rawUrl, fileName);

            if (!finalUrl) {
              throw new Error("Failed to upload Equipment Received / Asset Picture.");
            }

            // Capture exact system timestamp at the moment upload completes
            const assetUploadTime = isNewAsset
              ? new Date().toISOString()
              : (modalPhotoTimestamps[itemKey] || modalPhotoTimestamps['Asset Collection Photo Proof'] || modalPhotoTimestamps['Equipment Received / Asset Picture'] || booking.equipmentReceivedTime || new Date().toISOString());

            const eqName = itemKey;
            const assetId = booking.equipmentItems?.find((eq: any) => eq.name === itemKey)?.assetId || 'Asset Collection';

            allProofsToSave.push({
              equipmentName: eqName,
              assetId: assetId,
              photoUrl: finalUrl,
              capturedAt: assetUploadTime
            });

            const historyRecord = {
              lead_id: booking.leadId || null,
              order_id: booking.orderId || null,
              assignment_id: booking.assignmentId || null,
              equipment_name: eqName,
              equipment_status: 'Equipment Received',
              returned_by: staffName,
              returned_at: assetUploadTime,
              remarks: JSON.stringify({
                assignment_id: booking.assignmentId || '',
                asset_id: assetId,
                proof_type: 'Equipment Received',
                staff_name: staffName,
                staff_role: booking.assignedRole || '',
                staff_id: staffMember?.id || currentUser?.id || '',
                photo_url: finalUrl,
                event_id: booking.eventId || 'ev',
                event_name: booking.eventName,
                order_id: booking.orderId,
                lead_id: booking.leadId,
                uploaded_at: assetUploadTime,
                uploaded_by: staffName,
                current_status: 'Event Started'
              })
            };

            await pushInsert('lead_equipment_history', historyRecord);
          }

          // B. Save Event Start Image (strictly to event_start_photo)
          const rawStartUrl = modalPhotos['Event Start Photo Proof'] || modalPhotos['Event Start Image'];
          if (!rawStartUrl) {
            setSubmitError({
              title: 'EVENT SUBMISSION CANNOT BE COMPLETED',
              message: 'Event Start Image is missing. Please capture or upload a photo to start the event.'
            });
            setIsSubmitting(false);
            return;
          }

          const isNewStart = !rawStartUrl.startsWith('http://') && !rawStartUrl.startsWith('https://');
          const startFileName = `proofs/${booking.orderId || booking.leadId}_EventStart_${Date.now()}.jpg`;
          const finalStartUrl = (await safeUploadImage(rawStartUrl, startFileName)) || rawStartUrl;

          // Capture exact system timestamp at the moment upload completes
          const startUploadTime = isNewStart
            ? new Date().toISOString()
            : (modalPhotoTimestamps['Event Start Photo Proof'] || modalPhotoTimestamps['Event Start Image'] || booking.eventStartPhotoTime || new Date().toISOString());

          allProofsToSave.push({
            equipmentName: 'Event Start Photo Proof',
            assetId: 'Event Start',
            photoUrl: finalStartUrl,
            capturedAt: startUploadTime
          });

          const startHistoryRecord = {
            lead_id: booking.leadId || null,
            order_id: booking.orderId || null,
            assignment_id: booking.assignmentId || null,
            equipment_name: 'Event Start',
            equipment_status: 'Event Started',
            returned_by: staffName,
            returned_at: startUploadTime,
            photo_url: finalStartUrl,
            asset_id: 'Event Start',
            proof_type: 'Event Start',
            event_id: booking.eventId || null,
            event_name: booking.eventName || null,
            remarks: JSON.stringify({
              assignment_id: booking.assignmentId || '',
              asset_id: 'Event Start',
              proof_type: 'Event Start',
              staff_name: staffName,
              staff_role: booking.assignedRole || '',
              staff_id: staffMember?.id || currentUser?.id || '',
              photo_url: finalStartUrl,
              event_id: booking.eventId || 'ev',
              event_name: booking.eventName,
              order_id: booking.orderId,
              lead_id: booking.leadId,
              uploaded_at: startUploadTime,
              uploaded_by: staffName,
              current_status: 'Event Started'
            })
          };

          try {
            await pushInsert('lead_equipment_history', startHistoryRecord);
          } catch (startHistErr) {
            console.warn('[StaffModule] Error inserting start history record:', startHistErr);
          }

          // Update local statuses & localStorage
          const nextStatuses = {
            ...staffStatuses,
            [booking.key]: 'Event Started'
          };
          setStaffStatuses(nextStatuses);
          localStorage.setItem('staff_event_statuses_v2', JSON.stringify(nextStatuses));

          const existingProofs = staffProofs[booking.key] || {};
          const updatedEventProofs = {
            ...existingProofs,
            eventStartProofs: allProofsToSave
          };
          const nextProofs = {
            ...staffProofs,
            [booking.key]: updatedEventProofs
          };
          setStaffProofs(nextProofs);
          localStorage.setItem('staff_equipment_proofs_v2', JSON.stringify(nextProofs));

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('staff_status_updated'));
          }

          // Update database tables: staff_assignments, operations, orders, leads
          if (booking.orderId) {
            const matchingSA = staffAssignments?.find(sa => {
              if (!sa || sa.order_id !== booking.orderId) return false;
              if (!sa.staff_name || sa.staff_name.trim().toLowerCase() !== staffName.trim().toLowerCase()) return false;
              if (booking.assignmentId && sa.assignment_id && sa.assignment_id === booking.assignmentId) return true;
              if (booking.eventId && booking.eventId !== 'ev' && sa.event_id && sa.event_id === booking.eventId) return true;
              if ((!booking.eventId || booking.eventId === 'ev') && booking.eventName && sa.event_name && sa.event_name.trim().toLowerCase() === booking.eventName.trim().toLowerCase()) return true;
              return false;
            });

            const eqReceivedPhotoItem = allProofsToSave.find(p => p.equipmentName !== 'Event Start Photo Proof');
            const eqReceivedPhoto = eqReceivedPhotoItem ? eqReceivedPhotoItem.photoUrl : undefined;
            const startPhotoUrl = allProofsToSave.find(p => p.equipmentName === 'Event Start Photo Proof')?.photoUrl;
            let targetAssignmentId = booking.assignmentId || matchingSA?.assignment_id;
            if (!targetAssignmentId && staffAssignments) {
              const fallbackSA = staffAssignments.find(sa => 
                sa.order_id === booking.orderId && 
                (sa.staff_name || '').trim().toLowerCase() === staffName.trim().toLowerCase() &&
                ((booking.eventId && sa.event_id === booking.eventId) || (booking.eventName && sa.event_name?.trim().toLowerCase() === booking.eventName.trim().toLowerCase()))
              );
              if (fallbackSA) {
                targetAssignmentId = fallbackSA.assignment_id;
              }
            }

            const existingSA = staffAssignments?.find(sa => sa.assignment_id === targetAssignmentId || (matchingSA && sa.assignment_id === matchingSA.assignment_id));

            const startProofItem = allProofsToSave.find(p => p.equipmentName === 'Event Start Photo Proof');
            const eqProofItem = allProofsToSave.find(p => p.equipmentName !== 'Event Start Photo Proof');
            const actualStartTime = startProofItem?.capturedAt || new Date().toISOString();
            const actualEqTime = eqProofItem?.capturedAt || booking.equipmentReceivedTime || new Date().toISOString();

            let existingProofs: any = {};
            if (existingSA?.proofs) {
              try {
                existingProofs = typeof existingSA.proofs === 'string' ? JSON.parse(existingSA.proofs) : existingSA.proofs;
              } catch (e) {}
            }
            const updatedProofs = {
              ...existingProofs,
              ...(eqReceivedPhoto ? {
                equipment_received_photo: eqReceivedPhoto,
                equipment_received_time: actualEqTime,
                equipment_received_date: actualEqTime.split('T')[0]
              } : {}),
              ...(startPhotoUrl ? {
                event_start_photo: startPhotoUrl,
                event_start_time: actualStartTime,
                event_start_date: actualStartTime.split('T')[0]
              } : {})
            };

            if (existingSA) {
              targetAssignmentId = existingSA.assignment_id;
              await pushUpdate('staff_assignments', 'assignment_id', targetAssignmentId, {
                task_status: 'Event Started',
                assignment_status: 'Assigned',
                updated_at: timestamp,
                updated_by: staffName,
                proofs: updatedProofs,
                ...(eqReceivedPhoto ? { equipment_received_photo: eqReceivedPhoto, equipment_received_time: actualEqTime } : {}),
                ...(startPhotoUrl ? { event_start_photo: startPhotoUrl, event_start_time: actualStartTime } : {})
              });
            } else {
              const newAssignmentId = targetAssignmentId || `SA-${booking.orderId}-${booking.eventId || 'ev'}-${Date.now()}`;
              targetAssignmentId = newAssignmentId;
              await pushInsert('staff_assignments', {
                assignment_id: newAssignmentId,
                order_id: booking.orderId,
                lead_id: booking.leadId || null,
                event_id: booking.eventId || null,
                event_name: booking.eventName || null,
                event_date: booking.eventDate || null,
                staff_name: staffName,
                staff_role: booking.assignedRole || 'Staff',
                task_status: 'Event Started',
                assignment_status: 'Assigned',
                updated_at: timestamp,
                updated_by: staffName,
                proofs: updatedProofs,
                ...(eqReceivedPhoto ? { equipment_received_photo: eqReceivedPhoto, equipment_received_time: actualEqTime } : {}),
                ...(startPhotoUrl ? { event_start_photo: startPhotoUrl, event_start_time: actualStartTime } : {})
              });
            }

            // Insert into dedicated staff_task_submissions audit table
            try {
              await pushInsert('staff_task_submissions', {
                assignment_id: targetAssignmentId || null,
                order_id: booking.orderId,
                lead_id: booking.leadId || null,
                event_id: booking.eventId || null,
                event_name: booking.eventName || null,
                staff_name: staffName,
                staff_role: booking.assignedRole || null,
                staff_id: staffMember?.id || currentUser?.id || null,
                submission_type: 'event_start',
                task_status: 'Event Started',
                photo_url: startPhotoUrl || eqReceivedPhoto || null,
                proof_photos: allProofsToSave,
                remarks: `Event started by ${staffName} on ${timestamp}`,
                created_at: timestamp
              });
            } catch (subErr) {
              console.warn('[StaffModule] staff_task_submissions insert fallback note:', subErr);
            }

            // Wrap parent status updates safely so minor errors never crash submission
            try {
              const allStaffStatuses = getAllStaffStatusesForOrder(booking.orderId, staffName, 'Event Started', nextStatuses, orders, leads, staffAssignments);
              const currentOrd = orders?.find(o => o.order_id === booking.orderId);
              const currentLead = leads?.find(l => l.lead_id === (currentOrd?.lead_id || booking.leadId || booking.orderId));
              const calculatedOverallStage = getCalculatedOrderStage(
                currentOrd?.current_stage || currentLead?.current_status || currentLead?.status || 'Assigned Crew',
                allStaffStatuses
              );

              const currentStage = currentOrd?.current_stage || currentLead?.current_status || currentLead?.status || 'Assigned Crew';
              const payload: any = {
                remarks: `Event Started by ${staffName} on ${timestamp}`
              };
              if (calculatedOverallStage !== currentStage) {
                 payload.event_status = calculatedOverallStage;
                 payload.remarks += ` (Parent status updated to ${calculatedOverallStage})`;
              } else {
                 payload.remarks += ` (Waiting for remaining assigned crew to start)`;
              }

              await pushUpdate('operations', 'order_id', booking.orderId, payload);

              if (calculatedOverallStage !== currentStage) {
                await pushUpdate('orders', 'order_id', booking.orderId, {
                  current_stage: calculatedOverallStage,
                  updated_by: staffName,
                  updated_at: timestamp
                });

                if (booking.leadId) {
                  await updateLead(booking.leadId, {
                    status: calculatedOverallStage as any,
                    current_status: calculatedOverallStage as any,
                    updated_by: staffName
                  });
                }
              }
            } catch (parentErr) {
              console.warn('[StaffModule] Parent status update warning on Event Start:', parentErr);
            }
          }

          // Close modal immediately and restore scrolling
          closePhotoModal();
          showToast("✅ Event Started confirmed and saved successfully!");

          try {
            await refreshData();
          } catch (e) {
            console.warn('refreshData error ignored:', e);
          }
      } catch (error: any) {
        console.error('Error updating Event Start status:', error);
        setSubmitError({
          title: 'EVENT SUBMISSION FAILED',
          message: error?.message || 'An error occurred while uploading images or updating status. Please try again.'
        });
        showToast(`❌ ${error?.message || 'Failed to update status.'}`);
        if (photoModalScrollRef.current) {
          photoModalScrollRef.current.scrollTop = 0;
        }
      } finally {
        setIsSubmitting(false);
        document.body.style.overflow = '';
        closePhotoModal();
      }
      return;
    }

    // --- OTHER STAGES (Event Complete, Equipment Handover, Equipment Received) ---
    let reqItems: { name: string; assetId: string; optional?: boolean }[] = [];
    const hasEquipment = Boolean(booking.equipmentItems && booking.equipmentItems.length > 0);

    if (stage === 'Event Complete') {
      reqItems = [{ name: 'Event Completion Photo Proof', assetId: 'Event Completion' }];
    } else if (stage === 'Equipment Handover') {
      if (hasEquipment) {
        reqItems = [{ name: 'Asset Return Photo Proof', displayName: 'Equipment Handover Image', assetId: booking.equipmentItems[0]?.assetId || 'Equipment Handover', optional: false }];
      } else {
        reqItems = [];
      }
    } else if (stage === 'Equipment Received') {
      if (hasEquipment) {
        reqItems = booking.equipmentItems.map((eq: any) => ({ name: eq.name, assetId: eq.assetId || eq.name, optional: false }));
      } else {
        reqItems = [];
      }
    }

    // Validate mandatory photo proofs
    const missingOther: string[] = [];
    for (const item of reqItems) {
      if (!item.optional) {
        const hasPhoto = modalPhotos[item.name] || modalPhotos['Equipment Handover Photo Proof'] || modalPhotos['Equipment Handover Image'] || modalPhotos['Asset Return Photo Proof'] || modalPhotos['Equipment Handover'] || modalPhotos['Asset Collection Photo Proof'] || modalPhotos['Equipment Received Image'] || modalPhotos['Equipment Received / Asset Picture'];
        if (!hasPhoto) {
          missingOther.push(item.displayName || item.name);
        }
      }
    }

    // Validate mandatory Raw Footage Link for Footage Handover
    if (stage === 'Equipment Handover' && (!modalRawFootageLink || !modalRawFootageLink.trim())) {
      missingOther.push('Raw Footage Drive Link');
    }

    if (missingOther.length > 0) {
      setSubmitError({
        title: 'EVENT SUBMISSION CANNOT BE COMPLETED',
        message: 'The following required item(s) are missing:',
        details: missingOther
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const timestamp = new Date().toISOString();
      const uploadedProofs: EquipmentProofItem[] = [];

      const hasHandoverPhoto = stage === 'Equipment Handover' && hasEquipment && (
        !!modalPhotos['Equipment Handover Photo Proof'] || !!modalPhotos['Asset Return Photo Proof'] ||
        (booking.equipmentItems && booking.equipmentItems.some((eq: any) => !!modalPhotos[`Equipment Handover: ${eq.name}`]))
      );

      for (const item of reqItems) {
        let rawUrl = null;
        if (stage === 'Equipment Received') {
          rawUrl = modalPhotos[item.name] || modalPhotos['Asset Collection Photo Proof'] || modalPhotos['Equipment Received / Asset Picture'];
        } else if (stage === 'Equipment Handover') {
          rawUrl = modalPhotos[item.name] || modalPhotos['Equipment Handover Photo Proof'] || modalPhotos['Asset Return Photo Proof'];
        } else {
          rawUrl = modalPhotos[item.name];
        }
        
        if (rawUrl) {
          const isNewUpload = !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://');
          const fileName = `proofs/${booking.orderId || booking.leadId}_${stage.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
          const finalUrl = await safeUploadImage(rawUrl, fileName);

          // Capture exact system timestamp at the moment upload completes
          const itemUploadTime = isNewUpload
            ? new Date().toISOString()
            : (modalPhotoTimestamps[item.name] || modalPhotoTimestamps['Asset Collection Photo Proof'] || modalPhotoTimestamps['Equipment Handover Photo Proof'] || modalPhotoTimestamps['Event Completion Photo Proof'] || (stage === 'Event Complete' ? booking.eventEndPhotoTime : stage === 'Equipment Handover' ? booking.equipmentHandoverTime : booking.equipmentReceivedTime) || new Date().toISOString());

          uploadedProofs.push({
            equipmentName: item.name,
            assetId: item.assetId,
            photoUrl: finalUrl,
            capturedAt: itemUploadTime
          });
        }
      }

      if (uploadedProofs.length === 0) {
        let fallbackPhoto = null;
        if (stage === 'Equipment Received') {
          fallbackPhoto = modalPhotos['Asset Collection Photo Proof'] || modalPhotos['Equipment Received / Asset Picture'] || modalPhotos['Equipment Received'];
        } else if (stage === 'Equipment Handover') {
          fallbackPhoto = modalPhotos['Equipment Handover Photo Proof'] || modalPhotos['Asset Return Photo Proof'] || modalPhotos['Equipment Handover'];
        }
        if (fallbackPhoto) {
          const isNewFallback = !fallbackPhoto.startsWith('http://') && !fallbackPhoto.startsWith('https://');
          const fileName = `proofs/${booking.orderId || booking.leadId}_${stage.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
          const finalUrl = await safeUploadImage(fallbackPhoto, fileName);
          const fallbackUploadTime = isNewFallback
            ? new Date().toISOString()
            : (modalPhotoTimestamps[stage === 'Equipment Handover' ? 'Equipment Handover Photo Proof' : 'Asset Collection Photo Proof'] || (stage === 'Equipment Handover' ? booking.equipmentHandoverTime : booking.equipmentReceivedTime) || new Date().toISOString());

          uploadedProofs.push({
            equipmentName: stage === 'Equipment Handover' ? 'Equipment Handover' : 'Equipment Received',
            assetId: booking.assignmentId || stage,
            photoUrl: finalUrl,
            capturedAt: fallbackUploadTime
          });
        }
      }

      const effectiveEquipmentStatus = 
        stage === 'Event Complete' ? 'Event Ended' :
        stage === 'Equipment Handover' ? (hasEquipment ? (hasHandoverPhoto ? 'Equipment Handover Completed' : 'Equipment Not Handover') : 'Footage Handover Completed') : stage;

      let nextStatus = staffStatuses[booking.key] || 'Assigned Crew';
      if (stage === 'Event Complete') {
        nextStatus = 'Event Ended';
      } else if (stage === 'Equipment Handover') {
        nextStatus = 'Footage Handover';
      } else {
        nextStatus = stage;
      }

      const matchingSA = staffAssignments?.find(sa => {
        if (!sa || sa.order_id !== booking.orderId) return false;
        if ((sa.staff_name || '').trim().toLowerCase() !== staffName.trim().toLowerCase()) return false;
        if (booking.assignmentId && sa.assignment_id && sa.assignment_id === booking.assignmentId) return true;
        if (booking.eventId && booking.eventId !== 'ev' && sa.event_id && sa.event_id === booking.eventId) return true;
        if ((!booking.eventId || booking.eventId === 'ev') && booking.eventName && sa.event_name && sa.event_name.trim().toLowerCase() === booking.eventName.trim().toLowerCase()) return true;
        return false;
      });

      let targetAssignmentId = booking.assignmentId || matchingSA?.assignment_id;
      if (!targetAssignmentId && staffAssignments) {
        const fallbackSA = staffAssignments.find(sa => 
          sa.order_id === booking.orderId && 
          (sa.staff_name || '').trim().toLowerCase() === staffName.trim().toLowerCase() &&
          ((booking.eventId && sa.event_id === booking.eventId) || (booking.eventName && sa.event_name?.trim().toLowerCase() === booking.eventName.trim().toLowerCase()))
        );
        if (fallbackSA) {
          targetAssignmentId = fallbackSA.assignment_id;
        }
      }

      // Record lead equipment history
      if (uploadedProofs.length > 0) {
        for (const p of uploadedProofs) {
          const historyRecord = {
            lead_id: booking.leadId || null,
            order_id: booking.orderId || null,
            assignment_id: targetAssignmentId || booking.assignmentId || null,
            equipment_name: p.equipmentName,
            equipment_status: effectiveEquipmentStatus,
            returned_by: staffName,
            returned_at: p.capturedAt || timestamp,
            photo_url: p.photoUrl || null,
            asset_id: p.assetId || null,
            event_id: booking.eventId || null,
            event_name: booking.eventName || null,
            proof_type: stage === 'Event Complete' ? 'Event End' : stage,
            remarks: JSON.stringify({
              assignment_id: targetAssignmentId || booking.assignmentId || '',
              asset_id: p.assetId,
              proof_type: stage === 'Event Complete' ? 'Event End' : stage,
              staff_name: staffName,
              staff_role: booking.assignedRole || '',
              staff_id: staffMember?.id || currentUser?.id || '',
              photo_url: p.photoUrl,
              event_id: booking.eventId,
              event_name: booking.eventName,
              order_id: booking.orderId,
              lead_id: booking.leadId,
              raw_footage_link: modalRawFootageLink || null,
              uploaded_at: p.capturedAt || timestamp,
              uploaded_by: staffName,
              current_status: nextStatus
            })
          };

          await pushInsert('lead_equipment_history', historyRecord);

          // If stage is Event Complete, also record with 'Event End Photo Proof' so DB view v_task_assignment_details (which filters by 'Event End Photo Proof') populates event_end_photo
          if (stage === 'Event Complete' && p.equipmentName === 'Event Completion Photo Proof') {
            await pushInsert('lead_equipment_history', {
              ...historyRecord,
              equipment_name: 'Event End Photo Proof'
            });
          }
        }
      } else if (stage === 'Equipment Handover') {
        if (hasEquipment) {
          // Record Equipment Not Handover when photo was not uploaded for assigned equipment
          const historyRecord = {
            lead_id: booking.leadId || null,
            order_id: booking.orderId || null,
            assignment_id: targetAssignmentId || booking.assignmentId || null,
            equipment_name: 'Equipment Handover Photo Proof',
            equipment_status: 'Equipment Not Handover',
            returned_by: staffName,
            returned_at: timestamp,
            photo_url: null,
            asset_id: 'Equipment Handover',
            proof_type: 'Equipment Handover',
            event_id: booking.eventId || null,
            event_name: booking.eventName || null,
            remarks: JSON.stringify({
              assignment_id: targetAssignmentId || booking.assignmentId || '',
              asset_id: 'Equipment Handover',
              proof_type: 'Equipment Handover',
              staff_name: staffName,
              staff_role: booking.assignedRole || '',
              staff_id: staffMember?.id || currentUser?.id || '',
              photo_url: null,
              event_id: booking.eventId,
              event_name: booking.eventName,
              order_id: booking.orderId,
              lead_id: booking.leadId,
              raw_footage_link: modalRawFootageLink || null,
              uploaded_at: timestamp,
              uploaded_by: staffName,
              current_status: nextStatus
            })
          };

          await pushInsert('lead_equipment_history', historyRecord);
        } else {
          // Staff has NO equipment assigned -> Record Footage Handover
          const historyRecord = {
            lead_id: booking.leadId || null,
            order_id: booking.orderId || null,
            assignment_id: targetAssignmentId || booking.assignmentId || null,
            equipment_name: 'Equipment Handover',
            equipment_status: 'Footage Handover Completed',
            returned_by: staffName,
            returned_at: timestamp,
            photo_url: null,
            asset_id: 'Footage Handover',
            proof_type: 'Footage Handover',
            event_id: booking.eventId || null,
            event_name: booking.eventName || null,
            remarks: JSON.stringify({
              assignment_id: targetAssignmentId || booking.assignmentId || '',
              asset_id: 'Footage Handover',
              proof_type: 'Footage Handover',
              staff_name: staffName,
              staff_role: booking.assignedRole || '',
              staff_id: staffMember?.id || currentUser?.id || '',
              photo_url: null,
              event_id: booking.eventId,
              event_name: booking.eventName,
              order_id: booking.orderId,
              lead_id: booking.leadId,
              raw_footage_link: modalRawFootageLink || null,
              uploaded_at: timestamp,
              uploaded_by: staffName,
              current_status: nextStatus
            })
          };

          await pushInsert('lead_equipment_history', historyRecord);
        }
      }

      // If stage is Equipment Handover, explicitly mark every assigned equipment item as returned
      if (stage === 'Equipment Handover' && booking.equipmentItems && booking.equipmentItems.length > 0) {
        for (const eqItem of booking.equipmentItems) {
          if (!eqItem?.name) continue;
          try {
            await pushInsert('lead_equipment_history', {
              lead_id: booking.leadId || null,
              order_id: booking.orderId || null,
              assignment_id: targetAssignmentId || booking.assignmentId || null,
              equipment_name: 'Equipment Handover',
              equipment_status: 'Equipment Handover Completed',
              returned_by: staffName,
              returned_at: timestamp,
              photo_url: null,
              asset_id: eqItem.assetId || null,
              proof_type: 'Equipment Handover',
              event_id: booking.eventId || null,
              event_name: booking.eventName || null,
              remarks: JSON.stringify({
                assignment_id: targetAssignmentId || booking.assignmentId || '',
                asset_id: eqItem.assetId || '',
                proof_type: 'Equipment Handover',
                staff_name: staffName,
                staff_role: booking.assignedRole || '',
                staff_id: staffMember?.id || currentUser?.id || '',
                photo_url: null,
                event_id: booking.eventId,
                event_name: booking.eventName,
                order_id: booking.orderId,
                lead_id: booking.leadId,
                raw_footage_link: modalRawFootageLink || null,
                uploaded_at: timestamp,
                uploaded_by: staffName,
                current_status: nextStatus
              })
            });

            await pushInsert('equipment_handovers', {
              handover_id: `HND-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
              order_id: booking.orderId || booking.leadId || '',
              equipment_name: eqItem.name,
              return_status: 'Returned',
              return_date: timestamp.split('T')[0],
              returned_by: staffName,
              notes: `Returned at footage handover by ${staffName}`,
              created_at: timestamp
            });
          } catch (itemErr) {
            console.warn('[StaffModule] Error saving equipment item return record:', itemErr);
          }
        }
      }

      if (booking.orderId) {
        const matchingSA = staffAssignments?.find(sa => {
          if (!sa || sa.order_id !== booking.orderId) return false;
          if ((sa.staff_name || '').trim().toLowerCase() !== staffName.trim().toLowerCase()) return false;
          
          if (booking.assignmentId && sa.assignment_id) {
            return sa.assignment_id === booking.assignmentId;
          }
          if (booking.eventId && booking.eventId !== 'ev' && sa.event_id) {
            return sa.event_id === booking.eventId;
          }
          if (booking.eventName && sa.event_name) {
            return sa.event_name.trim().toLowerCase() === booking.eventName.trim().toLowerCase();
          }
          return false;
        });

        let targetAssignmentId = booking.assignmentId || matchingSA?.assignment_id;
        if (!targetAssignmentId && staffAssignments) {
          const fallbackSA = staffAssignments.find(sa => {
            if (sa.order_id !== booking.orderId) return false;
            if ((sa.staff_name || '').trim().toLowerCase() !== staffName.trim().toLowerCase()) return false;
            
            if (booking.eventId && booking.eventId !== 'ev' && sa.event_id) {
              return sa.event_id === booking.eventId;
            }
            if (booking.eventName && sa.event_name) {
              return sa.event_name.trim().toLowerCase() === booking.eventName.trim().toLowerCase();
            }
            
            const otherSameStaffAssignments = staffAssignments.filter(s => 
              s.order_id === booking.orderId && 
              (s.staff_name || '').trim().toLowerCase() === staffName.trim().toLowerCase()
            );
            if (otherSameStaffAssignments.length > 1) {
              return false;
            }
            return true;
          });
          if (fallbackSA) {
            targetAssignmentId = fallbackSA.assignment_id;
          }
        }

        if (booking.orderId) {
          try {
            const targetAsgId = targetAssignmentId || booking.assignmentId || '';
            const existingRf = rawFootage?.find(rf => targetAsgId && rf.assignment_id === targetAsgId);
            const rfTrackingId = existingRf?.tracking_id || `TRK-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
            const rfPayload = {
              tracking_id: rfTrackingId,
              order_id: booking.orderId,
              assignment_id: targetAsgId || null,
              event_id: booking.eventId || null,
              event_name: booking.eventName || null,
              event_completed_date: booking.eventDate || timestamp.split('T')[0],
              server_path: modalRawFootageLink || '',
              drive_link: modalRawFootageLink || '',
              uploaded_by: staffName,
              uploaded_date: timestamp,
              raw_received: Boolean(modalRawFootageLink),
              status: modalRawFootageLink ? 'Received' : 'Pending'
            };
            if (existingRf) {
              await pushUpdate('raw_footage', 'tracking_id', existingRf.tracking_id, rfPayload);
            } else if (modalRawFootageLink) {
              await pushInsert('raw_footage', rfPayload);
            }
          } catch (rfErr) {
            console.warn('[StatusUpdate] raw_footage save warning:', rfErr);
          }
        }

        const nextStatuses = {
          ...staffStatuses,
          [booking.key]: nextStatus
        };
        setStaffStatuses(nextStatuses);
        localStorage.setItem('staff_event_statuses_v2', JSON.stringify(nextStatuses));

        const existingProofs = staffProofs[booking.key] || {};
        const proofField = stage === 'Equipment Received' ? 'equipmentReceivedProofs' :
                           stage === 'Equipment Handover' ? 'equipmentHandoverProofs' :
                           'completeProofs';
        const updatedEventProofs = {
          ...existingProofs,
          [proofField]: uploadedProofs
        };
        const nextProofs = {
          ...staffProofs,
          [booking.key]: updatedEventProofs
        };
        setStaffProofs(nextProofs);
        localStorage.setItem('staff_equipment_proofs_v2', JSON.stringify(nextProofs));

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('staff_status_updated'));
        }

        const updateAssignmentPayload: any = {
          task_status: nextStatus,
          updated_at: timestamp,
          updated_by: staffName
        };
        const targetProofItem = uploadedProofs.find(p => p.photoUrl) || uploadedProofs[0];
        const targetPhotoUrl = targetProofItem?.photoUrl;
        const targetPhotoTime = targetProofItem?.capturedAt || timestamp;

        if (stage === 'Equipment Received' && targetPhotoUrl) {
          updateAssignmentPayload.equipment_received_photo = targetPhotoUrl;
          updateAssignmentPayload.equipment_received_time = targetPhotoTime;
        } else if (stage === 'Equipment Handover') {
          if (targetPhotoUrl) {
            updateAssignmentPayload.equipment_handover_photo = targetPhotoUrl;
          }
          updateAssignmentPayload.equipment_handover_to = staffName;
          updateAssignmentPayload.equipment_handover_time = targetPhotoTime;
          updateAssignmentPayload.equipment_handover_date = targetPhotoTime.split('T')[0];
        } else if (stage === 'Event Complete') {
          if (targetPhotoUrl) {
            updateAssignmentPayload.event_end_photo = targetPhotoUrl;
          }
          updateAssignmentPayload.event_end_time = targetPhotoTime;
        }

        const existingSA = staffAssignments?.find(sa => sa.assignment_id === targetAssignmentId || (matchingSA && sa.assignment_id === matchingSA.assignment_id));
        let dbExistingProofs: any = {};
        if (existingSA?.proofs) {
          try {
            dbExistingProofs = typeof existingSA.proofs === 'string' ? JSON.parse(existingSA.proofs) : existingSA.proofs;
          } catch (e) {}
        }

        const updatedProofs = {
          ...dbExistingProofs,
          ...(stage === 'Equipment Received' && targetPhotoUrl ? {
            equipment_received_photo: targetPhotoUrl,
            equipment_received_time: targetPhotoTime,
            equipment_received_date: targetPhotoTime.split('T')[0]
          } : {}),
          ...(stage === 'Equipment Handover' ? {
            equipment_handover_photo: targetPhotoUrl || existingSA?.equipment_handover_photo,
            equipment_handover_time: targetPhotoTime,
            equipment_handover_date: targetPhotoTime.split('T')[0]
          } : {})
        };
        updateAssignmentPayload.proofs = updatedProofs;

        if (existingSA) {
          targetAssignmentId = existingSA.assignment_id;
          await pushUpdate('staff_assignments', 'assignment_id', targetAssignmentId, {
            ...updateAssignmentPayload,
            assignment_status: 'Assigned'
          });
        } else {
          const newAssignmentId = targetAssignmentId || `SA-${booking.orderId}-${booking.eventId || 'ev'}-${Date.now()}`;
          targetAssignmentId = newAssignmentId;
          await pushInsert('staff_assignments', {
            assignment_id: newAssignmentId,
            order_id: booking.orderId,
            lead_id: booking.leadId || null,
            event_id: booking.eventId || null,
            event_name: booking.eventName || null,
            event_date: booking.eventDate || null,
            staff_name: staffName,
            staff_role: booking.assignedRole || 'Staff',
            assignment_status: 'Assigned',
            ...updateAssignmentPayload
          });
        }

        // Insert into dedicated staff_task_submissions audit table
        try {
          const subType = stage === 'Equipment Received' ? 'equipment_received'
            : stage === 'Equipment Handover' ? 'equipment_handover'
            : 'event_complete';

          await pushInsert('staff_task_submissions', {
            assignment_id: targetAssignmentId || null,
            order_id: booking.orderId,
            lead_id: booking.leadId || null,
            event_id: booking.eventId || null,
            event_name: booking.eventName || null,
            staff_name: staffName,
            staff_role: booking.assignedRole || null,
            staff_id: staffMember?.id || currentUser?.id || null,
            submission_type: subType,
            task_status: nextStatus,
            photo_url: targetPhotoUrl || null,
            proof_photos: uploadedProofs,
            raw_footage_link: modalRawFootageLink || null,
            remarks: `${stage} updated by ${staffName} on ${timestamp}`,
            created_at: timestamp
          });
        } catch (subErr) {
          console.warn('[StaffModule] staff_task_submissions insert fallback note:', subErr);
        }

        try {
          const allStaffStatuses = getAllStaffStatusesForOrder(booking.orderId, staffName, nextStatus, nextStatuses, orders, leads, staffAssignments);
          const currentOrd = orders?.find(o => o.order_id === booking.orderId);
          const currentLead = leads?.find(l => l.lead_id === (currentOrd?.lead_id || booking.leadId || booking.orderId));
          const calculatedOverallStage = getCalculatedOrderStage(
            currentOrd?.current_stage || currentLead?.current_status || currentLead?.status || 'Assigned Crew',
            allStaffStatuses
          );

          const opsPayload: any = {
            equipment_status: effectiveEquipmentStatus,
            remarks: `Updated by ${staffName}: Stage updated to ${nextStatus}`
          };

          const currentStage = currentOrd?.current_stage || currentLead?.current_status || currentLead?.status || 'Assigned Crew';
          if (calculatedOverallStage !== currentStage) {
            opsPayload.event_status = calculatedOverallStage;
            opsPayload.remarks += ` (Parent status updated to ${calculatedOverallStage})`;

            await pushUpdate('operations', 'order_id', booking.orderId, opsPayload);

            await pushUpdate('orders', 'order_id', booking.orderId, { 
              current_stage: calculatedOverallStage,
              updated_by: staffName,
              updated_at: timestamp
            });

            if (booking.leadId) {
              await updateLead(booking.leadId, { 
                status: calculatedOverallStage as any,
                current_status: calculatedOverallStage as any,
                updated_by: staffName
              });
            }
          } else {
            opsPayload.remarks += ' (Waiting for remaining assigned crew)';
            await pushUpdate('operations', 'order_id', booking.orderId, opsPayload);
          }
        } catch (parentErr) {
          console.warn('[StaffModule] Parent stage calculation error ignored:', parentErr);
        }
      }

      // Close modal immediately and restore scrolling
      closePhotoModal();
      const stageLabel = stage === 'Event Complete' ? 'Event End' : stage;
      showToast(`✅ ${stageLabel} submitted & saved successfully!`);

      try {
        await refreshData();
      } catch (e) {
        console.warn('refreshData error ignored:', e);
      }

    } catch (error: any) {
      console.error('Error updating status:', error);
      showToast(`❌ Failed to submit ${stage}: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
      document.body.style.overflow = '';
    }
  };

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentMonth(new Date());
  };

  // Calendar Month Grid Calculation
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthName = currentMonth.toLocaleString('default', { month: 'long' });

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(year, month, 0).getDate();

  const todayStr = normalizeDateStr(new Date().toISOString().split('T')[0]);

  const calendarGrid: {
    dateStr: string;
    dayNum: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    events: any[];
  }[] = [];

  // Prev month padding
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dNum = daysInPreviousMonth - i;
    const pDate = new Date(year, month - 1, dNum);
    const dateStr = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
    const evs = activeBookings.filter(b => normalizeDateStr(b.eventDate) === dateStr);
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
    const evs = activeBookings.filter(b => normalizeDateStr(b.eventDate) === dateStr);
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
    const evs = activeBookings.filter(b => normalizeDateStr(b.eventDate) === dateStr);
    calendarGrid.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      events: evs
    });
  }

  // Check if all required upload proofs / links are completed for the currently open photo modal
  const isFormComplete = Boolean((() => {
    if (!photoModalData) return false;
    const { booking, stage } = photoModalData;
    const hasEquipment = Boolean(booking.equipmentItems && booking.equipmentItems.length > 0);

    if (stage === 'Event Start') {
      const hasAsset = !hasEquipment || Boolean(
        modalPhotos['Asset Collection Photo Proof'] || 
        modalPhotos['Equipment Received Image'] || 
        modalPhotos['Equipment Received / Asset Picture'] || 
        modalPhotos['Equipment Received']
      );
      const hasStart = Boolean(
        modalPhotos['Event Start Photo Proof'] || 
        modalPhotos['Event Start Image']
      );
      return hasAsset && hasStart;
    }

    if (stage === 'Event Complete') {
      return Boolean(
        modalPhotos['Event Completion Photo Proof'] || 
        modalPhotos['Event End Image'] || 
        modalPhotos['Event Complete']
      );
    }

    if (stage === 'Equipment Handover') {
      const hasLink = Boolean(modalRawFootageLink && modalRawFootageLink.trim().length > 0);
      const hasHandoverImg = !hasEquipment || Boolean(
        modalPhotos['Equipment Handover Photo Proof'] || 
        modalPhotos['Equipment Handover Image'] || 
        modalPhotos['Asset Return Photo Proof'] || 
        modalPhotos['Equipment Handover']
      );
      return hasLink && hasHandoverImg;
    }

    return true;
  })());

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 bg-zinc-900 border border-amber-500/50 text-white px-5 py-3 rounded-2xl shadow-2xl z-50 font-sans text-sm font-bold flex items-center gap-3 animate-in slide-in-from-bottom-5">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Staff Profile / Info Section */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5 sm:gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
            <User className="w-6 h-6" />
          </div>
          <DashboardGreetingHeader
            dashboardTitle="Operations Staff Dashboard"
            userName={staffName}
            userMobile={staffMobile}
          />
        </div>
      </div>

      {/* Navigation View Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 md:gap-4 bg-zinc-900/90 border border-zinc-800 p-1.5 md:p-2 rounded-xl md:rounded-2xl shadow-lg">
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center sm:gap-2 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-2.5 py-1.5 md:px-5 md:py-2.5 rounded-lg md:rounded-xl font-extrabold text-[10px] sm:text-xs md:text-xs transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'calendar'
                ? 'bg-amber-500 text-zinc-950 shadow-md md:shadow-lg shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span className="whitespace-nowrap">
              <span className="hidden sm:inline">My Event Calendar</span>
              <span className="sm:hidden">Calendar</span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-2.5 py-1.5 md:px-5 md:py-2.5 rounded-lg md:rounded-xl font-extrabold text-[10px] sm:text-xs md:text-xs transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'tasks'
                ? 'bg-amber-500 text-zinc-950 shadow-md md:shadow-lg shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span className="whitespace-nowrap">
              <span className="hidden sm:inline">Assigned Orders List</span>
              <span className="sm:hidden">Assigned Orders</span> ({activeBookings.length})
            </span>
          </button>
        </div>
      </div>

      {/* PERSONAL EVENT CALENDAR VIEW */}
      {activeTab === 'calendar' && (
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl p-3.5 sm:p-5 md:p-6 space-y-4 md:space-y-6">
          {/* Calendar Header Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2 select-none shadow-sm flex-1 sm:flex-none">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-all cursor-pointer active:scale-90 shrink-0"
                aria-label="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <h2 className="text-sm font-mono font-bold tracking-wider text-center flex-1 px-3 whitespace-nowrap">
                <span className="text-yellow-500 font-extrabold">{monthName}</span>
                <span className="text-zinc-200 font-medium ml-1.5">{year}</span>
              </h2>

              <button
                type="button"
                onClick={handleNextMonth}
                className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-all cursor-pointer active:scale-90 shrink-0"
                aria-label="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleToday}
              className="px-4 py-2.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-800 rounded-xl text-xs font-mono font-bold text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm shrink-0 whitespace-nowrap h-10 flex items-center justify-center"
            >
              Today
            </button>
          </div>

          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] sm:text-xs font-mono font-bold uppercase text-zinc-500 py-1">
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
              <div key={day} className="py-2 bg-zinc-950/60 rounded-xl border border-zinc-850">
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
                    setCalendarModalDate(cell.dateStr);
                    setCalendarModalEvents(cell.events);
                  }}
                  className={`aspect-square p-1.5 sm:p-2.5 rounded-xl border flex flex-col items-center justify-between cursor-pointer select-none touch-manipulation relative transition-all duration-150 ${
                    isSelected
                      ? 'bg-zinc-900 border-amber-500 ring-1 ring-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                      : cell.isToday
                      ? 'bg-amber-500/10 border-amber-500/60 text-white shadow-lg shadow-amber-500/5'
                      : cell.isCurrentMonth
                      ? 'bg-zinc-950/80 border-zinc-850 hover:border-zinc-700 hover:bg-zinc-900/40 text-zinc-200'
                      : 'bg-zinc-950/20 border-transparent text-zinc-800 opacity-20 pointer-events-none'
                  }`}
                >
                  {/* Date Number Display */}
                  <span
                    className={`text-xs font-mono font-extrabold shrink-0 ${
                      isSelected
                        ? 'text-amber-400 font-black'
                        : cell.isToday
                        ? 'text-amber-500 font-extrabold'
                        : cell.isCurrentMonth
                        ? 'text-zinc-200'
                        : 'text-zinc-700'
                    }`}
                  >
                    {cell.dayNum}
                  </span>

                  {/* Event Names inside the Date Box */}
                  {cell.isCurrentMonth && hasEvents && (
                    <div className="w-full flex-1 flex flex-col justify-start gap-0.5 overflow-hidden mt-0.5 min-h-0">
                      {cell.events.map((ev, eIdx) => {
                        const displayName = ev.customerName || ev.client_name || 'Client';
                        return (
                          <div
                            key={`${ev.key || 'ev'}_${eIdx}`}
                            className="w-full truncate text-[8px] sm:text-[9px] leading-tight px-1 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 font-medium text-left cursor-pointer hover:text-white hover:border-zinc-700"
                            title={displayName}
                          >
                            {displayName}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected Date Events Popup (Rendered as Modal via createPortal) */}
          {calendarModalDate && createPortal(
            <div 
              className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/85 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200"
              onClick={() => setCalendarModalDate(null)}
            >
              <div 
                className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-2xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden" 
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-zinc-800/80 shrink-0">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-amber-500 block font-extrabold">
                      EVENT DETAILS
                    </span>
                    <h4 className="text-base sm:text-lg font-black text-white font-mono mt-0.5">
                      {formatDateDDMMYY(calendarModalDate) || calendarModalDate}
                    </h4>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg select-none">
                      {calendarModalEvents.length} {calendarModalEvents.length === 1 ? 'EVENT' : 'EVENTS'}
                    </span>
                    <button
                      onClick={() => setCalendarModalDate(null)}
                      className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                <div className="p-4 md:p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                  {calendarModalEvents.length === 0 ? (
                    <div className="p-6 text-center bg-zinc-950/40 border border-dashed border-zinc-800 rounded-2xl text-zinc-500 text-xs font-mono">
                      No events assigned on {calendarModalDate}.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Full Genuine Horizontal Scrollable Table */}
                      <div className="overflow-x-auto w-full border border-zinc-800 rounded-xl bg-zinc-950/60 shadow-inner">
                        <table className="w-full text-left border-collapse min-w-[950px]">
                          <thead>
                            <tr className="border-b border-zinc-850 bg-zinc-950/90 text-zinc-400 font-mono text-[11px] uppercase tracking-wider font-bold">
                              <th className="p-3.5 pl-4 text-left whitespace-nowrap min-w-[120px]">Order ID</th>
                              <th className="p-3.5 text-left whitespace-nowrap min-w-[170px]">Customer Name</th>
                              <th className="p-3.5 text-left whitespace-nowrap min-w-[150px]">Event Type</th>
                              <th className="p-3.5 text-left whitespace-nowrap min-w-[130px]">Reporting Date</th>
                              <th className="p-3.5 text-left whitespace-nowrap min-w-[120px]">Reporting Time</th>
                              <th className="p-3.5 text-left whitespace-nowrap min-w-[170px]">Location</th>
                              <th className="p-3.5 text-left whitespace-nowrap min-w-[150px]">Assigned Role</th>
                              <th className="p-3.5 text-left whitespace-nowrap min-w-[180px]">Equipment Details</th>
                              <th className="p-3.5 text-left whitespace-nowrap min-w-[160px]">Status</th>
                              <th className="p-3.5 pr-4 text-center whitespace-nowrap min-w-[130px]">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-850/60 text-xs font-sans">
                            {calendarModalEvents.map((ev, idx) => {
                              const orderDisplayId = ev.orderId || ev.leadId || '—';
                              const custName = ev.customerName || '—';
                              const evType = ev.eventName || ev.shootType || 'Event';
                              const repDate = ev.reportingDate && ev.reportingDate !== 'N/A' && ev.reportingDate !== '—'
                                ? formatDateDDMMYY(ev.reportingDate) || ev.reportingDate
                                : '—';
                              const repTime = ev.reportingTime && ev.reportingTime !== 'N/A' && ev.reportingTime !== '—'
                                ? formatTime12Hour(ev.reportingTime) || ev.reportingTime
                                : '—';
                              const locationVal = ev.location || ev.venue || ev.eventLocation || '—';
                              const assignedRole = ev.assignedRole || 'Not assigned';
                              const eqList = Array.isArray(ev.equipmentItems) ? ev.equipmentItems : [];
                              const status = ev.taskStatus || ev.status || 'Confirmed';

                              return (
                                <tr key={`dt_${ev.key || 'calev'}_${idx}`} className="bg-zinc-950/30 hover:bg-zinc-900/40 transition-colors select-text">
                                  {/* 1. Order ID */}
                                  <td className="p-3.5 pl-4 align-middle min-w-[120px]">
                                    <span className="font-mono text-amber-400 font-bold text-xs whitespace-nowrap inline-block">
                                      {orderDisplayId}
                                    </span>
                                  </td>

                                  {/* 2. Customer Name */}
                                  <td className="p-3.5 align-middle min-w-[170px]">
                                    <div className="font-bold text-white text-xs leading-snug break-words max-w-[220px]">
                                      {custName}
                                    </div>
                                  </td>

                                  {/* 3. Event Type */}
                                  <td className="p-3.5 align-middle min-w-[150px]">
                                    <div className="text-zinc-200 text-xs leading-snug">
                                      {evType}
                                    </div>
                                  </td>

                                  {/* 4. Reporting Date */}
                                  <td className="p-3.5 align-middle whitespace-nowrap min-w-[130px]">
                                    <span className="font-mono text-zinc-200 text-xs font-medium">
                                      {repDate}
                                    </span>
                                  </td>

                                  {/* 5. Reporting Time */}
                                  <td className="p-3.5 align-middle whitespace-nowrap min-w-[120px]">
                                    <span className="font-mono text-zinc-200 text-xs font-medium">
                                      {repTime}
                                    </span>
                                  </td>

                                  {/* 6. Location */}
                                  <td className="p-3.5 align-middle min-w-[170px]">
                                    <div className="text-zinc-200 text-xs leading-snug break-words max-w-[220px]">
                                      {locationVal}
                                    </div>
                                  </td>

                                  {/* 7. Assigned Role */}
                                  <td className="p-3.5 align-middle min-w-[150px]">
                                    <div className="text-zinc-200 text-xs leading-snug">
                                      {assignedRole}
                                    </div>
                                  </td>

                                  {/* 8. Equipment Details */}
                                  <td className="p-3.5 align-middle min-w-[180px]">
                                    {eqList.length > 0 ? (
                                      <div className="space-y-0.5 text-xs text-zinc-200 font-medium">
                                        {eqList.map((eq: any, i: number) => {
                                          const name = typeof eq === 'string' ? eq : (eq.name || eq.equipment_name || 'Equipment');
                                          return <div key={i} className="break-words">{name}</div>;
                                        })}
                                      </div>
                                    ) : (
                                      <span className="text-zinc-500 italic text-xs">No equipment assigned</span>
                                    )}
                                  </td>

                                  {/* 9. Status */}
                                  <td className="p-3.5 align-middle text-left whitespace-nowrap min-w-[160px]">
                                    <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wide bg-zinc-800 text-amber-300 border border-zinc-700 leading-none whitespace-nowrap shadow-sm">
                                      {status}
                                    </span>
                                  </td>

                                  {/* 10. Actions */}
                                  <td className="p-3.5 pr-4 align-middle text-center whitespace-nowrap min-w-[130px]">
                                    <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCalendarModalDate(null);
                                          setSelectedBookingDetails(ev);
                                        }}
                                        className="inline-flex items-center justify-center gap-1 h-7 px-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[11px] font-mono rounded-lg transition-colors cursor-pointer shadow-sm shrink-0 whitespace-nowrap leading-none"
                                      >
                                        <span>Details</span>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-zinc-800/80 flex justify-end shrink-0">
                  <button
                    onClick={() => setCalendarModalDate(null)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      )}

      {/* Assigned Orders & Tasks Table/Cards */}
      {activeTab === 'tasks' && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-4 sm:p-6 border-b border-zinc-800 flex flex-wrap justify-between items-center gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-amber-500" />
                Assigned Orders & Tasks
              </h3>
              <p className="text-zinc-400 text-xs mt-0.5">Showing orders & equipment assigned specifically to you</p>
            </div>
            <ListSortFilter value={sortOrder} onChange={setSortOrder} />
          </div>

          {activeBookings.length === 0 ? (
            <div className="py-20 text-center px-4">
              <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-700/60">
                <Calendar className="w-8 h-8 text-zinc-500" />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">No Assigned Tasks Found</h4>
              <p className="text-zinc-400 text-sm max-w-sm mx-auto">
                You currently have no active event or equipment assignments. New shoots assigned to you by Operations will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-zinc-950/60 border-b border-zinc-800 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                    <th className="py-4 px-6">Order ID</th>
                    <th className="py-4 px-6">Customer Name</th>
                    <th className="py-4 px-6">Event Name</th>
                    <th className="py-4 px-6 whitespace-nowrap">Reporting Date & Time</th>
                    <th className="py-4 px-6">Assigned Role</th>
                    <th className="py-4 px-6">Equipment Status</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-sm">
                  {[...activeBookings].sort(sortOrder === 'latest' ? sortBookingsLatestFirst : sortBookingsOldestFirst).map((b, bIdx) => {
                    const proofStatus = getBookingProofStatus(b, leadEquipmentHistory, staffProofs, staffName, staffMember?.id || currentUser?.id);
                    const isStarted = (b.taskStatus === 'Event Started' || b.taskStatus === 'Event Start') && proofStatus.isEventStartComplete;
                    const isCompleted = b.taskStatus === 'Event Completed' || b.taskStatus === 'Event Complete' || proofStatus.isEventComplete;
                    
                    const hasEquipmentReceived = proofStatus.assetImageUploaded;
                    const hasEventStart = proofStatus.isEventStartComplete;
                    const hasEquipmentHandover = proofStatus.isHandoverComplete;

                    return (
                      <tr key={b.key || `task_${bIdx}`} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-4 px-6 font-mono font-bold text-amber-400">{b.orderId}</td>
                        <td className="py-4 px-6 font-bold text-white">{b.customerName}</td>
                        <td className="py-4 px-6">
                          <StaffEventDetailsCell b={b} />
                        </td>
                        <td className="py-4 px-6">
                          <StaffReportingDetailsCell b={b} />
                        </td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold whitespace-nowrap">
                            {b.assignedRole}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <StaffEquipmentDetailsCell b={b} proofStatus={proofStatus} />
                        </td>
                        <td className="py-4 px-6 flex flex-col gap-2 items-start">
                          {b.taskStatus === 'Footage Handover' || b.taskStatus === 'Verified Footage' ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-bold uppercase whitespace-nowrap">
                              <CheckCircle className="w-3.5 h-3.5" /> Footage Handover
                            </span>
                          ) : isCompleted || b.taskStatus === 'Event Ended' || b.taskStatus === 'Event Completed' ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-bold uppercase whitespace-nowrap">
                              <CheckCircle className="w-3.5 h-3.5" /> Event Ended
                            </span>
                          ) : isStarted || b.taskStatus === 'Event Started' ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold uppercase whitespace-nowrap">
                              <Play className="w-3.5 h-3.5" /> Event Started
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold uppercase whitespace-nowrap">
                              <User className="w-3.5 h-3.5" /> Assigned Crew
                            </span>
                          )}
                          {(b.taskStatus === 'Footage Handover' || b.taskStatus === 'Verified Footage' || b.rawFootageVerificationStatus === 'Verified' || b.rawFootageVerificationStatus === 'Not Verified') && (
                            <div className="text-[10px] font-bold">
                              {b.rawFootageVerificationStatus === 'Verified' ? (
                                <span className="text-emerald-400">✅ Verified by Ops</span>
                              ) : b.rawFootageVerificationStatus === 'Not Verified' ? (
                                <span className="text-rose-400">❌ Footage Rejected</span>
                              ) : (
                                <span className="text-zinc-500 italic">Verification Pending</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <StaffActionDropdown
                            booking={b}
                            hasEquipmentReceived={hasEquipmentReceived}
                            hasEventStart={hasEventStart}
                            hasEquipmentHandover={hasEquipmentHandover}
                            isCompleted={isCompleted}
                            onViewDetails={() => setSelectedBookingDetails(b)}
                            onOpenPhotoModal={(step) => openPhotoModal(b, step)}
                            onAddNote={() => setNoteModalData({ leadId: b.leadId, orderId: b.orderId, customerName: b.customerName })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      <ViewDetailsModal
        isOpen={!!selectedBookingDetails}
        onClose={() => setSelectedBookingDetails(null)}
        orderId={selectedBookingDetails?.orderId || selectedBookingDetails?.key}
        booking={selectedBookingDetails}
        isStaffView={true}
      />

      {/* EQUIPMENT PHOTO PROOF VERIFICATION MODAL (EVENT START / EVENT COMPLETE) */}
      {photoModalData && createPortal(
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) {
              closePhotoModal();
            }
          }}
        >
          <div 
            ref={photoModalRef} 
            className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800 bg-zinc-950/60 flex justify-between items-start">
              <div>
                <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest block mb-1">
                  {photoModalData.stage === 'Event Complete' ? 'Event End Workflow' : photoModalData.stage === 'Equipment Handover' ? 'Footage Handover Workflow' : `Verification • ${photoModalData.stage}`}
                </span>
                <h3 className="text-xl font-black text-white">{photoModalData.booking.eventName}</h3>
                <p className="text-zinc-400 text-xs mt-0.5">Order ID: {photoModalData.booking.orderId} | Staff: <strong className="text-white">{staffName}</strong></p>
              </div>
              <button
                type="button"
                onClick={closePhotoModal}
                disabled={isSubmitting}
                className="p-2 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div ref={photoModalScrollRef} className="p-6 overflow-y-auto space-y-5">
              {submitError && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 text-xs text-rose-300 flex items-start gap-3 animate-in fade-in">
                  <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-extrabold text-rose-400 uppercase tracking-wider">{submitError.title}</div>
                    <div className="text-zinc-200 font-medium">{submitError.message}</div>
                    {submitError.details && submitError.details.length > 0 && (
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-rose-200 font-medium">
                        {submitError.details.map((item, idx) => (
                          <li key={idx} className="font-semibold">{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-xs text-amber-300 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  {photoModalData.stage === 'Event Complete' ? (
                    <span><strong>Event Completion Proof Required:</strong> Please upload or capture the <strong>Event Completion Photo Proof</strong> to complete the Event End stage.</span>
                  ) : photoModalData.stage === 'Equipment Handover' ? (
                    photoModalData.booking.equipmentItems && photoModalData.booking.equipmentItems.length > 0 ? (
                      <span><strong>Footage & Equipment Handover:</strong> Provide the <strong>Raw Footage Drive Link (Required)</strong> and capture/upload Equipment Handover Photo Proof.</span>
                    ) : (
                      <span><strong>Footage Handover:</strong> Provide the <strong>Raw Footage Drive Link (Required)</strong> to complete footage handover.</span>
                    )
                  ) : photoModalData.booking.equipmentItems && photoModalData.booking.equipmentItems.length > 0 ? (
                    <span><strong>Equipment Inspection Required:</strong> Please capture or upload a clear photo of each assigned equipment item (Equipment Received / Asset Picture) and <strong>Event Start Image</strong> to start the event.</span>
                  ) : (
                    <span><strong>Event Start Proof Required:</strong> Please capture or upload a clear photo for <strong>Event Start Image</strong>.</span>
                  )}
                </div>
              </div>

              {/* Equipment / Proof Items list with photo inputs */}
              <div className="space-y-4">
                {(photoModalData.stage === 'Event Start'
                  ? (photoModalData.booking.equipmentItems && photoModalData.booking.equipmentItems.length > 0
                      ? [
                          {
                            name: 'Asset Collection Photo Proof',
                            displayName: '1. Equipment Received Image',
                            assetId: photoModalData.booking.equipmentItems[0]?.assetId || 'Asset Collection',
                            optional: false,
                            isAsset: true
                          },
                          {
                            name: 'Event Start Photo Proof',
                            displayName: '2. Event Start Image',
                            assetId: 'Event Start',
                            optional: false,
                            isEventStart: true
                          }
                        ]
                      : [
                          { 
                            name: 'Event Start Photo Proof', 
                            displayName: 'Event Start Image', 
                            assetId: 'Event Start', 
                            optional: false,
                            isEventStart: true 
                          }
                        ])
                  : photoModalData.stage === 'Event Complete'
                  ? [
                      { name: 'Event Completion Photo Proof', displayName: 'Event Completion Photo Proof', assetId: 'Event Complete', optional: false }
                    ]
                  : photoModalData.stage === 'Equipment Handover'
                  ? (photoModalData.booking.equipmentItems && photoModalData.booking.equipmentItems.length > 0
                      ? [
                          {
                            name: 'Asset Return Photo Proof',
                            displayName: 'Equipment Handover Image',
                            assetId: photoModalData.booking.equipmentItems[0]?.assetId || 'Equipment Handover',
                            optional: false
                          }
                        ]
                      : []
                    )
                  : (photoModalData.booking.equipmentItems && photoModalData.booking.equipmentItems.length > 0
                      ? [
                          {
                            name: 'Asset Collection Photo Proof',
                            displayName: '1. Equipment Received Image',
                            assetId: photoModalData.booking.equipmentItems[0]?.assetId || 'Asset Collection',
                            optional: false,
                            isAsset: true
                          }
                        ]
                      : []
                    )
                ).map((item: any, idx: number) => {
                  const currentPhoto = modalPhotos[item.name] || 
                    (item.isAsset ? (modalPhotos['Asset Collection Photo Proof'] || modalPhotos['Equipment Received Image'] || modalPhotos['Equipment Received / Asset Picture'] || modalPhotos['Equipment Received']) : undefined) ||
                    (item.isEventStart ? (modalPhotos['Event Start Photo Proof'] || modalPhotos['Event Start Image']) : undefined) ||
                    (item.name === 'Asset Return Photo Proof' || item.name === 'Equipment Handover Photo Proof' || item.displayName?.includes('Equipment Handover') ? (modalPhotos['Equipment Handover Photo Proof'] || modalPhotos['Equipment Handover Image'] || modalPhotos['Asset Return Photo Proof'] || modalPhotos['Equipment Handover']) : undefined);

                  const isAsset = item.isAsset || (item.name && ((item.name || '').toLowerCase().includes('asset collection') || (item.name || '').toLowerCase().includes('equipment received')));
                  const isEventStart = item.isEventStart || (item.name && (item.name || '').toLowerCase().includes('event start'));
                  const isEventEnd = item.name && ((item.name || '').toLowerCase().includes('event completion') || (item.name || '').toLowerCase().includes('event end'));
                  const isHandover = item.name && ((item.name || '').toLowerCase().includes('handover') || (item.name || '').toLowerCase().includes('return'));

                  let uploadTime = modalPhotoTimestamps[item.name] || (item.displayName ? modalPhotoTimestamps[item.displayName] : null);
                  if (!uploadTime && photoModalData?.booking) {
                    if (isAsset) uploadTime = modalPhotoTimestamps['Asset Collection Photo Proof'] || modalPhotoTimestamps['Equipment Received Image'] || modalPhotoTimestamps['Equipment Received / Asset Picture'] || photoModalData.booking.equipmentReceivedTime;
                    else if (isEventStart) uploadTime = modalPhotoTimestamps['Event Start Photo Proof'] || modalPhotoTimestamps['Event Start Image'] || photoModalData.booking.eventStartPhotoTime;
                    else if (isEventEnd) uploadTime = modalPhotoTimestamps['Event Completion Photo Proof'] || photoModalData.booking.eventEndPhotoTime;
                    else if (isHandover) uploadTime = modalPhotoTimestamps['Equipment Handover Image'] || modalPhotoTimestamps['Equipment Handover Photo Proof'] || modalPhotoTimestamps['Asset Return Photo Proof'] || photoModalData.booking.equipmentHandoverTime;
                  }

                  return (
                    <div key={idx} className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            <Camera className="w-4 h-4 text-amber-500" />
                            {item.displayName || item.name} {item.optional ? <span className="text-zinc-500 text-xs font-normal">(Optional)</span> : <span className="text-rose-400 text-xs font-normal">(Required)</span>}
                          </div>
                          <div className="text-[10px] font-mono text-zinc-400">Asset ID: {item.assetId}</div>
                          {uploadTime && currentPhoto && (
                            <div className="text-[10px] text-amber-400 mt-1.5 space-y-0.5 font-semibold bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>Upload Date: {formatISTDate(uploadTime)}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>Upload Time: {formatISTTime12Hour(uploadTime)} IST</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {currentPhoto ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                            <CheckCircle className="w-3.5 h-3.5" /> Previously Uploaded Image ✓
                          </span>
                        ) : item.optional ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-400 bg-zinc-800/80 px-2.5 py-1 rounded-full border border-zinc-700">
                            Photo Optional
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                            <AlertCircle className="w-3.5 h-3.5" /> Photo Required
                          </span>
                        )}
                      </div>

                      {uploadingItemKey === item.name || (item.isAsset && uploadingItemKey?.toLowerCase().includes('asset')) ? (
                        <div className="border border-amber-500/40 bg-zinc-900/80 rounded-2xl p-8 flex flex-col items-center justify-center gap-3">
                          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                          <span className="text-xs font-bold text-amber-300">Uploading and saving {item.displayName || item.name}...</span>
                          <span className="text-[10px] text-zinc-400">Saving to storage immediately</span>
                        </div>
                      ) : currentPhoto ? (() => {
                        const resolvedPhotoUrl = utils.resolveStorageUrl(currentPhoto) || currentPhoto;
                        return (
                          <div className="relative group rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900 min-h-[160px] flex items-center justify-center">
                            <img 
                              src={resolvedPhotoUrl} 
                              alt={item.name} 
                              className="w-full h-44 object-contain bg-zinc-950" 
                              loading="lazy"
                              onError={(e) => {
                                console.warn('[StaffModule] Image preview error for:', resolvedPhotoUrl);
                              }}
                            />
                            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1 border border-emerald-500/30">
                              <CheckCircle className="w-3 h-3" /> Ready
                            </div>
                            <label className="absolute bottom-2 right-2 bg-zinc-900/90 hover:bg-zinc-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-zinc-700 cursor-pointer flex items-center gap-1.5 shadow-lg">
                              <Upload className="w-3.5 h-3.5" /> Change Photo
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={(e) => handlePhotoCapture(item.name, e)}
                                className="hidden"
                              />
                            </label>
                          </div>
                        );
                      })() : (
                        <label className="border-2 border-dashed border-zinc-800 hover:border-amber-500/50 bg-zinc-900/50 hover:bg-zinc-900 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors group">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 group-hover:bg-amber-500/20 text-zinc-400 group-hover:text-amber-400 flex items-center justify-center transition-colors">
                            <Camera className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-bold text-zinc-300 group-hover:text-amber-400 transition-colors">
                            Capture or Upload {item.displayName || item.name}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">Use phone camera or choose file</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={(e) => handlePhotoCapture(item.name, e)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  );
                })}

                {/* Raw Footage Link Input for Footage Handover stage */}
                {photoModalData.stage === 'Equipment Handover' && (
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-bold text-white text-sm flex items-center gap-2">
                          <Video className="w-4 h-4 text-indigo-400" />
                          Raw Footage Drive Link <span className="text-rose-400 text-xs font-normal">(Required)</span>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400">Google Drive / Cloud folder URL for raw footage handover</div>
                      </div>
                      {modalRawFootageLink.trim() ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                          <CheckCircle className="w-3.5 h-3.5" /> Link Provided
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                          <AlertCircle className="w-3.5 h-3.5" /> Link Required
                        </span>
                      )}
                    </div>
                    <input
                      type="url"
                      value={modalRawFootageLink}
                      onChange={(e) => setModalRawFootageLink(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/..."
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 flex justify-between items-center gap-3">
              <button
                type="button"
                onClick={closePhotoModal}
                disabled={isSubmitting}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center gap-3">
                {!isFormComplete && (
                  <span className="text-[11px] text-amber-400 font-medium items-center gap-1.5 hidden sm:inline-flex">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {photoModalData.stage === 'Event Start'
                      ? 'Upload both images to enable submission'
                      : photoModalData.stage === 'Equipment Handover'
                      ? (photoModalData.booking.equipmentItems && photoModalData.booking.equipmentItems.length > 0 ? 'Upload handover image & link to enable submission' : 'Provide link to enable submission')
                      : 'Upload required image to enable submission'}
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleConfirmStatusUpdate}
                  disabled={isSubmitting || !isFormComplete}
                  className={`px-6 py-2.5 font-bold rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg ${
                    !isFormComplete || isSubmitting
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/60'
                      : photoModalData.stage === 'Event Start'
                      ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-amber-500/20 cursor-pointer'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 cursor-pointer'
                  }`}
                  title={!isFormComplete ? 'Please complete all required items before submitting' : undefined}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : photoModalData.stage === 'Event Start' ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Confirm Event Start
                    </>
                  ) : photoModalData.stage === 'Event Complete' ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Submit Event End
                    </>
                  ) : photoModalData.stage === 'Equipment Handover' ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Submit Footage Handover
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Confirm {photoModalData.stage}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
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

      {/* Inline Selected Date Event Details are rendered directly below calendar grid */}
    </div>
  );
};
