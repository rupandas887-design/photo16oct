import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRole } from './RoleContext';
import { 
  CheckCircle2, 
  Clock, 
  Eye, 
  ExternalLink, 
  X, 
  Search, 
  Layers, 
  Play, 
  UserCheck, 
  Calendar,
  Layers as LayersIcon,
  Filter,
  ChevronDown
} from 'lucide-react';
import { formatDateDDMMYY, formatTime12Hour, parseCustomerProof, resolveStorageUrl } from '../utils';

const toYMD = (str: string | null | undefined): string | null => {
  if (!str) return null;
  const trimmed = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (match) {
    let [, d, m, y] = match;
    d = d.padStart(2, '0');
    m = m.padStart(2, '0');
    if (y.length === 2) y = '20' + y;
    return `${y}-${m}-${d}`;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
};

const computePresetRange = (preset: 'This Month' | 'Last Month' | 'Last three Month' | 'Last 3 Months'): { start: string; end: string } => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

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
  return {
    start: formatYMD(new Date(year, month - 2, 1)),
    end: formatYMD(new Date(year, month + 1, 0))
  };
};

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

export interface TaskProofImage {
  id: string;
  url: string;
  deliverableName: string;
  stageTitle: 'Editing Started' | 'Customer Review' | 'Editing Completed' | 'Proof Uploaded';
  uploadedDate: string;
  uploadedTime: string;
  rawTimestamp: number;
}

const isImageVal = (val: string): boolean => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (['pending', 'null', 'undefined', '-', 'n/a', 'none', 'pending upload', 'not uploaded'].includes(lower)) return false;
  
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.includes('/storage/v1/object/public/img/') ||
    trimmed.includes('/storage/v1/object/public/') ||
    trimmed.includes('googleusercontent.com') ||
    /\.(jpg|jpeg|png|webp|gif|svg|bmp|avif)(\?.*)?$/i.test(trimmed) ||
    /^(img\/)?proofs\/.*\.(jpg|jpeg|png|webp|gif|svg|bmp)/i.test(trimmed)
  ) {
    return true;
  }
  const resolved = resolveStorageUrl(trimmed);
  if (resolved && (resolved.includes('/img/') || /\.(jpg|jpeg|png|webp|gif|svg|bmp|avif)/i.test(resolved))) {
    return true;
  }
  return false;
};

const getTimestamp = (dateInput?: string | null): number => {
  if (!dateInput) return 0;
  const d = new Date(dateInput);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const formatDateTimeSafe = (dateInput?: string | null) => {
  if (!dateInput) return { date: '—', time: '—' };
  const dateFormatted = formatDateDDMMYY(dateInput) || '—';
  const timeFormatted = formatTime12Hour(dateInput) || '—';
  return {
    date: dateFormatted,
    time: timeFormatted === '12:00 AM' && !dateInput.includes('T') && !dateInput.includes(':') ? '—' : timeFormatted
  };
};

/**
 * Resolves a clean, real Order ID (e.g. OR036, ORD-102)
 * Strictly excludes Deliverable IDs, EDR IDs, UUIDs, or internal database IDs.
 */
const resolveCleanOrderId = (assignment: any, prod: any, order: any, orders: any[] = []): string => {
  const isClean = (id?: string | null): boolean => {
    if (!id || typeof id !== 'string') return false;
    const trimmed = id.trim();
    if (!trimmed || trimmed === '—' || trimmed === '-' || trimmed === 'undefined' || trimmed === 'null') return false;
    // Disqualify raw UUIDs or long database tokens
    if (trimmed.length > 20) return false;
    // Disqualify Deliverable IDs or EDR IDs
    if (/^(EDR|DELIV|TASK|ASGN|ITEM)-/i.test(trimmed)) return false;
    // Disqualify UUID-like formats
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(trimmed)) return false;
    return true;
  };

  if (isClean(order?.order_id)) return order.order_id.trim();
  if (isClean(prod?.order_id)) return prod.order_id.trim();
  if (isClean(assignment?.order_id)) return assignment.order_id.trim();
  if (isClean(prod?.tracking_id)) return prod.tracking_id.trim();

  // If candidate has prefix PRD-, strip it if it resolves to an Order ID (e.g. PRD-OR036 -> OR036)
  const candidate = (order?.order_id || prod?.order_id || assignment?.order_id || prod?.tracking_id || assignment?.production_id || '').trim();
  if (candidate.startsWith('PRD-')) {
    const stripped = candidate.replace(/^PRD-/, '');
    if (isClean(stripped)) return stripped;
  }

  // Look for match in orders list by lead_id or production_id
  const fallbackOrder = orders.find(o => 
    (o.order_id && isClean(o.order_id) && (o.order_id === candidate || o.lead_id === candidate || o.lead_id === prod?.lead_id || o.order_id === assignment?.production_id))
  );
  if (fallbackOrder?.order_id && isClean(fallbackOrder.order_id)) {
    return fallbackOrder.order_id.trim();
  }

  if (isClean(candidate)) return candidate;
  return 'OR-ASSIGNED';
};

