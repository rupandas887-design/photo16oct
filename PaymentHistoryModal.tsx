import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { formatINR, formatDateDDMMYY, formatTime12Hour, formatDateTime, triggerAutoScrollAndFocus } from '../utils';
import { Order, Payment, Lead } from '../types';
import { supabaseClient } from '../supabaseClient';
import { useRole } from './RoleContext';
import { getAllMatchingOrderIds } from './SalesUtils';

export interface PaymentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  payments?: Payment[];
  orders?: Order[];
  leads?: Lead[];
}

export const PaymentHistoryModal: React.FC<PaymentHistoryModalProps> = ({
  isOpen,
  onClose,
  order,
  payments = [],
  orders = [],
  leads = []
}) => {
  const { currentRole, approvePayment, rejectPayment, paymentHistory: contextPaymentHistory, refreshData } = useRole();
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);

  const orderId = order?.orderId || order?.order_id || '';
  const leadId = order?.leadId || order?.lead_id || (order?.lead && order.lead.lead_id) || '';
  const matchingOrderIds = getAllMatchingOrderIds(orderId, leadId, orders, leads);
  const primaryOrderId = orderId || orders.find(o => leadId && o.lead_id === leadId)?.order_id || matchingOrderIds.find(id => id.startsWith('OR')) || orderId || '';

  const refreshHistory = async () => {
    if (matchingOrderIds.length === 0) return;
    setIsLoading(true);
    try {
      let dbData: any[] = [];
      if (supabaseClient) {
        const orClauses = matchingOrderIds.map(id => `order_id.eq.${id}`);
        const { data, error } = await supabaseClient
          .from('payment_history')
          .select('*')
          .or(orClauses.join(','))
          .order('payment_date', { ascending: false });
        
        if (!error && data) {
          dbData = data;
        }
      }

      const contextItems = (contextPaymentHistory || []).filter(h => {
        const hid = String(h.order_id || '').trim();
        return matchingOrderIds.includes(hid);
      });

      let localPending: any[] = [];
      try {
        const saved = localStorage.getItem('pending_payment_approvals');
        if (saved) {
          localPending = (JSON.parse(saved) || []).filter((h: any) => {
            const hid = String(h.order_id || '').trim();
            return matchingOrderIds.includes(hid);
          });
        }
      } catch (_) {}

      const combinedMap = new Map<string, any>();
      dbData.forEach(item => {
        const key = String(item.id || item.payment_history_id);
        combinedMap.set(key, item);
      });
      contextItems.forEach(item => {
        const key = String(item.id || item.payment_history_id);
        combinedMap.set(key, { ...combinedMap.get(key), ...item });
      });
      localPending.forEach(item => {
        const key = String(item.id || item.payment_history_id);
        if (!combinedMap.has(key)) {
          combinedMap.set(key, item);
        }
      });

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

      const parsed = Array.from(combinedMap.values()).map(h => {
        const histId = String(h.id || h.payment_history_id || '');
        const isExplicitlyRejected = h.approval_status === 'Rejected' || 
          rejectedIds.has(histId) ||
          (typeof h.notes === 'string' && (
            h.notes.endsWith('- Rejected') || 
            h.notes.toLowerCase().includes('rejected by business owner')
          ));

        const isExplicitlyApproved = !isExplicitlyRejected && (
          (h.approval_status === 'Approved' && h.approval_status !== 'Waiting for Approval') ||
          approvedIds.has(histId) ||
          (typeof h.notes === 'string' && (
            h.notes.endsWith('- Approved') || 
            h.notes.toLowerCase().includes('approved by business owner')
          ) && !h.notes.includes('Waiting for Approval'))
        );

        const isPending = !isExplicitlyRejected && !isExplicitlyApproved && (
          h.approval_status === 'Waiting for Approval' || 
          (typeof h.notes === 'string' && h.notes.includes('Waiting for Approval')) ||
          !h.approval_status
        );

        return {
          ...h,
          approval_status: isExplicitlyRejected ? 'Rejected' : (isPending ? 'Waiting for Approval' : 'Approved')
        };
      });

      if (parsed.length === 0) {
        const paymentObj = (payments || []).find(p => matchingOrderIds.includes(String(p.order_id || '').trim()) || (p.lead_id && matchingOrderIds.includes(String(p.lead_id || '').trim())));
        if (paymentObj && (paymentObj.payment_status === 'Waiting for Approval' || Number(paymentObj.advance_received) > 0 || Number(paymentObj.final_payment_received) > 0)) {
          const fallbackAmt = (Number(paymentObj.advance_received) || 0) + (Number(paymentObj.final_payment_received) || 0) || Number(paymentObj.quotation_amount) || 0;
          if (fallbackAmt > 0) {
            parsed.push({
              id: paymentObj.payment_id || `PAY-${primaryOrderId}`,
              order_id: primaryOrderId,
              amount: fallbackAmt,
              payment_date: paymentObj.payment_date || new Date().toISOString(),
              transaction_id: paymentObj.transaction_id || null,
              payment_mode: 'UPI',
              payment_type: (paymentObj as any).Payment_type || paymentObj.payment_type || 'Advance Payment',
              updated_by: 'Sales',
              notes: paymentObj.payment_status === 'Waiting for Approval' ? 'Payment recorded - Waiting for Approval' : 'Approved payment',
              approval_status: paymentObj.payment_status === 'Waiting for Approval' ? 'Waiting for Approval' : 'Approved'
            });
          }
        }
      }

      parsed.sort((a, b) => new Date(b.payment_date || b.created_at || 0).getTime() - new Date(a.payment_date || a.created_at || 0).getTime());
      setHistoryList(parsed);
    } catch (err) {
      console.error("Error fetching payment history:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      triggerAutoScrollAndFocus('#payment_details_history_modal', 100);
      refreshHistory();
    } else {
      setHistoryList([]);
      setIsApprovingId(null);
    }
  }, [isOpen, primaryOrderId]);

  if (!isOpen || !order) return null;

  const customerName = order.customerName || order.customer_name || 'Customer';

  // Find related objects
  const orderObj = orders.find(o => (orderId && o.order_id === orderId) || (leadId && o.lead_id === leadId));
  const paymentObj = payments.find(p => (orderId && p.order_id === orderId) || (leadId && p.lead_id === leadId) || (orderObj && p.order_id === orderObj.order_id));
  const leadObj = leads.find(l => (leadId && l.lead_id === leadId) || (orderObj && l.lead_id === orderObj.lead_id));

  // Payment amounts
  const finalQuotation = Number(leadObj?.Final_Quotation_Amount) || Number((leadObj as any)?.final_quotation_amount) || Number(orderObj?.quotation_amount) || Number(order.totalRevenue) || Number(order.finalPackageAmount) || Number(leadObj?.final_amount) || Number(leadObj?.budget) || 0;

  const pendingItems = historyList.filter(h => h.approval_status === 'Waiting for Approval');
  const approvedItems = historyList.filter(h => h.approval_status === 'Approved');
  const rejectedItems = historyList.filter(h => h.approval_status === 'Rejected');

  let totalPaid = approvedItems.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
  if (historyList.length === 0 && paymentObj && paymentObj.payment_status !== 'Waiting for Approval') {
    totalPaid = (Number(paymentObj.advance_received) || 0) + (Number(paymentObj.final_payment_received) || 0) + (Number(paymentObj.additional_received) || 0);
  }

  const remaining = Math.max(0, finalQuotation - totalPaid);
  const pendingAmount = pendingItems.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);

  let statusText = 'Pending Payment';
  let statusColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';

  if (pendingItems.length > 0) {
    statusText = 'Waiting for Approval';
    statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  } else if (remaining <= 0 && finalQuotation > 0) {
    statusText = 'Fully Paid';
    statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  } else if (totalPaid > 0) {
    statusText = 'Partially Paid';
    statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  }

  // Events list
  let eventsList: any[] = [];
  if (Array.isArray(order.events) && order.events.length > 0) {
    eventsList = order.events;
  } else if (leadObj && Array.isArray(leadObj.events) && leadObj.events.length > 0) {
    eventsList = leadObj.events;
  } else if (order.eventDate || order.eventName || orderObj?.event_date) {
    eventsList = [{
      event_name: order.eventName || orderObj?.custom_event_name || 'Event Photography',
      event_date: order.eventDate || orderObj?.event_date,
      event_start_time: (orderObj as any)?.event_start_time
    }];
  }

  const handleReject = async (histId: string) => {
    if (!histId) return;
    setIsApprovingId(histId);
    try {
      await rejectPayment(histId, primaryOrderId);
      if (typeof refreshData === 'function') {
        try { await refreshData(); } catch (_) {}
      }
      await refreshHistory();
    } catch (err: any) {
      console.error("Error rejecting payment:", err);
      alert(`Failed to reject payment: ${err.message || 'Please check your connection and try again.'}`);
    } finally {
      setIsApprovingId(null);
    }
  };

  const handleApprove = async (histId: string) => {
    if (!histId) return;
    setIsApprovingId(histId);
    try {
      await approvePayment(histId, primaryOrderId);
      if (typeof refreshData === 'function') {
        try { await refreshData(); } catch (_) {}
      }
      await refreshHistory();
    } catch (err: any) {
      console.error("Error approving payment:", err);
      alert(`Failed to approve payment: ${err.message || 'Please check your connection and try again.'}`);
    } finally {
      setIsApprovingId(null);
    }
  };

  return createPortal(
    <div id="payment_details_history_modal" className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl sm:max-w-3xl lg:max-w-4xl 2xl:max-w-6xl min-[1920px]:max-w-[1400px] min-[2560px]:max-w-[1800px] min-[3840px]:max-w-[2400px] flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800/80 bg-zinc-900/60 rounded-t-2xl shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-bold font-mono tracking-tight text-white flex items-center gap-2">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
              Payment Details & Approval
            </h3>
            <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5 font-mono">
              Order: <span className="font-bold text-amber-400">{primaryOrderId || 'N/A'}</span> • Customer: <span className="text-zinc-200 font-semibold">{customerName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          
          {/* Payment Summary */}
          <div>
            <h4 className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-2.5 font-mono">
              Payment Summary
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800">
                <span className="block text-[9px] text-zinc-400 uppercase font-mono">Total Order Amount</span>
                <span className="text-sm font-black text-white font-mono mt-0.5 block">
                  {formatINR(finalQuotation)}
                </span>
              </div>
              <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800">
                <span className="block text-[9px] text-zinc-400 uppercase font-mono">Already Approved / Received</span>
                <span className="text-sm font-black text-emerald-400 font-mono mt-0.5 block">
                  {formatINR(totalPaid)}
                </span>
              </div>
              <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800">
                <span className="block text-[9px] text-zinc-400 uppercase font-mono">Remaining Pending Amount</span>
                <span className={`text-sm font-black font-mono mt-0.5 block ${remaining <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatINR(remaining)}
                </span>
              </div>
              <div className={`p-3 rounded-xl border flex flex-col justify-center ${statusColor}`}>
                <span className="block text-[9px] uppercase font-mono opacity-80">Payment Status</span>
                <span className="text-xs font-bold mt-0.5 block uppercase tracking-wider">
                  {statusText}
                </span>
              </div>
            </div>
          </div>

          {/* Confirmed event dates section */}
          {eventsList.length > 0 && (
            <div>
              <h4 className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-2.5 font-mono">
                Confirmed Event Dates & Schedule
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {eventsList.map((ev: any, idx: number) => (
                  <div key={ev.id || idx} className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800 space-y-1">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span className="text-indigo-400">🎬</span>
                      {ev.event_name || ev.event_type || `Event ${idx + 1}`}
                    </span>
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-1 border-t border-zinc-800/60">
                      <span>Event Date:</span>
                      <span className="text-zinc-200 font-semibold">
                        {ev.event_date ? formatDateDDMMYY(ev.event_date) : 'N/A'}
                      </span>
                    </div>
                    {ev.event_start_time && (
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                        <span>Event Time:</span>
                        <span className="text-zinc-200">{formatTime12Hour(ev.event_start_time)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment History Table */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">
                Payment History ({historyList.length} records)
              </h4>
              <span className="text-[10px] text-zinc-500 font-mono">
                Verify new payments against previous payments for this order
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-max">
                  <thead>
                    <tr className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 font-mono text-[9px] uppercase tracking-wider">
                      <th className="p-3 pl-4 whitespace-nowrap">Payment Date</th>
                      <th className="p-3 text-right whitespace-nowrap">Payment Amount</th>
                      <th className="p-3 whitespace-nowrap">Payment Type</th>
                      <th className="p-3 whitespace-nowrap">Payment Mode</th>
                      <th className="p-3 whitespace-nowrap">Transaction ID</th>
                      <th className="p-3 whitespace-nowrap">Updated By</th>
                      <th className="p-3 whitespace-nowrap">Notes</th>
                      <th className="p-3 whitespace-nowrap">Status</th>
                      <th className="p-3 pr-4 text-center whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {isLoading ? (
                      <tr>
                        <td colSpan={9} className="text-center py-6 text-zinc-500 text-[10px]">
                          Loading records...
                        </td>
                      </tr>
                    ) : historyList.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-6 text-zinc-500 text-[10px]">
                          No payment history records found.
                        </td>
                      </tr>
                    ) : (
                      historyList.map((h, index) => {
                        let displayDate = h.payment_date || h.date;
                        try {
                          displayDate = formatDateTime(h.payment_date || h.date) || displayDate;
                        } catch (e) {}

                        const displayType = h.payment_type || h.paymentType || (paymentObj ? ((paymentObj as any).Payment_type || paymentObj.payment_type) : '') || 'Payment';
                        const isPending = h.approval_status === 'Waiting for Approval' || (h.notes && h.notes.includes('Waiting for Approval'));
                        const histId = String(h.id || h.payment_history_id || h.transaction_id || '');
                        const isRowApproving = isApprovingId === histId;

                        return (
                          <tr key={histId || index} className={`hover:bg-zinc-800/30 text-zinc-300 ${isPending ? 'bg-amber-500/5' : ''}`}>
                            <td className="p-3 pl-4 text-[10px] text-zinc-400 whitespace-nowrap font-mono">{displayDate}</td>
                            <td className="p-3 text-right font-bold text-emerald-400 whitespace-nowrap font-mono">
                              {formatINR(Number(h.amount) || 0)}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[9px] font-bold text-zinc-200 whitespace-nowrap">
                                {displayType}
                              </span>
                            </td>
                            <td className="p-3 text-[10px] text-zinc-300 whitespace-nowrap">{h.payment_mode || h.paymentMode || 'N/A'}</td>
                            <td className="p-3 text-[10px] text-zinc-400 whitespace-nowrap font-mono">
                              {(!h.transaction_id && !h.transactionId || h.transaction_id?.trim() === '' || h.transaction_id === 'null' || h.transactionId?.trim() === '' || h.transactionId === 'null') ? 'N/A' : (h.transaction_id || h.transactionId)}
                            </td>
                            <td className="p-3 text-[10px] text-zinc-400 whitespace-nowrap">{h.updated_by || h.updatedBy || 'N/A'}</td>
                            <td className="p-3 text-[10px] text-zinc-400 min-w-[120px] max-w-[200px] truncate" title={h.notes}>
                              {h.notes ? h.notes.replace(/ - Waiting for Approval/g, '').replace(/ - Approved/g, '').replace(/ - Rejected/g, '') : '-'}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {isPending ? (
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[9px] font-bold text-amber-400 animate-pulse inline-flex items-center gap-1 w-fit">
                                  <Clock className="w-3 h-3" />
                                  Waiting for Approval
                                </span>
                              ) : h.approval_status === 'Rejected' ? (
                                <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-[9px] font-bold text-rose-400 inline-flex items-center gap-1 w-fit">
                                  <AlertTriangle className="w-3 h-3" />
                                  Rejected
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[9px] font-bold text-emerald-400 inline-flex items-center gap-1 w-fit">
                                  <CheckCircle className="w-3 h-3" />
                                  Approved
                                </span>
                              )}
                            </td>
                            <td className="p-3 pr-4 text-center whitespace-nowrap">
                              {isPending && (currentRole === 'Business Owner' || !currentRole || currentRole === 'Super Admin' || String(currentRole || '').toLowerCase().includes('owner')) ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isRowApproving}
                                    onClick={() => handleApprove(histId)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-bold text-[10px] tracking-wide cursor-pointer transition-all shadow-sm font-mono disabled:opacity-50"
                                    title="Approve this payment"
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                    <span>{isRowApproving ? '...' : 'Approve'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isRowApproving}
                                    onClick={() => handleReject(histId)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-400 active:scale-95 text-white font-bold text-[10px] tracking-wide cursor-pointer transition-all shadow-sm font-mono disabled:opacity-50"
                                    title="Reject this payment"
                                  >
                                    <X className="w-3 h-3" />
                                    <span>{isRowApproving ? '...' : 'Reject'}</span>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-zinc-500 text-xs">—</span>
                              )}
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

        </div>
      </div>
    </div>,
    document.body
  );
};
