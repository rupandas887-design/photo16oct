export function normalizeToYYYYMMDD(dStr?: string): string {
  if (!dStr) return '';
  const s = String(dStr).split('T')[0].trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  const ymdSlashMatch = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdSlashMatch) {
    const year = ymdSlashMatch[1];
    const month = ymdSlashMatch[2].padStart(2, '0');
    const day = ymdSlashMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return s;
}

/**
 * Normalizes payment transactions from database, React context, and local storage caches
 * ensuring approved, waiting for approval, and rejected states are strictly categorized.
 */
export function normalizePaymentHistory(
  contextPaymentHistory: any[] = [],
  dbPaymentHistory: any[] = []
): any[] {
  let localPending: any[] = [];
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pending_payment_approvals');
      if (saved) localPending = JSON.parse(saved) || [];
    }
  } catch (_) {}

  let approvedIds = new Set<string>();
  try {
    if (typeof window !== 'undefined') {
      const approvedSaved = localStorage.getItem('approved_payment_history_ids');
      if (approvedSaved) approvedIds = new Set(JSON.parse(approvedSaved));
    }
  } catch (_) {}

  let rejectedIds = new Set<string>();
  try {
    if (typeof window !== 'undefined') {
      const rejectedSaved = localStorage.getItem('rejected_payment_history_ids');
      if (rejectedSaved) rejectedIds = new Set(JSON.parse(rejectedSaved));
    }
  } catch (_) {}

  const combinedMap = new Map<string, any>();

  // 1. Direct database records
  (dbPaymentHistory || []).forEach(item => {
    const key = String(item.id || item.payment_history_id || '');
    if (key) combinedMap.set(key, item);
  });

  // 2. React Context state records
  (contextPaymentHistory || []).forEach(item => {
    const key = String(item.id || item.payment_history_id || '');
    if (key) combinedMap.set(key, { ...combinedMap.get(key), ...item });
  });

  // 3. LocalStorage pending approvals
  localPending.forEach(item => {
    const key = String(item.id || item.payment_history_id || '');
    if (key && !combinedMap.has(key)) {
      combinedMap.set(key, item);
    }
  });

  return Array.from(combinedMap.values()).map(h => {
    const histId = String(h.id || h.payment_history_id || '');
    const isExplicitlyRejected = h.approval_status === 'Rejected' || 
      rejectedIds.has(histId) ||
      (typeof h.notes === 'string' && (
        h.notes.includes('Rejected') || 
        h.notes.includes('[REJECTED]') || 
        h.notes.endsWith('- Rejected') || 
        h.notes.toLowerCase().includes('rejected by business owner')
      ));

    const isExplicitlyApproved = !isExplicitlyRejected && (
      h.approval_status === 'Approved' ||
      approvedIds.has(histId) ||
      (typeof h.notes === 'string' && (
        h.notes.includes('Approved') || 
        h.notes.includes('[APPROVED]') || 
        h.notes.endsWith('- Approved') || 
        h.notes.toLowerCase().includes('approved by business owner')
      ))
    );

    const isPending = !isExplicitlyRejected && !isExplicitlyApproved && (
      h.approval_status === 'Waiting for Approval' || 
      (typeof h.notes === 'string' && h.notes.includes('Waiting for Approval'))
    );

    return {
      ...h,
      id: histId,
      amount: Number(h.amount) || 0,
      approval_status: isExplicitlyRejected ? 'Rejected' : (isPending ? 'Waiting for Approval' : 'Approved')
    };
  });
}

/**
 * Compiles all pending payment records exactly matching Sales Dashboard Payment Pending logic
 * across all orders and leads with live quotation amounts, approved/pending payments, and remaining balances.
 */