const extractAllProofsForAssignment = (
  assignment: any,
  verifications: any[] = [],
  deliverableName: string = 'Deliverable'
): TaskProofImage[] => {
  if (!assignment) return [];

  const proofsMap = new Map<string, TaskProofImage>();

  const addProofCandidate = (
    rawUrl: string | undefined | null,
    defaultStage: 'Editing Started' | 'Customer Review' | 'Editing Completed' | 'Proof Uploaded',
    rawTimeInput?: string | null,
    idSuffix?: string
  ) => {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    const trimmed = rawUrl.trim();
    if (!isImageVal(trimmed)) return;

    const fullUrl = resolveStorageUrl(trimmed) || trimmed;
    const effectiveTime = rawTimeInput || assignment.updated_at || assignment.created_at || null;
    const { date, time } = formatDateTimeSafe(effectiveTime);
    const ts = getTimestamp(effectiveTime);

    if (proofsMap.has(fullUrl)) {
      const existing = proofsMap.get(fullUrl)!;
      if (existing.stageTitle === 'Proof Uploaded' && defaultStage !== 'Proof Uploaded') {
        existing.stageTitle = defaultStage;
      }
      return;
    }

    proofsMap.set(fullUrl, {
      id: `${assignment.assignment_id || 'asgn'}-${idSuffix || proofsMap.size}`,
      url: fullUrl,
      deliverableName: (deliverableName || assignment.speciality || assignment.deliverable || 'Deliverable').trim(),
      stageTitle: defaultStage,
      uploadedDate: date,
      uploadedTime: time,
      rawTimestamp: ts || (proofsMap.size + 1)
    });
  };

  // 1. Editing Started Proof
  if (assignment.editing_started_proof || assignment.start_proof) {
    addProofCandidate(
      assignment.editing_started_proof || assignment.start_proof,
      'Editing Started',
      assignment.editing_start_date || assignment.start_date || assignment.created_at,
      'started'
    );
  }

  // 2. Customer Review Image / Proof
  if (assignment.customer_review_image) {
    addProofCandidate(
      assignment.customer_review_image,
      'Customer Review',
      assignment.customer_review_image_time || assignment.proof_uploaded_at || assignment.updated_at,
      'review'
    );
  }

  // 3. Client Acceptance Verification records strictly linked to this exact assignment
  const matchedVerifs = (verifications || []).filter(v => 
    v && (
      (v.assignment_id && v.assignment_id === assignment.assignment_id) ||
      (v.task_id && v.task_id === assignment.assignment_id)
    )
  );

  for (const v of matchedVerifs) {
    if (v.client_communication_consent_proof) {
      const stage = v.consent_proof_verified ? 'Editing Completed' : 'Customer Review';
      addProofCandidate(
        v.client_communication_consent_proof,
        stage,
        v.proof_uploaded_at || v.updated_at || v.created_at,
        `verif-${v.id || 'v'}`
      );
    }
  }

  // 4. Confirmation Proof / Editing Completed Proof
  if (assignment.confirmation_proof) {
    const isCompleted = ['editing completed', 'editing complete', 'completed', 'client acceptance'].includes((assignment.status || '').toLowerCase()) || Boolean(assignment.server_upload_confirmed);
    const stage = isCompleted ? 'Editing Completed' : 'Customer Review';
    addProofCandidate(
      assignment.confirmation_proof,
      stage,
      assignment.customer_confirmation_time || assignment.server_upload_confirmed_at || assignment.proof_uploaded_at || assignment.updated_at,
      'confirm'
    );
  }

  // 5. Additional direct assignment proof fields
  const directFields: Array<{ val: any; stage: any; time: any; name: string }> = [
    { val: assignment.customer_communication_proof, stage: 'Customer Review', time: assignment.customer_review_image_time || assignment.proof_uploaded_at, name: 'cust_comm' },
    { val: assignment.client_communication_proof, stage: 'Customer Review', time: assignment.proof_uploaded_at, name: 'client_comm' },
    { val: assignment.proof_image, stage: 'Proof Uploaded', time: assignment.proof_uploaded_at, name: 'proof_img' },
    { val: assignment.uploaded_proof, stage: 'Proof Uploaded', time: assignment.proof_uploaded_at, name: 'uploaded_proof' },
    { val: assignment.proof_url, stage: 'Proof Uploaded', time: assignment.proof_uploaded_at, name: 'proof_url' },
    { val: assignment.customer_proof, stage: 'Customer Review', time: assignment.customer_review_image_time, name: 'customer_proof' },
    { val: assignment.client_proof, stage: 'Customer Review', time: assignment.proof_uploaded_at, name: 'client_proof' }
  ];

  for (const f of directFields) {
    if (f.val) {
      addProofCandidate(f.val, f.stage, f.time, f.name);
    }
  }

  // 6. Text notes / remarks fallback strictly on this assignment
  const textSources = [assignment.remarks, assignment.notes, assignment.raw?.remarks, assignment.raw?.notes].filter(Boolean);
  for (const txt of textSources) {
    if (typeof txt !== 'string') continue;
    const matches = Array.from(txt.matchAll(/(https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|webp|gif|svg|bmp|avif)(?:\?[^\s)]*)?)/gi));
    for (const m of matches) {
      if (m && m[1]) {
        let stage: 'Editing Started' | 'Customer Review' | 'Editing Completed' | 'Proof Uploaded' = 'Proof Uploaded';
        const lowerTxt = txt.toLowerCase();
        if (lowerTxt.includes('started')) stage = 'Editing Started';
        else if (lowerTxt.includes('customer review') || lowerTxt.includes('client review')) stage = 'Customer Review';
        else if (lowerTxt.includes('completed') || lowerTxt.includes('confirmed')) stage = 'Editing Completed';

        addProofCandidate(m[1], stage, assignment.updated_at || assignment.created_at, 'text');
      }
    }
  }

  // Sort strictly in chronological order (earliest uploaded first)
  return Array.from(proofsMap.values()).sort((a, b) => {
    const stageRank = (st: string) => {
      if (st === 'Editing Started') return 1;
      if (st === 'Customer Review') return 2;
      if (st === 'Editing Completed') return 3;
      return 4;
    };
    if (a.rawTimestamp !== b.rawTimestamp && a.rawTimestamp > 0 && b.rawTimestamp > 0) {
      return a.rawTimestamp - b.rawTimestamp;
    }
    return stageRank(a.stageTitle) - stageRank(b.stageTitle);
  });
};

interface ProductionStaffReportProps {
  onBack?: () => void;
}

