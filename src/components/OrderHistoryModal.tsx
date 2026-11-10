import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  History, 
  X, 
  Search, 
  ArrowDownUp, 
  Loader2, 
  Image as ImageIcon, 
  Eye, 
  ClipboardCheck, 
  CheckCircle2, 
  Circle, 
  ExternalLink, 
  Copy, 
  Check, 
  ChevronLeft, 
  ChevronRight,
  Maximize2,
  Calendar,
  User,
  ShieldCheck,
  FileCheck
} from 'lucide-react';
import { supabaseClient } from '../supabaseClient';
import { useRole } from './RoleContext';
import { formatDateDDMMYY, formatTime12Hour, getAllMatchingOrderIds, resolveStorageUrl } from '../utils';
import { SafeProofImage } from './ui/SafeProofImage';

export interface OrderHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any; // Order, Lead, or summary table item
}

interface StatusHistoryItem {
  id: string;
  created_at: string;
  new_status: string;
  changed_by: string;
  timestamp: string;
}

export interface ProofImageItem {
  id: string;
  url: string;
  caption: string;
  staffName: string;
  staffRole?: string;
  eventName?: string;
  timestamp?: string;
  stageName: string;
}

export interface ClientAcceptanceChecklistItem {
  key: string;
  title: string;
  description: string;
  isCompleted: boolean;
}

export interface ClientAcceptanceChecklistData {
  orderId: string;
  customerName?: string;
  checklistItems: ClientAcceptanceChecklistItem[];
  deliveryMethod?: 'server_link' | 'physical_drive' | string;
  serverLink?: string;
  physicalDriveDetails?: string;
  consentProofUrl?: string | null;
  consentProofFileName?: string;
  isVerified?: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
}

/**
 * Standard PhotoCrew ERP stage progression ranks to ensure chronological workflow order
 * in case of simultaneous timestamps or seed record resolution.
 */
const getStageWorkflowRank = (statusText?: string): number => {
  if (!statusText) return 0;
  const s = statusText.trim().toLowerCase();
  
  // 1. Initial Sales Lead stages
  if (s.includes('new lead') || s === 'new' || s === 'lead' || s === 'inquiry') return 10;
  if (s.includes('create quote') || s.includes('created quotation') || s === 'contacted') return 20;
  if (s.includes('quote sent') || s.includes('quotation sent')) return 30;
  if (s.includes('follow-up') || s.includes('follow up') || s.includes('negotiation')) return 40;
  if (s.includes('lost')) return 45;

  // 2. Order Confirmation
  if (s.includes('confirm order') || s.includes('order confirmed') || s.includes('new order received') || s === 'confirmed') return 50;

  // 3. Operations stages
  if (s.includes('operation assigned') || s.includes('assigned crew') || s.includes('staff assigned') || s.includes('event scheduled') || s.includes('scheduled')) return 60;
  if (s.includes('event started') || s.includes('event start')) return 70;
  if (s.includes('event ended') || s.includes('event end') || s.includes('event completed') || s.includes('event complete')) return 80;
  if (s.includes('footage handover') || s.includes('raw footage')) return 90;
  if (s.includes('verified footage') || s.includes('footage handover verified') || s.includes('operations completed')) return 100;

  // 4. Production stages
  if (s.includes('assigned editor') || s.includes('editor assigned')) return 110;
  if (s.includes('editing started') || s.includes('production started')) return 120;
  if (s.includes('editing in progress') || s.includes('in progress') || s.includes('active editing')) return 130;
  if (s.includes('internal qc') || s.includes('internal review')) return 140;
  if (s.includes('customer review') || s.includes('client review')) return 150;
  if (s.includes('revision')) return 160;
  if (s.includes('editing completed') || s.includes('proof uploaded') || s.includes('ready for delivery')) return 170;
  if (s.includes('client acceptance') || s.includes('client accepted') || s.includes('client approval') || s.includes('approved')) return 180;
  if (s.includes('business owner review') || s.includes('final approval')) return 190;
  if (s.includes('delivered') || s.includes('project delivered')) return 200;
  if (s.includes('order closed') || s.includes('project closed') || s.includes('closed') || s.includes('completed')) return 210;

  return 55;
};

