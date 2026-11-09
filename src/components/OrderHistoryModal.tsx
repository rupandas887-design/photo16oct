import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { History, X, Search, ArrowDownUp, Loader2 } from 'lucide-react';
import { supabaseClient } from '../supabaseClient';
import { useRole } from './RoleContext';
import { formatDateDDMMYY, formatTime12Hour, getAllMatchingOrderIds } from '../utils';

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
    logs = []
  } = useRole();

  const [dbHistory, setDbHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // Default oldest first, newest last

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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

  // Directly fetch the COMPLETE history from Supabase lead_status_history whenever modal opens
  useEffect(() => {
    if (!isOpen || allMatchingIds.length === 0) {
      setDbHistory([]);
      return;
    }

    let isMounted = true;
    const fetchHistoryFromDb = async () => {
      setIsLoading(true);
      try {
        const orConditions = allMatchingIds
          .flatMap(id => [`order_id.eq.${id}`, `lead_id.eq.${id}`])
          .join(',');

        if (!orConditions) {
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabaseClient
          .from('lead_status_history')
          .select('*')
          .or(orConditions)
          .order('created_at', { ascending: true });

        if (error) {
          console.warn("[OrderHistoryModal] DB fetch error from lead_status_history:", error.message);
        } else if (isMounted && data) {
          setDbHistory(data);
        }
      } catch (err: any) {
        console.warn("[OrderHistoryModal] Exception fetching lead_status_history:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchHistoryFromDb();

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
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl sm:max-w-3xl shadow-2xl relative flex flex-col max-h-[88vh] overflow-hidden animate-in zoom-in-95 duration-150"
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
        <div className="px-4 py-2.5 sm:px-6 bg-zinc-900/40 border-b border-zinc-855 flex items-center justify-between gap-3 shrink-0">
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
              <span>Fetching complete status history...</span>
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
                    <th className="py-2.5 px-4 font-bold whitespace-nowrap text-left w-1/3">Date</th>
                    <th className="py-2.5 px-4 font-bold whitespace-nowrap text-left w-1/3">Stage/Status</th>
                    <th className="py-2.5 px-4 font-bold whitespace-nowrap text-left w-1/3">Staff Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850">
                  {filteredStatusHistory.map((item, idx) => {
                    const dt = parseDateTime(item.created_at || item.timestamp);
                    return (
                      <tr key={item.id || idx} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-2.5 px-4 whitespace-nowrap text-zinc-300">
                          <span className="font-semibold text-zinc-200">{dt.date}</span>
                          {dt.time && dt.time !== 'N/A' && (
                            <span className="text-zinc-500 text-[11px] ml-2 font-mono">{dt.time}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap text-amber-400 font-medium">
                          {item.new_status || '—'}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap text-zinc-300">
                          {item.changed_by || 'System'}
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
    </div>,
    document.body
  );
};