export const ProductionStaffReport: React.FC<ProductionStaffReportProps> = ({ onBack }) => {
  const { 
    currentUser, 
    staff, 
    productionStaff,
    editorAssignments = [], 
    orders = [], 
    leads = [], 
    production = [],
    clientAcceptanceVerifications = []
  } = useRole();

  // Resolve logged-in production staff member
  const prodStaffMember = (productionStaff || []).find(s => 
    (s.staff_id && currentUser?.id && s.staff_id === currentUser.id) ||
    (s.id && currentUser?.id && s.id === currentUser.id) ||
    (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) || 
    (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase())
  );
  const opStaffMember = (staff || []).find(s => 
    (s.staff_id && currentUser?.id && s.staff_id === currentUser.id) ||
    (s.id && currentUser?.id && s.id === currentUser.id) ||
    (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) || 
    (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase())
  );
  const resolvedStaffId = prodStaffMember?.staff_id || opStaffMember?.staff_id || currentUser?.id;
  const staffName = prodStaffMember?.name || opStaffMember?.name || currentUser?.name || 'Staff';

  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'editing_started' | 'customer_review' | 'editing_completed'>('all');

  // Date Filter state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeFilterType, setActiveFilterType] = useState<'This Month' | 'Last Month' | 'Last three Month' | 'Custom Date' | null>(null);
  const [selectedOption, setSelectedOption] = useState<'This Month' | 'Last Month' | 'Last three Month' | 'Custom Date' | null>(null);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [appliedDateRange, setAppliedDateRange] = useState<{ start: string; end: string } | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

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

  // Date filter actions
  const handleSelectPreset = (preset: 'This Month' | 'Last Month' | 'Last three Month') => {
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
  
  // Dedicated popup modal for all deliverables of an Order/Task (never clipped by table overflow)
  const [selectedDeliverablesModal, setSelectedDeliverablesModal] = useState<{
    orderId: string;
    customerName: string;
    deliverables: Array<{
      key: string;
      assignmentId: string;
      deliverable: string;
      startDate: string;
      targetDeliveryDate: string;
      editingStatus: string;
      editingCompletedDate: string;
      proofs: TaskProofImage[];
      finalLinkUrl: string | null;
      rawFinalLink: string;
      isCompleted: boolean;
      isCustomerReview: boolean;
      isStarted: boolean;
      rawTimestamp: number;
    }>;
  } | null>(null);

  // Proofs popup modal for exact task
  const [selectedProofModal, setSelectedProofModal] = useState<{
    orderId: string;
    customerName: string;
    proofs: TaskProofImage[];
    deliverableNames: string[];
  } | null>(null);

  // Filter deliverable proofs inside popup modal
  const [modalDeliverableFilter, setModalDeliverableFilter] = useState<string>('all');

  // Fullscreen zoomed preview modal
  const [zoomImage, setZoomImage] = useState<{ url: string; title: string } | null>(null);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomImage) {
          setZoomImage(null);
        } else if (selectedProofModal) {
          setSelectedProofModal(null);
        } else if (selectedDeliverablesModal) {
          setSelectedDeliverablesModal(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomImage, selectedProofModal, selectedDeliverablesModal]);

  // Build report rows grouped by Order ID for all tasks/deliverables assigned to this staff member
  const { reportRows, rawAssignmentsCount, statusCounts } = useMemo(() => {
    if (!resolvedStaffId && !staffName && !currentUser?.id) {
      return { 
        reportRows: [], 
        rawAssignmentsCount: 0,
        statusCounts: { total: 0, assigned: 0, started: 0, review: 0, completed: 0 } 
      };
    }

    const normStaff = staffName.trim().toLowerCase();
    const normCurUser = (currentUser?.name || '').trim().toLowerCase();

    // Filter strictly by logged-in production staff member
    const myAssignments = (editorAssignments || []).filter(ea => {
      if (!ea) return false;
      const matchId = (resolvedStaffId && ea.staff_id && ea.staff_id === resolvedStaffId) ||
                      (currentUser?.id && ea.staff_id && ea.staff_id === currentUser.id);
      const eaName = (ea.staff_name || '').trim().toLowerCase();
      const matchName = (normStaff && eaName === normStaff) || (normCurUser && eaName === normCurUser);
      return matchId || matchName;
    });

    // Individual deliverable calculations for accurate 4 Analytic Cards counts
    let totalAssigned = myAssignments.length;
    let assignedEditor = 0;
    let editingStarted = 0;
    let customerReview = 0;
    let editingCompleted = 0;

    myAssignments.forEach(assignment => {
      const st = (assignment.status || '').toLowerCase();
      const isComp = ['editing completed', 'editing complete', 'client acceptance', 'client accepted', 'business owner review', 'project completed', 'completed', 'order closed', 'closed'].includes(st) || Boolean(assignment.server_upload_confirmed);
      const isRev = !isComp && ['customer review', 'client review', 'client review sent', 'revision required', 'revision in progress'].includes(st);
      const isSt = isComp || isRev || ['editing started', 'editing start', 'in progress', 'editing in progress'].includes(st);

      if (isComp) {
        editingCompleted++;
      } else if (isRev) {
        customerReview++;
      } else if (isSt) {
        editingStarted++;
      } else {
        assignedEditor++;
      }
    });

    // Group deliverables by clean Order ID
    const orderGroupsMap = new Map<string, {
      orderId: string;
      customerName: string;
      deliverables: Array<{
        key: string;
        assignmentId: string;
        deliverable: string;
        startDate: string;
        targetDeliveryDate: string;
        editingStatus: string;
        editingCompletedDate: string;
        proofs: TaskProofImage[];
        finalLinkUrl: string | null;
        rawFinalLink: string;
        isCompleted: boolean;
        isCustomerReview: boolean;
        isStarted: boolean;
        rawTimestamp: number;
      }>;
    }>();

    myAssignments.forEach((assignment, index) => {
      // Find corresponding production, order, and lead records
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

      const orderId = resolveCleanOrderId(assignment, prod, order, orders);
      const customerName = (lead?.customer_name || order?.customer_name || prod?.customer_name || lead?.client_name || 'Client').trim();
      const deliverable = (assignment.speciality || assignment.deliverable || 'Deliverable').trim();
      
      // 4. Start Date
      const startDateRaw = assignment.editing_start_date || (assignment as any).start_date || assignment.assigned_date || assignment.created_at || '';
      const startDate = startDateRaw ? formatDateDDMMYY(startDateRaw) : '—';

      // 5. Target Delivery Date
      const targetDateRaw = prod?.target_delivery_date || prod?.expected_delivery_date || assignment.target_finish_date || '';
      const targetDeliveryDate = targetDateRaw ? formatDateDDMMYY(targetDateRaw) : 'Not set';

      // 6. Editing Status
      const editingStatus = assignment.status || prod?.editing_status || 'Assigned Editor';

      // 7. Editing Completed Date
      const completedDateRaw = assignment.server_upload_confirmed_at || assignment.completed_at || (assignment as any).completed_date || '';
      const editingCompletedDate = completedDateRaw ? formatDateDDMMYY(completedDateRaw) : 'Not Completed';

      // Status categorization
      const isCompleted = ['editing completed', 'editing complete', 'client acceptance', 'client accepted', 'business owner review', 'project completed', 'completed', 'order closed', 'closed'].includes(editingStatus.toLowerCase()) || Boolean(assignment.server_upload_confirmed);
      const isCustomerReview = !isCompleted && ['customer review', 'client review', 'client review sent', 'revision required', 'revision in progress'].includes(editingStatus.toLowerCase());
      const isStarted = isCompleted || isCustomerReview || ['editing started', 'editing start', 'in progress', 'editing in progress'].includes(editingStatus.toLowerCase());

      // 8. Proofs strictly associated with this exact Deliverable & Assignment
      const proofs = extractAllProofsForAssignment(assignment, clientAcceptanceVerifications, deliverable);
      const proof = parseCustomerProof(assignment, prod, order);
      if (proofs.length === 0 && proof.hasProof && proof.imageUrl) {
        const { date, time } = formatDateTimeSafe(proof.uploadTime || assignment.updated_at || assignment.created_at);
        proofs.push({
          id: `${assignment.assignment_id || index}-proof-fb`,
          url: resolveStorageUrl(proof.imageUrl) || proof.imageUrl,
          deliverableName: deliverable,
          stageTitle: isCompleted ? 'Editing Completed' : isCustomerReview ? 'Customer Review' : isStarted ? 'Editing Started' : 'Proof Uploaded',
          uploadedDate: date,
          uploadedTime: time,
          rawTimestamp: getTimestamp(proof.uploadTime || assignment.updated_at)
        });
      }

      // 9. Final Link
      const rawFinalLink = (
        assignment.Edited_Drive_Link || 
        assignment.edited_drive_link || 
        assignment.server_file_link || 
        (prod && (prod.edited_drive_link || prod.server_drive_link)) || 
        ''
      ).trim();
      
      const hasFinalLink = Boolean(
        rawFinalLink && 
        rawFinalLink.toLowerCase() !== 'not uploaded' && 
        rawFinalLink.toLowerCase() !== 'pending' &&
        (rawFinalLink.startsWith('http://') || rawFinalLink.startsWith('https://') || rawFinalLink.includes('drive.google.com'))
      );
      const finalLinkUrl = hasFinalLink ? (rawFinalLink.startsWith('http') ? rawFinalLink : `https://${rawFinalLink}`) : null;

      const deliverableItem = {
        key: assignment.assignment_id || `assign-${index}`,
        assignmentId: assignment.assignment_id || `asgn-${index}`,
        deliverable,
        startDate,
        targetDeliveryDate,
        editingStatus,
        editingCompletedDate,
        proofs,
        finalLinkUrl,
        rawFinalLink,
        isCompleted,
        isCustomerReview,
        isStarted,
        rawTimestamp: getTimestamp(startDateRaw || assignment.created_at)
      };

      if (!orderGroupsMap.has(orderId)) {
        orderGroupsMap.set(orderId, {
          orderId,
          customerName,
          deliverables: [deliverableItem]
        });
      } else {
        const group = orderGroupsMap.get(orderId)!;
        // Avoid duplicate assignment entries for the exact same deliverable item
        if (!group.deliverables.some(d => d.assignmentId === deliverableItem.assignmentId)) {
          group.deliverables.push(deliverableItem);
        }
      }
    });

    // Build the consolidated table rows (ONE row per Order ID)
    const rows = Array.from(orderGroupsMap.values()).map(grp => {
      const primaryDeliv = grp.deliverables[0];
      const additionalCount = Math.max(0, grp.deliverables.length - 1);

      // Aggregate all proofs across deliverables for this Order ID in chronological order
      const allProofs = grp.deliverables.flatMap(d => d.proofs).sort((a, b) => {
        if (a.rawTimestamp && b.rawTimestamp && a.rawTimestamp !== b.rawTimestamp) {
          return a.rawTimestamp - b.rawTimestamp;
        }
        return 0;
      });

      // Overall order editing status based on deliverables
      const allCompleted = grp.deliverables.every(d => d.isCompleted);
      const anyReview = grp.deliverables.some(d => d.isCustomerReview);
      const anyStarted = grp.deliverables.some(d => d.isStarted);

      const overallEditingStatus = allCompleted 
        ? 'Editing Completed'
        : anyReview 
          ? 'Customer Review'
          : anyStarted 
            ? 'Editing Started'
            : (primaryDeliv?.editingStatus || 'Assigned Editor');

      // First available final link
      const primaryFinalLink = grp.deliverables.find(d => d.finalLinkUrl)?.finalLinkUrl || null;

      // Earliest start date and target date
      const validStartDate = grp.deliverables.find(d => d.startDate && d.startDate !== '—')?.startDate || primaryDeliv.startDate;
      const validTargetDate = grp.deliverables.find(d => d.targetDeliveryDate && d.targetDeliveryDate !== 'Not set')?.targetDeliveryDate || primaryDeliv.targetDeliveryDate;
      const validCompletedDate = allCompleted ? primaryDeliv.editingCompletedDate : 'Not Completed';

      return {
        key: `order-${grp.orderId}`,
        orderId: grp.orderId,
        customerName: grp.customerName,
        deliverables: grp.deliverables,
        primaryDeliverable: primaryDeliv.deliverable,
        additionalCount,
        startDate: validStartDate,
        targetDeliveryDate: validTargetDate,
        editingStatus: overallEditingStatus,
        editingCompletedDate: validCompletedDate,
        proofs: allProofs,
        finalLinkUrl: primaryFinalLink,
        isCompleted: allCompleted,
        isCustomerReview: anyReview,
        isStarted: anyStarted
      };
    });

    return {
      reportRows: rows,
      rawAssignmentsCount: totalAssigned,
      statusCounts: {
        total: totalAssigned,
        assigned: assignedEditor,
        started: editingStarted,
        review: customerReview,
        completed: editingCompleted
      }
    };
  }, [editorAssignments, production, orders, leads, resolvedStaffId, staffName, currentUser, clientAcceptanceVerifications]);

  // Date Filtered Rows
  const dateFilteredRows = useMemo(() => {
    if (!appliedDateRange) return reportRows;
    return reportRows.filter(row => {
      return row.deliverables.some(d => isDateInRange(d.startDate, appliedDateRange.start, appliedDateRange.end));
    });
  }, [reportRows, appliedDateRange]);

  // Filtered rows for display based on tab filter & search
  const filteredRows = useMemo(() => {
    return dateFilteredRows.filter(row => {
      // Status tab filter matches if ANY deliverable for this Order matches the status
      if (statusFilter === 'editing_completed' && !row.deliverables.some(d => d.isCompleted)) return false;
      if (statusFilter === 'customer_review' && !row.deliverables.some(d => d.isCustomerReview && !d.isCompleted)) return false;
      if (statusFilter === 'editing_started' && !row.deliverables.some(d => d.isStarted && !d.isCustomerReview && !d.isCompleted)) return false;
      if (statusFilter === 'assigned' && !row.deliverables.some(d => !d.isStarted)) return false;

      // Search query across Order ID, Customer, and all deliverable names
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchOrder = row.orderId.toLowerCase().includes(query);
        const matchCustomer = row.customerName.toLowerCase().includes(query);
        const matchDeliverable = row.deliverables.some(d => d.deliverable.toLowerCase().includes(query));
        const matchStatus = row.editingStatus.toLowerCase().includes(query);
        if (!matchOrder && !matchCustomer && !matchDeliverable && !matchStatus) return false;
      }

      return true;
    });
  }, [dateFilteredRows, statusFilter, searchQuery]);

  return (
    <div className="p-4 sm:p-6 bg-black min-h-screen text-white font-sans selection:bg-purple-500/30">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* 4 SUMMARY ANALYTIC CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          {/* Card 1: Total Assigned Tasks */}
          <div 
            onClick={() => setStatusFilter('all')}
            className={`bg-zinc-950/90 border rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group transition-all cursor-pointer ${
              statusFilter === 'all' 
                ? 'border-purple-500/50 ring-2 ring-purple-500/20' 
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                Total Assigned Tasks
              </span>
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-3">
              {statusCounts.total}
            </div>
            <p className="text-[10px] text-zinc-500 font-mono mt-1">
              All tasks assigned to you
            </p>
          </div>

          {/* Card 2: Editing Started */}
          <div 
            onClick={() => setStatusFilter(statusFilter === 'editing_started' ? 'all' : 'editing_started')}
            className={`bg-zinc-950/90 border rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group transition-all cursor-pointer ${
              statusFilter === 'editing_started' 
                ? 'border-sky-500/50 ring-2 ring-sky-500/20' 
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-sky-400 uppercase tracking-wider">
                Editing Started
              </span>
              <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Play className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-sky-300 font-mono mt-3">
              {statusCounts.started}
            </div>
            <p className="text-[10px] text-zinc-500 font-mono mt-1">
              Active editing in progress
            </p>
          </div>

          {/* Card 3: Customer Review */}
          <div 
            onClick={() => setStatusFilter(statusFilter === 'customer_review' ? 'all' : 'customer_review')}
            className={`bg-zinc-950/90 border rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group transition-all cursor-pointer ${
              statusFilter === 'customer_review' 
                ? 'border-amber-500/50 ring-2 ring-amber-500/20' 
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                Customer Review
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 font-mono mt-3">
              {statusCounts.review}
            </div>
            <p className="text-[10px] text-zinc-500 font-mono mt-1">
              Sent for client review
            </p>
          </div>

          {/* Card 4: Editing Completed */}
          <div 
            onClick={() => setStatusFilter(statusFilter === 'editing_completed' ? 'all' : 'editing_completed')}
            className={`bg-zinc-950/90 border rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden group transition-all cursor-pointer ${
              statusFilter === 'editing_completed' 
                ? 'border-emerald-500/50 ring-2 ring-emerald-500/20' 
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                Editing Completed
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-300 font-mono mt-3">
              {statusCounts.completed}
            </div>
            <p className="text-[10px] text-zinc-500 font-mono mt-1">
              Completed & verified
            </p>
          </div>

        </div>

        {/* CONTROLS: SEARCH & STATUS FILTER TABS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/80 p-3.5 rounded-2xl border border-zinc-800/80">
          <div className="flex items-center gap-2.5 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Order ID, Customer, Deliverable..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500/60 font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* SINGLE Filter button with dropdown/popover */}
            <div className="relative" ref={filterRef}>
              <button
                id="btn_production_staff_report_filter"
                type="button"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all cursor-pointer border ${
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
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-3 sm:p-3.5 z-50 text-xs font-mono space-y-3 animate-in fade-in duration-150">
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

                  <div className="space-y-1">
                    {(['This Month', 'Last Month', 'Last three Month', 'Custom Date'] as const).map((opt) => {
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

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: `All (${statusCounts.total})` },
              { id: 'assigned', label: `Assigned Editor (${statusCounts.assigned})` },
              { id: 'editing_started', label: `Editing Started (${statusCounts.started})` },
              { id: 'customer_review', label: `Customer Review (${statusCounts.review})` },
              { id: 'editing_completed', label: `Editing Completed (${statusCounts.completed})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-colors cursor-pointer border ${
                  statusFilter === tab.id
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm'
                    : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* REPORT TABLE */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
                🎬 Production Deliverables & Progress Log
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                {filteredRows.length} {filteredRows.length === 1 ? 'Order' : 'Orders'} ({rawAssignmentsCount} Tasks)
              </span>
            </div>
            <div className="text-[10px] font-mono text-zinc-500">
              *Read-only activity log
            </div>
          </div>

          {/* SINGLE SHARED HORIZONTAL SCROLLBAR */}
          <div className="overflow-x-auto touch-pan-x w-full">
            <table className="w-full text-left border-collapse min-w-[1260px]">
              <thead className="bg-zinc-900/80 sticky top-0 z-10">
                {/* 1. TABLE COLUMN HEADERS - STRICT SINGLE LINE WITH NO WRAPPING */}
                <tr className="border-b border-zinc-800 font-mono text-[10px] text-zinc-400 uppercase tracking-wider whitespace-nowrap">
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[110px]" style={{ whiteSpace: 'nowrap' }}>
                    1. Order ID
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[150px]" style={{ whiteSpace: 'nowrap' }}>
                    2. Customer Name
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[240px]" style={{ whiteSpace: 'nowrap' }}>
                    3. Deliverable
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[110px]" style={{ whiteSpace: 'nowrap' }}>
                    4. Start Date
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[160px]" style={{ whiteSpace: 'nowrap' }}>
                    5. Target Delivery Date
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[135px]" style={{ whiteSpace: 'nowrap' }}>
                    6. Editing Status
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[170px]" style={{ whiteSpace: 'nowrap' }}>
                    7. Editing Completed Date
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[130px]" style={{ whiteSpace: 'nowrap' }}>
                    8. Proof
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[115px]" style={{ whiteSpace: 'nowrap' }}>
                    9. Final Link
                  </th>
                  <th className="px-3.5 py-3 font-bold whitespace-nowrap min-w-[130px] text-center" style={{ whiteSpace: 'nowrap' }}>
                    10. Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-xs font-sans">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-zinc-500 font-mono text-xs">
                      No matching production deliverables found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const statusLower = row.editingStatus.toLowerCase();
                    const isStatusComplete = ['editing completed', 'editing complete', 'client acceptance', 'client accepted', 'completed', 'order closed', 'closed'].includes(statusLower);
                    const isStatusReview = ['customer review', 'client review', 'client review sent', 'revision required', 'revision in progress'].includes(statusLower);
                    const isStatusInProgress = ['editing started', 'editing start', 'in progress', 'editing in progress'].includes(statusLower);

                    return (
                      <tr key={row.key} className="hover:bg-zinc-900/40 transition-colors">
                        
                        {/* 1. ORDER ID COLUMN - SHOWS ONLY ACTUAL ORDER ID + COMPACT INDICATOR FOR MULTIPLE DELIVERABLES */}
                        <td className="px-3.5 py-3 font-mono font-bold text-violet-400 whitespace-nowrap min-w-[110px]">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (row.deliverables.length > 1) {
                                  setSelectedDeliverablesModal({
                                    orderId: row.orderId,
                                    customerName: row.customerName,
                                    deliverables: row.deliverables
                                  });
                                }
                              }}
                              className={`font-mono font-bold text-violet-400 transition-colors ${
                                row.deliverables.length > 1 ? 'hover:text-violet-300 hover:underline cursor-pointer' : 'cursor-default'
                              }`}
                              title={row.deliverables.length > 1 ? `Click to view all ${row.deliverables.length} deliverables` : `Order ${row.orderId}`}
                            >
                              {row.orderId}
                            </button>

                            {/* COMPACT +N INDICATOR */}
                            {row.additionalCount > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedDeliverablesModal({
                                  orderId: row.orderId,
                                  customerName: row.customerName,
                                  deliverables: row.deliverables
                                })}
                                className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 transition-all cursor-pointer shadow-xs active:scale-95"
                                title={`+${row.additionalCount} additional deliverable${row.additionalCount === 1 ? '' : 's'}. Click to view popup`}
                              >
                                +{row.additionalCount}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 2. Customer Name */}
                        <td className="px-3.5 py-3 whitespace-nowrap font-medium text-white min-w-[150px]">
                          <div className="font-bold">{row.customerName}</div>
                        </td>

                        {/* 3. Deliverable - Fixed/Minimum Width, Compact, First deliverable + "+N", opens Deliverable Popup */}
                        <td className="px-3.5 py-3 font-bold text-purple-300 whitespace-nowrap min-w-[240px] max-w-[280px]">
                          {row.additionalCount > 0 ? (
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className="shrink-0 text-sm">🎯</span>
                              <button
                                type="button"
                                onClick={() => setSelectedDeliverablesModal({
                                  orderId: row.orderId,
                                  customerName: row.customerName,
                                  deliverables: row.deliverables
                                })}
                                className="font-bold text-purple-300 hover:text-purple-200 hover:underline truncate text-left text-xs cursor-pointer max-w-[175px]"
                                title={`Click to view all ${row.deliverables.length} deliverables: ${row.primaryDeliverable}`}
                              >
                                {row.primaryDeliverable}
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedDeliverablesModal({
                                  orderId: row.orderId,
                                  customerName: row.customerName,
                                  deliverables: row.deliverables
                                })}
                                className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/35 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
                                title={`+${row.additionalCount} more deliverables. Click to view all.`}
                              >
                                +{row.additionalCount}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 overflow-hidden" title={row.primaryDeliverable}>
                              <span className="shrink-0 text-sm">🎯</span>
                              <span className="truncate max-w-[240px] text-xs">
                                {row.primaryDeliverable}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* 4. Start Date */}
                        <td className="px-3.5 py-3 font-mono text-xs text-zinc-300 whitespace-nowrap min-w-[110px]">
                          {row.startDate}
                        </td>

                        {/* 5. Target Delivery Date */}
                        <td className="px-3.5 py-3 font-mono text-xs font-bold text-zinc-200 whitespace-nowrap min-w-[160px]">
                          {row.targetDeliveryDate}
                        </td>

                        {/* 6. Editing Status */}
                        <td className="px-3.5 py-3 whitespace-nowrap min-w-[135px]">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                            isStatusComplete
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : isStatusReview
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : isStatusInProgress
                                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                                  : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                          }`}>
                            {row.editingStatus}
                          </span>
                        </td>

                        {/* 7. Editing Completed Date */}
                        <td className="px-3.5 py-3 font-mono text-xs whitespace-nowrap min-w-[170px]">
                          {row.editingCompletedDate !== 'Not Completed' ? (
                            <span className="font-bold text-emerald-400">
                              {row.editingCompletedDate}
                            </span>
                          ) : (
                            <span className="text-zinc-500 italic">
                              Not Completed
                            </span>
                          )}
                        </td>

                        {/* 8. Proof - Opens Proof Popup with ALL proofs clearly tagged by Deliverable Name */}
                        <td className="px-3.5 py-3 whitespace-nowrap min-w-[130px]">
                          {row.proofs && row.proofs.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setModalDeliverableFilter('all');
                                setSelectedProofModal({
                                  orderId: row.orderId,
                                  customerName: row.customerName,
                                  proofs: row.proofs,
                                  deliverableNames: Array.from(new Set(row.deliverables.map(d => d.deliverable)))
                                });
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                              title="View All Uploaded Proof Images"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Proof</span>
                              {row.proofs.length > 1 && (
                                <span className="ml-0.5 px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded-full text-[10px]">
                                  {row.proofs.length}
                                </span>
                              )}
                            </button>
                          ) : (
                            <span className="text-zinc-500 font-mono text-xs italic">
                              Not Uploaded
                            </span>
                          )}
                        </td>

                        {/* 9. Final Link */}
                        <td className="px-3.5 py-3 whitespace-nowrap min-w-[115px]">
                          {row.finalLinkUrl ? (
                            <a
                              href={row.finalLinkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              referrerPolicy="no-referrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer max-w-[140px] truncate"
                              title={row.finalLinkUrl}
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span className="truncate">Open Link</span>
                            </a>
                          ) : (
                            <span className="text-zinc-500 font-mono text-xs italic">
                              Not Uploaded
                            </span>
                          )}
                        </td>

                        {/* 10. Status */}
                        <td className="px-3.5 py-3 whitespace-nowrap text-center min-w-[130px]">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                            row.isCompleted
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : row.isCustomerReview
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : row.isStarted
                                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                                  : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                          }`}>
                            {row.isCompleted 
                              ? 'Editing Completed' 
                              : row.isCustomerReview
                                ? 'Customer Review'
                                : row.isStarted 
                                  ? 'Editing Started' 
                                  : 'Assigned Editor'}
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

      {/* ALL DELIVERABLES POPUP MODAL FOR EXACT ORDER/TASK */}
      {selectedDeliverablesModal && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
          onClick={() => setSelectedDeliverablesModal(null)}
        >
          <div 
            className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/90">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    🎯 Order Deliverables
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-bold">
                    {selectedDeliverablesModal.deliverables.length} {selectedDeliverablesModal.deliverables.length === 1 ? 'Deliverable' : 'Deliverables'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-violet-300 text-[10px] font-mono font-bold">
                    {selectedDeliverablesModal.orderId}
                  </span>
                </div>
                <div className="text-xs text-zinc-300">
                  Customer: <strong className="text-white">{selectedDeliverablesModal.customerName}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDeliverablesModal(null)}
                className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer border border-transparent hover:border-zinc-700"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Scrollable list of separate deliverable items */}
            <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-3 bg-black/60">
              {selectedDeliverablesModal.deliverables.map((item, idx) => (
                <div 
                  key={item.key || idx}
                  className="p-3.5 sm:p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col gap-2.5 hover:border-zinc-700 transition-all shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                        #{idx + 1}
                      </span>
                      <div className="space-y-0.5">
                        <div className="font-bold text-white text-sm leading-snug">
                          {item.deliverable}
                        </div>
                      </div>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 uppercase tracking-wider border ${
                      item.isCompleted
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : item.isCustomerReview
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : item.isStarted
                            ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                            : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                    }`}>
                      {item.editingStatus}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono text-zinc-400 pt-2 border-t border-zinc-800/80">
                    <div>
                      <span className="text-zinc-500">Start:</span>{' '}
                      <span className="text-zinc-300 font-semibold">{item.startDate}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Target:</span>{' '}
                      <span className="text-zinc-200 font-bold">{item.targetDeliveryDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.proofs && item.proofs.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDeliverablesModal(null);
                            setModalDeliverableFilter(item.deliverable);
                            setSelectedProofModal({
                              orderId: selectedDeliverablesModal.orderId,
                              customerName: selectedDeliverablesModal.customerName,
                              proofs: item.proofs,
                              deliverableNames: [item.deliverable]
                            });
                          }}
                          className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                          title="View proofs for this deliverable"
                        >
                          <span>📸 {item.proofs.length} Proof{item.proofs.length === 1 ? '' : 's'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-zinc-600 italic">No proofs</span>
                      )}

                      {item.finalLinkUrl && (
                        <a
                          href={item.finalLinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 hover:underline ml-auto"
                          title="Open final link"
                        >
                          <span>Link</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-zinc-800 bg-zinc-900/90 flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-500">
                Order {selectedDeliverablesModal.orderId} • {selectedDeliverablesModal.deliverables.length} Deliverable{selectedDeliverablesModal.deliverables.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={() => setSelectedDeliverablesModal(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALL PROOF IMAGES POPUP MODAL - SHOWS DELIVERABLE NAME, PROOF IMAGE, STAGE, DATE, TIME */}
      {selectedProofModal && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
          onClick={() => setSelectedProofModal(null)}
        >
          <div 
            className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/90">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    📸 Task Proof Images
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                    {selectedProofModal.proofs.length} {selectedProofModal.proofs.length === 1 ? 'Proof Uploaded' : 'Proofs Uploaded'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-purple-300 text-[10px] font-mono font-bold">
                    {selectedProofModal.orderId}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-300 flex-wrap">
                  <span className="font-semibold text-white">{selectedProofModal.customerName}</span>
                  <span className="text-zinc-600">•</span>
                  <span className="font-mono text-purple-300">
                    {selectedProofModal.deliverableNames.length} {selectedProofModal.deliverableNames.length === 1 ? 'Deliverable' : 'Deliverables'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedProofModal(null)}
                className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer border border-transparent hover:border-zinc-700"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter by deliverable tabs if multiple deliverables exist */}
            {selectedProofModal.deliverableNames.length > 1 && (
              <div className="px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800 flex items-center gap-1.5 overflow-x-auto text-xs font-mono">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider mr-1 shrink-0 font-bold">
                  Deliverable:
                </span>
                <button
                  type="button"
                  onClick={() => setModalDeliverableFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                    modalDeliverableFilter === 'all'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700 hover:text-white'
                  }`}
                >
                  All ({selectedProofModal.proofs.length})
                </button>
                {selectedProofModal.deliverableNames.map((name) => {
                  const count = selectedProofModal.proofs.filter(p => p.deliverableName === name).length;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setModalDeliverableFilter(name)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                        modalDeliverableFilter === name
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700 hover:text-white'
                      }`}
                    >
                      {name} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Proofs Content (Scrollable & Responsive) */}
            <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5 bg-black/60">
              {(() => {
                const proofsToShow = selectedProofModal.proofs.filter(p => 
                  modalDeliverableFilter === 'all' || p.deliverableName === modalDeliverableFilter
                );

                if (proofsToShow.length === 0) {
                  return (
                    <div className="py-12 text-center text-zinc-500 font-mono text-xs">
                      No proofs found for the selected deliverable.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {proofsToShow.map((item, idx) => {
                      const isStarted = item.stageTitle === 'Editing Started';
                      const isReview = item.stageTitle === 'Customer Review';
                      const isCompleted = item.stageTitle === 'Editing Completed';

                      const badgeClass = isCompleted
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : isReview
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : isStarted
                            ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                            : 'bg-purple-500/15 text-purple-300 border-purple-500/30';

                      return (
                        <div 
                          key={item.id} 
                          className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg flex flex-col hover:border-zinc-700 transition-all"
                        >
                          {/* Deliverable Name Header */}
                          <div className="p-3 bg-zinc-950/90 border-b border-zinc-800/80 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider shrink-0 font-bold">
                                Deliverable:
                              </span>
                              <span className="text-xs font-bold text-purple-300 truncate" title={item.deliverableName}>
                                {item.deliverableName}
                              </span>
                            </div>

                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-mono font-bold text-zinc-400 hover:text-white flex items-center gap-1 shrink-0 transition-colors"
                              title="Open full image in new tab"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Open Full</span>
                            </a>
                          </div>

                          {/* Proof Image */}
                          <div 
                            className="relative bg-black/80 aspect-video flex items-center justify-center overflow-hidden cursor-pointer group"
                            onClick={() => setZoomImage({ url: item.url, title: `${item.deliverableName} • ${item.stageTitle}` })}
                          >
                            <img
                              src={item.url}
                              alt={`${item.deliverableName} - ${item.stageTitle}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-mono font-bold backdrop-blur-[2px]">
                              <Eye className="w-4 h-4" />
                              <span>Click to Zoom</span>
                            </div>
                          </div>

                          {/* Stage, Date, and Time Details */}
                          <div className="p-3 bg-zinc-950/95 border-t border-zinc-800/80 space-y-1.5 text-xs font-mono">
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-400 font-medium">Stage:</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeClass}`}>
                                {item.stageTitle}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-400 font-medium">Date:</span>
                              <span className="text-zinc-200 font-bold">{item.uploadedDate}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-400 font-medium">Time:</span>
                              <span className="text-zinc-200 font-bold">{item.uploadedTime}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-zinc-800 bg-zinc-900/90 flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-500">
                Linked strictly to {selectedProofModal.orderId} • Production Staff
              </span>
              <button
                type="button"
                onClick={() => setSelectedProofModal(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN IMAGE ZOOM MODAL */}
      {zoomImage && (
        <div 
          className="fixed inset-0 bg-black/95 backdrop-blur-lg z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setZoomImage(null)}
        >
          <div 
            className="max-w-5xl w-full bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
              <h4 className="text-sm font-bold text-white font-mono">{zoomImage.title}</h4>
              <div className="flex items-center gap-2">
                <a
                  href={zoomImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded-xl flex items-center gap-1.5 font-bold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Tab</span>
                </a>
                <button
                  type="button"
                  onClick={() => setZoomImage(null)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 flex-1 flex items-center justify-center bg-black/60 overflow-auto">
              <img
                src={zoomImage.url}
                alt={zoomImage.title}
                referrerPolicy="no-referrer"
                className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