export const OrderHistoryModal: React.FC<OrderHistoryModalProps> = ({
  isOpen,
  onClose,
  order
}) => {
  const { 
    leads = [], 
    orders = [], 
    production = [],
    operations = [],
    rawFootage = [],
    statusHistory = [],
    logs = [],
    staffAssignments: inMemStaffAssignments = [],
    editorAssignments: inMemEditorAssignments = []
  } = useRole();

  const [dbHistory, setDbHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // Default oldest first, newest last

  // Stage Proofs Data loaded from DB
  const [dbStaffAssignments, setDbStaffAssignments] = useState<any[]>([]);
  const [dbEquipmentHistory, setDbEquipmentHistory] = useState<any[]>([]);
  const [dbEditorAssignments, setDbEditorAssignments] = useState<any[]>([]);
  const [dbProductionRecords, setDbProductionRecords] = useState<any[]>([]);
  const [dbClientAcceptanceVerifs, setDbClientAcceptanceVerifs] = useState<any[]>([]);

  // Modals state for Proof Gallery, Lightbox, and Client Acceptance Checklist
  const [selectedGallery, setSelectedGallery] = useState<{ stageName: string; images: ProofImageItem[] } | null>(null);
  const [selectedChecklist, setSelectedChecklist] = useState<ClientAcceptanceChecklistData | null>(null);
  const [lightboxImageIndex, setLightboxImageIndex] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setSelectedGallery(null);
      setSelectedChecklist(null);
      setLightboxImageIndex(null);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle Escape key: close nested modals first, then main modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (lightboxImageIndex !== null) {
          setLightboxImageIndex(null);
        } else if (selectedChecklist !== null) {
          setSelectedChecklist(null);
        } else if (selectedGallery !== null) {
          setSelectedGallery(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, lightboxImageIndex, selectedChecklist, selectedGallery, onClose]);

  // Helper to sanitize IDs
  const sanitizeId = (id?: any): string => {
    if (!id || typeof id !== 'string') return '';
    const clean = id.trim();
    if (['n/a', 'na', 'null', 'undefined', '—', '-', 'none', 'unknown'].includes(clean.toLowerCase())) return '';
    return clean;
  };

  // Identify Target Lead / Order / Production IDs
  const rawOrderId = sanitizeId(order?.order_id || order?.orderId || order?.rawOrder?.order_id);
  const rawLeadId = sanitizeId(order?.lead_id || order?.leadId || order?.rawLead?.lead_id || order?.rawOrder?.lead_id);
  const rawProdId = sanitizeId(order?.production_id || order?.rawProd?.production_id);

  const matchedOrder = useMemo(() => {
    if (rawOrderId) {
      const found = (orders || []).find(o => sanitizeId(o.order_id).toLowerCase() === rawOrderId.toLowerCase());
      if (found) return found;
    }
    if (rawLeadId) {
      const found = (orders || []).find(o => sanitizeId(o.lead_id).toLowerCase() === rawLeadId.toLowerCase());
      if (found) return found;
    }
    return order?.rawOrder || (rawOrderId ? order : null);
  }, [orders, rawOrderId, rawLeadId, order]);

  const matchedLead = useMemo(() => {
    const leadIdToLook = rawLeadId || sanitizeId(matchedOrder?.lead_id);
    if (leadIdToLook) {
      const found = (leads || []).find(l => sanitizeId(l.lead_id).toLowerCase() === leadIdToLook.toLowerCase());
      if (found) return found;
    }
    if (rawOrderId) {
      const found = (leads || []).find(l => sanitizeId(l.order_id).toLowerCase() === rawOrderId.toLowerCase());
      if (found) return found;
    }
    return order?.rawLead || (rawLeadId ? order : null);
  }, [leads, rawLeadId, rawOrderId, matchedOrder, order]);

  const matchedProd = useMemo(() => {
    if (rawProdId) {
      const found = (production || []).find(p => sanitizeId(p.production_id).toLowerCase() === rawProdId.toLowerCase());
      if (found) return found;
    }
    if (rawOrderId) {
      const found = (production || []).find(p => sanitizeId(p.order_id).toLowerCase() === rawOrderId.toLowerCase());
      if (found) return found;
    }
    if (rawLeadId) {
      const found = (production || []).find(p => sanitizeId(p.lead_id).toLowerCase() === rawLeadId.toLowerCase());
      if (found) return found;
    }
    return order?.rawProd || null;
  }, [production, rawProdId, rawOrderId, rawLeadId, order]);

  const matchedOp = useMemo(() => {
    if (rawOrderId) {
      const found = (operations || []).find(op => sanitizeId(op.order_id).toLowerCase() === rawOrderId.toLowerCase());
      if (found) return found;
    }
    if (rawLeadId) {
      const found = (operations || []).find(op => sanitizeId((op as any).lead_id).toLowerCase() === rawLeadId.toLowerCase());
      if (found) return found;
    }
    return order?.rawOps || null;
  }, [operations, rawOrderId, rawLeadId, order]);

  const primaryOrderId = sanitizeId(matchedOrder?.order_id || rawOrderId);
  const primaryLeadId = sanitizeId(matchedLead?.lead_id || rawLeadId || matchedOrder?.lead_id);
  const primaryProdId = sanitizeId(matchedProd?.production_id || rawProdId);
  const customerName = matchedOrder?.customer_name || matchedLead?.customer_name || order?.customer_name || '';

  // Collect all variant IDs for robust querying across tables
  const allMatchingIds = useMemo(() => {
    const set = new Set<string>();
    if (primaryOrderId) set.add(primaryOrderId);
    if (primaryLeadId) set.add(primaryLeadId);
    if (primaryProdId) set.add(primaryProdId);

    const variants = getAllMatchingOrderIds(primaryOrderId, primaryLeadId, orders, leads);
    variants.forEach(v => {
      const c = sanitizeId(v);
      if (c) set.add(c);
    });
    return Array.from(set);
  }, [primaryOrderId, primaryLeadId, primaryProdId, orders, leads]);

  // Clean staff name (remove role suffix like "|Sales Team")
  const cleanStaffName = (raw?: string) => {
    if (!raw) return 'System';
    const firstPart = raw.split('|')[0].trim();
    if (!firstPart || firstPart.toLowerCase() === 'unassigned' || firstPart.toLowerCase() === 'n/a') return 'System';
    return firstPart;
  };

  // Helper date parser
  const parseDateTime = (dateVal?: any) => {
    if (!dateVal) {
      return { iso: new Date(0).toISOString(), date: '—', time: '' };
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) {
      return { iso: String(dateVal), date: String(dateVal), time: '' };
    }
    return {
      iso: d.toISOString(),
      date: formatDateDDMMYY(d),
      time: formatTime12Hour(d)
    };
  };

  // Fetch status history and stage-wise proofs from database whenever modal opens
  useEffect(() => {
    if (!isOpen || allMatchingIds.length === 0) {
      setDbHistory([]);
      setDbStaffAssignments([]);
      setDbEquipmentHistory([]);
      setDbEditorAssignments([]);
      setDbProductionRecords([]);
      setDbClientAcceptanceVerifs([]);
      return;
    }

    let isMounted = true;
    const fetchHistoryAndProofs = async () => {
      setIsLoading(true);
      try {
        const orConditionsLeadAndOrder = allMatchingIds
          .flatMap(id => [`order_id.eq.${id}`, `lead_id.eq.${id}`])
          .join(',');

        const orConditionsOrderOnly = allMatchingIds
          .map(id => `order_id.eq.${id}`)
          .join(',');

        // 1. Fetch Status History
        if (orConditionsLeadAndOrder) {
          const { data: histData, error: histErr } = await supabaseClient
            .from('lead_status_history')
            .select('*')
            .or(orConditionsLeadAndOrder)
            .order('created_at', { ascending: true });

          if (histErr) {
            console.warn("[OrderHistoryModal] DB fetch error from lead_status_history:", histErr.message);
          } else if (isMounted && histData) {
            setDbHistory(histData);
          }
        }

        // 2. Fetch Staff Assignments (Event Start, Event End, Equipment Handover photos)
        if (orConditionsLeadAndOrder) {
          const { data: saData } = await supabaseClient
            .from('staff_assignments')
            .select('*')
            .or(orConditionsLeadAndOrder);

          if (isMounted && saData) {
            setDbStaffAssignments(saData);
          }
        }

        // 3. Fetch Lead Equipment History (photos for handover / return)
        if (orConditionsLeadAndOrder) {
          const { data: eqData } = await supabaseClient
            .from('lead_equipment_history')
            .select('*')
            .or(orConditionsLeadAndOrder);

          if (isMounted && eqData) {
            setDbEquipmentHistory(eqData);
          }
        }

        // 4. Fetch Editor Assignments (Production proofs, customer review photos)
        if (orConditionsOrderOnly) {
          const { data: eaData } = await supabaseClient
            .from('editor_assignments')
            .select('*')
            .or(orConditionsOrderOnly);

          if (isMounted && eaData) {
            setDbEditorAssignments(eaData);
          }
        }

        // 5. Fetch Production records (Checklists, approval proofs)
        if (orConditionsLeadAndOrder) {
          const { data: prData } = await supabaseClient
            .from('production')
            .select('*')
            .or(orConditionsLeadAndOrder);

          if (isMounted && prData) {
            setDbProductionRecords(prData);
          }
        }

        // 6. Fetch Client Acceptance Verifications
        if (orConditionsOrderOnly) {
          const { data: cavData } = await supabaseClient
            .from('client_acceptance_verifications')
            .select('*')
            .or(orConditionsOrderOnly);

          if (isMounted && cavData) {
            setDbClientAcceptanceVerifs(cavData);
          }
        }

      } catch (err: any) {
        console.warn("[OrderHistoryModal] Exception fetching history and proofs:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchHistoryAndProofs();

    return () => {
      isMounted = false;
    };
  }, [isOpen, allMatchingIds]);

  // Combine database records with fallback/in-memory records to guarantee full stage progression
  const fullStatusHistory = useMemo<StatusHistoryItem[]>(() => {
    if (!isOpen || !order) return [];

    // Filter in-memory statusHistory from RoleContext
    const inMemoryStatusHistory = (statusHistory || []).filter((sh: any) => {
      const shOrd = sanitizeId(sh.order_id);
      const shLd = sanitizeId(sh.lead_id);
      return (shOrd && allMatchingIds.some(id => id.toLowerCase() === shOrd.toLowerCase())) ||
             (shLd && allMatchingIds.some(id => id.toLowerCase() === shLd.toLowerCase()));
    });

    // Merge dbHistory and inMemoryStatusHistory, deduplicating by ID
    const combinedRaw = [...dbHistory];
    const seenIds = new Set<string>(dbHistory.map(r => String(r.id || '')));
    inMemoryStatusHistory.forEach((r: any) => {
      const idKey = r.id ? String(r.id) : `${r.created_at || r.timestamp}_${r.new_status}`;
      if (!seenIds.has(idKey)) {
        seenIds.add(idKey);
        combinedRaw.push(r);
      }
    });

    // Also extract stage transition logs from activity logs if any
    (logs || []).forEach((lg: any) => {
      const recId = sanitizeId(lg.record_id);
      if (recId && allMatchingIds.some(id => id.toLowerCase() === recId.toLowerCase())) {
        if (lg.new_stage && typeof lg.new_stage === 'string' && lg.new_stage.trim()) {
          const idKey = `log_${lg.id || lg.timestamp}_${lg.new_stage}`;
          if (!seenIds.has(idKey)) {
            seenIds.add(idKey);
            combinedRaw.push({
              id: idKey,
              created_at: lg.timestamp,
              new_status: lg.new_stage,
              changed_by: lg.user_name || 'System'
            });
          }
        }
      }
    });

    // 1. Clean and deduplicate raw records
    const cleanDbList: StatusHistoryItem[] = [];
    for (const r of combinedRaw) {
      const statusText = (r.new_status || r.status || '').trim();
      if (!statusText || statusText.toUpperCase() === 'NOTE') continue;

      cleanDbList.push({
        id: r.id ? String(r.id) : `hist_${cleanDbList.length}`,
        created_at: r.created_at || r.timestamp || new Date().toISOString(),
        new_status: statusText,
        changed_by: cleanStaffName(r.changed_by || r.staff_name || r.created_by),
        timestamp: r.created_at || r.timestamp || new Date().toISOString()
      });
    }

    // 2. Guarantee STARTING STATUS (Lead creation / initial inquiry)
    const initialLeadDate = matchedLead?.created_at || matchedLead?.created_date || matchedOrder?.created_at;
    const initialSalesPerson = cleanStaffName(
      matchedLead?.sales_person || 
      matchedLead?.sales_staff_name || 
      matchedLead?.created_by || 
      matchedOrder?.sales_person || 
      'Sales Team'
    );
    
    // Determine the true starting status
    let initialStatus = 'New Lead';
    if (matchedLead) {
      const rawLeadStatus = matchedLead.status || matchedLead.current_status || '';
      if (['Create Quote', 'Created Quotation', 'Contacted'].includes(rawLeadStatus)) {
        initialStatus = 'Create Quote';
      } else if (rawLeadStatus === 'Quote Sent') {
        initialStatus = 'Quote Sent';
      } else if (rawLeadStatus === 'Quote Follow-up') {
        initialStatus = 'Quote Follow-up';
      } else if (rawLeadStatus === 'Lead Lost' || rawLeadStatus === 'Lost Lead') {
        initialStatus = 'New Lead';
      } else {
        initialStatus = 'New Lead';
      }
    }

    // Check if starting status is present in cleanDbList
    const hasInitialStatus = cleanDbList.some(item => {
      const st = item.new_status.toLowerCase();
      return st === initialStatus.toLowerCase() || st === 'new lead' || st === 'create quote' || st === 'new';
    });

    if (!hasInitialStatus && initialLeadDate) {
      cleanDbList.push({
        id: `initial_lead_${primaryLeadId || primaryOrderId}`,
        created_at: initialLeadDate,
        new_status: initialStatus,
        changed_by: initialSalesPerson,
        timestamp: initialLeadDate
      });
    }

    // 3. Guarantee ORDER CONFIRMED milestone if order was confirmed
    if (matchedOrder && matchedOrder.order_id) {
      const hasOrderConfirmed = cleanDbList.some(item => {
        const st = item.new_status.toLowerCase();
        return st.includes('confirm') || st === 'order confirmed';
      });

      if (!hasOrderConfirmed) {
        const orderDate = matchedOrder.created_at || matchedOrder.order_date || initialLeadDate || new Date().toISOString();
        cleanDbList.push({
          id: `ord_confirm_${primaryOrderId}`,
          created_at: orderDate,
          new_status: 'Order Confirmed',
          changed_by: cleanStaffName(matchedOrder.sales_person || initialSalesPerson),
          timestamp: orderDate
        });
      }
    }

    // 4. Guarantee OPERATIONS milestones if reached
    if (matchedOp || (matchedOrder && matchedOrder.assigned_crew && matchedOrder.assigned_crew !== 'Unassigned')) {
      const hasAssignedCrew = cleanDbList.some(item => {
        const st = item.new_status.toLowerCase();
        return st.includes('assigned crew') || st.includes('event scheduled') || st.includes('operation assigned');
      });

      if (!hasAssignedCrew) {
        const opTime = matchedOp?.created_at || matchedOrder?.created_at || new Date().toISOString();
        cleanDbList.push({
          id: `ops_assign_${primaryOrderId}`,
          created_at: opTime,
          new_status: 'Assigned Crew',
          changed_by: cleanStaffName(matchedOp?.photographer_assigned || 'Operations Team'),
          timestamp: opTime
        });
      }

      // Event Ended milestone
      const opStatus = (matchedOp?.event_status || matchedOrder?.current_stage || '').toLowerCase();
      const hasEventEnded = cleanDbList.some(item => item.new_status.toLowerCase().includes('event end'));
      if (!hasEventEnded && (opStatus.includes('event end') || opStatus.includes('completed') || order?.event_end_status)) {
        const eventDate = matchedOrder?.event_date || matchedOp?.event_date || new Date().toISOString();
        cleanDbList.push({
          id: `ops_event_end_${primaryOrderId}`,
          created_at: eventDate,
          new_status: 'Event Ended',
          changed_by: cleanStaffName(matchedOp?.photographer_assigned || 'Operations Team'),
          timestamp: eventDate
        });
      }

      // Verified Footage milestone
      const hasVerifiedFootage = cleanDbList.some(item => item.new_status.toLowerCase().includes('verified footage'));
      if (!hasVerifiedFootage && (opStatus.includes('footage') || matchedProd || opStatus.includes('production') || opStatus.includes('closed'))) {
        const footageTime = matchedOrder?.updated_at || matchedProd?.created_at || new Date().toISOString();
        cleanDbList.push({
          id: `ops_verified_footage_${primaryOrderId}`,
          created_at: footageTime,
          new_status: 'Verified Footage',
          changed_by: 'Operations Team',
          timestamp: footageTime
        });
      }
    }

    // 5. Guarantee PRODUCTION milestones if reached
    if (matchedProd) {
      const prodEditingStatus = (matchedProd.editing_status || matchedProd.production_status || '').trim();

      // Assigned Editor milestone
      if (matchedProd.editor_assigned && matchedProd.editor_assigned !== 'Unassigned') {
        const hasEditorAssigned = cleanDbList.some(item => item.new_status.toLowerCase().includes('editor'));
        if (!hasEditorAssigned) {
          const editorTime = matchedProd.created_at || new Date().toISOString();
          cleanDbList.push({
            id: `prod_editor_${primaryOrderId}`,
            created_at: editorTime,
            new_status: 'Assigned Editor',
            changed_by: cleanStaffName(matchedProd.editor_assigned),
            timestamp: editorTime
          });
        }
      }

      // Editing Started / In Progress milestone
      const hasEditingStarted = cleanDbList.some(item => item.new_status.toLowerCase().includes('editing'));
      if (!hasEditingStarted && prodEditingStatus) {
        const editTime = matchedProd.created_at || matchedProd.updated_at || new Date().toISOString();
        cleanDbList.push({
          id: `prod_editing_start_${primaryOrderId}`,
          created_at: editTime,
          new_status: prodEditingStatus.includes('Started') ? 'Editing Started' : 'Editing In Progress',
          changed_by: cleanStaffName(matchedProd.editor_assigned || 'Production Staff'),
          timestamp: editTime
        });
      }

      // Client Acceptance / Accepted milestone
      const hasClientAcceptance = cleanDbList.some(item => item.new_status.toLowerCase().includes('acceptance') || item.new_status.toLowerCase().includes('accepted'));
      if (!hasClientAcceptance && (prodEditingStatus.toLowerCase().includes('acceptance') || prodEditingStatus.toLowerCase().includes('accepted') || (matchedProd as any).client_acceptance)) {
        const acceptTime = matchedProd.updated_at || new Date().toISOString();
        cleanDbList.push({
          id: `prod_acceptance_${primaryOrderId}`,
          created_at: acceptTime,
          new_status: 'Client Accepted',
          changed_by: 'Production Team',
          timestamp: acceptTime
        });
      }
    }

    // 6. Guarantee ORDER CLOSED milestone if order is closed
    const isOrderClosed = 
      (matchedOrder?.current_stage || '').toLowerCase().includes('closed') ||
      (matchedOrder?.order_status || '').toLowerCase().includes('closed') ||
      (matchedProd?.editing_status || '').toLowerCase().includes('closed') ||
      order?.isClosed === true;

    if (isOrderClosed) {
      const hasClosed = cleanDbList.some(item => item.new_status.toLowerCase().includes('closed'));
      if (!hasClosed) {
        const closedTime = matchedOrder?.updated_at || matchedProd?.updated_at || new Date().toISOString();
        cleanDbList.push({
          id: `order_closed_${primaryOrderId}`,
          created_at: closedTime,
          new_status: 'Order Closed',
          changed_by: 'Business Owner',
          timestamp: closedTime
        });
      }
    }

    // 7. Guarantee CURRENT/LATEST STATUS is represented
    const currentActiveStatus = 
      order?.prod_status || 
      order?.event_end_status || 
      order?.ops_status || 
      order?.sales_status || 
      order?.current_status || 
      matchedProd?.editing_status || 
      matchedProd?.production_status || 
      matchedOrder?.current_stage || 
      matchedOrder?.order_status || 
      matchedLead?.current_status || 
      matchedLead?.status;

    if (currentActiveStatus && typeof currentActiveStatus === 'string' && currentActiveStatus.trim()) {
      const normalizedCurrent = currentActiveStatus.trim();
      const hasCurrent = cleanDbList.some(item => item.new_status.toLowerCase() === normalizedCurrent.toLowerCase());
      if (!hasCurrent) {
        const latestTime = matchedOrder?.updated_at || matchedLead?.updated_at || matchedProd?.updated_at || new Date().toISOString();
        cleanDbList.push({
          id: `current_stage_${primaryOrderId || primaryLeadId}`,
          created_at: latestTime,
          new_status: normalizedCurrent,
          changed_by: cleanStaffName(matchedOrder?.sales_person || matchedLead?.sales_person || 'System'),
          timestamp: latestTime
        });
      }
    }

    // 8. Primary Sort: Chronological by timestamp, with workflow rank tie-breaker
    cleanDbList.sort((a, b) => {
      const timeA = new Date(a.created_at || a.timestamp || 0).getTime() || 0;
      const timeB = new Date(b.created_at || b.timestamp || 0).getTime() || 0;
      const diffMs = timeA - timeB;

      // If timestamps are within 5 seconds of each other, use PhotoCrew lifecycle workflow rank
      if (Math.abs(diffMs) <= 5000) {
        const rankA = getStageWorkflowRank(a.new_status);
        const rankB = getStageWorkflowRank(b.new_status);
        if (rankA !== rankB) {
          return rankA - rankB;
        }
      }

      return diffMs;
    });

    // 9. Deduplicate consecutive duplicate statuses
    const deduplicatedList: StatusHistoryItem[] = [];
    for (const item of cleanDbList) {
      const prev = deduplicatedList[deduplicatedList.length - 1];
      if (prev && prev.new_status.toLowerCase().trim() === item.new_status.toLowerCase().trim()) {
        continue;
      }
      deduplicatedList.push(item);
    }

    // 10. Apply user sort order ('asc' oldest first, 'desc' newest first)
    if (sortOrder === 'desc') {
      deduplicatedList.reverse();
    }

    return deduplicatedList;
  }, [
    isOpen,
    order,
    dbHistory,
    statusHistory,
    logs,
    matchedOrder,
    matchedLead,
    matchedProd,
    matchedOp,
    primaryOrderId,
    primaryLeadId,
    primaryProdId,
    allMatchingIds,
    sortOrder
  ]);

  // Combined and deduplicated proof sources (DB + in-memory)
  const allStaffAssignments = useMemo(() => {
    const map = new Map<string, any>();
    (inMemStaffAssignments || []).forEach(sa => {
      const saOrd = sanitizeId(sa.order_id);
      const saLd = sanitizeId(sa.lead_id);
      if (allMatchingIds.some(id => id.toLowerCase() === saOrd.toLowerCase() || (saLd && id.toLowerCase() === saLd.toLowerCase()))) {
        map.set(sa.assignment_id || `${sa.order_id}_${sa.staff_name}_${sa.staff_role}`, sa);
      }
    });
    dbStaffAssignments.forEach(sa => {
      const key = sa.assignment_id || `${sa.order_id}_${sa.staff_name}_${sa.staff_role}`;
      map.set(key, { ...map.get(key), ...sa });
    });
    return Array.from(map.values());
  }, [inMemStaffAssignments, dbStaffAssignments, allMatchingIds]);

  const allEditorAssignments = useMemo(() => {
    const map = new Map<string, any>();
    (inMemEditorAssignments || []).forEach(ea => {
      const eaOrd = sanitizeId(ea.order_id);
      if (allMatchingIds.some(id => id.toLowerCase() === eaOrd.toLowerCase())) {
        map.set(ea.assignment_id || `${ea.order_id}_${ea.staff_name}_${ea.deliverable_id}`, ea);
      }
    });
    dbEditorAssignments.forEach(ea => {
      const key = ea.assignment_id || `${ea.order_id}_${ea.staff_name}_${ea.deliverable_id}`;
      map.set(key, { ...map.get(key), ...ea });
    });
    return Array.from(map.values());
  }, [inMemEditorAssignments, dbEditorAssignments, allMatchingIds]);

  const activeProductionRecord = useMemo(() => {
    return dbProductionRecords[0] || matchedProd || null;
  }, [dbProductionRecords, matchedProd]);

  const activeClientAcceptanceVerif = useMemo(() => {
    return dbClientAcceptanceVerifs[0] || null;
  }, [dbClientAcceptanceVerifs]);

  /**
   * Stage-Wise Proof Matcher:
   * Categorizes and extracts uploaded images/documents or checklist data for each row.
   */
  const getStageProofData = (statusText: string, timestamp?: string) => {
    const s = (statusText || '').trim().toLowerCase();

    // 1. EVENT START
    if (s.includes('event start') || s.includes('event started') || s.includes('started event')) {
      const images: ProofImageItem[] = [];
      const seenUrls = new Set<string>();

      allStaffAssignments.forEach((sa, idx) => {
        const rawPhoto = sa.event_start_photo;
        const resolved = resolveStorageUrl(rawPhoto);
        if (resolved && !seenUrls.has(resolved)) {
          seenUrls.add(resolved);
          images.push({
            id: `es_photo_${sa.assignment_id || idx}`,
            url: resolved,
            caption: 'Event Start Proof',
            staffName: cleanStaffName(sa.staff_name),
            staffRole: sa.staff_role || 'Photographer',
            eventName: sa.event_name || 'Event Session',
            timestamp: sa.event_start_time || sa.assignment_date || sa.created_at || timestamp,
            stageName: 'Event Start'
          });
        }
      });

      // Also check equipment history for event start photos
      dbEquipmentHistory.forEach((eq, idx) => {
        const eqStatus = (eq.equipment_status || '').toLowerCase();
        if (eqStatus.includes('start') && eq.photo_url) {
          const resolved = resolveStorageUrl(eq.photo_url);
          if (resolved && !seenUrls.has(resolved)) {
            seenUrls.add(resolved);
            images.push({
              id: `eq_start_${eq.id || idx}`,
              url: resolved,
              caption: `Gear Verification (${eq.equipment_name || 'Equipment'})`,
              staffName: cleanStaffName(eq.returned_by || 'Operations Staff'),
              staffRole: 'Equipment Staff',
              eventName: eq.remarks || 'Event Start Inspection',
              timestamp: eq.created_at || timestamp,
              stageName: 'Event Start'
            });
          }
        }
      });

      return {
        type: 'proof' as const,
        stageName: 'Event Start',
        images
      };
    }

    // 2. EVENT END
    if (s.includes('event end') || s.includes('event ended') || s.includes('event complete') || s.includes('event completed')) {
      const images: ProofImageItem[] = [];
      const seenUrls = new Set<string>();

      allStaffAssignments.forEach((sa, idx) => {
        const rawPhoto = sa.event_end_photo;
        const resolved = resolveStorageUrl(rawPhoto);
        if (resolved && !seenUrls.has(resolved)) {
          seenUrls.add(resolved);
          images.push({
            id: `ee_photo_${sa.assignment_id || idx}`,
            url: resolved,
            caption: 'Event End Proof',
            staffName: cleanStaffName(sa.staff_name),
            staffRole: sa.staff_role || 'Photographer',
            eventName: sa.event_name || 'Event Wrap-up',
            timestamp: sa.event_end_time || sa.updated_at || sa.created_at || timestamp,
            stageName: 'Event End'
          });
        }
      });

      // Also check equipment history for event complete photos
      dbEquipmentHistory.forEach((eq, idx) => {
        const eqStatus = (eq.equipment_status || '').toLowerCase();
        if ((eqStatus.includes('end') || eqStatus.includes('complete')) && eq.photo_url) {
          const resolved = resolveStorageUrl(eq.photo_url);
          if (resolved && !seenUrls.has(resolved)) {
            seenUrls.add(resolved);
            images.push({
              id: `eq_end_${eq.id || idx}`,
              url: resolved,
              caption: `Gear Return Verification (${eq.equipment_name || 'Equipment'})`,
              staffName: cleanStaffName(eq.returned_by || 'Operations Staff'),
              staffRole: 'Equipment Staff',
              eventName: eq.remarks || 'Event End Gear Verification',
              timestamp: eq.created_at || timestamp,
              stageName: 'Event End'
            });
          }
        }
      });

      return {
        type: 'proof' as const,
        stageName: 'Event End',
        images
      };
    }

    // 3. FOOTAGE HANDOVER
    if (s.includes('footage handover') || s.includes('raw footage') || s.includes('equipment handover') || s.includes('verified footage') || s.includes('handover')) {
      const images: ProofImageItem[] = [];
      const seenUrls = new Set<string>();

      allStaffAssignments.forEach((sa, idx) => {
        const rawHandover = sa.equipment_handover_photo;
        const resolvedHandover = resolveStorageUrl(rawHandover);
        if (resolvedHandover && !seenUrls.has(resolvedHandover)) {
          seenUrls.add(resolvedHandover);
          images.push({
            id: `eh_photo_${sa.assignment_id || idx}`,
            url: resolvedHandover,
            caption: 'Footage & Equipment Handover Proof',
            staffName: cleanStaffName(sa.equipment_handover_to || sa.staff_name),
            staffRole: sa.staff_role || 'Operations Staff',
            eventName: sa.event_name || 'Footage Ingestion',
            timestamp: sa.updated_at || sa.created_at || timestamp,
            stageName: 'Footage Handover'
          });
        }

        const rawReceived = sa.equipment_received_photo;
        const resolvedReceived = resolveStorageUrl(rawReceived);
        if (resolvedReceived && !seenUrls.has(resolvedReceived)) {
          seenUrls.add(resolvedReceived);
          images.push({
            id: `er_photo_${sa.assignment_id || idx}`,
            url: resolvedReceived,
            caption: 'Equipment & Asset Receipt Proof',
            staffName: cleanStaffName(sa.staff_name),
            staffRole: sa.staff_role || 'Operations Staff',
            eventName: sa.event_name || 'Asset Verification',
            timestamp: sa.updated_at || sa.created_at || timestamp,
            stageName: 'Footage Handover'
          });
        }
      });

      // Equipment handover/return photos in lead_equipment_history
      dbEquipmentHistory.forEach((eq, idx) => {
        const eqStatus = (eq.equipment_status || '').toLowerCase();
        if ((eqStatus.includes('handover') || eqStatus.includes('return')) && eq.photo_url) {
          const resolved = resolveStorageUrl(eq.photo_url);
          if (resolved && !seenUrls.has(resolved)) {
            seenUrls.add(resolved);
            images.push({
              id: `eq_handover_${eq.id || idx}`,
              url: resolved,
              caption: `Handover Return Proof (${eq.equipment_name || 'Equipment'})`,
              staffName: cleanStaffName(eq.returned_by || 'Operations Staff'),
              staffRole: 'Equipment Staff',
              eventName: eq.remarks || 'Handover Verification',
              timestamp: eq.returned_at || eq.created_at || timestamp,
              stageName: 'Footage Handover'
            });
          }
        }
      });

      return {
        type: 'proof' as const,
        stageName: 'Footage Handover',
        images
      };
    }

    // 4. CLIENT ACCEPTANCE CHECKLIST
    if (s.includes('client acceptance') || s.includes('client accepted') || s.includes('client approval') || s.includes('customer acceptance') || s.includes('customer approval') || s.includes('client communication')) {
      const prod = activeProductionRecord;
      const cav = activeClientAcceptanceVerif;

      // Persisted 5 checklist flags
      const isCustAccepted = prod?.checklist_customer_acceptance ?? (s.includes('accepted') || s.includes('approval') || true);
      const isContentUsage = prod?.checklist_content_usage ?? Boolean(prod?.checklist_customer_acceptance);
      const isFootageDeleted = prod?.checklist_footage_deleted_7_days ?? Boolean(prod?.checklist_customer_acceptance);
      const isPaymentCleared = prod?.checklist_payment_from_sales ?? Boolean(prod?.checklist_customer_acceptance);
      const isEditedUploaded = prod?.checklist_edited_files_uploaded ?? Boolean(prod?.final_consolidated_drive_link || cav?.final_edited_footage_link || prod?.server_upload_confirmed);

      const deliveryMethod = 
        prod?.delivery_method || 
        prod?.validated_server_uploads?.delivery_method || 
        (cav?.upload_link_path ? 'server_link' : cav?.folder_name ? 'physical_drive' : 'server_link');

      const serverLink = 
        prod?.server_link || 
        prod?.final_consolidated_drive_link || 
        prod?.final_edited_footage_link || 
        prod?.delivery_link || 
        cav?.final_edited_footage_link || 
        cav?.upload_link_path || 
        '';

      const physicalDriveDetails = 
        prod?.physical_drive_details || 
        prod?.folder_name || 
        cav?.folder_name || 
        '';

      const consentProof = 
        cav?.client_communication_consent_proof || 
        prod?.client_communication_consent_proof || 
        prod?.customer_communication_proof || 
        prod?.customer_review_image || 
        prod?.confirmation_proof || 
        null;

      const checklistItems: ClientAcceptanceChecklistItem[] = [
        {
          key: 'customer_acceptance',
          title: 'Client Approval & WhatsApp Exit',
          description: "Client approval and WhatsApp exit verification.",
          isCompleted: Boolean(prod?.checklist_customer_acceptance ?? true)
        },
        {
          key: 'content_usage',
          title: 'Content Usage Confirmation',
          description: "Confirming that the agreed content usage rights include social media and advertising/paid ads.",
          isCompleted: Boolean(prod?.checklist_content_usage ?? false)
        },
        {
          key: 'footage_deleted_7_days',
          title: 'Footage Deleted in 7 Days',
          description: "Confirmation that raw footage is scheduled or processed for deletion within 7 days.",
          isCompleted: Boolean(prod?.checklist_footage_deleted_7_days ?? false)
        },
        {
          key: 'payment_clearance',
          title: 'Verify Payment from Sales',
          description: "Sales team verified 100% full payment settlement for this order.",
          isCompleted: Boolean(prod?.checklist_payment_from_sales ?? false)
        },
        {
          key: 'edited_files_uploaded',
          title: 'Validate Edited Files Uploaded to Server',
          description: "All high-resolution photos and video deliverables validated and uploaded to server.",
          isCompleted: Boolean(prod?.checklist_edited_files_uploaded ?? prod?.server_upload_validated ?? false)
        }
      ];

      const checklistData: ClientAcceptanceChecklistData = {
        orderId: primaryOrderId || primaryLeadId || 'ORDER',
        customerName: customerName || 'Valued Client',
        checklistItems,
        deliveryMethod,
        serverLink: resolveStorageUrl(serverLink) || serverLink,
        physicalDriveDetails,
        consentProofUrl: resolveStorageUrl(consentProof),
        consentProofFileName: cav?.proof_file_name || prod?.proof_file_name || 'Customer_Approval_Consent.jpg',
        isVerified: cav?.consent_proof_verified ?? true,
        verifiedAt: cav?.updated_at || prod?.updated_at || timestamp,
        verifiedBy: 'Production Team'
      };

      return {
        type: 'checklist' as const,
        stageName: 'Client Acceptance',
        checklistData
      };
    }

    // 5. PRODUCTION (Assigned Editor, Editing Started, In Progress, Customer Review, Revision, Completed, Final Approval, Order Closed)
    const isProductionStage = 
      s.includes('editor') || 
      s.includes('editing') || 
      s.includes('production') || 
      s.includes('customer review') || 
      s.includes('client review') || 
      s.includes('revision') || 
      s.includes('internal qc') || 
      s.includes('proof') || 
      s.includes('ready for delivery') || 
      s.includes('final approval') || 
      s.includes('business owner review') || 
      s.includes('order closed') || 
      s.includes('project closed') || 
      s.includes('closed');

    if (isProductionStage) {
      const images: ProofImageItem[] = [];
      const seenUrls = new Set<string>();

      // Check all editor assignments
      allEditorAssignments.forEach((ea, idx) => {
        const candidates = [
          { url: ea.customer_review_image, caption: 'Customer Approved Image Proof' },
          { url: ea.confirmation_proof, caption: 'Confirmation Proof' },
          { url: ea.customer_communication_proof, caption: 'Client Communication Proof' },
          { url: ea.proof_url, caption: 'Editor Deliverable Proof' },
          { url: ea.proof_image, caption: 'Deliverable Preview' },
          { url: ea.uploaded_proof, caption: 'Uploaded Proof Document' },
          { url: ea.client_confirmation_img, caption: 'Client Approval Screen' }
        ];

        candidates.forEach(cand => {
          const resolved = resolveStorageUrl(cand.url);
          if (resolved && !seenUrls.has(resolved)) {
            seenUrls.add(resolved);
            images.push({
              id: `ea_proof_${ea.assignment_id || idx}_${images.length}`,
              url: resolved,
              caption: cand.caption,
              staffName: cleanStaffName(ea.staff_name),
              staffRole: ea.speciality || 'Editor',
              eventName: ea.deliverable_id || 'Production Deliverable',
              timestamp: ea.updated_at || ea.customer_confirmation_time || ea.created_at || timestamp,
              stageName: 'Production'
            });
          }
        });
      });

      // Check production record
      const prod = activeProductionRecord;
      if (prod) {
        const prodCandidates = [
          { url: prod.customer_review_image, caption: 'Customer Approved Image Proof' },
          { url: prod.confirmation_proof, caption: 'Client Approval Confirmation' },
          { url: prod.customer_communication_proof, caption: 'Customer Communication Proof' },
          { url: prod.client_communication_consent_proof, caption: 'Client Acceptance Consent Proof' },
          { url: prod.proof_url, caption: 'Production Master Proof' }
        ];

        prodCandidates.forEach(cand => {
          const resolved = resolveStorageUrl(cand.url);
          if (resolved && !seenUrls.has(resolved)) {
            seenUrls.add(resolved);
            images.push({
              id: `prod_proof_${images.length}`,
              url: resolved,
              caption: cand.caption,
              staffName: cleanStaffName(prod.editor_assigned || 'Production Staff'),
              staffRole: 'Production Team',
              eventName: prod.deliverable_id || 'Production Deliverable',
              timestamp: prod.updated_at || prod.created_at || timestamp,
              stageName: 'Production'
            });
          }
        });
      }

      return {
        type: 'proof' as const,
        stageName: 'Production',
        images
      };
    }

    // Default for early stages or non-proof stages
    return {
      type: 'none' as const,
      stageName: statusText,
      images: []
    };
  };

  // Real-time search filter across Date, Stage/Status, and Staff Name
  const filteredStatusHistory = useMemo(() => {
    return fullStatusHistory.filter(item => {
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const dt = parseDateTime(item.created_at || item.timestamp);
      const dateStr = `${dt.date} ${dt.time}`.toLowerCase();
      const statusStr = String(item.new_status || '').toLowerCase();
      const staffStr = String(item.changed_by || '').toLowerCase();
      return dateStr.includes(q) || statusStr.includes(q) || staffStr.includes(q);
    });
  }, [fullStatusHistory, searchTerm]);

  if (!isOpen || !order) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[2000000] flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        id="business_owner_order_history_modal"
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl sm:max-w-4xl shadow-2xl relative flex flex-col max-h-[88vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* MODAL HEADER */}
        <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-amber-500 shrink-0" />
              <h3 className="text-sm sm:text-base font-bold text-white font-sans truncate">
                History Log
              </h3>
              {isLoading && (
                <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400 font-mono flex-wrap">
              {primaryOrderId && (
                <span className="text-amber-400 font-semibold">Order: {primaryOrderId}</span>
              )}
              {primaryLeadId && (
                <>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <span className="text-zinc-400">Lead: {primaryLeadId}</span>
                </>
              )}
              {customerName && (
                <>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <span className="text-zinc-300 truncate max-w-[200px]">{customerName}</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer border-0 shrink-0"
            title="Close"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* TOOLBAR: SEARCH & CHRONOLOGICAL SORT */}
        <div className="px-4 py-2.5 sm:px-6 bg-zinc-900/40 border-b border-zinc-850 flex items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 max-w-xs sm:max-w-sm">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search date, status, staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-mono placeholder-zinc-600"
            />
          </div>

          <button
            type="button"
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            title="Toggle sort order"
          >
            <ArrowDownUp className="w-3 h-3 text-amber-400" />
            <span>{sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}</span>
          </button>
        </div>

        {/* TABLE CONTAINER */}
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          {isLoading && filteredStatusHistory.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 text-xs font-mono flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
              <span>Fetching complete status history and proofs...</span>
            </div>
          ) : filteredStatusHistory.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 text-xs font-mono">
              No history records found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead className="bg-zinc-900/90 sticky top-0 z-10 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 sm:px-4 font-bold whitespace-nowrap text-left w-[24%]">Date</th>
                    <th className="py-2.5 px-3 sm:px-4 font-bold whitespace-nowrap text-left w-[28%]">Stage/Status</th>
                    <th className="py-2.5 px-3 sm:px-4 font-bold whitespace-nowrap text-left w-[24%]">Staff Name</th>
                    <th className="py-2.5 px-3 sm:px-4 font-bold whitespace-nowrap text-left w-[24%]">Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850">
                  {filteredStatusHistory.map((item, idx) => {
                    const dt = parseDateTime(item.created_at || item.timestamp);
                    const proofData = getStageProofData(item.new_status, item.created_at || item.timestamp);

                    return (
                      <tr key={item.id || idx} className="hover:bg-zinc-900/40 transition-colors">
                        {/* 1. Date */}
                        <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap text-zinc-300">
                          <span className="font-semibold text-zinc-200">{dt.date}</span>
                          {dt.time && dt.time !== 'N/A' && (
                            <span className="text-zinc-500 text-[11px] ml-2 font-mono">{dt.time}</span>
                          )}
                        </td>

                        {/* 2. Stage/Status */}
                        <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap text-amber-400 font-medium">
                          {item.new_status || '—'}
                        </td>

                        {/* 3. Staff Name */}
                        <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap text-zinc-300">
                          {item.changed_by || 'System'}
                        </td>

                        {/* 4. Proof Column */}
                        <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                          {proofData.type === 'checklist' ? (
                            <button
                              type="button"
                              onClick={() => setSelectedChecklist(proofData.checklistData)}
                              className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-purple-950/40 text-purple-300 border border-purple-700/50 hover:bg-purple-900/60 hover:text-purple-200 hover:border-purple-600 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                              title="Open and view client acceptance checklist"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                              <span>View Checklist</span>
                            </button>
                          ) : proofData.type === 'proof' && proofData.images.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setSelectedGallery({ stageName: proofData.stageName, images: proofData.images })}
                              className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50 hover:text-amber-300 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                              title={`View ${proofData.images.length} proof image${proofData.images.length > 1 ? 's' : ''}`}
                            >
                              <Eye className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>View Proof</span>
                              {proofData.images.length > 1 && (
                                <span className="px-1.5 py-0.2 bg-amber-500/25 text-amber-300 rounded-full text-[10px] font-mono font-semibold">
                                  {proofData.images.length}
                                </span>
                              )}
                            </button>
                          ) : (
                            <span className="text-zinc-600 font-mono text-[11px] italic">
                              No Proof Uploaded
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

        {/* FOOTER */}
        <div className="px-4 py-3 sm:px-6 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <div className="text-xs text-zinc-500 font-mono">
            Showing <strong className="text-zinc-300">{filteredStatusHistory.length}</strong> {filteredStatusHistory.length === 1 ? 'change' : 'changes'} ({sortOrder === 'asc' ? 'oldest to newest' : 'newest to oldest'})
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-white font-medium text-xs cursor-pointer transition-colors border-0"
          >
            Close
          </button>
        </div>

      </div>

      {/* POPUP 1: STAGE PROOF GALLERY MODAL */}
      {selectedGallery && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[2000050] flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setSelectedGallery(null)}
        >
          <div 
            className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl sm:max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-amber-500 shrink-0" />
                  <h4 className="text-base font-bold text-white font-sans truncate">
                    Stage Proofs — {selectedGallery.stageName}
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    {selectedGallery.images.length} {selectedGallery.images.length === 1 ? 'Photo' : 'Photos'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400 font-mono">
                  {primaryOrderId && <span>Order: <strong className="text-zinc-300">{primaryOrderId}</strong></span>}
                  {customerName && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-300">{customerName}</span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedGallery(null)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer border-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Gallery Grid */}
            <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedGallery.images.map((img, idx) => {
                  const dt = parseDateTime(img.timestamp);
                  return (
                    <div 
                      key={img.id || idx}
                      className="bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden transition-all flex flex-col shadow-lg group"
                    >
                      {/* Image Preview with click to open full size */}
                      <div 
                        onClick={() => setLightboxImageIndex(idx)}
                        className="relative h-48 bg-zinc-950 overflow-hidden cursor-pointer flex items-center justify-center border-b border-zinc-850"
                      >
                        <SafeProofImage
                          url={img.url}
                          alt={img.caption || 'Stage Proof'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          containerClassName="w-full h-full relative"
                          showExternalLink={false}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-medium backdrop-blur-xs">
                          <Maximize2 className="w-4 h-4 text-amber-400" />
                          <span>Click to View Full Size</span>
                        </div>
                      </div>

                      {/* Metadata Details */}
                      <div className="p-3 text-xs space-y-1.5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="font-semibold text-zinc-200 flex items-center justify-between gap-2">
                            <span className="truncate">{img.caption}</span>
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700 shrink-0">
                              {img.stageName}
                            </span>
                          </div>
                          
                          {img.eventName && (
                            <div className="text-zinc-400 text-[11px] truncate mt-0.5">
                              {img.eventName}
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                          <div className="flex items-center gap-1.5 truncate">
                            <User className="w-3 h-3 text-zinc-500 shrink-0" />
                            <span className="text-zinc-300 truncate">{img.staffName}</span>
                            {img.staffRole && (
                              <span className="text-zinc-500 text-[10px]">({img.staffRole})</span>
                            )}
                          </div>

                          {dt.date !== '—' && (
                            <div className="flex items-center gap-1 text-zinc-500 shrink-0">
                              <Calendar className="w-3 h-3" />
                              <span>{dt.date}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedGallery(null)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-white font-medium text-xs cursor-pointer transition-colors border-0"
              >
                Close Gallery
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP 2: FULL-SCREEN LIGHTBOX MODAL */}
      {lightboxImageIndex !== null && selectedGallery && (
        <div 
          className="fixed inset-0 bg-black/95 backdrop-blur-lg z-[2000100] flex flex-col items-center justify-between p-4 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setLightboxImageIndex(null)}
        >
          {/* Lightbox Topbar */}
          <div 
            className="w-full max-w-5xl flex items-center justify-between text-white shrink-0 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <h5 className="font-bold text-sm sm:text-base text-zinc-200 truncate">
                {selectedGallery.images[lightboxImageIndex]?.caption || 'Proof Image'}
              </h5>
              <div className="text-xs font-mono text-zinc-400 flex items-center gap-2 mt-0.5">
                <span>By: <strong className="text-zinc-300">{selectedGallery.images[lightboxImageIndex]?.staffName}</strong></span>
                <span className="text-zinc-600">·</span>
                <span>{lightboxImageIndex + 1} of {selectedGallery.images.length}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {selectedGallery.images[lightboxImageIndex]?.url && (
                <a
                  href={selectedGallery.images[lightboxImageIndex].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-zinc-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Direct Link</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setLightboxImageIndex(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer border-0"
                title="Close Lightbox"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Main Image & Nav */}
          <div 
            className="relative flex-1 w-full flex items-center justify-center p-2 sm:p-4 min-h-0 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Prev Button */}
            {selectedGallery.images.length > 1 && (
              <button
                type="button"
                onClick={() => setLightboxImageIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : selectedGallery.images.length - 1))}
                className="absolute left-2 sm:left-4 z-20 p-2 sm:p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-zinc-750 transition-all cursor-pointer backdrop-blur-xs"
                title="Previous photo"
              >
                <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            )}

            {/* Main Preview */}
            <div className="max-h-full max-w-full flex items-center justify-center rounded-xl overflow-hidden shadow-2xl">
              <img
                src={selectedGallery.images[lightboxImageIndex]?.url}
                alt={selectedGallery.images[lightboxImageIndex]?.caption || 'Full size proof'}
                className="max-h-[75vh] max-w-[85vw] object-contain rounded-xl border border-zinc-800 shadow-2xl"
              />
            </div>

            {/* Next Button */}
            {selectedGallery.images.length > 1 && (
              <button
                type="button"
                onClick={() => setLightboxImageIndex((prev) => (prev !== null && prev < selectedGallery.images.length - 1 ? prev + 1 : 0))}
                className="absolute right-2 sm:right-4 z-20 p-2 sm:p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-zinc-750 transition-all cursor-pointer backdrop-blur-xs"
                title="Next photo"
              >
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            )}
          </div>

          {/* Lightbox Bottom caption bar */}
          <div 
            className="w-full max-w-3xl text-center text-xs font-mono text-zinc-400 shrink-0 py-2 border-t border-zinc-850"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedGallery.images[lightboxImageIndex]?.eventName && (
              <span className="text-zinc-300 font-semibold">{selectedGallery.images[lightboxImageIndex].eventName}</span>
            )}
            {selectedGallery.images[lightboxImageIndex]?.timestamp && (
              <span className="text-zinc-500 ml-2">
                Uploaded: {parseDateTime(selectedGallery.images[lightboxImageIndex].timestamp).date} {parseDateTime(selectedGallery.images[lightboxImageIndex].timestamp).time}
              </span>
            )}
          </div>
        </div>
      )}

      {/* POPUP 3: CLIENT ACCEPTANCE CHECKLIST MODAL */}
      {selectedChecklist && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[2000050] flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setSelectedChecklist(null)}
        >
          <div 
            className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl sm:max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-purple-400 shrink-0" />
                  <h4 className="text-base font-bold text-white font-sans truncate">
                    Client Acceptance Checklist & Delivery Verification
                  </h4>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400 font-mono">
                  <span>Order: <strong className="text-purple-300">{selectedChecklist.orderId}</strong></span>
                  {selectedChecklist.customerName && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-300">{selectedChecklist.customerName}</span>
                    </>
                  )}
                  <span className="text-zinc-600">·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified Acceptance
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedChecklist(null)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer border-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Checklist Body */}
            <div className="p-5 overflow-y-auto flex-1 custom-scrollbar space-y-6">
              
              {/* SECTION 1: 5-ITEM VERIFICATION CHECKLIST */}
              <div>
                <h5 className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-bold mb-3 flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-purple-400" />
                  <span>Mandatory Acceptance Items</span>
                </h5>

                <div className="space-y-2.5">
                  {selectedChecklist.checklistItems.map((item, idx) => (
                    <div 
                      key={item.key || idx}
                      className={`p-3 rounded-xl border transition-colors flex items-start gap-3 ${
                        item.isCompleted 
                          ? 'bg-emerald-950/20 border-emerald-800/40 text-zinc-200' 
                          : 'bg-zinc-900/40 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      {item.isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold font-sans text-zinc-100">
                            {idx + 1}. {item.title}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold shrink-0 ${
                            item.isCompleted 
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                              : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                          }`}>
                            {item.isCompleted ? 'CONFIRMED' : 'PENDING'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed font-sans">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SECTION 2: DELIVERY METHOD & LINKS */}
              <div className="pt-4 border-t border-zinc-850">
                <h5 className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-bold mb-3">
                  Delivery Method & Access
                </h5>

                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-mono">Delivery Method:</span>
                    <span className="font-semibold text-purple-300 font-mono px-2 py-0.5 rounded bg-purple-950/40 border border-purple-800/40">
                      {selectedChecklist.deliveryMethod === 'physical_drive' ? 'Physical Hard Drive / Courier' : 'Server / Cloud Link'}
                    </span>
                  </div>

                  {selectedChecklist.serverLink ? (
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-zinc-400 font-mono">Master Delivery Link:</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-sky-400 font-mono truncate select-all">
                          {selectedChecklist.serverLink}
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedChecklist.serverLink) {
                              navigator.clipboard.writeText(selectedChecklist.serverLink);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2000);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer border border-zinc-700 shrink-0"
                          title="Copy Link"
                        >
                          {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                        </button>

                        <a
                          href={selectedChecklist.serverLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1 transition-colors shrink-0"
                          title="Open Link"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open</span>
                        </a>
                      </div>
                    </div>
                  ) : selectedChecklist.physicalDriveDetails ? (
                    <div className="space-y-1">
                      <div className="text-[11px] text-zinc-400 font-mono">Drive / Tracking Details:</div>
                      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-zinc-300">
                        {selectedChecklist.physicalDriveDetails}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 font-mono italic">
                      No explicit link or tracking specified for this delivery.
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 3: CUSTOMER ACCEPTANCE / CONSENT PROOF IMAGE */}
              <div className="pt-4 border-t border-zinc-850">
                <h5 className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-bold mb-3 flex items-center justify-between">
                  <span>Customer Communication & Consent Proof</span>
                  {selectedChecklist.consentProofUrl && (
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 font-semibold">
                      <Check className="w-3 h-3" /> Proof Document Uploaded
                    </span>
                  )}
                </h5>

                {selectedChecklist.consentProofUrl ? (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 flex flex-col sm:flex-row items-center gap-4">
                    <div 
                      onClick={() => {
                        setSelectedGallery({
                          stageName: 'Client Acceptance Consent',
                          images: [{
                            id: 'ca_consent_proof',
                            url: selectedChecklist.consentProofUrl!,
                            caption: 'Customer Consent & Final Approval Proof',
                            staffName: 'Client Acceptance',
                            stageName: 'Client Acceptance'
                          }]
                        });
                        setLightboxImageIndex(0);
                      }}
                      className="w-full sm:w-44 h-28 bg-zinc-950 rounded-lg overflow-hidden border border-zinc-750 cursor-pointer relative group shrink-0"
                    >
                      <SafeProofImage
                        url={selectedChecklist.consentProofUrl}
                        alt="Customer Consent Proof"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        containerClassName="w-full h-full relative"
                        showExternalLink={false}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1">
                        <Maximize2 className="w-3.5 h-3.5 text-purple-400" />
                        <span>Enlarge</span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                      <div className="font-semibold text-zinc-200">
                        {selectedChecklist.consentProofFileName || 'Customer_Approval_Consent.jpg'}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                        Official customer written communication or digital signature confirming final project delivery acceptance.
                      </p>
                      <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-zinc-500">
                        <span>Status: <strong className="text-emerald-400">Verified</strong></span>
                        {selectedChecklist.verifiedAt && (
                          <span>Date: {parseDateTime(selectedChecklist.verifiedAt).date}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl p-4 text-center text-xs font-mono text-zinc-500">
                    No customer consent document or screenshot attached for this order.
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedChecklist(null)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-white font-medium text-xs cursor-pointer transition-colors border-0"
              >
                Close Checklist
              </button>
            </div>
          </div>
        </div>
      )}

    </div>,
    document.body
  );
};
