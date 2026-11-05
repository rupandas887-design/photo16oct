import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { History, X, Search, ArrowDownUp, Loader2 } from 'lucide-react';
import { supabaseClient } from '../supabaseClient';
import { useRole } from './RoleContext';
import { formatDateDDMMYY, formatTime12Hour } from '../utils';

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

export const OrderHistoryModal: React.FC<OrderHistoryModalProps> = ({
  isOpen,
  onClose,
  order
}) => {
  const { 
    leads = [], 
    orders = [], 
    statusHistory = [] 
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

  // Identify Target Lead / Order IDs
  const targetOrderId = order?.order_id || order?.orderId || order?.rawOrder?.order_id || '';
  const targetLeadId = order?.lead_id || order?.leadId || order?.rawLead?.lead_id || order?.rawOrder?.lead_id || '';

  const matchedOrder = useMemo(() => {
    if (!targetOrderId && !targetLeadId) return order;
    return (orders || []).find(o => 
      (targetOrderId && o.order_id === targetOrderId) || 
      (targetLeadId && o.lead_id === targetLeadId)
    ) || order;
  }, [orders, targetOrderId, targetLeadId, order]);

  const matchedLead = useMemo(() => {
    const leadId = targetLeadId || matchedOrder?.lead_id;
    if (!leadId) return null;
    return (leads || []).find(l => l.lead_id === leadId || l.lead_id === targetOrderId) || null;
  }, [leads, targetLeadId, matchedOrder, targetOrderId]);

  const primaryOrderId = matchedOrder?.order_id || targetOrderId || '';
  const primaryLeadId = matchedLead?.lead_id || targetLeadId || matchedOrder?.lead_id || '';
  const customerName = matchedOrder?.customer_name || matchedLead?.customer_name || order?.customer_name || '';

  // Clean staff name (remove role suffix like "|Sales Team")
  const cleanStaffName = (raw?: string) => {
    if (!raw) return 'System';
    const firstPart = raw.split('|')[0].trim();
    return firstPart || 'System';
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
    if (!isOpen || (!primaryOrderId && !primaryLeadId)) {
      setDbHistory([]);
      return;
    }

    let isMounted = true;
    const fetchHistoryFromDb = async () => {
      setIsLoading(true);
      try {
        const orConditions = [
          primaryOrderId ? `order_id.eq.${primaryOrderId}` : null,
          primaryOrderId ? `lead_id.eq.${primaryOrderId}` : null,
          primaryLeadId ? `lead_id.eq.${primaryLeadId}` : null,
          primaryLeadId ? `order_id.eq.${primaryLeadId}` : null
        ].filter(Boolean).join(',');

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
  }, [isOpen, primaryOrderId, primaryLeadId]);

  // Combine database records with fallback/in-memory records to guarantee full stage progression
  const fullStatusHistory = useMemo<StatusHistoryItem[]>(() => {
    if (!isOpen || !order) return [];

    // Collect all records from DB fetch or in-memory fallback
    const sourceRecords = dbHistory.length > 0 
      ? dbHistory 
      : (statusHistory || []).filter(sh => {
          const shOrder = sh.order_id ? String(sh.order_id).trim().toLowerCase() : '';
          const shLead = sh.lead_id ? String(sh.lead_id).trim().toLowerCase() : '';
          const pOrder = primaryOrderId ? String(primaryOrderId).trim().toLowerCase() : '';
          const pLead = primaryLeadId ? String(primaryLeadId).trim().toLowerCase() : '';
          return (pOrder && (shOrder === pOrder || shLead === pOrder)) ||
                 (pLead && (shLead === pLead || shOrder === pLead));
        });

    // 1. Process and deduplicate sequential rapid dual-writes from source records
    const cleanDbList: StatusHistoryItem[] = [];
    for (const r of sourceRecords) {
      const statusText = r.new_status || r.status || '';
      if (!statusText || statusText.toUpperCase() === 'NOTE') continue;

      const prev = cleanDbList[cleanDbList.length - 1];
      // Skip twin dual-write if exact same status within 10 seconds
      if (prev && prev.new_status.toLowerCase() === statusText.toLowerCase()) {
        const diffMs = Math.abs(new Date(r.created_at || r.timestamp).getTime() - new Date(prev.created_at).getTime());
        if (diffMs < 10000) {
          continue;
        }
      }

      cleanDbList.push({
        id: r.id ? String(r.id) : `hist_${cleanDbList.length}`,
        created_at: r.created_at || r.timestamp || new Date().toISOString(),
        new_status: statusText,
        changed_by: cleanStaffName(r.changed_by || r.staff_name || r.created_by),
        timestamp: r.created_at || r.timestamp || new Date().toISOString()
      });
    }

    // 2. If initial creation is not present in lead_status_history, prepend initial stage
    const earliestTime = cleanDbList.length > 0 ? new Date(cleanDbList[0].created_at).getTime() : Infinity;
    const initialLeadDate = matchedLead?.created_at || matchedLead?.created_date;
    if (initialLeadDate && new Date(initialLeadDate).getTime() < earliestTime - 60000) {
      const initStatus = matchedLead?.status || matchedLead?.current_stage || 'New Lead';
      // Only prepend if not already starting with that status
      if (cleanDbList.length === 0 || cleanDbList[0].new_status.toLowerCase() !== initStatus.toLowerCase()) {
        cleanDbList.unshift({
          id: `initial_lead_${primaryLeadId || primaryOrderId}`,
          created_at: initialLeadDate,
          new_status: initStatus,
          changed_by: cleanStaffName(matchedLead?.sales_person || matchedLead?.sales_staff_name),
          timestamp: initialLeadDate
        });
      }
    }

    // 3. Fallback for legacy records that have zero records in lead_status_history
    if (cleanDbList.length === 0) {
      // Step A: Lead registration
      const initDate = matchedLead?.created_at || matchedOrder?.created_at;
      if (initDate) {
        cleanDbList.push({
          id: `init_${primaryLeadId || primaryOrderId}`,
          created_at: initDate,
          new_status: matchedLead?.status || 'New Lead',
          changed_by: cleanStaffName(matchedLead?.sales_person || matchedOrder?.sales_person),
          timestamp: initDate
        });
      }

      // Step B: Order Confirmed
      if (matchedOrder?.created_at && matchedOrder?.created_at !== initDate) {
        cleanDbList.push({
          id: `ord_${primaryOrderId}`,
          created_at: matchedOrder.created_at,
          new_status: 'Order Confirmed',
          changed_by: cleanStaffName(matchedOrder?.sales_person || matchedLead?.sales_person),
          timestamp: matchedOrder.created_at
        });
      }

      // Step C: Current status if advanced
      const currentStage = matchedOrder?.current_stage || matchedOrder?.order_status || matchedLead?.status;
      if (currentStage && !cleanDbList.some(item => item.new_status.toLowerCase() === currentStage.toLowerCase())) {
        cleanDbList.push({
          id: `curr_${primaryOrderId}`,
          created_at: matchedOrder?.updated_at || new Date().toISOString(),
          new_status: currentStage,
          changed_by: 'System',
          timestamp: matchedOrder?.updated_at || new Date().toISOString()
        });
      }
    }

    // 4. Sort chronologically: Oldest first, newest last (or user selected)
    cleanDbList.sort((a, b) => {
      const timeA = new Date(a.created_at || a.timestamp || 0).getTime() || 0;
      const timeB = new Date(b.created_at || b.timestamp || 0).getTime() || 0;
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

    return cleanDbList;
  }, [
    isOpen,
    order,
    dbHistory,
    statusHistory,
    matchedOrder,
    matchedLead,
    primaryOrderId,
    primaryLeadId,
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
            Showing <strong className="text-zinc-300">{filteredStatusHistory.length}</strong> {filteredStatusHistory.length === 1 ? 'change' : 'changes'} (oldest to newest)
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