export function calculateAllPendingRecords(
  orders: any[] = [],
  leads: any[] = [],
  payments: any[] = [],
  paymentHistory: any[] = []
): any[] {
  const TODAY_STR = new Date().toISOString().split('T')[0];
  const allPaymentHistory = Array.isArray(paymentHistory) && paymentHistory.length > 0 && paymentHistory[0]?.approval_status
    ? paymentHistory
    : normalizePaymentHistory(paymentHistory);

  const records: any[] = [];
  const seenOrderIds = new Set<string>();

  const processRecord = (order: any, lead?: any) => {
    if (!order && !lead) return null;

    const orderId = order?.order_id || (lead as any)?.order_id || `OR-${lead?.lead_id?.slice(-4)}`;
    if (!orderId || seenOrderIds.has(orderId)) return null;
    seenOrderIds.add(orderId);

    const payment = payments.find(p => p.order_id === orderId);

    // Final package / quotation amount
    const finalPackageAmount = Number(lead?.Final_Quotation_Amount) || 
      Number((lead as any)?.final_quotation_amount) || 
      Number(order?.quotation_amount || order?.final_amount) || 
      Number((lead as any)?.final_amount) || 
      Number(lead?.budget) || 0;

    const advanceReceived = Number(order?.advance_received) || 0;

    // Extract individual payment transactions belonging to this exact order
    const orderHistories = allPaymentHistory.filter((h: any) => {
      if (!h.order_id) return false;
      if (h.order_id === orderId) return true;
      if (order?.lead_id && h.order_id === order.lead_id) return true;
      if (lead?.lead_id && h.order_id === lead.lead_id) return true;
      return false;
    });

    const approvedHistories = orderHistories.filter((h: any) => h.approval_status === 'Approved');
    const pendingApprovalHistories = orderHistories.filter((h: any) => h.approval_status === 'Waiting for Approval');
    const rejectedHistories = orderHistories.filter((h: any) => h.approval_status === 'Rejected');

    let approvedAmount = 0;
    let pendingApprovalAmount = 0;

    if (orderHistories.length > 0) {
      approvedAmount = approvedHistories.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);
      pendingApprovalAmount = pendingApprovalHistories.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);

      const hasAdvanceInHistory = orderHistories.some((h: any) => 
        h.payment_type === 'Advance Payment' || 
        (typeof h.notes === 'string' && h.notes.toLowerCase().includes('advance'))
      );
      if (!hasAdvanceInHistory && advanceReceived > approvedAmount) {
        approvedAmount = advanceReceived;
      }
    } else {
      if (payment?.payment_status === 'Waiting for Approval') {
        pendingApprovalAmount = (Number(payment.advance_received) || 0) + (Number(payment.final_payment_received) || 0) + (Number(payment.additional_received) || 0) || advanceReceived;
      } else {
        approvedAmount = payment 
          ? ((Number(payment.advance_received) || 0) + (Number(payment.final_payment_received) || 0) + (Number(payment.additional_received) || 0)) 
          : advanceReceived;
      }
    }

    const totalPaidAmount = approvedAmount + pendingApprovalAmount;
    const remainingAmount = Math.max(0, finalPackageAmount - totalPaidAmount);
    const rawPaymentStatus = payment ? payment.payment_status : (totalPaidAmount > 0 ? (totalPaidAmount >= finalPackageAmount ? 'Fully Paid' : 'Partially Paid') : 'Pending');

    let paymentStatus: 'Pending' | 'Partial' | 'Fully Paid' = 'Pending';
    if (remainingAmount <= 0 && finalPackageAmount > 0) {
      paymentStatus = 'Fully Paid';
    } else if (rawPaymentStatus === 'Partially Paid' || rawPaymentStatus === 'Partial' || (totalPaidAmount > 0 && remainingAmount > 0)) {
      paymentStatus = 'Partial';
    } else if (rawPaymentStatus === 'Fully Paid') {
      paymentStatus = 'Fully Paid';
    }

    let orderEvents: any[] = [];
    if (lead?.events && Array.isArray(lead.events) && lead.events.length > 0) {
      orderEvents = lead.events.map((e: any, idx: number) => ({
        ...e,
        id: e.id || `${orderId}-ev-${idx}`,
        event_name: e.event_name || e.event_type || `Event ${idx + 1}`,
        event_type: e.event_type || 'Event',
        event_date: normalizeToYYYYMMDD(e.event_date || e.event_start_date || e.reporting_date || order?.event_date || lead?.event_date || ''),
        event_time: e.event_time || e.event_start_time || order?.event_time || lead?.event_time || ''
      }));
    } else if (order?.event_date || lead?.event_date) {
      const d = normalizeToYYYYMMDD(order?.event_date || lead?.event_date || '');
      orderEvents = [{
        id: orderId,
        event_name: order?.custom_event_name || order?.event_type || lead?.event_name || lead?.event_type || 'Event',
        event_type: order?.event_type || lead?.event_type || 'Event',
        event_date: d,
        event_time: order?.event_time || lead?.event_time || ''
      }];
    }

    const primaryEvent = orderEvents[0] || null;
    const primaryEventDate = primaryEvent?.event_date || normalizeToYYYYMMDD(order?.event_date || lead?.event_date || '');
    const isOverdue = primaryEventDate && primaryEventDate < TODAY_STR && remainingAmount > 0;
    const status = order?.current_stage || lead?.current_status || lead?.status || order?.order_status || 'Order Confirmed';

    return {
      orderId,
      leadId: order?.lead_id || lead?.lead_id,
      customerName: order?.customer_name || lead?.customer_name || 'Customer',
      mobileNumber: order?.mobile || lead?.mobile || '',
      eventType: primaryEvent?.event_type || order?.event_type || lead?.event_type || 'Event',
      eventDate: primaryEventDate,
      events: orderEvents,
      finalPackageAmount,
      advanceReceived,
      approvedAmount,
      pendingApprovalAmount,
      totalPaidAmount,
      remainingAmount,
      paymentStatus,
      isOverdue,
      hasPendingApproval: pendingApprovalHistories.length > 0 || payment?.payment_status === 'Waiting for Approval',
      currentProjectStatus: status,
      order,
      lead,
      payment
    };
  };

  (orders || []).forEach(order => {
    if (!order || !order.order_id) return;
    if (order.order_status === 'Cancelled' || (order as any).status === 'Cancelled') return;
    const linkedLead = (leads || []).find(l => l.lead_id === order.lead_id);
    const rec = processRecord(order, linkedLead);
    if (rec) records.push(rec);
  });

  (leads || []).forEach(lead => {
    if (!lead || !lead.lead_id) return;
    const status = lead.current_status || lead.status || '';
    const isConfirmed = status === 'Order Confirmed' || status === 'Confirmed' || ['Operations Assigned', 'Staff Assigned', 'Event Scheduled', 'Event Completed', 'New Order Received', 'Delivered', 'Completed', 'Closed'].includes(status);
    if (!isConfirmed) return;
    if (status === 'Cancelled' || status === 'Lost' || status === 'Lost Lead') return;
    const linkedOrder = (orders || []).find(o => o.lead_id === lead.lead_id);
    if (linkedOrder && seenOrderIds.has(linkedOrder.order_id)) return;
    const rec = processRecord(linkedOrder, lead);
    if (rec) records.push(rec);
  });

  return records;
}

/**
 * Calculates the exact total outstanding balance across all orders/leads matching Sales Payment Pending.
 */
export function calculateTotalOutstandingBalance(
  orders: any[] = [],
  leads: any[] = [],
  payments: any[] = [],
  paymentHistory: any[] = []
): number {
  const pendingRecords = calculateAllPendingRecords(orders, leads, payments, paymentHistory);
  return pendingRecords.reduce((acc, r) => acc + (r.paymentStatus === 'Fully Paid' ? 0 : r.remainingAmount), 0);
}
