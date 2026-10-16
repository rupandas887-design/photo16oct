import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRole } from '../RoleContext';
import { 
  DollarSign, 
  Search, 
  Calendar, 
  Filter, 
  Download, 
  Printer, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  HelpCircle,
  FileText,
  Percent,
  TrendingUp,
  CreditCard,
  X,
  RefreshCw,
  ArrowUpDown
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'motion/react';
import { EVENT_TYPES } from '../../types';
import { formatDateDDMMYY, formatDateToDDMMYYYY, formatTime12Hour, ensureModalScrolledToTop } from '../../utils';
import { compareAlphanumeric } from '../ui/ListSortFilter';
import { PaymentHistoryModal } from '../PaymentHistoryModal';
import { UpdatePaymentModal } from './UpdatePaymentModal';
import { supabaseClient } from '../../supabaseClient';
import { DateFilterInput } from '../ui/DateFilterInput';

export const PendingPaymentsReport: React.FC = () => {
  const { leads, orders, payments, currentUserName, recordPayment, refreshData, paymentHistory: contextPaymentHistory } = useRole();
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbPaymentHistory, setDbPaymentHistory] = useState<any[]>([]);

  // Function to fetch latest payment history records from Supabase directly
  const fetchLatestPaymentHistory = useCallback(async () => {
    try {
      if (supabaseClient) {
        const { data, error } = await supabaseClient
          .from('payment_history')
          .select('*')
          .order('payment_date', { ascending: false });
        if (!error && data) {
          setDbPaymentHistory(data);
        }
      }
    } catch (err) {
      console.warn('[PendingPaymentsReport] Error fetching payment history:', err);
    }
  }, []);

  // Sync latest data on mount and provide manual refresh handler
  const handleManualSync = useCallback(async () => {
    if (!isSyncing) {
      setIsSyncing(true);
      try {
        if (typeof refreshData === 'function') {
          await refreshData();
        }
        await fetchLatestPaymentHistory();
      } catch (err) {
        console.warn('[PendingPaymentsReport] Sync error:', err);
      } finally {
        setTimeout(() => setIsSyncing(false), 400);
      }
    }
  }, [refreshData, isSyncing, fetchLatestPaymentHistory]);

  useEffect(() => {
    if (typeof refreshData === 'function') {
      refreshData();
    }
    fetchLatestPaymentHistory();
  }, [refreshData, fetchLatestPaymentHistory]);

  useEffect(() => {
    const handleSync = () => {
      if (typeof refreshData === 'function') {
        refreshData();
      }
      fetchLatestPaymentHistory();
    };

    window.addEventListener('focus', handleSync);
    const handleVisChange = () => {
      if (document.visibilityState === 'visible') {
        handleSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisChange);
    window.addEventListener('lead-updated', handleSync);
    window.addEventListener('payment-updated', handleSync);
    window.addEventListener('order-updated', handleSync);
    window.addEventListener('refresh-pending-payments', handleSync);

    return () => {
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('lead-updated', handleSync);
      window.removeEventListener('payment-updated', handleSync);
      window.removeEventListener('order-updated', handleSync);
      window.removeEventListener('refresh-pending-payments', handleSync);
    };
  }, [refreshData, fetchLatestPaymentHistory]);

  // Search and Filter states
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOrderId, setSearchOrderId] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('All');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('All');

  // 3-State Column Header Sorting: Days Overdue, Pending Amount, Paid Amount, Total Amount, Order ID, Overdue Since
  const [sortColumn, setSortColumn] = useState<'days_overdue' | 'pending_amount' | 'paid_amount' | 'total_amount' | 'order_id' | 'overdue_since' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleColumnSort = (column: 'days_overdue' | 'pending_amount' | 'paid_amount' | 'total_amount' | 'order_id' | 'overdue_since') => {
    if (sortColumn !== column) {
      // 1st click -> Ascending
      setSortColumn(column);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      // 2nd click -> Descending
      setSortDirection('desc');
    } else {
      // 3rd click -> Reset / Original order
      setSortColumn(null);
      setSortDirection('asc');
    }
  };

  // Date Filter Dropdown Options: 'This Month' | 'Last Month' | 'Last 3 Months' | 'Custom Date Range' | 'All Time'
  const [dateFilterOption, setDateFilterOption] = useState<'This Month' | 'Last Month' | 'Last 3 Months' | 'Custom Date Range' | 'All Time'>('This Month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Modal State for Payment Update
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalRecord, setPaymentModalRecord] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [viewDetailsRecord, setViewDetailsRecord] = useState<any>(null);
  const [updateSuccessMsg, setUpdateSuccessMsg] = useState('');

  useEffect(() => {
    const handleClose = () => {
      setShowPaymentModal(false);
      setShowDetailsModal(false);
    };
    window.addEventListener('close-all-popups', handleClose);
    return () => window.removeEventListener('close-all-popups', handleClose);
  }, []);

  useEffect(() => {
    if (showPaymentModal) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      ensureModalScrolledToTop('#update_payment_modal_content');
      const resetScroll = () => {
        const el = document.getElementById('update_payment_modal_content');
        if (el) el.scrollTop = 0;
      };
      resetScroll();
      const raf = requestAnimationFrame(resetScroll);
      const timer = setTimeout(() => {
        resetScroll();
        ensureModalScrolledToTop('#update_payment_modal_content');
      }, 50);

      return () => {
        document.body.style.overflow = originalOverflow;
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [showPaymentModal]);

  useEffect(() => {
    if (showDetailsModal) {
      ensureModalScrolledToTop('#payment_details_history_modal');
    }
  }, [showDetailsModal]);

  // Normalize date string to standard YYYY-MM-DD
  const normalizeToYYYYMMDD = (dStr?: string): string => {
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
  };

  // Helper to extract sequential number from Order ID (e.g. "OR063" -> 63, "OR057" -> 57, "OR030" -> 30)
  const extractOrderSeq = (orderId?: string): number => {
    if (!orderId) return 0;
    const match = String(orderId).match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };

  // Sort comparator: Newest Order ID / order creation sequence first (never sort by Event Date)
  const compareOrderRecords = (a: any, b: any): number => {
    const seqA = extractOrderSeq(a.orderId);
    const seqB = extractOrderSeq(b.orderId);

    // 1. If sequential numbers exist on both and differ:
    // Higher sequential Order ID is strictly newest (e.g. OR063 (63) > OR057 (57) > OR055 (55) > OR030 (30))
    if (seqA > 0 && seqB > 0 && seqA !== seqB) {
      return seqB - seqA;
    }

    // 2. Creation timestamp of the order (or lead)
    const timeA = a.order?.created_at ? (Date.parse(a.order.created_at) || 0) : (a.lead?.created_at ? (Date.parse(a.lead.created_at) || 0) : 0);
    const timeB = b.order?.created_at ? (Date.parse(b.order.created_at) || 0) : (b.lead?.created_at ? (Date.parse(b.lead.created_at) || 0) : 0);
    if (timeB !== timeA) {
      return timeB - timeA;
    }

    // 3. Fallback: string comparison descending
    return String(b.orderId || '').localeCompare(String(a.orderId || ''));
  };

  // Parse event date robustly and compute overdue days
  const getOverdueDays = (eventDateStr: string, remainingAmount: number) => {
    if (!eventDateStr || remainingAmount <= 0) return 0;
    const clean = normalizeToYYYYMMDD(eventDateStr);
    const parts = clean.split('-');
    if (parts.length !== 3) return 0;
    const ey = parseInt(parts[0], 10);
    const em = parseInt(parts[1], 10);
    const ed = parseInt(parts[2], 10);
    const eventDate = new Date(ey, em - 1, ed);
    eventDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (today <= eventDate) {
      return 0; // Not overdue
    }

    const diffTime = today.getTime() - eventDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Format date cleanly and timezone-safely e.g. "2026-08-20" -> "20 Aug 2026"
  const formatEventDate = (dateStr?: string) => {
    if (!dateStr || dateStr === 'N/A' || dateStr === '—' || dateStr === 'null' || dateStr === 'undefined') return 'N/A';
    return formatDateDDMMYY(dateStr) || dateStr;
  };
  
  // Start date default: 3 months ago to 1 year ahead
  const defaultStartDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
  }, []);

  const defaultEndDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 12);
    return d.toISOString().split('T')[0];
  }, []);

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [showFilters, setShowFilters] = useState(false);

  // Card click active selector
  const [activeCardFilter, setActiveCardFilter] = useState<'All' | 'TotalPending' | 'Overdue' | 'DueToday' | 'DueThisWeek' | 'Pending' | 'Partial' | 'Upcoming' | 'Average'>('All');

  // Format currency in INR style
  const formatPercentageOrINR = (amount: number, isPercentage = false) => {
    if (isPercentage) return `${amount.toFixed(1)}%`;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Combine all payment transactions from database, role context, and local storage caches
  const allPaymentHistory = useMemo(() => {
    let localPending: any[] = [];
    try {
      const saved = localStorage.getItem('pending_payment_approvals');
      if (saved) localPending = JSON.parse(saved) || [];
    } catch (_) {}

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
  }, [dbPaymentHistory, contextPaymentHistory]);

  // Compile real-time pending payment records using saved Order records as the PRIMARY record source
  const allPendingRecords = useMemo(() => {
    const TODAY_STR = new Date().toISOString().split('T')[0];

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

        // Fallback for orders whose advance was stored on order record and not in payment_history
        const hasAdvanceInHistory = orderHistories.some((h: any) => 
          h.payment_type === 'Advance Payment' || 
          (typeof h.notes === 'string' && h.notes.toLowerCase().includes('advance'))
        );
        if (!hasAdvanceInHistory && advanceReceived > approvedAmount) {
          approvedAmount = advanceReceived;
        }
      } else {
        // Fallback for older orders without payment_history rows
        if (payment?.payment_status === 'Waiting for Approval') {
          pendingApprovalAmount = (Number(payment.advance_received) || 0) + (Number(payment.final_payment_received) || 0) + (Number(payment.additional_received) || 0) || advanceReceived;
        } else {
          approvedAmount = payment 
            ? ((Number(payment.advance_received) || 0) + (Number(payment.final_payment_received) || 0) + (Number(payment.additional_received) || 0)) 
            : advanceReceived;
        }
      }

      // Total Paid Amount includes approved amount plus any pending approval amount (unapproved amount displayed in RED)
      const totalPaidAmount = approvedAmount + pendingApprovalAmount;

      // Pending Amount = Final Quotation Amount - Total Counted Payments (Approved + Pending Approval, excluding Rejected)
      const remainingAmount = Math.max(0, finalPackageAmount - totalPaidAmount);
      const rawPaymentStatus = payment ? payment.payment_status : (totalPaidAmount > 0 ? (totalPaidAmount >= finalPackageAmount ? 'Fully Paid' : 'Partially Paid') : 'Pending');

      // Standardize status labels
      let paymentStatus: 'Pending' | 'Partial' | 'Fully Paid' = 'Pending';
      if (remainingAmount <= 0 && finalPackageAmount > 0) {
        paymentStatus = 'Fully Paid';
      } else if (rawPaymentStatus === 'Partially Paid' || rawPaymentStatus === 'Partial' || (totalPaidAmount > 0 && remainingAmount > 0)) {
        paymentStatus = 'Partial';
      } else if (rawPaymentStatus === 'Fully Paid') {
        paymentStatus = 'Fully Paid';
      }

      // Determine payment completion date
      let paymentCompletionDate = '';
      if (paymentStatus === 'Fully Paid') {
        if (payment?.payment_date) {
          paymentCompletionDate = normalizeToYYYYMMDD(payment.payment_date);
        } else {
          const historyKey = `payment_history_${orderId}`;
          const existingHistoryStr = typeof window !== 'undefined' ? localStorage.getItem(historyKey) : null;
          if (existingHistoryStr) {
            try {
              const hist = JSON.parse(existingHistoryStr);
              if (Array.isArray(hist) && hist.length > 0) {
                const lastEntry = hist[hist.length - 1];
                if (lastEntry && lastEntry.date) {
                  paymentCompletionDate = normalizeToYYYYMMDD(String(lastEntry.date));
                }
              }
            } catch (e) {}
          }
        }
        if (!paymentCompletionDate) {
          paymentCompletionDate = normalizeToYYYYMMDD(order?.updated_at || order?.created_at || lead?.updated_at || lead?.created_date || TODAY_STR);
        }
      }

      // Read actual confirmed order event data
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

      // Sort events: newest event date first
      const sortedEvents = [...orderEvents].sort((a: any, b: any) => {
        const da = a.event_date || '';
        const db = b.event_date || '';
        if (da && db && da !== db) {
          return db.localeCompare(da);
        }
        if (da && !db) return -1;
        if (!da && db) return 1;
        const timeA = new Date(a?.created_at || a?.createdAt || 0).getTime();
        const timeB = new Date(b?.created_at || b?.createdAt || 0).getTime();
        if (timeA && timeB && timeA !== timeB) return timeB - timeA;
        return String(b.id || '').localeCompare(String(a.id || ''));
      });

      const primaryEvent = sortedEvents[0] || null;
      const primaryEventDate = primaryEvent?.event_date || normalizeToYYYYMMDD(order?.event_date || lead?.event_date || '');

      // Extract actual saved event types
      const rawEventTypes: string[] = [];
      if (orderEvents && orderEvents.length > 0) {
        orderEvents.forEach((e: any) => {
          if (e.event_type && typeof e.event_type === 'string' && e.event_type.trim()) {
            rawEventTypes.push(e.event_type.trim());
          }
        });
      }
      if (order?.event_type && typeof order.event_type === 'string' && order.event_type.trim()) {
        rawEventTypes.push(order.event_type.trim());
      }
      if (lead?.event_type && typeof lead.event_type === 'string' && lead.event_type.trim()) {
        rawEventTypes.push(lead.event_type.trim());
      }

      const recordEventTypes = Array.from(new Set(rawEventTypes));
      const eventType = recordEventTypes.join(', ') || primaryEvent?.event_type || order?.event_type || lead?.event_type || 'Other';

      const isOverdue = primaryEventDate && primaryEventDate < TODAY_STR && remainingAmount > 0;

      // Stage of the project
      const status = order?.current_stage || lead?.current_status || lead?.status || order?.order_status || 'Order Confirmed';
      const opsStatuses = ['Order Confirmed', 'Operations Assigned', 'Staff Assigned', 'Event Scheduled', 'Event Completed', 'New Order Received'];
      const prodStatuses = ['Raw Footage Received', 'Editor Assigned', 'Editing Started', 'Editing In Progress', 'Internal QC Review', 'Client Review Sent', 'Internal Review', 'Client Review', 'Revision Required', 'Revision In Progress', 'Revision', 'Final Approval', 'Ready for Delivery'];
      const completedStatuses = ['Delivered', 'Completed', 'Closed', 'Project Closed', 'Project Delivered'];

      let currentStage: 'Sales' | 'Operations' | 'Production' | 'Completed' = 'Operations';
      if (completedStatuses.includes(status)) currentStage = 'Completed';
      else if (prodStatuses.includes(status)) currentStage = 'Production';
      else if (opsStatuses.includes(status)) currentStage = 'Operations';

      const effectiveLead = lead || {
        lead_id: order?.lead_id || orderId,
        customer_name: order?.customer_name || 'Customer',
        mobile: order?.mobile || '',
        event_type: eventType,
        event_date: primaryEventDate,
        event_time: order?.event_time || '',
        event_location: order?.event_location || '',
        budget: finalPackageAmount,
        Final_Quotation_Amount: finalPackageAmount,
        status: status,
        current_status: status,
        events: sortedEvents
      };

      return {
        lead: effectiveLead,
        order,
        payment,
        orderId,
        customerName: order?.customer_name || lead?.customer_name || 'Customer',
        mobileNumber: order?.mobile || lead?.mobile || '',
        eventType,
        recordEventTypes,
        eventDate: primaryEventDate,
        effectiveEventDate: primaryEventDate,
        events: sortedEvents,
        paymentCompletionDate,
        finalPackageAmount,
        advanceReceived,
        approvedAmount,
        pendingApprovalAmount,
        totalPaidAmount,
        remainingAmount,
        paymentStatus,
        orderHistories,
        approvedHistories,
        pendingApprovalHistories,
        rejectedHistories,
        isOverdue,
        currentProjectStatus: status,
        currentStage,
        lastUpdatedDate: order?.updated_at || order?.created_at || lead?.updated_at || lead?.created_date,
      };
    };

    // 1. Process all actual saved Order records as the PRIMARY record source
    (orders || []).forEach(order => {
      if (!order || !order.order_id) return;
      if (order.order_status === 'Cancelled' || (order as any).status === 'Cancelled') return;

      const linkedLead = (leads || []).find(l => l.lead_id === order.lead_id);
      const rec = processRecord(order, linkedLead);
      if (rec) records.push(rec);
    });

    // 2. Also include any confirmed leads that don't have a row in orders (safety fallback)
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

    // Sort: Newest Order ID first using actual system's latest Order ID / order creation sequence
    return records.sort(compareOrderRecords);
  }, [orders, leads, payments, allPaymentHistory]);

  // Dynamically retrieve the real-time record to keep modal updated
  const currentRecord = useMemo(() => {
    if (!paymentModalRecord) return null;
    return allPendingRecords.find(r => r.orderId === paymentModalRecord.orderId) || paymentModalRecord;
  }, [allPendingRecords, paymentModalRecord]);

  // Compute metrics for the Pending Payment Analytics Cards
  const stats = useMemo(() => {
    const totalPendingOrders = allPendingRecords.filter(r => r.remainingAmount > 0).length;
    const fullyPaidOrders = allPendingRecords.filter(r => r.paymentStatus === 'Fully Paid').length;
    const totalPendingAmount = allPendingRecords.reduce((acc, r) => acc + (r.paymentStatus === 'Fully Paid' ? 0 : r.remainingAmount), 0);
    const partialPaymentOrders = allPendingRecords.filter(r => r.paymentStatus === 'Partial').length;
    const overduePendingPayments = allPendingRecords.filter(r => r.isOverdue).length;
    const overdueAmount = allPendingRecords.filter(r => r.isOverdue).reduce((acc, r) => acc + r.remainingAmount, 0);
    const upcomingPaymentDue = allPendingRecords.filter(r => !r.isOverdue && r.remainingAmount > 0).length;
    const averageOutstandingAmount = totalPendingOrders > 0 ? totalPendingAmount / totalPendingOrders : 0;
    
    // Calculate Due Today and Due This Week
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const endOfWeek = new Date();
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

    const dueTodayAmount = allPendingRecords
      .filter(r => r.eventDate === todayStr && r.remainingAmount > 0)
      .reduce((acc, r) => acc + r.remainingAmount, 0);

    const dueThisWeekAmount = allPendingRecords
      .filter(r => r.eventDate >= todayStr && r.eventDate <= endOfWeekStr && r.remainingAmount > 0)
      .reduce((acc, r) => acc + r.remainingAmount, 0);

    return {
      totalPendingOrders,
      fullyPaidOrders,
      totalPendingAmount,
      partialPaymentOrders,
      overduePendingPayments,
      overdueAmount,
      upcomingPaymentDue,
      averageOutstandingAmount,
      dueTodayAmount,
      dueThisWeekAmount
    };
  }, [allPendingRecords]);

  // Calculate active Event Date range based on selected option: 'This Month' | 'Last Month' | 'Last 3 Months' | 'Custom Date Range' | 'All Time'
  const activeEventDateRange = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    const formatYMD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    if (dateFilterOption === 'This Month') {
      return {
        start: formatYMD(new Date(year, month, 1)),
        end: formatYMD(new Date(year, month + 1, 0))
      };
    }

    if (dateFilterOption === 'Last Month') {
      return {
        start: formatYMD(new Date(year, month - 1, 1)),
        end: formatYMD(new Date(year, month, 0))
      };
    }

    if (dateFilterOption === 'Last 3 Months') {
      return {
        start: formatYMD(new Date(year, month - 2, 1)),
        end: formatYMD(new Date(year, month + 1, 0))
      };
    }

    if (dateFilterOption === 'Custom Date Range') {
      return {
        start: customStartDate ? normalizeToYYYYMMDD(customStartDate) : '',
        end: customEndDate ? normalizeToYYYYMMDD(customEndDate) : ''
      };
    }

    return { start: '', end: '' };
  }, [dateFilterOption, customStartDate, customEndDate]);

  // Apply filters and date ranges strictly using actual saved Event Date
  const filteredRecords = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const endOfWeek = new Date();
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

    const result = allPendingRecords.map(rec => {
      // 1. FILTER BY SAVED EVENT DATE (Case-tested across single and multi-event orders)
      const { start: dateStart, end: dateEnd } = activeEventDateRange;
      let matchingEvents: any[] = [];
      let isDateMatch = true;

      if (dateStart || dateEnd) {
        const isDateWithinRange = (dStr?: string) => {
          if (!dStr) return false;
          const clean = normalizeToYYYYMMDD(dStr);
          if (!clean) return false;
          if (dateStart && clean < dateStart) return false;
          if (dateEnd && clean > dateEnd) return false;
          return true;
        };

        // For multi-event orders, treat each event independently using exact event ID & exact saved event_date
        if (rec.events && Array.isArray(rec.events) && rec.events.length > 0) {
          matchingEvents = rec.events.filter((ev: any) => {
            const d = ev.event_date || ev.event_start_date;
            return isDateWithinRange(d);
          });
        } else if (isDateWithinRange(rec.eventDate)) {
          matchingEvents = [{
            id: rec.lead.lead_id,
            event_name: rec.eventType,
            event_type: rec.eventType,
            event_date: rec.eventDate
          }];
        }

        if (matchingEvents.length === 0) {
          isDateMatch = false;
        }
      } else {
        matchingEvents = rec.events || [];
      }

      if (!isDateMatch) return null;

      // Assign matching event date if specific events matched the date filter
      const primaryMatchingEvent = matchingEvents[0] || null;
      const effectiveEventDate = primaryMatchingEvent?.event_date || rec.eventDate;

      // 2. GLOBAL SEARCH (Strictly CASE-INSENSITIVE across Customer Name, Order ID, Mobile Number, related fields)
      const cleanGlobalSearch = (globalSearch || searchTerm).trim().toLowerCase();
      if (cleanGlobalSearch) {
        const cName = String(rec.customerName || '').toLowerCase();
        const oId = String(rec.orderId || '').toLowerCase();
        const mob = String(rec.mobileNumber || '').toLowerCase().replace(/[\s\-+]/g, '');
        const cleanQ = cleanGlobalSearch.replace(/[\s\-+]/g, '');
        const rawMob = String(rec.mobileNumber || '').toLowerCase();
        const groom = String(rec.lead?.groom_name || '').toLowerCase();
        const bride = String(rec.lead?.bride_name || '').toLowerCase();
        const contact = String(rec.lead?.contact_person || '').toLowerCase();
        const evNames = (rec.events || []).map((e: any) => String(e.event_name || '').toLowerCase()).join(' ');

        const matchesGlobal = cName.includes(cleanGlobalSearch) ||
          oId.includes(cleanGlobalSearch) ||
          mob.includes(cleanQ) ||
          rawMob.includes(cleanGlobalSearch) ||
          groom.includes(cleanGlobalSearch) ||
          bride.includes(cleanGlobalSearch) ||
          contact.includes(cleanGlobalSearch) ||
          evNames.includes(cleanGlobalSearch);

        if (!matchesGlobal) return null;
      }

      if (searchOrderId && !rec.orderId.toLowerCase().includes(searchOrderId.toLowerCase())) return null;

      // Event Type Filter (strictly matches actual saved event types)
      if (eventTypeFilter !== 'All') {
        const filterVal = eventTypeFilter.trim().toLowerCase();
        const hasMatchingEventType = (rec.recordEventTypes && rec.recordEventTypes.some((et: string) => et.trim().toLowerCase() === filterVal))
          || (rec.eventType && rec.eventType.trim().toLowerCase() === filterVal)
          || (rec.lead?.event_type && String(rec.lead.event_type).trim().toLowerCase() === filterVal)
          || (rec.order?.event_type && String(rec.order.event_type).trim().toLowerCase() === filterVal)
          || (rec.events && rec.events.some((e: any) => e.event_type && String(e.event_type).trim().toLowerCase() === filterVal));

        if (!hasMatchingEventType) return null;
      }

      // Payment Status Filter
      if (paymentStatusFilter !== 'All') {
        if (paymentStatusFilter === 'Pending' && rec.paymentStatus !== 'Pending') return null;
        if ((paymentStatusFilter === 'Partially Paid' || paymentStatusFilter === 'Partial') && rec.paymentStatus !== 'Partial') return null;
        if (paymentStatusFilter === 'Fully Paid' && rec.paymentStatus !== 'Fully Paid') return null;
      }

      // Card Click Filter (interactive filter feedback)
      if (activeCardFilter === 'TotalPending' && rec.remainingAmount <= 0) return null;
      if (activeCardFilter === 'Overdue' && (!rec.isOverdue || rec.remainingAmount <= 0)) return null;
      if (activeCardFilter === 'DueToday' && (rec.eventDate !== todayStr || rec.remainingAmount <= 0)) return null;
      if (activeCardFilter === 'DueThisWeek' && (!(rec.eventDate >= todayStr && rec.eventDate <= endOfWeekStr) || rec.remainingAmount <= 0)) return null;
      if (activeCardFilter === 'Pending' && rec.paymentStatus !== 'Pending') return null;
      if (activeCardFilter === 'Partial' && rec.paymentStatus !== 'Partial') return null;
      if (activeCardFilter === 'Upcoming' && (rec.isOverdue || rec.remainingAmount <= 0)) return null;

      return {
        ...rec,
        matchingEvents,
        effectiveEventDate
      };
    }).filter(Boolean) as any[];

    // 3-State Column Sorting for: Days Overdue, Pending Amount, Paid Amount, Total Amount, Order ID, Overdue Since
    if (!sortColumn) {
      return result.sort(compareOrderRecords);
    }

    return result.sort((a, b) => {
      // 1. Days Overdue (Numeric)
      if (sortColumn === 'days_overdue') {
        const effA = a.effectiveEventDate || a.eventDate;
        const daysA = a.paymentStatus === 'Fully Paid' ? 0 : getOverdueDays(effA, a.remainingAmount);
        const effB = b.effectiveEventDate || b.eventDate;
        const daysB = b.paymentStatus === 'Fully Paid' ? 0 : getOverdueDays(effB, b.remainingAmount);
        if (daysA !== daysB) {
          return sortDirection === 'asc' ? daysA - daysB : daysB - daysA;
        }
        return compareOrderRecords(a, b);
      }

      // 2. Pending Amount (Numeric)
      if (sortColumn === 'pending_amount') {
        const pendA = a.paymentStatus === 'Fully Paid' ? 0 : (Number(a.remainingAmount) || 0);
        const pendB = b.paymentStatus === 'Fully Paid' ? 0 : (Number(b.remainingAmount) || 0);
        if (pendA !== pendB) {
          return sortDirection === 'asc' ? pendA - pendB : pendB - pendA;
        }
        return compareOrderRecords(a, b);
      }

      // 3. Paid Amount (Numeric)
      if (sortColumn === 'paid_amount') {
        const paidA = Number(a.totalPaidAmount) || 0;
        const paidB = Number(b.totalPaidAmount) || 0;
        if (paidA !== paidB) {
          return sortDirection === 'asc' ? paidA - paidB : paidB - paidA;
        }
        return compareOrderRecords(a, b);
      }

      // 4. Total Amount (Numeric)
      if (sortColumn === 'total_amount') {
        const totA = Number(a.finalPackageAmount) || 0;
        const totB = Number(b.finalPackageAmount) || 0;
        if (totA !== totB) {
          return sortDirection === 'asc' ? totA - totB : totB - totA;
        }
        return compareOrderRecords(a, b);
      }

      // 5. Order ID (Alphanumeric sequence)
      if (sortColumn === 'order_id') {
        const idA = String(a.orderId || '').trim();
        const idB = String(b.orderId || '').trim();
        if (idA && idB) {
          const comp = compareAlphanumeric(idA, idB);
          if (comp !== 0) {
            return sortDirection === 'asc' ? comp : -comp;
          }
        } else if (idA) {
          return sortDirection === 'asc' ? -1 : 1;
        } else if (idB) {
          return sortDirection === 'asc' ? 1 : -1;
        }
        return compareOrderRecords(a, b);
      }

      // 6. Overdue Since (Actual saved date)
      if (sortColumn === 'overdue_since') {
        const dStrA = a.paymentStatus === 'Fully Paid' ? '' : (a.effectiveEventDate || a.eventDate || '');
        const dStrB = b.paymentStatus === 'Fully Paid' ? '' : (b.effectiveEventDate || b.eventDate || '');
        const tsA = dStrA ? (Date.parse(normalizeToYYYYMMDD(dStrA)) || 0) : 0;
        const tsB = dStrB ? (Date.parse(normalizeToYYYYMMDD(dStrB)) || 0) : 0;
        if (tsA > 0 && tsB > 0 && tsA !== tsB) {
          return sortDirection === 'asc' ? tsA - tsB : tsB - tsA;
        }
        if (tsA > 0) return -1;
        if (tsB > 0) return 1;
        return compareOrderRecords(a, b);
      }

      return compareOrderRecords(a, b);
    });
  }, [allPendingRecords, activeEventDateRange, globalSearch, searchTerm, searchOrderId, eventTypeFilter, paymentStatusFilter, activeCardFilter, sortColumn, sortDirection]);

  // Unique event types for dropdown - strictly sourced from Sales Step 2 EVENT_TYPES
  const uniqueEventTypes = useMemo(() => {
    return Array.from(new Set(EVENT_TYPES));
  }, []);

  // Handle analytical card clicks
  const handleCardClick = (cardType: 'All' | 'TotalPending' | 'Overdue' | 'DueToday' | 'DueThisWeek' | 'Pending' | 'Partial' | 'Upcoming' | 'Average') => {
    if (activeCardFilter === cardType) {
      setActiveCardFilter('All'); // Toggle off
    } else {
      setActiveCardFilter(cardType);
    }
  };

  // Export functions (PDF, CSV, Excel, Print)
  const downloadCSV = () => {
    const headers = ['Order ID', 'Customer Name', 'Mobile Number', 'Event Type', 'Event Date', 'Completion Date', 'Final Package Amount', 'Total Paid Amount', 'Remaining Amount', 'Payment Status', 'Project Status', 'Last Updated'];
    const rows = filteredRecords.map(r => {
      const formattedEvDate = r.events && r.events.length > 1
        ? r.events.map((e: any) => `${e.event_name || e.event_type || 'Event'}: ${formatEventDate(e.event_date || e.event_start_date)}`).join(' | ')
        : formatEventDate(r.eventDate);
      return [
        r.orderId,
        r.customerName,
        r.mobileNumber,
        r.eventType,
        formattedEvDate,
        r.paymentStatus === 'Fully Paid' ? (r.paymentCompletionDate ? formatEventDate(r.paymentCompletionDate) : 'Completed') : 'N/A',
        r.finalPackageAmount,
        r.totalPaidAmount,
        r.paymentStatus === 'Fully Paid' ? 0 : r.remainingAmount,
        r.paymentStatus === 'Fully Paid' ? 'Fully Paid' : (r.paymentStatus === 'Partial' ? 'Partially Paid' : 'Pending'),
        r.currentProjectStatus,
        formatDateDDMMYY(r.lastUpdatedDate)
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Pending_Payments_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExcelMock = () => {
    // Generate simple tab-separated content mimicking XLS format
    let excelContent = "Order ID\tCustomer Name\tMobile Number\tEvent Type\tEvent Date\tCompletion Date\tFinal Package Amount\tTotal Paid Amount\tRemaining Amount\tPayment Status\tProject Status\tLast Updated\n";
    filteredRecords.forEach(r => {
      const statusStr = r.paymentStatus === 'Fully Paid' ? 'Fully Paid' : (r.paymentStatus === 'Partial' ? 'Partially Paid' : 'Pending');
      const compDateStr = r.paymentStatus === 'Fully Paid' ? (r.paymentCompletionDate ? formatEventDate(r.paymentCompletionDate) : 'Completed') : 'N/A';
      const formattedEvDate = r.events && r.events.length > 1
        ? r.events.map((e: any) => `${e.event_name || e.event_type || 'Event'}: ${formatEventDate(e.event_date || e.event_start_date)}`).join(' | ')
        : formatEventDate(r.eventDate);
      excelContent += `${r.orderId}\t${r.customerName}\t${r.mobileNumber}\t${r.eventType}\t${formattedEvDate}\t${compDateStr}\t${r.finalPackageAmount}\t${r.totalPaidAmount}\t${r.paymentStatus === 'Fully Paid' ? 0 : r.remainingAmount}\t${statusStr}\t${r.currentProjectStatus}\t${formatDateDDMMYY(r.lastUpdatedDate)}\n`;
    });

    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Pending_Payments_Report_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPDFReport = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Dark carbon header block
    doc.setFillColor(18, 18, 22);
    doc.rect(0, 0, 297, 35, 'F');

    // Bottom gold line
    doc.setFillColor(212, 175, 55);
    doc.rect(0, 34, 297, 1, 'F');

    // Header Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(212, 175, 55);
    doc.text('PHOTOCREW PICTURES', 15, 14);

    doc.setFontSize(11);
    doc.setTextColor(230, 230, 230);
    doc.text('PENDING & FULLY PAID PAYMENTS REPORT', 15, 21);

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated By: ${currentUserName} | Date: ${formatDateDDMMYY(new Date())}`, 15, 28);

    doc.setTextColor(212, 175, 55);
    doc.text(`Active Filters: Dates [${startDate || 'All'} to ${endDate || 'All'}] | Status [${paymentStatusFilter}]`, 180, 28);

    // List Headers
    let currentY = 48;
    doc.setFillColor(243, 244, 246);
    doc.rect(10, currentY, 277, 8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    doc.text('Order ID', 12, currentY + 5.5);
    doc.text('Customer Name', 38, currentY + 5.5);
    doc.text('Mobile', 88, currentY + 5.5);
    doc.text('Event Type', 115, currentY + 5.5);
    doc.text('Event Date', 150, currentY + 5.5);
    doc.text('Package Cost', 180, currentY + 5.5);
    doc.text('Total Paid', 210, currentY + 5.5);
    doc.text('Balance Due', 240, currentY + 5.5);
    doc.text('Status', 270, currentY + 5.5);

    currentY += 8;

    doc.setLineWidth(0.1);
    doc.setDrawColor(200, 200, 200);

    doc.setFont('helvetica', 'normal');
    
    // Draw records
    filteredRecords.forEach((rec, idx) => {
      if (currentY > 185) {
        doc.addPage();
        currentY = 20;
        doc.setFillColor(18, 18, 22);
        doc.rect(0, 0, 297, 8, 'F');
        currentY += 8;
      }

      if (idx % 2 === 1) {
        doc.setFillColor(249, 250, 251);
        doc.rect(10, currentY, 277, 7, 'F');
      }

      doc.setTextColor(15, 23, 42);
      doc.text(rec.orderId, 12, currentY + 5);
      
      const customerShort = rec.customerName.length > 24 ? rec.customerName.slice(0, 22) + '..' : rec.customerName;
      doc.text(customerShort, 38, currentY + 5);
      doc.text(rec.mobileNumber, 88, currentY + 5);
      doc.text(rec.eventType, 115, currentY + 5);
      doc.text(formatEventDate(rec.eventDate), 150, currentY + 5);
      
      doc.text(`INR ${rec.finalPackageAmount.toLocaleString('en-IN')}`, 180, currentY + 5);
      doc.text(`INR ${rec.totalPaidAmount.toLocaleString('en-IN')}`, 210, currentY + 5);
      
      doc.setFont('helvetica', 'bold');
      if (rec.paymentStatus === 'Fully Paid') {
        doc.setTextColor(16, 185, 129); // emerald for fully paid
        doc.text('INR 0', 240, currentY + 5);
      } else {
        doc.setTextColor(185, 28, 28); // red for outstanding
        doc.text(`INR ${rec.remainingAmount.toLocaleString('en-IN')}`, 240, currentY + 5);
      }
      
      doc.setFont('helvetica', 'normal');
      if (rec.paymentStatus === 'Fully Paid') {
        doc.setTextColor(16, 185, 129); // emerald
        doc.text('Fully Paid', 270, currentY + 5);
      } else if (rec.paymentStatus === 'Partial') {
        doc.setTextColor(180, 83, 9); // amber
        doc.text('Partially Paid', 270, currentY + 5);
      } else {
        doc.setTextColor(185, 28, 28); // red
        doc.text('Pending', 270, currentY + 5);
      }

      doc.line(10, currentY + 7, 287, currentY + 7);
      currentY += 7;
    });

    // Drawing Summary Box
    currentY += 5;
    if (currentY > 180) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(243, 244, 246);
    doc.rect(180, currentY, 107, 24, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(180, currentY, 107, 24, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('REPORT SUMMARY', 185, currentY + 6);

    doc.setFont('helvetica', 'normal');
    doc.text(`Total Records Selected: ${filteredRecords.length}`, 185, currentY + 13);
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(185, 28, 28);
    const sumVal = filteredRecords.reduce((ax, rx) => ax + (rx.paymentStatus === 'Fully Paid' ? 0 : rx.remainingAmount), 0);
    doc.text(`Total Outstanding Balance: INR ${sumVal.toLocaleString('en-IN')}`, 185, currentY + 20);

    doc.save(`Pending_Payments_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <CreditCard className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold tracking-tight text-white font-sans">
              Pending Payment Report
            </h1>
          </div>
          <p className="text-xs text-zinc-400">
            Dedicated secure database workflow for tracking customer outstanding accounts, partial payment backlogs, and real-time invoice collections.
          </p>
        </div>

        {/* Real-time sync tracker badge + manual refresh */}
        <div className="flex items-center gap-2 self-start">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 font-mono">
              leads database synchronized
            </span>
          </div>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[10px] uppercase font-bold tracking-wider text-zinc-300 hover:text-white transition cursor-pointer disabled:opacity-50"
            title="Fetch latest database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {updateSuccessMsg && (
        <div className="bg-emerald-950/40 border border-emerald-500/50 text-emerald-400 p-3 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{updateSuccessMsg}</span>
          </div>
          <button onClick={() => setUpdateSuccessMsg('')} className="text-emerald-500 hover:text-emerald-300 transition-colors">
            ✕
          </button>
        </div>
      )}

      {/* Pending Payment Analytics Cards (Photocrew Lens-Inspired layout) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        
        {/* Card 1: Total Pending Orders */}
        <div 
          onClick={() => handleCardClick('TotalPending')}
          className={`relative p-4 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden ${
            activeCardFilter === 'TotalPending'
              ? 'bg-gradient-to-br from-zinc-850 to-zinc-900 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
              : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-750'
          }`}
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Total Pending Amount</span>
            <DollarSign className={`w-4 h-4 ${activeCardFilter === 'TotalPending' ? 'text-amber-500' : 'text-zinc-500'}`} />
          </div>
          <p className="text-2xl font-extrabold text-white tracking-tight leading-none mb-1">
            {formatPercentageOrINR(stats.totalPendingAmount)}
          </p>
          <p className="text-[8px] text-zinc-500 font-mono">
            {stats.totalPendingOrders} PENDING INVOICES
          </p>
          {activeCardFilter === 'TotalPending' && (
            <div className="absolute bottom-0 right-0 w-2 h-2 bg-amber-500 rounded-tl-md" />
          )}
        </div>

        {/* Card 2: Overdue Amount */}
        <div 
          onClick={() => handleCardClick('Overdue')}
          className={`relative p-4 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden ${
            activeCardFilter === 'Overdue'
              ? 'bg-gradient-to-br from-zinc-850 to-zinc-900 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
              : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-750'
          }`}
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-bold text-zinc-400 uppercase font-mono">POST EVENT COLLECTION</span>
            <AlertTriangle className={`w-4 h-4 ${activeCardFilter === 'Overdue' ? 'text-rose-500' : 'text-rose-500'}`} />
          </div>
          <p className="text-xl font-extrabold text-rose-500 tracking-tight leading-none mb-1">
            {formatPercentageOrINR(stats.overdueAmount)}
          </p>
          <p className="text-[8px] text-zinc-500 font-mono">
            {stats.overduePendingPayments} OVERDUE INVOICES
          </p>
          {activeCardFilter === 'Overdue' && (
            <div className="absolute bottom-0 right-0 w-2 h-2 bg-amber-500 rounded-tl-md" />
          )}
        </div>

        {/* Card 3: Payments Due Today */}
        <div 
          onClick={() => handleCardClick('DueToday')}
          className={`relative p-4 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden ${
            activeCardFilter === 'DueToday'
              ? 'bg-gradient-to-br from-zinc-850 to-zinc-900 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
              : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-750'
          }`}
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Due Today</span>
            <Clock className={`w-4 h-4 ${activeCardFilter === 'DueToday' ? 'text-amber-500' : 'text-zinc-500'}`} />
          </div>
          <p className="text-2xl font-extrabold text-amber-500 tracking-tight leading-none mb-1">
            {formatPercentageOrINR(stats.dueTodayAmount)}
          </p>
          <p className="text-[8px] text-zinc-500 font-mono">
            SAME DAY COLLECTION TARGET
          </p>
          {activeCardFilter === 'DueToday' && (
            <div className="absolute bottom-0 right-0 w-2 h-2 bg-amber-500 rounded-tl-md" />
          )}
        </div>

        {/* Card 4: Payments Due This Week */}
        <div 
          onClick={() => handleCardClick('DueThisWeek')}
          className={`relative p-4 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden ${
            activeCardFilter === 'DueThisWeek'
              ? 'bg-gradient-to-br from-zinc-850 to-zinc-900 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
              : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-750'
          }`}
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-bold text-zinc-400 uppercase font-mono">Due This Week</span>
            <Calendar className={`w-4 h-4 ${activeCardFilter === 'DueThisWeek' ? 'text-blue-400' : 'text-zinc-500'}`} />
          </div>
          <p className="text-2xl font-extrabold text-blue-400 tracking-tight leading-none mb-1">
            {formatPercentageOrINR(stats.dueThisWeekAmount)}
          </p>
          <p className="text-[8px] text-zinc-500 font-mono">
            WEEKLY COLLECTION
          </p>
          {activeCardFilter === 'DueThisWeek' && (
            <div className="absolute bottom-0 right-0 w-2 h-2 bg-amber-500 rounded-tl-md" />
          )}
        </div>

      </div>

      {/* GLOBAL SEARCH BOX & DATE FILTER (EVENT DATE) */}
      <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          
          {/* 1. Global Search Box */}
          <div className="relative flex-1 min-w-[260px]">
            <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 mb-1.5">
              Global Search
            </label>
            <div className="relative">
              <input
                id="input_global_search"
                data-testid="input_global_search"
                type="text"
                placeholder="Search by Customer Name / Order ID / Mobile..."
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  setSearchTerm(e.target.value); // keep legacy search synced
                }}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors font-medium"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500 pointer-events-none" />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setGlobalSearch('');
                    setSearchTerm('');
                  }}
                  className="absolute right-2.5 top-2.5 p-0.5 text-zinc-400 hover:text-white rounded transition cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 2. Date Filter Dropdown (Strictly filters by actual saved Event Date) */}
          <div className="w-full md:w-56">
            <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 mb-1.5">
              Date Filter (By Event Date)
            </label>
            <div className="relative">
              <select
                id="select_date_filter"
                data-testid="select_date_filter"
                value={dateFilterOption}
                onChange={(e) => setDateFilterOption(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="This Month">This Month</option>
                <option value="Last Month">Last Month</option>
                <option value="Last 3 Months">Last 3 Months</option>
                <option value="Custom Date Range">Custom Date Range</option>
                <option value="All Time">All Time</option>
              </select>
            </div>
          </div>

          {/* Action toggle button for extra downloads / filters */}
          <div className="self-end md:self-auto flex items-center gap-2 pt-2 md:pt-5">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 bg-zinc-950 hover:bg-zinc-800 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                showFilters ? 'border-amber-500/40 text-amber-400 bg-amber-500/5' : 'border-zinc-800 text-zinc-400'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Export / More</span>
            </button>
          </div>

        </div>

        {/* 3. Custom Date Range Inputs - Active when 'Custom Date Range' is selected */}
        {dateFilterOption === 'Custom Date Range' && (
          <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-1">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-amber-400 mb-1">
                Start Date (Event Date)
              </label>
              <DateFilterInput
                id="input_start_date"
                data-testid="input_start_date"
                value={customStartDate}
                onChange={(val) => {
                  setCustomStartDate(val);
                  setStartDate(val);
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-amber-400 mb-1">
                End Date (Event Date)
              </label>
              <DateFilterInput
                id="input_end_date"
                data-testid="input_end_date"
                value={customEndDate}
                onChange={(val) => {
                  setCustomEndDate(val);
                  setEndDate(val);
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                  setStartDate('');
                  setEndDate('');
                }}
                className="self-end pb-2 text-[11px] text-zinc-400 hover:text-white underline cursor-pointer"
              >
                Reset range
              </button>
            )}
          </div>
        )}

        {/* Filter Summary Status */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-white">{filteredRecords.length}</strong> of{' '}
              <strong className="text-zinc-300">{allPendingRecords.length}</strong> records
            </span>
            {activeEventDateRange.start && activeEventDateRange.end && (
              <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-amber-400 border border-zinc-700">
                {dateFilterOption === 'Custom Date Range' ? 'Custom Range' : dateFilterOption}: {formatDateDDMMYY(activeEventDateRange.start)} – {formatDateDDMMYY(activeEventDateRange.end)}
              </span>
            )}
          </div>
          {(globalSearch || dateFilterOption !== 'This Month') && (
            <button
              type="button"
              onClick={() => {
                setGlobalSearch('');
                setSearchTerm('');
                setDateFilterOption('This Month');
                setCustomStartDate('');
                setCustomEndDate('');
              }}
              className="text-amber-400 hover:text-amber-300 underline cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      <div className="hidden flex justify-end mb-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
            showFilters ? 'border-amber-500/40 text-amber-400 bg-amber-500/5' : 'border-zinc-800 text-zinc-400'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Filter / Download</span>
        </button>
      </div>

      {showFilters && (
        <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-2xl space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-2 text-white font-mono text-[10px] uppercase font-black tracking-wider border-b border-zinc-800 md:border-none pb-2 md:pb-0">
            <Filter className="w-4 h-4 text-amber-500" />
            <span>REPORT WORKSPACE CONFIGURATION</span>
          </div>

          {/* Action Downloads Header */}
          <div className="flex flex-wrap items-center gap-2">
            <button 
              id="btn_download_pdf"
              onClick={downloadPDFReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 hover:border-zinc-600 rounded-xl transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-rose-450" />
              <span>Download PDF</span>
            </button>
            <button 
              id="btn_download_excel"
              onClick={downloadExcelMock}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 hover:border-zinc-600 rounded-xl transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-450" />
              <span>Download Excel</span>
            </button>
            <button 
              id="btn_download_csv"
              onClick={downloadCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 hover:border-zinc-600 rounded-xl transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-450" />
              <span>Download CSV</span>
            </button>
            <button 
              id="btn_print_report"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 hover:border-zinc-600 rounded-xl transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-zinc-400" />
              <span>Print Report</span>
            </button>
          </div>

        </div>

        {/* Input Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 pt-2">
          
          <div>
            <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 mb-1.5">Start Date</label>
            <div className="relative">
              <DateFilterInput 
                value={startDate}
                onChange={setStartDate}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 mb-1.5">End Date</label>
            <div className="relative">
              <DateFilterInput 
                value={endDate}
                onChange={setEndDate}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 mb-1.5">Search Customer</label>
            <div className="relative">
              <input 
                type="text"
                placeholder="Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-600" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 mb-1.5">Search Order ID</label>
            <div className="relative">
              <input 
                type="text"
                placeholder="OR..."
                value={searchOrderId}
                onChange={(e) => setSearchOrderId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 font-mono"
              />
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-600" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 mb-1.5">Event Type</label>
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
            >
              <option value="All">All Event Types</option>
              {uniqueEventTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 mb-1.5">Payment Status</label>
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Fully Paid">Fully Paid</option>
            </select>
          </div>

        </div>

        {/* Clear active filter tag bar */}
        {activeCardFilter !== 'All' && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 px-3.5 py-2 rounded-xl text-xs text-amber-350 justify-between">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Filtering records by active card: <strong>{activeCardFilter === 'TotalPending' ? 'Total Pending Amount' : activeCardFilter === 'Overdue' ? 'Overdue Amount' : activeCardFilter === 'DueToday' ? 'Due Today' : activeCardFilter === 'DueThisWeek' ? 'Due This Week' : activeCardFilter}</strong></span>
            </span>
            <button 
              onClick={() => setActiveCardFilter('All')}
              className="bg-amber-500 hover:bg-amber-600 text-zinc-950 px-2 py-0.5 rounded text-[10px] uppercase font-black font-mono cursor-pointer transition"
            >
              Clear Filter Click
            </button>
          </div>
        )}

      </div>
      )}

      {/* Main Datatable */}
      <div className="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-850 flex items-center justify-between">
          <span className="text-xs uppercase font-mono font-extrabold tracking-widest text-zinc-400">
            PAYMENT ACCOUNT CORES
          </span>
          <span className="bg-zinc-900 border border-zinc-800 text-[10px] font-mono uppercase font-black tracking-wider text-zinc-400 px-2.5 py-1 rounded-lg">
            Active Records displayed: {filteredRecords.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-max">
            <thead>
              <tr className="border-b border-zinc-850 bg-zinc-900/30 select-none">
                {/* 1. Order ID */}
                <th className="px-4 py-3.5 text-left">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('order_id')}
                    className="inline-flex items-center gap-1.5 uppercase font-mono tracking-wider text-[10px] font-black text-zinc-400 hover:text-white transition-colors cursor-pointer select-none group"
                    title={
                      sortColumn === 'order_id'
                        ? sortDirection === 'asc'
                          ? 'Order ID: Ascending (Click for Descending)'
                          : 'Order ID: Descending (Click for Reset / Default)'
                        : 'Order ID: Click for Ascending'
                    }
                  >
                    <span>Order ID</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'order_id' ? (sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400') : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                    {sortColumn === 'order_id' && (
                      <span className={`text-[10px] font-bold font-mono ${sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400'}`}>
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </button>
                </th>

                {/* 2. Client Name */}
                <th className="px-4 py-3.5 text-[10px] uppercase font-black tracking-wider text-zinc-400 font-mono text-left">Client Name</th>

                {/* 3. Event Details */}
                <th className="px-4 py-3.5 text-[10px] uppercase font-black tracking-wider text-zinc-400 font-mono text-left">Event Details</th>

                {/* 4. Event Date */}
                <th className="px-4 py-3.5 text-[10px] uppercase font-black tracking-wider text-zinc-400 font-mono text-center">Event Date</th>

                {/* 5. Total Amount */}
                <th className="px-4 py-3.5 text-right">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('total_amount')}
                    className="inline-flex items-center justify-end gap-1.5 uppercase font-mono tracking-wider text-[10px] font-black text-zinc-400 hover:text-white transition-colors cursor-pointer select-none group w-full"
                    title={
                      sortColumn === 'total_amount'
                        ? sortDirection === 'asc'
                          ? 'Total Amount: Lowest to Highest (Click for Highest to Lowest)'
                          : 'Total Amount: Highest to Lowest (Click for Reset / Default)'
                        : 'Total Amount: Click for Lowest to Highest'
                    }
                  >
                    <span>Total Amount</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'total_amount' ? (sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400') : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                    {sortColumn === 'total_amount' && (
                      <span className={`text-[10px] font-bold font-mono ${sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400'}`}>
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </button>
                </th>

                {/* 6. Paid Amount */}
                <th className="px-4 py-3.5 text-right">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('paid_amount')}
                    className="inline-flex items-center justify-end gap-1.5 uppercase font-mono tracking-wider text-[10px] font-black text-zinc-400 hover:text-white transition-colors cursor-pointer select-none group w-full"
                    title={
                      sortColumn === 'paid_amount'
                        ? sortDirection === 'asc'
                          ? 'Paid Amount: Lowest to Highest (Click for Highest to Lowest)'
                          : 'Paid Amount: Highest to Lowest (Click for Reset / Default)'
                        : 'Paid Amount: Click for Lowest to Highest'
                    }
                  >
                    <span>Paid Amount</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'paid_amount' ? (sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400') : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                    {sortColumn === 'paid_amount' && (
                      <span className={`text-[10px] font-bold font-mono ${sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400'}`}>
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </button>
                </th>

                {/* 7. Pending Amount */}
                <th className="px-4 py-3.5 text-right">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('pending_amount')}
                    className="inline-flex items-center justify-end gap-1.5 uppercase font-mono tracking-wider text-[10px] font-black text-rose-450 hover:text-white transition-colors cursor-pointer select-none group w-full"
                    title={
                      sortColumn === 'pending_amount'
                        ? sortDirection === 'asc'
                          ? 'Pending Amount: Lowest to Highest (Click for Highest to Lowest)'
                          : 'Pending Amount: Highest to Lowest (Click for Reset / Default)'
                        : 'Pending Amount: Click for Lowest to Highest'
                    }
                  >
                    <span>Pending Amount</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'pending_amount' ? (sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400') : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                    {sortColumn === 'pending_amount' && (
                      <span className={`text-[10px] font-bold font-mono ${sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400'}`}>
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </button>
                </th>

                {/* 8. Overdue Since */}
                <th className="px-4 py-3.5 text-center">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('overdue_since')}
                    className="inline-flex items-center justify-center gap-1.5 uppercase font-mono tracking-wider text-[10px] font-black text-zinc-400 hover:text-white transition-colors cursor-pointer select-none group w-full"
                    title={
                      sortColumn === 'overdue_since'
                        ? sortDirection === 'asc'
                          ? 'Overdue Since: Oldest to Newest (Click for Newest to Oldest)'
                          : 'Overdue Since: Newest to Oldest (Click for Reset / Default)'
                        : 'Overdue Since: Click for Oldest to Newest'
                    }
                  >
                    <span>Overdue Since</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'overdue_since' ? (sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400') : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                    {sortColumn === 'overdue_since' && (
                      <span className={`text-[10px] font-bold font-mono ${sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400'}`}>
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </button>
                </th>

                {/* 9. Days Overdue */}
                <th className="px-4 py-3.5 text-center">
                  <button
                    type="button"
                    onClick={() => handleColumnSort('days_overdue')}
                    className="inline-flex items-center justify-center gap-1.5 uppercase font-mono tracking-wider text-[10px] font-black text-zinc-400 hover:text-white transition-colors cursor-pointer select-none group w-full"
                    title={
                      sortColumn === 'days_overdue'
                        ? sortDirection === 'asc'
                          ? 'Days Overdue: Lowest to Highest (Click for Highest to Lowest)'
                          : 'Days Overdue: Highest to Lowest (Click for Reset / Default)'
                        : 'Days Overdue: Click for Lowest to Highest'
                    }
                  >
                    <span>Days Overdue</span>
                    <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'days_overdue' ? (sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400') : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                    {sortColumn === 'days_overdue' && (
                      <span className={`text-[10px] font-bold font-mono ${sortDirection === 'asc' ? 'text-sky-400' : 'text-amber-400'}`}>
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </button>
                </th>

                {/* 10. Payment Status */}
                <th className="px-4 py-3.5 text-[10px] uppercase font-black tracking-wider text-zinc-400 font-mono text-center">Payment Status</th>

                {/* 11. Project Status */}
                <th className="px-4 py-3.5 text-[10px] uppercase font-black tracking-wider text-zinc-400 font-mono text-center">Project Status</th>

                {/* 12. Action */}
                <th className="px-4 py-3.5 text-[10px] uppercase font-black tracking-wider text-zinc-400 font-mono text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-zinc-500 font-medium">
                    <AlertTriangle className="w-8 h-8 text-zinc-750 mx-auto mb-2" />
                    <span>No payments fit the selected parameters.</span>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec, i) => {
                  const effectiveEventDate = rec.effectiveEventDate || rec.eventDate;
                  const daysOverdue = getOverdueDays(effectiveEventDate, rec.remainingAmount);
                  const formattedEventDate = formatEventDate(effectiveEventDate);

                  return (
                  <tr 
                    key={rec.lead.lead_id}
                    className="border-b border-zinc-850 hover:bg-zinc-900/10 transition-colors"
                  >
                    {/* 1. Order ID */}
                    <td className="px-4 py-4 text-xs font-mono font-medium text-zinc-300">
                      {rec.orderId}
                    </td>

                    {/* 2. Client Name */}
                    <td className="px-4 py-4 text-xs font-bold text-white">
                      {rec.customerName}
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{rec.mobileNumber}</div>
                    </td>

                    {/* 3. Event Details */}
                    <td className="px-4 py-4 text-xs">
                      {rec.events && rec.events.length > 1 ? (
                        <div className="space-y-1">
                          {rec.events.map((ev: any, idx: number) => (
                            <div key={ev.id || idx} className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></span>
                              <span className="truncate max-w-[160px]">{ev.event_name || ev.event_type || `Event ${idx + 1}`}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="font-semibold text-zinc-300">{rec.eventType}</span>
                      )}
                    </td>

                    {/* 4. Event Date */}
                    <td className="px-4 py-4 text-xs text-center font-mono text-zinc-300">
                      {rec.events && rec.events.length > 1 ? (
                        <div className="flex flex-col items-center gap-1">
                          {rec.events.map((ev: any, idx: number) => {
                            const d = ev.event_date || ev.event_start_date;
                            const formatted = formatEventDate(d);
                            const cleanEvDate = normalizeToYYYYMMDD(d);
                            const isMatch = (activeEventDateRange.start || activeEventDateRange.end)
                              ? (
                                  (!activeEventDateRange.start || cleanEvDate >= activeEventDateRange.start) &&
                                  (!activeEventDateRange.end || cleanEvDate <= activeEventDateRange.end)
                                )
                              : true;

                            return (
                              <span
                                key={ev.id || `ev-dt-${idx}`}
                                className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-mono border ${
                                  isMatch 
                                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-semibold' 
                                    : 'bg-zinc-900/90 border-zinc-800 text-zinc-400'
                                }`}
                                title={formatted}
                              >
                                <span>{formatted}</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="font-mono text-zinc-300">{formattedEventDate}</span>
                      )}
                    </td>

                    {/* 5. Total Amount */}
                    <td className="px-4 py-4 text-xs font-semibold text-zinc-300 text-right font-mono">
                      {formatPercentageOrINR(rec.finalPackageAmount)}
                    </td>

                    {/* 6. Paid Amount */}
                    <td className="px-4 py-4 text-xs text-right font-mono">
                      {rec.pendingApprovalAmount > 0 ? (
                        <div className="flex flex-col items-end">
                          <div className="font-mono font-bold text-xs">
                            {rec.approvedAmount === 0 ? (
                              <span className="text-rose-500 font-black">
                                {formatPercentageOrINR(rec.totalPaidAmount)}
                              </span>
                            ) : (
                              <span className="text-zinc-100">
                                {formatPercentageOrINR(rec.totalPaidAmount)}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-rose-500 font-bold whitespace-nowrap mt-0.5">
                            ({formatPercentageOrINR(rec.pendingApprovalAmount)} Pending Approval)
                          </div>
                        </div>
                      ) : (
                        <span className={rec.totalPaidAmount > 0 ? "text-emerald-400 font-semibold" : "text-zinc-400"}>
                          {formatPercentageOrINR(rec.totalPaidAmount)}
                        </span>
                      )}
                    </td>

                    {/* 7. Pending Amount */}
                    <td className="px-4 py-4 text-xs font-black text-right font-mono bg-zinc-900/20">
                      {rec.paymentStatus === 'Fully Paid' ? (
                        <span className="text-emerald-400 font-mono font-bold">₹0</span>
                      ) : (
                        <span className="text-rose-400 font-mono font-bold">{formatPercentageOrINR(rec.remainingAmount)}</span>
                      )}
                    </td>

                    {/* 8. Overdue Since */}
                    <td className="px-4 py-4 text-xs text-center font-mono text-zinc-300">
                      {rec.paymentStatus === 'Fully Paid' ? '-' : (effectiveEventDate ? formattedEventDate : 'N/A')}
                    </td>

                    {/* 9. Days Overdue */}
                    <td className="px-4 py-4 text-xs text-center font-mono font-bold">
                      {rec.paymentStatus === 'Fully Paid' ? (
                        <span className="text-zinc-500">-</span>
                      ) : daysOverdue > 0 ? (
                        <span className="text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded">{daysOverdue} Days</span>
                      ) : (
                        <span className="text-emerald-500">-</span>
                      )}
                    </td>

                    {/* 10. Payment Status */}
                    <td className="px-4 py-4 text-xs text-center">
                      {rec.paymentStatus === 'Fully Paid' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          🟢 Fully Paid
                        </span>
                      ) : rec.paymentStatus === 'Partial' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          🟡 Partially Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          🟠 Pending
                        </span>
                      )}
                    </td>

                    {/* 11. Project Status */}
                    <td className="px-4 py-4 text-xs text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-900 text-zinc-300 border border-zinc-800">
                        {rec.currentProjectStatus}
                      </span>
                    </td>
                    
                    {/* 12. Action */}
                    <td className="px-4 py-4 text-xs text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => {
                            setPaymentModalRecord(rec);
                            setShowPaymentModal(true);
                          }}
                          className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 rounded transition font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                        >
                          Update
                        </button>
                        <button 
                          onClick={() => {
                            setViewDetailsRecord(rec);
                            setShowDetailsModal(true);
                          }}
                          className="px-2.5 py-1.5 bg-blue-500/10 hover:bg-blue-500/25 border border-blue-500/20 text-blue-400 rounded transition font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                        >
                          Details
                        </button>
                      </div>
                    </td>

                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <UpdatePaymentModal
        isOpen={showPaymentModal && !!paymentModalRecord}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentModalRecord(null);
        }}
        record={paymentModalRecord}
        onSuccess={handleManualSync}
      />

      <PaymentHistoryModal 
        isOpen={showDetailsModal && !!viewDetailsRecord} 
        onClose={() => { setShowDetailsModal(false); setViewDetailsRecord(null); }}
        order={viewDetailsRecord}
        payments={payments}
        orders={orders}
        leads={leads}
      />

    </div>
  );
};
